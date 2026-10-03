// Server-only wrapper around the Telegram Bot API. The bot token is read
// from process.env here and never returned to a caller — every function in
// this file returns only what the UI needs (names, booleans, ids), never the
// token itself. Nothing in this file is safe to import from a "use client"
// component; it's only ever called from Route Handlers / server code.

const API_BASE = "https://api.telegram.org";

export class TelegramConfigError extends Error {}

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new TelegramConfigError("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

export function getConfiguredChannel(): string | null {
  return process.env.TELEGRAM_CHANNEL?.trim() || null;
}

interface TelegramApiResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function callTelegram<T>(method: string, params?: Record<string, unknown>): Promise<TelegramApiResult<T>> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
    cache: "no-store",
  });
  return (await res.json()) as TelegramApiResult<T>;
}

export interface TelegramBotInfo {
  id: number;
  username: string;
  first_name: string;
}

export async function getBotInfo(): Promise<TelegramBotInfo> {
  const res = await callTelegram<TelegramBotInfo>("getMe");
  if (!res.ok || !res.result) throw new Error(res.description ?? "getMe failed");
  return res.result;
}

export interface ChannelPermissionResult {
  status: string; // "administrator" | "member" | "left" | "kicked" | ...
  canPostMessages: boolean;
}

/** Checks whether the bot is an admin on the given channel with permission to
 * post. `channel` is a public @username or a numeric chat id. */
export async function getBotChannelPermissions(channel: string): Promise<ChannelPermissionResult> {
  const bot = await getBotInfo();
  const res = await callTelegram<{ status: string; can_post_messages?: boolean }>("getChatMember", {
    chat_id: channel,
    user_id: bot.id,
  });
  if (!res.ok || !res.result) throw new Error(res.description ?? "getChatMember failed");
  const { status, can_post_messages } = res.result;
  // Channel creators implicitly have every permission; the field is only
  // present (and meaningful) for the "administrator" status.
  const canPostMessages = status === "creator" || (status === "administrator" && can_post_messages === true);
  return { status, canPostMessages };
}

export interface SendQuizPollParams {
  chatId: string;
  question: string;
  options: string[];
  correctOptionIds: number[];
  isAnonymous?: boolean;
  /** Shown natively by Telegram when the viewer taps the 💡 lamp icon after
   * answering — capped at 200 chars by the Bot API, so it's truncated here
   * rather than rejected. Ignored when `explanationMedia` is set and no plain
   * text is also wanted alongside the image. */
  explanation?: string;
  /** An image for the 💡 lamp popup (Bot API 10.0's `explanation_media`).
   * Confirmed live: Telegram Desktop renders it, but Telegram's mobile apps
   * currently show the plain-text `explanation` only and silently drop the
   * image — this field is from a very recent API release the mobile clients
   * haven't fully caught up to yet. Worth sending anyway since it's free and
   * Desktop viewers benefit, but it is NOT a reliable way to deliver the
   * answer image to most of a channel's audience — see sendPhoto's
   * `replyToMessageId` for the delivery path that works on every client. */
  explanationMedia?: Buffer;
}

export interface TelegramPollMessage {
  message_id: number;
  poll: { id: string };
}

export async function sendQuizPoll(params: SendQuizPollParams): Promise<TelegramPollMessage> {
  // Derived from the data, not a caller flag: a poll with two or more correct
  // options is only graded correctly if multi-select is on (Bot API 10.0 lets
  // this apply to quiz polls, not just regular ones).
  const allowsMultipleAnswers = params.correctOptionIds.length > 1;

  if (!params.explanationMedia) {
    const res = await callTelegram<TelegramPollMessage>("sendPoll", {
      chat_id: params.chatId,
      question: params.question,
      options: params.options.map((text) => ({ text })),
      type: "quiz",
      correct_option_ids: params.correctOptionIds,
      is_anonymous: params.isAnonymous ?? true,
      allows_multiple_answers: allowsMultipleAnswers,
      explanation: params.explanation ? params.explanation.slice(0, 200) : undefined,
    });
    if (!res.ok || !res.result) throw new Error(res.description ?? "sendPoll failed");
    return res.result;
  }

  const token = getToken();
  const form = new FormData();
  form.set("chat_id", params.chatId);
  form.set("question", params.question);
  form.set("options", JSON.stringify(params.options.map((text) => ({ text }))));
  form.set("type", "quiz");
  form.set("correct_option_ids", JSON.stringify(params.correctOptionIds));
  form.set("is_anonymous", String(params.isAnonymous ?? true));
  form.set("allows_multiple_answers", String(allowsMultipleAnswers));
  if (params.explanation) form.set("explanation", params.explanation.slice(0, 200));
  form.set("explanation_media", JSON.stringify({ type: "photo", media: "attach://explanation_photo" }));
  form.set("explanation_photo", new Blob([new Uint8Array(params.explanationMedia)], { type: "image/png" }), "explanation.png");

  const res = await fetch(`${API_BASE}/bot${token}/sendPoll`, { method: "POST", body: form });
  const body = (await res.json()) as TelegramApiResult<TelegramPollMessage>;
  if (!body.ok || !body.result) throw new Error(body.description ?? "sendPoll failed");
  return body.result;
}

export async function sendMessage(chatId: string, text: string, parseMode?: "HTML"): Promise<{ message_id: number }> {
  const res = await callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    ...(parseMode ? { parse_mode: parseMode } : {}),
  });
  if (!res.ok || !res.result) throw new Error(res.description ?? "sendMessage failed");
  return res.result;
}

/** Uploads an image directly (multipart), unlike every other call in this file
 * — sendPhoto takes a file, not JSON, so it can't go through callTelegram.
 *
 * `replyToMessageId` threads this photo visually under another message (a
 * quiz poll, typically) — Telegram shows a small quoted preview of that
 * message above the photo, so the two read as one unit in the channel even
 * though they're separate messages. This is the proven, every-client way to
 * attach an answer image to its poll; explanation_media (sendQuizPoll) is
 * not, since Telegram's mobile apps don't render it yet. */
export async function sendPhoto(chatId: string, photo: Buffer, caption?: string, replyToMessageId?: number): Promise<{ message_id: number }> {
  const token = getToken();
  const form = new FormData();
  form.set("chat_id", chatId);
  if (caption) form.set("caption", caption);
  if (replyToMessageId) form.set("reply_parameters", JSON.stringify({ message_id: replyToMessageId }));
  form.set("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), "slide.png");

  const res = await fetch(`${API_BASE}/bot${token}/sendPhoto`, { method: "POST", body: form });
  const body = (await res.json()) as TelegramApiResult<{ message_id: number }>;
  if (!body.ok || !body.result) throw new Error(body.description ?? "sendPhoto failed");
  return body.result;
}

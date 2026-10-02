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
  /** True to let the viewer select several options. Required whenever more
   * than one option is correct, otherwise Telegram grades the poll as
   * single-answer and every correct choice but one is marked wrong. */
  isMultiple?: boolean;
  /** Shown natively by Telegram when the viewer taps the 💡 lamp icon after
   * answering — capped at 200 chars by the Bot API, so it's truncated here
   * rather than rejected. */
  explanation?: string;
}

export interface TelegramPollMessage {
  message_id: number;
  poll: { id: string };
}

export async function sendQuizPoll(params: SendQuizPollParams): Promise<TelegramPollMessage> {
  const res = await callTelegram<TelegramPollMessage>("sendPoll", {
    chat_id: params.chatId,
    question: params.question,
    options: params.options.map((text) => ({ text })),
    type: "quiz",
    correct_option_ids: params.correctOptionIds,
    is_anonymous: params.isAnonymous ?? true,
    // Derived from the data, not the caller's intent: a poll with two or more
    // correct options can only be answered correctly if multi-select is on.
    is_multiple: params.correctOptionIds.length > 1 ? true : (params.isMultiple ?? undefined),
    explanation: params.explanation ? params.explanation.slice(0, 200) : undefined,
  });
  if (!res.ok || !res.result) throw new Error(res.description ?? "sendPoll failed");
  return res.result;
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

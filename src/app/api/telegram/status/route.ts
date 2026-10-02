import { getBotChannelPermissions, getBotInfo, getConfiguredChannel, TelegramConfigError } from "@/lib/telegram/client";

export const runtime = "nodejs";

export interface TelegramStatusResponse {
  configured: boolean;
  connected: boolean;
  botUsername?: string;
  botName?: string;
  channel?: string;
  canPost?: boolean;
  channelStatus?: string;
  error?: string;
}

export async function GET() {
  const channel = getConfiguredChannel();

  if (!process.env.TELEGRAM_BOT_TOKEN || !channel) {
    const body: TelegramStatusResponse = {
      configured: false,
      connected: false,
      error: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL in .env.local, then restart the dev server.",
    };
    return Response.json(body);
  }

  try {
    const bot = await getBotInfo();
    const perms = await getBotChannelPermissions(channel);
    const body: TelegramStatusResponse = {
      configured: true,
      connected: perms.canPostMessages,
      botUsername: bot.username,
      botName: bot.first_name,
      channel,
      canPost: perms.canPostMessages,
      channelStatus: perms.status,
      error: perms.canPostMessages
        ? undefined
        : `Bot is "${perms.status}" on ${channel}, not an admin with post permission. Add it as an admin with "Post Messages" enabled.`,
    };
    return Response.json(body);
  } catch (err) {
    const message = err instanceof TelegramConfigError ? err.message : err instanceof Error ? err.message : "Unknown error";
    const body: TelegramStatusResponse = { configured: true, connected: false, channel, error: message };
    return Response.json(body);
  }
}

import type { TelegramScheduledPostRow } from "@/lib/supabase/schema-types";

export interface ScheduledPostWithQuestion extends TelegramScheduledPostRow {
  nclex_questions: { question: string; category: string | null; type: string } | null;
}

import type { NormalizedBowtie } from "@/lib/content/types";
import type { SlideStatus } from "@/lib/supabase/schema-types";

/** The bank view of a question: the stored row plus the expiring signed URLs for
 * its slides. The URLs are minted per request and are never persisted — reload
 * the page to get fresh ones once they expire. */
export interface BankQuestion {
  id: string;
  external_id: string | null;
  type: string;
  category: string | null;
  instructions: string | null;
  question: string;
  options: { label: string; text: string }[];
  correct_answers: string[];
  correct_answer_text: string | null;
  explanation: string | null;
  option_rationales: Record<string, string>;
  key_point: string | null;
  notes: string | null;
  format: string;
  bowtie: NormalizedBowtie | null;
  template_id: string | null;
  slide_status: SlideStatus;
  slide_paths: string[] | null;
  slide_error: string | null;
  slide_rendered_at: string | null;
  created_at: string;
  updated_at: string;
  /** One entry per stored slide; null where a file has gone missing. */
  slideUrls: (string | null)[];
}

/** "all" plus the three derived formats the bank groups by. */
export type BankFilter = "all" | "single" | "multiple" | "bowtie";

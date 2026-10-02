-- Make the question bank search cover the whole question, not just its prompt.
--
-- Searching for "cardio" should find a bowtie whose *option* says "Cardiogenic
-- shock" even though the scenario text never uses the word. Filtering straight
-- against the `options` / `bowtie` jsonb columns isn't possible with an ilike,
-- so this adds one generated text column holding every searchable word.
--
-- Generated rather than trigger-maintained: it cannot drift out of sync with the
-- columns it is built from, so there is no maintenance path to forget.

-- Concatenates the `text` of every option in a jsonb array. A plain SQL
-- function (not set-returning) is permitted inside a generated column as long
-- as it is immutable, which is all this does.
create or replace function jsonb_option_text(j jsonb) returns text
language sql immutable as $$
  select coalesce(string_agg(e ->> 'text', ' '), '')
  from jsonb_array_elements(coalesce(j, '[]'::jsonb)) e;
$$;

alter table nclex_questions
  add column if not exists search_text text
  generated always as (
    coalesce(question, '') || ' ' ||
    coalesce(type, '') || ' ' ||
    coalesce(category, '') || ' ' ||
    coalesce(key_point, '') || ' ' ||
    jsonb_option_text(options) || ' ' ||
    jsonb_option_text(bowtie -> 'actionsToTake' -> 'options') || ' ' ||
    jsonb_option_text(bowtie -> 'conditionMostLikely' -> 'options') || ' ' ||
    jsonb_option_text(bowtie -> 'parametersToMonitor' -> 'options')
  ) stored;

create index if not exists idx_nclex_questions_search
  on nclex_questions (search_text text_pattern_ops);

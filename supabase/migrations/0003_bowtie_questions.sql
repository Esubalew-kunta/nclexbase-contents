-- Bowtie questions (NGN format: Actions to Take / Condition Most Likely /
-- Parameters to Monitor, each its own graded option group) don't fit the
-- flat options/correct_answers columns, so they get a jsonb column of their
-- own. Null for every other question type.
alter table nclex_questions add column if not exists bowtie jsonb;

BEGIN;

ALTER TABLE public.community_form_answers
  DROP CONSTRAINT IF EXISTS community_form_answers_text_value_length;

ALTER TABLE public.community_form_answers
  ADD CONSTRAINT community_form_answers_text_value_length
  CHECK (text_value IS NULL OR char_length(text_value) <= 10000);

COMMIT;

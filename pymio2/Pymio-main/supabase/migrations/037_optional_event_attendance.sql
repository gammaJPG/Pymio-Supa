BEGIN;

ALTER TABLE public.network_posts
  ADD COLUMN IF NOT EXISTS request_attendance boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';

COMMIT;

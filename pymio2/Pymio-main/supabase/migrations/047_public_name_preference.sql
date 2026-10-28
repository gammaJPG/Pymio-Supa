BEGIN;

ALTER TABLE public.user_accounts
  ADD COLUMN IF NOT EXISTS public_name_mode text NOT NULL DEFAULT 'business';

ALTER TABLE public.user_accounts
  DROP CONSTRAINT IF EXISTS user_accounts_public_name_mode_check;

ALTER TABLE public.user_accounts
  ADD CONSTRAINT user_accounts_public_name_mode_check
  CHECK(public_name_mode IN ('business','personal','business_personal'));

COMMIT;

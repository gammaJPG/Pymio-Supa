BEGIN;

ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone text NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.business_profiles'::regclass
      AND conname='business_profiles_whatsapp_phone_format'
  ) THEN
    ALTER TABLE public.business_profiles
      ADD CONSTRAINT business_profiles_whatsapp_phone_format
      CHECK (whatsapp_phone='' OR whatsapp_phone ~ '^\+[1-9][0-9]{7,14}$');
  END IF;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;


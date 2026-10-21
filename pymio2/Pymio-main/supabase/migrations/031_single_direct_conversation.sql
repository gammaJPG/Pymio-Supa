BEGIN;

-- Cada pareja de empresas conserva una sola conversación, aunque los mensajes
-- históricos hayan sido creados como cotización, oferta o novedad.
WITH canonical_threads AS (
  SELECT
    least(sender_company_id,recipient_company_id) company_a,
    greatest(sender_company_id,recipient_company_id) company_b,
    (array_agg(thread_id ORDER BY created_at DESC,id DESC))[1] thread_id
  FROM public.business_private_activity
  GROUP BY 1,2
)
UPDATE public.business_private_activity activity
SET thread_id=canonical.thread_id
FROM canonical_threads canonical
WHERE least(activity.sender_company_id,activity.recipient_company_id)=canonical.company_a
  AND greatest(activity.sender_company_id,activity.recipient_company_id)=canonical.company_b
  AND activity.thread_id IS DISTINCT FROM canonical.thread_id;

CREATE OR REPLACE FUNCTION public.keep_direct_messages_in_active_thread()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE active_thread uuid;
BEGIN
  SELECT activity.thread_id INTO active_thread
  FROM public.business_private_activity activity
  WHERE least(activity.sender_company_id,activity.recipient_company_id)=least(NEW.sender_company_id,NEW.recipient_company_id)
    AND greatest(activity.sender_company_id,activity.recipient_company_id)=greatest(NEW.sender_company_id,NEW.recipient_company_id)
  ORDER BY activity.created_at DESC,activity.id DESC
  LIMIT 1;

  IF active_thread IS NOT NULL THEN NEW.thread_id=active_thread; END IF;
  NEW.subject='';
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.keep_direct_messages_in_active_thread() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.keep_direct_messages_in_active_thread() TO service_role;

COMMIT;

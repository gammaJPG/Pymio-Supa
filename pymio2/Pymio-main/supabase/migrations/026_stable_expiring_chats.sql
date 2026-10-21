BEGIN;

-- Un mensaje directo nuevo reutiliza el chat vigente entre las mismas empresas.
-- Así, responder o volver a escribir no crea otra conversación al receptor.
CREATE OR REPLACE FUNCTION public.keep_direct_messages_in_active_thread()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE active_thread uuid;
BEGIN
  IF NEW.kind <> 'message' THEN RETURN NEW; END IF;
  SELECT activity.thread_id INTO active_thread
  FROM public.business_private_activity activity
  WHERE activity.kind='message'
    AND least(activity.sender_company_id,activity.recipient_company_id)=least(NEW.sender_company_id,NEW.recipient_company_id)
    AND greatest(activity.sender_company_id,activity.recipient_company_id)=greatest(NEW.sender_company_id,NEW.recipient_company_id)
  GROUP BY activity.thread_id
  HAVING max(activity.created_at) >= now() - interval '7 days'
  ORDER BY max(activity.created_at) DESC
  LIMIT 1;
  IF active_thread IS NOT NULL THEN NEW.thread_id=active_thread; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS keep_direct_messages_in_active_thread_before_insert ON public.business_private_activity;
CREATE TRIGGER keep_direct_messages_in_active_thread_before_insert
BEFORE INSERT ON public.business_private_activity
FOR EACH ROW EXECUTE FUNCTION public.keep_direct_messages_in_active_thread();

-- Elimina el hilo completo cuando lleva siete días sin actividad. La regla se
-- aplica a ambos participantes, sin excepciones por plan.
CREATE OR REPLACE FUNCTION public.prune_expired_basic_messages()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  DELETE FROM public.business_private_activity activity
  WHERE activity.thread_id IN (
    SELECT expired.thread_id
    FROM public.business_private_activity expired
    GROUP BY expired.thread_id
    HAVING max(expired.created_at) < now() - interval '7 days'
  );
  RETURN NEW;
END $$;

DELETE FROM public.business_private_activity activity
WHERE activity.thread_id IN (
  SELECT expired.thread_id
  FROM public.business_private_activity expired
  GROUP BY expired.thread_id
  HAVING max(expired.created_at) < now() - interval '7 days'
);

REVOKE ALL ON FUNCTION public.keep_direct_messages_in_active_thread() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.keep_direct_messages_in_active_thread() TO service_role;
REVOKE ALL ON FUNCTION public.prune_expired_basic_messages() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prune_expired_basic_messages() TO service_role;

COMMIT;

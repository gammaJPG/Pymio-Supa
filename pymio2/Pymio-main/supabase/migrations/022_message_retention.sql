BEGIN;

-- Las cuentas básicas ven solo siete días de historial. Los mensajes donde
-- participa al menos una cuenta Pymium se conservan para que esa cuenta
-- mantenga su historial permanente.
CREATE OR REPLACE FUNCTION public.prune_expired_basic_messages()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
BEGIN
  DELETE FROM public.business_private_activity activity
  WHERE activity.created_at < now() - interval '7 days'
    AND NOT EXISTS(
      SELECT 1 FROM public.user_accounts sender
      WHERE sender.company_id=activity.sender_company_id AND sender.is_pymium
    )
    AND NOT EXISTS(
      SELECT 1 FROM public.user_accounts recipient
      WHERE recipient.company_id=activity.recipient_company_id AND recipient.is_pymium
    );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS prune_expired_basic_messages_after_insert ON public.business_private_activity;
CREATE TRIGGER prune_expired_basic_messages_after_insert
AFTER INSERT ON public.business_private_activity
FOR EACH STATEMENT EXECUTE FUNCTION public.prune_expired_basic_messages();

-- Aplica la política a datos antiguos al instalar la migración.
DELETE FROM public.business_private_activity activity
WHERE activity.created_at < now() - interval '7 days'
  AND NOT EXISTS(
    SELECT 1 FROM public.user_accounts sender
    WHERE sender.company_id=activity.sender_company_id AND sender.is_pymium
  )
  AND NOT EXISTS(
    SELECT 1 FROM public.user_accounts recipient
    WHERE recipient.company_id=activity.recipient_company_id AND recipient.is_pymium
  );

REVOKE ALL ON FUNCTION public.prune_expired_basic_messages() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prune_expired_basic_messages() TO service_role;
COMMIT;

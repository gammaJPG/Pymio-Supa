ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_response_confirmation_check,
  ADD COLUMN IF NOT EXISTS chat_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS chat_closed_at timestamptz;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_response_confirmation_check
  CHECK (response_confirmation IS NULL OR response_confirmation IN ('pending','accepted','rejected','expired'));

ALTER TABLE public.support_notifications DROP CONSTRAINT IF EXISTS support_notifications_kind_check;
ALTER TABLE public.support_notifications ADD CONSTRAINT support_notifications_kind_check
  CHECK (kind IN ('new_ticket','status_pending','status_in_review','status_resolved','reply_received','reply_rejected','ticket_expired','support_chat_started'));

CREATE TABLE IF NOT EXISTS public.support_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_chat_messages_timeline_idx ON public.support_chat_messages(ticket_id,created_at,id);
ALTER TABLE public.support_chat_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_chat_messages FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.support_chat_messages TO service_role;

CREATE OR REPLACE FUNCTION public.close_resolved_support_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.status='resuelto' AND OLD.status IS DISTINCT FROM 'resuelto' AND NEW.chat_opened_at IS NOT NULL THEN
    NEW.chat_closed_at=coalesce(NEW.chat_closed_at,now());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS close_resolved_support_chat_before_update ON public.support_tickets;
CREATE TRIGGER close_resolved_support_chat_before_update BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.close_resolved_support_chat();

CREATE OR REPLACE FUNCTION public.pymio_support_chat(operation text, actor_user uuid, actor_company bigint, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  account_company bigint;
  is_admin boolean;
  requested_id uuid;
  selected public.support_tickets%ROWTYPE;
  message_body text;
BEGIN
  SELECT company_id INTO account_company FROM public.user_accounts WHERE user_id=actor_user;
  IF account_company IS NULL OR account_company<>actor_company THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='La sesión no está asociada a esta empresa.'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.pymio_global_admins WHERE user_id=actor_user) INTO is_admin;

  IF operation='list' THEN
    RETURN jsonb_build_object('chats',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'ticket_id',t.id,'ticket_number',t.ticket_number,'subject',t.subject,'status',t.status,
        'opened_at',t.chat_opened_at,'closed_at',t.chat_closed_at,'open',t.chat_closed_at IS NULL,
        'counterpart_name',CASE WHEN is_admin THEN ua.business_name ELSE 'Equipo técnico Pymio' END,
        'can_close',is_admin AND t.chat_closed_at IS NULL,
        'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id',m.id,'thread_id','support:'||t.id,'body',m.body,'created_at',m.created_at,
          'direction',CASE WHEN m.sender_user_id=actor_user THEN 'sent' ELSE 'received' END,
          'sender_name',CASE WHEN m.sender_user_id=actor_user THEN 'Tú' WHEN EXISTS(SELECT 1 FROM public.pymio_global_admins ga WHERE ga.user_id=m.sender_user_id) THEN 'Equipo técnico Pymio' ELSE ua.business_name END,
          'recipient_name',CASE WHEN m.sender_user_id=actor_user THEN CASE WHEN is_admin THEN ua.business_name ELSE 'Equipo técnico Pymio' END ELSE 'Tú' END
        ) ORDER BY m.created_at,m.id) FROM public.support_chat_messages m WHERE m.ticket_id=t.id),'[]'::jsonb)
      ) ORDER BY coalesce((SELECT max(m.created_at) FROM public.support_chat_messages m WHERE m.ticket_id=t.id),t.chat_opened_at) DESC)
      FROM public.support_tickets t JOIN public.user_accounts ua ON ua.user_id=t.user_id
      WHERE t.chat_opened_at IS NOT NULL AND (t.user_id=actor_user OR is_admin)
    ),'[]'::jsonb));
  END IF;

  requested_id:=(payload->>'ticket_id')::uuid;
  SELECT * INTO selected FROM public.support_tickets WHERE id=requested_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='La solicitud no existe.'; END IF;

  IF operation='reject' THEN
    IF selected.user_id<>actor_user OR selected.status<>'en_revision' OR selected.response_confirmation<>'pending' OR selected.confirmation_deadline<=now() THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='La respuesta ya no está pendiente de confirmación.'; END IF;
    UPDATE public.support_tickets SET response_confirmation='rejected',confirmation_deadline=NULL,closed_reason=NULL,updated_at=now() WHERE id=requested_id RETURNING * INTO selected;
    INSERT INTO public.support_notifications(recipient_user_id,ticket_id,kind,title,description)
      SELECT user_id,selected.id,'reply_rejected','Respuesta rechazada en la solicitud #'||selected.ticket_number,'El usuario necesita seguimiento. Puedes iniciar un chat desde la solicitud.' FROM public.pymio_global_admins;
    RETURN jsonb_build_object('ticket',to_jsonb(selected));
  ELSIF operation='open' THEN
    IF NOT is_admin THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo un administrador puede iniciar este chat.'; END IF;
    IF selected.status='resuelto' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='No se puede iniciar un chat para una solicitud resuelta.'; END IF;
    message_body:=btrim(payload->>'body');
    UPDATE public.support_tickets SET chat_opened_at=coalesce(chat_opened_at,now()),chat_closed_at=NULL,updated_at=now() WHERE id=requested_id RETURNING * INTO selected;
    IF NOT EXISTS(SELECT 1 FROM public.support_chat_messages WHERE ticket_id=requested_id) THEN INSERT INTO public.support_chat_messages(ticket_id,sender_user_id,body) VALUES(requested_id,actor_user,message_body); END IF;
    INSERT INTO public.support_notifications(recipient_user_id,ticket_id,kind,title,description) VALUES(selected.user_id,selected.id,'support_chat_started','Conversación iniciada para la solicitud #'||selected.ticket_number,'El equipo técnico se comunicó contigo en Comunicaciones.');
    RETURN jsonb_build_object('ticket',to_jsonb(selected));
  ELSIF operation='close' THEN
    IF NOT is_admin THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Solo un administrador puede cerrar este chat.'; END IF;
    UPDATE public.support_tickets SET chat_closed_at=coalesce(chat_closed_at,now()),updated_at=now() WHERE id=requested_id AND chat_opened_at IS NOT NULL RETURNING * INTO selected;
    RETURN jsonb_build_object('ticket',to_jsonb(selected));
  ELSIF operation='send' THEN
    IF selected.chat_opened_at IS NULL OR selected.chat_closed_at IS NOT NULL OR (selected.user_id<>actor_user AND NOT is_admin) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Este chat no está disponible.'; END IF;
    message_body:=btrim(payload->>'body');
    INSERT INTO public.support_chat_messages(ticket_id,sender_user_id,body) VALUES(requested_id,actor_user,message_body);
    UPDATE public.support_tickets SET updated_at=now() WHERE id=requested_id;
    RETURN public.pymio_support_chat('list',actor_user,actor_company,'{}'::jsonb);
  END IF;
  RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='La operación de chat no es válida.';
END $$;

REVOKE ALL ON FUNCTION public.close_resolved_support_chat() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.close_resolved_support_chat() TO service_role;
REVOKE ALL ON FUNCTION public.pymio_support_chat(text,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pymio_support_chat(text,uuid,bigint,jsonb) TO service_role;

-- Accepted formal decisions and audit evidence cannot be rewritten.
CREATE FUNCTION protect_accepted_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Accepted decision and audit history is immutable' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_decision BEFORE UPDATE OR DELETE ON approval_decisions FOR EACH ROW EXECUTE FUNCTION protect_accepted_history();
--> statement-breakpoint
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION protect_accepted_history();
--> statement-breakpoint
CREATE TRIGGER immutable_decision_idempotency BEFORE UPDATE OR DELETE ON decision_idempotency_records FOR EACH ROW EXECUTE FUNCTION protect_accepted_history();
--> statement-breakpoint
CREATE FUNCTION protect_outbox_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'processed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'processed_at') THEN
        RAISE EXCEPTION 'Outbox intent is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_outbox_intent BEFORE UPDATE OR DELETE ON outbox_events FOR EACH ROW EXECUTE FUNCTION protect_outbox_intent();

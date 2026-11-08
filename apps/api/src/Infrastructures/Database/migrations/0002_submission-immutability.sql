-- Published definitions and accepted evidence are append-only. Mutable activation flags
-- stay outside definition JSON and submitted snapshots.
CREATE FUNCTION protect_published_form() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Published form versions are immutable' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_form BEFORE UPDATE OR DELETE ON request_type_versions FOR EACH ROW EXECUTE FUNCTION protect_published_form();
--> statement-breakpoint
CREATE FUNCTION protect_submitted_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.submitted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Submitted revisions are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON request_revisions FOR EACH ROW EXECUTE FUNCTION protect_submitted_revision();
--> statement-breakpoint
CREATE FUNCTION protect_submitted_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM request_revisions WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.revision_id ELSE OLD.revision_id END AND submitted_at IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM request_revisions WHERE id = NEW.revision_id AND submitted_at IS NOT NULL)) THEN
        RAISE EXCEPTION 'Submitted items are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_item BEFORE INSERT OR UPDATE OR DELETE ON request_items FOR EACH ROW EXECUTE FUNCTION protect_submitted_item();
--> statement-breakpoint
CREATE FUNCTION protect_request_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.requester_id <> OLD.requester_id OR NEW.type_id <> OLD.type_id
       OR (OLD.request_number IS NOT NULL AND (NEW.request_number IS DISTINCT FROM OLD.request_number OR NEW.department_id IS DISTINCT FROM OLD.department_id OR NEW.department_snapshot IS DISTINCT FROM OLD.department_snapshot)) THEN
        RAISE EXCEPTION 'Request identity and first submission references are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_request_identity BEFORE UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION protect_request_identity();
--> statement-breakpoint
CREATE FUNCTION protect_policy_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'is_active') IS DISTINCT FROM (to_jsonb(OLD) - 'is_active') THEN
        RAISE EXCEPTION 'Published policy content is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_policy BEFORE UPDATE OR DELETE ON approval_policy_versions FOR EACH ROW EXECUTE FUNCTION protect_policy_version();
--> statement-breakpoint
CREATE FUNCTION protect_cycle_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.request_id <> OLD.request_id OR NEW.revision_id <> OLD.revision_id OR NEW.policy_version_id <> OLD.policy_version_id OR NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
        RAISE EXCEPTION 'Cycle submission snapshot is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_cycle_snapshot BEFORE UPDATE ON approval_cycles FOR EACH ROW EXECUTE FUNCTION protect_cycle_snapshot();

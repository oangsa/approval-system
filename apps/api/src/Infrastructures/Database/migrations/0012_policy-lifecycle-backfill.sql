-- Adopt existing immutable versions without replacing IDs referenced by cycles.
INSERT INTO approval_policies (id, code, published_version_id, is_enabled)
SELECT DISTINCT ON (code) id, code, id, is_active
FROM approval_policy_versions ORDER BY code, version_number DESC;
--> statement-breakpoint
CREATE TRIGGER immutable_configuration_audit BEFORE UPDATE OR DELETE ON configuration_audit_events
FOR EACH ROW EXECUTE FUNCTION protect_published_form();
--> statement-breakpoint
CREATE TRIGGER immutable_policy_replay BEFORE UPDATE OR DELETE ON policy_idempotency_records
FOR EACH ROW EXECUTE FUNCTION protect_published_form();

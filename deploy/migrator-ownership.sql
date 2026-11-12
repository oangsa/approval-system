-- Human-reviewed one-time setup for existing Sprint 1 objects, run as postgres.
-- Do not create/reset roles, passwords, data, schemas or migration history.
-- Keep runtime grants; never use REASSIGN OWNED on Supabase-managed objects.
BEGIN;

-- Direction matters: postgres can manage migrator objects, not the reverse.
GRANT approval_migrator TO postgres;
-- Drizzle checks CREATE SCHEMA IF NOT EXISTS even when drizzle already exists.
-- CREATE here permits schemas inside this database, not creating databases.
GRANT CONNECT, CREATE ON DATABASE postgres TO approval_migrator;
GRANT USAGE, CREATE ON SCHEMA public, drizzle TO approval_migrator;

ALTER TABLE public.department_memberships OWNER TO approval_migrator;
ALTER TABLE public.departments OWNER TO approval_migrator;
ALTER TABLE public.refresh_tokens OWNER TO approval_migrator;
ALTER TABLE public.roles OWNER TO approval_migrator;
ALTER TABLE public.session_families OWNER TO approval_migrator;
ALTER TABLE public.user_roles OWNER TO approval_migrator;
ALTER TABLE public.users OWNER TO approval_migrator;
ALTER TABLE public.approval_cycles OWNER TO approval_migrator;
ALTER TABLE public.approval_policy_versions OWNER TO approval_migrator;
ALTER TABLE public.approval_slots OWNER TO approval_migrator;
ALTER TABLE public.approval_stages OWNER TO approval_migrator;
ALTER TABLE public.budget_policies OWNER TO approval_migrator;
ALTER TABLE public.idempotency_records OWNER TO approval_migrator;
ALTER TABLE public.audit_events OWNER TO approval_migrator;
ALTER TABLE public.request_items OWNER TO approval_migrator;
ALTER TABLE public.outbox_events OWNER TO approval_migrator;
ALTER TABLE public.request_revisions OWNER TO approval_migrator;
ALTER TABLE public.request_type_versions OWNER TO approval_migrator;
ALTER TABLE public.request_types OWNER TO approval_migrator;
ALTER TABLE public.requests OWNER TO approval_migrator;
ALTER TABLE public.reviewer_assignment_rules OWNER TO approval_migrator;
ALTER TABLE public.approval_decisions OWNER TO approval_migrator;
ALTER TABLE public.decision_idempotency_records OWNER TO approval_migrator;
-- PostgreSQL also transfers sequences owned by this table's serial columns.
ALTER TABLE drizzle.__drizzle_migrations OWNER TO approval_migrator;
ALTER TYPE public.role_code OWNER TO approval_migrator;
ALTER SEQUENCE public.request_number_sequence OWNER TO approval_migrator;
ALTER FUNCTION public.protect_published_form() OWNER TO approval_migrator;
ALTER FUNCTION public.protect_submitted_revision() OWNER TO approval_migrator;
ALTER FUNCTION public.protect_submitted_item() OWNER TO approval_migrator;
ALTER FUNCTION public.protect_request_identity() OWNER TO approval_migrator;
ALTER FUNCTION public.protect_policy_version() OWNER TO approval_migrator;
ALTER FUNCTION public.protect_cycle_snapshot() OWNER TO approval_migrator;
ALTER FUNCTION public.protect_accepted_history() OWNER TO approval_migrator;
ALTER FUNCTION public.protect_outbox_intent() OWNER TO approval_migrator;

COMMIT;

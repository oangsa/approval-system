-- Access configuration for human review against the existing Sprint 1 schema.
-- Run as its current owner after reviewing inventory and this grant list.
-- Creates no roles, passwords, tables, policies or application records.
BEGIN;

GRANT CONNECT ON DATABASE postgres TO approval_runtime;
GRANT USAGE ON SCHEMA public TO approval_runtime;

GRANT SELECT ON TABLE
    public.users, public.user_roles, public.departments,
    public.department_memberships, public.session_families,
    public.refresh_tokens, public.request_types, public.request_type_versions,
    public.approval_policy_versions, public.reviewer_assignment_rules,
    public.budget_policies, public.requests, public.request_revisions,
    public.request_items, public.approval_cycles, public.approval_stages,
    public.approval_slots, public.audit_events, public.outbox_events,
    public.idempotency_records, public.approval_decisions,
    public.decision_idempotency_records
TO approval_runtime;

GRANT INSERT ON TABLE
    public.session_families, public.refresh_tokens, public.requests,
    public.request_revisions, public.request_items, public.approval_cycles,
    public.approval_stages, public.approval_slots, public.audit_events,
    public.outbox_events, public.idempotency_records, public.approval_decisions,
    public.decision_idempotency_records
TO approval_runtime;

GRANT UPDATE (auth_version) ON public.users TO approval_runtime;
GRANT UPDATE (revoked_at) ON public.session_families TO approval_runtime;
GRANT UPDATE (consumed_at) ON public.refresh_tokens TO approval_runtime;
GRANT UPDATE (
    title, justification, priority, version, updated_at, working_revision_id,
    status, request_number, department_id, department_snapshot, submitted_at,
    submitted_revision_id, current_cycle_id
) ON public.requests TO approval_runtime;
GRANT UPDATE (
    fields, form_definition_version_id, amount, currency, submitted_at, submitted_by
) ON public.request_revisions TO approval_runtime;
GRANT DELETE ON public.request_items TO approval_runtime;
GRANT UPDATE (is_active) ON public.approval_cycles TO approval_runtime;
GRANT UPDATE (status) ON public.approval_stages TO approval_runtime;
GRANT UPDATE (status, version) ON public.approval_slots TO approval_runtime;
GRANT USAGE ON SEQUENCE public.request_number_sequence TO approval_runtime;

-- Existing SELECT ... FOR SHARE queries require UPDATE on at least one column.
-- Limit that privilege to identity columns, not role values, routing, budgets
-- or form/policy content. Existing immutability triggers remain in force.
GRANT UPDATE (user_id) ON public.user_roles TO approval_runtime;
GRANT UPDATE (user_id) ON public.department_memberships TO approval_runtime;
GRANT UPDATE (id) ON public.departments TO approval_runtime;
GRANT UPDATE (id) ON public.request_types TO approval_runtime;
GRANT UPDATE (id) ON public.request_type_versions TO approval_runtime;
GRANT UPDATE (id) ON public.approval_policy_versions TO approval_runtime;
GRANT UPDATE (id) ON public.reviewer_assignment_rules TO approval_runtime;
GRANT UPDATE (id) ON public.budget_policies TO approval_runtime;

COMMIT;

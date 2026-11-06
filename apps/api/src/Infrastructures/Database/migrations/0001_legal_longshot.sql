CREATE SEQUENCE "public"."request_number_sequence" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "approval_cycles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_cycles_revision_id_unique" UNIQUE("revision_id")
);
--> statement-breakpoint
CREATE TABLE "approval_policy_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"version_number" integer NOT NULL,
	"type_id" uuid NOT NULL,
	"department_id" uuid,
	"priority" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"min_amount" numeric(24, 2),
	"max_amount" numeric(24, 2),
	"stages" jsonb NOT NULL,
	CONSTRAINT "approval_policy_versions_code_version_number_unique" UNIQUE("code","version_number")
);
--> statement-breakpoint
CREATE TABLE "approval_slots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stage_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"assignment_key" text NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	CONSTRAINT "approval_slots_stage_id_assignment_key_unique" UNIQUE("stage_id","assignment_key")
);
--> statement-breakpoint
CREATE TABLE "approval_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cycle_id" uuid NOT NULL,
	"stage_number" integer NOT NULL,
	"status" text NOT NULL,
	"sla_business_minutes" integer NOT NULL,
	CONSTRAINT "approval_stages_cycle_id_stage_number_unique" UNIQUE("cycle_id","stage_number"),
	CONSTRAINT "stage_number_range" CHECK ("approval_stages"."stage_number" in (1,2))
);
--> statement-breakpoint
CREATE TABLE "budget_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type_id" uuid NOT NULL,
	"department_id" uuid,
	"max_amount" numeric(24, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "budget_nonnegative" CHECK ("budget_policies"."max_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"actor_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"key" uuid NOT NULL,
	"body_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_actor_id_scope_key_pk" PRIMARY KEY("actor_id","scope","key")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"revision_id" uuid,
	"cycle_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(24, 6) NOT NULL,
	"unit_amount" numeric(24, 2) NOT NULL,
	"total_amount" numeric(24, 2) NOT NULL,
	CONSTRAINT "item_quantity_positive" CHECK ("request_items"."quantity" > 0),
	CONSTRAINT "item_amount_nonnegative" CHECK ("request_items"."unit_amount" >= 0 AND "request_items"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "outbox_events_event_key_unique" UNIQUE("event_key")
);
--> statement-breakpoint
CREATE TABLE "request_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"form_definition_version_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"fields" jsonb NOT NULL,
	"amount" numeric(24, 2),
	"currency" text,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	CONSTRAINT "request_revisions_request_id_revision_number_unique" UNIQUE("request_id","revision_number"),
	CONSTRAINT "revision_positive" CHECK ("request_revisions"."revision_number" > 0),
	CONSTRAINT "revision_amount_nonnegative" CHECK ("request_revisions"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "request_type_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"definition" jsonb NOT NULL,
	CONSTRAINT "request_type_versions_type_id_version_number_unique" UNIQUE("type_id","version_number"),
	CONSTRAINT "request_type_versions_type_id_id_unique" UNIQUE("type_id","id"),
	CONSTRAINT "type_version_positive" CHECK ("request_type_versions"."version_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "request_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"published_version_id" uuid,
	CONSTRAINT "request_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requester_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"department_id" uuid,
	"department_snapshot" jsonb,
	"request_number" text,
	"title" text NOT NULL,
	"justification" text NOT NULL,
	"priority" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"working_revision_id" uuid,
	"submitted_revision_id" uuid,
	"current_cycle_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "requests_request_number_unique" UNIQUE("request_number"),
	CONSTRAINT "request_status" CHECK ("requests"."status" in ('DRAFT','PENDING','RETURNED','APPROVED','REJECTED','WITHDRAWN')),
	CONSTRAINT "request_priority" CHECK ("requests"."priority" in ('LOW','MEDIUM','HIGH','URGENT')),
	CONSTRAINT "request_version_nonnegative" CHECK ("requests"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reviewer_assignment_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"assignment_key" text NOT NULL,
	"department_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "reviewer_assignment_rules_assignment_key_department_id_unique" UNIQUE("assignment_key","department_id")
);
--> statement-breakpoint
ALTER TABLE "approval_cycles" ADD CONSTRAINT "approval_cycles_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_cycles" ADD CONSTRAINT "approval_cycles_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_cycles" ADD CONSTRAINT "approval_cycles_policy_version_id_approval_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."approval_policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy_versions" ADD CONSTRAINT "approval_policy_versions_type_id_request_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."request_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_policy_versions" ADD CONSTRAINT "approval_policy_versions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_slots" ADD CONSTRAINT "approval_slots_stage_id_approval_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."approval_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_slots" ADD CONSTRAINT "approval_slots_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_stages" ADD CONSTRAINT "approval_stages_cycle_id_approval_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."approval_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_policies" ADD CONSTRAINT "budget_policies_type_id_request_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."request_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_policies" ADD CONSTRAINT "budget_policies_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_cycle_id_approval_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."approval_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_revision_id_request_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_revisions" ADD CONSTRAINT "request_revisions_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_revisions" ADD CONSTRAINT "request_revisions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_revisions" ADD CONSTRAINT "request_revisions_type_id_form_definition_version_id_request_type_versions_type_id_id_fk" FOREIGN KEY ("type_id","form_definition_version_id") REFERENCES "public"."request_type_versions"("type_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_type_versions" ADD CONSTRAINT "request_type_versions_type_id_request_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."request_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_types" ADD CONSTRAINT "request_types_published_version_id_request_type_versions_id_fk" FOREIGN KEY ("published_version_id") REFERENCES "public"."request_type_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_type_id_request_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."request_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_working_revision_id_request_revisions_id_fk" FOREIGN KEY ("working_revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_submitted_revision_id_request_revisions_id_fk" FOREIGN KEY ("submitted_revision_id") REFERENCES "public"."request_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_current_cycle_id_approval_cycles_id_fk" FOREIGN KEY ("current_cycle_id") REFERENCES "public"."approval_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_assignment_rules" ADD CONSTRAINT "reviewer_assignment_rules_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_assignment_rules" ADD CONSTRAINT "reviewer_assignment_rules_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_cycle" ON "approval_cycles" USING btree ("request_id") WHERE "approval_cycles"."is_active";--> statement-breakpoint
CREATE INDEX "request_owner_idx" ON "requests" USING btree ("requester_id");
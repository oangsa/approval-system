CREATE TABLE "approval_policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"published_version_id" uuid,
	"draft" jsonb,
	CONSTRAINT "approval_policies_code_unique" UNIQUE("code"),
	CONSTRAINT "approval_policy_version_nonnegative" CHECK ("approval_policies"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "configuration_audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_idempotency_records" (
	"actor_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"key" uuid NOT NULL,
	"body_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	CONSTRAINT "policy_idempotency_records_actor_id_scope_key_pk" PRIMARY KEY("actor_id","scope","key")
);
--> statement-breakpoint
ALTER TABLE "reviewer_assignment_rules" ALTER COLUMN "department_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_policies" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reviewer_assignment_rules" ADD COLUMN "reviewer_user_ids" uuid[];--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_published_version_id_approval_policy_versions_id_fk" FOREIGN KEY ("published_version_id") REFERENCES "public"."approval_policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuration_audit_events" ADD CONSTRAINT "configuration_audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_idempotency_records" ADD CONSTRAINT "policy_idempotency_records_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_global_assignment" ON "reviewer_assignment_rules" USING btree ("assignment_key") WHERE "reviewer_assignment_rules"."department_id" IS NULL;
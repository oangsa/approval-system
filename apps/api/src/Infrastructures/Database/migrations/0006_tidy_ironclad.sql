CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slot_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text,
	"decided_at" timestamp with time zone NOT NULL,
	CONSTRAINT "approval_decisions_slot_id_unique" UNIQUE("slot_id"),
	CONSTRAINT "decision_type" CHECK ("approval_decisions"."decision" in ('APPROVE','REJECT')),
	CONSTRAINT "rejection_reason" CHECK ("approval_decisions"."decision" <> 'REJECT' OR length(btrim("approval_decisions"."reason")) > 0 AND "approval_decisions"."reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "decision_idempotency_records" (
	"actor_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"key" uuid NOT NULL,
	"body_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_idempotency_records_actor_id_scope_key_pk" PRIMARY KEY("actor_id","scope","key")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "decision_id" uuid;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_slot_id_approval_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."approval_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_idempotency_records" ADD CONSTRAINT "decision_idempotency_records_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_decision_id_approval_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."approval_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_decision_id_unique" UNIQUE("decision_id");
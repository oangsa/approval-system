CREATE TABLE "request_type_idempotency_records" (
	"actor_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"key" uuid NOT NULL,
	"body_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_type_idempotency_records_actor_id_scope_key_pk" PRIMARY KEY("actor_id","scope","key")
);
--> statement-breakpoint
ALTER TABLE "request_items" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_types" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "request_types" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "request_types" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "request_types" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "request_type_idempotency_records" ADD CONSTRAINT "request_type_idempotency_records_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_types" ADD CONSTRAINT "request_type_version_nonnegative" CHECK ("request_types"."version" >= 0);--> statement-breakpoint
CREATE TRIGGER immutable_request_type_idempotency BEFORE UPDATE OR DELETE ON request_type_idempotency_records FOR EACH ROW EXECUTE FUNCTION protect_accepted_history();
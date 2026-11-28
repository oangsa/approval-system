CREATE TABLE "attachment_cleanup_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reservation_id" uuid,
	"attachment_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 10 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"claim_token" uuid,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "attachment_cleanup_jobs_reason" CHECK ("attachment_cleanup_jobs"."reason" IN ('UPLOAD_ABORTED', 'COMMIT_CONFLICT', 'WORKING_DELETED', 'STALE_RESERVATION')),
	CONSTRAINT "attachment_cleanup_jobs_status" CHECK ("attachment_cleanup_jobs"."status" IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
	CONSTRAINT "attachment_cleanup_jobs_attempt_count_nonnegative" CHECK ("attachment_cleanup_jobs"."attempt_count" >= 0),
	CONSTRAINT "attachment_cleanup_jobs_max_attempts_positive" CHECK ("attachment_cleanup_jobs"."max_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "attachment_upload_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attachment_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"abandoned_at" timestamp with time zone,
	CONSTRAINT "attachment_upload_reservations_attachment_id_unique" UNIQUE("attachment_id"),
	CONSTRAINT "attachment_upload_reservations_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "attachment_upload_reservations_size_bytes_range" CHECK ("attachment_upload_reservations"."size_bytes" > 0 AND "attachment_upload_reservations"."size_bytes" <= 10485760),
	CONSTRAINT "attachment_upload_reservations_status" CHECK ("attachment_upload_reservations"."status" IN ('UPLOADING', 'FINALIZED', 'ABANDONED'))
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"file_name" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "attachments_file_name_length" CHECK (char_length(btrim("attachments"."file_name")) BETWEEN 1 AND 255),
	CONSTRAINT "attachments_size_bytes_range" CHECK ("attachments"."size_bytes" > 0 AND "attachments"."size_bytes" <= 10485760),
	CONSTRAINT "attachments_sha256_hex" CHECK ("attachments"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "request_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_comments_body_length" CHECK (char_length(btrim("request_comments"."body")) BETWEEN 1 AND 4000)
);
--> statement-breakpoint
ALTER TABLE "request_revisions" ADD CONSTRAINT "request_revisions_request_id_id_uq" UNIQUE("request_id","id");--> statement-breakpoint
ALTER TABLE "attachment_cleanup_jobs" ADD CONSTRAINT "attachment_cleanup_jobs_reservation_id_attachment_upload_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."attachment_upload_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_upload_reservations" ADD CONSTRAINT "attachment_upload_reservations_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_upload_reservations" ADD CONSTRAINT "attachment_upload_reservations_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_upload_reservations" ADD CONSTRAINT "attachment_upload_reservations_request_id_revision_id_request_revisions_request_id_id_fk" FOREIGN KEY ("request_id","revision_id") REFERENCES "public"."request_revisions"("request_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_request_id_revision_id_request_revisions_request_id_id_fk" FOREIGN KEY ("request_id","revision_id") REFERENCES "public"."request_revisions"("request_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_comments" ADD CONSTRAINT "request_comments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_comments" ADD CONSTRAINT "request_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_cleanup_jobs_due_idx" ON "attachment_cleanup_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "attachment_cleanup_jobs_lease_idx" ON "attachment_cleanup_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attachment_cleanup_jobs_storage_key_pending_uq" ON "attachment_cleanup_jobs" USING btree ("storage_key") WHERE "attachment_cleanup_jobs"."status" IN ('PENDING', 'PROCESSING');--> statement-breakpoint
CREATE INDEX "attachment_upload_res_status_exp_idx" ON "attachment_upload_reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "attachments_request_revision_uploaded_idx" ON "attachments" USING btree ("request_id","revision_id","uploaded_at","id");--> statement-breakpoint
CREATE INDEX "attachments_revision_idx" ON "attachments" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "request_comments_request_created_id_idx" ON "request_comments" USING btree ("request_id","created_at","id");--> statement-breakpoint
CREATE FUNCTION protect_submitted_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM request_revisions WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.revision_id ELSE OLD.revision_id END AND submitted_at IS NOT NULL)
       OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM request_revisions WHERE id = NEW.revision_id AND submitted_at IS NOT NULL)) THEN
        RAISE EXCEPTION 'Submitted attachments are immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Working attachments are insert/delete only' USING ERRCODE = '23514';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
--> statement-breakpoint
CREATE TRIGGER immutable_attachment BEFORE INSERT OR UPDATE OR DELETE ON attachments FOR EACH ROW EXECUTE FUNCTION protect_submitted_attachment();
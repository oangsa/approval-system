ALTER TABLE "approval_decisions" DROP CONSTRAINT "decision_type";--> statement-breakpoint
ALTER TABLE "approval_decisions" DROP CONSTRAINT "rejection_reason";--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "decision_type" CHECK ("approval_decisions"."decision" in ('APPROVE','REJECT','RETURN'));--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "rejection_reason" CHECK ("approval_decisions"."decision" not in ('REJECT','RETURN') OR length(btrim("approval_decisions"."reason")) > 0 AND "approval_decisions"."reason" IS NOT NULL);
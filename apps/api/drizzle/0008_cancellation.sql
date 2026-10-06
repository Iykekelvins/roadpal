CREATE TYPE "public"."cancel_reason" AS ENUM('provider_no_show', 'cant_reach_other_party', 'problem_solved', 'found_other_help', 'emergency', 'other');--> statement-breakpoint
DROP INDEX "offers_one_per_provider_per_request";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cancelled_by" "user_role";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cancel_reason" "cancel_reason";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cancel_note" text;--> statement-breakpoint
CREATE UNIQUE INDEX "offers_one_per_provider_per_request" ON "offers" USING btree ("request_id","provider_id") WHERE status in ('pending', 'accepted');
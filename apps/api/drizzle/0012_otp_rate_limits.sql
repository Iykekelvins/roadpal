CREATE TABLE "sms_daily_counts" (
	"day" date PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN "send_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN "window_started_at" timestamp with time zone DEFAULT now() NOT NULL;
CREATE TYPE "public"."request_status" AS ENUM('open', 'matched', 'resolved', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('car', 'bus', 'truck', 'motorcycle');--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"vehicle_type" "vehicle_type" NOT NULL,
	"issue_type" "issue_type" NOT NULL,
	"note" text,
	"status" "request_status" DEFAULT 'open' NOT NULL,
	"search_radius_km" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "requests_location_index" ON "requests" USING gist ("location");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_one_active_per_driver" ON "requests" USING btree ("driver_id") WHERE status in ('open', 'matched');
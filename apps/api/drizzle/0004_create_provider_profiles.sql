CREATE TYPE "public"."issue_type" AS ENUM('flat_tyre', 'puncture', 'tyre_burst', 'no_spare', 'needs_air', 'other');--> statement-breakpoint
CREATE TABLE "provider_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"services" "issue_type"[] NOT NULL,
	"service_radius_km" integer DEFAULT 10 NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"last_location" geography(Point, 4326),
	"last_location_at" timestamp with time zone,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_radius_km_range" CHECK ("provider_profiles"."service_radius_km" between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_profiles_last_location_index" ON "provider_profiles" USING gist ("last_location");
CREATE TYPE "public"."offer_status" AS ENUM('pending', 'accepted', 'rejected', 'withdrawn', 'expired');--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"price_naira" integer NOT NULL,
	"eta_minutes" integer NOT NULL,
	"distance_meters" integer NOT NULL,
	"status" "offer_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_price_positive" CHECK ("offers"."price_naira" > 0),
	CONSTRAINT "offers_eta_positive" CHECK ("offers"."eta_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_provider_id_users_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "offers_one_per_provider_per_request" ON "offers" USING btree ("request_id","provider_id");
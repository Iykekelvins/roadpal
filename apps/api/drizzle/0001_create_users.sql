CREATE TYPE "public"."user_role" AS ENUM('driver', 'provider');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"role" "user_role" NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);

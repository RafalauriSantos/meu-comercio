CREATE TABLE "access_recovery_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(16) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "credentials_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "owner_recovery_tokens" ADD COLUMN "purpose" varchar(32);--> statement-breakpoint
ALTER TABLE "owner_recovery_tokens" ADD COLUMN "email" varchar(254);--> statement-breakpoint
CREATE INDEX "idx_access_recovery_requests_scope_key_created" ON "access_recovery_requests" USING btree ("scope","key_hash","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_app_users_verified_email" ON "app_users" USING btree ("email") WHERE "app_users"."email_verified_at" is not null;
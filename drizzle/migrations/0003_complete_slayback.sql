ALTER TABLE "merchants" ADD COLUMN "stock_control_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "stock_tracked" boolean DEFAULT true NOT NULL;
ALTER TABLE "products" ADD COLUMN "unit" varchar(8) DEFAULT 'UN' NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "unit" varchar(8) DEFAULT 'UN' NOT NULL;
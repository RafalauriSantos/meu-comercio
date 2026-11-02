CREATE TABLE "app_users" (
	"username" varchar(120) PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"authorization_pin_hash" varchar(255),
	"email" varchar(254),
	"enabled" boolean DEFAULT true NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_recovery_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"username" varchar(120) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_recovery_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_authorities" (
	"merchant_id" uuid NOT NULL,
	"username" varchar(120) NOT NULL,
	"authority" varchar(120) NOT NULL,
	CONSTRAINT "pk_user_authorities" PRIMARY KEY("merchant_id","username","authority")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"actor_id" varchar(120) NOT NULL,
	"aggregate_type" varchar(80) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"sale_id" uuid,
	"movement_type" varchar(32) NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"reason" varchar(255),
	"operator_id" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"opened_by" varchar(120) NOT NULL,
	"opening_balance" numeric(19, 4) NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(16) DEFAULT 'OPEN' NOT NULL,
	"closed_by" varchar(120),
	"closing_balance" numeric(19, 4),
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"barcode" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"sale_price" numeric(19, 4) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"merchant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"available_quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_inventory_items" PRIMARY KEY("merchant_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"movement_type" varchar(32) NOT NULL,
	"quantity" integer NOT NULL,
	"reason" varchar(240) NOT NULL,
	"actor_id" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"method" varchar(32) NOT NULL,
	"status" varchar(24) DEFAULT 'APPROVED' NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"received_amount" numeric(19, 4) NOT NULL,
	"change_amount" numeric(19, 4) DEFAULT '0' NOT NULL,
	"installments" integer DEFAULT 1 NOT NULL,
	"external_reference" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" varchar(160) NOT NULL,
	"unit_price" numeric(19, 4) NOT NULL,
	"quantity" integer NOT NULL,
	"subtotal" numeric(19, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"cash_session_id" uuid NOT NULL,
	"operator_id" varchar(120) NOT NULL,
	"status" varchar(24) DEFAULT 'PENDING_PAYMENT' NOT NULL,
	"subtotal" numeric(19, 4) NOT NULL,
	"discount_amount" numeric(19, 4) DEFAULT '0' NOT NULL,
	"total" numeric(19, 4) NOT NULL,
	"cash_received" numeric(19, 4),
	"change_amount" numeric(19, 4) DEFAULT '0' NOT NULL,
	"idempotency_key" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" varchar(24) NOT NULL,
	"amount" numeric(19, 4) NOT NULL,
	"sale_id" uuid,
	"cash_session_id" uuid,
	"operator_id" varchar(120) NOT NULL,
	"authorized_by" varchar(120),
	"note" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"credit_limit" numeric(19, 4) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_recovery_tokens" ADD CONSTRAINT "owner_recovery_tokens_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_authorities" ADD CONSTRAINT "user_authorities_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_ledger" ADD CONSTRAINT "customer_credit_ledger_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_ledger" ADD CONSTRAINT "customer_credit_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_ledger" ADD CONSTRAINT "customer_credit_ledger_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_ledger" ADD CONSTRAINT "customer_credit_ledger_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_app_users_merchant_username" ON "app_users" USING btree ("merchant_id","username");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_app_users_owner_email" ON "app_users" USING btree ("merchant_id","email");--> statement-breakpoint
CREATE INDEX "idx_audit_events_merchant" ON "audit_events" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "idx_audit_events_aggregate" ON "audit_events" USING btree ("merchant_id","aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "idx_audit_events_created_at" ON "audit_events" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_cash_movements_session" ON "cash_movements" USING btree ("cash_session_id");--> statement-breakpoint
CREATE INDEX "idx_cash_movements_merchant" ON "cash_movements" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_one_open_cash_session_per_merchant" ON "cash_sessions" USING btree ("merchant_id","status") WHERE status = 'OPEN';--> statement-breakpoint
CREATE INDEX "idx_cash_sessions_merchant" ON "cash_sessions" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_products_merchant_barcode" ON "products" USING btree ("merchant_id","barcode");--> statement-breakpoint
CREATE INDEX "idx_products_merchant_name" ON "products" USING btree ("merchant_id","name");--> statement-breakpoint
CREATE INDEX "idx_inventory_movements_product_created" ON "inventory_movements" USING btree ("merchant_id","product_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_payments_merchant_sale" ON "payments" USING btree ("merchant_id","sale_id");--> statement-breakpoint
CREATE INDEX "idx_payments_merchant_method" ON "payments" USING btree ("merchant_id","method");--> statement-breakpoint
CREATE INDEX "idx_sale_items_merchant_sale" ON "sale_items" USING btree ("merchant_id","sale_id");--> statement-breakpoint
CREATE INDEX "idx_sale_items_merchant_product" ON "sale_items" USING btree ("merchant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sales_merchant_idempotency" ON "sales" USING btree ("merchant_id","idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_sales_merchant_created" ON "sales" USING btree ("merchant_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_sales_merchant_session" ON "sales" USING btree ("merchant_id","cash_session_id");--> statement-breakpoint
CREATE INDEX "idx_customer_credit_ledger_customer" ON "customer_credit_ledger" USING btree ("merchant_id","customer_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_customer_credit_ledger_sale" ON "customer_credit_ledger" USING btree ("merchant_id","sale_id");--> statement-breakpoint
CREATE INDEX "idx_customer_credit_ledger_session" ON "customer_credit_ledger" USING btree ("merchant_id","cash_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_customers_merchant_phone" ON "customers" USING btree ("merchant_id","phone");--> statement-breakpoint
CREATE INDEX "idx_customers_merchant_name" ON "customers" USING btree ("merchant_id","name");--> statement-breakpoint
CREATE INDEX "idx_customers_merchant_active" ON "customers" USING btree ("merchant_id","active");
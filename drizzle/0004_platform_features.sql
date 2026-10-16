CREATE TABLE "exchange_rates" (
	"code" varchar(8) PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"rate_to_base" numeric(18, 8) DEFAULT '1' NOT NULL,
	"symbol" varchar(8) DEFAULT '₵' NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"as_of" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"share_code" varchar(16) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_shares_share_code_unique" UNIQUE("share_code")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "currency" varchar(8) DEFAULT 'GHS' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "delivery_status" varchar(20) DEFAULT 'delivered' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "provider_ref" varchar(80);--> statement-breakpoint
ALTER TABLE "service_agreements" ADD COLUMN "billing_day" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD COLUMN "auto_invoice" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sso_provider" varchar(40);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sso_subject" varchar(160);--> statement-breakpoint
ALTER TABLE "tracking_shares" ADD CONSTRAINT "tracking_shares_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_shares" ADD CONSTRAINT "tracking_shares_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_rates_as_of_idx" ON "exchange_rates" USING btree ("as_of");--> statement-breakpoint
CREATE INDEX "tracking_shares_trip_idx" ON "tracking_shares" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "tracking_shares_employee_idx" ON "tracking_shares" USING btree ("employee_id");
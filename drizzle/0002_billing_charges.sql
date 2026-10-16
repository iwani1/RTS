ALTER TABLE "service_agreements" ADD COLUMN "waiting_charge_per_hour" numeric(12, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "service_agreements" ADD COLUMN "overtime_charge_per_hour" numeric(12, 2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE "service_agreements" ADD COLUMN "extra_trip_charge" numeric(12, 2) DEFAULT '250.00';--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "waiting_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "overtime_minutes" integer DEFAULT 0 NOT NULL;
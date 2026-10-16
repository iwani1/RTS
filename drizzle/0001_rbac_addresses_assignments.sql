CREATE TYPE "public"."address_label" AS ENUM('home', 'office', 'other');--> statement-breakpoint
CREATE TYPE "public"."assignment_role" AS ENUM('primary', 'relief', 'overflow');--> statement-breakpoint
CREATE TYPE "public"."inspection_result" AS ENUM('pass', 'conditional', 'fail');--> statement-breakpoint
CREATE TYPE "public"."inspection_type" AS ENUM('roadworthiness', 'annual', 'spot', 'pre_departure');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."otp_channel" AS ENUM('sms', 'email');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'password_reset', 'two_factor', 'boarding');--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"label" "address_label" DEFAULT 'home' NOT NULL,
	"line1" text NOT NULL,
	"line2" text,
	"city" varchar(80),
	"zone" varchar(80),
	"lat" double precision,
	"lng" double precision,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"trip_id" integer,
	"driver_id" integer,
	"litres" double precision DEFAULT 0 NOT NULL,
	"cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"odometer_km" integer,
	"station" varchar(120),
	"filled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_name" varchar(60) NOT NULL,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "location_consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"granted" boolean DEFAULT false NOT NULL,
	"policy_version" varchar(20) DEFAULT 'v1' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"identifier" varchar(180) NOT NULL,
	"ip" varchar(64),
	"succeeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"channel" "otp_channel" DEFAULT 'sms' NOT NULL,
	"purpose" "otp_purpose" DEFAULT 'login' NOT NULL,
	"code_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(80) NOT NULL,
	"resource" varchar(40) NOT NULL,
	"action" varchar(40) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" integer NOT NULL,
	"permission_id" integer NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "safety_inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"type" "inspection_type" DEFAULT 'roadworthiness' NOT NULL,
	"result" "inspection_result" DEFAULT 'pass' NOT NULL,
	"certificate_no" varchar(60),
	"inspector" varchar(120),
	"notes" text,
	"performed_at" date NOT NULL,
	"next_due_at" date,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(80) NOT NULL,
	"scope" varchar(40) NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"vehicle_id" integer,
	"driver_id" integer,
	"role" "assignment_role" DEFAULT 'primary' NOT NULL,
	"assigned_by_id" integer,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"company_id" integer,
	"assigned_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "actual_pickup_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "actual_dropoff_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "recurrence_end_date" date;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "otp_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "otp_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "waitlisted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "total_trips" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "is_available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "drivers" ADD COLUMN "profile_image_url" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "primary_address_id" integer;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "current_occupancy" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "shift_id" integer;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "standing_capacity" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "color" varchar(40);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "chassis_number" varchar(60);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "engine_number" varchar(60);--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "current_mileage" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "fuel_consumption_per_km" double precision DEFAULT 0;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "last_service_date" date;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "next_service_due_date" date;--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_consents" ADD CONSTRAINT "location_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_inspections" ADD CONSTRAINT "safety_inspections_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_inspections" ADD CONSTRAINT "safety_inspections_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_employee_idx" ON "addresses" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "addresses_company_label_idx" ON "addresses" USING btree ("label");--> statement-breakpoint
CREATE INDEX "fuel_logs_vehicle_idx" ON "fuel_logs" USING btree ("vehicle_id","filled_at");--> statement-breakpoint
CREATE INDEX "fuel_logs_date_idx" ON "fuel_logs" USING btree ("filled_at");--> statement-breakpoint
CREATE INDEX "job_runs_name_idx" ON "job_runs" USING btree ("job_name","started_at");--> statement-breakpoint
CREATE INDEX "location_consents_user_idx" ON "location_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_attempts_identifier_idx" ON "login_attempts" USING btree ("identifier","created_at");--> statement-breakpoint
CREATE INDEX "otp_codes_user_idx" ON "otp_codes" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "otp_codes_expiry_idx" ON "otp_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "permissions_resource_idx" ON "permissions" USING btree ("resource","action");--> statement-breakpoint
CREATE INDEX "roles_key_idx" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE INDEX "safety_inspections_vehicle_idx" ON "safety_inspections" USING btree ("vehicle_id","performed_at");--> statement-breakpoint
CREATE INDEX "safety_inspections_due_idx" ON "safety_inspections" USING btree ("next_due_at");--> statement-breakpoint
CREATE INDEX "saved_views_user_idx" ON "saved_views" USING btree ("user_id","scope");--> statement-breakpoint
CREATE INDEX "trip_assignments_trip_idx" ON "trip_assignments" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trip_assignments_vehicle_idx" ON "trip_assignments" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "trip_assignments_driver_idx" ON "trip_assignments" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_primary_address_id_addresses_id_fk" FOREIGN KEY ("primary_address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_shift_id_employee_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."employee_shifts"("id") ON DELETE set null ON UPDATE no action;
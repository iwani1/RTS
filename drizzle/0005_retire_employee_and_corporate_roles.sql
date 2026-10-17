-- Retire the Employee/Passenger and Corporate HR roles.
--
-- The roles are gone from the permission matrix, from the navigation and from
-- the seed. The data they used is not touched: the client companies, their
-- branches, the staff register, the trips, the bookings and the invoices all
-- stay exactly as they are, so either role can be switched back on.
--
-- The two values remain in the user_role enum on purpose, dormant, so that
-- restoring a role is a change to the matrix rather than a change to the
-- schema.
--> statement-breakpoint
-- Sign-in attempts are keyed by email, not by a foreign key, so they are
-- cleared before the accounts go.
DELETE FROM "login_attempts"
WHERE "identifier" IN (
  SELECT "email" FROM "users" WHERE "role" IN ('employee', 'corporate_admin')
);--> statement-breakpoint
-- The normalised role model: the rows and the grants that went with them.
DELETE FROM "user_roles"
WHERE "role_id" IN (
  SELECT "id" FROM "roles" WHERE "key" IN ('employee', 'corporate_admin')
);--> statement-breakpoint
DELETE FROM "role_permissions"
WHERE "role_id" IN (
  SELECT "id" FROM "roles" WHERE "key" IN ('employee', 'corporate_admin')
);--> statement-breakpoint
DELETE FROM "roles" WHERE "key" IN ('employee', 'corporate_admin');--> statement-breakpoint
-- The accounts themselves. Every foreign key that points at a user either
-- cascades or is set to null, so the staff register, the driver records, the
-- trips, the bookings and the audit trail keep their history.
DELETE FROM "users" WHERE "role" IN ('employee', 'corporate_admin');--> statement-breakpoint
-- The product is now the Richie Transport Services Management System, so the
-- operator domain moves with it. Only the addresses that are still in use are
-- rewritten; the retired accounts above have already gone.
UPDATE "users"
SET "email" = replace("email", '@staffridegh.com', '@richietransportgh.com')
WHERE "email" LIKE '%@staffridegh.com';--> statement-breakpoint
UPDATE "audit_logs"
SET "actor_email" = replace("actor_email", '@staffridegh.com', '@richietransportgh.com')
WHERE "actor_email" LIKE '%@staffridegh.com';--> statement-breakpoint
UPDATE "login_attempts"
SET "identifier" = replace("identifier", '@staffridegh.com', '@richietransportgh.com')
WHERE "identifier" LIKE '%@staffridegh.com';

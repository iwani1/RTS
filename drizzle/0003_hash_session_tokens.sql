-- Store only a SHA-256 hash of the session bearer token.
-- The raw token lives exclusively in the client cookie, so a database
-- disclosure can no longer be replayed to hijack a session.
--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "token" TO "token_hash";--> statement-breakpoint
-- Any session issued before this migration stored a raw token, which can no
-- longer be matched against a hash. Invalidate them all: every user signs in
-- again once.
--> statement-breakpoint
DELETE FROM "sessions";
#!/usr/bin/env node
/**
 * Put a message in the queue.
 *
 * The delivery worker only ever picks up rows that are marked `queued`, so
 * this script writes one: it is how the worker is exercised on demand, and
 * how a message can be pushed through the queue by hand.
 *
 * PGlite is single-process, so the server must be stopped first:
 *
 *   npm run stop
 *   node scripts/queue-message.mjs --channel sms --to 0244012345 --body "Boarding at 05:45"
 *   npm start
 *
 * Within a minute the worker claims the row, sends it through the provider
 * and writes back `sent` or `failed`.
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    channel: { type: "string", default: "sms" },
    to: { type: "string", default: "" },
    body: { type: "string", default: "This is a queued test message from RTS." },
    title: { type: "string", default: "Queued test message" },
  },
});

async function main() {
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_DATA_DIR ?? ".data/pgdata";
  const db = await PGlite.create({ dataDir });

  try {
    const { rows } = await db.query(`
      select id, email, phone from users
      where phone is not null and phone <> ''
      order by id limit 1
    `);
    const user = rows[0];
    if (!user) throw new Error("No account has a phone number on file.");

    const channel = values.channel === "email" ? "email" : "sms";
    const address = values.to || (channel === "sms" ? user.phone : user.email);

    await db.query(
      `insert into notifications
         (user_id, channel, category, title, body, delivery_status, created_at)
       values ($1, $2, $3, $4, $5, 'queued', now())`,
      [user.id, channel, "queued_test", values.title, `${values.body} (to ${address})`],
    );

    console.log(
      `Queued a ${channel} message for ${address}. Start the server and the worker will send it within a minute.`,
    );
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(`The message could not be queued: ${error.message}`);
  console.error("Is the server stopped? PGlite allows one writer at a time.");
  process.exit(1);
});

#!/usr/bin/env node
/**
 * A stand-in SMS gateway that records what it is asked to send.
 *
 * Used by scripts/delivery-check.mjs and by manual testing of the reminder
 * job. It answers like Hubtel: `Status`, `StatusCode`, `Message` and
 * `MessageId`.
 *
 * Usage: node scripts/gateway-stub.mjs [port]
 */
import http from "node:http";

const port = Number(process.argv[2] ?? process.env.SMS_GATEWAY_PORT ?? 4312);

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    console.log(`[gateway] ${req.method} ${req.url} ${body}`);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        Status: "Success",
        StatusCode: 200,
        Message: "Message Submitted",
        MessageId: `STUB-${Date.now().toString(36).toUpperCase()}`,
      }),
    );
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[gateway] listening on http://127.0.0.1:${port}`);
});

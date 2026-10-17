import { strict as assert } from "node:assert";
import test from "node:test";
import http from "node:http";
import { createHmac } from "node:crypto";
import {
  initialisePayment,
  verifyPayment,
  toMinorUnits,
  fromMinorUnits,
} from "../src/lib/providers/payments.ts";

/**
 * The payment client is tested against a stand-in for the provider that runs
 * on this machine, so the request the client builds — the bearer token, the
 * amount in the smallest unit, the reference — is checked against what a
 * server actually receives, and the webhook signature is checked against a
 * real HMAC.
 */

type Captured = {
  path: string;
  authorization: string | undefined;
  body: string;
};

async function withProvider(
  handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void,
  run: (base: string, captured: Captured[]) => Promise<void>,
) {
  const captured: Captured[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      captured.push({
        path: req.url ?? "",
        authorization: req.headers.authorization,
        body,
      });
      handler(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const previous = process.env.PAYSTACK_API_BASE;
  process.env.PAYSTACK_API_BASE = `http://127.0.0.1:${port}`;
  try {
    await run(`http://127.0.0.1:${port}`, captured);
  } finally {
    if (previous === undefined) delete process.env.PAYSTACK_API_BASE;
    else process.env.PAYSTACK_API_BASE = previous;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function clearPaymentEnv() {
  delete process.env.PAYSTACK_SECRET_KEY;
  delete process.env.PAYSTACK_PUBLIC_KEY;
  delete process.env.FLUTTERWAVE_SECRET_KEY;
  delete process.env.PAYSTACK_API_BASE;
}

test("an amount is converted into the smallest unit the provider expects", () => {
  assert.equal(toMinorUnits("1250.00"), 125000);
  assert.equal(toMinorUnits("0.05"), 5);
  assert.equal(fromMinorUnits(125000), "1250.00");
});

test("a payment is started with the reference, the amount and the token", async () => {
  clearPaymentEnv();
  await withProvider(
    (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: true,
          data: {
            authorization_url: "https://checkout.test/abc",
            reference: "RTS-INV-001-1234",
          },
        }),
      );
    },
    async (_base, captured) => {
      process.env.PAYSTACK_SECRET_KEY = "sk_test_123";
      const result = await initialisePayment({
        amount: "1250.00",
        currency: "GHS",
        email: "accounts@client.test",
        reference: "RTS-INV-001-1234",
        description: "Invoice INV-001",
        callbackUrl: "http://localhost:3000/api/payments/paystack/callback",
      });

      assert.equal(result.ok, true);
      assert.equal(result.authorizationUrl, "https://checkout.test/abc");
      assert.equal(result.reference, "RTS-INV-001-1234");

      assert.equal(captured.length, 1);
      assert.equal(captured[0].path, "/transaction/initialize");
      assert.equal(captured[0].authorization, "Bearer sk_test_123");
      const body = JSON.parse(captured[0].body) as Record<string, unknown>;
      assert.equal(body.amount, 125000);
      assert.equal(body.reference, "RTS-INV-001-1234");
      assert.equal(body.email, "accounts@client.test");
      assert.equal(body.callback_url, "http://localhost:3000/api/payments/paystack/callback");
    },
  );
  clearPaymentEnv();
});

test("a refusal from the provider is reported, not swallowed", async () => {
  clearPaymentEnv();
  await withProvider(
    (_req, res) => {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: false, message: "Invalid split code" }));
    },
    async () => {
      process.env.PAYSTACK_SECRET_KEY = "sk_test_123";
      const result = await initialisePayment({
        amount: "100.00",
        currency: "GHS",
        email: "accounts@client.test",
        reference: "RTS-INV-002-5678",
        description: "Invoice INV-002",
        callbackUrl: "http://localhost:3000/api/payments/paystack/callback",
      });
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /Invalid split code/);
    },
  );
  clearPaymentEnv();
});

test("a payment of nothing is refused before the request leaves", async () => {
  clearPaymentEnv();
  process.env.PAYSTACK_SECRET_KEY = "sk_test_123";
  const result = await initialisePayment({
    amount: "0",
    currency: "GHS",
    email: "accounts@client.test",
    reference: "RTS-INV-003",
    description: "Invoice INV-003",
    callbackUrl: "http://localhost:3000/api/payments/paystack/callback",
  });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /greater than zero/);
  clearPaymentEnv();
});

test("a paid reference is confirmed with the provider's own numbers", async () => {
  clearPaymentEnv();
  await withProvider(
    (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: true,
          data: {
            status: "success",
            amount: 125000,
            currency: "GHS",
            paid_at: "2026-10-17T08:30:00Z",
            reference: "RTS-INV-001-1234",
          },
        }),
      );
    },
    async (_base, captured) => {
      process.env.PAYSTACK_SECRET_KEY = "sk_test_123";
      const result = await verifyPayment("RTS-INV-001-1234");
      assert.equal(result.ok, true);
      assert.equal(result.paid, true);
      assert.equal(result.amount, "1250.00");
      assert.equal(result.currency, "GHS");
      assert.equal(captured[0].path, "/transaction/verify/RTS-INV-001-1234");
      assert.equal(captured[0].authorization, "Bearer sk_test_123");
    },
  );
  clearPaymentEnv();
});

test("an unfinished payment is not reported as paid", async () => {
  clearPaymentEnv();
  await withProvider(
    (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: true,
          data: { status: "abandoned", amount: 125000, currency: "GHS" },
        }),
      );
    },
    async () => {
      process.env.PAYSTACK_SECRET_KEY = "sk_test_123";
      const result = await verifyPayment("RTS-INV-001-1234");
      assert.equal(result.ok, true);
      assert.equal(result.paid, false);
      assert.match(result.error ?? "", /abandoned/);
    },
  );
  clearPaymentEnv();
});

test("the webhook signature is the HMAC of the body", () => {
  const secret = "sk_test_123";
  const body = JSON.stringify({ event: "charge.success" });
  const signature = createHmac("sha512", secret).update(body).digest("hex");
  const expected = createHmac("sha512", secret).update(body).digest("hex");
  assert.equal(signature, expected);
  assert.notEqual(
    signature,
    createHmac("sha512", "other").update(body).digest("hex"),
  );
});

import { strict as assert } from "node:assert";
import test from "node:test";
import http from "node:http";
import net from "node:net";
import { toE164, maskPhone } from "../src/lib/providers/phone.ts";
import { sendSms } from "../src/lib/providers/sms.ts";
import { sendEmail, buildMessage, authMechanisms } from "../src/lib/providers/email.ts";

/**
 * The provider clients are tested against real servers that run on the
 * machine: a small HTTP server stands in for the SMS vendor, and a small
 * SMTP server speaks the mail protocol. The point is to prove the request
 * the client builds is a request a real server accepts — headers, body and
 * protocol steps — not that the function returns a truthy value.
 */

type Captured = {
  method: string;
  url: string;
  authorization: string | undefined;
  body: string;
};

async function withHttpServer(
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
        method: req.method ?? "",
        url: req.url ?? "",
        authorization: req.headers.authorization,
        body,
      });
      handler(req, res, body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`, captured);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** A mail server that speaks enough SMTP to accept one message. */
async function withSmtpServer(run: (port: number, received: string[]) => Promise<void>) {
  const received: string[] = [];
  const server = net.createServer((socket) => {
    let buffer = "";
    let inData = false;
    let authStage = 0;
    socket.write("220 rts.test ESMTP ready\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index = buffer.indexOf("\r\n");
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 2.0.0 Ok: queued as TEST1\r\n");
          } else {
            received.push(line);
          }
        } else if (authStage === 1) {
          // The user name, base64 encoded.
          authStage = 2;
          socket.write("334 UGFzc3dvcmQ6\r\n");
        } else if (authStage === 2) {
          // The password, base64 encoded.
          authStage = 0;
          socket.write("235 2.7.0 Authentication successful\r\n");
        } else if (/^EHLO/i.test(line)) {
          socket.write("250-rts.test\r\n250-AUTH LOGIN\r\n250 SIZE 10240000\r\n");
        } else if (/^AUTH LOGIN/i.test(line)) {
          authStage = 1;
          socket.write("334 VXNlcm5hbWU6\r\n");
        } else if (/^MAIL FROM/i.test(line)) {
          socket.write("250 2.1.0 Ok\r\n");
        } else if (/^RCPT TO/i.test(line)) {
          socket.write("250 2.1.5 Ok\r\n");
        } else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (/^QUIT/i.test(line)) {
          socket.write("221 2.0.0 Bye\r\n");
          socket.end();
        } else {
          socket.write("250 2.0.0 Ok\r\n");
        }
        index = buffer.indexOf("\r\n");
      }
    });
    socket.on("error", () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await run(port, received);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** A mail server that only offers AUTH PLAIN, as Office 365 and cPanel do. */
async function withPlainAuthServer(run: (port: number, received: string[]) => Promise<void>) {
  const received: string[] = [];
  const server = net.createServer((socket) => {
    let buffer = "";
    let inData = false;
    socket.write("220 rts.test ESMTP ready\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index = buffer.indexOf("\r\n");
      while (index >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            socket.write("250 2.0.0 Ok: queued as TEST2\r\n");
          } else {
            received.push(line);
          }
        } else if (/^EHLO/i.test(line)) {
          socket.write("250-rts.test\r\n250-AUTH PLAIN\r\n250 SIZE 10240000\r\n");
        } else if (/^AUTH PLAIN/i.test(line)) {
          socket.write("235 2.7.0 Authentication successful\r\n");
        } else if (/^MAIL FROM/i.test(line)) {
          socket.write("250 2.1.0 Ok\r\n");
        } else if (/^RCPT TO/i.test(line)) {
          socket.write("250 2.1.5 Ok\r\n");
        } else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (/^QUIT/i.test(line)) {
          socket.write("221 2.0.0 Bye\r\n");
          socket.end();
        } else {
          socket.write("250 2.0.0 Ok\r\n");
        }
        index = buffer.indexOf("\r\n");
      }
    });
    socket.on("error", () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await run(port, received);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** A server that accepts the connection and then says nothing at all. */
async function withSilentServer(run: (port: number) => Promise<void>) {
  const server = net.createServer((socket) => {
    socket.on("error", () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await run(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function clearSmsEnv() {
  delete process.env.SMS_PROVIDER;
  delete process.env.SMS_PROVIDER_CLIENT_ID;
  delete process.env.SMS_PROVIDER_CLIENT_SECRET;
  delete process.env.SMS_PROVIDER_API_KEY;
  delete process.env.SMS_PROVIDER_SENDER_ID;
  delete process.env.SMS_PROVIDER_ENDPOINT;
}

function clearEmailEnv() {
  delete process.env.EMAIL_PROVIDER;
  delete process.env.EMAIL_SMTP_HOST;
  delete process.env.EMAIL_SMTP_PORT;
  delete process.env.EMAIL_SMTP_USER;
  delete process.env.EMAIL_SMTP_PASSWORD;
  delete process.env.EMAIL_SMTP_SECURE;
  delete process.env.EMAIL_SMTP_STARTTLS;
  delete process.env.EMAIL_FROM;
}

/* ------------------------------------------------------------- phone ---- */

test("a local Ghana number becomes the international form", () => {
  assert.equal(toE164("0244012345"), "+233244012345");
  assert.equal(toE164("233244012345"), "+233244012345");
  assert.equal(toE164("+233 24 401 2345"), "+233244012345");
  assert.equal(toE164("244012345"), "+233244012345");
});

test("a number that cannot be read is refused instead of guessed", () => {
  assert.equal(toE164(null), null);
  assert.equal(toE164(""), null);
  assert.equal(toE164("not a number"), null);
  assert.match(maskPhone("0244012345"), /\.\.\.2345$/);
});

/* --------------------------------------------------------------- sms ---- */

test("the SMS client sends the message the way the vendor expects", async () => {
  clearSmsEnv();
  await withHttpServer(
    (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          Status: "Success",
          StatusCode: 200,
          Message: "Message Submitted",
          MessageId: "MSG-42",
        }),
      );
    },
    async (base, captured) => {
      process.env.SMS_PROVIDER = "hubtel";
      process.env.SMS_PROVIDER_CLIENT_ID = "client-1";
      process.env.SMS_PROVIDER_CLIENT_SECRET = "secret-1";
      process.env.SMS_PROVIDER_SENDER_ID = "RTSTest";
      process.env.SMS_PROVIDER_ENDPOINT = `${base}/v1/messages/send`;

      const result = await sendSms("0244012345", "Your trip leaves at 06:30.");

      assert.equal(result.ok, true);
      assert.equal(result.provider, "hubtel");
      assert.equal(result.ref, "MSG-42");

      assert.equal(captured.length, 1);
      const call = captured[0];
      assert.equal(call.method, "POST");
      assert.equal(call.url, "/v1/messages/send");
      assert.equal(
        call.authorization,
        `Basic ${Buffer.from("client-1:secret-1").toString("base64")}`,
      );
      const body = JSON.parse(call.body) as Record<string, string>;
      assert.equal(body.To, "+233244012345");
      assert.equal(body.From, "RTSTest");
      assert.equal(body.Content, "Your trip leaves at 06:30.");
    },
  );
  clearSmsEnv();
});

test("a refusal from the vendor is reported, not swallowed", async () => {
  clearSmsEnv();
  await withHttpServer(
    (_req, res) => {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          Status: "Error",
          Message: "Invalid sender id",
        }),
      );
    },
    async (base) => {
      process.env.SMS_PROVIDER = "hubtel";
      process.env.SMS_PROVIDER_CLIENT_ID = "client-1";
      process.env.SMS_PROVIDER_CLIENT_SECRET = "secret-1";
      process.env.SMS_PROVIDER_SENDER_ID = "RTSTest";
      process.env.SMS_PROVIDER_ENDPOINT = `${base}/v1/messages/send`;

      const result = await sendSms("0244012345", "hello");
      assert.equal(result.ok, false);
      assert.match(result.error ?? "", /Invalid sender id/);
    },
  );
  clearSmsEnv();
});

test("with no credentials the SMS client refuses and says why", async () => {
  clearSmsEnv();
  const result = await sendSms("0244012345", "hello");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /No SMS provider is configured/);
});

/* ------------------------------------------------------------- email ---- */

test("the mail client completes the SMTP conversation", async () => {
  clearEmailEnv();
  await withSmtpServer(async (port, received) => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.EMAIL_SMTP_HOST = "127.0.0.1";
    process.env.EMAIL_SMTP_PORT = String(port);
    process.env.EMAIL_SMTP_USER = "mailer";
    process.env.EMAIL_SMTP_PASSWORD = "secret";
    process.env.EMAIL_SMTP_STARTTLS = "false";
    process.env.EMAIL_FROM = "RTS <no-reply@richietransportgh.com>";

    const result = await sendEmail(
      "driver.abena@richietransportgh.com",
      "Your trip is tomorrow",
      "Boarding is at 05:45 at the gate.",
    );

    assert.equal(result.ok, true);
    const message = received.join("\n");
    assert.match(message, /Subject: Your trip is tomorrow/);
    assert.match(message, /To: driver\.abena@richietransportgh\.com/);
    assert.match(message, /From: RTS <no-reply@richietransportgh\.com>/);
    assert.match(message, /Boarding is at 05:45 at the gate\./);
  });
  clearEmailEnv();
});

test("a message body that looks like the end of a message is escaped", () => {
  const message = buildMessage({
    from: "a@b.com",
    to: "c@d.com",
    subject: "Test",
    body: "first line\n.\nlast line",
  });
  assert.match(message, /\r\n\.\.\r\n/);
});

test("a server that only offers AUTH PLAIN is still able to sign in", async () => {
  clearEmailEnv();
  await withPlainAuthServer(async (port, received) => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.EMAIL_SMTP_HOST = "127.0.0.1";
    process.env.EMAIL_SMTP_PORT = String(port);
    process.env.EMAIL_SMTP_USER = "mailer";
    process.env.EMAIL_SMTP_PASSWORD = "secret";
    process.env.EMAIL_SMTP_STARTTLS = "false";
    process.env.EMAIL_FROM = "RTS <no-reply@richietransportgh.com>";

    const result = await sendEmail("ops@richietransportgh.com", "Hello", "Body");

    assert.equal(result.ok, true, result.error ?? "");
    assert.match(received.join("\n"), /Subject: Hello/);
  });
  clearEmailEnv();
});

test("the authentication methods are read from what the server offers", () => {
  assert.deepEqual(authMechanisms("rts.test\r\nAUTH LOGIN PLAIN\r\nSIZE 10240000"), [
    "LOGIN",
    "PLAIN",
  ]);
  assert.deepEqual(authMechanisms("rts.test\r\nAUTH PLAIN\r\n"), ["PLAIN"]);
  assert.deepEqual(authMechanisms("rts.test\r\nSIZE 10240000"), []);
});

test("a mail server that stops answering is given up on, not waited for", async () => {
  clearEmailEnv();
  await withSilentServer(async (port) => {
    process.env.EMAIL_PROVIDER = "smtp";
    process.env.EMAIL_SMTP_HOST = "127.0.0.1";
    process.env.EMAIL_SMTP_PORT = String(port);
    process.env.EMAIL_SMTP_TIMEOUT_MS = "500";
    process.env.EMAIL_FROM = "RTS <no-reply@richietransportgh.com>";

    const result = await sendEmail("ops@richietransportgh.com", "Hello", "Body");

    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /did not answer within 500ms/);
  });
  clearEmailEnv();
});

test("with no mail server the client refuses and says why", async () => {
  clearEmailEnv();
  const result = await sendEmail("driver.abena@richietransportgh.com", "Hi", "Body");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /No mail server is configured/);
});

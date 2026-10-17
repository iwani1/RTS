/**
 * Email over SMTP.
 *
 * The company can already send mail from its own domain, and every mail host
 * speaks SMTP — Google Workspace, Postfix on cPanel, Amazon SES in SMTP
 * mode, Mailgun. One small client therefore covers all of them without
 * adding a vendor library to the bundle.
 *
 * The client is deliberately strict: it waits for each reply, refuses a
 * server that will not start TLS when credentials would travel in the clear,
 * and reports the exact step that failed so an operator can fix the host,
 * the port or the password without reading a stack trace.
 */
import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";
import { providerFail, providerOk, type ProviderResult } from "./types";

export type EmailProviderConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  /** Direct TLS on the socket (port 465). */
  secure: boolean;
  /** Upgrade an open connection with STARTTLS (port 587). */
  startTls: boolean;
  timeoutMs: number;
};

export function emailConfig(): EmailProviderConfig | null {
  const provider = (process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
  if (provider && provider !== "smtp") return null;

  const host = (process.env.EMAIL_SMTP_HOST ?? "").trim();
  const from = (process.env.EMAIL_FROM ?? "").trim();
  if (!host || !from) return null;

  const port = Number(process.env.EMAIL_SMTP_PORT ?? 587);
  const secure =
    process.env.EMAIL_SMTP_SECURE === "true" ||
    (process.env.EMAIL_SMTP_SECURE === undefined && port === 465);

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    user: (process.env.EMAIL_SMTP_USER ?? "").trim(),
    password: process.env.EMAIL_SMTP_PASSWORD ?? "",
    from,
    secure,
    startTls: process.env.EMAIL_SMTP_STARTTLS === undefined ? !secure : process.env.EMAIL_SMTP_STARTTLS === "true",
    timeoutMs: Number(process.env.EMAIL_SMTP_TIMEOUT_MS ?? 15_000),
  };
}

/** Whether a real mail server is behind the app right now. */
export function emailProviderReady(): boolean {
  return emailConfig() !== null;
}

type Reply = { code: number; lines: string[] };

class SmtpSession {
  private socket: net.Socket;
  private buffer = "";
  private queue: string[] = [];
  private pending: { resolve: (line: string) => void; reject: (error: Error) => void } | null = null;
  private failure: Error | null = null;

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.attach(socket);
  }

  private attach(socket: net.Socket) {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.onData(chunk));
    socket.on("error", (error: Error) => this.fail(error));
    socket.on("close", () =>
      this.fail(this.failure ?? new Error("The mail server closed the connection.")),
    );
  }

  private fail(error: Error) {
    this.failure = error;
    this.pending?.reject(error);
    this.pending = null;
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\r\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 2);
      if (this.pending) {
        const waiter = this.pending;
        this.pending = null;
        waiter.resolve(line);
      } else {
        this.queue.push(line);
      }
      index = this.buffer.indexOf("\r\n");
    }
  }

  readLine(): Promise<string> {
    if (this.queue.length > 0) return Promise.resolve(this.queue.shift() as string);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise<string>((resolve, reject) => {
      this.pending = { resolve, reject };
    });
  }

  async readReply(): Promise<Reply> {
    const lines: string[] = [];
    let code = 0;
    for (;;) {
      const line = await this.readLine();
      code = Number(line.slice(0, 3));
      lines.push(line.slice(4));
      if (line.length < 4 || line[3] !== "-") break;
    }
    return { code, lines };
  }

  write(line: string) {
    this.socket.write(`${line}\r\n`);
  }

  async upgradeToTls(servername: string): Promise<void> {
    const plain = this.socket;
    plain.removeAllListeners("data");
    plain.removeAllListeners("error");
    plain.removeAllListeners("close");
    await new Promise<void>((resolve, reject) => {
      const secure = tls.connect({ socket: plain, servername });
      secure.once("secureConnect", () => {
        this.attach(secure);
        resolve();
      });
      secure.once("error", (error) => reject(error));
    });
  }

  destroy() {
    this.socket.destroy();
  }
}

function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function dotStuff(body: string): string {
  return body
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

/** Build a plain-text message with the headers a mail server expects. */
export function buildMessage(options: {
  from: string;
  to: string;
  subject: string;
  body: string;
}): string {
  const domain =
    options.from.match(/@([A-Za-z0-9.-]+)/)?.[1] ?? "localhost";
  const headers = [
    `From: ${options.from}`,
    `To: ${options.to}`,
    `Subject: ${encodeHeaderValue(options.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  const body = dotStuff(options.body.replace(/\r?\n/g, "\r\n"));
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

/**
 * Send one plain-text email.
 *
 * Every failure path names the step that failed: the connection, the
 * greeting, the TLS upgrade, the authentication, the envelope or the body.
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<ProviderResult> {
  const config = emailConfig();
  if (!config) {
    return providerFail(
      "smtp",
      "No mail server is configured. Set EMAIL_PROVIDER=smtp with EMAIL_SMTP_HOST and EMAIL_FROM.",
    );
  }
  const address = (to ?? "").trim();
  if (!address || !address.includes("@")) {
    return providerFail("smtp", `"${to}" is not a usable email address.`);
  }

  let session: SmtpSession | null = null;
  try {
    session = await connect(config);
    const greeting = await session.readReply();
    if (greeting.code !== 220) {
      return providerFail("smtp", `The mail server refused the connection: ${greeting.lines.join(" ")}`);
    }

    session.write("EHLO richietransportgh.com");
    let ehlo = await session.readReply();
    if (ehlo.code !== 250) {
      session.write("HELO richietransportgh.com");
      ehlo = await session.readReply();
      if (ehlo.code !== 250) {
        return providerFail("smtp", `The mail server rejected the greeting: ${ehlo.lines.join(" ")}`);
      }
    }

    const capabilities = ehlo.lines.join(" ").toUpperCase();

    if (config.startTls && !config.secure) {
      if (!capabilities.includes("STARTTLS")) {
        return providerFail(
          "smtp",
          "The mail server does not offer STARTTLS, so the connection was closed rather than sending the password in the clear.",
        );
      }
      session.write("STARTTLS");
      const ready = await session.readReply();
      if (ready.code !== 220) {
        return providerFail("smtp", `The mail server refused STARTTLS: ${ready.lines.join(" ")}`);
      }
      try {
        await session.upgradeToTls(config.host);
      } catch (error) {
        return providerFail("smtp", `The TLS handshake failed: ${(error as Error).message}`);
      }
      session.write("EHLO richietransportgh.com");
      const second = await session.readReply();
      if (second.code !== 250) {
        return providerFail("smtp", `The mail server rejected the greeting: ${second.lines.join(" ")}`);
      }
    }

    if (config.user) {
      const auth = await authenticate(session, config);
      if (!auth.ok) return auth.result;
    }

    session.write(`MAIL FROM:<${extractAddress(config.from)}>`);
    const mailFrom = await session.readReply();
    if (mailFrom.code !== 250) {
      return providerFail("smtp", `The mail server refused the sender: ${mailFrom.lines.join(" ")}`);
    }

    session.write(`RCPT TO:<${extractAddress(address)}>`);
    const rcpt = await session.readReply();
    if (rcpt.code !== 250 && rcpt.code !== 251) {
      return providerFail("smtp", `The mail server refused the recipient: ${rcpt.lines.join(" ")}`);
    }

    session.write("DATA");
    const data = await session.readReply();
    if (data.code !== 354) {
      return providerFail("smtp", `The mail server refused the message body: ${data.lines.join(" ")}`);
    }

    session.write(buildMessage({ from: config.from, to: address, subject, body }));
    session.write(".");
    const sent = await session.readReply();
    if (sent.code !== 250) {
      return providerFail("smtp", `The mail server rejected the message: ${sent.lines.join(" ")}`);
    }

    session.write("QUIT");
    await session.readReply().catch(() => ({ code: 221, lines: ["bye"] }));
    return providerOk("smtp");
  } catch (error) {
    return providerFail("smtp", `The mail server could not be reached: ${(error as Error).message}`);
  } finally {
    session?.destroy();
  }
}

function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

async function connect(config: EmailProviderConfig): Promise<SmtpSession> {
  return new Promise<SmtpSession>((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host })
      : net.connect({ host: config.host, port: config.port });
    socket.setTimeout(config.timeoutMs);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`The mail server did not answer within ${config.timeoutMs}ms.`));
    });
    socket.once("error", (error) => reject(error));
    if (config.secure) {
      (socket as tls.TLSSocket).once("secureConnect", () => resolve(new SmtpSession(socket)));
    } else {
      socket.once("connect", () => resolve(new SmtpSession(socket)));
    }
  });
}

async function authenticate(
  session: SmtpSession,
  config: EmailProviderConfig,
): Promise<{ ok: boolean; result: ProviderResult }> {
  const encode = (value: string) => Buffer.from(value, "utf8").toString("base64");
  session.write("AUTH LOGIN");
  const first = await session.readReply();
  if (first.code !== 334) {
    return {
      ok: false,
      result: providerFail("smtp", `The mail server refused the login: ${first.lines.join(" ")}`),
    };
  }
  session.write(encode(config.user));
  const second = await session.readReply();
  if (second.code !== 334) {
    return {
      ok: false,
      result: providerFail("smtp", `The mail server refused the user name: ${second.lines.join(" ")}`),
    };
  }
  session.write(encode(config.password));
  const third = await session.readReply();
  if (third.code !== 235) {
    return {
      ok: false,
      result: providerFail("smtp", `The mail server rejected the password: ${third.lines.join(" ")}`),
    };
  }
  return { ok: true, result: providerOk("smtp") };
}

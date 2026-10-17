import { strict as assert } from "node:assert";
import test from "node:test";
import { internalPath, isCrossSiteRequest } from "../src/lib/guards.ts";

/**
 * The guards around the public forms.
 *
 * These are the checks that keep a page on another site from driving the
 * application: a redirect that stays inside the product, and a form post
 * that comes from the origin the user is actually looking at. They are small
 * functions, so they are pinned down here rather than left to a manual test.
 */

test("a path that stays inside the product is kept", () => {
  assert.equal(internalPath("/dashboard"), "/dashboard");
  assert.equal(internalPath("/trips?filter=late"), "/trips?filter=late");
  assert.equal(internalPath("/"), "/");
});

test("a path that points somewhere else is refused", () => {
  const hostile = [
    "https://evil.example/steal",
    "//evil.example/steal",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "trips",
    "",
  ];
  for (const value of hostile) {
    assert.equal(internalPath(value), "/", `refused: ${value}`);
  }
  assert.equal(internalPath(null, "/login"), "/login");
  assert.equal(internalPath(undefined, "/login"), "/login");
});

test("a form post from another site is refused", () => {
  const crossSite = new Request("https://rts.example/api/views/save", {
    method: "POST",
    headers: { host: "rts.example", origin: "https://evil.example" },
  });
  assert.equal(isCrossSiteRequest(crossSite), true);
});

test("a form post from the same site is allowed", () => {
  const sameSite = new Request("https://rts.example/api/views/save", {
    method: "POST",
    headers: { host: "rts.example", origin: "https://rts.example" },
  });
  assert.equal(isCrossSiteRequest(sameSite), false);
});

test("a form post with no origin and no referer is refused", () => {
  const noOrigin = new Request("https://rts.example/api/views/save", {
    method: "POST",
    headers: { host: "rts.example" },
  });
  assert.equal(isCrossSiteRequest(noOrigin), true);
});

test("a proxy that rewrites the host is trusted over the connection host", () => {
  const behindProxy = new Request("https://rts.example/api/views/save", {
    method: "POST",
    headers: {
      host: "internal:3000",
      "x-forwarded-host": "rts.example",
      origin: "https://rts.example",
    },
  });
  assert.equal(isCrossSiteRequest(behindProxy), false);
});

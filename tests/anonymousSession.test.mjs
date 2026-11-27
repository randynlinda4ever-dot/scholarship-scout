import test from "node:test";
import assert from "node:assert/strict";
import { ensureAnonymousUser } from "../src/lib/anonymousSession.js";

test("reuses an existing browser Supabase session without creating another user", async () => {
  const existingUser = { id: "existing-session-user", is_anonymous: true };
  let signInCalls = 0;
  const auth = {
    async getSession() { return { data: { session: { user: existingUser } }, error: null }; },
    async signInAnonymously() { signInCalls += 1; return { data: { user: { id: "unexpected" } }, error: null }; },
  };

  const user = await ensureAnonymousUser(auth);

  assert.equal(user, existingUser);
  assert.equal(signInCalls, 0);
});

test("creates one anonymous user when no browser session exists", async () => {
  const anonymousUser = { id: "new-anonymous-user", is_anonymous: true };
  let signInCalls = 0;
  const auth = {
    async getSession() { return { data: { session: null }, error: null }; },
    async signInAnonymously() {
      signInCalls += 1;
      return { data: { user: anonymousUser }, error: null };
    },
  };

  const user = await ensureAnonymousUser(auth);

  assert.equal(user, anonymousUser);
  assert.equal(signInCalls, 1);
});

test("does not create another identity when checking the current session fails", async () => {
  let signInCalls = 0;
  const auth = {
    async getSession() { return { data: { session: null }, error: new Error("network unavailable") }; },
    async signInAnonymously() { signInCalls += 1; return { data: { user: {} }, error: null }; },
  };

  await assert.rejects(
    ensureAnonymousUser(auth),
    /existing cloud session|connection/i,
  );
  assert.equal(signInCalls, 0);
});

test("reports when anonymous sign-in is disabled or blocked by project configuration", async () => {
  const auth = {
    async getSession() { return { data: { session: null }, error: null }; },
    async signInAnonymously() {
      return { data: { user: null }, error: new Error("Anonymous provider is disabled") };
    },
  };

  await assert.rejects(
    ensureAnonymousUser(auth),
    /Anonymous Sign-Ins|anonymous access/i,
  );
});

test("requires both Supabase auth methods instead of failing with an obscure TypeError", async () => {
  await assert.rejects(
    ensureAnonymousUser({ getSession: async () => ({ data: { session: null }, error: null }) }),
    /Supabase auth client/i,
  );
});

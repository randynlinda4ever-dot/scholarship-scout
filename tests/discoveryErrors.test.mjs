import test from "node:test";
import assert from "node:assert/strict";
import { getDiscoveryErrorMessage } from "../src/lib/discoveryErrors.js";

test("shows the server retry window for a numeric 429 Retry-After value", () => {
  assert.equal(
    getDiscoveryErrorMessage({ status: 429, retryAfter: "45" }),
    "Live scholarship search is temporarily rate-limited. Try again in about 45 seconds.",
  );
});

test("clamps malformedly large retry windows and ignores untrusted retry text", () => {
  assert.equal(
    getDiscoveryErrorMessage({ status: 429, retryAfter: "999999" }),
    "Live scholarship search is temporarily rate-limited. Try again in about 86400 seconds.",
  );
  assert.equal(getDiscoveryErrorMessage({ status: 429, retryAfter: "wait 45 seconds" }),
    "Live scholarship search could not be completed. Check your connection and try again.");
});

test("uses the generic message for other failures", () => {
  assert.equal(getDiscoveryErrorMessage({ status: 503, retryAfter: "30" }),
    "Live scholarship search could not be completed. Check your connection and try again.");
  assert.equal(getDiscoveryErrorMessage(null),
    "Live scholarship search could not be completed. Check your connection and try again.");
});

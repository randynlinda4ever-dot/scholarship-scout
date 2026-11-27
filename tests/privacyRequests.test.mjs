import test from "node:test";
import assert from "node:assert/strict";
import {
  PRIVACY_REQUEST_RECIPIENT,
  PRIVACY_REQUEST_TYPES,
  buildPrivacyRequestMailto,
} from "../src/lib/privacyRequests.js";

test("privacy request email is addressed to the published support contact", () => {
  const url = buildPrivacyRequestMailto({
    requestType: "access",
    details: "Please provide a copy of the information associated with my account.",
    contactEmail: "student@example.com",
  });
  const [recipient, query] = url.slice("mailto:".length).split("?");
  const params = new URLSearchParams(query);
  assert.equal(recipient, PRIVACY_REQUEST_RECIPIENT);
  assert.equal(recipient, "levi.haidar@outlook.com");
  assert.match(params.get("subject"), /privacy request/i);
  assert.match(params.get("body"), /copy of the information/i);
  assert.match(params.get("body"), /student@example.com/);
});

test("privacy request form supports only its published request categories", () => {
  const allowed = new Set(PRIVACY_REQUEST_TYPES.map((item) => item.value));
  assert.ok(allowed.has("access"));
  assert.ok(allowed.has("correction"));
  assert.ok(allowed.has("deletion"));
  assert.ok(allowed.has("appeal"));
  assert.throws(() => buildPrivacyRequestMailto({
    requestType: "admin-export",
    details: "Please export everything.",
  }), /request type/i);
});

test("privacy request details are bounded and sensitive credentials are not appended by the form", () => {
  const url = buildPrivacyRequestMailto({
    requestType: "other",
    details: "x".repeat(5000),
    contactEmail: "student@example.com",
  });
  const body = new URLSearchParams(url.split("?")[1]).get("body");
  assert.ok(body.length < 3500);
  assert.match(body, /do not include passwords/i);
  assert.match(body, /unnecessary student records/i);
});

test("privacy request composer clearly marks that the visitor must send the email", () => {
  const url = buildPrivacyRequestMailto({
    requestType: "appeal",
    details: "I am appealing a prior response.",
    contactEmail: "student@example.com",
    previousRequestReference: "SC-PR-2026-001",
  });
  const body = new URLSearchParams(url.split("?")[1]).get("body");
  assert.match(body, /not submitted until you send this email/i);
});

test("privacy request includes who is submitting the request and requires a reply address", () => {
  const url = buildPrivacyRequestMailto({
    requestType: "deletion",
    requesterType: "parent_guardian",
    details: "Please delete the information associated with my child's account.",
    contactEmail: "guardian@example.com",
  });
  const params = new URLSearchParams(url.split("?")[1]);
  assert.match(params.get("body"), /parent or legal guardian/i);
  assert.match(params.get("body"), /guardian@example.com/);
  assert.throws(() => buildPrivacyRequestMailto({
    requestType: "access",
    details: "Please provide the information associated with my account.",
  }), /reply email/i);
});

test("privacy appeals require a reference to the earlier request", () => {
  assert.throws(() => buildPrivacyRequestMailto({
    requestType: "appeal",
    details: "I am appealing the decision on my previous privacy request.",
    contactEmail: "student@example.com",
  }), /previous request reference/i);

  const url = buildPrivacyRequestMailto({
    requestType: "appeal",
    details: "I am appealing the decision on my previous privacy request.",
    contactEmail: "student@example.com",
    previousRequestReference: "SC-PR-2026-001",
  });
  const body = new URLSearchParams(url.split("?")[1]).get("body");
  assert.match(body, /SC-PR-2026-001/);
  assert.match(new URLSearchParams(url.split("?")[1]).get("subject"), /privacy appeal/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createCloudScholarshipId } from "../src/lib/cloudRecordId.js";

globalThis.crypto ??= webcrypto;

test("cloud award IDs are deterministic per owner and normalized award identity", async () => {
  const payload = {
    official_url: "https://example.org/scholarships",
    title: "  STEM  Scholarship ",
    sponsor: "Example Foundation",
    deadline: "2027-05-01",
  };
  const first = await createCloudScholarshipId("user-a", payload);
  const repeated = await createCloudScholarshipId("user-a", { ...payload, title: "stem scholarship" });
  const otherUser = await createCloudScholarshipId("user-b", payload);
  const otherYear = await createCloudScholarshipId("user-a", { ...payload, deadline: "2028-05-01" });
  assert.equal(first, repeated);
  assert.notEqual(first, otherUser);
  assert.notEqual(first, otherYear);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

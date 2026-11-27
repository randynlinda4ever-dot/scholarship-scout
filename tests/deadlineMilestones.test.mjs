import test from "node:test";
import assert from "node:assert/strict";
import { getDeadlineMilestones } from "../src/lib/trackerInsights.js";
import { buildCloudScholarshipRow, mapCloudScholarship } from "../src/lib/cloudMapping.js";
import { invalidateSourceReviewIfChanged } from "../src/lib/sourceReview.js";

test("keeps priority and final deadlines as separate milestones", () => {
  const milestones = getDeadlineMilestones({
    priorityDeadline: "2027-02-01",
    priorityDeadlineText: "Priority applications due February 1, 2027",
    priorityDeadlineTimezone: "America/Chicago",
    deadline: "2027-04-15",
    deadlineText: "Final applications due April 15, 2027",
    deadlineTimezone: "America/New_York",
  });

  assert.deepEqual(milestones, [
    {
      key: "priority",
      label: "Priority deadline",
      deadline: "2027-02-01",
      deadlineText: "Priority applications due February 1, 2027",
      deadlineTime: "",
      timeZone: "America/Chicago",
    },
    {
      key: "final",
      label: "Final deadline",
      deadline: "2027-04-15",
      deadlineText: "Final applications due April 15, 2027",
      deadlineTime: "",
      timeZone: "America/New_York",
    },
  ]);
});

test("treats the legacy deadline field as the final milestone only", () => {
  assert.deepEqual(getDeadlineMilestones({
    deadline: "2027-05-01",
    deadlineText: "May 1, 2027",
  }), [{
    key: "final",
    label: "Final deadline",
    deadline: "2027-05-01",
    deadlineText: "May 1, 2027",
    deadlineTime: "",
    timeZone: "",
  }]);
});

test("does not infer a priority date when only a final deadline is known", () => {
  const milestones = getDeadlineMilestones({ deadline: "2027-05-01" });
  assert.equal(milestones.length, 1);
  assert.equal(milestones[0].key, "final");
  assert.equal(milestones.some((milestone) => milestone.key === "priority"), false);
});

test("round-trips the priority milestone independently from the final deadline in cloud metadata", () => {
  const row = buildCloudScholarshipRow({
    name: "Synthetic Two-Milestone Award",
    provider: "Synthetic Foundation",
    sourceUrl: "https://example.org/award",
    deadline: "2027-04-15",
    deadlineText: "Final applications due April 15, 2027",
    deadlineTimezone: "America/New_York",
    priorityDeadline: "2027-02-01",
    priorityDeadlineText: "Priority applications due February 1, 2027",
    priorityDeadlineTimezone: "America/Chicago",
  }, "synthetic-owner");

  const reloaded = mapCloudScholarship({ ...row, id: "synthetic-two-milestone" });
  assert.equal(reloaded.deadline, "2027-04-15");
  assert.equal(reloaded.priority_deadline, "2027-02-01");
  assert.equal(reloaded.priority_deadline_text, "Priority applications due February 1, 2027");
  assert.equal(reloaded.priority_deadline_timezone, "America/Chicago");
});

test("invalidates source review when the priority milestone changes", () => {
  const previous = {
    name: "Synthetic Award",
    provider: "Synthetic Foundation",
    deadline: "2027-04-15",
    priorityDeadline: "2027-02-01",
    sourceUrl: "https://example.org/award",
    sourceVerified: true,
    lastCheckedDate: "2026-11-20",
  };
  const updated = invalidateSourceReviewIfChanged(previous, {
    ...previous,
    priorityDeadline: "2027-02-15",
  });

  assert.equal(updated.sourceVerified, false);
  assert.equal(updated.lastCheckedDate, "");
});
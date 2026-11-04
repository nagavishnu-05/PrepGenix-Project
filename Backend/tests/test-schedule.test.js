"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { testAvailability, assignedBatchHistory, wasBatchPreviouslyAssigned } = require("../src/routes/tests");

test("tests are unavailable before their scheduled start", () => {
  assert.equal(
    testAvailability(
      { startsAt: new Date("2026-10-25T10:00:00Z"), endsAt: new Date("2026-10-25T11:00:00Z") },
      new Date("2026-10-25T09:59:59Z")
    ),
    "upcoming"
  );
});

test("tests are available inside the scheduled window only", () => {
  const schedule = {
    startsAt: new Date("2026-10-25T10:00:00Z"),
    endsAt: new Date("2026-10-25T11:00:00Z"),
  };
  assert.equal(testAvailability(schedule, new Date("2026-10-25T10:00:00Z")), "available");
  assert.equal(testAvailability(schedule, new Date("2026-10-25T10:59:59Z")), "available");
  assert.equal(testAvailability(schedule, new Date("2026-10-25T11:00:00Z")), "ended");
});

test("legacy tests without a schedule remain available", () => {
  assert.equal(testAvailability({}, new Date("2026-10-25T10:00:00Z")), "available");
});

test("batch assignment history includes the active batch and removes duplicates", () => {
  assert.deepEqual(
    assignedBatchHistory({ assignedBatch: "Batch C", assignedBatches: ["Batch A", "Batch C", "Batch A"] }),
    ["Batch A", "Batch C"]
  );
  assert.deepEqual(assignedBatchHistory({ assignedBatch: "Legacy Batch" }), ["Legacy Batch"]);
});

test("a previously assigned batch cannot be selected again", () => {
  const test = { assignedBatch: "Batch B", assignedBatches: ["Batch A", "Batch B"] };
  assert.equal(wasBatchPreviouslyAssigned(test, "Batch A"), true);
  assert.equal(wasBatchPreviouslyAssigned(test, "Batch B"), true);
  assert.equal(wasBatchPreviouslyAssigned(test, "Batch C"), false);
});

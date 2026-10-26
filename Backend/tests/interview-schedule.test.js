"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { interviewAvailability, interviewWindowError } = require("../src/routes/interviews");

const window = {
  startsAt: new Date("2026-10-25T10:00:00Z"),
  endsAt: new Date("2026-10-25T11:00:00Z"),
};

test("interviews are unavailable before their start time", () => {
  assert.equal(interviewAvailability(window, new Date("2026-10-25T09:59:59Z")), "upcoming");
  assert.match(interviewWindowError(window, new Date("2026-10-25T09:59:59Z")), /available from/);
});

test("interviews are available from the start until the exclusive end time", () => {
  assert.equal(interviewAvailability(window, new Date("2026-10-25T10:00:00Z")), "available");
  assert.equal(interviewAvailability(window, new Date("2026-10-25T10:59:59Z")), "available");
  assert.equal(interviewAvailability(window, new Date("2026-10-25T11:00:00Z")), "ended");
  assert.match(interviewWindowError(window, new Date("2026-10-25T11:00:00Z")), /availability ended/);
});

test("legacy interviews use scheduledAt as the start and remain open without an end time", () => {
  const legacy = { scheduledAt: new Date("2026-10-25T10:00:00Z") };
  assert.equal(interviewAvailability(legacy, new Date("2026-10-25T09:00:00Z")), "upcoming");
  assert.equal(interviewAvailability(legacy, new Date("2026-10-25T10:00:00Z")), "available");
  assert.equal(interviewWindowError(legacy, new Date("2026-10-25T10:00:00Z")), null);
});

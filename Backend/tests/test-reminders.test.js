"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isReminderDue } = require("../src/lib/scheduled-reminders");
const { isStudentAssignedToTest, assignedRegistrationNumbers } = require("../src/lib/assignment-scope");
const { isAuthorizedCronRequest } = require("../src/lib/cron-auth");

const now = new Date("2026-11-04T10:00:00Z");

test("test reminders become due within the ten minutes before the start", () => {
  assert.equal(isReminderDue({ emailReminderEnabled: true, startsAt: new Date(now.getTime() + 10 * 60 * 1000) }, now), true);
  assert.equal(isReminderDue({ emailReminderEnabled: true, startsAt: new Date(now.getTime() + 5 * 60 * 1000) }, now), true);
});

test("test reminders are not due when disabled, after the start, or more than ten minutes early", () => {
  assert.equal(isReminderDue({ emailReminderEnabled: false, startsAt: new Date(now.getTime() + 5 * 60 * 1000) }, now), false);
  assert.equal(isReminderDue({ emailReminderEnabled: true, startsAt: new Date(now.getTime() + 10 * 60 * 1000 + 1) }, now), false);
  assert.equal(isReminderDue({ emailReminderEnabled: true, startsAt: new Date(now.getTime() - 1) }, now), false);
});

test("interview reminders use the same ten-minute window", () => {
  assert.equal(isReminderDue({
    emailReminderEnabled: true,
    startsAt: new Date(now.getTime() + 10 * 60 * 1000),
  }, now), true);
});

test("individual test assignments limit access and report audiences to selected registrations", () => {
  const test = { assignmentMode: "students", assignedStudents: ["A001", "A003"] };
  const students = [
    { regNo: "A001", batch: "2026" },
    { regNo: "A002", batch: "2026" },
    { regNo: "A003", batch: "2025" },
  ];

  assert.equal(isStudentAssignedToTest(test, students[0]), true);
  assert.equal(isStudentAssignedToTest(test, students[1]), false);
  assert.deepEqual([...assignedRegistrationNumbers(test, students)].sort(), ["A001", "A003"]);
});

test("batch assignments remain batch-scoped", () => {
  const test = { assignmentMode: "batch", assignedBatch: "2026" };
  assert.equal(isStudentAssignedToTest(test, { regNo: "A001", batch: "2026" }), true);
  assert.equal(isStudentAssignedToTest(test, { regNo: "A002", batch: "2025" }), false);
});

test("legacy batch tests include only explicitly assigned extra students outside the batch", () => {
  const test = { assignedBatch: "2026", assignedStudents: ["A003"] };
  const students = [
    { regNo: "A001", batch: "2026" },
    { regNo: "A002", batch: "2025" },
    { regNo: "A003", batch: "2025" },
  ];

  assert.deepEqual([...assignedRegistrationNumbers(test, students)].sort(), ["A001", "A003"]);
});

test("cron authorization requires a matching bearer token and configured secret", () => {
  assert.equal(isAuthorizedCronRequest("Bearer secret-value", "secret-value"), true);
  assert.equal(isAuthorizedCronRequest("Bearer wrong-value", "secret-value"), false);
  assert.equal(isAuthorizedCronRequest("secret-value", "secret-value"), false);
  assert.equal(isAuthorizedCronRequest("Bearer secret-value", ""), false);
});

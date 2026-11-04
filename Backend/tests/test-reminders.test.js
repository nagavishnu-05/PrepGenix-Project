"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  createGmailAppsScriptMailer,
  formatScheduledStart,
  isReminderDue,
  reminderEmailContent,
} = require("../src/lib/scheduled-reminders");
const { isStudentAssignedToTest, assignedRegistrationNumbers } = require("../src/lib/assignment-scope");
const { isAuthorizedCronRequest } = require("../src/lib/cron-auth");

const now = new Date("2026-11-04T10:00:00Z");

test("reminder scheduled start is formatted in the configured local timezone", () => {
  assert.equal(
    formatScheduledStart("2026-11-04T12:27:00.000Z", "Asia/Kolkata"),
    "4 Nov 2026, 5:57 pm IST",
  );
});

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

test("reminder email content is branded, includes a clear action, and escapes user input", () => {
  const content = reminderEmailContent({
    kind: "test",
    title: "Aptitude <Round 1>",
    studentName: "A & B",
    startText: "4 Nov 2026, 8:30 PM",
    link: "https://example.com/student/tests?a=1&b=2",
  });

  assert.match(content.subject, /Aptitude <Round 1>/);
  assert.match(content.html, /PrepGenix/);
  assert.match(content.html, /Aptitude &lt;Round 1&gt;/);
  assert.match(content.html, /A &amp; B/);
  assert.match(content.html, /Open your tests/);
  assert.match(content.html, /https:\/\/example\.com\/student\/tests\?a=1&amp;b=2/);
  assert.match(content.text, /Scheduled start: 4 Nov 2026, 8:30 PM/);
});

test("reminder email content shows the actual remaining time with correct singular wording", () => {
  const content = reminderEmailContent({
    kind: "interview",
    title: "Technical Interview",
    studentName: "Student",
    startText: "4 Nov 2026, 8:30 PM",
    link: "https://example.com/student/interviews",
    minutesUntilStart: 1,
  });

  assert.match(content.subject, /starts in 1 minute$/);
  assert.match(content.text, /starts in 1 minute\./);
  assert.match(content.html, /STARTING IN 1 MINUTE/);
  assert.doesNotMatch(content.html, /10 MINUTES/);
});

test("Gmail relay sends reminder fields over HTTPS with its configured token", async () => {
  let request;
  const mailer = createGmailAppsScriptMailer({
    url: "https://script.google.com/macros/s/test/exec",
    token: "relay-secret",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
  });

  await mailer.transport.sendMail({
    to: "student@example.com",
    subject: "Reminder",
    text: "Plain text",
    html: "<p>Reminder</p>",
  });

  assert.equal(request.url, "https://script.google.com/macros/s/test/exec");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), {
    token: "relay-secret",
    to: "student@example.com",
    subject: "Reminder",
    text: "Plain text",
    html: "<p>Reminder</p>",
  });
});

test("Gmail relay reports rejected requests without exposing its token", async () => {
  const mailer = createGmailAppsScriptMailer({
    url: "https://script.google.com/macros/s/test/exec",
    token: "relay-secret",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, error: "Unauthorized." }),
    }),
  });

  await assert.rejects(
    mailer.transport.sendMail({ to: "student@example.com", subject: "Reminder", text: "text", html: "html" }),
    (error) => error.message.includes("Unauthorized.") && !error.message.includes("relay-secret"),
  );
});

test("Gmail Apps Script relay accepts the configured secret and sends the email", () => {
  const script = fs.readFileSync(
    path.join(__dirname, "../scripts/reminder-mailer-apps-script.js"),
    "utf8",
  );
  const sent = [];
  const context = {
    module: { exports: {} },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => "relay-secret" }),
    },
    MailApp: { sendEmail: (message) => sent.push(message) },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content) => ({
        content,
        setMimeType(type) {
          this.mimeType = type;
          return this;
        },
      }),
    },
  };
  vm.runInNewContext(script, context);

  const response = context.module.exports.doPost({
    postData: {
      contents: JSON.stringify({
        token: "relay-secret",
        to: "student@example.com",
        subject: "Reminder",
        text: "Plain text",
        html: "<p>Reminder</p>",
      }),
    },
  });

  assert.deepEqual(JSON.parse(response.content), { ok: true });
  assert.equal(response.mimeType, "application/json");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "student@example.com");
  assert.equal(sent[0].name, "PrepGenix");
});

test("Gmail Apps Script relay rejects unauthorized requests without sending", () => {
  const script = fs.readFileSync(
    path.join(__dirname, "../scripts/reminder-mailer-apps-script.js"),
    "utf8",
  );
  const sent = [];
  const context = {
    module: { exports: {} },
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => "relay-secret" }),
    },
    MailApp: { sendEmail: (message) => sent.push(message) },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content) => ({ content, setMimeType() { return this; } }),
    },
  };
  vm.runInNewContext(script, context);

  const response = context.module.exports.doPost({
    postData: { contents: JSON.stringify({ token: "wrong-secret" }) },
  });

  assert.deepEqual(JSON.parse(response.content), { ok: false, error: "Unauthorized." });
  assert.equal(sent.length, 0);
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

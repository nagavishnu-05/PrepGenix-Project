"use strict";

const nodemailer = require("nodemailer");
const { col } = require("../db");
const { assignedRegistrationNumbers } = require("./assignment-scope");

const REMINDER_LEAD_MS = 10 * 60 * 1000;
const REMINDER_SWEEP_MS = 30 * 1000;
const REMINDER_LEASE_MS = 2 * 60 * 1000;

let transport;

function isReminderDue(item, now = new Date()) {
  const startsAt = item?.startsAt ? new Date(item.startsAt) : null;
  return Boolean(item?.emailReminderEnabled === true
    && startsAt
    && !Number.isNaN(startsAt.getTime())
    && startsAt > now
    && startsAt.getTime() <= now.getTime() + REMINDER_LEAD_MS);
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const from = process.env.SMTP_FROM;
  if (!host || !from) {
    throw new Error("Email reminders are enabled, but SMTP_HOST and SMTP_FROM are not configured.");
  }
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true",
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
      ...(process.env.SMTP_USER && process.env.SMTP_PASS
        ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
        : {}),
    });
  }
  return { transport, from };
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

async function claimReminder(reminders, reminderId, details, now) {
  try {
    await reminders.insertOne({
      _id: reminderId,
      ...details,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  const claimed = await reminders.updateOne(
    {
      _id: reminderId,
      $or: [
        { status: { $in: ["pending", "failed"] }, nextAttemptAt: { $lte: now } },
        { status: "sending", leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: { status: "sending", leaseUntil: new Date(now.getTime() + REMINDER_LEASE_MS), updatedAt: now },
      $inc: { attempts: 1 },
    }
  );
  return claimed.matchedCount === 1;
}

async function deliverReminder({ kind, item, student, start, link, reminders, mailer, now }) {
  const email = String(student.email || "").trim();
  if (!email) return { sent: 0, failed: 0 };

  const id = item._id.toString();
  const isInterview = kind === "interview";
  const reminderId = isInterview ? `interview:${id}:${student.regNo}` : `${id}:${student.regNo}`;
  const label = isInterview ? "interview" : "test";
  const title = String(isInterview
    ? item.interviewName || `${item.type || "Interview"} interview`
    : item.title || "Test").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  const startText = new Date(start).toLocaleString();
  const safeName = escapeHtml(student.name || "student");
  const safeTitle = escapeHtml(title);
  const safeStart = escapeHtml(startText);
  const safeLink = escapeHtml(link);

  if (!await claimReminder(reminders, reminderId, {
    kind,
    testId: isInterview ? undefined : id,
    interviewId: isInterview ? id : undefined,
    studentRegNo: student.regNo,
  }, now)) return { sent: 0, failed: 0 };

  try {
    await mailer.transport.sendMail({
      from: mailer.from,
      to: email,
      subject: `Reminder: ${title} starts in 10 minutes`,
      text: `Hello ${student.name || "student"},\n\nYour ${label} "${title}" starts at ${startText}. Please sign in a few minutes early and be ready to begin.\n\nOpen your ${isInterview ? "interviews" : "tests"}: ${link}`,
      html: `<p>Hello ${safeName},</p><p>Your ${label} <strong>${safeTitle}</strong> starts at ${safeStart}.</p><p>Please sign in a few minutes early and be ready to begin.</p><p><a href="${safeLink}">Open your ${isInterview ? "interviews" : "tests"}</a></p>`,
    });
  } catch (error) {
    const record = await reminders.findOne({ _id: reminderId });
    const retryDelayMs = Math.min(60 * 60 * 1000, 60 * 1000 * (2 ** Math.min((record?.attempts || 1) - 1, 6)));
    await reminders.updateOne(
      { _id: reminderId, status: "sending" },
      {
        $set: {
          status: "failed",
          lastError: String(error.message || error).slice(0, 500),
          nextAttemptAt: new Date(now.getTime() + retryDelayMs),
          updatedAt: new Date(),
        },
        $unset: { leaseUntil: "" },
      }
    );
    console.error(`${label} reminder email failed for ${student.regNo} / ${id}:`, error.message);
    return { sent: 0, failed: 1 };
  }

  await reminders.updateOne(
    { _id: reminderId, status: "sending" },
    { $set: { status: "sent", sentAt: new Date(), updatedAt: new Date() }, $unset: { leaseUntil: "", lastError: "" } }
  );
  return { sent: 1, failed: 0 };
}

async function sendDueReminders(now = new Date()) {
  const dueBy = new Date(now.getTime() + REMINDER_LEAD_MS);
  const [dueTests, dueInterviews] = await Promise.all([
    col("tests").find({
      emailReminderEnabled: true,
      startsAt: { $gt: now, $lte: dueBy },
    }).toArray(),
    col("interviews").find({
      emailReminderEnabled: true,
      startsAt: { $gt: now, $lte: dueBy },
      status: "scheduled",
    }).toArray(),
  ]);
  if (!dueTests.length && !dueInterviews.length) return { sent: 0, failed: 0 };

  const mailer = getTransport();
  const reminders = col("test_email_reminders");
  const frontendUrl = String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
  const totals = { sent: 0, failed: 0 };
  const students = dueTests.length
    ? await col("students").find({}, { projection: { regNo: 1, rollNo: 1, batch: 1 } }).toArray()
    : [];

  for (const test of dueTests) {
    const assignedRegNos = [...assignedRegistrationNumbers(test, students)];
    const recipients = await col("students").find({
      regNo: { $in: assignedRegNos },
      email: { $exists: true, $nin: [null, ""] },
    }).toArray();
    for (const student of recipients) {
      const result = await deliverReminder({
        kind: "test",
        item: test,
        student,
        start: test.startsAt,
        link: `${frontendUrl}/student/tests`,
        reminders,
        mailer,
        now,
      });
      totals.sent += result.sent;
      totals.failed += result.failed;
    }
  }

  for (const interview of dueInterviews) {
    const student = await col("students").findOne({
      regNo: interview.regNo,
      email: { $exists: true, $nin: [null, ""] },
    });
    if (!student) continue;
    const result = await deliverReminder({
      kind: "interview",
      item: interview,
      student,
      start: interview.startsAt || interview.scheduledAt,
      link: `${frontendUrl}/student/interviews`,
      reminders,
      mailer,
      now,
    });
    totals.sent += result.sent;
    totals.failed += result.failed;
  }
  return totals;
}

function startReminderScheduler() {
  const run = () => sendDueReminders().catch((error) => {
    console.error("Email reminder scheduler failed:", error.message);
  });
  run();
  const timer = setInterval(run, REMINDER_SWEEP_MS);
  timer.unref();
  return timer;
}

module.exports = { isReminderDue, sendDueReminders, startReminderScheduler };

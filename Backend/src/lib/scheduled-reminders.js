"use strict";

const { col } = require("../db");
const { assignedRegistrationNumbers } = require("./assignment-scope");

const REMINDER_LEAD_MS = 10 * 60 * 1000;
const REMINDER_SWEEP_MS = 30 * 1000;
const REMINDER_LEASE_MS = 2 * 60 * 1000;

function isReminderDue(item, now = new Date()) {
  const startsAt = item?.startsAt ? new Date(item.startsAt) : null;
  return Boolean(item?.emailReminderEnabled === true
    && startsAt
    && !Number.isNaN(startsAt.getTime())
    && startsAt > now
    && startsAt.getTime() <= now.getTime() + REMINDER_LEAD_MS);
}

function createGmailAppsScriptMailer({ url, token, fetchImpl = globalThis.fetch }) {
  if (!url || !token) {
    throw new Error("Email reminders are enabled, but GMAIL_APPS_SCRIPT_URL and GMAIL_APPS_SCRIPT_TOKEN are not configured.");
  }
  if (!fetchImpl) throw new Error("Email reminders require a Node.js runtime with fetch support.");
  if (new URL(url).protocol !== "https:") {
    throw new Error("GMAIL_APPS_SCRIPT_URL must use HTTPS.");
  }

  return {
    transport: {
      async sendMail({ to, subject, text, html }) {
        const response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, to, subject, text, html }),
          signal: AbortSignal.timeout(20_000),
        });
        let result;
        try {
          result = await response.json();
        } catch {
          throw new Error(`Gmail email relay returned an invalid response (HTTP ${response.status}).`);
        }
        if (!response.ok || result?.ok !== true) {
          const reason = typeof result?.error === "string" ? `: ${result.error}` : "";
          throw new Error(`Gmail email relay failed (HTTP ${response.status})${reason}.`);
        }
      },
    },
  };
}

function getMailer() {
  return createGmailAppsScriptMailer({
    url: process.env.GMAIL_APPS_SCRIPT_URL,
    token: process.env.GMAIL_APPS_SCRIPT_TOKEN,
  });
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

function reminderEmailContent({ kind, title, studentName, startText, link }) {
  const isInterview = kind === "interview";
  const itemLabel = isInterview ? "interview" : "test";
  const destinationLabel = isInterview ? "Open your interviews" : "Open your tests";
  const safeName = escapeHtml(studentName || "student");
  const safeTitle = escapeHtml(title);
  const safeStart = escapeHtml(startText);
  const safeLink = escapeHtml(link);
  const subject = `Reminder: ${title} starts in 10 minutes`;
  const text = [
    `Hello ${studentName || "student"},`,
    "",
    `Your ${itemLabel} "${title}" starts in 10 minutes.`,
    `Scheduled start: ${startText}`,
    "",
    `Please sign in early and make sure you are ready to begin.`,
    `${destinationLabel}: ${link}`,
    "",
    "PrepGenix",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f3f4f8;font-family:Arial,Helvetica,sans-serif;color:#20243a;">
    <div style="display:none;font-size:1px;color:#f3f4f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      Your ${itemLabel} starts in 10 minutes. Sign in now to be ready.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f8;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e6e8ef;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 32px;background-color:#241b48;">
                <p style="margin:0;color:#ffffff;font-size:20px;line-height:28px;font-weight:700;letter-spacing:-0.3px;">PrepGenix</p>
                <p style="margin:5px 0 0;color:#c9c2e8;font-size:12px;line-height:18px;letter-spacing:1.2px;text-transform:uppercase;">Assessment reminder</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 12px;">
                <span style="display:inline-block;padding:6px 10px;background-color:#fff4e8;border-radius:999px;color:#a84b08;font-size:12px;line-height:16px;font-weight:700;">STARTING IN 10 MINUTES</span>
                <h1 style="margin:18px 0 10px;color:#20243a;font-size:25px;line-height:32px;font-weight:700;">It's almost time, ${safeName}.</h1>
                <p style="margin:0;color:#5d6275;font-size:15px;line-height:24px;">Your ${itemLabel} is coming up. Sign in a few minutes early so you’re ready to begin.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f6fc;border:1px solid #e8e4f4;border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px 8px;color:#77728d;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${isInterview ? "Interview" : "Test"}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 20px 16px;color:#292344;font-size:18px;line-height:26px;font-weight:700;">${safeTitle}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 20px;border-top:1px solid #e8e4f4;">
                      <p style="margin:0 0 4px;color:#77728d;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Scheduled start</p>
                      <p style="margin:0;color:#292344;font-size:15px;line-height:22px;font-weight:600;">${safeStart}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#6d4aff" style="border-radius:8px;">
                      <a href="${safeLink}" target="_blank" style="display:inline-block;padding:14px 24px;border:1px solid #6d4aff;border-radius:8px;color:#ffffff;font-size:15px;line-height:20px;font-weight:700;text-decoration:none;">${destinationLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <p style="margin:0;padding:14px 16px;background-color:#f8f9fc;border-radius:8px;color:#64697b;font-size:13px;line-height:20px;">If the button doesn’t work, sign in to PrepGenix and open your scheduled ${itemLabel} from your dashboard.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background-color:#f8f9fc;border-top:1px solid #eceef3;">
                <p style="margin:0;color:#777c8c;font-size:12px;line-height:18px;">This is an automated reminder from PrepGenix. Please do not reply to this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { subject, text, html };
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
  const content = reminderEmailContent({
    kind,
    title,
    studentName: student.name || "student",
    startText,
    link,
  });

  if (!await claimReminder(reminders, reminderId, {
    kind,
    testId: isInterview ? undefined : id,
    interviewId: isInterview ? id : undefined,
    studentRegNo: student.regNo,
  }, now)) return { sent: 0, failed: 0 };

  try {
    await mailer.transport.sendMail({
      to: email,
      subject: content.subject,
      text: content.text,
      html: content.html,
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

  const mailer = getMailer();
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

module.exports = {
  createGmailAppsScriptMailer,
  isReminderDue,
  reminderEmailContent,
  sendDueReminders,
  startReminderScheduler,
};

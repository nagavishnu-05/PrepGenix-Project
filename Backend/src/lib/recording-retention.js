"use strict";

/**
 * Retention for opt-in interview A/V recordings.
 *
 * Recordings are stored in Supabase and referenced by `recordingPath` on the
 * interview document. After INTERVIEW_RECORDING_RETENTION_DAYS (default 30) the
 * object is deleted and the reference removed, so a candidate is never stored
 * indefinitely. Set INTERVIEW_RECORDING_RETENTION_DAYS=0 to keep recordings
 * until deleted manually.
 */

const { col } = require("../db");
const storage = require("./storage");

const RETENTION_DAYS = Number(process.env.INTERVIEW_RECORDING_RETENTION_DAYS ?? 30);
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
let cleanupRunning = false;

async function cleanupExpiredRecordings(now = new Date()) {
  if (cleanupRunning) return { skipped: true, reason: "cleanup already running" };
  if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS <= 0) return { skipped: true, reason: "retention disabled" };
  cleanupRunning = true;
  try {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const bucketPattern = new RegExp(`^${storage.RECORDING_BUCKET.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`);
    const interviews = await col("interviews").find({
      recordingPath: { $regex: bucketPattern },
      recordingUploadedAt: { $lt: cutoff },
    }).project({ recordingPath: 1 }).toArray();

    if (!interviews.length) return { removed: 0, cutoff };

    const paths = interviews.map((interview) => interview.recordingPath);
    try {
      await storage.removePaths(paths);
    } catch (error) {
      console.error("Recording retention: storage delete failed:", error.message);
    }
    await col("interviews").updateMany(
      { _id: { $in: interviews.map((interview) => interview._id) } },
      { $unset: { recordingPath: "", recordingMimeType: "", recordingUploadedAt: "", recordingRetentionDays: "" } }
    );
    return { removed: interviews.length, cutoff };
  } finally {
    cleanupRunning = false;
  }
}

function startRecordingCleanup() {
  const run = () => cleanupExpiredRecordings().then((result) => {
    if (result.removed) console.log(`Removed ${result.removed} expired interview recording(s)`);
  }).catch((error) => {
    console.error("Interview recording cleanup failed:", error.message);
  });

  run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = { RETENTION_DAYS, cleanupExpiredRecordings, startRecordingCleanup };

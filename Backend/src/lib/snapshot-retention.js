"use strict";

const { col } = require("../db");
const storage = require("./storage");

const RETENTION_DAYS = 4;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
let cleanupRunning = false;

function bucketPathPattern(bucket) {
  const escaped = bucket.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}/`);
}

async function cleanupExpiredSnapshots(now = new Date()) {
  if (cleanupRunning) return { skipped: true, reason: "cleanup already running" };
  cleanupRunning = true;
  try {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const framePath = bucketPathPattern(storage.FRAME_BUCKET);
    const [violations, attempts] = await Promise.all([
      col("violations").find({
        timestamp: { $lt: cutoff },
        cameraFramePath: { $regex: framePath },
      }).project({ cameraFramePath: 1 }).toArray(),
      col("attempts").find({
        status: { $in: ["completed", "cheated", "disqualified"] },
        latestFramePath: { $regex: framePath },
        $or: [
          { latestFrameAt: { $lt: cutoff } },
          { latestFrameAt: { $exists: false }, updatedAt: { $lt: cutoff } },
          { latestFrameAt: { $exists: false }, updatedAt: { $exists: false }, lastSeenAt: { $lt: cutoff } },
        ],
      }).project({ latestFramePath: 1, latestFrameAt: 1 }).toArray(),
    ]);

    const paths = [...new Set([
      ...violations.map((violation) => violation.cameraFramePath),
      ...attempts.map((attempt) => attempt.latestFramePath),
    ])];
    if (paths.length) await storage.removePaths(paths);

    await Promise.all([
      ...violations.map((violation) => col("violations").updateOne(
        { _id: violation._id, cameraFramePath: violation.cameraFramePath },
        { $unset: { cameraFramePath: "" } }
      )),
      ...attempts.map((attempt) => col("attempts").updateOne(
        { _id: attempt._id, latestFramePath: attempt.latestFramePath },
        { $unset: { latestFramePath: "", latestFrameAt: "" } }
      )),
      col("attempts").updateMany(
        {
          status: { $in: ["completed", "cheated", "disqualified"] },
          updatedAt: { $lt: cutoff },
          latestFrame: { $exists: true },
        },
        { $unset: { latestFrame: "" } }
      ),
    ]);

    return { removed: paths.length, cutoff };
  } finally {
    cleanupRunning = false;
  }
}

function startSnapshotCleanup() {
  const run = () => cleanupExpiredSnapshots().then((result) => {
    if (result.removed) console.log(`Removed ${result.removed} expired proctoring snapshot(s)`);
  }).catch((error) => {
    console.error("Proctoring snapshot cleanup failed:", error.message);
  });

  run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
}

module.exports = { RETENTION_DAYS, cleanupExpiredSnapshots, startSnapshotCleanup };

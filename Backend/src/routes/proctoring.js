"use strict";

const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { col, toId, id } = require("../db");
const { authenticate } = require("../middleware/auth");
const storage = require("../lib/storage");

const router = express.Router();

const PYTHON = process.env.PYTHON_PATH || "python";
const ANALYZE_SCRIPT = path.join(__dirname, "..", "..", "..", "AIML", "scripts", "analyze_proctor.py");

const VIOLATION_TYPES = {
  MULTIPLE_PERSONS: "MULTIPLE_PERSONS",
  ELECTRONIC_DEVICE: "ELECTRONIC_DEVICE",
  PHONE_DETECTED: "PHONE_DETECTED",
  CANDIDATE_NOT_VISIBLE: "CANDIDATE_NOT_VISIBLE",
  CAMERA_DISABLED: "CAMERA_DISABLED",
  CAMERA_ERROR: "CAMERA_ERROR",
  PROCTORING_FAILURE: "PROCTORING_FAILURE",
  FULLSCREEN_EXIT: "FULLSCREEN_EXIT",
  TAB_SWITCH: "TAB_SWITCH",
  WINDOW_BLUR: "WINDOW_BLUR",
  DEV_TOOLS: "DEV_TOOLS",
  RIGHT_CLICK: "RIGHT_CLICK",
  COPY_ATTEMPT: "COPY_ATTEMPT",
  PASTE_ATTEMPT: "PASTE_ATTEMPT",
  SCREEN_CAPTURE: "SCREEN_CAPTURE",
  VOICE_DETECTED: "VOICE_DETECTED",
  LOOKING_AWAY: "LOOKING_AWAY",
  IMPOSTER_DETECTED: "IMPOSTER_DETECTED",
  IDENTITY_MISMATCH: "IDENTITY_MISMATCH",
  NO_FACE: "NO_FACE",
  MULTIPLE_FACES: "MULTIPLE_FACES",
  LOW_FACE_CONFIDENCE: "LOW_FACE_CONFIDENCE",
  CAMERA_LOST: "CAMERA_LOST",
  MIC_LOST: "MIC_LOST",
  F5_REFRESH: "F5_REFRESH",
  ESCAPE_PRESSED: "ESCAPE_PRESSED",
};

const SEVERITY = {
  no_face: "medium",
  multiple_faces: "high",
  MULTIPLE_PERSONS: "high",
  ELECTRONIC_DEVICE: "high",
  PHONE_DETECTED: "high",
  CANDIDATE_NOT_VISIBLE: "medium",
  CAMERA_DISABLED: "high",
  phone_detected: "high",
  voice_detected: "high",
  tab_switch: "medium",
  TAB_SWITCH: "medium",
  window_blur: "medium",
  WINDOW_BLUR: "medium",
  fullscreen_exit: "high",
  FULLSCREEN_EXIT: "high",
  right_click: "medium",
  RIGHT_CLICK: "medium",
  dev_tools: "high",
  DEV_TOOLS: "high",
  copy_attempt: "medium",
  COPY_ATTEMPT: "medium",
  paste_attempt: "medium",
  PASTE_ATTEMPT: "medium",
  screen_capture: "high",
  SCREEN_CAPTURE: "high",
  camera_lost: "high",
  CAMERA_LOST: "high",
  mic_lost: "high",
  MIC_LOST: "high",
  looking_away: "low",
  LOOKING_AWAY: "low",
  IMPOSTER_DETECTED: "high",
  imposter_detected: "high",
  IDENTITY_MISMATCH: "high",
  NO_FACE: "medium",
  MULTIPLE_FACES: "high",
  CAMERA_ERROR: "high",
  LOW_FACE_CONFIDENCE: "low",
  F5_REFRESH: "high",
  ESCAPE_PRESSED: "high",
};

function runPython(args) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [ANALYZE_SCRIPT, ...args], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`Proctor analyzer failed: ${stderr || err.message}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Proctor analyzer returned invalid output"));
      }
    });
  });
}

function writeTemp(base64, ext) {
  const file = path.join(os.tmpdir(), `proctor-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(file, Buffer.from(base64, "base64"));
  return file;
}

async function withAttempt(attemptId, fn) {
  const attempt = await col("attempts").findOne({ _id: id(attemptId) });
  if (!attempt) return null;
  return fn(attempt);
}

/**
 * Attach short-lived signed URLs for every stored frame on a violation list.
 *
 * Reads both the new `cameraFramePath` (Supabase `bucket/key`) and the legacy
 * `cameraFrame` (inline base64) so documents written before the migration keep
 * rendering. Base64 blobs are never returned to the browser as a substitute for
 * a signed URL - if Supabase is unconfigured the URL is simply null.
 */
async function withFrameUrls(violations) {
  if (!violations.length) return violations;

  const paths = violations.map((v) => v.cameraFramePath).filter(Boolean);
  const urls = paths.length ? await storage.resolveUrls(paths) : {};

  return violations.map((v) => ({
    ...toId(v),
    cameraFrameUrl: v.cameraFramePath ? urls[v.cameraFramePath] || null : null,
  }));
}

async function enforceLimits(attemptId, config, triggerType = null) {
  const count = await col("violations").countDocuments({ attemptId });
  const attempt = await col("attempts").findOne({ _id: id(attemptId) });
  if (!attempt || (attempt.status !== "in_progress" && attempt.status !== "flagged")) {
    return { autoSubmitted: false };
  }

  const maxViolations = config?.maxViolations ?? 1;
  // Review-only by default. Violations are recorded for staff review, but the
  // attempt is NOT auto-submitted or locked unless the test explicitly opts out
  // of review mode. This lets every AI-detected violation be captured with a
  // snapshot without interrupting the student mid-test.
  const reviewOnly = config?.reviewOnly !== false;
  const autoSubmit = config?.autoSubmit === true;

  if (!reviewOnly && count >= maxViolations && autoSubmit) {
    const reasonCode = triggerType ? triggerType.toUpperCase().replace(/ /g, "_") : "PROCTORING_VIOLATION";
    const now = new Date();
    await col("attempts").updateOne(
      { _id: attempt._id },
      { $set: { violations: count, cheatingReason: reasonCode, cheatingTimestamp: now, autoSubmitted: true, status: "cheated", result: "cheated", updatedAt: now } }
    );
    const testsModule = require("./tests");
    await testsModule.finalizeAttempt({ ...attempt, status: "cheated", result: "cheated" });
    return { autoSubmitted: true, result: "cheated", cheatingReason: reasonCode };
  }

  if (!reviewOnly && count >= maxViolations) {
    await col("attempts").updateOne(
      { _id: attempt._id },
      { $set: { violations: count, reviewRequired: true, status: "flagged", lastSeenAt: new Date(), updatedAt: new Date() } }
    );
  } else {
    await col("attempts").updateOne(
      { _id: attempt._id },
      { $set: { violations: count, lastSeenAt: new Date(), updatedAt: new Date() } }
    );
  }
  return { autoSubmitted: false };
}

// POST /api/proctoring/attempt/:attemptId/register-face  (student) -> store reference face in Supabase
router.post("/attempt/:attemptId/register-face", authenticate, async (req, res) => {
  try {
    const { image } = req.body;
    const attemptId = req.params.attemptId;
    if (!image) return res.status(400).json({ error: "image (base64) is required" });

    const attempt = await col("attempts").findOne({ _id: id(attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    // Biometric data goes to Supabase Storage, never into a Mongo document.
    // Archival must not gate enrollment: the identity reference already lives
    // in the AIML monitor, and a missing/failed upload should not strand the
    // student on the capture screen.
    let referenceFacePath = null;
    let warning = null;
    try {
      referenceFacePath = await storage.uploadImagePath({
        image,
        bucket: storage.REFERENCE_BUCKET,
        scope: `reference/${attempt._id}`,
        contentType: "image/jpeg",
      });
      if (!referenceFacePath) warning = "Supabase Storage is not configured; reference face was not archived.";
    } catch (err) {
      warning = `Reference face could not be archived: ${err.message}`;
    }

    const update = { faceRegistered: true, updatedAt: new Date() };
    if (referenceFacePath) update.referenceFacePath = referenceFacePath;
    await col("attempts").updateOne({ _id: attempt._id }, { $set: update, $unset: { referenceFaceImage: "" } });

    res.json({ success: true, message: "Reference face registered", referenceFacePath, warning });
  } catch (err) {
    res.status(500).json({ error: `Failed to store reference face: ${err.message}` });
  }
});

// POST /api/proctoring/report  (student during attempt, or staff marking a violation)
router.post("/report", authenticate, async (req, res) => {
  try {
    const { attemptId, type, severity, description, cameraFrame, audioSample, metadata, analysis } = req.body;
    if (!attemptId || !type) return res.status(400).json({ error: "attemptId and type are required" });

    const normalizedType = String(type).toUpperCase().replace(/ /g, "_");
    const validTypes = Object.values(VIOLATION_TYPES);
    if (!validTypes.includes(normalizedType)) {
      console.warn(`Unknown violation type: ${type}, treating as generic violation`);
    }

    let cameraFramePath;
    if (cameraFrame) {
      cameraFramePath = await storage.uploadImagePath({
        image: cameraFrame,
        bucket: storage.FRAME_BUCKET,
        scope: `violations/${attemptId}`,
        contentType: "image/jpeg",
      });
    }

    const result = await col("violations").insertOne({
      attemptId: String(attemptId),
      type,
      severity: severity || SEVERITY[type] || "medium",
      description: description || type,
      cameraFramePath: cameraFramePath || undefined,
      audioSample: audioSample || undefined,
      analysis: analysis || undefined,
      metadata: metadata || undefined,
      timestamp: new Date(),
    });
    const violation = await col("violations").findOne({ _id: result.insertedId });
    const attempt = await withAttempt(attemptId, async (a) => a);
    let autoSubmitted = false;
    let submittedResult = null;
    let cheatingReason = null;
    if (attempt) {
      const config = attempt.proctoring || { autoSubmit: true, maxViolations: 1 };
      const enforcement = await enforceLimits(attemptId, config, type);
      autoSubmitted = enforcement.autoSubmitted;
      submittedResult = enforcement.result;
      cheatingReason = enforcement.cheatingReason || null;
    }
    res.status(201).json({ ...toId(violation), violationCount: await col("violations").countDocuments({ attemptId: String(attemptId) }), autoSubmitted, result: submittedResult, cheatingReason });
  } catch (err) {
    res.status(500).json({ error: `Failed to report violation: ${err.message}` });
  }
});

// POST /api/proctoring/analyze  (student) -> AI face + audio analysis, stores latest frame
router.post("/analyze", authenticate, async (req, res) => {
  try {
    const { attemptId, image, audio } = req.body;
    if (!attemptId) return res.status(400).json({ error: "attemptId is required" });
    const attempt = await withAttempt(attemptId, async (a) => a);
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    const analysis = { image: null, audio: null, violations: [] };
    let latestFramePath = null;

    if (image) {
      let tmp = null;
      try {
        tmp = writeTemp(image, ".jpg");
        analysis.image = await runPython(["--image", tmp]);
      } catch (err) {
        analysis.image = { error: err.message };
      } finally {
        if (tmp) fs.rmSync(tmp, { force: true });
      }
      // Upload once and reuse the path for both the attempt snapshot and any
      // violation records. Previously a full base64 JPEG was written into
      // `attempts.latestFrame` on every single analyze call.
      latestFramePath = await storage.uploadImagePath({
        image,
        bucket: storage.FRAME_BUCKET,
        scope: `attempts/${attemptId}`,
        contentType: "image/jpeg",
      });
      const img = analysis.image;
      if (img && !img.error) {
        if (img.multipleFaces) {
          analysis.violations.push({ type: "multiple_faces", description: `Multiple faces detected (${img.faces}).` });
        } else if (img.facePresent === false) {
          analysis.violations.push({ type: "no_face", description: "No face detected in webcam frame." });
        }
      }
    }

    if (audio) {
      let tmp = null;
      try {
        tmp = writeTemp(audio, ".wav");
        analysis.audio = await runPython(["--audio", tmp]);
      } catch (err) {
        analysis.audio = { error: err.message };
      } finally {
        if (tmp) fs.rmSync(tmp, { force: true });
      }
      const au = analysis.audio;
      if (au && !au.error && au.voiceDetected) {
        analysis.violations.push({ type: "voice_detected", description: "Speech detected in test environment." });
      }
    }

    const flagged = analysis.violations;
    for (const v of flagged) {
      await col("violations").insertOne({
        attemptId: String(attemptId),
        type: v.type,
        severity: SEVERITY[v.type] || "medium",
        description: v.description,
        confidence: v.confidence || undefined,
        cameraFramePath: ["multiple_faces", "no_face", "phone_detected"].includes(v.type) ? latestFramePath : undefined,
        analysis: { image: analysis.image, audio: analysis.audio },
        timestamp: new Date(),
      });
    }

    const config = attempt.proctoring || { autoSubmit: true, maxViolations: 1, snapshotIntervalSec: 20 };
    const set = {
      lastSeenAt: new Date(),
      latestAnalysis: analysis,
      ...(latestFramePath ? { latestFramePath, latestFrameAt: new Date() } : {}),
    };
    await col("attempts").updateOne({ _id: attempt._id }, { $set: set, $unset: { latestFrame: "" } });

    let autoResult = { autoSubmitted: false };
    for (const v of flagged) {
      const r = await enforceLimits(attemptId, config, v.type);
      if (r.autoSubmitted) { autoResult = r; break; }
    }

    res.json({
      analysis,
      flagged: flagged.length,
      violations: analysis.violations,
      violationCount: await col("violations").countDocuments({ attemptId }),
      autoSubmitted: autoResult.autoSubmitted,
      result: autoResult.result,
      cheatingReason: autoResult.cheatingReason || null,
    });
  } catch (err) {
    res.status(500).json({ error: `Analysis failed: ${err.message}` });
  }
});

// GET /api/proctoring/attempt/:attemptId  (student own / staff / placement)
router.get("/attempt/:attemptId", authenticate, async (req, res) => {
  try {
    const attemptId = req.params.attemptId;
    const violations = await col("violations").find({ attemptId }).sort({ timestamp: -1 }).toArray();
    res.json(await withFrameUrls(violations));
  } catch {
    res.status(500).json({ error: "Failed to fetch violations" });
  }
});

// GET /api/proctoring/test/:testId  (staff) -> violations across a test's attempts
router.get("/test/:testId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "staff") return res.status(403).json({ error: "Staff Coordinator only" });
    const testId = req.params.testId;
    const attempts = await col("attempts").find({ testId }).toArray();
    const ids = attempts.map((a) => a._id.toString());
    const violations = ids.length
      ? await col("violations").find({ attemptId: { $in: ids } }).sort({ timestamp: -1 }).toArray()
      : [];
    const byAttempt = new Map();
    for (const v of violations) {
      const list = byAttempt.get(v.attemptId) || [];
      list.push(v);
      byAttempt.set(v.attemptId, list);
    }

    const all = violations.map((v) => v.cameraFramePath).filter(Boolean);
    const urls = all.length ? await storage.resolveUrls(all) : {};

    res.json(
      await Promise.all(
        attempts.map(async (a) => {
          const attemptViolations = byAttempt.get(a._id.toString()) || [];
          const withUrls = attemptViolations.map((v) => ({
            ...toId(v),
            cameraFrameUrl: v.cameraFramePath ? urls[v.cameraFramePath] || null : null,
          }));
          return {
            ...toId(a),
            violationCount: withUrls.length,
            violations: withUrls,
          };
        })
      )
    );
  } catch {
    res.status(500).json({ error: "Failed to fetch test violations" });
  }
});

// POST /api/proctoring/attempt/:attemptId/reset  (staff) -> clear violation record for a student's attempt
router.post("/attempt/:attemptId/reset", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "staff") return res.status(403).json({ error: "Staff Coordinator only" });
    const attempt = await col("attempts").findOne({ _id: id(req.params.attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    // A hard-locked attempt ("disqualified") is reopened for the candidate;
    // completed attempts stay completed but have their violation log cleared.
    const reopen = attempt.status !== "completed";
    await col("violations").deleteMany({ attemptId: attempt._id.toString() });
    const resetAttempt = await col("attempts").findOneAndUpdate(
      { _id: attempt._id },
      {
        $set: {
          violations: 0,
          latestAnalysis: null,
          lastSeenAt: new Date(),
          reviewRequired: false,
          status: reopen ? "in_progress" : "completed",
          ...(reopen
            ? {
                result: null,
                disqualified: false,
                disqualifyReason: null,
                cheatingReason: null,
                cheatingTimestamp: null,
                autoSubmitted: false,
                // Fresh clock + finalize flag so a retake is not immediately
                // expired again and records its own performance entry.
                startedAt: new Date(),
                completedAt: null,
                timedOut: false,
                perfFinalized: false,
              }
            : {}),
          updatedAt: new Date(),
        },
        $unset: { latestFrame: "", latestFramePath: "" },
      },
      { returnDocument: "after" }
    );

    res.json({ message: "Attempt violations reset", violationCount: 0, attempt: toId(resetAttempt) });
  } catch {
    res.status(500).json({ error: "Failed to reset attempt violations" });
  }
});

// GET /api/proctoring/live  (staff) -> in-progress attempts with latest frames + violations
router.get("/live", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "staff") return res.status(403).json({ error: "Staff Coordinator only" });
    const attempts = await col("attempts").find({ status: { $in: ["in_progress", "flagged"] } }).sort({ startedAt: -1 }).toArray();
    const rows = await Promise.all(
      attempts.map(async (a) => {
        const latest = await col("violations").find({ attemptId: a._id.toString() }).sort({ timestamp: -1 }).limit(1).toArray();
        const test = await col("tests").findOne({ _id: id(a.testId) });
        const [latestViolation] = await withFrameUrls(latest);
        return {
          ...toId(a),
          status: a.status === "flagged" ? "flagged" : "in_progress",
          reviewRequired: !!a.reviewRequired,
          violationCount: a.violations || 0,
          testTitle: a.testTitle || test?.title,
          durationMin: test?.durationMin || a.durationMin || 30,
          latestFrameUrl: a.latestFramePath ? await storage.signedUrl(a.latestFramePath) : null,
          latestViolation: latestViolation || null,
        };
      })
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch live monitoring data" });
  }
});

module.exports = router;

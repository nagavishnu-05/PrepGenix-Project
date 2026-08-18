"use strict";

const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { col, toId, id } = require("../db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

const PYTHON = process.env.PYTHON_PATH || "python";
const ANALYZE_SCRIPT = path.join(__dirname, "..", "..", "..", "AIML", "scripts", "analyze_proctor.py");

const SEVERITY = {
  no_face: "medium",
  multiple_faces: "high",
  phone_detected: "high",
  voice_detected: "high",
  tab_switch: "medium",
  window_blur: "medium",
  fullscreen_exit: "high",
  right_click: "medium",
  dev_tools: "high",
  copy_attempt: "medium",
  paste_attempt: "medium",
  screen_capture: "high",
  camera_lost: "high",
  mic_lost: "high",
  looking_away: "low",
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

async function enforceLimits(attemptId, config, triggerType = null) {
  const count = await col("violations").countDocuments({ attemptId });
  const attempt = await col("attempts").findOne({ _id: id(attemptId) });

  if (attempt && attempt.status === "in_progress") {
    await col("attempts").updateOne(
      { _id: id(attemptId) },
      {
        $set: {
          violations: count,
          reviewRequired: true,
          status: "flagged",
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );
  }

  const fresh = await col("attempts").findOne({ _id: id(attemptId) });
  if (fresh && (fresh.status === "in_progress" || fresh.status === "flagged")) {
    const testsModule = require("./tests");
    const now = new Date();

    const reasonCode = triggerType ? triggerType.toUpperCase().replace(/ /g, "_") : "PROCTORING_VIOLATION";
    await col("attempts").updateOne(
      { _id: fresh._id },
      { $set: { cheatingReason: reasonCode, cheatingTimestamp: now, autoSubmitted: true, status: "cheated", result: "cheated" } }
    );
    await testsModule.finalizeAttempt({ ...fresh, status: "cheated", result: "cheated" });
    return { autoSubmitted: true, result: "cheated", cheatingReason: reasonCode };
  }
  return { autoSubmitted: false };
}

// POST /api/proctoring/report  (student during attempt, or staff marking a violation)
router.post("/report", authenticate, async (req, res) => {
  try {
    const { attemptId, type, severity, description, cameraFrame, audioSample, metadata, analysis } = req.body;
    if (!attemptId || !type) return res.status(400).json({ error: "attemptId and type are required" });
    const result = await col("violations").insertOne({
      attemptId: String(attemptId),
      type,
      severity: severity || SEVERITY[type] || "medium",
      description: description || type,
      cameraFrame: cameraFrame || undefined,
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
    let latestFrame = null;

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
      latestFrame = image;
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
        cameraFrame: ["multiple_faces", "no_face", "phone_detected"].includes(v.type) ? latestFrame : undefined,
        analysis: { image: analysis.image, audio: analysis.audio },
        timestamp: new Date(),
      });
    }

    const config = attempt.proctoring || { autoSubmit: true, maxViolations: 1, snapshotIntervalSec: 20 };
    const set = {
      lastSeenAt: new Date(),
      latestAnalysis: analysis,
      ...(latestFrame ? { latestFrame } : {}),
    };
    await col("attempts").updateOne({ _id: attempt._id }, { $set: set });

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
    res.json(violations.map(toId));
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
      list.push(toId(v));
      byAttempt.set(v.attemptId, list);
    }
    res.json(
      attempts.map((a) => ({
        ...toId(a),
        violationCount: (byAttempt.get(a._id.toString()) || []).length,
        violations: byAttempt.get(a._id.toString()) || [],
      }))
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

    await col("violations").deleteMany({ attemptId: attempt._id.toString() });
    const resetAttempt = await col("attempts").findOneAndUpdate(
      { _id: attempt._id },
      {
        $set: {
          violations: 0,
          latestAnalysis: null,
          latestFrame: null,
          lastSeenAt: new Date(),
          reviewRequired: false,
          status: attempt.status === "completed" ? "completed" : "in_progress",
          updatedAt: new Date(),
        },
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
        return {
          ...toId(a),
          status: a.status === "flagged" ? "flagged" : "in_progress",
          reviewRequired: !!a.reviewRequired,
          violationCount: a.violations || 0,
          testTitle: a.testTitle || test?.title,
          durationMin: test?.durationMin || a.durationMin || 30,
          latestViolation: latest.length ? toId(latest[0]) : null,
        };
      })
    );
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch live monitoring data" });
  }
});

module.exports = router;

"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { col, toId, id } = require("../db");
const { authenticate } = require("../middleware/auth");
const storage = require("../lib/storage");
const { initialState, advanceState, classifyResult, pickAdaptiveQuestion } = require("../adaptive");
const { gradeSubmission } = require("../judge");
const { pushAptitude, pushCoding } = require("../perf");
const {
  rowsFromBuffer,
  rowsFromFile,
  parseCodingQuestions,
  parseJsonQuestions,
  parseAptitudeMcqManual,
  parseAptitudeFillupManual,
  parseCodingManual
} = require("../excel-parse");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const DIFFICULTIES = ["easy", "medium", "hard"];

const PROCTOR_DEFAULT = {
  enabled: true,
  maxViolations: 1,
  autoSubmit: true,
  reviewOnly: true,
  snapshotIntervalSec: 20,
};

function normalizeProctoring(body) {
  const p = body && typeof body === "object" ? body : {};
  return {
    enabled: p.enabled !== false,
    maxViolations: Math.max(1, Number(p.maxViolations) || 1),
    autoSubmit: p.autoSubmit !== false,
    // Default to review-only: record violations for staff without locking the
    // student out mid-test. Opt out explicitly to reinstate auto-submit.
    reviewOnly: p.reviewOnly !== false,
    snapshotIntervalSec: Math.max(5, Number(p.snapshotIntervalSec) || 20),
  };
}

async function getStudent(req) {
  return col("students").findOne({ regNo: req.user.username });
}

function isAssigned(test, student) {
  if (!student) return false;
  if (test.assignedToAll) return true;
  if (test.assignedBatch && student.batch && test.assignedBatch === student.batch) return true;
  if (!Array.isArray(test.assignedStudents)) return false;
  const identifiers = [student.regNo, student.rollNo].filter(Boolean).map(String);
  return test.assignedStudents.some((assignedStudent) => identifiers.includes(String(assignedStudent)));
}

function sampleQuestions(list, count) {
  const copy = [...list];
  const out = [];
  while (out.length < count && copy.length) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

// Public-facing question shape for a student during an attempt (answers/test cases stripped).
function serveQuestion(q) {
  return {
    id: q._id ? q._id.toString() : q.id,
    type: q.type,
    format: q.format,
    subject: q.subject,
    title: q.title,
    description: q.description,
    codeSnippet: q.codeSnippet,
    options: q.options || [],
    language: q.language,
    difficulty: q.difficulty,
    points: q.points,
    constraints: q.constraints || [],
    inputFormat: q.inputFormat,
    outputFormat: q.outputFormat,
    examples: (q.examples || []).slice(0, 3),
    tags: q.tags || [],
  };
}

async function getQuestionById(idStr) {
  const q = await col("questions").findOne({ _id: id(idStr) });
  return q;
}

function attemptDurationMin(attempt) {
  return Math.max(1, Number(attempt?.durationMin) || 30);
}

// A running attempt's deadline is measured from `startedAt`. The client timer
// enforces the same limit, but the server is the source of truth: an overdue
// attempt is finalized on read instead of being offered as "Resume Test" and
// then rejecting the next answer with "Attempt already completed".
async function expireIfOverdue(attempt) {
  if (!attempt || attempt.status !== "in_progress") return attempt;
  const startedMs = attempt.startedAt ? new Date(attempt.startedAt).getTime() : Date.now();
  const deadline = startedMs + attemptDurationMin(attempt) * 60 * 1000;
  if (Date.now() < deadline) return attempt;
  await finalizeAttempt(attempt);
  await col("attempts").updateOne({ _id: attempt._id }, { $set: { timedOut: true } });
  return (await col("attempts").findOne({ _id: attempt._id })) || attempt;
}

// GET /api/tests  (staff sees all; students see assigned only)
router.get("/", authenticate, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    if (req.user.role === "student") {
      const student = await getStudent(req);
      if (!student) return res.status(404).json({ error: "Student profile not found" });
      const all = await col("tests").find().sort({ createdAt: -1 }).toArray();
      const assigned = all.filter((t) => isAssigned(t, student));
      const testsWithStatus = await Promise.all(
        assigned.map(async (t) => {
          const attemptDocs = await col("attempts")
            .find({ testId: t._id.toString(), studentRegNo: student.regNo })
            .sort({ createdAt: 1 })
            .toArray();
          // Surface an unfinished attempt first so duplicate historical records
          // cannot hide a resumable session behind a stale "completed" badge.
          // An overdue attempt is finalized here so it is never shown as
          // resumable (which then failed on the next answer).
          let attempt =
            attemptDocs.find((a) => a.status === "in_progress" || a.status === "flagged") ||
            attemptDocs[attemptDocs.length - 1] ||
            null;
          if (attempt) attempt = await expireIfOverdue(attempt);
          return {
            ...toId(t),
            _count: { questions: t.mode === "fixed" ? (t.fixedQuestionIds || []).length : t.adaptive?.totalQuestions },
            attempt: attempt ? { id: attempt._id.toString(), status: attempt.status, score: attempt.score, result: attempt.result } : null,
          };
        })
      );
      return res.json(testsWithStatus);
    }
    const { type } = req.query;
    const filter = type ? { type } : {};
    const tests = await col("tests").find(filter).sort({ createdAt: -1 }).toArray();
    const withCounts = await Promise.all(
      tests.map(async (t) => {
        const attemptCount = await col("attempts").countDocuments({ testId: t._id.toString() });
        return { ...toId(t), _count: { attempts: attemptCount } };
      })
    );
    res.json(withCounts);
  } catch {
    res.status(500).json({ error: "Failed to fetch tests" });
  }
});

// GET /api/tests/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const test = await col("tests").findOne({ _id: id(req.params.id) });
    if (!test) return res.status(404).json({ error: "Test not found" });
    if (req.user.role === "student") {
      const student = await getStudent(req);
      if (!isAssigned(test, student)) return res.status(403).json({ error: "Test not assigned to you" });
      const out = toId(test);
      if (test.mode === "fixed") {
        const qs = await col("questions").find({ _id: { $in: test.fixedQuestionIds.map(String).map(id) } }).toArray();
        out.questions = qs.map(serveQuestion);
      }
      return res.json(out);
    }
    res.json(toId(test));
  } catch {
    res.status(500).json({ error: "Failed to fetch test" });
  }
});

async function syncAimlQuestions() {
  const aimlDirs = [
    path.join(__dirname, "..", "..", "..", "AIML"),
    path.join(__dirname, "..", "..", "..", "AIML", "data")
  ];

  const questionsToInsert = [];

  for (const dir of aimlDirs) {
    if (!fs.existsSync(dir)) continue;

    let files = [];
    try {
      files = fs.readdirSync(dir).filter(f => /\.(xlsx|xls|csv|json)$/i.test(f));
    } catch (e) {
      console.error(`Failed to read AIML dir ${dir}:`, e.message);
      continue;
    }

    for (const file of files) {
      if (file === "skills.json") continue;
      
      const filePath = path.join(dir, file);
      try {
        let parsed = [];
        if (file.endsWith(".json")) {
          parsed = parseJsonQuestions(filePath);
        } else {
          const rows = rowsFromFile(filePath);
          parsed = parseCodingManual(rows);
          if (!parsed.length || !parsed[0].testCases || parsed[0].testCases.length === 0) {
            parsed = parseCodingQuestions(rows);
          }
        }

        for (const q of parsed) {
          if (q.type === "coding") {
            q.source = "aiml";
            q.sourceFile = file;
            questionsToInsert.push(q);
          }
        }
      } catch (e) {
        console.error(`Failed to parse AIML file ${file}:`, e.message);
      }
    }
  }

  if (questionsToInsert.length > 0) {
    const now = new Date();
    for (const q of questionsToInsert) {
      await col("questions").updateOne(
        { title: q.title, type: "coding", source: "aiml" },
        { 
          $set: { 
            ...q, 
            updatedAt: now 
          },
          $setOnInsert: {
            createdAt: now
          }
        },
        { upsert: true }
      );
    }
    console.log(`Synced ${questionsToInsert.length} coding questions from AIML folder`);
  }
}

// POST /api/tests/import-questions (staff)
router.post("/import-questions", authenticate, upload.single("file"), async (req, res) => {
  try {
    if (req.user.role !== "staff") return res.status(403).json({ error: "Staff Coordinator only" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const testType = req.body.testType; // "aptitude" or "coding"
    const manualType = req.body.manualType; // "mcq" or "fillup" or "programming"
    const questionLimit = Number(req.body.questionLimit) || 0;

    const rows = rowsFromBuffer(req.file.buffer);
    let parsed = [];

    if (testType === "coding" && manualType === "mcq") {
      // Coding MCQ: option-based questions but kept as coding type so code snippets are preserved.
      parsed = parseAptitudeMcqManual(rows).map(q => ({ ...q, type: "coding", format: "mcq" }));
    } else if (testType === "coding") {
      parsed = parseCodingManual(rows);
    } else {
      if (manualType === "fillup") {
        parsed = parseAptitudeFillupManual(rows);
      } else {
        parsed = parseAptitudeMcqManual(rows);
      }
    }

    if (!parsed.length) {
      return res.status(400).json({ error: "No valid questions found in file" });
    }

    // Slice to limit
    if (questionLimit > 0 && parsed.length > questionLimit) {
      parsed = parsed.slice(0, questionLimit);
    }

    const now = new Date();
    const withMeta = parsed.map((q) => ({
      ...q,
      createdBy: req.user.userId,
      createdAt: now,
      updatedAt: now,
    }));

    const result = await col("questions").insertMany(withMeta);
    const ids = Object.values(result.insertedIds).map((id) => id.toString());

    res.status(201).json({
      message: "Questions imported successfully",
      count: ids.length,
      questionIds: ids,
    });
  } catch (err) {
    res.status(500).json({ error: `Question import failed: ${err.message}` });
  }
});

// POST /api/tests  (staff)
router.post("/", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "staff") return res.status(403).json({ error: "Staff Coordinator only" });
    const body = req.body;
    if (!body.title || !body.type) return res.status(400).json({ error: "title and type are required" });
    const mode = body.mode === "adaptive" ? "adaptive" : "fixed";
    const test = {
      title: String(body.title).trim(),
      description: body.description || "",
      type: body.type === "coding" ? "coding" : "aptitude",
      mode,
      adaptive: body.adaptive || { totalQuestions: 10, questionFilter: null },
      fixedQuestionIds: Array.isArray(body.fixedQuestionIds) ? body.fixedQuestionIds.map(String) : [],
      autoPick: body.autoPick || null,
      assignedStudents: body.assignedStudents || [],
      assignedBatch: body.assignedBatch || null,
      assignedToAll: !!body.assignedToAll,
      durationMin: Number(body.durationMin) || 30,
      passingScore: Number(body.passingScore) || 50,
      proctoring: normalizeProctoring(body.proctoring),
      createdBy: req.user.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await col("tests").insertOne(test);
    res.status(201).json(toId({ ...test, _id: result.insertedId }));
  } catch {
    res.status(500).json({ error: "Failed to create test" });
  }
});

// PUT /api/tests/:id  (staff)
router.put("/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "staff") return res.status(403).json({ error: "Staff Coordinator only" });
    const body = req.body;
    const set = { updatedAt: new Date() };
    if (body.title !== undefined) set.title = body.title;
    if (body.description !== undefined) set.description = body.description;
    if (body.adaptive !== undefined) set.adaptive = body.adaptive;
    if (body.fixedQuestionIds !== undefined) set.fixedQuestionIds = body.fixedQuestionIds.map(String);
    if (body.autoPick !== undefined) set.autoPick = body.autoPick;
    if (body.durationMin !== undefined) set.durationMin = Number(body.durationMin);
    if (body.passingScore !== undefined) set.passingScore = Number(body.passingScore);
    if (body.proctoring !== undefined) set.proctoring = normalizeProctoring(body.proctoring);
    const test = await col("tests").findOneAndUpdate({ _id: id(req.params.id) }, { $set: set }, { returnDocument: "after" });
    if (!test) return res.status(404).json({ error: "Test not found" });
    res.json(toId(test));
  } catch {
    res.status(500).json({ error: "Failed to update test" });
  }
});

// POST /api/tests/:id/assign  (staff) { regNos, batch, all }
router.post("/:id/assign", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "staff") return res.status(403).json({ error: "Staff Coordinator only" });
    const { regNos, batch, all } = req.body;
    const testId = req.params.id;
    const test = await col("tests").findOne({ _id: id(testId) });
    if (!test) return res.status(404).json({ error: "Test not found" });

    console.log("[assign]", {
      staffId: req.user.userId,
      role: req.user.role,
      testId,
      testTitle: test.title,
      all,
      batch: batch || null,
      regNos: regNos || [],
    });

    const set = { updatedAt: new Date() };
    if (regNos !== undefined) {
      const values = Array.isArray(regNos) ? regNos : [regNos];
      const validRegNos = values.map(String).map((v) => v.trim()).filter(Boolean);
      for (const regNo of validRegNos) {
        const student = await col("students").findOne({ regNo });
        if (!student) return res.status(404).json({ error: `Student with register number ${regNo} not found` });
      }
      set.assignedStudents = validRegNos;
    }
    if (batch !== undefined) set.assignedBatch = batch || null;
    if (all !== undefined) set.assignedToAll = !!all;
    const updated = await col("tests").updateOne({ _id: id(testId) }, { $set: set });
    if (!updated.matchedCount) return res.status(404).json({ error: "Test not found" });
    const fresh = await col("tests").findOne({ _id: id(testId) });
    console.log("[assign] OK:", { testId, assignedToAll: fresh.assignedToAll, assignedBatch: fresh.assignedBatch, assignedStudents: fresh.assignedStudents });
    res.json(toId(fresh));
  } catch (error) {
    console.error("[assign] ERROR:", error.message, error.stack);
    res.status(500).json({ error: `Failed to assign test: ${error.message}` });
  }
});

// DELETE /api/tests/:id  (staff)
router.delete("/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "staff") return res.status(403).json({ error: "Staff Coordinator only" });
    const testId = req.params.id;
    const deletedTest = await col("tests").deleteOne({ _id: id(testId) });
    if (!deletedTest.deletedCount) return res.status(404).json({ error: "Test not found" });

    const attempts = await col("attempts").find({ testId }).project({ _id: 1 }).toArray();
    const attemptIds = attempts.map((attempt) => attempt._id.toString());
    await Promise.all([
      col("attempts").deleteMany({ testId }),
      attemptIds.length ? col("violations").deleteMany({ attemptId: { $in: attemptIds } }) : Promise.resolve(),
      col("performances", "perf").updateMany(
        {
          $or: [
            { aptitude: { $elemMatch: { testId } } },
            { coding: { $elemMatch: { testId } } },
          ],
        },
        { $pull: { aptitude: { testId }, coding: { testId } } }
      ),
    ]);
    res.json({ message: "Test deleted" });
  } catch (error) {
    console.error("Failed to delete test:", error);
    res.status(500).json({ error: "Failed to delete test" });
  }
});

// DELETE /api/tests/attempts/:attemptId  (staff) - reset/delete attempt for a student
router.delete("/attempts/:attemptId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "staff") return res.status(403).json({ error: "Staff Coordinator only" });
    const attemptId = req.params.attemptId;
    const attempt = await col("attempts").findOne({ _id: id(attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    const studentRegNo = attempt.studentRegNo;
    const testId = attempt.testId;

    // A student may have accumulated duplicate attempts for the same test
    // (e.g. a double-start race). Reset must clear every twin, otherwise the
    // leftover record keeps the student stuck on "already completed".
    const siblings = await col("attempts")
      .find({ testId, studentRegNo }, { projection: { _id: 1 } })
      .toArray();
    const siblingIds = siblings.map((a) => a._id.toString());

    await Promise.all([
      col("attempts").deleteMany({ testId, studentRegNo }),
      col("violations").deleteMany({ attemptId: { $in: siblingIds } }),
      col("performances", "perf").updateOne(
        { regNo: studentRegNo },
        {
          $pull: {
            aptitude: { testId },
            coding: { testId }
          }
        }
      )
    ]);

    res.json({ message: "Student attempt reset successfully", removed: siblingIds.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset attempt: " + err.message });
  }
});

// POST /api/tests/:id/start  (student)
router.post("/:id/start", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Students only" });
    const test = await col("tests").findOne({ _id: id(req.params.id) });
    if (!test) return res.status(404).json({ error: "Test not found" });
    const student = await getStudent(req);
    if (!isAssigned(test, student)) return res.status(403).json({ error: "Test not assigned to you" });

    // Sync AIML questions if test is adaptive coding
    if (test.type === "coding" && test.mode === "adaptive") {
      await syncAimlQuestions().catch(e => console.error("AIML sync failed at start:", e));
    }

    const attemptFilter = { testId: test._id.toString(), studentRegNo: student.regNo };

    // Prefer an unfinished attempt so a stale duplicate can never masquerade as
    // "already completed". Without this, a double-start race leaves one
    // in_progress and one completed record, and the newest (completed) one wins.
    const active = await col("attempts").findOne(
      { ...attemptFilter, status: { $in: ["in_progress", "flagged"] } },
      { sort: { createdAt: -1 } }
    );
    if (active) return res.json(toId(active));

    const existing = await col("attempts").findOne(attemptFilter, { sort: { createdAt: -1 } });
    if (existing) {
      if (existing.status === "completed") {
        return res.json({ ...toId(existing), alreadyCompleted: true });
      }
      if (existing.status === "cheated") {
        return res.status(403).json({ error: "This attempt was terminated due to a proctoring violation.", cheatingReason: existing.cheatingReason, status: "cheated" });
      }
      if (existing.status === "disqualified") {
        return res.status(403).json({ error: "This attempt was terminated by proctoring. A staff coordinator must reset it before you can retake the test.", status: "disqualified", disqualifyReason: existing.disqualifyReason });
      }
      return res.json(toId(existing));
    }

    let attemptDoc = {
      testId: test._id.toString(),
      testTitle: test.title,
      type: test.type,
      mode: test.mode,
      studentRegNo: student.regNo,
      studentName: student.name,
      durationMin: Number(test.durationMin) || 30,
      status: "in_progress",
      score: 0,
      totalScore: 0,
      totalQuestions: 0,
      passingScore: test.passingScore || 50,
      result: null,
      answers: [],
      questionIndex: 0,
      pendingQuestionId: null,
      startedAt: new Date(),
      createdAt: new Date(),
      proctoring: test.proctoring || PROCTOR_DEFAULT,
      violations: 0,
    };

    if (test.mode === "fixed") {
      let ids = [...(test.fixedQuestionIds || [])];
      if (!ids.length && test.autoPick) {
        const filter = { type: test.type, ...(test.autoPick.difficulty ? { difficulty: test.autoPick.difficulty } : {}) };
        if (test.autoPick.tags && test.autoPick.tags.length) filter.tags = { $in: test.autoPick.tags };
        if (test.autoPick.formats && test.autoPick.formats.length) filter.format = { $in: test.autoPick.formats };
        const pool = await col("questions").find(filter).toArray();
        ids = sampleQuestions(pool, Number(test.autoPick.count) || 10).map((q) => q._id.toString());
      }
      if (!ids.length) return res.status(400).json({ error: "Test has no questions. Add questions or auto-pick." });
      attemptDoc.questions = ids;
      attemptDoc.totalQuestions = ids.length;
      const totalScore = (await col("questions").find({ _id: { $in: ids.map(id) } }).toArray()).reduce((s, q) => s + (q.points || 1), 0);
      attemptDoc.totalScore = totalScore;
    } else {
      attemptDoc.adaptive = initialState();
      attemptDoc.totalQuestions = Number(test.adaptive?.totalQuestions) || 10;
      attemptDoc.totalScore = attemptDoc.totalQuestions * 10;
    }

    const result = await col("attempts").insertOne(attemptDoc);
    const attempt = await col("attempts").findOne({ _id: result.insertedId });
    res.status(201).json(toId(attempt));
  } catch {
    res.status(500).json({ error: "Failed to start test" });
  }
});

const TERMINAL_ATTEMPT_STATUSES = ["completed", "cheated", "disqualified"];

// POST /api/tests/attempts/:attemptId/terminate  (student)
// Hard-locks an attempt when the candidate leaves the proctored session (Esc,
// fullscreen exit, refresh/close). The attempt is persisted as "disqualified"
// so a page reload cannot resume it; only a staff reset clears the lock.
router.post("/attempts/:attemptId/terminate", authenticate, async (req, res) => {
  try {
    const attempt = await col("attempts").findOne({ _id: id(req.params.attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (req.user.role === "student" && attempt.studentRegNo !== req.user.username) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Idempotent: repeated exits / a reload firing `pagehide` twice must not
    // create duplicate violation rows or performance entries.
    if (TERMINAL_ATTEMPT_STATUSES.includes(attempt.status)) {
      return res.json({ ...toId(attempt), alreadyTerminated: true });
    }

    const { type, description, cameraFrame } = req.body || {};
    const reasonCode = String(type || "PROCTORING_EXIT").toUpperCase().replace(/ /g, "_");

    let cameraFramePath;
    if (cameraFrame) {
      try {
        cameraFramePath = await storage.uploadImagePath({
          image: cameraFrame,
          bucket: storage.FRAME_BUCKET,
          scope: `violations/${attempt._id}`,
          contentType: "image/jpeg",
        });
      } catch {
        // Snapshot archiving is best-effort; the lock must not depend on it.
      }
    }

    await col("violations").insertOne({
      attemptId: attempt._id.toString(),
      type: reasonCode,
      severity: "high",
      description: description || `Attempt terminated: ${reasonCode}`,
      cameraFramePath: cameraFramePath || undefined,
      metadata: { terminated: true },
      timestamp: new Date(),
    });
    const violationCount = await col("violations").countDocuments({ attemptId: attempt._id.toString() });

    const now = new Date();
    await col("attempts").updateOne(
      { _id: attempt._id },
      {
        $set: {
          status: "disqualified",
          result: "disqualified",
          disqualified: true,
          disqualifyReason: reasonCode,
          cheatingReason: reasonCode,
          cheatingTimestamp: now,
          violations: violationCount,
          completedAt: now,
          updatedAt: now,
        },
      }
    );

    const perfEntry = {
      testId: attempt.testId,
      testTitle: attempt.testTitle,
      score: 0,
      total: attempt.totalScore,
      result: "disqualified",
      mode: attempt.mode,
      percentage: 0,
    };
    if (attempt.type === "coding") await pushCoding(attempt.studentRegNo, perfEntry);
    else await pushAptitude(attempt.studentRegNo, perfEntry);

    const updated = await col("attempts").findOne({ _id: attempt._id });
    res.json({ ...toId(updated), terminated: true, violationCount });
  } catch (err) {
    res.status(500).json({ error: "Failed to terminate attempt: " + err.message });
  }
});

async function disqualifyAttempt(attempt, reason = "Exited fullscreen mode") {
  const now = new Date();
  await col("attempts").updateOne(
    { _id: attempt._id },
    { $set: { status: "completed", result: "disqualified", disqualified: true, disqualifyReason: reason, completedAt: now } }
  );

  const perfEntry = {
    testId: attempt.testId,
    testTitle: attempt.testTitle,
    score: 0,
    total: attempt.totalScore,
    result: "disqualified",
    mode: attempt.mode,
    percentage: 0,
  };
  if (attempt.type === "coding") await pushCoding(attempt.studentRegNo, perfEntry);
  else await pushAptitude(attempt.studentRegNo, perfEntry);
  return { status: "completed", result: "disqualified" };
}

async function finalizeAttempt(attempt) {
  let result;
  if (attempt.status === "cheated" || attempt.result === "cheated") {
    result = "cheated";
  } else if (attempt.mode === "adaptive") {
    result = classifyResult(attempt.adaptive);
  } else {
    const ratio = attempt.totalScore ? attempt.score / attempt.totalScore : 0;
    const passingRatio = (attempt.totalScore ? (attempt.totalScore * (attempt.passingScore || 50)) / 100 : 0);
    result = attempt.score >= passingRatio ? "passed" : "failed";
  }
  const status = result === "cheated" ? "cheated" : "completed";
  await col("attempts").updateOne({ _id: attempt._id }, { $set: { status, result, completedAt: new Date() } });

  // Record exactly one performance entry per attempt even if two requests
  // (client timer, server expiry, question completion) finalize concurrently.
  const claim = await col("attempts").updateOne(
    { _id: attempt._id, perfFinalized: { $ne: true } },
    { $set: { perfFinalized: true } }
  );
  if (claim.modifiedCount === 0) return { status, result };

  const perfEntry = {
    testId: attempt.testId,
    testTitle: attempt.testTitle,
    score: attempt.score || 0,
    total: attempt.totalScore,
    result,
    mode: attempt.mode,
    percentage: attempt.totalScore ? Math.round(((attempt.score || 0) / attempt.totalScore) * 100) : 0,
  };
  if (attempt.type === "coding") await pushCoding(attempt.studentRegNo, perfEntry);
  else await pushAptitude(attempt.studentRegNo, perfEntry);
  return { status, result };
}

// GET /api/tests/attempts/:attemptId  -> attempt detail (student own or staff)
router.get("/attempts/:attemptId", authenticate, async (req, res) => {
  try {
    let attempt = await col("attempts").findOne({ _id: id(req.params.attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (req.user.role === "student" && attempt.studentRegNo !== req.user.username) {
      return res.status(403).json({ error: "Access denied" });
    }
    attempt = await expireIfOverdue(attempt);
    res.json(toId(attempt));
  } catch {
    res.status(500).json({ error: "Failed to fetch attempt" });
  }
});

// GET /api/tests/attempts/:attemptId/question  -> next question to display
router.get("/attempts/:attemptId/question", authenticate, async (req, res) => {
  try {
    let attempt = await col("attempts").findOne({ _id: id(req.params.attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (attempt.studentRegNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    attempt = await expireIfOverdue(attempt);
    if (attempt.status === "completed" || attempt.status === "cheated" || attempt.status === "disqualified") {
      return res.json({ finished: true, result: attempt.result });
    }
    if (attempt.status === "flagged" || attempt.reviewRequired) {
      return res.status(423).json({ error: "This attempt is paused pending staff review" });
    }

    if (attempt.pendingQuestionId) {
      const q = await getQuestionById(attempt.pendingQuestionId);
      return res.json({ finished: false, question: serveQuestion(q), questionIndex: attempt.questionIndex, adaptive: attempt.adaptive });
    }

    // Fixed mode
    if (attempt.mode === "fixed") {
      if (attempt.questionIndex >= (attempt.questions || []).length) {
        const finalized = await finalizeAttempt(attempt);
        return res.json({ finished: true, result: finalized.result });
      }
      const qid = attempt.questions[attempt.questionIndex];
      const q = await getQuestionById(qid);
      if (!q) {
        attempt.questionIndex += 1;
        await col("attempts").updateOne({ _id: attempt._id }, { $set: { questionIndex: attempt.questionIndex } });
        return res.json({ finished: false, question: null, questionIndex: attempt.questionIndex });
      }
      await col("attempts").updateOne({ _id: attempt._id }, { $set: { pendingQuestionId: qid } });
      return res.json({ finished: false, question: serveQuestion(q), questionIndex: attempt.questionIndex, adaptive: attempt.adaptive });
    }

    // Adaptive mode
    const st = attempt.adaptive;
    if (!st) return res.status(400).json({ error: "Missing adaptive state" });
    if (st.finished || st.askedCount >= Number(attempt.totalQuestions) || st.answeredCount >= Number(attempt.totalQuestions)) {
      const finalized = await finalizeAttempt(attempt);
      return res.json({ finished: true, result: finalized.result });
    }
    const asked = attempt.answers.map((a) => a.questionId);
    const test = await col("tests").findOne({ _id: id(attempt.testId) });
    const q = await pickAdaptiveQuestion(st, test || {}, asked);
    if (!q) {
      const finalized = await finalizeAttempt(attempt);
      return res.json({ finished: true, result: finalized.result });
    }
    st.askedCount += 1;
    await col("attempts").updateOne(
      { _id: attempt._id },
      { $set: { pendingQuestionId: q._id.toString(), adaptive: st } }
    );
    res.json({ finished: false, question: serveQuestion(q), questionIndex: st.askedCount, adaptive: st });
  } catch {
    res.status(500).json({ error: "Failed to load question" });
  }
});

// POST /api/tests/attempts/:attemptId/answer
router.post("/attempts/:attemptId/answer", authenticate, async (req, res) => {
  try {
    let attempt = await col("attempts").findOne({ _id: id(req.params.attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (attempt.studentRegNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    attempt = await expireIfOverdue(attempt);
    if (attempt.status === "completed" || attempt.status === "cheated" || attempt.status === "disqualified") return res.status(400).json({ error: "Attempt already completed" });
    if (attempt.status === "flagged" || attempt.reviewRequired) {
      return res.status(423).json({ error: "This attempt is paused pending staff review" });
    }

    const { questionId, answer, code, language } = req.body;
    const qid = questionId || attempt.pendingQuestionId;
    if (!qid) return res.status(400).json({ error: "No pending question" });
    const q = await getQuestionById(qid);
    if (!q) return res.status(404).json({ error: "Question not found" });

    let correct = false;
    let passed = 0;
    let total = 0;
    let judgeResult = null;
    let answerValue = answer;

    if (q.type === "coding") {
      if (!code) return res.status(400).json({ error: "Code is required" });
      const lang = language || q.language || "javascript";
      const testCases = (q.testCases || []).map((tc, i) => ({ ...tc, orderIndex: tc.orderIndex ?? i }));
      judgeResult = await gradeSubmission({ code, language: lang, testCases });
      passed = judgeResult.passed;
      total = judgeResult.total;
      correct = passed === total && total > 0;
      answerValue = { code, language: lang };
    } else if (q.format === "mcq") {
      const given = typeof answer === "number" ? answer : String(answer || "");
      correct = given === q.correctOption || (typeof given === "string" && given.trim().toLowerCase() === String(q.options[q.correctOption] || "").trim().toLowerCase());
    } else {
      const normalize = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
      correct = normalize(answer) === normalize(q.answer);
    }

    let pointsEarned = 0;
    if (correct) pointsEarned = q.points || (q.type === "coding" ? 10 : 1);
    else if (q.type === "coding" && total > 0) pointsEarned = Math.round((q.points || 10) * (passed / total));

    const answerDoc = {
      questionId: qid,
      difficulty: q.difficulty,
      correct,
      answer: answerValue,
      points: pointsEarned,
      passed,
      total,
      timeTakenMs: req.body.timeTakenMs || 0,
    };
    attempt.answers.push(answerDoc);
    attempt.score += pointsEarned;
    attempt.questionIndex += 1;
    attempt.pendingQuestionId = null;

    // advance adaptive state first (mutates attempt.adaptive)
    if (attempt.mode === "adaptive") {
      const st = attempt.adaptive || initialState();
      advanceState(st, correct, q.difficulty);
      attempt.adaptive = st;
    }

    // persist the full attempt (answers, score, adaptive) BEFORE any finalization
    await col("attempts").updateOne(
      { _id: attempt._id },
      {
        $set: {
          answers: attempt.answers,
          score: attempt.score,
          questionIndex: attempt.questionIndex,
          pendingQuestionId: null,
          ...(attempt.adaptive ? { adaptive: attempt.adaptive } : {}),
        },
      }
    );

    let finished = false;
    let result = null;

    if (attempt.mode === "adaptive") {
      const st = attempt.adaptive;
      const maxQ = Number(attempt.totalQuestions) || 10;
      if (st.finished || st.askedCount >= maxQ || st.answeredCount >= maxQ) {
        const finalized = await finalizeAttempt(attempt);
        finished = true;
        result = finalized.result;
      }
    } else if (attempt.questionIndex >= (attempt.questions || []).length) {
      const finalized = await finalizeAttempt(attempt);
      finished = true;
      result = finalized.result;
    }

    res.json({
      finished,
      result,
      ...(q.type === "coding"
        ? {
            passed,
            total,
            judge: judgeResult
              ? { passed: judgeResult.passed, total: judgeResult.total, executionTime: judgeResult.executionTime, failedCases: judgeResult.results.filter((r) => !r.passed).slice(0, 3) }
              : undefined,
          }
        : {}),
    });
  } catch (err) {
    res.status(500).json({ error: `Answer submission failed: ${err.message}` });
  }
});

// POST /api/tests/attempts/:attemptId/finish
router.post("/attempts/:attemptId/finish", authenticate, async (req, res) => {
  try {
    let attempt = await col("attempts").findOne({ _id: id(req.params.attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (req.user.role === "student" && attempt.studentRegNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    if (attempt.status === "completed" || attempt.status === "cheated" || attempt.status === "disqualified") {
      return res.json({ finished: true, result: attempt.result, attempt: toId(attempt) });
    }
    // If the deadline already passed, finalize through the overdue path so the
    // attempt is tagged `timedOut`, matching server-side expiry.
    attempt = await expireIfOverdue(attempt);
    if (attempt.status !== "in_progress" && attempt.status !== "flagged") {
      return res.json({ finished: true, result: attempt.result, attempt: toId(attempt) });
    }
    const finalized = await finalizeAttempt(attempt);
    const full = await col("attempts").findOne({ _id: attempt._id });
    res.json({ finished: true, result: finalized.result, attempt: toId(full) });
  } catch {
    res.status(500).json({ error: "Failed to finish attempt" });
  }
});

// GET /api/tests/attempts/:attemptId/result
router.get("/attempts/:attemptId/result", authenticate, async (req, res) => {
  try {
    const attempt = await col("attempts").findOne({ _id: id(req.params.attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (req.user.role === "student" && attempt.studentRegNo !== req.user.username) {
      return res.status(403).json({ error: "Access denied" });
    }
    res.json(toId(attempt));
  } catch {
    res.status(500).json({ error: "Failed to fetch result" });
  }
});

module.exports = router;
module.exports.finalizeAttempt = finalizeAttempt;
module.exports.disqualifyAttempt = disqualifyAttempt;
module.exports.PROCTOR_DEFAULT = PROCTOR_DEFAULT;

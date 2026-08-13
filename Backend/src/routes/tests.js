"use strict";

const express = require("express");
const { col, toId, id } = require("../db");
const { authenticate } = require("../middleware/auth");
const { initialState, advanceState, classifyResult, pickAdaptiveQuestion } = require("../adaptive");
const { gradeSubmission } = require("../judge");
const { pushAptitude, pushCoding } = require("../perf");

const router = express.Router();

const DIFFICULTIES = ["easy", "medium", "hard"];

const PROCTOR_DEFAULT = {
  enabled: true,
  maxViolations: 5,
  autoSubmit: true,
  snapshotIntervalSec: 20,
};

function normalizeProctoring(body) {
  const p = body && typeof body === "object" ? body : {};
  return {
    enabled: p.enabled !== false,
    maxViolations: Math.max(1, Number(p.maxViolations) || 5),
    autoSubmit: p.autoSubmit !== false,
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
  return Array.isArray(test.assignedStudents) && test.assignedStudents.includes(student.regNo);
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

// GET /api/tests  (staff sees all; students see assigned only)
router.get("/", authenticate, async (req, res) => {
  try {
    if (req.user.role === "student") {
      const student = await getStudent(req);
      if (!student) return res.status(404).json({ error: "Student profile not found" });
      const all = await col("tests").find().sort({ createdAt: -1 }).toArray();
      const assigned = all.filter((t) => isAssigned(t, student));
      const testsWithStatus = await Promise.all(
        assigned.map(async (t) => {
          const attempt = await col("attempts").findOne(
            { testId: t._id.toString(), studentRegNo: student.regNo },
            { sort: { createdAt: -1 } }
          );
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
    const set = { updatedAt: new Date() };
    if (regNos !== undefined) set.assignedStudents = regNos.map(String);
    if (batch !== undefined) set.assignedBatch = batch || null;
    if (all !== undefined) set.assignedToAll = !!all;
    const test = await col("tests").findOneAndUpdate({ _id: id(req.params.id) }, { $set: set }, { returnDocument: "after" });
    if (!test) return res.status(404).json({ error: "Test not found" });
    res.json(toId(test));
  } catch {
    res.status(500).json({ error: "Failed to assign test" });
  }
});

// DELETE /api/tests/:id  (staff)
router.delete("/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "staff") return res.status(403).json({ error: "Staff Coordinator only" });
    const testId = req.params.id;
    await Promise.all([
      col("attempts").deleteMany({ testId }),
      col("tests").deleteOne({ _id: id(testId) }),
    ]);
    res.json({ message: "Test deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete test" });
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

    const existing = await col("attempts").findOne(
      { testId: test._id.toString(), studentRegNo: student.regNo },
      { sort: { createdAt: -1 } }
    );
    if (existing) {
      if (existing.status === "completed") {
        return res.json({ ...toId(existing), alreadyCompleted: true });
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

async function disqualifyAttempt(attempt, reason = "Exited fullscreen mode") {
  const completed = {
    ...attempt,
    status: "completed",
    result: "disqualified",
    disqualified: true,
    disqualifyReason: reason,
    completedAt: new Date(),
  };
  await col("attempts").updateOne(
    { _id: attempt._id },
    { $set: { status: "completed", result: "disqualified", disqualified: true, disqualifyReason: reason, completedAt: completed.completedAt } }
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
  return { ...completed, result: "disqualified" };
}

async function finalizeAttempt(attempt) {
  let result;
  if (attempt.mode === "adaptive") {
    result = classifyResult(attempt.adaptive);
  } else {
    const ratio = attempt.totalScore ? attempt.score / attempt.totalScore : 0;
    const passingRatio = (attempt.totalScore ? (attempt.totalScore * (attempt.passingScore || 50)) / 100 : 0);
    result = attempt.score >= passingRatio ? "passed" : "failed";
  }
  const completed = {
    ...attempt,
    status: "completed",
    result,
    completedAt: new Date(),
  };
  await col("attempts").updateOne({ _id: attempt._id }, { $set: { status: "completed", result, completedAt: completed.completedAt } });

  const perfEntry = {
    testId: attempt.testId,
    testTitle: attempt.testTitle,
    score: attempt.score,
    total: attempt.totalScore,
    result,
    mode: attempt.mode,
    percentage: attempt.totalScore ? Math.round((attempt.score / attempt.totalScore) * 100) : 0,
  };
  if (attempt.type === "coding") await pushCoding(attempt.studentRegNo, perfEntry);
  else await pushAptitude(attempt.studentRegNo, perfEntry);
  return { ...completed, result };
}

// GET /api/tests/attempts/:attemptId  -> attempt detail (student own or staff)
router.get("/attempts/:attemptId", authenticate, async (req, res) => {
  try {
    const attempt = await col("attempts").findOne({ _id: id(req.params.attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (req.user.role === "student" && attempt.studentRegNo !== req.user.username) {
      return res.status(403).json({ error: "Access denied" });
    }
    res.json(toId(attempt));
  } catch {
    res.status(500).json({ error: "Failed to fetch attempt" });
  }
});

// GET /api/tests/attempts/:attemptId/question  -> next question to display
router.get("/attempts/:attemptId/question", authenticate, async (req, res) => {
  try {
    const attempt = await col("attempts").findOne({ _id: id(req.params.attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (attempt.studentRegNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    if (attempt.status === "completed") {
      return res.json({ finished: true, result: attempt.result });
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
    const attempt = await col("attempts").findOne({ _id: id(req.params.attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (attempt.studentRegNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    if (attempt.status === "completed") return res.status(400).json({ error: "Attempt already completed" });

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
      correct,
      correctAnswer: q.type === "coding" ? undefined : q.answer,
      passed,
      total,
      points: pointsEarned,
      finished,
      result,
      adaptive: attempt.adaptive,
      judge: judgeResult
        ? { passed: judgeResult.passed, total: judgeResult.total, executionTime: judgeResult.executionTime, failedCases: judgeResult.results.filter((r) => !r.passed).slice(0, 3) }
        : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: `Answer submission failed: ${err.message}` });
  }
});

// POST /api/tests/attempts/:attemptId/finish
router.post("/attempts/:attemptId/finish", authenticate, async (req, res) => {
  try {
    const attempt = await col("attempts").findOne({ _id: id(req.params.attemptId) });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (req.user.role === "student" && attempt.studentRegNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    if (attempt.status === "completed") return res.json({ finished: true, result: attempt.result, attempt: toId(attempt) });
    const finalized = await finalizeAttempt(attempt);
    res.json({ finished: true, result: finalized.result, attempt: toId(finalized) });
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

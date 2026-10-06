"use strict";

const express = require("express");
const { col, toId, id } = require("../db");
const { authenticate } = require("../middleware/auth");
const { getPerformance } = require("../perf");
const storage = require("../lib/storage");

const router = express.Router();

// GET /api/reports/overview  (staff / placement)
router.get("/overview", authenticate, async (req, res) => {
  try {
    if (!["staff", "placement"].includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    const [students, tests, attempts, interviews, resumes] = await Promise.all([
      col("students").countDocuments(),
      col("tests").countDocuments(),
      col("attempts").countDocuments({ status: "completed" }),
      col("interviews").countDocuments({ status: "completed" }),
      col("resumes", "resume").countDocuments(),
    ]);
    res.json({ students, tests, completedAttempts: attempts, completedInterviews: interviews, resumes });
  } catch {
    res.status(500).json({ error: "Failed to fetch overview" });
  }
});

// GET /api/reports/rankings/me  (student's own global rankings)
router.get("/rankings/me", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Students only" });

    const regNo = req.user.username;
    const [students, performanceDocs, activeTests] = await Promise.all([
      col("students").find({}, { projection: { regNo: 1, name: 1 } }).toArray(),
      col("performances", "perf").find({}, { projection: { regNo: 1, aptitude: 1, coding: 1 } }).toArray(),
      col("tests").find({}, { projection: { _id: 1 } }).toArray(),
    ]);
    if (!students.some((student) => student.regNo === regNo)) {
      return res.status(404).json({ error: "Student not found" });
    }

    const studentRegNos = new Set(students.map((student) => student.regNo));
    const activeTestIds = new Set(activeTests.map((test) => test._id.toString()));
    const avatars = await storage.getStudentAvatars(students.map((student) => student.regNo));
    const performanceByStudent = new Map(
      performanceDocs
        .filter((performance) => studentRegNos.has(performance.regNo))
        .map((performance) => [performance.regNo, performance])
    );
    const percentFor = (entry) => entry?.percentage != null && Number.isFinite(Number(entry.percentage))
      ? Number(entry.percentage)
      : null;
    const metrics = { overall: [], aptitude: [], coding: [] };

    for (const student of students) {
      const performance = performanceByStudent.get(student.regNo);
      const aptitude = (performance?.aptitude || []).filter((entry) => activeTestIds.has(String(entry.testId)));
      const coding = (performance?.coding || []).filter((entry) => activeTestIds.has(String(entry.testId)));
      const scores = {
        overall: [...aptitude, ...coding],
        aptitude,
        coding,
      };

      for (const [category, entries] of Object.entries(scores)) {
        const percentages = entries.map(percentFor).filter((value) => value !== null);
        if (percentages.length) {
          metrics[category].push({
            regNo: student.regNo,
            name: student.name,
            avatar: avatars.get(student.regNo) || null,
            isCurrentUser: student.regNo === regNo,
            average: Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length),
            testsTaken: percentages.length,
          });
        }
      }
    }

    const rankings = Object.fromEntries(Object.entries(metrics).map(([category, scores]) => {
      scores.sort((a, b) => b.average - a.average || String(a.name || "").localeCompare(String(b.name || "")));
      let previousAverage = null;
      let previousRank = 0;
      for (let index = 0; index < scores.length; index += 1) {
        if (scores[index].average !== previousAverage) {
          previousRank = index + 1;
          previousAverage = scores[index].average;
        }
        scores[index].rank = previousRank;
      }

      const current = scores.find((score) => score.isCurrentUser);
      const rankedStudentRegNos = new Set(scores.map((score) => score.regNo));
      const unranked = students
        .filter((student) => !rankedStudentRegNos.has(student.regNo))
        .map((student) => ({
          name: student.name,
          avatar: avatars.get(student.regNo) || null,
          isCurrentUser: student.regNo === regNo,
          average: null,
          testsTaken: 0,
          rank: null,
        }));
      return [category, {
        rank: current?.rank ?? null,
        average: current?.average ?? null,
        testsTaken: current?.testsTaken ?? 0,
        participants: scores.length,
        studentCount: students.length,
        entries: [...scores, ...unranked].map(({ regNo: _regNo, ...entry }) => entry),
      }];
    }));

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.json({ scope: "All students", rankings });
  } catch (error) {
    console.error("Failed to fetch student rankings:", error);
    res.status(500).json({ error: "Failed to fetch student rankings" });
  }
});

// GET /api/reports/students  (staff / placement) aggregate report
router.get("/students", authenticate, async (req, res) => {
  try {
    if (!["staff", "placement"].includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    const { batch, search, categorized } = req.query;
    const filter = {};
    if (batch) filter.batch = batch;
    if (search) {
      const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { regNo: rx }];
    }
    const students = await col("students").find(filter).sort({ regNo: 1 }).toArray();
    const [activeTests, perfDocs, resumeDocs, attempts] = await Promise.all([
      col("tests").find({}, { projection: { _id: 1 } }).toArray(),
      col("performances", "perf").find({ regNo: { $in: students.map((s) => s.regNo) } }).toArray(),
      col("resumes", "resume").find({ regNo: { $in: students.map((s) => s.regNo) } }).toArray(),
      col("attempts").find(
        { studentRegNo: { $in: students.map((s) => s.regNo) } },
        { projection: { _id: 1, studentRegNo: 1 } }
      ).toArray(),
    ]);
    const attemptRegNoById = new Map(attempts.map((attempt) => [attempt._id.toString(), attempt.studentRegNo]));
    const violationsByStudent = new Map();
    if (attempts.length) {
      const violationCounts = await col("violations").aggregate([
        { $match: { attemptId: { $in: [...attemptRegNoById.keys()] } } },
        { $group: { _id: "$attemptId", count: { $sum: 1 } } },
      ]).toArray();
      for (const violation of violationCounts) {
        const regNo = attemptRegNoById.get(violation._id);
        if (regNo) violationsByStudent.set(regNo, (violationsByStudent.get(regNo) || 0) + violation.count);
      }
    }
    const activeTestIds = new Set(activeTests.map((test) => test._id.toString()));
    const perfMap = new Map(perfDocs.map((p) => [p.regNo, p]));
    const resumeMap = new Map(resumeDocs.map((r) => [r.regNo, r]));

    const rows = students.map((s) => {
      const perf = perfMap.get(s.regNo);
      const resume = resumeMap.get(s.regNo);
      const aptitude = (perf?.aptitude || [])
        .filter((entry) => activeTestIds.has(String(entry.testId)))
        .map((a) => ({ ...a, date: a.date }));
      const coding = (perf?.coding || [])
        .filter((entry) => activeTestIds.has(String(entry.testId)))
        .map((c) => ({ ...c, date: c.date }));
      const interview = (perf?.interview || []).map((i) => ({ ...i, date: i.date }));
      const lastAptitude = aptitude[aptitude.length - 1];
      const lastCoding = coding[coding.length - 1];
      const lastInterview = interview[interview.length - 1];
      return {
        regNo: s.regNo,
        name: s.name,
        batch: s.batch,
        department: s.department,
        cgpa: s.cgpa,
        tenth: s.tenth,
        twelfth: s.twelfth,
        mobile: s.mobile,
        email: s.email,
        aptitudeCount: aptitude.length,
        aptitudeAverage: aptitude.length ? Math.round((aptitude.reduce((sum, a) => sum + (a.percentage ?? 0), 0) / aptitude.length)) : null,
        lastAptitude: lastAptitude ? { score: lastAptitude.score, total: lastAptitude.total, result: lastAptitude.result, percentage: lastAptitude.percentage } : null,
        codingCount: coding.length,
        codingAverage: coding.length ? Math.round((coding.reduce((sum, c) => sum + (c.percentage ?? 0), 0) / coding.length)) : null,
        lastCoding: lastCoding ? { score: lastCoding.score, total: lastCoding.total, result: lastCoding.result, percentage: lastCoding.percentage } : null,
        interviewCount: interview.length,
        lastInterview: lastInterview ? { rating: lastInterview.rating, notes: lastInterview.notes } : null,
        violationCount: violationsByStudent.get(s.regNo) || 0,
        categories: resume ? (resume.categories || []).map((c) => (typeof c === "string" ? c : c.name)) : [],
        topCategory: resume?.topCategory || null,
        hasResume: !!resume,
      };
    });

    if (categorized === "true") {
      res.json(rows.filter((r) => r.hasResume && r.categories.length));
    } else {
      res.json(rows);
    }
  } catch {
    res.status(500).json({ error: "Failed to fetch student report" });
  }
});

// GET /api/reports/tests (staff / placement) list available tests and formats
router.get("/tests", authenticate, async (req, res) => {
  try {
    if (!["staff", "placement"].includes(req.user.role)) return res.status(403).json({ error: "Staff or Placement Coordinator only" });
    const tests = await col("tests").find({}, {
      projection: { title: 1, type: 1, mode: 1, fixedQuestionIds: 1, adaptive: 1 },
    }).sort({ createdAt: -1 }).toArray();
    const questionIds = [...new Set(tests.flatMap((test) => test.fixedQuestionIds || []))].map(id);
    const questions = questionIds.length
      ? await col("questions").find({ _id: { $in: questionIds } }, { projection: { format: 1 } }).toArray()
      : [];
    const formatById = new Map(questions.map((question) => [question._id.toString(), question.format]));
    res.json(tests.map((test) => ({
      id: test._id.toString(),
      title: test.title,
      type: test.type,
      mode: test.mode,
      formats: test.mode === "adaptive"
        ? test.adaptive?.questionFilter?.formats || (test.type === "coding" ? ["programming"] : [])
        : [...new Set((test.fixedQuestionIds || []).map((questionId) => formatById.get(String(questionId))).filter(Boolean))],
    })));
  } catch (error) {
    console.error("Failed to fetch report test list:", error);
    res.status(500).json({ error: "Failed to fetch tests for reports" });
  }
});

// GET /api/reports/tests/:id  (staff / placement) performance per test
router.get("/tests/:id", authenticate, async (req, res) => {
  try {
    if (!["staff", "placement"].includes(req.user.role)) return res.status(403).json({ error: "Staff or Placement Coordinator only" });
    const includeViolations = req.user.role === "staff";
    const test = await col("tests").findOne({ _id: id(req.params.id) });
    if (!test) return res.status(404).json({ error: "Test not found" });
    const attempts = await col("attempts").find({ testId: test._id.toString(), status: { $in: ["completed", "disqualified", "flagged"] } }).sort({ score: -1 }).toArray();
    const violationIds = attempts.map((a) => a._id.toString());
    const violationDocs = includeViolations && violationIds.length
      ? await col("violations").find({ attemptId: { $in: violationIds } }).sort({ timestamp: -1 }).toArray()
      : [];
    const framePaths = violationDocs.map((v) => v.cameraFramePath).filter(Boolean);
    const frameUrls = framePaths.length ? await storage.resolveUrls(framePaths) : {};
    const violMap = new Map();
    for (const v of violationDocs) {
      const list = violMap.get(v.attemptId) || [];
      list.push({
        ...toId(v),
        cameraFrameUrl: v.cameraFramePath ? frameUrls[v.cameraFramePath] || null : null,
      });
      violMap.set(v.attemptId, list);
    }
    const scores = attempts.map((a) => a.score);
    const avg = scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : 0;
    const best = scores.length ? Math.max(...scores) : 0;
    const results = attempts.reduce((acc, a) => {
      const key = a.result || "n/a";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    res.json({
      test: toId(test),
      _count: { attempts: attempts.length },
      stats: { averageScore: avg, bestScore: best, totalScore: test.mode === "adaptive" ? (test.adaptive?.totalQuestions || 10) * 10 : attempts[0]?.totalScore || 0 },
      results,
      attempts: attempts.map((a) => {
        const report = {
          id: a._id.toString(),
          studentRegNo: a.studentRegNo,
          studentName: a.studentName,
          score: a.score,
          totalScore: a.totalScore,
          result: a.result,
          correct: a.answers.filter((x) => x.correct).length,
          totalQuestions: a.answers.length,
          completedAt: a.completedAt,
        };
        if (includeViolations) {
          report.violationCount = (violMap.get(a._id.toString()) || []).length;
          report.violations = violMap.get(a._id.toString()) || [];
        }
        return report;
      }),
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch test report" });
  }
});

// GET /api/reports/student/:regNo  full report (student own / staff / placement)
router.get("/student/:regNo", authenticate, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const regNo = req.params.regNo;
    if (req.user.role === "student" && req.user.username !== regNo) {
      return res.status(403).json({ error: "Access denied" });
    }
    const student = await col("students").findOne({ regNo });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const [performance, resume, activeTests] = await Promise.all([
      getPerformance(regNo),
      col("resumes", "resume").findOne({ regNo }),
      col("tests").find({}, { projection: { _id: 1 } }).toArray(),
    ]);
    const activeTestIds = new Set(activeTests.map((test) => test._id.toString()));
    performance.aptitude = (performance.aptitude || []).filter((entry) => activeTestIds.has(String(entry.testId)));
    performance.coding = (performance.coding || []).filter((entry) => activeTestIds.has(String(entry.testId)));
    res.json({
      ...toId(student),
      performance,
      resume: resume ? { categories: resume.categories, topCategory: resume.topCategory, skills: resume.skills } : null,
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch student report" });
  }
});

module.exports = router;

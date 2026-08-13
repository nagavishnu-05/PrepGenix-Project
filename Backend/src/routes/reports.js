"use strict";

const express = require("express");
const { col, toId, id } = require("../db");
const { authenticate } = require("../middleware/auth");
const { getPerformance } = require("../perf");

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
    const perfDocs = await col("performances", "perf").find({ regNo: { $in: students.map((s) => s.regNo) } }).toArray();
    const resumeDocs = await col("resumes", "resume").find({ regNo: { $in: students.map((s) => s.regNo) } }).toArray();
    const perfMap = new Map(perfDocs.map((p) => [p.regNo, p]));
    const resumeMap = new Map(resumeDocs.map((r) => [r.regNo, r]));

    const rows = students.map((s) => {
      const perf = perfMap.get(s.regNo);
      const resume = resumeMap.get(s.regNo);
      const aptitude = (perf?.aptitude || []).map((a) => ({ ...a, date: a.date }));
      const coding = (perf?.coding || []).map((c) => ({ ...c, date: c.date }));
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

// GET /api/reports/tests/:id  (staff) performance per test
router.get("/tests/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "staff") return res.status(403).json({ error: "Staff Coordinator only" });
    const test = await col("tests").findOne({ _id: id(req.params.id) });
    if (!test) return res.status(404).json({ error: "Test not found" });
    const attempts = await col("attempts").find({ testId: test._id.toString(), status: "completed" }).sort({ score: -1 }).toArray();
    const violationIds = attempts.map((a) => a._id.toString());
    const violationDocs = violationIds.length
      ? await col("violations").find({ attemptId: { $in: violationIds } }).sort({ timestamp: -1 }).toArray()
      : [];
    const violMap = new Map();
    for (const v of violationDocs) {
      const list = violMap.get(v.attemptId) || [];
      list.push(toId(v));
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
      attempts: attempts.map((a) => ({
        id: a._id.toString(),
        studentRegNo: a.studentRegNo,
        studentName: a.studentName,
        score: a.score,
        totalScore: a.totalScore,
        result: a.result,
        correct: a.answers.filter((x) => x.correct).length,
        totalQuestions: a.answers.length,
        completedAt: a.completedAt,
        violationCount: (violMap.get(a._id.toString()) || []).length,
        violations: violMap.get(a._id.toString()) || [],
      })),
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch test report" });
  }
});

// GET /api/reports/student/:regNo  full report (student own / staff / placement)
router.get("/student/:regNo", authenticate, async (req, res) => {
  try {
    const regNo = req.params.regNo;
    if (req.user.role === "student" && req.user.username !== regNo) {
      return res.status(403).json({ error: "Access denied" });
    }
    const student = await col("students").findOne({ regNo });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const [performance, resume] = await Promise.all([
      getPerformance(regNo),
      col("resumes", "resume").findOne({ regNo }),
    ]);
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

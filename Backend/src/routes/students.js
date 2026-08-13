"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { col, toId, id, upsertDoc } = require("../db");
const { authenticate } = require("../middleware/auth");
const { rowsFromBuffer, parseStudents } = require("../excel-parse");
const { getPerformance } = require("../perf");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const STAFF = ["staff", "placement"];

async function upsertStudentLogin(student) {
  const passwordHash = await bcrypt.hash(student.rollNo || "student", 10);
  await upsertDoc(
    col("users"),
    { role: "student", username: student.regNo },
    { name: student.name, passwordHash, updatedAt: new Date() },
    null,
    { createdAt: new Date() }
  );
}

async function upsertStudent(student) {
  const doc = {
    rollNo: student.rollNo || "",
    name: student.name,
    email: student.email || "",
    mobile: student.mobile || "",
    tenth: student.tenth || "",
    twelfth: student.twelfth || "",
    cgpa: student.cgpa || "",
    department: student.department || "",
    batch: student.batch || "",
    updatedAt: new Date(),
  };
  await upsertDoc(col("students"), { regNo: student.regNo }, doc, null, { createdAt: new Date() });
  await upsertStudentLogin(student);
  return { ...doc, regNo: student.regNo };
}

// GET /api/students?batch=&search=
router.get("/", authenticate, async (req, res) => {
  try {
    const { batch, search } = req.query;
    const filter = {};
    if (batch) filter.batch = batch;
    if (search) {
      const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { regNo: rx }];
    }
    const students = await col("students").find(filter).sort({ regNo: 1 }).toArray();
    res.json(students.map(toId));
  } catch {
    res.status(500).json({ error: "Failed to fetch students" });
  }
});

// GET /api/students/batches
router.get("/batches", authenticate, async (_req, res) => {
  try {
    const batches = await col("students").distinct("batch");
    res.json(batches.filter(Boolean).sort());
  } catch {
    res.status(500).json({ error: "Failed to fetch batches" });
  }
});

// GET /api/students/:regNo  -> profile + performance + resume category
router.get("/:regNo", authenticate, async (req, res) => {
  try {
    const regNo = req.params.regNo;
    const student = await col("students").findOne({ regNo });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const [performance, resume] = await Promise.all([
      getPerformance(regNo),
      col("resumes", "resume").findOne({ regNo }),
    ]);
    res.json({
      ...toId(student),
      performance,
      resumeCategories: resume ? resume.categories : [],
      resumeSkills: resume ? resume.skills : [],
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch student" });
  }
});

// POST /api/students  (staff) manual add
router.post("/", authenticate, async (req, res) => {
  try {
    if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    const { regNo, rollNo, name, email, mobile, tenth, twelfth, cgpa, department, batch } = req.body;
    if (!regNo || !name) return res.status(400).json({ error: "regNo and name are required" });
    const student = await upsertStudent({ regNo, rollNo, name, email, mobile, tenth, twelfth, cgpa, department, batch });
    res.status(201).json(student);
  } catch {
    res.status(500).json({ error: "Failed to create student" });
  }
});

// POST /api/students/import  (staff) excel upload
router.post("/import", authenticate, upload.single("file"), async (req, res) => {
  try {
    if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const rows = rowsFromBuffer(req.file.buffer);
    const students = parseStudents(rows);
    if (!students.length) return res.status(400).json({ error: "No valid student rows found. Expected columns: RegNo, RollNo, Name, ..." });
    let created = 0;
    let updated = 0;
    for (const s of students) {
      const exists = await col("students").findOne({ regNo: s.regNo });
      await upsertStudent(s);
      if (exists) updated += 1;
      else created += 1;
    }
    res.json({ message: "Import complete", created, updated, total: students.length, samples: students.slice(0, 3) });
  } catch (err) {
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

// PUT /api/students/:regNo  (staff) update profile
router.put("/:regNo", authenticate, async (req, res) => {
  try {
    if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    const regNo = req.params.regNo;
    const { name, email, mobile, tenth, twelfth, cgpa, department, batch } = req.body;
    const set = { updatedAt: new Date() };
    if (name !== undefined) set.name = name;
    if (email !== undefined) set.email = email;
    if (mobile !== undefined) set.mobile = mobile;
    if (tenth !== undefined) set.tenth = tenth;
    if (twelfth !== undefined) set.twelfth = twelfth;
    if (cgpa !== undefined) set.cgpa = cgpa;
    if (department !== undefined) set.department = department;
    if (batch !== undefined) set.batch = batch;
    const student = await col("students").findOneAndUpdate({ regNo }, { $set: set }, { returnDocument: "after" });
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(toId(student));
  } catch {
    res.status(500).json({ error: "Failed to update student" });
  }
});

// GET /api/students/:regNo/performance
router.get("/:regNo/performance", authenticate, async (req, res) => {
  try {
    const doc = await getPerformance(req.params.regNo);
    res.json(doc);
  } catch {
    res.status(500).json({ error: "Failed to fetch performance" });
  }
});

// PUT /api/students/:regNo/performance  (staff/placement) manual update
router.put("/:regNo/performance", authenticate, async (req, res) => {
  try {
    if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    const regNo = req.params.regNo;
    const { aptitude, coding, interview } = req.body;
    const set = { updatedAt: new Date() };
    if (aptitude !== undefined) set.aptitude = aptitude;
    if (coding !== undefined) set.coding = coding;
    if (interview !== undefined) set.interview = interview;
    await col("performances", "perf").updateOne({ regNo }, { $set: set }, { upsert: true });
    res.json(await getPerformance(regNo));
  } catch {
    res.status(500).json({ error: "Failed to update performance" });
  }
});

// DELETE /api/students/:regNo
router.delete("/:regNo", authenticate, async (req, res) => {
  try {
    if (!STAFF.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    const regNo = req.params.regNo;
    await Promise.all([
      col("students").deleteOne({ regNo }),
      col("users").deleteOne({ role: "student", username: regNo }),
      col("performances", "perf").deleteOne({ regNo }),
      col("resumes", "resume").deleteOne({ regNo }),
    ]);
    res.json({ message: "Student deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete student" });
  }
});

module.exports = router;

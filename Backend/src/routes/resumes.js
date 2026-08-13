"use strict";

const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const multer = require("multer");
const { col, toId, upsertDoc } = require("../db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const PYTHON = process.env.PYTHON_PATH || "python";
const PARSE_SCRIPT = path.join(__dirname, "..", "..", "..", "AIML", "scripts", "parse_resume.py");

function runPythonParse(filePath) {
  return new Promise((resolve, reject) => {
    // Ensure Python prints JSON using UTF-8 on Windows (avoids chcp/cp1252 errors)
    const env = Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8" });
    execFile(PYTHON, [PARSE_SCRIPT, "--input", filePath], { env, timeout: 60000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const hint = /pypdf/i.test(stderr) ? " (pypdf is required for PDF parsing — run `pip install pypdf` in the AIML folder)" : "";
        return reject(new Error(`Resume parser failed${hint}: ${stderr || err.message}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Resume parser returned invalid output"));
      }
    });
  });
}

// GET /api/resumes  (placement / staff)
router.get("/", authenticate, async (req, res) => {
  try {
    const { categorized } = req.query;
    const filter = categorized ? { categories: { $ne: null } } : {};
    const resumes = await col("resumes", "resume").find(filter).sort({ parsedAt: -1 }).toArray();
    res.json(
      resumes.map((r) => ({
        ...toId(r),
        text: undefined,
        data: undefined,
      }))
    );
  } catch {
    res.status(500).json({ error: "Failed to fetch resumes" });
  }
});

// GET /api/resumes/:regNo
router.get("/:regNo", authenticate, async (req, res) => {
  try {
    const resume = await col("resumes", "resume").findOne({ regNo: req.params.regNo });
    if (!resume) return res.status(404).json({ error: "Resume not found" });
    const { data, ...rest } = resume;
    res.json(toId(rest));
  } catch {
    res.status(500).json({ error: "Failed to fetch resume" });
  }
});

// POST /api/resumes/:regNo/upload  (placement) multipart
router.post("/:regNo/upload", authenticate, upload.single("file"), async (req, res) => {
  try {
    // allow placement coordinators, or the student themself (username is regNo)
    const regNo = req.params.regNo;
    if (!(req.user.role === "placement" || (req.user.role === "student" && req.user.username === regNo))) {
      return res.status(403).json({ error: "Placement Coordinator or the student only" });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const student = await col("students").findOne({ regNo });
    if (!student) return res.status(404).json({ error: "Student not found" });

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (![".pdf", ".txt", ".docx"].includes(ext)) {
      return res.status(400).json({ error: "Only PDF, TXT and DOCX resumes are supported" });
    }

    const tmpFile = path.join(os.tmpdir(), `resume-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    fs.writeFileSync(tmpFile, req.file.buffer);

    let parsed = null;
    try {
      parsed = await runPythonParse(tmpFile);
    } catch (err) {
      fs.rmSync(tmpFile, { force: true });
      return res.status(422).json({ error: err.message });
    }
    fs.rmSync(tmpFile, { force: true });

    const doc = {
      studentName: student.name,
      fileName: req.file.originalname,
      contentType: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer.toString("base64"),
      skills: parsed.skills || [],
      categories: parsed.categories || [],
      topCategory: parsed.topCategory || null,
      text: (parsed.text || "").slice(0, 20000),
      parsedBy: req.user.userId,
      parsedAt: new Date(),
    };
    const upserted = await upsertDoc(col("resumes", "resume"), { regNo }, doc, null, { uploadedAt: new Date() });
    const { data, ...rest } = { _id: upserted.id, regNo, ...doc };
    res.status(201).json(toId(rest));
  } catch (err) {
    res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
});

// POST /api/resumes/:regNo/parse  (placement) re-parse stored resume
router.post("/:regNo/parse", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "placement") return res.status(403).json({ error: "Placement Coordinator only" });
    const resume = await col("resumes", "resume").findOne({ regNo: req.params.regNo });
    if (!resume) return res.status(404).json({ error: "No resume uploaded for this student" });
    const ext = path.extname(resume.fileName || ".txt").toLowerCase();
    const tmpFile = path.join(os.tmpdir(), `resume-${Date.now()}${ext}`);
    fs.writeFileSync(tmpFile, Buffer.from(resume.data || "", "base64"));
    let parsed;
    try {
      parsed = await runPythonParse(tmpFile);
    } catch (err) {
      fs.rmSync(tmpFile, { force: true });
      return res.status(422).json({ error: err.message });
    }
    fs.rmSync(tmpFile, { force: true });
    await col("resumes", "resume").updateOne(
      { regNo: req.params.regNo },
      { $set: { skills: parsed.skills || [], categories: parsed.categories || [], topCategory: parsed.topCategory || null, text: (parsed.text || "").slice(0, 20000), parsedBy: req.user.userId, parsedAt: new Date() } }
    );
    const updated = await col("resumes", "resume").findOne({ regNo: req.params.regNo });
    const { data, ...rest } = updated;
    res.json(toId(rest));
  } catch (err) {
    res.status(500).json({ error: `Parse failed: ${err.message}` });
  }
});

// PUT /api/resumes/:regNo/categories  (placement) manual override
router.put("/:regNo/categories", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "placement") return res.status(403).json({ error: "Placement Coordinator only" });
    const { categories, topCategory } = req.body;
    const set = { updatedAt: new Date() };
    if (categories !== undefined) set.categories = categories;
    if (topCategory !== undefined) set.topCategory = topCategory;
    await col("resumes", "resume").updateOne({ regNo: req.params.regNo }, { $set: set });
    const updated = await col("resumes", "resume").findOne({ regNo: req.params.regNo });
    const { data, ...rest } = updated;
    res.json(toId(rest));
  } catch {
    res.status(500).json({ error: "Failed to update categories" });
  }
});

// DELETE /api/resumes/:regNo
router.delete("/:regNo", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "placement") return res.status(403).json({ error: "Placement Coordinator only" });
    await col("resumes", "resume").deleteOne({ regNo: req.params.regNo });
    res.json({ message: "Resume deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete resume" });
  }
});

module.exports = router;

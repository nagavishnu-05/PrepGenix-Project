"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { col, toId, id } = require("../db");
const { authenticate } = require("../middleware/auth");
const { rowsFromBuffer, rowsFromFile, parseAptitudeQuestions, parseCodingQuestions, parseJsonQuestions, normalizeHeader } = require("../excel-parse");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const AIML_DATA = path.join(__dirname, "..", "..", "..", "AIML", "data");

function staffOnly(req, res) {
  if (req.user.role !== "staff") {
    res.status(403).json({ error: "Staff Coordinator only" });
    return false;
  }
  return true;
}

// GET /api/questions?type=&format=&difficulty=&search=
router.get("/", authenticate, async (req, res) => {
  try {
    const { type, format, difficulty, search } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (format) filter.format = format;
    if (difficulty) filter.difficulty = difficulty;
    if (search) {
      const rx = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: rx }, { description: rx }, { tags: rx }];
    }
    const questions = await col("questions").find(filter).sort({ createdAt: -1 }).toArray();
    res.json(questions.map(toId));
  } catch {
    res.status(500).json({ error: "Failed to fetch questions" });
  }
});

// GET /api/questions/aiml-files  (staff)
router.get("/aiml-files", authenticate, async (_req, res) => {
  try {
    if (!staffOnly(_req, res)) return;
    if (!fs.existsSync(AIML_DATA)) return res.json([]);
    const files = fs.readdirSync(AIML_DATA).filter((f) => /\.(xlsx|xls|csv|json)$/i.test(f));
    res.json(files);
  } catch {
    res.status(500).json({ error: "Failed to list AIML files" });
  }
});

// POST /api/questions/aiml-import  (staff) { file }
router.post("/aiml-import", authenticate, async (req, res) => {
  try {
    if (!staffOnly(req, res)) return;
    const { file } = req.body;
    if (!file) return res.status(400).json({ error: "File name required" });
    const filePath = path.join(AIML_DATA, file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found in AIML/data" });
    let parsed = [];
    if (/\.json$/i.test(file)) {
      parsed = parseJsonQuestions(filePath);
    } else {
      const rows = rowsFromFile(filePath);
      const first = rows[0] || {};
      const keys = Object.keys(first).map(normalizeHeader);
      if (keys.some((k) => k.startsWith("testcase") || k.startsWith("hardtestcase"))) {
        parsed = parseCodingQuestions(rows);
      } else {
        parsed = parseAptitudeQuestions(rows);
      }
    }
    if (!parsed.length) return res.status(400).json({ error: "No questions found in file" });
    const withMeta = parsed.map((q) => ({ ...q, sourceFile: file, createdBy: req.user.userId, createdAt: new Date(), updatedAt: new Date() }));
    await col("questions").insertMany(withMeta);
    res.status(201).json({ message: "Imported from AIML", count: withMeta.length });
  } catch (err) {
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

// POST /api/questions/import  (staff) excel upload, form field "kind" = aptitude | coding
router.post("/import", authenticate, upload.single("file"), async (req, res) => {
  try {
    if (!staffOnly(req, res)) return;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const kind = (req.body.kind || "aptitude").toLowerCase();
    const rows = rowsFromBuffer(req.file.buffer);
    const parsed = kind === "coding" ? parseCodingQuestions(rows) : parseAptitudeQuestions(rows);
    if (!parsed.length) return res.status(400).json({ error: "No valid questions found in file" });
    const withMeta = parsed.map((q) => ({ ...q, createdBy: req.user.userId, createdAt: new Date(), updatedAt: new Date() }));
    await col("questions").insertMany(withMeta);
    res.status(201).json({ message: "Import complete", count: withMeta.length, samples: withMeta.slice(0, 3).map((q) => ({ title: q.title, type: q.type, format: q.format, difficulty: q.difficulty })) });
  } catch (err) {
    res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

// GET /api/questions/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const question = await col("questions").findOne({ _id: id(req.params.id) });
    if (!question) return res.status(404).json({ error: "Question not found" });
    res.json(toId(question));
  } catch {
    res.status(500).json({ error: "Failed to fetch question" });
  }
});

// POST /api/questions  (staff) manual create
router.post("/", authenticate, async (req, res) => {
  try {
    if (!staffOnly(req, res)) return;
    const body = req.body;
    if (!body.title || !body.type) return res.status(400).json({ error: "title and type are required" });
    const doc = {
      type: body.type === "coding" ? "coding" : "aptitude",
      format: body.format || "mcq",
      subject: body.subject || "quantitative",
      title: String(body.title).trim(),
      description: body.description || "",
      codeSnippet: body.codeSnippet || "",
      options: body.options || [],
      correctOption: body.correctOption ?? null,
      answer: body.answer != null ? String(body.answer).trim() : null,
      language: (body.language || "javascript").toLowerCase(),
      difficulty: ["easy", "medium", "hard"].includes(body.difficulty) ? body.difficulty : "easy",
      points: Number(body.points) || (body.type === "coding" ? 10 : 1),
      constraints: body.constraints || [],
      inputFormat: body.inputFormat || "",
      outputFormat: body.outputFormat || "",
      examples: body.examples || [],
      testCases: (body.testCases || []).map((tc, i) => ({ orderIndex: i, input: tc.input ?? "", expectedOutput: tc.expectedOutput ?? "", isHard: !!tc.isHard })),
      tags: body.tags || [],
      source: "manual",
      createdBy: req.user.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await col("questions").insertOne(doc);
    res.status(201).json(toId({ ...doc, _id: result.insertedId }));
  } catch {
    res.status(500).json({ error: "Failed to create question" });
  }
});

// PUT /api/questions/:id  (staff)
router.put("/:id", authenticate, async (req, res) => {
  try {
    if (!staffOnly(req, res)) return;
    const { title, description, codeSnippet, options, correctOption, answer, difficulty, points, constraints, inputFormat, outputFormat, examples, testCases, tags, language, subject, format } = req.body;
    const set = { updatedAt: new Date() };
    if (title !== undefined) set.title = String(title).trim();
    if (description !== undefined) set.description = description;
    if (codeSnippet !== undefined) set.codeSnippet = codeSnippet;
    if (options !== undefined) set.options = options;
    if (correctOption !== undefined) set.correctOption = correctOption;
    if (answer !== undefined) set.answer = answer;
    if (difficulty !== undefined) set.difficulty = difficulty;
    if (points !== undefined) set.points = Number(points);
    if (constraints !== undefined) set.constraints = constraints;
    if (inputFormat !== undefined) set.inputFormat = inputFormat;
    if (outputFormat !== undefined) set.outputFormat = outputFormat;
    if (examples !== undefined) set.examples = examples;
    if (testCases !== undefined) set.testCases = testCases.map((tc, i) => ({ orderIndex: i, input: tc.input ?? "", expectedOutput: tc.expectedOutput ?? "", isHard: !!tc.isHard }));
    if (tags !== undefined) set.tags = tags;
    if (language !== undefined) set.language = language;
    if (subject !== undefined) set.subject = subject;
    if (format !== undefined) set.format = format;
    const question = await col("questions").findOneAndUpdate({ _id: id(req.params.id) }, { $set: set }, { returnDocument: "after" });
    if (!question) return res.status(404).json({ error: "Question not found" });
    res.json(toId(question));
  } catch {
    res.status(500).json({ error: "Failed to update question" });
  }
});

// DELETE /api/questions/:id  (staff)
router.delete("/:id", authenticate, async (req, res) => {
  try {
    if (!staffOnly(req, res)) return;
    await col("questions").deleteOne({ _id: id(req.params.id) });
    res.json({ message: "Question deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete question" });
  }
});

module.exports = router;

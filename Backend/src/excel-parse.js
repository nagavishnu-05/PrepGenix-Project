"use strict";

const fs = require("fs");
const path = require("path");

let XLSX = null;
function xlsx() {
  if (!XLSX) XLSX = require("xlsx");
  return XLSX;
}

function normalizeHeader(h) {
  return String(h == null ? "" : h).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cellValue(v) {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

// Read a buffer (xlsx/xls) into an array of row objects keyed by normalized header.
function rowsFromBuffer(buffer) {
  const wb = xlsx().read(buffer, { type: "buffer", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const raw = xlsx().utils.sheet_to_json(sheet, { defval: "" });
  return raw.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[normalizeHeader(k)] = cellValue(v);
    return out;
  });
}

function rowsFromFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  return rowsFromBuffer(buffer);
}

// ---- Students ----
function parseStudents(rows) {
  const students = [];
  for (const r of rows) {
    const regNo = r.regno || r.registernumber || r.registerationnumber || r.regnum;
    const rollNo = r.rollno || r.rollnumber || r.rollnum;
    if (!regNo && !rollNo) continue;
    const name = r.name || r.studentname;
    if (!name) continue;
    students.push({
      regNo: String(regNo).trim(),
      rollNo: String(rollNo).trim(),
      name: String(name).trim(),
      email: r.email || "",
      mobile: r.mobile || r.mobilenumber || r.phonenumber || r.phone || "",
      tenth: r.tenth || r.tenthpercentage || r.sslc || r.sslcpercentage || "",
      twelfth: r.twelfth || r.twelfthpercentage || r.hsc || r.hscpercentage || r.plustwo || "",
      cgpa: r.cgpa || r.gpa || "",
      department: r.department || r.branch || r.dept || "",
      batch: r.batch || r.yearsofstudy || r.year || "",
    });
  }
  return students;
}

// ---- Aptitude questions ----
const FORMAT_MAP = {
  mcq: "mcq",
  multiplechoice: "mcq",
  singlechoice: "mcq",
  fillup: "fillup",
  fillupblank: "fillup",
  fillintheblank: "fillup",
  code: "code_snippet",
  codesnippet: "code_snippet",
  snippet: "code_snippet",
};

function mapFormat(v) {
  const key = String(v || "").toLowerCase().replace(/[^a-z]/g, "");
  return FORMAT_MAP[key] || null;
}

function parseAptitudeQuestions(rows) {
  const questions = [];
  rows.forEach((r, i) => {
    const title = r.title || r.questionname || r.question;
    if (!title) return;
    const format = mapFormat(r.format || r.type || "mcq") || "mcq";
    const options = ["a", "b", "c", "d"].map((k) => r[`option${k}`] || "").filter((v) => v);
    let correctOption = null;
    let answer = null;
    if (format === "mcq") {
      const raw = String(r.correctoption || r.answer || r.correctanswer || "").trim();
      if (/^[a-d]$/i.test(raw)) {
        correctOption = raw.toLowerCase().charCodeAt(0) - 97;
      } else if (raw) {
        const idx = options.findIndex((o) => o.toLowerCase() === raw.toLowerCase());
        correctOption = idx >= 0 ? idx : null;
      }
      if (correctOption == null) correctOption = 0;
    } else {
      answer = cellValue(r.answer || r.correctanswer || r.correctoption);
    }
    const diff = String(r.difficulty || "easy").toLowerCase();
    questions.push({
      type: "aptitude",
      format,
      subject: r.subject || r.category || "quantitative",
      title: String(title).trim(),
      description: cellValue(r.description || r.questiontext || r.question),
      codeSnippet: cellValue(r.codesnippet || r.snippet || r.code),
      options,
      correctOption,
      answer: answer != null ? String(answer).trim() : null,
      difficulty: ["easy", "medium", "hard"].includes(diff) ? diff : "easy",
      points: Number(r.points || r.marks || 1) || 1,
      tags: String(r.tags || r.topic || "")
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean),
      source: "excel",
      rowIndex: i,
    });
  });
  return questions;
}

// ---- Coding questions ----
function parseCodingQuestions(rows) {
  const questions = [];
  rows.forEach((r, i) => {
    const title = r.title || r.questionname || r.name;
    if (!title) return;
    const testCases = [];
    const hardTestCases = [];
    for (const [key, value] of Object.entries(r)) {
      const m = key.match(/^(testcase|hardtestcase)(\d+)(input|output)$/);
      if (!m) continue;
      const [, kind, numStr, field] = m;
      const num = Number(numStr);
      const target = kind === "hardtestcase" ? hardTestCases : testCases;
      let tc = target.find((t) => t.orderIndex === num);
      if (!tc) {
        tc = { orderIndex: num, input: "", expectedOutput: "", isHard: kind === "hardtestcase" };
        target.push(tc);
      }
      if (field === "input") tc.input = value;
      else tc.expectedOutput = value;
    }
    testCases.sort((a, b) => a.orderIndex - b.orderIndex);
    hardTestCases.sort((a, b) => a.orderIndex - b.orderIndex);
    const diff = String(r.difficulty || "easy").toLowerCase();
    questions.push({
      type: "coding",
      format: "programming",
      title: String(title).trim(),
      description: cellValue(r.description || r.problemstatement || r.problem),
      codeSnippet: cellValue(r.codesnippet || r.snippet || r.startercode),
      language: (r.language || "javascript").toLowerCase(),
      difficulty: ["easy", "medium", "hard"].includes(diff) ? diff : "easy",
      points: Number(r.points || r.marks || 10) || 10,
      constraints: cellValue(r.constraints || r.constraint)
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
      inputFormat: cellValue(r.inputformat || r.input),
      outputFormat: cellValue(r.outputformat || r.output),
      examples: [
        r.exampleinput1 || r.example1input
          ? { input: cellValue(r.exampleinput1 || r.example1input), output: cellValue(r.exampleoutput1 || r.example1output), explanation: cellValue(r.exampleexplanation1 || "") }
          : null,
        r.exampleinput2 || r.example2input
          ? { input: cellValue(r.exampleinput2 || r.example2input), output: cellValue(r.exampleoutput2 || r.example2output), explanation: cellValue(r.exampleexplanation2 || "") }
          : null,
      ].filter(Boolean),
      testCases: [...testCases, ...hardTestCases].filter((t) => t.input !== "" || t.expectedOutput !== ""),
      tags: String(r.tags || r.topic || r.category || "")
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean),
      source: "excel",
      rowIndex: i,
    });
  });
  return questions;
}

// ---- AIML JSON import ----
function parseJsonQuestions(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const list = Array.isArray(data) ? data : data.questions || [];
  return list.map((q, i) => {
    const isCoding = (q.type || "").toLowerCase() === "coding" || !!q.testCases || !!q.language;
    if (isCoding) {
      return {
        type: "coding",
        format: "programming",
        title: String(q.title || q.name || `Question ${i + 1}`).trim(),
        description: q.description || q.statement || "",
        codeSnippet: q.codeSnippet || q.starterCode || "",
        language: (q.language || "javascript").toLowerCase(),
        difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "easy",
        points: Number(q.points || q.marks || 10) || 10,
        constraints: q.constraints || [],
        inputFormat: q.inputFormat || "",
        outputFormat: q.outputFormat || "",
        examples: q.examples || [],
        testCases: (q.testCases || []).map((t, j) => ({ orderIndex: j, input: t.input, expectedOutput: t.expectedOutput || t.output, isHard: !!t.isHard })),
        tags: q.tags || [],
        source: "aiml",
        rowIndex: i,
      };
    }
    return {
      type: "aptitude",
      format: q.format === "fillup" ? "fillup" : q.format === "code_snippet" ? "code_snippet" : "mcq",
      subject: q.subject || q.category || "quantitative",
      title: String(q.title || q.question || q.name || `Question ${i + 1}`).trim(),
      description: q.description || q.questionText || q.question || "",
      codeSnippet: q.codeSnippet || "",
      options: q.options || [],
      correctOption: typeof q.correctOption === "number" ? q.correctOption : null,
      answer: q.answer || null,
      difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "easy",
      points: Number(q.points || q.marks || 1) || 1,
      tags: q.tags || [],
      source: "aiml",
      rowIndex: i,
    };
  });
}

module.exports = {
  rowsFromBuffer,
  rowsFromFile,
  parseStudents,
  parseAptitudeQuestions,
  parseCodingQuestions,
  parseJsonQuestions,
  normalizeHeader,
};

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

function extractLooseQuestionValues(row) {
  const entries = Object.entries(row || {})
    .sort(([a], [b]) => {
      const na = Number(String(a).match(/(\d+)$/)?.[1] || "0");
      const nb = Number(String(b).match(/(\d+)$/)?.[1] || "0");
      return na - nb;
    })
    .map(([, v]) => cellValue(v))
    .filter((v) => v !== "");
  return entries;
}

function parseLooseAptitudeRow(row, i) {
  const values = extractLooseQuestionValues(row);
  if (values.length < 2) return null;

  const questionText = String(values[0]).trim();
  if (!questionText) return null;

  const optionValues = values.slice(1).map((v) => String(v).trim()).filter(Boolean);
  if (!optionValues.length) return null;

  const cleanOptions = Array.from(new Set(optionValues)).slice(0, 4);
  if (!cleanOptions.length) return null;

  return {
    type: "aptitude",
    format: "mcq",
    subject: "quantitative",
    title: questionText,
    description: questionText,
    codeSnippet: "",
    options: cleanOptions,
    correctOption: 0,
    answer: null,
    difficulty: "easy",
    points: 1,
    tags: [],
    source: "excel-fallback",
    rowIndex: i,
  };
}

function parseAptitudeQuestions(rows) {
  const questions = [];
  rows.forEach((r, i) => {
    const title = r.title || r.questionname || r.question || r.ques || r.q || r.questiontext || r.questiontext1;
    if (!title) {
      const fallback = parseLooseAptitudeRow(r, i);
      if (fallback) questions.push(fallback);
      return;
    }
    const format = mapFormat(r.format || r.type || "mcq") || "mcq";
    const options = ["a", "b", "c", "d", "e"].map((k) => r[`option${k}`] || r[`opt${k}`] || "").filter((v) => v);
    let correctOption = null;
    let answer = null;
    if (format === "mcq") {
      const raw = String(r.correctoption || r.answer || r.correctanswer || r.corrans || "").trim();
      if (/^[a-e]$/i.test(raw)) {
        correctOption = raw.toLowerCase().charCodeAt(0) - 97;
      } else if (raw) {
        const idx = options.findIndex((o) => o.toLowerCase() === raw.toLowerCase());
        correctOption = idx >= 0 ? idx : null;
      }
      if (correctOption == null && options.length) correctOption = 0;
    } else {
      answer = cellValue(r.answer || r.correctanswer || r.correctoption || r.corrans);
    }
    const diff = String(r.difficulty || "easy").toLowerCase();
    questions.push({
      type: "aptitude",
      format,
      subject: r.subject || r.category || "quantitative",
      title: String(title).trim(),
      description: cellValue(r.description || r.questiontext || r.question || title),
      codeSnippet: restoreCodeFormatting(cellValuePreserveIndent(r.codesnippet || r.snippet || r.code)),
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
      description: restoreCodeFormatting(cellValue(r.description || r.problemstatement || r.problem)),
      codeSnippet: restoreCodeFormatting(cellValuePreserveIndent(r.codesnippet || r.snippet || r.startercode)),
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

function cellValuePreserveIndent(v) {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  return String(v).replace(/\r\n/g, "\n").trimEnd();
}

// Attempt to restore code formatting when Excel has stripped newlines.
// Inserts line breaks before/after common code tokens so single-line code
// like "#include<stdio.h>int main(){int a=5;switch(a){..." becomes readable.
function restoreCodeFormatting(code) {
  if (!code || typeof code !== "string") return code;
  const trimmed = code.trim();
  if (!trimmed) return trimmed;
  // If it already has multiple newlines, assume formatting is intact.
  if ((trimmed.match(/\n/g) || []).length >= 3) return trimmed;

  let s = trimmed;

  // Insert newline before preprocessor directives (but not inside strings).
  s = s.replace(/([;}\)])\s*(#\s*(?:include|define|ifdef|ifndef|endif|pragma|if|else|elif|undef)\b)/g, "$1\n$2");
  // Insert newline after opening braces (C/Java/JS style block starts).
  s = s.replace(/\{(\s*)/g, " {\n");
  // Insert newline before closing braces.
  s = s.replace(/(\s*)\}/g, "\n}");
  // Insert newline before standalone keywords that start statements.
  s = s.replace(/;\s*(case\s+\w+|default|return\b|if\b|else\b|for\b|while\b|switch\b|break|continue|int\b|float\b|double\b|char\b|void\b|long\b|short\b|unsigned\b|struct\b|class\b|public\b|private\b|static\b)/g, ";\n$1");
  // Insert newline after semicolons that are followed by variable declarations or assignments.
  s = s.replace(/;\s*([a-zA-Z_]\w*\s*[=\[;])/g, ";\n$1");
  // Insert newline before printf/scanf/cout/cin and similar.
  s = s.replace(/;\s*(printf|scanf|cout|cin|System\.out|print|println|console\.log)\b/g, ";\n$1");
  // Clean up: collapse multiple blank lines into one.
  s = s.replace(/\n{3,}/g, "\n\n");
  // Ensure each line is properly trimmed of leading/trailing spaces per line but preserve indentation.
  s = s.split("\n").map(line => line.trimEnd()).join("\n");

  return s.trimEnd();
}

function parseTestCaseCellValue(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;

  // Case 1: Labeled Input/Output (e.g. Input: 5\nOutput: 15)
  const inputMatch = str.match(/input:\s*([\s\S]*?)(?=output:|$)/i);
  const outputMatch = str.match(/output:\s*([\s\S]*)$/i);
  if (inputMatch && outputMatch) {
    return {
      input: inputMatch[1].trim(),
      expectedOutput: outputMatch[1].trim()
    };
  }

  // Case 2: Explicit delimiters like => or ->
  if (str.includes("=>")) {
    const parts = str.split("=>");
    return { input: parts[0].trim(), expectedOutput: parts[1].trim() };
  }
  if (str.includes("->")) {
    const parts = str.split("->");
    return { input: parts[0].trim(), expectedOutput: parts[1].trim() };
  }

  // Case 3: Labeled output only or split by last line
  if (str.includes("\n")) {
    const lines = str.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    if (lines.length >= 2) {
      const expectedOutput = lines.pop();
      const input = lines.join("\n");
      return { input, expectedOutput };
    }
  }

  // Case 4: Labeled or simple split by space/pipe if it's a single line
  if (str.includes("|")) {
    const parts = str.split("|");
    return { input: parts[0].trim(), expectedOutput: parts[1].trim() };
  }

  // Default fallback: entire string is input, expected output is empty
  return { input: str, expectedOutput: "" };
}

function parseAptitudeMcqManual(rows) {
  const questions = [];
  rows.forEach((r, i) => {
    const title = cellValuePreserveIndent(r.ques || r.question || r.q || r.title || "");
    if (!title) {
      const fallback = parseLooseAptitudeRow(r, i);
      if (fallback) questions.push(fallback);
      return;
    }

    const options = [
      cellValuePreserveIndent(r.opta || r.optiona || ""),
      cellValuePreserveIndent(r.optb || r.optionb || ""),
      cellValuePreserveIndent(r.optc || r.optionc || ""),
      cellValuePreserveIndent(r.optd || r.optiond || ""),
      cellValuePreserveIndent(r.opte || r.optione || ""),
    ].filter(v => v !== "");

    let correctOption = null;
    const rawAns = String(r.corrans || r.correctanswer || r.correctoption || r.answer || "").trim().toLowerCase();
    
    if (/^[a-e]$/i.test(rawAns)) {
      correctOption = rawAns.charCodeAt(0) - 97;
    } else if (rawAns) {
      const idx = options.findIndex((o) => o.toLowerCase().trim() === rawAns);
      correctOption = idx >= 0 ? idx : 0;
    }
    if (correctOption == null && options.length) correctOption = 0;

    questions.push({
      type: "aptitude",
      format: "mcq",
      subject: r.subject || r.category || "quantitative",
      title: title,
      description: title,
      codeSnippet: "",
      options,
      correctOption,
      answer: null,
      difficulty: "easy",
      points: 1,
      tags: r.tags ? String(r.tags).split(",").map(t => t.trim()) : ["mcq"],
      source: "excel-manual",
      rowIndex: i,
    });
  });
  return questions;
}

function parseAptitudeFillupManual(rows) {
  const questions = [];
  rows.forEach((r, i) => {
    const title = cellValuePreserveIndent(r.ques || r.question || r.q || r.title || "");
    if (!title) return;

    const answer = String(r.corrans || r.correctanswer || r.correctoption || r.answer || "").trim();

    questions.push({
      type: "aptitude",
      format: "fillup",
      subject: r.subject || r.category || "verbal",
      title: title,
      description: title,
      codeSnippet: "",
      options: [],
      correctOption: null,
      answer: answer,
      difficulty: "easy",
      points: 1,
      tags: r.tags ? String(r.tags).split(",").map(t => t.trim()) : ["fillup"],
      source: "excel-manual",
      rowIndex: i,
    });
  });
  return questions;
}

function parseCodingManual(rows) {
  const questions = [];
  rows.forEach((r, i) => {
    const title = restoreCodeFormatting(cellValuePreserveIndent(r.ques || r.question || r.q || r.title || ""));
    if (!title) return;

    const description = restoreCodeFormatting(cellValuePreserveIndent(r.description || ""));
    const inputFormat = cellValuePreserveIndent(r.inputformat || "");
    const outputFormat = cellValuePreserveIndent(r.outputformat || "");
    
    const constraintsVal = cellValuePreserveIndent(r.constraints || "");
    const constraints = constraintsVal.split("\n").map(s => s.trimEnd()).filter(Boolean);

    const testCases = [];
    
    // Parse Test Cases 1-5
    for (let num = 1; num <= 5; num++) {
      const cellVal = r[`testcase${num}`];
      if (cellVal) {
        const tc = parseTestCaseCellValue(cellVal);
        if (tc) {
          testCases.push({
            orderIndex: testCases.length,
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isHard: false
          });
        }
      }
    }

    // Parse Edge Cases 1-2
    for (let num = 1; num <= 2; num++) {
      const cellVal = r[`edgecase${num}`] || r[`edgecases${num}`];
      if (cellVal) {
        const tc = parseTestCaseCellValue(cellVal);
        if (tc) {
          testCases.push({
            orderIndex: testCases.length,
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            isHard: true
          });
        }
      }
    }

    const tagsVal = String(r.tags || "").trim();
    const tags = tagsVal ? tagsVal.split(/[,;]/).map(t => t.trim()).filter(Boolean) : ["coding"];

    questions.push({
      type: "coding",
      format: "programming",
      title: title,
      description: description,
      inputFormat: inputFormat,
      outputFormat: outputFormat,
      constraints: constraints,
      examples: testCases.slice(0, 2).map(tc => ({
        input: tc.input,
        output: tc.expectedOutput,
        explanation: ""
      })),
      testCases: testCases,
      tags: tags,
      difficulty: "medium", // default
      points: 10, // default
      starterCode: {}, // will use our fallbacks in store
      source: "excel-manual",
      rowIndex: i,
    });
  });
  return questions;
}

module.exports = {
  rowsFromBuffer,
  rowsFromFile,
  parseStudents,
  parseAptitudeQuestions,
  parseCodingQuestions,
  parseJsonQuestions,
  normalizeHeader,
  parseAptitudeMcqManual,
  parseAptitudeFillupManual,
  parseCodingManual,
};

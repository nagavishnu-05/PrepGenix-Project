"use strict";

const express = require("express");
const { authenticate } = require("../middleware/auth");
const { runCode, gradeSubmission, LANGUAGES } = require("../judge");
const judge0 = require("../judge/judge0");

const router = express.Router();

// GET /api/judge/languages -> languages the candidate can pick
router.get("/languages", authenticate, async (req, res) => {
  const config = judge0.readConfig();
  const ids = config.enabled ? await judge0.resolveLanguageIds(config) : null;
  res.json({
    engine: config.enabled ? "judge0" : "local",
    languages: LANGUAGES.map((l) => ({
      key: l.key,
      label: l.label,
      monaco: l.monaco,
      judge0Id: ids ? ids[l.key] : l.judge0Id,
    })),
  });
});

// POST /api/judge/run  { code, language, input }  -> run without grading
router.post("/run", authenticate, async (req, res) => {
  try {
    const { code, language, input, testCases } = req.body;
    if (!code || !String(code).trim()) return res.status(400).json({ error: "Code is required" });
    if (testCases !== undefined) {
      if (!Array.isArray(testCases) || testCases.length === 0 || testCases.length > 10) {
        return res.status(400).json({ error: "Provide between 1 and 10 test cases" });
      }
      if (testCases.some((tc) => !tc || typeof tc.input !== "string" || typeof tc.expectedOutput !== "string")) {
        return res.status(400).json({ error: "Each test case must include string input and expectedOutput values" });
      }
      const result = await gradeSubmission({
        code,
        language: language || "python",
        testCases: testCases.map((tc, index) => ({ ...tc, orderIndex: index })),
      });
      return res.json({
        engine: result.engine,
        output: `Passed ${result.passed}/${result.total} visible test cases`,
        testCases: result.results,
        passed: result.passed,
        total: result.total,
        executionTime: result.executionTime,
        status: result.passed === result.total ? "success" : "wrong_answer",
      });
    }
    const result = await runCode({ code, language: language || "python", stdin: input || "" });
    res.json({
      engine: result.engine || "local",
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      compileOutput: result.compileOutput || "",
      message: result.message || "",
      warning: result.warning || null,
      exitCode: result.exitCode,
      timedOut: !!result.timedOut,
      status: result.ok ? "success" : result.timedOut ? "timeout" : result.error || "error",
      statusText: result.statusText || null,
      time: result.time || null,
      memoryKb: result.memoryKb || 0,
      token: result.token || null,
    });
  } catch (err) {
    res.status(500).json({ error: `Execution failed: ${err.message}` });
  }
});

module.exports = router;
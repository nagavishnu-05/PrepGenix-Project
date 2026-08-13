"use strict";

const express = require("express");
const { authenticate } = require("../middleware/auth");
const { runCode } = require("../judge");

const router = express.Router();

// POST /api/judge/run  { code, language, input }  -> run without grading
router.post("/run", authenticate, async (req, res) => {
  try {
    const { code, language, input } = req.body;
    if (!code) return res.status(400).json({ error: "Code is required" });
    const result = await runCode({ code, language: language || "javascript", stdin: input || "" });
    res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      status: result.ok ? "success" : result.timedOut ? "timeout" : "error",
    });
  } catch (err) {
    res.status(500).json({ error: `Execution failed: ${err.message}` });
  }
});

module.exports = router;

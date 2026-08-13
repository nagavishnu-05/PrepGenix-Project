"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SUPPORTED = {
  javascript: { ext: "js", cmd: () => process.execPath, label: "JavaScript" },
  javascriptreact: { ext: "js", cmd: () => process.execPath, label: "JavaScript" },
  js: { ext: "js", cmd: () => process.execPath, label: "JavaScript" },
  node: { ext: "js", cmd: () => process.execPath, label: "JavaScript" },
  python: { ext: "py", cmd: () => "python", label: "Python" },
  py: { ext: "py", cmd: () => "python", label: "Python" },
};

function normalizeOutput(output) {
  return String(output || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function runCode({ language, code, stdin, timeoutMs = 5000, maxOutput = 2 * 1024 * 1024 }) {
  return new Promise((resolve) => {
    const runner = SUPPORTED[String(language || "").toLowerCase()];
    if (!runner) {
      return resolve({ ok: false, stdout: "", stderr: `Unsupported language: ${language}`, exitCode: -1, timedOut: false, error: "unsupported_language" });
    }
    let tmpDir = null;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeassess-"));
      const file = path.join(tmpDir, `main.${runner.ext}`);
      fs.writeFileSync(file, code || "");
      const cmd = runner.cmd();
      const child = spawn(cmd, [file], { cwd: tmpDir, windowsHide: true });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      const timer = setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGKILL"); } catch { /* noop */ }
      }, timeoutMs);

      child.stdout.on("data", (d) => {
        stdout += d;
        if (stdout.length > maxOutput) { stdout = stdout.slice(0, maxOutput); try { child.kill("SIGKILL"); } catch { /* noop */ } }
      });
      child.stderr.on("data", (d) => {
        stderr += d;
        if (stderr.length > maxOutput) { stderr = stderr.slice(0, maxOutput); try { child.kill("SIGKILL"); } catch { /* noop */ } }
      });

      const finish = (payload) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ } }
        resolve(payload);
      };

      child.on("error", (err) => {
        finish({ ok: false, stdout, stderr: String(err.message || err), exitCode: -1, timedOut, error: "spawn_error" });
      });
      child.on("close", (code) => {
        finish({ ok: code === 0, stdout, stderr, exitCode: code, timedOut, error: timedOut ? "timeout" : null });
      });

      child.stdin.on("error", () => { /* EPIPE when program exits early */ });
      child.stdin.write(stdin ?? "");
      child.stdin.end();
    } catch (err) {
      if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* noop */ } }
      resolve({ ok: false, stdout: "", stderr: String(err.message || err), exitCode: -1, timedOut: false, error: "run_error" });
    }
  });
}

async function gradeSubmission({ code, language, testCases, timeoutMs = 5000 }) {
  const results = [];
  let passed = 0;
  let totalTime = 0;
  for (const tc of testCases || []) {
    const start = Date.now();
    const run = await runCode({ code, language, stdin: tc.input, timeoutMs });
    totalTime += Date.now() - start;
    const expected = normalizeOutput(tc.expectedOutput);
    const got = normalizeOutput(run.stdout);
    const ok = !run.timedOut && run.exitCode === 0 && got === expected;
    if (ok) passed += 1;
    results.push({
      index: tc.orderIndex ?? tc.index ?? 0,
      isHard: !!tc.isHard,
      passed: ok,
      timedOut: run.timedOut,
      stdout: got.slice(0, 600),
      expected: expected.slice(0, 300),
      error: run.stderr.slice(0, 300),
      executionTime: Date.now() - start,
    });
  }
  return {
    passed,
    total: (testCases || []).length,
    results,
    executionTime: totalTime,
    memoryUsage: 0,
  };
}

module.exports = { runCode, gradeSubmission, SUPPORTED };

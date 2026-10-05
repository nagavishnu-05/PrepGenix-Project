"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const judge0 = require("./judge0");

// Local fallback toolchains. Judge0 is the primary engine; these are only used
// when Judge0 is not configured (or unreachable) and the host has the compiler.
const SUPPORTED = {
  python: { ext: "py", cmd: "python", label: "Python", isCompiled: false },
  py: { ext: "py", cmd: "python", label: "Python", isCompiled: false },
  javascript: { ext: "js", cmd: "node", label: "JavaScript", isCompiled: false },
  js: { ext: "js", cmd: "node", label: "JavaScript", isCompiled: false },
  c: { ext: "c", label: "C", isCompiled: true },
  cpp: { ext: "cpp", label: "C++", isCompiled: true },
  java: { ext: "java", label: "Java", isCompiled: true }
};

// Languages offered to candidates, in menu order.
const LANGUAGES = [
  { key: "c", label: "C", monaco: "c", judge0Id: judge0.LANGUAGE_IDS.c },
  { key: "cpp", label: "C++", monaco: "cpp", judge0Id: judge0.LANGUAGE_IDS.cpp },
  { key: "java", label: "Java", monaco: "java", judge0Id: judge0.LANGUAGE_IDS.java },
  { key: "python", label: "Python", monaco: "python", judge0Id: judge0.LANGUAGE_IDS.python },
  { key: "javascript", label: "JavaScript", monaco: "javascript", judge0Id: judge0.LANGUAGE_IDS.javascript }
];

function normalizeOutput(output) {
  return String(output || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function runCodeLocally({ language, code, stdin, timeoutMs = 5000, maxOutput = 2 * 1024 * 1024 }) {
  return new Promise((resolve) => {
    const langKey = String(language || "").toLowerCase().trim();
    const runner = SUPPORTED[langKey];
    if (!runner) {
      return resolve({ ok: false, stdout: "", stderr: `Unsupported language: ${language}`, exitCode: -1, timedOut: false, error: "unsupported_language" });
    }
    let tmpDir = null;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeassess-"));
      
      let executablePath = "";
      let runCmd = "";
      let runArgs = [];
      
      if (runner.isCompiled) {
        if (langKey === "c") {
          const srcFile = path.join(tmpDir, "main.c");
          fs.writeFileSync(srcFile, code || "");
          const exeName = os.platform() === "win32" ? "main.exe" : "main";
          executablePath = path.join(tmpDir, exeName);
          
          const compile = spawnSync("gcc", ["main.c", "-o", exeName], { cwd: tmpDir, timeout: 5000, windowsHide: true });
          if (compile.status !== 0) {
            const compileError = (compile.stderr || compile.stdout || compile.error?.message || "Compilation failed").toString();
            return resolve({ ok: false, stdout: "", stderr: compileError, exitCode: -1, timedOut: false, error: "compilation_error" });
          }
          runCmd = executablePath;
          runArgs = [];
        } else if (langKey === "cpp") {
          const srcFile = path.join(tmpDir, "main.cpp");
          fs.writeFileSync(srcFile, code || "");
          const exeName = os.platform() === "win32" ? "main.exe" : "main";
          executablePath = path.join(tmpDir, exeName);
          
          const compile = spawnSync("g++", ["main.cpp", "-o", exeName], { cwd: tmpDir, timeout: 5000, windowsHide: true });
          if (compile.status !== 0) {
            const compileError = (compile.stderr || compile.stdout || compile.error?.message || "Compilation failed").toString();
            return resolve({ ok: false, stdout: "", stderr: compileError, exitCode: -1, timedOut: false, error: "compilation_error" });
          }
          runCmd = executablePath;
          runArgs = [];
        } else if (langKey === "java") {
          const classMatch = (code || "").match(/public\s+class\s+(\w+)/);
          const className = classMatch ? classMatch[1] : "Solution";
          const srcFile = path.join(tmpDir, `${className}.java`);
          fs.writeFileSync(srcFile, code || "");
          
          const compile = spawnSync("javac", [`${className}.java`], { cwd: tmpDir, timeout: 5000, windowsHide: true });
          if (compile.status !== 0) {
            const compileError = (compile.stderr || compile.stdout || compile.error?.message || "Compilation failed").toString();
            return resolve({ ok: false, stdout: "", stderr: compileError, exitCode: -1, timedOut: false, error: "compilation_error" });
          }
          runCmd = "java";
          runArgs = [className];
        }
      } else {
        const srcFile = path.join(tmpDir, `main.${runner.ext}`);
        fs.writeFileSync(srcFile, code || "");
        runCmd = runner.cmd;
        runArgs = [srcFile];
      }

      const child = spawn(runCmd, runArgs, { cwd: tmpDir, windowsHide: true });
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

/**
 * Runs code on Judge0 when it is configured, otherwise on the local toolchain.
 * Never throws: transport failures degrade into a normal failed result so the
 * candidate sees the problem in the output panel instead of a broken page.
 */
async function runCode(options = {}) {
  const language = options.language || "python";
  if (judge0.isJudge0Enabled()) {
    try {
      return await judge0.runWithJudge0(options);
    } catch (err) {
      const fallback = await runCodeLocally(options);
      fallback.engine = "local";
      fallback.warning = `Judge0 unavailable (${err.message}). Ran on the local fallback toolchain instead.`;
      return fallback;
    }
  }
  const result = await runCodeLocally(options);
  result.engine = result.engine || "local";
  return result;
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
    const ranCleanly = !run.timedOut && (run.engine === "judge0" ? run.ok === true : run.exitCode === 0);
    const ok = ranCleanly && got === expected;
    if (ok) passed += 1;
    results.push({
      index: tc.orderIndex ?? tc.index ?? 0,
      isHard: !!tc.isHard,
      passed: ok,
      timedOut: run.timedOut,
      stdout: got.slice(0, 600),
      expected: expected.slice(0, 300),
      error: run.stderr.slice(0, 300),
      errorKind: run.error || null,
      statusText: run.statusText || null,
      engine: run.engine || "local",
      executionTime: Date.now() - start,
    });
  }
  const engines = new Set(results.map((r) => r.engine));
  return {
    passed,
    total: (testCases || []).length,
    results,
    executionTime: totalTime,
    memoryUsage: 0,
    engine: engines.size === 1 ? [...engines][0] : "mixed",
  };
}

module.exports = { runCode, runCodeLocally, gradeSubmission, SUPPORTED, LANGUAGES };

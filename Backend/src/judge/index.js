"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SUPPORTED = {
  python: { ext: "py", cmd: "python", label: "Python", isCompiled: false },
  py: { ext: "py", cmd: "python", label: "Python", isCompiled: false },
  c: { ext: "c", label: "C", isCompiled: true },
  cpp: { ext: "cpp", label: "C++", isCompiled: true },
  java: { ext: "java", label: "Java", isCompiled: true }
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
            const compileError = (compile.stderr || compile.stdout || "Compilation failed").toString();
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
            const compileError = (compile.stderr || compile.stdout || "Compilation failed").toString();
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
            const compileError = (compile.stderr || compile.stdout || "Compilation failed").toString();
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

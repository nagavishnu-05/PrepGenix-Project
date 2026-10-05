"use strict";

// Judge0 client. Judge0 compiles and executes submissions inside its own
// sandbox, so this API server never needs a local toolchain (gcc/g++/javac/
// node/python) and candidate code can never touch the host machine.

const PLACEHOLDER = /^(your|change[-_ ]?me|placeholder|todo|xxx+)/i;

// Language ids differ between Judge0 deployments, so they are resolved from
// `GET /languages/` at runtime. `preferred` is tried first, then the newest
// matching entry, then `fallbackId`.
const LANGUAGE_SPECS = {
  c: { pattern: /^C \((?!#|\+\+)/, preferred: [50, 49, 48, 45], fallbackId: 50 },
  cpp: { pattern: /^C\+\+ \(/, preferred: [54, 53, 52], fallbackId: 54 },
  java: { pattern: /^Java \(/, preferred: [91, 62], fallbackId: 62 },
  python: { pattern: /^Python \(/, preferred: [92, 100, 71], fallbackId: 71 },
  javascript: { pattern: /^JavaScript \(/, preferred: [97, 93, 63], fallbackId: 63 },
};

const LANGUAGE_IDS = {
  c: LANGUAGE_SPECS.c.fallbackId,
  cpp: LANGUAGE_SPECS.cpp.fallbackId,
  java: LANGUAGE_SPECS.java.fallbackId,
  python: LANGUAGE_SPECS.python.fallbackId,
  javascript: LANGUAGE_SPECS.javascript.fallbackId,
};

let idCache = { at: 0, ids: null };
const ID_CACHE_MS = 10 * 60 * 1000;

function overrideFor(key) {
  return num(process.env[`JUDGE0_LANGUAGE_ID_${key.toUpperCase()}`], 0);
}

function idsFromOverrides() {
  const ids = {};
  for (const key of Object.keys(LANGUAGE_SPECS)) {
    ids[key] = overrideFor(key) || LANGUAGE_SPECS[key].fallbackId;
  }
  return ids;
}

/**
 * Maps our five language keys to Judge0 ids for the host we are talking to.
 * Never throws: an unreachable /languages endpoint falls back to overrides and
 * the built-in defaults.
 */
async function resolveLanguageIds(config) {
  if (idCache.ids && Date.now() - idCache.at < ID_CACHE_MS) return idCache.ids;
  try {
    const res = await request(config, "GET", "/languages/");
    if (!res.ok || !Array.isArray(res.json)) throw new Error(`unexpected response (${res.status})`);
    const ids = {};
    for (const [key, spec] of Object.entries(LANGUAGE_SPECS)) {
      const override = overrideFor(key);
      if (override) {
        ids[key] = override;
        continue;
      }
      const candidates = res.json.filter((l) => spec.pattern.test(String(l.name || "")));
      const preferred = spec.preferred.find((id) => candidates.some((c) => c.id === id));
      ids[key] = preferred || (candidates.length ? Math.max(...candidates.map((c) => c.id)) : spec.fallbackId);
    }
    idCache = { at: Date.now(), ids };
    return ids;
  } catch {
    return idsFromOverrides();
  }
}

const LANGUAGE_LABELS = {
  c: "C",
  cpp: "C++",
  java: "Java",
  python: "Python",
  javascript: "JavaScript",
};

const STATUS_LABELS = {
  1: "In Queue",
  2: "Processing",
  3: "Accepted",
  4: "Wrong Answer",
  5: "Time Limit Exceeded",
  6: "Compilation Error",
  7: "Runtime Error (SIGSEGV)",
  8: "Runtime Error (SIGXFSZ)",
  9: "Runtime Error (SIGFPE)",
  10: "Runtime Error (SIGABRT)",
  11: "Runtime Error (Non-Zero Exit Code)",
  12: "Runtime Error (Other)",
  13: "Internal Error",
  14: "Exec Format Error",
};

const RESULT_FIELDS = "token,stdout,stderr,compile_output,message,exit_code,status_id,status,time,wall_time,memory";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isUsableSecret(value) {
  const v = clean(value);
  return !!v && !PLACEHOLDER.test(v);
}

function num(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readConfig() {
  const baseUrl = clean(process.env.JUDGE0_API_URL).replace(/\/+$/, "");
  const apiKey = clean(process.env.JUDGE0_API_KEY);
  let hostname = "";
  try {
    hostname = baseUrl ? new URL(baseUrl).hostname : "";
  } catch {
    hostname = "";
  }

  const rapidApi = /\.rapidapi\.com$/i.test(hostname);
  const hasKey = isUsableSecret(apiKey);
  const hasUser = isUsableSecret(process.env.JUDGE0_AUTH_USER_TOKEN);

  return {
    baseUrl,
    hostname,
    rapidApi,
    hasKey,
    hasUser,
    // RapidAPI hosts always require a key. Plain Judge0 CE may run without any
    // authentication at all, so a missing key is not a reason to disable it.
    enabled: !!baseUrl && !!hostname && PLACEHOLDER.test(baseUrl) === false && (!rapidApi || hasKey),
    authHeader: clean(process.env.JUDGE0_AUTH_HEADER) || "X-Auth-Token",
    authUserHeader: clean(process.env.JUDGE0_AUTH_USER_HEADER) || "X-Auth-User",
    authUserToken: clean(process.env.JUDGE0_AUTH_USER_TOKEN),
    useWait: clean(process.env.JUDGE0_WAIT).toLowerCase() !== "false",
    timeoutMs: num(process.env.JUDGE0_TIMEOUT_MS, 20000),
    pollIntervalMs: num(process.env.JUDGE0_POLL_INTERVAL_MS, 700),
    cpuTimeLimit: num(process.env.JUDGE0_CPU_TIME_LIMIT, 2),
    wallTimeLimit: num(process.env.JUDGE0_WALL_TIME_LIMIT, 5),
    memoryLimitKb: num(process.env.JUDGE0_MEMORY_LIMIT_KB, 128000),
  };
}

function isJudge0Enabled() {
  return readConfig().enabled;
}

function buildHeaders(config) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (config.rapidApi) {
    headers["X-RapidAPI-Key"] = clean(process.env.JUDGE0_API_KEY);
    if (config.hostname) headers["X-RapidAPI-Host"] = config.hostname;
    return headers;
  }
  if (config.hasKey) headers[config.authHeader] = clean(process.env.JUDGE0_API_KEY);
  if (config.hasUser) headers[config.authUserHeader] = config.authUserToken;
  return headers;
}

async function request(config, method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: buildHeaders(config),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (err) {
    const aborted = err && (err.name === "AbortError" || err.code === "ABORT_ERR");
    const error = new Error(aborted ? "Judge0 request timed out" : `Judge0 request failed: ${err.message}`);
    error.code = aborted ? "timeout" : "network_error";
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeLanguage(language) {
  const key = clean(language).toLowerCase();
  if (key === "py") return "python";
  if (key === "c++" || key === "cplusplus") return "cpp";
  if (key === "node" || key === "nodejs" || key === "js") return "javascript";
  return key;
}

// Compiler output regularly contains bytes that are not valid UTF-8 (GCC and
// Java both emit them), so every request asks Judge0 for base64 payloads and we
// decode here. Without this Judge0 rejects the submission with HTTP 400.
function decodeText(value) {
  if (typeof value !== "string" || value === "") return "";
  const decoded = Buffer.from(value, "base64").toString("utf8");
  return decoded || "";
}

// Mirror image of decodeText for the attributes we send.
function encodeText(value) {
  return Buffer.from(String(value ?? ""), "utf8").toString("base64");
}

function languageIdFor(language, ids = LANGUAGE_IDS) {
  return ids[normalizeLanguage(language)] || null;
}

function toResult(sub, { token, timedOut }) {
  const statusId = num(sub && sub.status_id, 0);
  const statusText = (sub && sub.status && sub.status.description) || STATUS_LABELS[statusId] || "Unknown";
  const stdout = decodeText(sub?.stdout);
  const stderrRaw = decodeText(sub?.stderr);
  const compileOutput = decodeText(sub?.compile_output);
  const message = decodeText(sub?.message);

  let error = null;
  if (timedOut) error = "timeout";
  else if (statusId === 6) error = "compilation_error";
  else if (statusId === 5) error = "timeout";
  else if (statusId === 13) error = "internal_error";
  else if (statusId === 1 || statusId === 2) error = "processing";
  else if (statusId !== 3) error = "runtime_error";

  const stderr = statusId === 6 ? compileOutput || stderrRaw || message : stderrRaw || (statusId === 13 ? message : "");

  return {
    engine: "judge0",
    ok: statusId === 3 && !timedOut,
    stdout,
    stderr,
    compileOutput,
    message,
    exitCode: num(sub?.exit_code, statusId === 3 ? 0 : -1),
    timedOut: timedOut || statusId === 5,
    statusId,
    statusText,
    time: num(sub?.time, 0),
    wallTime: num(sub?.wall_time, 0),
    memoryKb: num(sub?.memory, 0),
    token: (sub && sub.token) || token || null,
    error,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll(config, token, deadlineAt) {
  for (;;) {
    const res = await request(config, "GET", `/submissions/${encodeURIComponent(token)}?base64_encoded=true&fields=${RESULT_FIELDS}`);
    if (!res.ok) {
      const error = new Error(`Judge0 status request failed (${res.status}): ${res.text || "unknown error"}`);
      error.code = "status_error";
      throw error;
    }
    const sub = res.json || {};
    const statusId = num(sub.status_id, 0);
    if (statusId > 2) return sub;
    if (Date.now() >= deadlineAt) return sub;
    await sleep(config.pollIntervalMs);
  }
}

/**
 * Runs a single submission on Judge0.
 * Returns a shape compatible with the local runner used by `runCode`.
 */
async function runWithJudge0({
  code,
  language,
  stdin = "",
  expectedOutput = null,
  cpuTimeLimit,
  wallTimeLimit,
  memoryLimitKb,
} = {}) {
  const config = readConfig();
  if (!config.enabled) {
    const error = new Error("Judge0 is not configured");
    error.code = "not_configured";
    throw error;
  }

  const lang = normalizeLanguage(language);
  const ids = await resolveLanguageIds(config);
  const languageId = ids[lang];
  if (!languageId) {
    const error = new Error(`Unsupported language: ${language}`);
    error.code = "unsupported_language";
    throw error;
  }

  const payload = {
    // Sent base64 encoded because base64_encoded=true is used on every request.
    source_code: encodeText(code),
    language_id: languageId,
    stdin: encodeText(stdin),
    cpu_time_limit: num(cpuTimeLimit, config.cpuTimeLimit),
    wall_time_limit: num(wallTimeLimit, config.wallTimeLimit),
    memory_limit: num(memoryLimitKb, config.memoryLimitKb),
    max_processes_and_or_threads: 60,
    max_file_size: 1024,
    enable_network: false,
  };
  if (expectedOutput !== null && expectedOutput !== undefined) {
    payload.expected_output = encodeText(expectedOutput);
  }

  const deadlineAt = Date.now() + config.timeoutMs;

  if (config.useWait) {
    const res = await request(config, "POST", `/submissions?base64_encoded=true&wait=true&fields=${RESULT_FIELDS}`, payload);
    if (res.ok && res.json) {
      // A token-only response means the host ignored wait and queued the job.
      if (res.json.token && !res.json.status_id) {
        const sub = await poll(config, res.json.token, deadlineAt);
        return toResult(sub, { token: res.json.token, timedOut: Date.now() >= deadlineAt });
      }
      return toResult(res.json, { token: res.json.token, timedOut: false });
    }
    // Hosts with enable_wait_result=false reject the wait flag; retry queued.
    const detail = `${res.json?.detail || res.text || ""}`.toLowerCase();
    if (!res.json?.token && !detail.includes("wait")) {
      const error = new Error(`Judge0 rejected the submission (${res.status}): ${res.json?.detail || res.text || "unknown error"}`);
      error.code = "create_failed";
      throw error;
    }
  }

  const created = await request(config, "POST", "/submissions?base64_encoded=true&wait=false", payload);
  if (!created.ok || !created.json?.token) {
    const error = new Error(`Judge0 rejected the submission (${created.status}): ${created.json?.detail || created.text || "unknown error"}`);
    error.code = "create_failed";
    throw error;
  }
  const token = created.json.token;
  const sub = await poll(config, token, deadlineAt);
  return toResult(sub, { token, timedOut: Date.now() >= deadlineAt });
}

module.exports = {
  runWithJudge0,
  isJudge0Enabled,
  languageIdFor,
  resolveLanguageIds,
  normalizeLanguage,
  readConfig,
  LANGUAGE_IDS,
  LANGUAGE_LABELS,
  STATUS_LABELS,
};
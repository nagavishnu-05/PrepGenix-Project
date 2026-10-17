"use strict";

/**
 * Minimal pluggable LLM client.
 *
 * The interview features (question planning + report writing) work with or
 * without a hosted model. When a provider key is present we call it over HTTP;
 * when none is configured the callers fall back to deterministic, resume-grounded
 * heuristics so the product still functions in a demo / offline environment.
 *
 * Configuration (Backend/.env):
 *   LLM_PROVIDER   openai | anthropic | gemini | none  (default: first provider with a key)
 *   OPENAI_API_KEY / OPENAI_MODEL               (default gpt-4o-mini)
 *   ANTHROPIC_API_KEY / ANTHROPIC_MODEL         (default claude-3-5-sonnet-latest)
 *   GEMINI_API_KEY / GEMINI_MODEL               (default gemini-1.5-flash)
 *   LLM_TIMEOUT_MS                              (default 45000)
 */

const PROVIDERS = ["openai", "anthropic", "gemini"];
const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  gemini: "gemini-1.5-flash",
};
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 45000;

function apiKey(provider) {
  if (provider === "openai") return process.env.OPENAI_API_KEY || "";
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY || "";
  if (provider === "gemini") return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  return "";
}

function modelFor(provider) {
  if (provider === "openai") return process.env.OPENAI_MODEL || DEFAULT_MODELS.openai;
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic;
  if (provider === "gemini") return process.env.GEMINI_MODEL || DEFAULT_MODELS.gemini;
  return null;
}

function resolveProvider() {
  const explicit = String(process.env.LLM_PROVIDER || "").trim().toLowerCase();
  if (explicit === "none" || explicit === "off" || explicit === "disabled") return null;
  if (PROVIDERS.includes(explicit)) return apiKey(explicit) ? explicit : null;
  for (const provider of PROVIDERS) {
    if (apiKey(provider)) return provider;
  }
  return null;
}

/** Non-secret description of the active model, safe to return to clients. */
function info() {
  const provider = resolveProvider();
  return { provider, model: provider ? modelFor(provider) : null, available: Boolean(provider) };
}

function available() {
  return Boolean(resolveProvider());
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Split a {role, content} list into an optional system prompt and chat turns. */
function normalizeMessages(messages, system) {
  const turns = [];
  let systemPrompt = system || "";
  for (const message of messages || []) {
    if (!message || !message.content) continue;
    if (message.role === "system") {
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${message.content}` : message.content;
    } else {
      turns.push({ role: message.role === "assistant" ? "assistant" : "user", content: String(message.content) });
    }
  }
  return { systemPrompt, turns };
}

async function callOpenAI(model, systemPrompt, turns, opts) {
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push(...turns);
  const body = {
    model,
    messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey("openai")}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text().catch(() => "")}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callAnthropic(model, systemPrompt, turns, opts) {
  const body = {
    model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    messages: turns,
  };
  if (systemPrompt) body.system = systemPrompt;
  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey("anthropic"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${await response.text().catch(() => "")}`);
  const data = await response.json();
  return (data.content || []).map((part) => part.text || "").join("").trim();
}

async function callGemini(model, systemPrompt, turns, opts) {
  const contents = turns.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));
  const body = {
    contents,
    generationConfig: {
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey("gemini")}`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text().catch(() => "")}`);
  const data = await response.json();
  return (data.candidates?.[0]?.content?.parts || []).map((part) => part.text || "").join("").trim();
}

/**
 * Send a chat completion. `messages` is an array of {role, content} where role
 * is "system" | "user" | "assistant". Throws if no provider is configured or the
 * upstream call fails; callers are expected to catch and fall back.
 */
async function chat(messages, options = {}) {
  const provider = resolveProvider();
  if (!provider) throw new Error("No LLM provider configured");
  const opts = {
    temperature: options.temperature ?? 0.4,
    maxTokens: options.maxTokens ?? 1600,
    json: Boolean(options.json),
  };
  const { systemPrompt, turns } = normalizeMessages(messages, options.system);
  if (!turns.length) throw new Error("chat requires at least one user message");
  const model = modelFor(provider);
  if (provider === "openai") return callOpenAI(model, systemPrompt, turns, opts);
  if (provider === "anthropic") return callAnthropic(model, systemPrompt, turns, opts);
  return callGemini(model, systemPrompt, turns, opts);
}

/** Extract the first JSON object/array from a possibly fenced model reply. */
function parseJson(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) cleaned = fenced[1].trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start === -1 || end === -1 || end < start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** Like chat() but requests and parses JSON, returning null instead of throwing on parse failure. */
async function chatJson(messages, options = {}) {
  const text = await chat(messages, { ...options, json: true });
  return parseJson(text);
}

module.exports = { available, info, chat, chatJson, parseJson, PROVIDERS, DEFAULT_MODELS };

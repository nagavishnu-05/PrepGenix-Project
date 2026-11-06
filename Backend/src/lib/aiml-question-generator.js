"use strict";

const llm = require("./llm");

const FORMATS = {
  aptitude_mcq: { type: "aptitude", format: "mcq", label: "Aptitude MCQ" },
  aptitude_fillup: { type: "aptitude", format: "fillup", label: "Aptitude fill-up" },
  coding_mcq: { type: "coding", format: "mcq", label: "Coding MCQ" },
  coding_programming: { type: "coding", format: "programming", label: "Coding programming" },
};
const DIFFICULTIES = ["easy", "medium", "hard"];

function normalizeRequest(body = {}) {
  const testFormat = String(body.testFormat || "");
  const format = FORMATS[testFormat];
  if (!format) throw new Error("Choose Aptitude MCQ, Aptitude fill-up, Coding MCQ, or Coding programming.");

  const topics = [...new Set((Array.isArray(body.topics) ? body.topics : String(body.topics || "").split(/[,;]/))
    .map((topic) => String(topic).trim())
    .filter(Boolean))];
  if (!topics.length) throw new Error("Enter at least one topic.");
  if (topics.length > 12 || topics.some((topic) => topic.length > 80)) {
    throw new Error("Enter up to 12 topics, each 80 characters or fewer.");
  }

  const count = Number(body.count);
  if (!Number.isInteger(count) || count < 1 || count > 30) {
    throw new Error("Question count must be between 1 and 30.");
  }

  const difficulty = String(body.difficulty || "mixed").toLowerCase();
  if (difficulty !== "mixed" && !DIFFICULTIES.includes(difficulty)) {
    throw new Error("Difficulty must be Easy, Medium, Hard, or Mixed.");
  }
  const action = String(body.action || "save");
  if (!["save", "download", "both"].includes(action)) {
    throw new Error("Choose whether to save, download, or do both.");
  }
  return { testFormat, ...format, topics, count, difficulty, action };
}

function correctOptionIndex(value, options) {
  if (Number.isInteger(value) && value >= 0 && value < options.length) return value;
  const normalized = String(value ?? "").trim();
  if (/^[A-E]$/i.test(normalized)) {
    const index = normalized.toUpperCase().charCodeAt(0) - 65;
    return index < options.length ? index : null;
  }
  const index = options.findIndex((option) => option.toLowerCase() === normalized.toLowerCase());
  return index < 0 ? null : index;
}

function normalizedDifficulty(value, fallback) {
  const difficulty = String(value || "").trim().toLowerCase();
  return DIFFICULTIES.includes(difficulty) ? difficulty : fallback;
}

function normalizeGeneratedQuestion(raw, request, index) {
  if (!raw || typeof raw !== "object") throw new Error(`Generated question ${index + 1} is not an object.`);
  const title = String(raw.title || raw.question || raw.problem || "").trim();
  if (!title) throw new Error(`Generated question ${index + 1} has no question text.`);
  const fallbackDifficulty = request.difficulty === "mixed"
    ? DIFFICULTIES[index % DIFFICULTIES.length]
    : request.difficulty;
  const difficulty = request.difficulty === "mixed"
    ? normalizedDifficulty(raw.difficulty, fallbackDifficulty)
    : request.difficulty;
  const requestedTopic = request.topics.find((requested) =>
    requested.toLowerCase() === String(raw.topic || "").trim().toLowerCase());
  const topic = requestedTopic || request.topics[index % request.topics.length];
  const tags = [...new Set([
    topic,
    ...(Array.isArray(raw.tags) ? raw.tags.map(String) : String(raw.tags || "").split(/[,;]/)),
  ].map((tag) => tag.trim()).filter(Boolean))];

  const common = {
    type: request.type,
    format: request.format,
    title,
    description: String(raw.description || raw.problemStatement || title).trim(),
    difficulty,
    points: Math.max(1, Math.min(100, Math.round(Number(raw.points) || (request.type === "coding" ? 10 : 1)))),
    tags,
    topic,
    explanation: String(raw.explanation || "").trim(),
    source: "aiml",
  };

  if (request.format === "mcq") {
    const options = Array.isArray(raw.options) ? raw.options.map((option) => String(option).trim()) : [];
    if (options.length !== 4 || options.some((option) => !option) || new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
      throw new Error(`Generated MCQ ${index + 1} must have four distinct, non-empty options.`);
    }
    const correctOption = correctOptionIndex(raw.correctOption ?? raw.answer, options);
    if (correctOption == null) throw new Error(`Generated MCQ ${index + 1} has an invalid correct option.`);
    return {
      ...common,
      subject: String(raw.subject || topic),
      codeSnippet: String(raw.codeSnippet || ""),
      options,
      correctOption,
      answer: null,
      language: String(raw.language || "javascript").toLowerCase(),
    };
  }

  if (request.format === "fillup") {
    const answer = String(raw.answer || raw.correctAnswer || "").trim();
    if (!answer) throw new Error(`Generated fill-up question ${index + 1} has no correct answer.`);
    const rawAcceptedAnswers = Array.isArray(raw.acceptedAnswers)
      ? raw.acceptedAnswers
      : String(raw.acceptedAnswers || "").split(/[;|]/);
    const acceptedAnswers = [...new Set([answer, ...rawAcceptedAnswers]
      .map((value) => String(value).trim())
      .filter(Boolean))];
    return {
      ...common,
      subject: String(raw.subject || topic),
      options: [],
      correctOption: null,
      answer,
      acceptedAnswers,
    };
  }

  if (request.format === "programming") {
    const testCases = (Array.isArray(raw.testCases) ? raw.testCases : [])
      .filter((testCase) => testCase && testCase.input != null && (testCase.expectedOutput != null || testCase.output != null))
      .map((testCase, orderIndex) => ({
        orderIndex,
        input: String(testCase.input),
        expectedOutput: String(testCase.expectedOutput ?? testCase.output),
        isHard: Boolean(testCase.isHard),
      }));
    if (!testCases.length) throw new Error(`Generated programming question ${index + 1} must have at least one test case.`);
    return {
      ...common,
      codeSnippet: String(raw.codeSnippet || raw.starterCode || ""),
      language: String(raw.language || "javascript").toLowerCase(),
      constraints: (Array.isArray(raw.constraints) ? raw.constraints : String(raw.constraints || "").split(/\r?\n/))
        .map((constraint) => String(constraint).trim())
        .filter(Boolean),
      inputFormat: String(raw.inputFormat || ""),
      outputFormat: String(raw.outputFormat || ""),
      examples: (Array.isArray(raw.examples) ? raw.examples : []).map((example) => ({
        input: String(example.input || ""),
        output: String(example.output || ""),
        explanation: String(example.explanation || ""),
      })),
      testCases,
    };
  }

  throw new Error("Unsupported question format.");
}

function systemPrompt(format) {
  if (format === "mcq") {
    return "Create original, factually correct assessment questions. Return only valid JSON with a questions array. Every item must have title, topic, difficulty (easy/medium/hard), options (four distinct strings), correctOption (zero-based integer), explanation, and points. Exactly one answer must be correct.";
  }
  if (format === "fillup") {
    return "Create original, unambiguous assessment questions. Return only valid JSON with a questions array. Every item must have title, topic, difficulty (easy/medium/hard), answer, acceptedAnswers (array of equivalent answers), explanation, and points.";
  }
  return "Create original coding assessment questions. Return only valid JSON with a questions array. Every item must have title, problemStatement, topic, difficulty (easy/medium/hard), language, points, constraints (array), inputFormat, outputFormat, examples (array of input/output objects), testCases (array of input/expectedOutput objects including representative edge cases), and starterCode. Test cases must have deterministic outputs.";
}

async function generateQuestions(request) {
  if (!llm.available()) throw new Error("AI question generation is unavailable. Configure an LLM provider in the backend or import an Excel dataset.");
  const formatDescription = request.format === "mcq"
    ? "multiple-choice"
    : request.format === "fillup" ? "fill-in-the-blank" : "programming";
  const result = await llm.chatJson([
    { role: "system", content: systemPrompt(request.format) },
    {
      role: "user",
      content: JSON.stringify({
        request: `Generate exactly ${request.count} ${request.difficulty} ${formatDescription} questions.`,
        testType: request.testFormat,
        topics: request.topics,
        outputCount: request.count,
        requestedDifficulty: request.difficulty,
        programmingLanguage: request.format === "programming" ? "language-neutral pseudocode prompt; starter code may be omitted" : undefined,
      }),
    },
  ], { temperature: 0.25, maxTokens: Math.min(8000, 1000 + request.count * (request.format === "programming" ? 350 : 180)) });

  const rawQuestions = Array.isArray(result) ? result : result?.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length !== request.count) {
    throw new Error(`AI returned ${rawQuestions?.length || 0} questions; expected ${request.count}. Please try a smaller count or another topic.`);
  }
  return rawQuestions.map((question, index) => normalizeGeneratedQuestion(question, request, index));
}

module.exports = { FORMATS, normalizeRequest, normalizeGeneratedQuestion, generateQuestions };

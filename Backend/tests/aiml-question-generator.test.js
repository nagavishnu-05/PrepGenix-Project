"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeRequest, normalizeGeneratedQuestion } = require("../src/lib/aiml-question-generator");

test("validates the supported AI question formats and required topic/count", () => {
  const request = normalizeRequest({
    testFormat: "aptitude_fillup",
    topics: "Averages; Ratios",
    count: "4",
    difficulty: "mixed",
    action: "both",
  });

  assert.equal(request.type, "aptitude");
  assert.equal(request.format, "fillup");
  assert.deepEqual(request.topics, ["Averages", "Ratios"]);
  assert.equal(request.count, 4);
  assert.throws(() => normalizeRequest({ testFormat: "role_recognition", topics: "roles", count: 2 }));
  assert.throws(() => normalizeRequest({ testFormat: "coding_mcq", topics: "", count: 2 }));
  assert.throws(() => normalizeRequest({ testFormat: "coding_mcq", topics: "Java", count: 31 }));
});

test("normalizes MCQ options, answer key, tags, and requested difficulty", () => {
  const request = normalizeRequest({
    testFormat: "coding_mcq",
    topics: ["JavaScript"],
    count: 1,
    difficulty: "hard",
  });
  const question = normalizeGeneratedQuestion({
    title: "What does a closure retain?",
    topic: "JavaScript",
    options: ["Lexical environment", "Call stack only", "DOM tree", "Network state"],
    correctOption: "A",
    difficulty: "easy",
  }, request, 0);

  assert.equal(question.type, "coding");
  assert.equal(question.format, "mcq");
  assert.equal(question.correctOption, 0);
  assert.equal(question.difficulty, "hard");
  assert.deepEqual(question.tags, ["JavaScript"]);
});

test("normalizes fill-up accepted answers and programming test cases", () => {
  const fillupRequest = normalizeRequest({
    testFormat: "aptitude_fillup",
    topics: ["Percentages"],
    count: 1,
    difficulty: "mixed",
  });
  const fillup = normalizeGeneratedQuestion({
    question: "What is 25% of 80?",
    answer: "20",
    acceptedAnswers: ["twenty"],
  }, fillupRequest, 0);
  assert.deepEqual(fillup.acceptedAnswers, ["20", "twenty"]);
  assert.equal(fillup.difficulty, "easy");

  const programmingRequest = normalizeRequest({
    testFormat: "coding_programming",
    topics: ["Arrays"],
    count: 1,
    difficulty: "medium",
  });
  const programming = normalizeGeneratedQuestion({
    title: "Find the largest value",
    problemStatement: "Return the largest integer in an array.",
    topic: "Arrays",
    testCases: [{ input: "1 3 2", output: "3" }],
  }, programmingRequest, 0);
  assert.equal(programming.format, "programming");
  assert.equal(programming.testCases[0].expectedOutput, "3");
  assert.throws(() => normalizeGeneratedQuestion({ title: "Missing test cases" }, programmingRequest, 0));
});

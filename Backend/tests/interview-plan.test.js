"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const llm = require("../src/lib/llm");
const { generateQuestionPlan } = require("../src/lib/interview-plan");

const resume = {
  studentName: "Test Candidate",
  skills: ["React", "Node.js", "Express", "MongoDB"],
  text: [
    "Summary",
    "Software developer",
    "Skills",
    "React, Node.js, Express, MongoDB",
    "Projects",
    "PrepGenix coding assessment platform",
  ].join("\n"),
};

test("technical plans use the fixed 20-question mix and resume-matched topics", async () => {
  const plan = await generateQuestionPlan({ type: "Technical" }, resume);
  assert.equal(plan.source, "structured-technical");
  assert.equal(plan.questions.length, 20);
  assert.match(plan.questions[0].text, /introduce yourself/i);
  assert.match(plan.questions[1].text, /PrepGenix coding assessment platform/);
  assert.ok(plan.topics.includes("React"));
  assert.ok(plan.topics.includes("Node.js"));
  assert.deepEqual(plan.coverage, {
    resume: 6,
    logic: 1,
    "core-concept": 5,
    "technical-scenario": 5,
    "stress-management": 3,
  });
});

test("technical plans still contain 20 questions when the resume has few project details", async () => {
  const plan = await generateQuestionPlan(
    { type: "Technical" },
    { text: "Summary\nStudent developer" }
  );
  assert.equal(plan.questions.length, 20);
  assert.equal(plan.coverage.resume, 6);
  assert.equal(plan.questions[0].focus, "resume");
});

test("HR plans ask HR logistics questions without technical topic questions", async () => {
  const plan = await generateQuestionPlan({ type: "HR" }, resume);
  assert.equal(plan.source, "hr-template");
  assert.ok(plan.questions.some((question) => question.text.toLowerCase().includes("relocate")));
  assert.ok(plan.questions.some((question) => question.focus === "teamwork"));
  assert.ok(plan.questions.every((question) => question.focus !== "technical"));
});

test("technical plan keeps its required question mix when AI is configured", async () => {
  const previousAvailable = llm.available;
  const previousChatJson = llm.chatJson;
  llm.available = () => true;
  llm.chatJson = async () => { throw new Error("Technical plans should use the fixed question structure."); };

  try {
    const plan = await generateQuestionPlan({ type: "Technical", jobRole: "Frontend Developer" }, resume);
    assert.equal(plan.source, "structured-technical");
    assert.equal(plan.questions.length, 20);
    assert.match(plan.questions[0].text, /introduce yourself/i);
  } finally {
    llm.available = previousAvailable;
    llm.chatJson = previousChatJson;
  }
});

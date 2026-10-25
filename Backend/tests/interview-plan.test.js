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

test("technical plans select topic questions from resume skills", async () => {
  const plan = await generateQuestionPlan({ type: "Technical" }, resume);
  assert.equal(plan.source, "topic-bank");
  assert.ok(plan.topics.includes("React"));
  assert.ok(plan.topics.includes("Node.js"));
  assert.ok(plan.questions.some((question) => question.text.includes("Your resume lists React.")));
  assert.equal(plan.questions.at(-1).focus, "closing");
  assert.ok(plan.questions.length <= 10);
});

test("HR plans ask HR logistics questions without technical topic questions", async () => {
  const plan = await generateQuestionPlan({ type: "HR" }, resume);
  assert.equal(plan.source, "hr-template");
  assert.ok(plan.questions.some((question) => question.text.toLowerCase().includes("relocate")));
  assert.ok(plan.questions.some((question) => question.focus === "teamwork"));
  assert.ok(plan.questions.every((question) => question.focus !== "technical"));
});

test("configured AI generates likely questions for a technical role from resume facts", async () => {
  const previousAvailable = llm.available;
  const previousChatJson = llm.chatJson;
  llm.available = () => true;
  llm.chatJson = async (messages) => {
    const prompt = messages.find((message) => message.role === "user")?.content || "";
    assert.match(prompt, /"interviewType": "Technical"/);
    assert.match(prompt, /"jobRole": "Frontend Developer"/);
    return {
      summary: "Resume-grounded interview",
      questions: [
        { text: "How did you use React in your assessment platform project?", focus: "project" },
        { text: "How did you structure the Node.js and Express APIs?", focus: "technical" },
        { text: "What trade-offs did you consider when selecting MongoDB?", focus: "technical" },
        { text: "Which part of the platform would you improve next?", focus: "closing" },
      ],
    };
  };

  try {
    const plan = await generateQuestionPlan({ type: "Technical", jobRole: "Frontend Developer" }, resume);
    assert.equal(plan.source, "llm");
    assert.equal(plan.questions.length, 4);
    assert.match(plan.questions[0].text, /React/);
  } finally {
    llm.available = previousAvailable;
    llm.chatJson = previousChatJson;
  }
});

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
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

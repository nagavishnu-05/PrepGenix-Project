"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const llm = require("../src/lib/llm");
const { generateQuestionPlan, getAnswerGuide, TOPIC_BANKS } = require("../src/lib/interview-plan");

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
  for (const skill of resume.skills) {
    assert.ok(plan.questions.some((question) => question.basedOn === `Resume skill: ${skill}`));
  }
  assert.ok(plan.questions.some((question) => question.focus === "technical-scenario" && question.text.includes("React")));
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

test("skill workbooks provide complete question, answer, and alternative keywords", () => {
  assert.equal(TOPIC_BANKS.length, 14);
  for (const topic of TOPIC_BANKS) {
    assert.ok(topic.questions.length, `${topic.name} should have questions`);
    for (const question of topic.questions) {
      assert.ok(question.text);
      assert.ok(question.answer);
      assert.ok(question.keywords.length);
    }
  }

  const guide = getAnswerGuide({
    text: "JS: How do closures work in JavaScript, and where have you used one intentionally?",
  });
  assert.match(guide.answer, /lexical scope/i);
  assert.ok(guide.keywords.includes("closure"));
});

test("technical plans still contain 20 questions when the resume has few project details", async () => {
  const plan = await generateQuestionPlan({ type: "Technical" }, { text: "Summary\nStudent developer" });
  assert.equal(plan.questions.length, 20);
  assert.equal(plan.coverage.resume, 6);
  assert.equal(plan.questions[0].focus, "resume");
  assert.equal(new Set(plan.questions.map((question) => question.text.toLowerCase())).size, 20);
});

test("scheduled skills drive the technical topics and are covered across core and scenario questions", async () => {
  const technicalSkills = ["HTML", "CSS", "JavaScript", "React", "Node.js", "Express", "Java", "SQL"];
  const plan = await generateQuestionPlan(
    { type: "Technical", _id: "skills-coverage", technicalSkills },
    { text: "Summary\nStudent developer" },
  );
  const technicalQuestions = plan.questions.filter((question) => (
    question.focus === "core-concept" || question.focus === "technical-scenario"
  ));

  assert.equal(plan.questions.length, 20);
  for (const skill of technicalSkills) {
    assert.ok(technicalQuestions.some((question) => question.topic === skill), `${skill} should be assessed`);
  }
});

test("separate technical interview IDs produce varied question selections", async () => {
  const skills = ["JavaScript", "React", "Node.js", "SQL"];
  const first = await generateQuestionPlan({ type: "Technical", _id: "interview-a", technicalSkills: skills }, resume);
  const second = await generateQuestionPlan({ type: "Technical", _id: "interview-b", technicalSkills: skills }, resume);
  const technicalTexts = (plan) => plan.questions
    .filter((question) => question.focus === "core-concept" || question.focus === "technical-scenario")
    .map((question) => question.text);

  assert.notDeepEqual(technicalTexts(first), technicalTexts(second));
});

test("regenerating a technical plan with a new version varies its question selection", async () => {
  const interview = { type: "Technical", _id: "same-interview", technicalSkills: ["JavaScript", "React"] };
  const first = await generateQuestionPlan({ ...interview, planVersion: 0 }, resume);
  const reset = await generateQuestionPlan({ ...interview, planVersion: 1 }, resume);
  const technicalTexts = (plan) => plan.questions
    .filter((question) => question.focus === "core-concept" || question.focus === "technical-scenario")
    .map((question) => question.text);

  assert.notDeepEqual(technicalTexts(first), technicalTexts(reset));
});

test("technical plans stay at 20 questions when a resume lists many projects", async () => {
  const projects = Array.from({ length: 10 }, (_, index) => (
    `Project ${index + 1} built a useful application feature`
  ));
  const plan = await generateQuestionPlan(
    { type: "Technical", _id: "many-projects" },
    { text: `Projects\n${projects.join("\n")}` },
  );

  assert.equal(plan.questions.length, 20);
  assert.deepEqual(plan.coverage, {
    resume: 6,
    logic: 1,
    "core-concept": 5,
    "technical-scenario": 5,
    "stress-management": 3,
  });
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

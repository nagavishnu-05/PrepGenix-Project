"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const llm = require("../src/lib/llm");
const { generateReport } = require("../src/lib/interview-report");

const plan = {
  jobRole: "Frontend Developer",
  questions: [
    { id: "q1", text: "Tell me about a difficult project you worked on." },
    { id: "q2", text: "How did you use React in your project?" },
  ],
};

test("reading or repeating the question is not counted as an interview answer", async () => {
  const previousAvailable = llm.available;
  const previousChatJson = llm.chatJson;
  llm.available = () => true;
  llm.chatJson = async () => {
    assert.fail("An interview with no substantive answers must not be sent for AI scoring.");
  };

  try {
    const report = await generateReport({
      transcript: [
        { role: "bot", questionId: "q1", text: plan.questions[0].text },
        { role: "candidate", questionId: "q1", text: "Tell me about a difficult project you worked on." },
        { role: "bot", questionId: "q2", text: plan.questions[1].text },
        { role: "candidate", questionId: "q2", text: "I just read the question." },
      ],
    }, plan);

    assert.equal(report.questionsAnswered, 0);
    assert.equal(report.overall, 1);
    assert.ok(Object.values(report.rubric).every(({ score }) => score === 1));
    assert.equal(report.evidence.length, 0);
    assert.match(report.candidateSummary, /No substantive answers were captured/);
    assert.match(report.summary, /no assessment can be made/i);
  } finally {
    llm.available = previousAvailable;
    llm.chatJson = previousChatJson;
  }
});

test("substantive answers remain evidence and question echoes are excluded", async () => {
  const previousAvailable = llm.available;
  llm.available = () => false;

  try {
    const report = await generateReport({
      transcript: [
        { role: "candidate", questionId: "q1", text: "Tell me about a difficult project you worked on." },
        { role: "candidate", questionId: "q2", text: "I used React to build a dashboard, improved loading time by 30%, and tested it with users." },
      ],
    }, plan);

    assert.equal(report.questionsAnswered, 1);
    assert.equal(report.totalQuestions, 2);
    assert.equal(report.evidence.length, 1);
    assert.match(report.evidence[0].quote, /improved loading time by 30%/);
    assert.ok(report.clarifications.some((item) => item.includes(plan.questions[0].text)));
  } finally {
    llm.available = previousAvailable;
  }
});

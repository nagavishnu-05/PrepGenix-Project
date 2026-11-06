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

test("refusals and unrelated answers are not counted as substantive evidence", async () => {
  const previousAvailable = llm.available;
  llm.available = () => false;
  const technicalPlan = {
    questions: [{
      id: "q1",
      text: "How do closures work in JavaScript, and where have you used one intentionally?",
      topic: "JavaScript",
    }],
  };

  try {
    const report = await generateReport({
      transcript: [
        { role: "candidate", questionId: "q1", text: "No thanks." },
      ],
    }, technicalPlan);

    assert.equal(report.questionsAnswered, 0);
    assert.equal(report.evidence.length, 0);
    assert.equal(report.overall, 1);
    assert.match(report.candidateSummary, /No substantive answers were captured/);
  } finally {
    llm.available = previousAvailable;
  }
});

test("unrelated multiword replies to skill questions are excluded from scoring", async () => {
  const previousAvailable = llm.available;
  llm.available = () => false;
  const technicalPlan = {
    questions: [{
      id: "q1",
      text: "How do closures work in JavaScript, and where have you used one intentionally?",
      topic: "JavaScript",
    }],
  };

  try {
    const report = await generateReport({
      transcript: [
        { role: "candidate", questionId: "q1", text: "I like blue cars and football." },
      ],
    }, technicalPlan);

    assert.equal(report.questionsAnswered, 0);
    assert.equal(report.evidence.length, 0);
  } finally {
    llm.available = previousAvailable;
  }
});

test("AI relevance check rejects an unrelated answer even when it mentions a skill", async () => {
  const previousAvailable = llm.available;
  const previousChatJson = llm.chatJson;
  let callCount = 0;
  llm.available = () => true;
  llm.chatJson = async () => {
    callCount += 1;
    return {
      assessments: [{
        questionId: "q1",
        relevant: false,
        reason: "The answer mentions JavaScript but does not explain closures.",
      }],
    };
  };
  const technicalPlan = {
    questions: [{
      id: "q1",
      text: "How do closures work in JavaScript, and where have you used one intentionally?",
      topic: "JavaScript",
    }],
  };

  try {
    const report = await generateReport({
      transcript: [
        { role: "candidate", questionId: "q1", text: "I like JavaScript, football, and blue cars." },
      ],
    }, technicalPlan);

    assert.equal(callCount, 1);
    assert.equal(report.questionsAnswered, 0);
    assert.equal(report.evidence.length, 0);
    assert.equal(report.overall, 1);
  } finally {
    llm.available = previousAvailable;
    llm.chatJson = previousChatJson;
  }
});

test("a relevant concise technical answer is still counted", async () => {
  const previousAvailable = llm.available;
  llm.available = () => false;
  const technicalPlan = {
    questions: [{
      id: "q1",
      text: "How do closures work in JavaScript, and where have you used one intentionally?",
      topic: "JavaScript",
    }],
  };

  try {
    const report = await generateReport({
      transcript: [
        { role: "candidate", questionId: "q1", text: "A closure retains lexical scope for a callback." },
      ],
    }, technicalPlan);

    assert.equal(report.questionsAnswered, 1);
    assert.equal(report.evidence.length, 1);
  } finally {
    llm.available = previousAvailable;
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

test("AI report scoring receives technical answer guides from the skill datasets", async () => {
  const previousAvailable = llm.available;
  const previousChatJson = llm.chatJson;
  let prompt = "";
  llm.available = () => true;
  llm.chatJson = async (messages) => {
    prompt = messages.find((message) => message.role === "user").content;
    return {
      rubric: {
        technicalUnderstanding: { score: 4, rationale: "Explained the concept." },
        reasoning: { score: 4, rationale: "Provided reasoning." },
        communication: { score: 4, rationale: "Clear explanation." },
        relevance: { score: 4, rationale: "Relevant response." },
      },
      strengths: [],
      clarifications: [],
      evidence: [],
      summary: "The candidate explained closures.",
      candidateSummary: "You explained a technical concept clearly.",
    };
  };

  try {
    const technicalQuestion = "How do closures work in JavaScript, and where have you used one intentionally?";
    await generateReport({
      transcript: [
        { role: "candidate", questionId: "closure-question", text: "A closure keeps lexical scope available to a callback after the outer function returns." },
      ],
    }, {
      questions: [{ id: "closure-question", text: technicalQuestion, topic: "JavaScript" }],
    });

    assert.match(prompt, /reference answers and accepted concept keywords/i);
    assert.match(prompt, /lexical scope/i);
    assert.match(prompt, /callback/i);
  } finally {
    llm.available = previousAvailable;
    llm.chatJson = previousChatJson;
  }
});

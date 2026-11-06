"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { answeredQuestionCount, currentQuestionIndex } = require("../src/routes/interviews");

test("follow-up answers count toward their original planned question", () => {
  const transcript = [
    { role: "bot", questionId: "question-1" },
    { role: "candidate", questionId: "question-1" },
    { role: "bot", questionId: "question-1#f1" },
    { role: "candidate", questionId: "question-1#f1" },
    { role: "bot", questionId: "question-2" },
  ];

  assert.equal(answeredQuestionCount(transcript), 1);
});

test("a resumed follow-up stays on the same planned question index", () => {
  const plan = { questions: [{ id: "question-1" }, { id: "question-2" }] };
  const transcript = [
    { role: "bot", questionId: "question-1" },
    { role: "candidate", questionId: "question-1" },
    { role: "bot", questionId: "question-1#f1" },
  ];

  assert.equal(currentQuestionIndex(plan, transcript), 0);
});

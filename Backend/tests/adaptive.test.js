"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { advanceState, buildAdaptiveQuestionFilter, classifyResult, initialState } = require("../src/adaptive");

test("adaptive attempt starts at a valid random level with consistent highest level", () => {
  const state = initialState();
  assert.ok(["easy", "medium", "hard"].includes(state.level));
  assert.equal(state.highestLevel, { easy: 0, medium: 1, hard: 2 }[state.level]);
  assert.equal(initialState(["hard"]).level, "hard");
});

test("two consecutive correct answers raise one level and an incorrect answer lowers one", () => {
  const state = { ...initialState(), level: "medium", highestLevel: 1 };
  advanceState(state, true, "medium");
  assert.equal(state.level, "medium");
  assert.equal(state.levelStreak, 1);
  advanceState(state, true, "medium");
  assert.equal(state.level, "hard");
  assert.equal(state.levelStreak, 0);
  advanceState(state, false, "hard");
  assert.equal(state.level, "medium");
  assert.equal(state.levelStreak, 0);
  assert.equal(state.answeredCount, 3);
  assert.equal(state.correctCount, 2);
  assert.equal(state.wrongCount, 1);
  assert.equal(classifyResult(state), "good");
});

test("adaptive question filter retains requested topics and format", () => {
  const filter = buildAdaptiveQuestionFilter({
    type: "coding",
    topics: ["React Hooks", "JavaScript"],
    adaptive: { questionFilter: { tags: ["React Hooks"], formats: ["mcq"] } },
  }, ["already-asked"]);

  assert.equal(filter.type, "coding");
  assert.deepEqual(filter.format, { $in: ["mcq"] });
  assert.deepEqual(filter._id, { $nin: ["already-asked"] });
  assert.equal(filter.tags.$in.length, 1);
  assert.equal(filter.tags.$in[0].test("react hooks"), true);
  assert.equal(filter.tags.$in[0].test("unrelated"), false);
});

"use strict";

const LEVELS = ["easy", "medium", "hard"];
const LEVEL_INDEX = { easy: 0, medium: 1, hard: 2 };

const FIRST_DIFFICULTY_POOL = [
  { level: "easy", weight: 0.4 },
  { level: "medium", weight: 0.4 },
  { level: "hard", weight: 0.2 },
];

function randomWeighted(pool) {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p.level;
  }
  return pool[pool.length - 1].level;
}

function initialState() {
  return {
    level: randomWeighted(FIRST_DIFFICULTY_POOL),
    levelStreak: 0,
    consecutiveEasyFails: 0,
    askedCount: 0,
    answeredCount: 0,
    correctCount: 0,
    wrongCount: 0,
    easySolved: 0,
    mediumSolved: 0,
    hardSolved: 0,
    highestLevel: LEVEL_INDEX[randomWeighted(FIRST_DIFFICULTY_POOL)],
    finished: false,
    result: null,
    failedThreeEasy: false,
  };
}

// Advance the adaptive state after one answered question.
// Solves move up the ladder (easy -> medium -> medium -> hard -> hard...),
// failures drop one level. Three consecutive easy failures -> "very weak".
function advanceState(state, correct, questionDifficulty) {
  const wasCorrect = !!correct;
  const current = LEVEL_INDEX[state.level];

  if (questionDifficulty === "easy" && wasCorrect) state.easySolved += 1;
  if (questionDifficulty === "medium" && wasCorrect) state.mediumSolved += 1;
  if (questionDifficulty === "hard" && wasCorrect) state.hardSolved += 1;

  if (wasCorrect) {
    state.correctCount += 1;
    if (state.level === "easy") {
      state.level = "medium";
    } else if (state.level === "medium") {
      if (state.levelStreak >= 1) state.level = "hard";
    } else {
      state.level = "hard";
    }
    state.consecutiveEasyFails = 0;
    state.levelStreak = 0;
  } else {
    state.wrongCount += 1;
    const next = Math.max(current - 1, 0);
    state.level = LEVELS[next];
    state.levelStreak = 0;
    if (state.level === "easy") {
      state.consecutiveEasyFails += 1;
      if (state.consecutiveEasyFails >= 3) {
        state.finished = true;
        state.result = "very_weak";
        state.failedThreeEasy = true;
      }
    } else {
      state.consecutiveEasyFails = 0;
    }
  }

  state.highestLevel = Math.max(state.highestLevel, LEVEL_INDEX[state.level]);
  return state;
}

// Final classification when the test ends naturally.
function classifyResult(state) {
  if (state.result === "very_weak") return "very_weak";
  const ratio = state.answeredCount ? state.correctCount / state.answeredCount : 0;
  const h = state.highestLevel;
  if (h === 0) return ratio >= 0.5 ? "weak" : "very_weak";
  if (h === 1) return ratio >= 0.6 ? "average" : "weak";
  return ratio >= 0.8 ? "excellent" : ratio >= 0.6 ? "good" : "average";
}

// Pick the next question for an adaptive attempt.
async function pickAdaptiveQuestion(state, test, askedIds) {
  const type = test.type === "coding" ? "coding" : "aptitude";
  const filter = { type, difficulty: state.level };

  if (type === "coding") {
    const { col } = require("./db");
    const aimlCount = await col("questions").countDocuments({ type: "coding", source: "aiml" });
    if (aimlCount > 0) {
      filter.source = "aiml";
    }
  }

  if (test.questionFilter) {
    const { tags, subject, formats } = test.questionFilter;
    if (tags && tags.length) filter.tags = { $in: tags };
    if (subject) filter.subject = subject;
    if (formats && formats.length) filter.format = { $in: formats };
  }
  if (askedIds && askedIds.length) filter._id = { $nin: askedIds.map(String) };

  const { col } = require("./db");
  let pool = await col("questions").find(filter).toArray();
  if (!pool.length && state.level !== "easy") {
    // Fall back to an easier level, then any.
    const fallbackOrder = state.level === "hard" ? ["medium", "easy"] : ["easy"];
    for (const lvl of fallbackOrder) {
      pool = await col("questions").find({ ...filter, difficulty: lvl }).toArray();
      if (pool.length) {
        state.level = lvl;
        break;
      }
    }
  }
  if (!pool.length) {
    const anyFilter = { type };
    if (filter.format) anyFilter.format = filter.format;
    pool = await col("questions").find(anyFilter).toArray();
  }
  if (!pool.length) return null;
  const q = pool[Math.floor(Math.random() * pool.length)];
  return q;
}

module.exports = { LEVELS, LEVEL_INDEX, initialState, advanceState, classifyResult, pickAdaptiveQuestion, randomWeighted };

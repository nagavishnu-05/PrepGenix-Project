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

function initialState(availableLevels = LEVELS) {
  const levels = availableLevels.filter((level) => LEVELS.includes(level));
  const levelPool = levels.length
    ? levels.map((level) => ({ level, weight: 1 }))
    : FIRST_DIFFICULTY_POOL;
  const level = randomWeighted(levelPool);
  return {
    level,
    levelStreak: 0,
    consecutiveEasyFails: 0,
    askedCount: 0,
    answeredCount: 0,
    correctCount: 0,
    wrongCount: 0,
    easySolved: 0,
    mediumSolved: 0,
    hardSolved: 0,
    highestLevel: LEVEL_INDEX[level],
    finished: false,
    result: null,
    failedThreeEasy: false,
  };
}

// Advance the adaptive state after one answered question.
// Two consecutive correct answers raise one level; an incorrect answer lowers
// one level. Three consecutive easy failures produce a "very weak" result.
function advanceState(state, correct, questionDifficulty) {
  const wasCorrect = !!correct;
  const answeredLevel = LEVEL_INDEX[questionDifficulty] ?? LEVEL_INDEX[state.level];
  state.answeredCount += 1;

  if (questionDifficulty === "easy" && wasCorrect) state.easySolved += 1;
  if (questionDifficulty === "medium" && wasCorrect) state.mediumSolved += 1;
  if (questionDifficulty === "hard" && wasCorrect) state.hardSolved += 1;

  if (wasCorrect) {
    state.correctCount += 1;
    state.levelStreak += 1;
    if (state.levelStreak >= 2) {
      if (LEVEL_INDEX[state.level] < LEVELS.length - 1) {
        state.level = LEVELS[LEVEL_INDEX[state.level] + 1];
      }
      state.levelStreak = 0;
    }
    state.consecutiveEasyFails = 0;
  } else {
    state.wrongCount += 1;
    const next = Math.max(LEVEL_INDEX[state.level] - 1, 0);
    state.level = LEVELS[next];
    state.levelStreak = 0;
    if (questionDifficulty === "easy") {
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

  state.highestLevel = Math.max(state.highestLevel, answeredLevel);
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

function buildAdaptiveQuestionFilter(test, askedIds = []) {
  const type = test.type === "coding" ? "coding" : "aptitude";
  const filter = { type };
  const questionFilter = test.questionFilter || test.adaptive?.questionFilter || {};
  const topics = Array.isArray(questionFilter.tags) && questionFilter.tags.length
    ? questionFilter.tags
    : Array.isArray(test.topics) ? test.topics : [];
  const formats = Array.isArray(questionFilter.formats) && questionFilter.formats.length
    ? questionFilter.formats
    : [type === "coding" ? "programming" : "mcq"];
  if (topics.length) {
    filter.tags = { $in: topics.map((topic) => new RegExp(
      String(topic).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    )) };
  }
  if (questionFilter.subject) filter.subject = questionFilter.subject;
  if (formats.length) filter.format = { $in: formats };
  if (askedIds.length) filter._id = { $nin: askedIds };
  return filter;
}

// Pick the next question without dropping the selected format or topic filters.
async function pickAdaptiveQuestion(state, test, askedIds = []) {
  const { col, id } = require("./db");
  const baseFilter = buildAdaptiveQuestionFilter(test, askedIds.map(id));
  let pool = await col("questions").find({ ...baseFilter, difficulty: state.level }).toArray();
  if (!pool.length) {
    const fallbackOrder = state.level === "easy"
      ? ["medium", "hard"]
      : state.level === "hard" ? ["medium", "easy"] : ["easy", "hard"];
    for (const level of fallbackOrder) {
      pool = await col("questions").find({ ...baseFilter, difficulty: level }).toArray();
      if (pool.length) {
        state.level = level;
        break;
      }
    }
  }
  if (!pool.length) return null;
  const q = pool[Math.floor(Math.random() * pool.length)];
  return q;
}

module.exports = {
  LEVELS,
  LEVEL_INDEX,
  initialState,
  advanceState,
  classifyResult,
  buildAdaptiveQuestionFilter,
  pickAdaptiveQuestion,
  randomWeighted,
};

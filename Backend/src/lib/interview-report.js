"use strict";

/**
 * Produces an evidence-based interview report scored against a fixed general
 * rubric. Uses an LLM when configured, otherwise a deterministic heuristic that
 * measures observable signals in the transcript (length, specificity, use of
 * concrete decisions/outcomes, first-person contribution).
 *
 * The report deliberately stops short of accept/reject: it summarises what the
 * candidate said. No job description is used, so it is not a job-fit score.
 */

const llm = require("./llm");
const { RUBRIC } = require("./interview-plan");

const DISCLAIMER =
  "These are interview observations from a general, resume-based conversation. " +
  "No job description was used, so this is not a job-fit score or a hiring recommendation.";

const ACTION_VERBS = /\b(led|designed|built|developed|implemented|created|optimized|improved|migrated|decided|chose|solved|debugged|tested|refactored|launched|shipped|managed|owned|automated|reduced|increased|researched|proposed|coordinated)\b/gi;
const CHALLENGE_TERMS = /\b(challenge|difficult|problem|issue|bug|trade-?off|constraint|failure|failed|struggl|learned|mistake|obstacle)\b/gi;

function words(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean);
}

function count(text, regex) {
  return (String(text || "").match(regex) || []).length;
}

function clampScore(value) {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function baseQuestionId(questionId) {
  return String(questionId || "").split("#")[0];
}

function groupAnswers(plan, transcript) {
  const questions = plan?.questions || [];
  const textById = new Map(questions.map((q) => [q.id, q]));
  const answers = new Map();
  for (const turn of transcript || []) {
    if (turn.role !== "candidate" || !turn.text) continue;
    const base = baseQuestionId(turn.questionId);
    if (!answers.has(base)) answers.set(base, []);
    answers.get(base).push(String(turn.text));
  }
  return { questions, textById, answers };
}

function scoreRubric(plan, transcript) {
  const { questions, answers } = groupAnswers(plan, transcript);
  const allAnswers = [...answers.values()].flat();
  const joined = allAnswers.join(" ");
  const totalWords = words(joined).length;
  const avgWords = allAnswers.length ? totalWords / allAnswers.length : 0;
  const specificity = count(joined, /\b\d+(\.\d+)?%?\b/g);
  const actions = count(joined, ACTION_VERBS);
  const challenges = count(joined, CHALLENGE_TERMS);
  const firstPerson = count(joined, /\bI\b/g);
  const plural = count(joined, /\bwe\b/gi);
  const shortAnswers = allAnswers.filter((answer) => words(answer).length < 8).length;
  const unanswered = questions.filter((q) => !answers.has(q.id)).length;

  const clarity = clampScore(3 + (avgWords >= 20 ? 1 : 0) + (avgWords >= 45 ? 0.5 : 0) - (shortAnswers ? 1 : 0) - (unanswered ? 0.5 : 0));
  const depth = clampScore(3 + (specificity >= 2 ? 1 : 0) + (avgWords >= 30 ? 0.5 : 0) - (avgWords < 15 ? 1 : 0));
  const problemSolving = clampScore(3 + (challenges >= 1 ? 1 : 0) + (actions >= 3 ? 1 : 0) - (challenges === 0 && actions === 0 ? 1 : 0));
  const contribution = clampScore(3 + (firstPerson >= 2 ? 1 : 0) + (actions >= 2 ? 1 : 0) - (plural > firstPerson && firstPerson === 0 ? 1 : 0));

  const scores = { clarity, depth, problemSolving, contribution };
  const rationales = {
    clarity: avgWords ? `Average answer length was about ${Math.round(avgWords)} words${shortAnswers ? `, with ${shortAnswers} very short answer(s)` : ""}.` : "No answers were recorded.",
    depth: specificity ? `The candidate cited ${specificity} concrete detail(s) such as figures or counts.` : "Answers stayed largely conceptual with few concrete details.",
    problemSolving: challenges || actions ? `The candidate described ${challenges} challenge reference(s) and ${actions} action verb(s).` : "Little evidence of problem-solving or decision-making was described.",
    contribution: firstPerson ? `First-person language appeared ${firstPerson} time(s), indicating ownership.` : "Answers rarely distinguished the candidate's own contribution from the team's.",
  };
  return {
    rubric: Object.fromEntries(RUBRIC.map(({ key, label }) => [key, { label, score: scores[key], rationale: rationales[key] }])),
    overall: Number(((clarity + depth + problemSolving + contribution) / 4).toFixed(2)),
    questionsAnswered: questions.length - unanswered,
    totalQuestions: questions.length,
  };
}

function buildHeuristicBody(plan, transcript) {
  const { questions, answers } = groupAnswers(plan, transcript);
  const evidence = [];
  const strengths = [];
  const clarifications = [];

  for (const question of questions) {
    const answerList = answers.get(question.id);
    if (!answerList || !answerList.length) {
      clarifications.push(`No response captured for: "${question.text}"`);
      continue;
    }
    const answer = answerList.join(" ");
    const quote = answer.length > 220 ? `${answer.slice(0, 219).trimEnd()}…` : answer;
    evidence.push({ point: question.basedOn || question.focus, quote, basedOn: question.basedOn || "" });
    if (/\b\d+(\.\d+)?%?\b/.test(answer) && words(answer).length >= 20) {
      strengths.push(`Gave a concrete, quantified answer about ${question.basedOn || "the topic"}.`);
    }
    if (words(answer).length < 8) {
      clarifications.push(`Very brief answer to: "${question.text}"`);
    }
  }

  const total = questions.length;
  const answered = evidence.length;
  const summary = answered
    ? `The candidate responded to ${answered} of ${total} planned questions. Answers ${answered >= Math.ceil(total * 0.7) ? "covered most of the resume-grounded topics" : "left several topics with limited coverage"}. Review the transcript for the candidate's own wording.`
    : "No candidate answers were recorded, so no assessment can be made.";

  return { strengths: strengths.slice(0, 6), clarifications: clarifications.slice(0, 6), evidence: evidence.slice(0, 12), summary };
}

const REPORT_SYSTEM_PROMPT =
  "You are an interview analyst writing an evidence-based report for a placement coordinator. " +
  "The interview was GENERAL and based only on the candidate's resume; no job description was used. " +
  "Summarise what the candidate actually said. Do not recommend hiring or rejection. " +
  "Base every claim on the transcript and quote the candidate where possible. " +
  "Score each rubric dimension from 1 (weak) to 5 (strong) and justify it. " +
  "Return ONLY valid JSON matching: " +
  '{"rubric": {"clarity": {"score": number, "rationale": string}, "depth": {"score": number, "rationale": string}, "problemSolving": {"score": number, "rationale": string}, "contribution": {"score": number, "rationale": string}}, "strengths": string[], "clarifications": string[], "evidence": [{"point": string, "quote": string, "basedOn": string}], "summary": string}.';

function sanitizeLlmReport(raw, plan, transcript) {
  if (!raw || typeof raw !== "object") return null;
  const fallback = buildHeuristicBody(plan, transcript);
  const rubric = {};
  for (const { key, label } of RUBRIC) {
    const entry = raw.rubric?.[key] || {};
    const score = Number(entry.score);
    rubric[key] = {
      label,
      score: Number.isFinite(score) ? clampScore(score) : 3,
      rationale: String(entry.rationale || "").slice(0, 500),
    };
  }
  const overall = Number((Object.values(rubric).reduce((sum, r) => sum + r.score, 0) / RUBRIC.length).toFixed(2));
  return {
    rubric,
    overall,
    strengths: (Array.isArray(raw.strengths) ? raw.strengths : fallback.strengths).map(String).slice(0, 8),
    clarifications: (Array.isArray(raw.clarifications) ? raw.clarifications : fallback.clarifications).map(String).slice(0, 8),
    evidence: (Array.isArray(raw.evidence) && raw.evidence.length ? raw.evidence : fallback.evidence)
      .map((item) => ({ point: String(item?.point || ""), quote: String(item?.quote || ""), basedOn: String(item?.basedOn || "") }))
      .slice(0, 12),
    summary: String(raw.summary || fallback.summary).slice(0, 1200),
  };
}

/**
 * Generate the report object stored on the interview. Best-effort LLM with a
 * deterministic fallback; never throws for LLM failures.
 */
async function generateReport(interview, plan) {
  const transcript = interview.transcript || [];
  const scored = scoreRubric(plan, transcript);
  let source = "heuristic";
  let body = null;

  if (llm.available()) {
    try {
      const condensed = transcript
        .map((turn) => `${turn.role === "bot" ? "INTERVIEWER" : "CANDIDATE"} [${turn.questionId || ""}]: ${turn.text}`)
        .join("\n")
        .slice(0, 12000);
      const raw = await llm.chatJson(
        [
          { role: "system", content: REPORT_SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Resume sections (JSON):\n${JSON.stringify(plan?.sections || {}, null, 2)}\n\n` +
              `Interview transcript:\n${condensed || "(empty)"}\n\n` +
              "Write the report JSON.",
          },
        ],
        { temperature: 0.3, maxTokens: 1800 }
      );
      body = sanitizeLlmReport(raw, plan, transcript);
    } catch (error) {
      console.error("LLM interview report failed, using heuristic:", error.message);
    }
  }
  if (!body) {
    body = { ...buildHeuristicBody(plan, transcript), rubric: scored.rubric, overall: scored.overall, questionsAnswered: scored.questionsAnswered };
  } else {
    source = "llm";
  }

  return {
    generatedAt: new Date(),
    source,
    rubric: body.rubric,
    overall: body.overall,
    strengths: body.strengths || [],
    clarifications: body.clarifications || [],
    evidence: body.evidence || [],
    summary: body.summary || "",
    questionsAnswered: scored.questionsAnswered,
    totalQuestions: scored.totalQuestions,
    disclaimer: DISCLAIMER,
  };
}

module.exports = { generateReport, DISCLAIMER, RUBRIC };

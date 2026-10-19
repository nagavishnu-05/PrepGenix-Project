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
  "These are interview observations from a resume-based conversation. " +
  "This is a review aid, not a hiring decision or a job-fit score.";

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

  const technicalUnderstanding = clampScore(3 + (specificity >= 2 ? 1 : 0) + (avgWords >= 30 ? 0.5 : 0) - (avgWords < 15 ? 1 : 0));
  const reasoning = clampScore(3 + (challenges >= 1 ? 1 : 0) + (actions >= 3 ? 1 : 0) - (challenges === 0 && actions === 0 ? 1 : 0));
  const communication = clampScore(3 + (avgWords >= 20 ? 1 : 0) + (avgWords >= 45 ? 0.5 : 0) - (shortAnswers ? 1 : 0) - (unanswered ? 0.5 : 0));
  const relevance = clampScore(3 + (firstPerson >= 2 ? 1 : 0) + (actions >= 2 ? 1 : 0) - (plural > firstPerson && firstPerson === 0 ? 1 : 0));

  const scores = { technicalUnderstanding, reasoning, communication, relevance };
  const rationales = {
    technicalUnderstanding: specificity ? `Cited ${specificity} concrete detail(s) such as figures or counts.` : "Answers stayed largely conceptual with few concrete details.",
    reasoning: challenges || actions ? `Described ${challenges} challenge/trade-off reference(s) and ${actions} action verb(s).` : "Little evidence of problem-solving or decision-making was described.",
    communication: avgWords ? `Average answer length was about ${Math.round(avgWords)} words${shortAnswers ? `, with ${shortAnswers} very short answer(s)` : ""}.` : "No answers were recorded.",
    relevance: firstPerson ? `First-person language appeared ${firstPerson} time(s), linking answers to the candidate's own work.` : "Answers rarely distinguished the candidate's own contribution from the team's.",
  };
  return {
    rubric: Object.fromEntries(RUBRIC.map(({ key, label }) => [key, { label, score: scores[key], rationale: rationales[key] }])),
    overall: Number(((technicalUnderstanding + reasoning + communication + relevance) / 4).toFixed(2)),
    questionsAnswered: questions.length - unanswered,
    totalQuestions: questions.length,
    scores,
  };
}

/** Short, candidate-facing summary of how the interview went and what to work on. */
function buildCandidateSummary(scored, plan, transcript) {
  const { scores } = scored;
  const ranked = RUBRIC
    .map(({ key, label }) => ({ key, label, score: scores[key] }))
    .sort((a, b) => b.score - a.score);
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  const answered = scored.questionsAnswered;
  const total = scored.totalQuestions;

  if (!total) return "No answers were recorded, so there is nothing to summarise yet.";
  const coverageLine = answered === total
    ? `You answered all ${total} questions.`
    : `You answered ${answered} of ${total} planned questions.`;

  const weakGuidance = {
    technicalUnderstanding: "Add concrete specifics (numbers, tools, outcomes) when you describe your work.",
    reasoning: "Walk through the trade-offs and decisions you made, not just the final result.",
    communication: "Aim for structured answers: context, what you did, then the result.",
    relevance: "Tie each answer back to your own contribution and to the role you are interviewing for.",
  };

  return [
    coverageLine,
    `Your strongest area was ${strongest.label.toLowerCase()} (score ${strongest.score}/5).`,
    `An area to work on is ${weakest.label.toLowerCase()} (score ${weakest.score}/5): ${weakGuidance[weakest.key]}`,
    "This is a practice-oriented summary of the conversation, not a hiring decision.",
  ].join(" ");
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
  "The interview was grounded in the candidate's resume and, if provided, a target job role. " +
  "Summarise what the candidate actually said. Do not recommend hiring or rejection. " +
  "Base every claim on the transcript and quote the candidate where possible. " +
  "Score each rubric dimension from 1 (weak) to 5 (strong) and justify it. " +
  "Also write a short, supportive, candidate-facing summary (2-3 sentences) of their strongest area and one concrete thing to improve. " +
  "Return ONLY valid JSON matching: " +
  '{"rubric": {"technicalUnderstanding": {"score": number, "rationale": string}, "reasoning": {"score": number, "rationale": string}, "communication": {"score": number, "rationale": string}, "relevance": {"score": number, "rationale": string}}, "strengths": string[], "clarifications": string[], "evidence": [{"point": string, "quote": string, "basedOn": string}], "summary": string, "candidateSummary": string}.';

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
    candidateSummary: String(raw.candidateSummary || "").slice(0, 600),
  };
}

/**
 * Generate the report object stored on the interview. Best-effort LLM with a
 * deterministic fallback; never throws for LLM failures.
 */
async function generateReport(interview, plan) {
  const transcript = interview.transcript || [];
  const scored = scoreRubric(plan, transcript);
  const jobRole = String(plan?.jobRole || interview?.jobRole || "").trim();
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
              `Target job role: ${jobRole || "(not specified)"}\n` +
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
  if (!body.candidateSummary) body.candidateSummary = buildCandidateSummary(scored, plan, transcript);

  return {
    generatedAt: new Date(),
    source,
    rubric: body.rubric,
    overall: body.overall,
    strengths: body.strengths || [],
    clarifications: body.clarifications || [],
    evidence: body.evidence || [],
    summary: body.summary || "",
    candidateSummary: body.candidateSummary,
    jobRole: jobRole || null,
    questionsAnswered: scored.questionsAnswered,
    totalQuestions: scored.totalQuestions,
    disclaimer: jobRole
      ? `${DISCLAIMER} Questions were matched to the target role "${jobRole}", but this report is not a job-fit score.`
      : `${DISCLAIMER} No job description was provided, so role fit was not assessed.`,
  };
}

module.exports = { generateReport, DISCLAIMER, RUBRIC };

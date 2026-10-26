"use strict";

const express = require("express");
const crypto = require("crypto");
const { col, toId, id } = require("../db");
const { authenticate } = require("../middleware/auth");
const { pushInterview } = require("../perf");
const llm = require("../lib/llm");
const storage = require("../lib/storage");
const { generateQuestionPlan, decideNextAction } = require("../lib/interview-plan");
const { generateReport } = require("../lib/interview-report");

const router = express.Router();

const CONSENT_POLICY_VERSION = process.env.INTERVIEW_CONSENT_VERSION || "2026-01";
const RECORDING_RETENTION_DAYS = Number(process.env.INTERVIEW_RECORDING_RETENTION_DAYS ?? 30);
const MAX_PROCTORING_VIOLATIONS = 3;
const PROCTORING_EVENT_COOLDOWN_MS = 20000;
const PROCTORING_EVENT_TYPES = new Set([
  "FULLSCREEN_EXIT",
  "TAB_SWITCH",
  "WINDOW_BLUR",
  "NO_FACE",
  "MULTIPLE_FACES",
  "MULTIPLE_PERSONS",
  "PHONE_DETECTED",
  "ELECTRONIC_DEVICE",
  "LOOKING_AWAY",
  "HEAD_TURNED_AWAY",
  "EYES_CLOSED",
  "CAMERA_DISABLED",
  "CAMERA_LOST",
  "MIC_LOST",
  "IDENTITY_MISMATCH",
  "PROCTORING_FAILURE",
]);

function canAccess(req, interview) {
  if (req.user.role === "placement") return true;
  return req.user.role === "student" && interview.regNo === req.user.username;
}

async function loadInterview(idParam) {
  return col("interviews").findOne({ _id: id(idParam) });
}

async function loadResume(regNo) {
  try {
    return await col("resumes", "resume").findOne({ regNo });
  } catch (error) {
    console.error("Resume lookup failed:", error.message);
    return null;
  }
}

/** Confirm the student has a readable resume before an interview can be prepared. */
async function resumeReadiness(regNo) {
  const resume = await loadResume(regNo);
  if (!resume) {
    return {
      ok: false,
      code: "RESUME_MISSING",
      message: "This student has no uploaded resume. Upload one from Resumes before scheduling the interview.",
    };
  }
  const text = String(resume.text || "").trim();
  if (text.length < 40) {
    return {
      ok: false,
      code: "RESUME_UNREADABLE",
      message: "The student's resume could not be parsed into readable text. Re-parse or re-upload it before scheduling.",
    };
  }
  return { ok: true, resume };
}

function newTurn(questionId, role, text) {
  return { id: crypto.randomUUID(), questionId, role, text, at: new Date() };
}


// GET /api/interviews  (placement sees all; students see their own)
router.get("/", authenticate, async (req, res) => {
  try {
    const filter = req.user.role === "student" ? { regNo: req.user.username } : {};
    const interviews = await col("interviews").find(filter).sort({ scheduledAt: -1 }).toArray();
    res.json(interviews.map(toId));
  } catch {
    res.status(500).json({ error: "Failed to fetch interviews" });
  }
});

// GET /api/interviews/groups/:groupId/analytics (placement) summarize a named round
router.get("/groups/:groupId/analytics", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "placement") return res.status(403).json({ error: "Placement Coordinator only" });

    let group = await col("interviews").findOne({ groupId: req.params.groupId });
    let members;
    if (group) {
      members = await col("interviews").find({ groupId: req.params.groupId }).sort({ scheduledAt: 1 }).toArray();
    } else {
      const representative = await loadInterview(req.params.groupId);
      if (!representative) return res.status(404).json({ error: "Interview group not found" });
      const scheduledAt = new Date(representative.scheduledAt);
      members = await col("interviews").find({
        type: representative.type,
        scheduledAt,
        groupId: { $exists: false },
      }).sort({ scheduledAt: 1 }).toArray();
      group = representative;
    }

    const statusCounts = {};
    const violationTypes = {};
    let ratingTotal = 0;
    let ratingCount = 0;
    let reportScoreTotal = 0;
    let reportScoreCount = 0;
    let answeredTotal = 0;
    let questionTotal = 0;
    let violationTotal = 0;

    const candidates = members.map((interview) => {
      statusCounts[interview.status] = (statusCounts[interview.status] || 0) + 1;
      if (interview.rating != null && Number.isFinite(Number(interview.rating))) {
        ratingTotal += Number(interview.rating);
        ratingCount += 1;
      }
      if (interview.report?.overall != null && Number.isFinite(Number(interview.report.overall))) {
        reportScoreTotal += Number(interview.report.overall);
        reportScoreCount += 1;
      }
      const answeredCount = Number(interview.session?.answeredCount) || 0;
      const plannedQuestions = interview.plan?.questions?.length || 0;
      answeredTotal += answeredCount;
      questionTotal += plannedQuestions;

      const events = Array.isArray(interview.proctoringEvents) ? interview.proctoringEvents : [];
      const countedViolations = events.filter((event) => event.counted).length;
      violationTotal += countedViolations;
      for (const event of events) {
        if (!event.counted) continue;
        violationTypes[event.type] = (violationTypes[event.type] || 0) + 1;
      }

      return {
        id: interview._id.toString(),
        studentName: interview.studentName,
        regNo: interview.regNo,
        status: interview.status,
        rating: interview.rating ?? null,
        reportScore: interview.report?.overall ?? null,
        answeredCount,
        plannedQuestions,
        violationCount: interview.proctoringViolationCount || 0,
        updatedAt: interview.updatedAt || interview.scheduledAt,
      };
    });

    res.json({
      group: {
        id: group.groupId || group._id.toString(),
        name: group.interviewName || `${group.type || "Interview"} Interview`,
        type: group.type || "Technical",
        scheduledAt: group.scheduledAt,
        interviewer: group.interviewer || "",
      },
      stats: {
        total: members.length,
        statuses: statusCounts,
        averageRating: ratingCount ? Number((ratingTotal / ratingCount).toFixed(2)) : null,
        ratedCandidates: ratingCount,
        averageReportScore: reportScoreCount ? Number((reportScoreTotal / reportScoreCount).toFixed(2)) : null,
        reportedCandidates: reportScoreCount,
        questionsAnswered: answeredTotal,
        questionsPlanned: questionTotal,
        proctoringViolations: violationTotal,
        violationTypes,
      },
      candidates,
    });
  } catch {
    res.status(500).json({ error: "Failed to load interview analytics" });
  }
});

// GET /api/interviews/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const interview = await col("interviews").findOne({ _id: id(req.params.id) });
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (req.user.role === "student" && interview.regNo !== req.user.username) {
      return res.status(403).json({ error: "Access denied" });
    }
    res.json(toId(interview));
  } catch {
    res.status(500).json({ error: "Failed to fetch interview" });
  }
});

// POST /api/interviews  (placement) schedule
router.post("/", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "placement") return res.status(403).json({ error: "Placement Coordinator only" });
    const {
      regNo,
      regNos,
      interviewName,
      groupId: requestedGroupId,
      type,
      scheduledAt,
      interviewer,
      mode,
      proctoring,
      jobRole,
      jobDescription,
    } = req.body;
    const studentRegNos = [...new Set(
      (Array.isArray(regNos) ? regNos : [regNo])
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )];
    if (!studentRegNos.length || !scheduledAt) {
      return res.status(400).json({ error: "At least one student and a date/time are required" });
    }
    if (studentRegNos.length > 200) return res.status(400).json({ error: "An interview group can include at most 200 students at a time" });
    const parsedSchedule = new Date(scheduledAt);
    if (Number.isNaN(parsedSchedule.getTime())) return res.status(400).json({ error: "A valid interview date/time is required" });

    let groupId = typeof requestedGroupId === "string" ? requestedGroupId.trim() : "";
    let groupName = typeof interviewName === "string" ? interviewName.trim().slice(0, 120) : "";
    let interviewType = type || "Technical";
    let groupJobRole = typeof jobRole === "string" ? jobRole.trim().slice(0, 120) : "";
    let groupJobDescription = typeof jobDescription === "string" ? jobDescription.trim().slice(0, 2000) : "";
    if (groupId) {
      let groupInterview = await col("interviews").findOne({ groupId });
      if (!groupInterview) {
        groupInterview = await loadInterview(groupId);
        if (groupInterview && !groupInterview.groupId) {
          groupName = groupInterview.interviewName || groupName;
          interviewType = groupInterview.type || interviewType;
          groupJobRole = groupJobRole || groupInterview.jobRole || "";
          groupJobDescription = groupJobDescription || groupInterview.jobDescription || "";
          const legacyGroup = {
            type: groupInterview.type,
            scheduledAt: groupInterview.scheduledAt,
            groupId: { $exists: false },
          };
          await col("interviews").updateMany(legacyGroup, {
            $set: { groupId, interviewName: groupName },
          });
        }
      }
      if (!groupInterview) return res.status(404).json({ error: "Interview group not found" });
      groupName = groupInterview.interviewName || groupName;
      interviewType = groupInterview.type || interviewType;
      groupJobRole = groupJobRole || groupInterview.jobRole || "";
      groupJobDescription = groupJobDescription || groupInterview.jobDescription || "";
      if (!groupName) return res.status(400).json({ error: "The selected interview group has no name" });
    } else {
      if (!groupName) return res.status(400).json({ error: "Interview name is required" });
      groupId = crypto.randomUUID();
    }

    const existingMembers = await col("interviews")
      .find({ groupId, regNo: { $in: studentRegNos } }, { projection: { regNo: 1 } })
      .toArray();
    if (existingMembers.length) {
      const duplicateRegNos = existingMembers.map((member) => member.regNo);
      return res.status(409).json({ error: `Already scheduled in this interview group: ${duplicateRegNos.join(", ")}` });
    }

    const students = await col("students").find({ regNo: { $in: studentRegNos } }).toArray();
    const studentsByRegNo = new Map(students.map((student) => [student.regNo, student]));
    const missingRegNos = studentRegNos.filter((studentRegNo) => !studentsByRegNo.has(studentRegNo));
    if (missingRegNos.length) return res.status(404).json({ error: `Student not found: ${missingRegNos.join(", ")}` });

    for (const studentRegNo of studentRegNos) {
      const readiness = await resumeReadiness(studentRegNo);
      if (!readiness.ok) {
        const student = studentsByRegNo.get(studentRegNo);
        return res.status(400).json({
          error: `${student.name} (${studentRegNo}): ${readiness.message}`,
          code: readiness.code,
        });
      }
    }

    const now = new Date();
    const documents = studentRegNos.map((studentRegNo) => {
      const student = studentsByRegNo.get(studentRegNo);
      return {
        regNo: studentRegNo,
        studentName: student.name,
        interviewName: groupName,
        groupId,
        type: interviewType,
        jobRole: groupJobRole || null,
        jobDescription: groupJobDescription || null,
        mode: mode || "online-proctored",
        interviewer: interviewer || req.user.username,
        scheduledAt: parsedSchedule,
        proctoring: {
          enabled: proctoring?.enabled !== false,
          camera: proctoring?.camera !== false,
          microphone: proctoring?.microphone !== false,
          speechToText: proctoring?.speechToText !== false,
          backgroundCheck: proctoring?.backgroundCheck !== false,
          faceVerification: proctoring?.faceVerification !== false,
          fullscreenRequired: proctoring?.fullscreenRequired !== false,
        },
        transcript: [],
        analysis: { face: null, speech: null, background: null },
        plan: null,
        consent: null,
        report: null,
        session: { status: "not_started", startedAt: null, endedAt: null, answeredCount: 0 },
        status: "scheduled",
        createdBy: req.user.userId,
        createdAt: now,
        updatedAt: now,
      };
    });
    const inserted = await col("interviews").insertMany(documents);
    const interviews = await col("interviews")
      .find({ _id: { $in: Object.values(inserted.insertedIds) } })
      .toArray();
    res.status(201).json({ groupId, interviews: interviews.map(toId) });
  } catch {
    res.status(500).json({ error: "Failed to schedule interview" });
  }
});

// POST /api/interviews/:id/prepare  (placement) build the resume-grounded question plan
router.post("/:id/prepare", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "placement") return res.status(403).json({ error: "Placement Coordinator only" });
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    const readiness = await resumeReadiness(interview.regNo);
    if (!readiness.ok) return res.status(400).json({ error: readiness.message, code: readiness.code });

    const plan = await generateQuestionPlan(interview, readiness.resume);
    await col("interviews").updateOne(
      { _id: interview._id },
      { $set: { plan, planGeneratedAt: new Date(), updatedAt: new Date() } }
    );
    res.json({ plan, llm: llm.info() });
  } catch (error) {
    console.error("Prepare interview failed:", error.message);
    res.status(500).json({ error: "Failed to prepare interview questions" });
  }
});

// GET /api/interviews/:id/plan  (owner or placement)
router.get("/:id/plan", authenticate, async (req, res) => {
  try {
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (!canAccess(req, interview)) return res.status(403).json({ error: "Access denied" });
    if (!interview.plan) return res.status(404).json({ error: "Interview questions have not been prepared yet" });
    res.json({ plan: interview.plan, consent: interview.consent || null, session: interview.session || null });
  } catch {
    res.status(500).json({ error: "Failed to fetch interview plan" });
  }
});

// GET /api/interviews/:id/transcript  (owner or placement)
router.get("/:id/transcript", authenticate, async (req, res) => {
  try {
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (!canAccess(req, interview)) return res.status(403).json({ error: "Access denied" });
    res.json({ transcript: interview.transcript || [], session: interview.session || null });
  } catch {
    res.status(500).json({ error: "Failed to fetch transcript" });
  }
});

// GET /api/interviews/:id/report  (owner or placement)
router.get("/:id/report", authenticate, async (req, res) => {
  try {
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (!canAccess(req, interview)) return res.status(403).json({ error: "Access denied" });
    if (!interview.report) return res.status(404).json({ error: "Report has not been generated yet" });
    res.json({ report: interview.report, llm: llm.info() });
  } catch {
    res.status(500).json({ error: "Failed to fetch report" });
  }
});

// POST /api/interviews/:id/consent  (owning student) record consent
router.post("/:id/consent", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Candidate consent only" });
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (interview.regNo !== req.user.username) return res.status(403).json({ error: "Access denied" });

    const { camera, microphone, transcript, recording } = req.body || {};
    const consent = {
      camera: camera !== false,
      microphone: microphone !== false,
      transcript: transcript !== false,
      recording: recording === true,
      policyVersion: CONSENT_POLICY_VERSION,
      consentedAt: new Date(),
    };
    const session = interview.session || {};
    if (session.status !== "in_progress") session.status = "consented";
    await col("interviews").updateOne(
      { _id: interview._id },
      { $set: { consent, session, updatedAt: new Date() } }
    );
    res.json({ consent, session });
  } catch {
    res.status(500).json({ error: "Failed to record consent" });
  }
});

// POST /api/interviews/:id/reference-face  (owning student) attest reference face
// The embedding never reaches the backend: the AI service keeps it in memory
// keyed by interview id. We only store proof that enrollment happened.
router.post("/:id/reference-face", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Candidate only" });
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (interview.regNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    if (interview.status === "completed" || interview.status === "disqualified") {
      return res.status(400).json({ error: "This interview is no longer available" });
    }
    if (interview.session?.status === "terminated") {
      return res.status(403).json({ error: "This interview was terminated after repeated proctoring violations" });
    }

    const now = new Date();
    const capturedFrames = Number(req.body?.capturedFrames);
    const threshold = Number(req.body?.threshold);
    const faceReference = {
      registered: true,
      registeredAt: now,
      provider: String(req.body?.provider || "insightface").slice(0, 64),
      capturedFrames: Number.isFinite(capturedFrames) ? Math.max(0, Math.min(50, Math.round(capturedFrames))) : 0,
      threshold: Number.isFinite(threshold) ? threshold : null,
      candidateRegNo: interview.regNo,
    };
    const session = { ...(interview.session || {}), faceReference };

    await col("interviews").updateOne(
      { _id: interview._id },
      { $set: { session, updatedAt: now } }
    );
    res.json({ success: true, registered: true, faceReference });
  } catch (error) {
    console.error("Interview reference face failed:", error.message);
    res.status(500).json({ error: "Failed to register reference face" });
  }
});

// POST /api/interviews/:id/session/start  (owning student) begin the interview
router.post("/:id/session/start", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Candidate only" });
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (interview.regNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    if (!interview.consent?.consentedAt) return res.status(400).json({ error: "Consent must be given before starting" });
    if (interview.consent.camera !== true || interview.consent.microphone !== true) {
      return res.status(400).json({ error: "Camera and microphone consent are required for a proctored interview" });
    }
    if (interview.status === "completed" || interview.status === "disqualified") {
      return res.status(400).json({ error: "This interview is no longer available" });
    }
    // A resumed session already passed the gate when it first started, and an
    // AI-service restart would otherwise lock the candidate out mid-interview.
    const faceVerificationRequired = interview.proctoring?.faceVerification !== false;
    const resuming = interview.session?.status === "in_progress";
    if (faceVerificationRequired && !resuming && !interview.session?.faceReference?.registered) {
      return res.status(400).json({
        error: "Capture your reference face before starting this proctored interview",
        code: "FACE_NOT_REGISTERED",
      });
    }

    let plan = interview.plan;
    if (!plan?.questions?.length || !resuming) {
      const readiness = await resumeReadiness(interview.regNo);
      if (!readiness.ok) return res.status(400).json({ error: readiness.message, code: readiness.code });
      plan = await generateQuestionPlan(interview, readiness.resume);
      if (!plan?.questions?.length) {
        return res.status(500).json({ error: "Could not generate interview questions. Please try again." });
      }
      await col("interviews").updateOne(
        { _id: interview._id },
        { $set: { plan, planGeneratedAt: new Date(), updatedAt: new Date() } }
      );
    }

    const transcript = interview.transcript || [];
    const first = plan.questions[0];
    if (!transcript.some((turn) => turn.role === "bot" && turn.questionId === first.id)) {
      transcript.push(newTurn(first.id, "bot", first.text));
    }
    const session = {
      ...(interview.session || {}),
      status: "in_progress",
      startedAt: interview.session?.startedAt || new Date(),
      endedAt: null,
    };
    await col("interviews").updateOne(
      { _id: interview._id },
      { $set: { transcript, session, status: "in_progress", updatedAt: new Date() } }
    );
    res.json({ question: first, index: 0, total: plan.questions.length, session });
  } catch (error) {
    console.error("Start interview session failed:", error.message);
    res.status(500).json({ error: "Failed to start interview session" });
  }
});

// POST /api/interviews/:id/answer  (owning student) store an answer and get the next prompt
router.post("/:id/answer", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Candidate only" });
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (interview.regNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    if (interview.status === "disqualified" || interview.session?.status === "terminated") {
      return res.status(403).json({ error: "This interview was terminated after repeated proctoring violations" });
    }
    if (interview.session?.status !== "in_progress") {
      return res.status(409).json({ error: "Interview session is not active" });
    }
    if (!interview.plan?.questions?.length) return res.status(400).json({ error: "Interview has no prepared questions" });

    const { questionId, text } = req.body || {};
    const answer = String(text || "").trim();
    if (!answer) return res.status(400).json({ error: "Answer text is required" });

    const questions = interview.plan.questions;
    const baseId = String(questionId || "").split("#")[0];
    const index = questions.findIndex((q) => q.id === baseId);
    if (index === -1) return res.status(400).json({ error: "Unknown question" });

    const question = questions[index];
    const transcript = interview.transcript || [];
    transcript.push(newTurn(questionId, "candidate", answer));

    const followUpId = `${question.id}#f1`;
    const answeringFollowUp = String(questionId) !== baseId;
    const followUpAsked = transcript.some((turn) => turn.role === "bot" && turn.questionId === followUpId);

    const decision = await decideNextAction(
      interview,
      interview.plan,
      question,
      answer,
      answeringFollowUp || followUpAsked
    );

    let nextQuestion = null;
    let nextIndex = index;
    if (decision.action === "followup" && decision.followUp) {
      nextQuestion = { id: followUpId, text: decision.followUp, focus: "followup", basedOn: question.basedOn || "", isFollowUp: true };
    }
    if (!nextQuestion) {
      const following = questions[index + 1];
      if (following) {
        nextQuestion = { ...following, isFollowUp: false };
        nextIndex = index + 1;
      }
    }
    if (nextQuestion) transcript.push(newTurn(nextQuestion.id, "bot", nextQuestion.text));

    const session = {
      ...(interview.session || {}),
      status: "in_progress",
      answeredCount: (interview.session?.answeredCount || 0) + 1,
    };
    const saved = await col("interviews").updateOne(
      { _id: interview._id, "session.status": "in_progress", status: { $ne: "disqualified" } },
      { $set: { transcript, session, updatedAt: new Date() } }
    );
    if (!saved.matchedCount) return res.status(409).json({ error: "Interview was stopped before the answer could be saved" });
    res.json({ done: !nextQuestion, question: nextQuestion, index: nextIndex, total: questions.length, session });
  } catch (error) {
    console.error("Interview answer failed:", error.message);
    res.status(500).json({ error: "Failed to save answer" });
  }
});

// POST /api/interviews/:id/proctoring-event (owning student) record a confirmed issue
router.post("/:id/proctoring-event", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Candidate only" });
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (interview.regNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    if (interview.session?.status !== "in_progress") {
      return res.status(409).json({ error: "Proctoring events can only be recorded during an active interview" });
    }

    const type = String(req.body?.type || "").toUpperCase();
    if (!PROCTORING_EVENT_TYPES.has(type)) return res.status(400).json({ error: "Unknown proctoring event type" });

    const now = new Date();
    const events = interview.proctoringEvents || [];
    const lastSameType = [...events].reverse().find((event) => event.type === type);
    const lastSameTypeTime = lastSameType ? new Date(lastSameType.at).getTime() : NaN;
    const isNewViolation = !lastSameType || !Number.isFinite(lastSameTypeTime)
      || now.getTime() - lastSameTypeTime >= PROCTORING_EVENT_COOLDOWN_MS;
    const violationCount = (interview.proctoringViolationCount || 0) + (isNewViolation ? 1 : 0);
    const terminated = violationCount >= MAX_PROCTORING_VIOLATIONS;
    const event = {
      type,
      description: String(req.body?.description || type.replace(/_/g, " ").toLowerCase()).slice(0, 300),
      severity: ["low", "medium", "high"].includes(req.body?.severity) ? req.body.severity : "medium",
      at: now,
      metadata: req.body?.metadata && typeof req.body.metadata === "object" && !Array.isArray(req.body.metadata)
        ? Object.fromEntries(Object.entries(req.body.metadata).slice(0, 10))
        : {},
      counted: isNewViolation,
    };
    const session = terminated
      ? { ...(interview.session || {}), status: "terminated", endedAt: now, terminationReason: "proctoring_violation_limit" }
      : interview.session;

    const saved = await col("interviews").updateOne(
      { _id: interview._id, "session.status": "in_progress", status: { $ne: "disqualified" } },
      {
        $set: {
          proctoringViolationCount: violationCount,
          ...(terminated ? { session, status: "disqualified" } : {}),
          updatedAt: now,
        },
        $push: { proctoringEvents: { $each: [event], $slice: -100 } },
      }
    );
    if (!saved.matchedCount) return res.status(409).json({ error: "Interview is no longer active" });
    res.json({
      recorded: true,
      counted: isNewViolation,
      violationCount,
      violationLimit: MAX_PROCTORING_VIOLATIONS,
      paused: true,
      terminated,
    });
  } catch (error) {
    console.error("Interview proctoring event failed:", error.message);
    res.status(500).json({ error: "Failed to record proctoring event" });
  }
});

// POST /api/interviews/:id/complete  (owning student) end the interview
router.post("/:id/complete", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Candidate only" });
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (interview.regNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    if (interview.status === "disqualified" || interview.session?.status === "terminated") {
      return res.status(403).json({ error: "This interview was terminated after repeated proctoring violations" });
    }
    if (interview.session?.status !== "in_progress") {
      return res.status(409).json({ error: "Interview session is not active" });
    }

    const completedAt = new Date();
    const session = { ...(interview.session || {}), status: "completed", endedAt: completedAt };
    const shouldGenerateReport = Boolean(interview.plan?.questions?.length);
    const completed = await col("interviews").updateOne(
      { _id: interview._id, "session.status": "in_progress", status: { $ne: "disqualified" } },
      {
        $set: {
          session,
          status: "completed",
          ...(shouldGenerateReport ? { reportStatus: "generating" } : {}),
          completedAt,
          updatedAt: completedAt,
        },
      }
    );
    if (!completed.matchedCount) return res.status(409).json({ error: "Interview was stopped before completion" });

    res.json(toId({
      ...interview,
      session,
      status: "completed",
      ...(shouldGenerateReport ? { reportStatus: "generating" } : {}),
      completedAt,
      updatedAt: completedAt,
    }));
    if (shouldGenerateReport) {
      setImmediate(() => {
        generateReport(interview, interview.plan)
          .then(async (report) => {
            await col("interviews").updateOne(
              { _id: interview._id, reportStatus: "generating" },
              { $set: { report, reportStatus: "ready", reportGeneratedAt: new Date(), updatedAt: new Date() } }
            );
          })
          .catch(async (error) => {
            console.error("Auto report generation failed:", error.message);
            try {
              await col("interviews").updateOne(
                { _id: interview._id, reportStatus: "generating" },
                { $set: { reportStatus: "failed", updatedAt: new Date() } }
              );
            } catch (updateError) {
              console.error("Failed to update interview report status:", updateError.message);
            }
          });
      });
    }
  } catch {
    res.status(500).json({ error: "Failed to complete interview" });
  }
});

// POST /api/interviews/:id/report  (placement or owner) (re)generate the report
router.post("/:id/report", authenticate, async (req, res) => {
  try {
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (!canAccess(req, interview)) return res.status(403).json({ error: "Access denied" });
    if (!interview.plan?.questions?.length) return res.status(400).json({ error: "No interview plan to report on" });

    const report = await generateReport(interview, interview.plan);
    await col("interviews").updateOne(
      { _id: interview._id },
      { $set: { report, reportStatus: "ready", reportGeneratedAt: new Date(), updatedAt: new Date() } }
    );
    res.json({ report, llm: llm.info() });
  } catch (error) {
    console.error("Generate report failed:", error.message);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// POST /api/interviews/:id/reset (placement) reopen a locked or in-progress interview
router.post("/:id/reset", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "placement") return res.status(403).json({ error: "Placement Coordinator only" });

    const interviewId = id(req.params.id);
    const interview = await col("interviews").findOne({ _id: interviewId });
    if (!interview) return res.status(404).json({ error: "Interview not found" });

    const canReset = ["in_progress", "disqualified"].includes(interview.status)
      || ["in_progress", "terminated"].includes(interview.session?.status);
    if (!canReset) {
      return res.status(409).json({ error: "Only in-progress or locked interviews can be reset" });
    }

    const resetInterview = await col("interviews").findOneAndUpdate(
      {
        _id: interviewId,
        $or: [
          { status: { $in: ["in_progress", "disqualified"] } },
          { "session.status": { $in: ["in_progress", "terminated"] } },
        ],
      },
      {
        $set: {
          transcript: [],
          consent: null,
          analysis: { face: null, speech: null, background: null },
          report: null,
          reportStatus: null,
          session: { status: "not_started", startedAt: null, endedAt: null, answeredCount: 0 },
          status: "scheduled",
          proctoringViolationCount: 0,
          proctoringEvents: [],
          updatedAt: new Date(),
        },
        $unset: {
          completedAt: "",
          reportGeneratedAt: "",
          rating: "",
          notes: "",
          strengths: "",
          weaknesses: "",
        },
      },
      { returnDocument: "after" }
    );

    if (!resetInterview) {
      return res.status(409).json({ error: "Interview status changed; refresh before trying again" });
    }
    res.json(toId(resetInterview));
  } catch {
    res.status(500).json({ error: "Failed to reset interview" });
  }
});

// POST /api/interviews/:id/recording  (owning student, opt-in) store an A/V recording
router.post("/:id/recording", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "student") return res.status(403).json({ error: "Candidate only" });
    const interview = await loadInterview(req.params.id);
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (interview.regNo !== req.user.username) return res.status(403).json({ error: "Access denied" });
    if (interview.consent?.recording !== true) {
      return res.status(403).json({ error: "Recording consent was not given for this interview" });
    }
    const { data, contentType = "video/webm", ext = "webm" } = req.body || {};
    if (!data) return res.status(400).json({ error: "Recording data is required" });

    const stored = await storage.uploadImage({
      image: data,
      bucket: storage.RECORDING_BUCKET,
      scope: `interview/${interview._id}`,
      ext,
      contentType,
    });
    if (!stored) return res.status(503).json({ error: "Recording storage is not configured" });

    await col("interviews").updateOne(
      { _id: interview._id },
      {
        $set: {
          recordingPath: `${stored.bucket}/${stored.key}`,
          recordingMimeType: contentType,
          recordingUploadedAt: new Date(),
          recordingRetentionDays: RECORDING_RETENTION_DAYS,
          updatedAt: new Date(),
        },
      }
    );
    res.json({ ok: true, retentionDays: RECORDING_RETENTION_DAYS });
  } catch (error) {
    console.error("Recording upload failed:", error.message);
    res.status(500).json({ error: "Failed to store recording" });
  }
});

// POST /api/interviews/:id/analysis  (student or placement) store live AI analysis
router.post("/:id/analysis", authenticate, async (req, res) => {
  try {
    const interview = await col("interviews").findOne({ _id: id(req.params.id) });
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (req.user.role === "student" && interview.regNo !== req.user.username) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { transcript, faceSummary, speechSummary, backgroundStatus, cameraStatus, micStatus, notes } = req.body || {};
    const set = {
      updatedAt: new Date(),
      analysis: {
        face: faceSummary || interview.analysis?.face || null,
        speech: speechSummary || interview.analysis?.speech || null,
        background: backgroundStatus || interview.analysis?.background || null,
        camera: cameraStatus || interview.analysis?.camera || null,
        mic: micStatus || interview.analysis?.mic || null,
      },
    };

    if (Array.isArray(transcript)) set.transcript = transcript;
    if (notes) set.notes = notes;
    if (req.body?.status) set.status = req.body.status;

    const updated = await col("interviews").findOneAndUpdate(
      { _id: id(req.params.id) },
      { $set: set },
      { returnDocument: "after" }
    );
    res.json(toId(updated));
  } catch {
    res.status(500).json({ error: "Failed to save interview analysis" });
  }
});

// POST /api/interviews/:id/result  (placement) record outcome
router.post("/:id/result", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "placement") return res.status(403).json({ error: "Placement Coordinator only" });
    const { rating, notes, strengths, weaknesses, status } = req.body;
    const interview = await col("interviews").findOneAndUpdate(
      { _id: id(req.params.id) },
      {
        $set: {
          rating: rating != null ? Number(rating) : null,
          notes: notes || "",
          strengths: strengths || "",
          weaknesses: weaknesses || "",
          status: status || "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if ((status || "completed") === "completed") {
      await pushInterview(interview.regNo, {
        interviewId: interview._id.toString(),
        type: interview.type,
        rating: Number(rating) || null,
        notes: notes || "",
        strengths: strengths || "",
        weaknesses: weaknesses || "",
      });
    }
    res.json(toId(interview));
  } catch {
    res.status(500).json({ error: "Failed to record interview result" });
  }
});

// PUT /api/interviews/:id  (placement)
router.put("/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "placement") return res.status(403).json({ error: "Placement Coordinator only" });
    const { type, scheduledAt, interviewer, status } = req.body;
    const set = { updatedAt: new Date() };
    if (type !== undefined) set.type = type;
    if (scheduledAt !== undefined) set.scheduledAt = new Date(scheduledAt);
    if (interviewer !== undefined) set.interviewer = interviewer;
    if (status !== undefined) set.status = status;
    const interview = await col("interviews").findOneAndUpdate({ _id: id(req.params.id) }, { $set: set }, { returnDocument: "after" });
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    res.json(toId(interview));
  } catch {
    res.status(500).json({ error: "Failed to update interview" });
  }
});

// DELETE /api/interviews/:id  (placement)
router.delete("/:id", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "placement") return res.status(403).json({ error: "Placement Coordinator only" });
    const interviewId = id(req.params.id);
    const interview = await col("interviews").findOne({ _id: interviewId });
    if (!interview) return res.status(404).json({ error: "Interview not found" });
    if (interview.recordingPath) await storage.removePaths([interview.recordingPath]);
    await col("interviews").deleteOne({ _id: interviewId });
    res.json({ message: "Interview deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete interview" });
  }
});

// DELETE /api/interviews/groups/:groupId (placement) delete every candidate in a round
router.delete("/groups/:groupId", authenticate, async (req, res) => {
  try {
    if (req.user.role !== "placement") return res.status(403).json({ error: "Placement Coordinator only" });

    let members = await col("interviews").find({ groupId: req.params.groupId }).toArray();
    if (!members.length) {
      const representative = await loadInterview(req.params.groupId);
      if (!representative) return res.status(404).json({ error: "Interview group not found" });
      members = await col("interviews").find({
        type: representative.type,
        scheduledAt: new Date(representative.scheduledAt),
        groupId: { $exists: false },
      }).toArray();
    }
    if (!members.length) return res.status(404).json({ error: "Interview group not found" });

    const recordings = members.map((interview) => interview.recordingPath).filter(Boolean);
    if (recordings.length) await storage.removePaths(recordings);
    const result = await col("interviews").deleteMany({ _id: { $in: members.map((interview) => interview._id) } });
    res.json({ message: "Interview group deleted", deletedCount: result.deletedCount });
  } catch {
    res.status(500).json({ error: "Failed to delete interview group" });
  }
});

module.exports = router;

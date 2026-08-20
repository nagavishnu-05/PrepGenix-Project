"use strict";

// MongoDB collection model definitions used across the platform.
// These are not ORM classes; they are canonical schema contracts for the app.

const models = {
  users: {
    _id: "ObjectId",
    role: "student | staff | placement | admin",
    username: "string",
    fullName: "string",
    email: "string",
    passwordHash: "string",
    status: "active | disabled",
    createdAt: "Date",
    updatedAt: "Date"
  },

  students: {
    _id: "ObjectId",
    regNo: "string",
    name: "string",
    email: "string",
    mobile: "string",
    batch: "string",
    department: "string",
    cgpa: "number | string",
    tenth: "string",
    twelfth: "string",
    resumePath: "string | null",
    createdAt: "Date",
    updatedAt: "Date"
  },

  questions: {
    _id: "ObjectId",
    type: "aptitude | coding",
    format: "mcq | fillup | code_snippet | programming",
    subject: "string",
    title: "string",
    description: "string",
    codeSnippet: "string",
    options: "string[]",
    correctOption: "number | null",
    answer: "string | null",
    language: "string",
    difficulty: "easy | medium | hard",
    points: "number",
    constraints: "string[]",
    inputFormat: "string",
    outputFormat: "string",
    examples: "array",
    testCases: [
      {
        orderIndex: "number",
        input: "string",
        expectedOutput: "string",
        isHard: "boolean"
      }
    ],
    tags: "string[]",
    source: "manual | excel | aiml | excel-manual",
    sourceFile: "string | null",
    createdBy: "string",
    createdAt: "Date",
    updatedAt: "Date"
  },

  tests: {
    _id: "ObjectId",
    title: "string",
    description: "string",
    type: "aptitude | coding",
    mode: "fixed | adaptive",
    adaptive: {
      totalQuestions: "number",
      questionFilter: "object | null"
    },
    fixedQuestionIds: "ObjectId[]",
    autoPick: "object | null",
    assignedStudents: "string[]",
    assignedBatch: "string | null",
    assignedToAll: "boolean",
    durationMin: "number",
    passingScore: "number",
    proctoring: {
      enabled: "boolean",
      maxViolations: "number",
      autoSubmit: "boolean",
      snapshotIntervalSec: "number",
      fullscreenRequired: "boolean"
    },
    createdBy: "string",
    createdAt: "Date",
    updatedAt: "Date"
  },

  attempts: {
    _id: "ObjectId",
    testId: "string",
    testTitle: "string",
    type: "aptitude | coding",
    mode: "fixed | adaptive",
    studentRegNo: "string",
    studentName: "string",
    status: "in_progress | completed | cheated",
    score: "number",
    totalScore: "number",
    totalQuestions: "number",
    passingScore: "number",
    result: "passed | failed | disqualified | cheated | null",
    answers: [
      {
        questionId: "string",
        difficulty: "string",
        correct: "boolean",
        answer: "object | string | number",
        points: "number",
        passed: "number",
        total: "number",
        timeTakenMs: "number"
      }
    ],
    questionIndex: "number",
    pendingQuestionId: "string | null",
    questions: "string[]",
    adaptive: "object | null",
    startedAt: "Date",
    completedAt: "Date | null",
    disqualified: "boolean",
    disqualifyReason: "string | null",
    cheatingReason: "string | null",
    cheatingTimestamp: "Date | null",
    autoSubmitted: "boolean",
    violations: "number",
    lastSeenAt: "Date | null",
    latestAnalysis: "object | null",
    latestFrame: "string | null",
    referenceFaceImage: "string | null",
    faceRegistered: "boolean",
    proctoring: "object",
    createdAt: "Date",
    updatedAt: "Date"
  },

  violations: {
    _id: "ObjectId",
    attemptId: "string",
    type: "no_face | multiple_faces | phone_detected | voice_detected | tab_switch | window_blur | fullscreen_exit | right_click | dev_tools | copy_attempt | paste_attempt | screen_capture | camera_lost | mic_lost | looking_away | imposter_detected | electronic_device | multiple_persons | candidate_not_visible",
    severity: "low | medium | high",
    description: "string",
    confidence: "number | null",
    cameraFrame: "string | null",
    audioSample: "string | null",
    analysis: "object | null",
    metadata: "object | null",
    timestamp: "Date"
  },

  interviews: {
    _id: "ObjectId",
    regNo: "string",
    studentName: "string",
    type: "Technical | HR | General | Panel",
    mode: "online-proctored | in-person | hybrid",
    interviewer: "string",
    scheduledAt: "Date",
    status: "scheduled | in_progress | completed | cancelled",
    proctoring: {
      enabled: "boolean",
      camera: "boolean",
      microphone: "boolean",
      speechToText: "boolean",
      backgroundCheck: "boolean",
      faceVerification: "boolean",
      fullscreenRequired: "boolean"
    },
    transcript: "array",
    analysis: {
      face: "object | null",
      speech: "object | null",
      background: "object | null",
      camera: "object | null",
      mic: "object | null"
    },
    rating: "number | null",
    notes: "string",
    strengths: "string",
    weaknesses: "string",
    createdBy: "string",
    createdAt: "Date",
    updatedAt: "Date"
  },

  resumes: {
    _id: "ObjectId",
    regNo: "string",
    studentName: "string",
    fileName: "string",
    filePath: "string",
    parsedText: "string",
    categories: "string[]",
    topCategory: "string | null",
    summary: "object | null",
    createdAt: "Date",
    updatedAt: "Date"
  },

  performance: {
    _id: "ObjectId",
    regNo: "string",
    aptitude: "object[]",
    coding: "object[]",
    interviews: "object[]",
    resumeScore: "number | null",
    updatedAt: "Date"
  }
};

module.exports = models;

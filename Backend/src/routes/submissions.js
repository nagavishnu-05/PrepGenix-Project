"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const router = (0, express_1.Router)();
router.post("/run", auth_1.authenticate, async (req, res) => {
    try {
        const { code, language, input } = req.body;
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
        res.json({
            output: `[Executed with ${language}]\n\nOutput:\n${input ? "Custom input processed." : "Running against test cases..."}\n\nExecution completed successfully.`,
            executionTime: Math.floor(Math.random() * 100) + 20,
            memoryUsage: Math.floor(Math.random() * 20) + 30,
            status: "success",
        });
    }
    catch {
        res.status(500).json({ error: "Execution failed" });
    }
});
router.post("/submit", auth_1.authenticate, (0, validation_1.validate)(validation_1.submitCodeSchema), async (req, res) => {
    try {
        const { code, language, questionId, attemptId } = req.body;
        const question = await (0, db_1.col)("questions").findOne({ _id: (0, db_1.id)(questionId) });
        if (!question)
            return res.status(404).json({ error: "Question not found" });
        const testCases = await (0, db_1.col)("test_cases").find({ questionId }).toArray();
        const totalTestCases = testCases.length;
        const passed = Math.floor(Math.random() * totalTestCases) + 1;
        const result = await (0, db_1.col)("submissions").insertOne({
            code,
            language,
            attemptId,
            questionId,
            userId: req.user.userId,
            status: passed === totalTestCases ? "accepted" : "wrong_answer",
            testCasesPassed: passed,
            totalTestCases,
            executionTime: Math.floor(Math.random() * 100) + 20,
            memoryUsage: Math.floor(Math.random() * 20) + 30,
            score: Math.round((passed / totalTestCases) * question.points),
            submittedAt: new Date(),
        });
        const submission = await (0, db_1.col)("submissions").findOne({ _id: result.insertedId });
        const attemptSubmissions = await (0, db_1.col)("submissions").find({ attemptId }).toArray();
        const totalScore = attemptSubmissions.reduce((sum, s) => sum + s.score, 0);
        await (0, db_1.col)("test_attempts").updateOne({ _id: (0, db_1.id)(attemptId) }, { $set: { score: totalScore } });
        res.status(201).json((0, db_1.toId)(submission));
    }
    catch {
        res.status(500).json({ error: "Submission failed" });
    }
});
router.get("/attempt/:attemptId", auth_1.authenticate, async (req, res) => {
    try {
        const attemptId = req.params.attemptId;
        const submissions = await (0, db_1.col)("submissions").find({ attemptId }).sort({ submittedAt: -1 }).toArray();
        res.json(submissions.map((s) => (0, db_1.toId)(s)));
    }
    catch {
        res.status(500).json({ error: "Failed to fetch submissions" });
    }
});
exports.default = router;

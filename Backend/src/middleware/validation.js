"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUserSchema = exports.createQuestionSchema = exports.reportViolationSchema = exports.submitCodeSchema = exports.createTestSchema = exports.registerSchema = exports.loginSchema = void 0;
exports.validate = validate;
const zod_1 = require("zod");
function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                error: "Validation failed",
                details: result.error.issues,
            });
        }
        req.body = result.data;
        next();
    };
}
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email address"),
    password: zod_1.z.string().min(6, "Password must be at least 6 characters"),
});
exports.registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, "Name must be at least 2 characters"),
    email: zod_1.z.string().email("Invalid email address"),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
    role: zod_1.z.string().default("candidate"),
    adminId: zod_1.z.string().optional(),
    candidateId: zod_1.z.string().optional(),
});
exports.createTestSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, "Title is required"),
    description: zod_1.z.string().min(10, "Description must be at least 10 characters"),
    duration: zod_1.z.number().min(5).max(480),
    totalPoints: zod_1.z.number().min(1),
    passingScore: zod_1.z.number().min(1),
    allowedLanguages: zod_1.z.array(zod_1.z.string()).min(1, "At least one language required"),
    proctoringEnabled: zod_1.z.boolean().default(true),
    maxViolations: zod_1.z.number().min(1).max(20).default(5),
    autoSubmit: zod_1.z.boolean().default(true),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
});
exports.submitCodeSchema = zod_1.z.object({
    code: zod_1.z.string().min(1, "Code is required"),
    language: zod_1.z.string().min(1, "Language is required"),
    questionId: zod_1.z.string().min(1, "Question ID is required"),
    attemptId: zod_1.z.string().min(1, "Attempt ID is required"),
});
exports.reportViolationSchema = zod_1.z.object({
    attemptId: zod_1.z.string().min(1, "Attempt ID is required"),
    type: zod_1.z.string().min(1),
    severity: zod_1.z.string(),
    description: zod_1.z.string().min(1),
    screenshot: zod_1.z.string().optional(),
    cameraFrame: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
exports.createQuestionSchema = zod_1.z.object({
    title: zod_1.z.string().min(1, "Title is required"),
    description: zod_1.z.string().min(10, "Description must be at least 10 characters"),
    type: zod_1.z.string().min(1),
    difficulty: zod_1.z.string().min(1),
    points: zod_1.z.number().min(1),
    timeLimit: zod_1.z.number().min(1).max(480).optional(),
    constraints: zod_1.z.array(zod_1.z.string()).optional(),
    starterCode: zod_1.z.record(zod_1.z.string()).optional(),
    hints: zod_1.z.array(zod_1.z.string()).optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    testId: zod_1.z.string().optional(),
    examples: zod_1.z.array(zod_1.z.object({
        input: zod_1.z.string(),
        output: zod_1.z.string(),
        explanation: zod_1.z.string().optional(),
    })).optional(),
    testCases: zod_1.z.array(zod_1.z.object({
        input: zod_1.z.string(),
        expectedOutput: zod_1.z.string(),
        isHidden: zod_1.z.boolean().optional(),
        points: zod_1.z.number().optional(),
    })).optional(),
});
exports.createUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, "Name must be at least 2 characters"),
    email: zod_1.z.string().email("Invalid email address"),
    password: zod_1.z.string().min(6, "Password must be at least 6 characters").optional(),
    role: zod_1.z.string().default("candidate"),
    adminId: zod_1.z.string().optional(),
    candidateId: zod_1.z.string().optional(),
});

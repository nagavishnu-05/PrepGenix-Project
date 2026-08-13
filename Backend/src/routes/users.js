"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
function sanitize(user) {
    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        adminId: user.adminId,
        candidateId: user.candidateId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}
router.get("/", auth_1.authenticate, (0, auth_1.authorize)("ADMIN"), async (_req, res) => {
    try {
        const users = await (0, db_1.col)("users").find().sort({ createdAt: -1 }).toArray();
        res.json(users.map(sanitize));
    }
    catch {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});
router.post("/", auth_1.authenticate, (0, auth_1.authorize)("ADMIN"), async (req, res) => {
    try {
        const { name, email, password, role, adminId, candidateId } = req.body;
        const users = (0, db_1.col)("users");
        const existing = await users.findOne({ email });
        if (existing) {
            return res.status(409).json({ error: "Email already registered" });
        }
        if (adminId) {
            const existingAdminId = await users.findOne({ adminId });
            if (existingAdminId)
                return res.status(409).json({ error: "Admin ID already in use" });
        }
        if (candidateId) {
            const existingCandidateId = await users.findOne({ candidateId });
            if (existingCandidateId)
                return res.status(409).json({ error: "Candidate ID already in use" });
        }
        const passwordHash = await bcryptjs_1.default.hash(password || "password123", 12);
        const result = await users.insertOne({
            name,
            email,
            passwordHash,
            role: role.toLowerCase(),
            adminId: adminId || undefined,
            candidateId: candidateId || undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        res.status(201).json({ id: result.insertedId.toString(), name, email, role: role.toLowerCase(), adminId, candidateId, createdAt: new Date() });
    }
    catch {
        res.status(500).json({ error: "Failed to create user" });
    }
});
router.put("/:id", auth_1.authenticate, (0, auth_1.authorize)("ADMIN"), async (req, res) => {
    try {
        const id = req.params.id;
        const { name, email, role, adminId, candidateId } = req.body;
        const updateData = { updatedAt: new Date() };
        if (name)
            updateData.name = name;
        if (email)
            updateData.email = email;
        if (role)
            updateData.role = role;
        if (adminId !== undefined)
            updateData.adminId = adminId;
        if (candidateId !== undefined)
            updateData.candidateId = candidateId;
        const user = await (0, db_1.col)("users").findOneAndUpdate({ _id: (0, db_1.id)(id) }, { $set: updateData }, { returnDocument: "after" });
        if (!user)
            return res.status(404).json({ error: "User not found" });
        res.json(sanitize(user));
    }
    catch {
        res.status(500).json({ error: "Failed to update user" });
    }
});
router.delete("/:id", auth_1.authenticate, (0, auth_1.authorize)("ADMIN"), async (req, res) => {
    try {
        const id = req.params.id;
        await (0, db_1.col)("users").deleteOne({ _id: (0, db_1.id)(id) });
        res.json({ message: "User deleted" });
    }
    catch {
        res.status(500).json({ error: "Failed to delete user" });
    }
});
exports.default = router;

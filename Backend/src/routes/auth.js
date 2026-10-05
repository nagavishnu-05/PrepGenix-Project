"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const { col, toId, id } = require("../db");
const { authenticate, generateToken } = require("../middleware/auth");
const storage = require("../lib/storage");

const router = express.Router();

const ROLES = ["student", "staff", "placement"];
const STUDENT_AVATARS = new Set([
  "boy-1", "boy-2", "boy-3", "boy-4", "boy-5",
  "girl-1", "girl-2", "girl-3", "girl-4", "girl-5",
]);
const LEGACY_STUDENT_AVATARS = {
  "boy-coder": "boy-1", "boy-student": "boy-2", "boy-astronaut": "boy-3", "boy-scientist": "boy-4", "boy-artist": "boy-5",
  "girl-coder": "girl-1", "girl-student": "girl-2", "girl-astronaut": "girl-3", "girl-scientist": "girl-4", "girl-artist": "girl-5",
};

function stripSensitive(user) {
  if (!user) return user;
  const { passwordHash, ...rest } = user;
  return rest;
}

async function attachProfile(user) {
  const profile = user.role === "student" ? await col("students").findOne({ regNo: user.username }) : null;
  let avatar = user.role === "student" ? await storage.getStudentAvatar(user.username) : null;
  const legacyAvatar = LEGACY_STUDENT_AVATARS[user.avatar];
  if (!avatar && legacyAvatar) {
    avatar = await storage.setStudentAvatar(user.username, legacyAvatar);
    await col("users").updateOne({ _id: id(user.id) }, { $unset: { avatar: "" } });
  }
  return stripSensitive({ ...user, avatar, profile: profile ? toId(profile) : null });
}

// POST /api/auth/login  { role, username, password }
router.post("/login", async (req, res) => {
  try {
    const { role, username, password } = req.body;
    console.log(`POST /api/auth/login — role=${role}, username=${String(username || "").trim()}`);
    const normalizedRole = String(role || "").toLowerCase();
    if (!ROLES.includes(normalizedRole)) {
      console.log("  → 400: Invalid role");
      return res.status(400).json({ error: "Invalid role" });
    }
    const users = col("users");
    const user = await users.findOne({ role: normalizedRole, username: String(username || "").trim() });
    if (!user || !user.passwordHash) {
      console.log("  → 401: User not found or no password");
      return res.status(401).json({ error: "Invalid credentials" });
    }
    console.log("  Password verification started");
    const valid = await bcrypt.compare(String(password || "").trim(), user.passwordHash);
    if (!valid) {
      console.log("  → 401: Invalid password");
      return res.status(401).json({ error: "Invalid credentials" });
    }
    console.log("  JWT generation started");
    const token = generateToken({ userId: user._id.toString(), role: user.role, username: user.username });
    const sanitized = await attachProfile(toId(user));
    console.log("  → 200: Login successful");
    res.json({ token, user: sanitized });
  } catch (err) {
    console.error("  → 500: Login failed:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/me
router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await col("users").findOne({ _id: id(req.user.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(await attachProfile(toId(user)));
  } catch (err) {
    console.error("Failed to fetch authenticated user profile:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// PUT /api/auth/profile  { avatar }
router.put("/profile", authenticate, async (req, res) => {
  try {
    const { avatar } = req.body;
    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students can update their profile avatar" });
    }
    if (!STUDENT_AVATARS.has(avatar)) {
      return res.status(400).json({ error: "Choose one of the available student avatars" });
    }

    const user = await col("users").findOne({ _id: id(req.user.userId), role: "student" });
    if (!user) return res.status(404).json({ error: "Student account not found" });
    await storage.setStudentAvatar(user.username, avatar);
    if (user.avatar) {
      await col("users").updateOne({ _id: user._id }, { $unset: { avatar: "" } });
    }
    res.json(await attachProfile(toId({ ...user, avatar: undefined })));
  } catch (err) {
    console.error("Failed to update profile avatar:", err);
    res.status(500).json({ error: `Failed to update profile avatar: ${err.message}` });
  }
});

// POST /api/auth/coordinators  (staff or placement can create one of their own type)
router.post("/coordinators", authenticate, async (req, res) => {
  try {
    const actorRole = req.user.role;
    if (!["staff", "placement"].includes(actorRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    const { username, password, name } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: "username, password and name are required" });
    }
    const users = col("users");
    const existing = await users.findOne({ role: actorRole, username });
    if (existing) return res.status(409).json({ error: "Username already in use" });
    const passwordHash = await bcrypt.hash(String(password), 10);
    const result = await users.insertOne({
      username: String(username),
      passwordHash,
      role: actorRole,
      name: String(name),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.status(201).json({ id: result.insertedId.toString(), username, role: actorRole, name });
  } catch {
    res.status(500).json({ error: "Failed to create coordinator" });
  }
});

// PUT /api/auth/password  (change own password)
router.put("/password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }
    const user = await col("users").findOne({ _id: id(req.user.userId) });
    if (!user) return res.status(404).json({ error: "User not found" });
    const valid = await bcrypt.compare(String(currentPassword), user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });
    await col("users").updateOne(
      { _id: user._id },
      { $set: { passwordHash: await bcrypt.hash(String(newPassword), 10), updatedAt: new Date() } }
    );
    res.json({ message: "Password updated" });
  } catch {
    res.status(500).json({ error: "Failed to update password" });
  }
});

module.exports = router;

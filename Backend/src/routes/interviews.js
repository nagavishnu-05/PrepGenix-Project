"use strict";

const express = require("express");
const { col, toId, id } = require("../db");
const { authenticate } = require("../middleware/auth");
const { pushInterview } = require("../perf");

const router = express.Router();

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
    const { regNo, type, scheduledAt, interviewer } = req.body;
    if (!regNo || !scheduledAt) return res.status(400).json({ error: "regNo and scheduledAt are required" });
    const student = await col("students").findOne({ regNo });
    if (!student) return res.status(404).json({ error: "Student not found" });
    const result = await col("interviews").insertOne({
      regNo,
      studentName: student.name,
      type: type || "Technical",
      interviewer: interviewer || req.user.username,
      scheduledAt: new Date(scheduledAt),
      status: "scheduled",
      createdBy: req.user.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const doc = await col("interviews").findOne({ _id: result.insertedId });
    res.status(201).json(toId(doc));
  } catch {
    res.status(500).json({ error: "Failed to schedule interview" });
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
    await col("interviews").deleteOne({ _id: id(req.params.id) });
    res.json({ message: "Interview deleted" });
  } catch {
    res.status(500).json({ error: "Failed to delete interview" });
  }
});

module.exports = router;

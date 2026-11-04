"use strict";

const express = require("express");
const { isAuthorizedCronRequest } = require("../lib/cron-auth");
const { sendDueReminders } = require("../lib/scheduled-reminders");

const router = express.Router();

router.post("/reminders", async (req, res) => {
  if (!isAuthorizedCronRequest(req.get("authorization"), process.env.REMINDER_CRON_TOKEN)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await sendDueReminders();
    res.status(result.failed ? 502 : 200).json(result);
  } catch (error) {
    console.error("External reminder job failed:", error.message);
    res.status(503).json({ error: "Reminder job could not be completed" });
  }
});

module.exports = router;

"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const dotenv = require("dotenv");
const { connectDB, closeDB } = require("./db");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(helmet());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "1.0.0" });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/students", require("./routes/students"));
app.use("/api/questions", require("./routes/questions"));
app.use("/api/tests", require("./routes/tests"));
app.use("/api/judge", require("./routes/judge"));
app.use("/api/resumes", require("./routes/resumes"));
app.use("/api/interviews", require("./routes/interviews"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/proctoring", require("./routes/proctoring"));

const PORT = process.env.PORT || 8080;

async function main() {
  try {
    await connectDB();
    console.log("Connected to database");
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`\nPort ${PORT} is already in use by another process.`);
        console.error("  netstat -ano | findstr :8080");
        console.error("  taskkill /PID <pid> /F");
      } else {
        console.error("Failed to start server:", error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

main();

process.on("SIGTERM", async () => {
  await closeDB();
  process.exit(0);
});

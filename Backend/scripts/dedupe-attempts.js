"use strict";

/**
 * De-duplicate attempts that share the same (testId, studentRegNo).
 *
 * A React StrictMode double-invoked start effect used to fire POST /tests/:id/start
 * twice, creating two attempt documents a few milliseconds apart: an orphaned
 * `in_progress` record and the real attempt that was later completed/cheated.
 * The orphan made the student appear resumable while the stale twin kept
 * blocking retakes with "already completed".
 *
 * Rule per group:
 *   1. If any terminal attempt exists (completed/cheated), keep the terminal
 *      attempt with the most answers (ties: newest) and delete the rest.
 *   2. Otherwise keep the newest attempt and delete the rest.
 *
 * Usage:
 *   node scripts/dedupe-attempts.js            # dry run
 *   node scripts/dedupe-attempts.js --apply
 */

require("dotenv").config();

const { col, id, connectDB, closeDB } = require("../src/db");

const APPLY = process.argv.includes("--apply");
const TERMINAL = new Set(["completed", "cheated"]);

function answersFor(a) {
  return Array.isArray(a.answers) ? a.answers.length : 0;
}

function pickWinner(list) {
  const terminal = list.filter((a) => TERMINAL.has(a.status));
  const pool = terminal.length ? terminal : list;
  return pool.reduce((best, a) => {
    const diff = answersFor(a) - answersFor(best);
    if (diff > 0) return a;
    if (diff < 0) return best;
    return new Date(a.createdAt) >= new Date(best.createdAt) ? a : best;
  }, pool[0]);
}

async function main() {
  await connectDB();
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply to delete)"}\n`);

  const attempts = await col("attempts").find({}).toArray();
  console.log(`Scanned ${attempts.length} attempt(s).`);

  const groups = new Map();
  for (const a of attempts) {
    const key = `${a.testId}::${a.studentRegNo}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  let groupsFixed = 0;
  const removedIds = [];

  for (const [key, list] of groups) {
    if (list.length <= 1) continue;
    groupsFixed += 1;
    const winner = pickWinner(list);
    console.log(`\n${key} (${list.length} attempts) -> keep ${winner._id} [${winner.status}, answers=${answersFor(winner)}]`);
    for (const a of list) {
      if (a._id.toString() === winner._id.toString()) continue;
      console.log(`   ${APPLY ? "DELETE" : "would delete"} ${a._id} [${a.status}, answers=${answersFor(a)}]`);
      removedIds.push(a._id.toString());
    }
  }

  if (!groupsFixed) {
    console.log("No duplicate attempts found.");
    return;
  }

  console.log(`\n${APPLY ? "Deleting" : "Would delete"} ${removedIds.length} duplicate attempt(s) across ${groupsFixed} group(s).`);

  if (APPLY) {
    const attemptResult = await col("attempts").deleteMany({ _id: { $in: removedIds.map(id) } });
    const violationResult = await col("violations").deleteMany({ attemptId: { $in: removedIds } });
    console.log(`Removed ${attemptResult.deletedCount} attempt(s) and ${violationResult.deletedCount} violation(s).`);
  }
}

main()
  .then(async () => {
    await closeDB();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Dedupe failed:", err.message);
    await closeDB().catch(() => {});
    process.exit(1);
  });

"use strict";

/**
 * One-off migration: move base64 images out of MongoDB and into Supabase
 * Storage, leaving only `bucket/key` object paths behind.
 *
 * Affected documents:
 *   attempts.referenceFaceImage -> attempts.referenceFacePath
 *   attempts.latestFrame       -> attempts.latestFramePath
 *   violations.cameraFrame     -> violations.cameraFramePath
 *
 * Usage:
 *   node scripts/migrate-images-to-supabase.js            # dry run
 *   node scripts/migrate-images-to-supabase.js --apply
 *
 * Safe to re-run: documents that already carry a `*Path` field are skipped.
 */

require("dotenv").config();

const { col, id, connectDB, closeDB } = require("../src/db");
const storage = require("../src/lib/storage");

const APPLY = process.argv.includes("--apply");

async function migrateCollection(name, field, targetField, bucket) {
  const cursor = col(name).find({ [field]: { $exists: true, $type: "string", $ne: "" } });
  let scanned = 0;
  let uploaded = 0;
  let failed = 0;

  for await (const doc of cursor) {
    scanned += 1;
    if (doc[targetField]) continue;

    const label = `${name}/${doc._id}`;
    const path = await storage.uploadImagePath({
      image: doc[field],
      bucket,
      scope: `migration/${name}`,
      contentType: "image/jpeg",
    });

    if (!path) {
      console.log(`  SKIP  ${label} (${field} is not a readable image)`);
      failed += 1;
      continue;
    }

    if (APPLY) {
      await col(name).updateOne({ _id: id(doc._id.toString()) }, { $set: { [targetField]: path }, $unset: { [field]: "" } });
    }
    uploaded += 1;
    console.log(`  ${APPLY ? "MOVED " : "WOULD "} ${label} -> ${path}`);
  }

  console.log(`${name}.${field}: scanned=${scanned} ${APPLY ? "uploaded" : "would upload"}=${uploaded} skipped=${failed}`);
  return uploaded;
}

async function main() {
  if (!storage.isConfigured()) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Backend/.env before running this.");
    process.exit(1);
  }

  await connectDB();
  await storage.ensureBuckets();
  console.log(`Buckets ready. Mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply to write)"}\n`);

  let total = 0;
  total += await migrateCollection("attempts", "referenceFaceImage", "referenceFacePath", storage.REFERENCE_BUCKET);
  total += await migrateCollection("attempts", "latestFrame", "latestFramePath", storage.FRAME_BUCKET);
  total += await migrateCollection("violations", "cameraFrame", "cameraFramePath", storage.FRAME_BUCKET);

  console.log(`\nDone. ${APPLY ? "Moved" : "Would move"} ${total} image(s).`);

  if (APPLY) {
    console.log("MongoDB leaves freed space unreclaimed until compaction; check available disk if it was tight.");
  }
}

main()
  .then(async () => {
    await closeDB();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Migration failed:", err.message);
    await closeDB().catch(() => {});
    process.exit(1);
  });

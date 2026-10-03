"use strict";

/**
 * Supabase Storage wrapper for binary assets.
 *
 * Proctoring frames and reference face images are student biometric data, so
 * they live in Supabase Storage (private buckets + short-lived signed URLs)
 * instead of MongoDB. MongoDB keeps only the object path, which turns a
 * 16 MB document limit into a non-issue and keeps the hot `violations`
 * collection cheap to query.
 */

const { createClient } = require("@supabase/supabase-js");

const FRAME_BUCKET = process.env.SUPABASE_FRAME_BUCKET || "proctoring-frames";
const REFERENCE_BUCKET = process.env.SUPABASE_REFERENCE_BUCKET || "proctoring-reference";
const SIGNED_URL_TTL_SEC = Number(process.env.SUPABASE_SIGNED_URL_TTL_SEC || 900);

let client = null;
let clientError = null;

function getClient() {
  if (client) return client;
  if (clientError) throw clientError;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    clientError = new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Backend/.env");
    throw clientError;
  }

  // The publishable/anon key is public and cannot create buckets or sign URLs
  // for private buckets; it fails with a confusing "row-level security"
  // message. Catch it here and say what is actually wrong.
  const keyProblem = describeKeyProblem(key);
  if (keyProblem) {
    clientError = new Error(keyProblem);
    throw clientError;
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Returns a human-readable reason the key is unusable, or null if it looks right. */
function describeKeyProblem(key) {
  if (key.startsWith("sb_publishable_")) {
    return (
      "SUPABASE_SERVICE_ROLE_KEY is a publishable/anon key, not the secret key. " +
      "Use Supabase -> Project Settings -> API Keys -> Secret keys (`sb_secret_...`), " +
      "or the legacy `service_role` JWT. A publishable key cannot access private buckets."
    );
  }

  if (key.startsWith("sb_secret_")) return null;

  // Legacy JWT keys: decode the payload and check the role claim.
  if (key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64").toString("utf8"));
      if (payload.role === "anon") {
        return (
          "SUPABASE_SERVICE_ROLE_KEY is the legacy `anon` JWT, which cannot access private buckets. " +
          "Use the `service_role` JWT or an `sb_secret_...` key instead."
        );
      }
      if (!payload.role) return "SUPABASE_SERVICE_ROLE_KEY is a JWT without a `role` claim.";
      return null;
    } catch {
      return "SUPABASE_SERVICE_ROLE_KEY looks like a JWT but could not be decoded.";
    }
  }

  return null;
}

function isConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Strip a `data:image/...;base64,` prefix if present. Accepts raw base64 or a Buffer. */
function toBuffer(image) {
  if (Buffer.isBuffer(image)) return image;
  if (typeof image !== "string") return null;
  const comma = image.indexOf(",");
  const raw = image.startsWith("data:") && comma !== -1 ? image.slice(comma + 1) : image;
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  return buf.length ? buf : null;
}

/**
 * Bucket keys must be unpredictable: these objects are biometric data and the
 * bucket is private, so the path is the only thing standing between a leaked
 * link and a student's face. Never derive this from a guessable id alone.
 */
function objectKey(scope, ext = "jpg") {
  const crypto = require("crypto");
  const rand = crypto.randomBytes(24).toString("hex");
  const scopePart = String(scope || "misc").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "misc";
  return `${scopePart}/${new Date().toISOString().slice(0, 10)}/${rand}.${ext}`;
}

/**
 * Ensure the private buckets exist. Called on boot; safe to call repeatedly.
 * Buckets are never made public - access is only via signed URLs.
 */
async function ensureBuckets() {
  if (!isConfigured()) return { skipped: true };
  const supabase = getClient();
  const created = [];

  for (const bucket of [FRAME_BUCKET, REFERENCE_BUCKET]) {
    const { error } = await supabase.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    // 404/duplicate means it is already there, which is the happy path on
    // every restart after the first.
    if (!error) created.push(bucket);
    else if (!/already exists|duplicate|resource already/i.test(error.message || "")) {
      throw new Error(`Could not create Supabase bucket "${bucket}": ${error.message}`);
    }
  }
  return { skipped: false, created };
}

/**
 * Upload an image and return its storage object key (NOT a public URL).
 * Returns null when Supabase is unconfigured so callers can degrade instead of
 * dropping the upload on the floor.
 */
async function uploadImage({ image, bucket = FRAME_BUCKET, scope = "misc", ext = "jpg", contentType = "image/jpeg" }) {
  if (!isConfigured()) return null;

  const buffer = toBuffer(image);
  if (!buffer) throw new Error("uploadImage requires base64 image data");

  const key = objectKey(scope, ext);
  const supabase = getClient();
  const { error } = await supabase.storage.from(bucket).upload(key, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  return { bucket, key, size: buffer.length, contentType };
}

/** Store an image and return just the `bucket/key` path that MongoDB will hold. */
async function uploadImagePath(opts) {
  const stored = await uploadImage(opts);
  return stored ? `${stored.bucket}/${stored.key}` : null;
}

/**
 * Resolve stored paths to displayable URLs.
 * - `bucket/key` paths are resolved through a signed URL.
 * - Legacy `data:` URLs and absolute http(s) URLs pass through untouched so
 *   documents written before this migration still render.
 */
async function resolveUrls(paths, ttlSec = SIGNED_URL_TTL_SEC) {
  const list = Array.isArray(paths) ? paths.filter(Boolean) : [paths].filter(Boolean);
  if (!list.length) return {};

  const supabasePaths = list.filter((p) => typeof p === "string" && !/^(data:|https?:)/.test(p));
  if (!supabasePaths.length) return Object.fromEntries(list.map((p) => [p, p]));

  const out = {};
  await Promise.all(
    supabasePaths.map(async (path) => {
      const slash = path.indexOf("/");
      if (slash === -1) {
        out[path] = null;
        return;
      }
      const bucket = path.slice(0, slash);
      const key = path.slice(slash + 1);
      try {
        const { data, error } = await getClient().storage.from(bucket).createSignedUrl(key, ttlSec);
        out[path] = error ? null : data.signedUrl;
      } catch {
        out[path] = null;
      }
    })
  );

  for (const p of list) if (/^(data:|https?:)/.test(p)) out[p] = p;

  return out;
}

async function signedUrl(bucketOrPath, ttlSec = SIGNED_URL_TTL_SEC) {
  if (!bucketOrPath) return null;
  if (/^(data:|https?:)/.test(bucketOrPath)) return bucketOrPath;
  if (!isConfigured()) return null;

  const slash = bucketOrPath.indexOf("/");
  if (slash === -1) return null;
  const bucket = bucketOrPath.slice(0, slash);
  const key = bucketOrPath.slice(slash + 1);
  const { data, error } = await getClient().storage.from(bucket).createSignedUrl(key, ttlSec);
  return error ? null : data.signedUrl;
}

module.exports = {
  FRAME_BUCKET,
  REFERENCE_BUCKET,
  SIGNED_URL_TTL_SEC,
  ensureBuckets,
  isConfigured,
  resolveUrls,
  signedUrl,
  uploadImage,
  uploadImagePath,
};

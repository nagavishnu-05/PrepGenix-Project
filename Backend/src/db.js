"use strict";

const { MongoClient, ObjectId } = require("mongodb");

let client = null;
let resumeClient = null;
const databases = {};

function dbName(key) {
  if (key === "perf") return process.env.PERF_DB || `${process.env.DB_NAME || "codeassess"}_perf`;
  if (key === "resume") return process.env.RESUME_DB || `${process.env.DB_NAME || "codeassess"}_resumes`;
  return process.env.DB_NAME || "codeassess";
}

async function connectDB() {
  const url = process.env.DATABASE_URL || "mongodb://localhost:27017/codeassess";
  const opts = {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 30000,
    readPreference: "primary",
    retryWrites: true,
    w: "majority",
  };
  client = new MongoClient(url, opts);
  await client.connect();
  databases.main = client.db(dbName("main"));
  databases.perf = client.db(dbName("perf"));

  // Resume client: connect lazily so it doesn't block server startup
  const resumeUrl = process.env.RESUME_DATABASE_URL || process.env.DATABASE_URL || "mongodb://localhost:27017/codeassess_resumes";
  const resumeOpts = {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 30000,
    readPreference: "primary",
    retryWrites: true,
    w: "majority",
  };
  resumeClient = new MongoClient(resumeUrl, resumeOpts);
  resumeClient.connect().then(() => {
    databases.resume = resumeClient.db(dbName("resume"));
  }).catch((err) => {
    console.error("Resume DB connection failed (non-blocking):", err.message);
  });

  return databases.main;
}

function getDb(key = "main") {
  const db = databases[key] || databases.main;
  if (!db) throw new Error(`Database "${key}" not connected yet`);
  return db;
}

function col(name, dbKey = "main") {
  return getDb(dbKey).collection(name);
}

function id(value) {
  if (typeof value === "string" && ObjectId.isValid(value)) return new ObjectId(value);
  return value;
}

function toId(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { ...rest, id: _id.toString() };
}

function toIds(docs) {
  return docs.map(toId);
}

// Reliable upsert that avoids updateOne({upsert:true}) which is flaky on some MongoDB hosts.
// Merges filter + set fields into the inserted document.
async function upsertDoc(collection, filter, setFields, pushFields = null, insertFields = {}) {
  const existing = await collection.findOne(filter);
  if (existing) {
    const update = { $set: setFields };
    if (pushFields) update.$push = pushFields;
    await collection.updateOne({ _id: existing._id }, update);
    return { inserted: false, id: existing._id };
  }
  const doc = { ...filter, ...setFields, ...insertFields };
  if (pushFields) {
    for (const [key, value] of Object.entries(pushFields)) doc[key] = [value];
  }
  const result = await collection.insertOne(doc);
  return { inserted: true, id: result.insertedId };
}

async function closeDB() {
  if (client) await client.close();
  if (resumeClient) await resumeClient.close();
}

module.exports = { connectDB, getDb, col, id, toId, toIds, upsertDoc, closeDB, ObjectId };

"use strict";

const { col, toId, upsertDoc } = require("./db");

async function getPerformance(regNo) {
  let doc = await col("performances", "perf").findOne({ regNo });
  if (!doc) {
    doc = { regNo, aptitude: [], coding: [], interview: [], updatedAt: new Date() };
  }
  return toId(doc);
}

async function pushAptitude(regNo, entry) {
  await upsertDoc(col("performances", "perf"), { regNo }, { updatedAt: new Date() }, { aptitude: { ...entry, date: new Date() } });
}

async function pushCoding(regNo, entry) {
  await upsertDoc(col("performances", "perf"), { regNo }, { updatedAt: new Date() }, { coding: { ...entry, date: new Date() } });
}

async function pushInterview(regNo, entry) {
  await upsertDoc(col("performances", "perf"), { regNo }, { updatedAt: new Date() }, { interview: { ...entry, date: new Date() } });
}

module.exports = { getPerformance, pushAptitude, pushCoding, pushInterview };

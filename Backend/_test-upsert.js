require("dotenv").config();
const { MongoClient } = require("mongodb");

(async () => {
  const c = new MongoClient(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 10000 });
  await c.connect();
  const col = c.db("codeassess").collection("users");
  let ok = 0, fail = 0;
  for (let i = 0; i < 10; i++) {
    const username = `ins${i}@x.com`;
    try {
      const r = await col.insertOne({ role: "staff", username, name: "I", passwordHash: "x", createdAt: new Date() });
      if (r.insertedId) ok++;
      else fail++;
    } catch (e) { fail++; console.log("insert error:", e.message); }
  }
  console.log("insertOne loop -> ok=", ok, "fail=", fail);
  // matched updateOne
  const u = await col.findOne({ username: "ins0@x.com" });
  const r2 = await col.updateOne({ _id: u._id }, { $set: { name: "UPDATED" } });
  console.log("matched updateOne ->", JSON.stringify(r2));
  const check = await col.findOne({ username: "ins0@x.com" });
  console.log("after update, name =", check.name);
  await col.deleteMany({ username: { $regex: /^ins\d+@/ } });
  await c.close();
})();

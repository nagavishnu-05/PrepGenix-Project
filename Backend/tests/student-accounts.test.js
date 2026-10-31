"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { migrateLegacyStudentAccounts, publicStudent } = require("../src/lib/student-accounts");

function matches(document, filter) {
  return Object.entries(filter).every(([key, value]) => document[key] === value);
}

function fakeCollection(rows = []) {
  return {
    rows,
    find(filter) {
      return { toArray: async () => rows.filter((row) => matches(row, filter)) };
    },
    async findOne(filter) {
      return rows.find((row) => matches(row, filter)) || null;
    },
    async updateOne(filter, update) {
      const row = rows.find((item) => matches(item, filter));
      if (!row) return { matchedCount: 0 };
      Object.assign(row, update.$set);
      return { matchedCount: 1 };
    },
    async insertOne(document) {
      const row = { ...document, _id: `new-${rows.length}` };
      rows.push(row);
      return { insertedId: row._id };
    },
    async deleteOne(filter) {
      const index = rows.findIndex((row) => matches(row, filter));
      if (index < 0) return { deletedCount: 0 };
      rows.splice(index, 1);
      return { deletedCount: 1 };
    },
  };
}

test("legacy student logins move into profiles without overwriting existing passwords", async () => {
  const users = fakeCollection([
    { _id: "legacy-1", role: "student", username: "REG1", name: "Student One", passwordHash: "old-hash-1" },
    { _id: "legacy-2", role: "student", username: "REG2", name: "Student Two", passwordHash: "old-hash-2" },
    { _id: "legacy-3", role: "student", username: "REG3", name: "Student Three", passwordHash: "old-hash-3" },
  ]);
  const students = fakeCollection([
    { _id: "student-1", regNo: "REG1", name: "Student One", passwordHash: "changed-hash" },
    { _id: "student-2", regNo: "REG2", name: "Student Two" },
  ]);

  const result = await migrateLegacyStudentAccounts(users, students);

  assert.deepEqual(result, { migrated: 3, removedIncomplete: 0 });
  assert.equal(users.rows.length, 0);
  assert.equal(students.rows[0].passwordHash, "changed-hash");
  assert.equal(students.rows[1].passwordHash, "old-hash-2");
  assert.equal(students.rows[2].regNo, "REG3");
  assert.equal(students.rows[2].passwordHash, "old-hash-3");
});

test("legacy student accounts without credentials are removed but do not gain a login password", async () => {
  const users = fakeCollection([{ _id: "legacy", role: "student", username: "REG1" }]);
  const students = fakeCollection();
  const result = await migrateLegacyStudentAccounts(users, students);

  assert.deepEqual(result, { migrated: 0, removedIncomplete: 1 });
  assert.equal(users.rows.length, 0);
  assert.equal(students.rows[0].regNo, "REG1");
  assert.equal(students.rows[0].passwordHash, undefined);
});

test("student API serialization never exposes the password hash", () => {
  const result = publicStudent({ _id: "student-id", regNo: "REG1", passwordHash: "secret-hash", name: "Student" });

  assert.deepEqual(result, { id: "student-id", regNo: "REG1", name: "Student" });
});

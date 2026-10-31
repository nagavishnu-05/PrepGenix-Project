"use strict";

const { col, toId } = require("../db");

function publicStudent(student) {
  if (!student) return null;
  const { passwordHash: _passwordHash, ...safeStudent } = student;
  return toId(safeStudent);
}

async function migrateLegacyStudentAccounts(
  users = col("users"),
  students = col("students")
) {
  const legacyAccounts = await users.find({ role: "student" }).toArray();
  let migrated = 0;
  let removedIncomplete = 0;

  for (const account of legacyAccounts) {
    const regNo = String(account.username || "").trim();
    if (!regNo) {
      await users.deleteOne({ _id: account._id });
      removedIncomplete += 1;
      continue;
    }

    const student = await students.findOne({ regNo });
    const now = new Date();
    if (student) {
      const updates = {};
      if (!student.passwordHash && account.passwordHash) updates.passwordHash = account.passwordHash;
      if (!student.name && account.name) updates.name = account.name;
      if (!student.avatar && account.avatar) updates.avatar = account.avatar;
      if (Object.keys(updates).length) {
        updates.updatedAt = now;
        await students.updateOne({ _id: student._id }, { $set: updates });
      }
    } else {
      await students.insertOne({
        regNo,
        rollNo: "",
        name: account.name || regNo,
        email: "",
        mobile: "",
        tenth: "",
        twelfth: "",
        cgpa: "",
        batch: "",
        ...(account.passwordHash ? { passwordHash: account.passwordHash } : {}),
        ...(account.avatar ? { avatar: account.avatar } : {}),
        createdAt: account.createdAt || now,
        updatedAt: now,
      });
    }

    await users.deleteOne({ _id: account._id });
    if (account.passwordHash) migrated += 1;
    else removedIncomplete += 1;
  }

  return { migrated, removedIncomplete };
}

module.exports = { migrateLegacyStudentAccounts, publicStudent };

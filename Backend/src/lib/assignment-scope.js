"use strict";

function isStudentAssignedToTest(test, student) {
  if (!test || !student) return false;
  if (test.assignedToAll) return true;
  const identifiers = [student.regNo, student.rollNo].filter(Boolean).map(String);
  const assignedBatches = new Set([
    ...(Array.isArray(test.assignedBatches) ? test.assignedBatches : []),
    test.assignedBatch,
  ].filter(Boolean).map(String));
  const assignedStudents = new Set((Array.isArray(test.assignedStudents) ? test.assignedStudents : []).map(String));
  return (student.batch && assignedBatches.has(String(student.batch)))
    || identifiers.some((identifier) => assignedStudents.has(identifier));
}

function assignedRegistrationNumbers(test, students) {
  if (!test) return new Set();
  if (test.assignedToAll) return new Set(students.map((student) => student.regNo));
  const assignedBatches = new Set([
    ...(Array.isArray(test.assignedBatches) ? test.assignedBatches : []),
    test.assignedBatch,
  ].filter(Boolean).map(String));
  const identifiers = new Set((Array.isArray(test.assignedStudents) ? test.assignedStudents : []).map(String));
  return new Set(students
    .filter((student) => assignedBatches.has(String(student.batch))
      || identifiers.has(String(student.regNo))
      || identifiers.has(String(student.rollNo)))
    .map((student) => student.regNo));
}

module.exports = { isStudentAssignedToTest, assignedRegistrationNumbers };

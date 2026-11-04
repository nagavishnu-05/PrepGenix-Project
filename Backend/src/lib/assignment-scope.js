"use strict";

function isStudentAssignedToTest(test, student) {
  if (!test || !student) return false;
  if (test.assignmentMode === "students") {
    const identifiers = [student.regNo, student.rollNo].filter(Boolean).map(String);
    return Array.isArray(test.assignedStudents)
      && test.assignedStudents.some((assignedStudent) => identifiers.includes(String(assignedStudent)));
  }
  if (test.assignedToAll) return true;
  if (test.assignedBatch && student.batch && test.assignedBatch === student.batch) return true;
  if (!Array.isArray(test.assignedStudents)) return false;
  const identifiers = [student.regNo, student.rollNo].filter(Boolean).map(String);
  return test.assignedStudents.some((assignedStudent) => identifiers.includes(String(assignedStudent)));
}

function assignedRegistrationNumbers(test, students) {
  if (!test) return new Set();
  if (test.assignedToAll) return new Set(students.map((student) => student.regNo));
  if (test.assignmentMode === "students") {
    const identifiers = new Set((test.assignedStudents || []).map(String));
    return new Set(students
      .filter((student) => identifiers.has(String(student.regNo)) || identifiers.has(String(student.rollNo)))
      .map((student) => student.regNo));
  }
  if (test.assignedBatch) {
    const assigned = new Set(
      students.filter((student) => student.batch === test.assignedBatch).map((student) => student.regNo)
    );
    const additionalIdentifiers = new Set((test.assignedStudents || []).map(String));
    for (const student of students) {
      if (additionalIdentifiers.has(String(student.regNo)) || additionalIdentifiers.has(String(student.rollNo))) {
        assigned.add(student.regNo);
      }
    }
    return assigned;
  }
  const identifiers = new Set((test.assignedStudents || []).map(String));
  return new Set(students
    .filter((student) => identifiers.has(String(student.regNo)) || identifiers.has(String(student.rollNo)))
    .map((student) => student.regNo));
}

module.exports = { isStudentAssignedToTest, assignedRegistrationNumbers };

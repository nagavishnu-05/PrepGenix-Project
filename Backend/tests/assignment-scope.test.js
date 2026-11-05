"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isStudentAssignedToTest, assignedRegistrationNumbers } = require("../src/lib/assignment-scope");
const { mergeStringLists } = require("../src/routes/tests");

test("test assignments retain recipients across batches and individual students", () => {
  const assignment = {
    assignmentMode: "batch",
    assignedBatch: "Batch B",
    assignedBatches: ["Batch A", "Batch B"],
    assignedStudents: ["REG-3"],
  };
  const students = [
    { regNo: "REG-1", rollNo: "R1", batch: "Batch A" },
    { regNo: "REG-2", rollNo: "R2", batch: "Batch B" },
    { regNo: "REG-3", rollNo: "R3", batch: "Batch C" },
    { regNo: "REG-4", rollNo: "R4", batch: "Batch C" },
  ];

  assert.equal(isStudentAssignedToTest(assignment, students[0]), true);
  assert.equal(isStudentAssignedToTest(assignment, students[1]), true);
  assert.equal(isStudentAssignedToTest(assignment, students[2]), true);
  assert.equal(isStudentAssignedToTest(assignment, students[3]), false);
  assert.deepEqual([...assignedRegistrationNumbers(assignment, students)], ["REG-1", "REG-2", "REG-3"]);
});

test("merging a new student assignment deduplicates without dropping existing recipients", () => {
  assert.deepEqual(
    mergeStringLists(["REG-1", " REG-2 "], ["REG-2", "REG-3"]),
    ["REG-1", "REG-2", "REG-3"],
  );
});

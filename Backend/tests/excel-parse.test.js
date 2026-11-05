"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");
const {
  rowsFromBuffer,
  parseAptitudeMcqManual,
  parseAptitudeQuestions,
} = require("../src/excel-parse");

function workbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Questions");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("imports a headerless aptitude workbook with four options and a correct-answer letter", () => {
  const rows = [
    ["Question one?", "first", "second", "third", "fourth", "B"],
    ["Question two?", "red", "green", "blue", "yellow", "D"],
  ];
  const parsedRows = rowsFromBuffer(workbookBuffer(rows), { headerlessAptitude: true });
  const questions = parseAptitudeMcqManual(parsedRows);

  assert.equal(questions.length, 2);
  assert.equal(questions[0].title, "Question one?");
  assert.deepEqual(questions[0].options, ["first", "second", "third", "fourth"]);
  assert.equal(questions[0].correctOption, 1);
  assert.equal(questions[1].correctOption, 3);
});

test("keeps the existing headered aptitude question format", () => {
  const rows = [
    ["Question", "Option A", "Option B", "Option C", "Option D", "Correct Answer"],
    ["Question with headers?", "one", "two", "three", "four", "C"],
  ];
  const parsedRows = rowsFromBuffer(workbookBuffer(rows), { headerlessAptitude: true });
  const questions = parseAptitudeQuestions(parsedRows);

  assert.equal(questions.length, 1);
  assert.equal(questions[0].title, "Question with headers?");
  assert.deepEqual(questions[0].options, ["one", "two", "three", "four"]);
  assert.equal(questions[0].correctOption, 2);
});

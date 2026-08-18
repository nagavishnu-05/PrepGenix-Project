"use strict";

const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const { connectDB, closeDB, col, upsertDoc } = require("./db");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

async function upsertCoordinator(username, password, name, role) {
  const passwordHash = await bcrypt.hash(password, 10);
  await upsertDoc(col("users"), { role, username }, { name, passwordHash, updatedAt: new Date() }, null, { createdAt: new Date() });
  console.log(`  ${role}: ${username} / ${password}  (${name})`);
}

async function upsertStudentStudent(student) {
  await upsertDoc(col("students"), { regNo: student.regNo }, student);
  const passwordHash = await bcrypt.hash(student.rollNo, 10);
  await upsertDoc(
    col("users"),
    { role: "student", username: student.regNo },
    { name: student.name, passwordHash, updatedAt: new Date() },
    null,
    { createdAt: new Date() }
  );
}

async function main() {
  console.log("Seeding placement portal database...");
  await connectDB();

  console.log("\n[Coordinators]");
  await upsertCoordinator("staff@gmail.com", "staff123", "Staff Coordinator", "staff");
  await upsertCoordinator("placement@gmail.com", "placement123", "Placement Coordinator", "placement");

  console.log("\n[Demonstration students]  (login: regNo / rollNo)");
  const demoStudents = [
    { regNo: "2023001", rollNo: "23CS001", name: "Arun Kumar", mobile: "9876543210", tenth: "92", twelfth: "90", cgpa: "8.6", department: "CSE", batch: "2023-2027", email: "arun@gmail.com" },
    { regNo: "2023002", rollNo: "23CS002", name: "Bhavana Sri", mobile: "9876543211", tenth: "88", twelfth: "85", cgpa: "8.1", department: "CSE", batch: "2023-2027", email: "bhavana@gmail.com" },
    { regNo: "2023003", rollNo: "23CS003", name: "Charan Teja", mobile: "9876543212", tenth: "90", twelfth: "88", cgpa: "7.9", department: "IT", batch: "2023-2027", email: "charan@gmail.com" },
    { regNo: "2024001", rollNo: "24CS001", name: "Divya Lakshmi", mobile: "9876543213", tenth: "95", twelfth: "93", cgpa: "9.0", department: "CSE", batch: "2024-2028", email: "divya@gmail.com" },
    { regNo: "2024002", rollNo: "24CS002", name: "Eswar Reddy", mobile: "9876543214", tenth: "86", twelfth: "82", cgpa: "7.4", department: "ECE", batch: "2024-2028", email: "eswar@gmail.com" },
  ];
  for (const s of demoStudents) {
    await upsertStudentStudent(s);
    console.log(`  ${s.regNo} / ${s.rollNo}  (${s.name})`);
  }

  console.log("\n[Demonstration questions]");
  const questions = col("questions");
  if ((await questions.countDocuments()) === 0) {
    const bank = [
      // Aptitude - easy
      { type: "aptitude", format: "mcq", subject: "quantitative", title: "Aptitude Easy 1", description: "What is 15% of 200?", options: ["25", "30", "35", "40"], correctOption: 1, answer: null, codeSnippet: "", difficulty: "easy", points: 1, tags: ["percentage"], examples: [], testCases: [], constraints: [], inputFormat: "", outputFormat: "" },
      { type: "aptitude", format: "mcq", subject: "quantitative", title: "Aptitude Easy 2", description: "If a train covers 120 km in 2 hours, what is its speed in km/h?", options: ["50", "60", "70", "80"], correctOption: 1, answer: null, codeSnippet: "", difficulty: "easy", points: 1, tags: ["speed"], examples: [], testCases: [], constraints: [], inputFormat: "", outputFormat: "" },
      { type: "aptitude", format: "fillup", subject: "verbal", title: "Aptitude Easy 3", description: "Complete the series: 2, 4, 8, 16, ?", options: [], correctOption: null, answer: "32", codeSnippet: "", difficulty: "easy", points: 1, tags: ["series"], examples: [], testCases: [], constraints: [], inputFormat: "", outputFormat: "" },
      // Aptitude - medium
      { type: "aptitude", format: "mcq", subject: "quantitative", title: "Aptitude Medium 1", description: "A shopkeeper marks an item at Rs.500 and gives a 20% discount. What is the selling price?", options: ["350", "380", "400", "420"], correctOption: 2, answer: null, codeSnippet: "", difficulty: "medium", points: 1, tags: ["discount"], examples: [], testCases: [], constraints: [], inputFormat: "", outputFormat: "" },
      { type: "aptitude", format: "mcq", subject: "logical", title: "Aptitude Medium 2", description: "Pointing to a photo, Ram says 'He is the son of my father's only daughter'. How is the person related to Ram?", options: ["Brother", "Nephew", "Son", "Cousin"], correctOption: 1, answer: null, codeSnippet: "", difficulty: "medium", points: 1, tags: ["relations"], examples: [], testCases: [], constraints: [], inputFormat: "", outputFormat: "" },
      { type: "aptitude", format: "fillup", subject: "quantitative", title: "Aptitude Medium 3", description: "The sum of three consecutive odd numbers is 57. Find the middle number.", options: [], correctOption: null, answer: "19", codeSnippet: "", difficulty: "medium", points: 1, tags: ["numbers"], examples: [], testCases: [], constraints: [], inputFormat: "", outputFormat: "" },
      // Aptitude - hard
      { type: "aptitude", format: "mcq", subject: "quantitative", title: "Aptitude Hard 1", description: "A boat takes 4 hours to travel 48 km downstream and 6 hours upstream. Find the speed of the stream.", options: ["1 km/h", "2 km/h", "3 km/h", "4 km/h"], correctOption: 1, answer: null, codeSnippet: "", difficulty: "hard", points: 1, tags: ["boats"], examples: [], testCases: [], constraints: [], inputFormat: "", outputFormat: "" },
      { type: "aptitude", format: "fillup", subject: "logical", title: "Aptitude Hard 2", description: "In a certain code, MOUSE is written as ONWUC. How is PAPER written?", options: [], correctOption: null, answer: "RCRGT", codeSnippet: "", difficulty: "hard", points: 1, tags: ["coding-decoding"], examples: [], testCases: [], constraints: [], inputFormat: "", outputFormat: "" },
      { type: "aptitude", format: "code_snippet", subject: "technical", title: "Aptitude Hard 3", description: "What does the following program print?", codeSnippet: "let x = 5;\nlet y = x++ + ++x;\nconsole.log(y);", options: ["10", "11", "12", "13"], correctOption: 2, answer: null, difficulty: "hard", points: 1, tags: ["js"], examples: [], testCases: [], constraints: [], inputFormat: "", outputFormat: "" },
      // Coding - easy
      { type: "coding", format: "programming", subject: "coding", title: "Coding Easy 1", description: "Read an integer N and print the sum of the first N natural numbers.", options: [], correctOption: null, answer: null, codeSnippet: "", language: "python", difficulty: "easy", points: 10, tags: ["loops"], constraints: ["1 <= N <= 1000"], inputFormat: "A single integer N", outputFormat: "Print the sum", examples: [{ input: "5", output: "15" }], testCases: [{ orderIndex: 0, input: "5", expectedOutput: "15", isHard: false }, { orderIndex: 1, input: "10", expectedOutput: "55", isHard: false }], source: "manual" },
      { type: "coding", format: "programming", subject: "coding", title: "Coding Easy 2", description: "Given two integers A and B, print A + B.", options: [], correctOption: null, answer: null, codeSnippet: "", language: "javascript", difficulty: "easy", points: 10, tags: ["arithmetic"], constraints: ["-10^9 <= A, B <= 10^9"], inputFormat: "Two space separated integers", outputFormat: "Print their sum", examples: [{ input: "2 3", output: "5" }], testCases: [{ orderIndex: 0, input: "2 3", expectedOutput: "5", isHard: false }, { orderIndex: 1, input: "-5 8", expectedOutput: "3", isHard: false }], source: "manual" },
      // Coding - medium
      { type: "coding", format: "programming", subject: "coding", title: "Coding Medium 1", description: "Given an array of N integers, print the maximum element.", options: [], correctOption: null, answer: null, codeSnippet: "", language: "python", difficulty: "medium", points: 10, tags: ["arrays"], constraints: ["1 <= N <= 100000"], inputFormat: "First line N, second line N space separated integers", outputFormat: "Print the maximum", examples: [{ input: "5\n1 9 4 7 3", output: "9" }], testCases: [{ orderIndex: 0, input: "5\n1 9 4 7 3", expectedOutput: "9", isHard: false }, { orderIndex: 1, input: "3\n-1 -5 -2", expectedOutput: "-1", isHard: false }], source: "manual" },
      { type: "coding", format: "programming", subject: "coding", title: "Coding Medium 2", description: "Given a string S, print it reversed.", options: [], correctOption: null, answer: null, codeSnippet: "", language: "javascript", difficulty: "medium", points: 10, tags: ["strings"], constraints: ["1 <= |S| <= 100000"], inputFormat: "A single line string S", outputFormat: "Print the reversed string", examples: [{ input: "hello", output: "olleh" }], testCases: [{ orderIndex: 0, input: "hello", expectedOutput: "olleh", isHard: false }, { orderIndex: 1, input: "abcd", expectedOutput: "dcba", isHard: false }], source: "manual" },
      // Coding - hard
      { type: "coding", format: "programming", subject: "coding", title: "Coding Hard 1", description: "Given an array of N integers, print the length of the longest increasing subsequence.", options: [], correctOption: null, answer: null, codeSnippet: "", language: "python", difficulty: "hard", points: 10, tags: ["dp"], constraints: ["1 <= N <= 1000"], inputFormat: "First line N, second line N space separated integers", outputFormat: "Print the LIS length", examples: [{ input: "8\n10 9 2 5 3 7 101 18", output: "4" }], testCases: [{ orderIndex: 0, input: "8\n10 9 2 5 3 7 101 18", expectedOutput: "4", isHard: false }, { orderIndex: 1, input: "6\n0 1 0 3 2 3", expectedOutput: "4", isHard: false }], source: "manual" },
    ];
    const now = new Date();
    await questions.insertMany(bank.map((q) => ({ ...q, createdAt: now, updatedAt: now })));
    console.log(`  Added ${bank.length} demonstration questions (aptitude + coding)`);
  } else {
    console.log("  Question bank already has data, skipping");
  }

  console.log("\nSeeding complete.");
  await closeDB();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});

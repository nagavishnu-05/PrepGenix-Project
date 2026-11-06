# Question and Role Dataset Formats

Use one header row in every workbook. Use one question or one labeled resume per row. Topic and difficulty values are used to filter adaptive question pools; use `easy`, `medium`, or `hard` consistently. `AIML/data/skills.json` is only a role/skill taxonomy and is not an assessment question file.

## Assessment question workbooks

Create separate workbooks for each format, or keep one format per worksheet. For Excel imports, the staff test form accepts `.xlsx`, `.xls`, and `.csv`.

### Aptitude MCQ

Required: `Question`, `Option A`, `Option B`, `Option C`, `Option D`, `Correct Answer`. `Correct Answer` is the option letter (`A`-`D`) or the exact option text.

Optional: `Topic`, `Difficulty`, `Points`, `Explanation`.

| Question | Option A | Option B | Option C | Option D | Correct Answer | Topic | Difficulty | Points |
|---|---|---|---|---|---|---|---|---:|
| A value rises from 80 to 100. What is the percentage increase? | 15% | 20% | 25% | 30% | C | Percentages | easy | 1 |

### Aptitude fill-up

Required: `Question`, `Correct Answer`. Optional `Accepted Answers` may contain equivalent answers separated by semicolons. Also supported: `Topic`, `Difficulty`, `Points`, `Explanation`.

| Question | Correct Answer | Accepted Answers | Topic | Difficulty | Points |
|---|---|---|---|---|---:|
| What is the mean of 2, 4, and 6? | 4 | four; 4.0 | Averages | easy | 1 |

### Coding MCQ

Use the Aptitude MCQ columns. Optional columns: `Code Snippet`, `Topic`, `Difficulty`, `Points`, `Explanation`. Coding MCQ questions are stored as coding questions with `format=mcq`; they do not need programming test cases.

### Coding programming

Required: `Question`, `Problem Statement`, `Input Format`, `Output Format`, `Constraints`, and at least one test case in `Test Case 1` through `Test Case 5`. A test-case cell can use `input => expected output`. Use `Edge Case 1` or `Edge Case 2` for additional boundary cases. Optional: `Starter Code`, `Language`, `Topic`, `Difficulty`, `Points`, `Example 1 Input`, and `Example 1 Output`.

| Question | Problem Statement | Input Format | Output Format | Constraints | Test Case 1 | Edge Case 1 | Topic | Difficulty | Points |
|---|---|---|---|---|---|---|---|---|---:|
| Sum two integers | Read two integers and print their sum. | Two integers `a b` | Their sum | -10^9 <= a,b <= 10^9 | 2 3 => 5 | 0 0 => 0 | Arrays and basics | easy | 10 |

## Skill and Core CS question datasets

Use the Aptitude MCQ, Aptitude fill-up, Coding MCQ, or Coding programming columns above. Keep one skill or core subject per workbook when possible. Always fill `Topic` with the specific subject used by the staff test (for example `React Hooks`, `Node.js`, `SQL Joins`, `Java Collections`, `Operating Systems`, `DBMS`, `Computer Networks`, or `Data Structures and Algorithms`). Use `Tags` for additional searchable concepts, separated by commas or semicolons.

Example skill topics include HTML semantics, CSS layout, JavaScript closures, React state/effects, Node.js event loop, Express middleware, Java OOP, SQL joins, and MongoDB aggregation. Example Core CS topics include data structures, algorithms, operating systems, DBMS/SQL, networking, OOP, and software engineering.

## Resume role-recognition dataset

This is a separate supervised dataset, not an assessment-question workbook. Use one resume/profile example per row and consistent role labels. Avoid personal identifiers; use anonymized or synthetic resume content.

Required columns: `Resume Text`, `Skills`, `Projects`, `Experience`, `Target Role`.

Optional: `Education`, `Secondary Roles`, `Skill Evidence`, `Label Source`. Separate multiple skills/roles with semicolons. Keep `Target Role` to one canonical label per row; duplicate a multi-role example into separate labeled rows if training a single-label classifier.

| Resume Text | Skills | Projects | Experience | Education | Target Role | Secondary Roles |
|---|---|---|---|---|---|---|
| Built a React dashboard and Node.js REST API backed by MongoDB. | React; JavaScript; Node.js; Express; MongoDB | Inventory dashboard; REST API | Internship, 6 months | BSc Computer Science | Full Stack Developer | Frontend Developer; Backend Developer |

Canonical role examples: Frontend Developer, Backend Developer, Full Stack Developer, Java Developer, Python Developer, Data Analyst, Data Scientist, DevOps Engineer, QA Engineer, Mobile Developer, Cloud Engineer, Database Engineer, and UI/UX Designer. Keep labels consistent with the taxonomy in `AIML/data/skills.json`.

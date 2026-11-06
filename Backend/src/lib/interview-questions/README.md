# Skill question datasets

Each `.xlsx` file contains one skill's interview question dataset. Keep these
three headers in the first worksheet:

| Question | Most Realistic Answer | Keywords for Other Answer Structures |
|---|---|---|
| A skill-specific interview question | A concise reference response, not the only acceptable answer | `concept one; concept two; accepted phrase` |

Use one row per question. Separate alternative answer concepts with semicolons.
The interview planner reads the question column to select varied questions.
The answer and keyword columns guide coordinator report generation; they are
not sent to candidates. They describe technical concepts, not exact phrases
that a candidate must repeat.

These are text question-and-answer datasets. They do not contain audio and do
not train or tune speech recognition.

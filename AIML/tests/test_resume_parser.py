import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import parse_resume


class ResumeParserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rules = parse_resume.load_rules()

    def test_javascript_does_not_match_java_or_single_letter_r(self):
        text = "Frontend developer with JavaScript, React, and CSS experience."

        skills = parse_resume.find_skills(text, self.rules)
        roles = parse_resume.categorize(text, self.rules, skills)
        role_names = {role["name"] for role in roles}

        self.assertIn("javascript", skills)
        self.assertNotIn("java", skills)
        self.assertNotIn("Java Developer", role_names)
        self.assertNotIn("Data Analyst", role_names)

    def test_punctuated_skill_names_match_as_complete_terms(self):
        skills = parse_resume.find_skills(
            "Built services with Node.js, C++, and .NET.",
            self.rules,
        )

        self.assertIn("node", skills)
        self.assertIn("c++", skills)
        self.assertIn(".net", skills)
        self.assertNotIn(".net", parse_resume.find_skills("The internet has resources.", self.rules))


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Resume parser for the placement portal.

Reads a resume (PDF or TXT) and extracts:
  - matched skills (keyword based)
  - suggested role categories (Full Stack Developer, Mobile Developer, ...)

Usage:
  python parse_resume.py --input <path-to-resume> [--out <json-output>]
  echo "<plain text>" | python parse_resume.py --text-stdin

Outputs a JSON object: { skills: [...], categories: [{name, score}], text: "..." }
"""

import argparse
import json
import os
import re
import sys

SKILLS_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "skills.json")

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None


def load_rules():
    with open(SKILLS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_text(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        if PdfReader is None:
            raise RuntimeError("pypdf is required to read PDF files. Run: pip install -r requirements.txt")
        reader = PdfReader(path)
        parts = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        return "\n".join(parts)
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def normalize(text):
    return re.sub(r"\s+", " ", text or "").lower()


def find_skills(text, rules):
    norm = normalize(text)
    found = []
    for skill in rules["skills"]:
        key = skill.lower()
        if key in norm:
            found.append(skill)
    return sorted(set(found), key=lambda s: norm.find(s.lower()))


def categorize(text, rules, skills):
    norm = normalize(text)
    results = []
    for cat, cfg in rules["categories"].items():
        score = 0
        hits = []
        for kw in cfg["keywords"]:
            if kw.lower() in norm:
                score += 1
                hits.append(kw)
        if score > 0:
            results.append({"name": cat, "score": score, "hits": hits[:6]})
    results.sort(key=lambda r: r["score"], reverse=True)
    if not results:
        results = [{"name": "General Software Engineer", "score": 1, "hits": skills[:3]}]
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="path to resume file (pdf/txt)")
    parser.add_argument("--out", help="optional output file path")
    parser.add_argument("--text-stdin", action="store_true", help="read plain text from stdin")
    args = parser.parse_args()

    rules = load_rules()

    if args.text_stdin:
        text = sys.stdin.read()
    elif args.input:
        text = extract_text(args.input)
    else:
        print(json.dumps({"error": "Provide --input or --text-stdin"}))
        sys.exit(1)

    if not text.strip():
        print(json.dumps({"error": "No extractable text in resume", "skills": [], "categories": []}))
        sys.exit(0)

    skills = find_skills(text, rules)
    categories = categorize(text, rules, skills)

    result = {
        "skills": skills,
        "categories": categories,
        "text": text[:20000],
        "topCategory": categories[0]["name"] if categories else None,
    }

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    else:
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

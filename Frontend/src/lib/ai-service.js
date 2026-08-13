export const aiService = {
    reviewCode: async (code, language, questionTitle) => {
        await new Promise((r) => setTimeout(r, 1500));
        const lines = code.split("\n").length;
        const hasLoop = /for|while|do/.test(code);
        const hasNestedLoop = /for[\s\S]*for|while[\s\S]*while/.test(code);
        const hasMap = /Map|dict|hash|HashMap/.test(code);
        let timeComplexity = "O(n)";
        let spaceComplexity = "O(1)";
        if (hasNestedLoop) {
            timeComplexity = "O(n²)";
            spaceComplexity = "O(1)";
        }
        if (hasMap) {
            timeComplexity = "O(n)";
            spaceComplexity = "O(n)";
        }
        const qualityScore = Math.min(100, Math.floor(60 + Math.random() * 40));
        const suggestions = [
            "Consider adding edge case handling for empty inputs",
            "The solution could benefit from more descriptive variable names",
            "Add comments explaining the algorithm approach",
        ];
        if (!hasMap && hasLoop) {
            suggestions.push("Consider using a hash map for O(n) lookup instead of nested iteration");
        }
        const bugs = [];
        if (!code.includes("return")) {
            bugs.push("Missing return statement");
        }
        const improvements = [
            "Consider time and space complexity trade-offs",
            "Add input validation",
            "Handle edge cases (empty array, single element, duplicates)",
        ];
        return {
            timeComplexity,
            spaceComplexity,
            qualityScore,
            suggestions: suggestions.slice(0, 3),
            bugs,
            improvements: improvements.slice(0, 2),
            overallFeedback: `The solution demonstrates a solid understanding of the problem. ${qualityScore >= 80 ? "Great approach with efficient implementation." : "Consider optimizing the algorithm for better performance."}`,
        };
    },
    generateInterviewReport: async (candidateName, testTitle, score, violations) => {
        await new Promise((r) => setTimeout(r, 2000));
        let recommendation;
        if (score >= 90 && violations === 0)
            recommendation = "strong_hire";
        else if (score >= 75)
            recommendation = "hire";
        else if (score >= 55)
            recommendation = "borderline";
        else
            recommendation = "no_hire";
        return {
            summary: `${candidateName} completed "${testTitle}" with a score of ${score}%. ${violations > 0 ? `There were ${violations} proctoring violations during the assessment.` : "No proctoring violations were detected."}`,
            strengths: [
                "Strong problem-solving approach",
                "Clean and readable code",
                "Good time management",
            ],
            weaknesses: [
                "Could improve on edge case handling",
                "Room for optimization in complex scenarios",
            ],
            recommendation,
            confidenceScore: Math.floor(70 + Math.random() * 25),
            detailedAnalysis: `The candidate demonstrated solid coding fundamentals. Their approach to problem-solving was systematic and well-structured. ${score >= 80 ? "They showed excellent command of data structures and algorithms." : "There is room for improvement in algorithm design and optimization."} ${violations === 0 ? "The candidate maintained professional conduct throughout the assessment." : `The candidate had ${violations} violations, which should be considered in the overall evaluation.`}`,
        };
    },
    detectDuplicateCode: async (code, previousSubmissions) => {
        await new Promise((r) => setTimeout(r, 500));
        let maxSimilarity = 0;
        for (const prev of previousSubmissions) {
            const commonLines = code.split("\n").filter((line) => prev.includes(line.trim())).length;
            const totalLines = Math.max(code.split("\n").length, prev.split("\n").length);
            const similarity = (commonLines / totalLines) * 100;
            if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
            }
        }
        return {
            isDuplicate: maxSimilarity > 80,
            similarity: Math.round(maxSimilarity),
        };
    },
};

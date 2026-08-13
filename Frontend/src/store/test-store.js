import { create } from "zustand";

function getFallbackTemplate(lang) {
    if (lang === "c") {
        return "#include <stdio.h>\n\nint main() {\n    // Write your C code here\n    return 0;\n}\n";
    } else if (lang === "cpp") {
        return "#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your C++ code here\n    return 0;\n}\n";
    } else if (lang === "java") {
        return "import java.util.*;\n\npublic class Solution {\n    public static void main(String[] args) {\n        // Write your Java code here\n    }\n}\n";
    } else if (lang === "python" || lang === "py") {
        return "# Write your Python code here\n";
    }
    return "";
}

export const useTestStore = create((set) => ({
    currentTest: null,
    currentQuestion: null,
    currentAttempt: null,
    code: "",
    language: "python",
    output: "",
    isRunning: false,
    isSubmitting: false,
    violations: [],
    submissions: [],
    timeRemaining: 0,
    fullscreen: false,
    setCurrentTest: (test) => set({ currentTest: test }),
    setCurrentQuestion: (question) => set((state) => {
        const allowed = state.currentTest?.allowedLanguages || ["python", "cpp", "java", "c"];
        const lang = allowed.includes(state.language) ? state.language : (allowed[0] || "python");
        const defaultStarter = getFallbackTemplate(lang);
        return {
            currentQuestion: question,
            language: lang,
            code: question?.starterCode?.[lang] || defaultStarter
        };
    }),
    setCode: (code) => set({ code }),
    setLanguage: (language) => set((state) => {
        const currentCode = state.code;
        const q = state.currentQuestion;
        
        let isDefaultOrEmpty = !currentCode.trim();
        if (!isDefaultOrEmpty && q) {
            const prevLang = state.language;
            const prevStarter = q.starterCode?.[prevLang] || "";
            isDefaultOrEmpty = currentCode.trim() === prevStarter.trim() || 
                currentCode.trim() === getFallbackTemplate(prevLang).trim();
        }
        
        const nextStarter = q?.starterCode?.[language] || getFallbackTemplate(language);
        return {
            language,
            code: isDefaultOrEmpty ? nextStarter : currentCode
        };
    }),
    setOutput: (output) => set({ output }),
    setIsRunning: (running) => set({ isRunning: running }),
    setIsSubmitting: (submitting) => set({ isSubmitting: submitting }),
    addViolation: (violation) => set((state) => ({ violations: [...state.violations, violation] })),
    addSubmission: (submission) => set((state) => ({ submissions: [...state.submissions, submission] })),
    setTimeRemaining: (time) => set({ timeRemaining: time }),
    setFullscreen: (fullscreen) => set({ fullscreen }),
    setCurrentAttempt: (attempt) => set({ currentAttempt: attempt }),
    tick: () => set((state) => ({ timeRemaining: Math.max(0, state.timeRemaining - 1) })),
}));

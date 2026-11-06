function baseQuestionId(questionId) {
    return String(questionId || "").split("#")[0];
}

export function InterviewQuestionBreakdown({ plan, transcript }) {
    const questions = plan?.questions || [];
    if (!questions.length) return null;

    const answersByQuestion = new Map();
    for (const turn of transcript || []) {
        if (turn.role !== "candidate" || !turn.text) continue;
        const questionId = baseQuestionId(turn.questionId);
        const answers = answersByQuestion.get(questionId) || [];
        answers.push({
            isFollowUp: String(turn.questionId || "").includes("#"),
            text: turn.text,
        });
        answersByQuestion.set(questionId, answers);
    }

    const topicCounts = new Map();
    for (const question of questions) {
        const topic = question.topic || question.focus || "General";
        const counts = topicCounts.get(topic) || { total: 0, answered: 0 };
        counts.total += 1;
        if (answersByQuestion.has(question.id)) counts.answered += 1;
        topicCounts.set(topic, counts);
    }

    return (
        <section className="space-y-4 text-left">
            <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Topic breakdown</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                    {[...topicCounts].map(([topic, counts]) => (
                        <span key={topic} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
                            {topic} · {counts.answered}/{counts.total}
                        </span>
                    ))}
                </div>
            </div>
            <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Question-by-question breakdown</h3>
                <div className="mt-2 max-h-[50vh] space-y-3 overflow-y-auto pr-1">
                    {questions.map((question, index) => {
                        const answers = answersByQuestion.get(question.id) || [];
                        return (
                            <article key={question.id || index} className="rounded-lg border border-slate-200 p-3 dark:border-zinc-800">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
                                        {index + 1}. {question.text}
                                    </p>
                                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] capitalize text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                                        {question.topic || question.focus || "General"}
                                    </span>
                                </div>
                                {answers.length ? (
                                    <div className="mt-2 space-y-2">
                                        {answers.map((answer, answerIndex) => (
                                            <div key={`${question.id}-${answerIndex}`} className="rounded-md bg-slate-50 p-2.5 dark:bg-zinc-900/60">
                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                                                    {answer.isFollowUp ? "Follow-up answer" : "Student answer"}
                                                </p>
                                                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-zinc-300">{answer.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">No answer recorded.</p>
                                )}
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

import { CheckCircle2, CircleHelp, Clock, ShieldAlert, XCircle } from "lucide-react";
import { StatusBadge } from "@/components/portal/status-badge";
import { cn } from "@/lib/utils";

function displayAnswer(answer, question) {
    if (answer == null || answer === "") return "No answer recorded";
    if (typeof answer === "object" && answer.code !== undefined) {
        return `${answer.language || "Code"} submission`;
    }
    if (question?.format === "mcq" && typeof answer === "number") {
        return question.options?.[answer] ?? `Option ${String.fromCharCode(65 + answer)}`;
    }
    return String(answer);
}

function displayCorrectAnswer(question) {
    if (!question) return null;
    if (question.format === "mcq" && Number.isInteger(question.correctOption)) {
        return question.options?.[question.correctOption] ?? `Option ${String.fromCharCode(65 + question.correctOption)}`;
    }
    return question.correctAnswer == null ? null : String(question.correctAnswer);
}

function formatDate(value) {
    return value ? new Date(value).toLocaleString() : "—";
}

export function TestAttemptReport({ attempt }) {
    if (!attempt) return null;
    const answers = attempt.answers || [];
    const score = attempt.disqualified || attempt.status === "disqualified" ? 0 : Number(attempt.score) || 0;
    const totalScore = Number(attempt.totalScore) || 0;
    const correctCount = answers.filter((answer) => answer.correct).length;
    const percentage = totalScore ? Math.round((score / totalScore) * 100) : 0;
    const elapsedMs = attempt.startedAt && attempt.completedAt
        ? Math.max(0, new Date(attempt.completedAt) - new Date(attempt.startedAt))
        : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
                {attempt.type && <span className="rounded-md bg-slate-100 px-2 py-1 text-xs capitalize text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">{attempt.type}</span>}
                {attempt.mode && <span className="rounded-md bg-slate-100 px-2 py-1 text-xs capitalize text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">{attempt.mode}</span>}
                {(attempt.topics || []).map((topic) => (
                    <span key={topic} className="rounded-md bg-violet-500/10 px-2 py-1 text-xs text-violet-700 dark:text-violet-300">{topic}</span>
                ))}
                <StatusBadge value={attempt.result || attempt.status} />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[
                    ["Score", `${score}/${totalScore}`],
                    ["Percentage", `${percentage}%`],
                    ["Correct", `${correctCount}/${answers.length}`],
                    ["Attempted", `${answers.length}/${Number(attempt.totalQuestions) || answers.length}`],
                    ["Violations", String(attempt.violations ?? 0)],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center dark:border-zinc-800 dark:bg-zinc-950/40">
                        <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500">{label}</p>
                    </div>
                ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-zinc-800">
                    <p className="text-xs font-semibold uppercase text-slate-500 dark:text-zinc-500">Started</p>
                    <p className="mt-1 text-slate-800 dark:text-zinc-200">{formatDate(attempt.startedAt)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-zinc-800">
                    <p className="text-xs font-semibold uppercase text-slate-500 dark:text-zinc-500">Completed</p>
                    <p className="mt-1 text-slate-800 dark:text-zinc-200">{formatDate(attempt.completedAt)}</p>
                </div>
                {(attempt.scheduledStartAt || attempt.scheduledEndAt) && (
                    <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-zinc-800 sm:col-span-2">
                        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-zinc-500">Test availability window</p>
                        <p className="mt-1 text-slate-800 dark:text-zinc-200">
                            {formatDate(attempt.scheduledStartAt)} – {formatDate(attempt.scheduledEndAt)}
                        </p>
                    </div>
                )}
                {elapsedMs != null && (
                    <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-zinc-800">
                        <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500 dark:text-zinc-500"><Clock className="h-3.5 w-3.5" /> Time spent</p>
                        <p className="mt-1 text-slate-800 dark:text-zinc-200">{Math.floor(elapsedMs / 60000)}m {Math.floor((elapsedMs % 60000) / 1000)}s</p>
                    </div>
                )}
                {(attempt.timedOut || attempt.scheduleEnded) && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300">
                        <p className="flex items-center gap-1 font-semibold"><ShieldAlert className="h-4 w-4" />{attempt.scheduleEnded ? "Test availability ended" : "Time limit reached"}</p>
                        <p className="mt-1 text-xs">Answers saved before the deadline were included in this result.</p>
                    </div>
                )}
            </div>

            <section className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">Question breakdown</h3>
                {answers.length ? answers.map((answer, index) => {
                    const question = answer.question;
                    const expected = displayCorrectAnswer(question);
                    const submitted = answer.answer;
                    const code = submitted && typeof submitted === "object" && submitted.code !== undefined;
                    return (
                        <article key={`${answer.questionId || "question"}-${index}`} className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-2">
                                    {answer.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : question ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" /> : <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Question {index + 1}{question?.title ? ` · ${question.title}` : ""}</p>
                                        {question?.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-zinc-300">{question.description}</p>}
                                        {question?.codeSnippet && (
                                            <pre className="mt-2 overflow-x-auto whitespace-pre rounded-md bg-slate-100 p-3 text-xs text-slate-700 dark:bg-zinc-950 dark:text-zinc-300">{question.codeSnippet}</pre>
                                        )}
                                        {question?.format === "mcq" && question.options?.length > 0 && (
                                            <ol className="mt-2 space-y-1 text-xs text-slate-500 dark:text-zinc-400">
                                                {question.options.map((option, optionIndex) => (
                                                    <li key={optionIndex}>{String.fromCharCode(65 + optionIndex)}. {option}</li>
                                                ))}
                                            </ol>
                                        )}
                                        {(question?.inputFormat || question?.outputFormat) && (
                                            <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-zinc-400">
                                                {question.inputFormat && <p><strong>Input:</strong> {question.inputFormat}</p>}
                                                {question.outputFormat && <p><strong>Output:</strong> {question.outputFormat}</p>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <span className={cn("shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase", answer.correct ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400")}>
                                    {answer.correct ? "Correct" : "Incorrect"}
                                </span>
                            </div>
                            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                                <div className="rounded-md bg-slate-50 p-2 dark:bg-zinc-950/50">
                                    <p className="font-semibold text-slate-500 dark:text-zinc-500">Your answer</p>
                                    {code ? (
                                        <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words text-slate-700 dark:text-zinc-300">{submitted.code}</pre>
                                    ) : (
                                        <p className="mt-1 whitespace-pre-wrap break-words text-slate-700 dark:text-zinc-300">{displayAnswer(submitted, question)}</p>
                                    )}
                                </div>
                                {expected != null && (
                                    <div className="rounded-md bg-emerald-500/5 p-2">
                                        <p className="font-semibold text-emerald-700 dark:text-emerald-400">Correct answer</p>
                                        <p className="mt-1 whitespace-pre-wrap break-words text-slate-700 dark:text-zinc-300">{expected}</p>
                                    </div>
                                )}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-zinc-500">
                                <span>{answer.points ?? 0} points</span>
                                <span>{answer.timeTakenMs ? `${(answer.timeTakenMs / 1000).toFixed(1)} seconds` : "Time not recorded"}</span>
                                {answer.difficulty && <span className="capitalize">{answer.difficulty}</span>}
                                {answer.total > 0 && <span>{answer.passed || 0}/{answer.total} coding tests passed</span>}
                            </div>
                        </article>
                    );
                }) : (
                    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-zinc-700 dark:text-zinc-400">No question responses were recorded for this attempt.</p>
                )}
            </section>
        </div>
    );
}

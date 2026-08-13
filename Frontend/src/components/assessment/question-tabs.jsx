import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn, truncate } from "@/lib/utils";
function getQuestionStatus(questionId, submissions) {
    const questionSubmissions = submissions.filter((s) => s.questionId === questionId);
    if (questionSubmissions.some((s) => s.status === "accepted"))
        return "solved";
    if (questionSubmissions.length > 0)
        return "attempted";
    return "unsolved";
}
function getStatusColor(status) {
    switch (status) {
        case "solved":
            return "border-emerald-500 bg-emerald-500/10 text-emerald-400";
        case "attempted":
            return "border-amber-500 bg-amber-500/10 text-amber-400";
        case "unsolved":
            return "border-zinc-700 bg-zinc-800 text-zinc-400";
    }
}
function getDifficultyDot(difficulty) {
    switch (difficulty.toLowerCase()) {
        case "easy":
            return "bg-emerald-400";
        case "medium":
            return "bg-amber-400";
        case "hard":
            return "bg-red-400";
        default:
            return "bg-zinc-400";
    }
}
export function QuestionTabs({ questions, currentIndex, onSelect, submissions }) {
    return (<ScrollArea className="w-full">
      <div className="flex gap-1 p-1">
        {questions.map((question, index) => {
            const status = getQuestionStatus(question.id, submissions);
            const isActive = index === currentIndex;
            return (<button key={question.id} onClick={() => onSelect(index)} className={cn("flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition-all cursor-pointer", isActive
                    ? "border-violet-500 bg-violet-500/10 text-violet-300"
                    : getStatusColor(status))}>
              <span className={cn("h-2 w-2 rounded-full", getDifficultyDot(question.difficulty))}/>
              <span className="text-zinc-500">{index + 1}.</span>
              <span>{truncate(question.title, 20)}</span>
              <Badge variant={status === "solved" ? "success" : status === "attempted" ? "warning" : "secondary"} className="text-[10px] px-1.5 py-0">
                {status === "solved" ? "✓" : status === "attempted" ? "..." : "○"}
              </Badge>
            </button>);
        })}
      </div>
      <ScrollBar orientation="horizontal"/>
    </ScrollArea>);
}

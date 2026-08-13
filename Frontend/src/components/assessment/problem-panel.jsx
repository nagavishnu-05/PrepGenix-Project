import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { getDifficultyBg, cn } from "@/lib/utils";
import { Lightbulb, Tag } from "lucide-react";
function renderDescription(text) {
    const parts = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*)/);
    return parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
            const code = part.slice(3, -3).replace(/^[a-z]*\n/, "");
            return (<pre key={i} className="my-3 overflow-x-auto rounded-lg bg-zinc-950 border border-zinc-800 p-4 text-sm font-mono text-zinc-300">
          <code>{code.trim()}</code>
        </pre>);
        }
        if (part.startsWith("`") && part.endsWith("`")) {
            return (<code key={i} className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm font-mono text-violet-400">
          {part.slice(1, -1)}
        </code>);
        }
        if (part.startsWith("**") && part.endsWith("**")) {
            return (<strong key={i} className="font-semibold text-zinc-100">
          {part.slice(2, -2)}
        </strong>);
        }
        return <span key={i}>{part}</span>;
    });
}
export function ProblemPanel({ question }) {
    const visibleTestCases = question.testCases.filter((tc) => !tc.isHidden);
    return (<ScrollArea className="h-full">
      <div className="space-y-6 p-5">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-zinc-100">{question.title}</h2>
            <Badge className={cn("text-xs", getDifficultyBg(question.difficulty))}>
              {question.difficulty}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {question.points} pts
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {question.tags.map((tag) => (<Badge key={tag} variant="outline" className="text-xs text-zinc-400 border-zinc-700">
                <Tag className="mr-1 h-3 w-3"/>
                {tag}
              </Badge>))}
          </div>
        </div>

        <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
          {renderDescription(question.description)}
        </div>

        {question.constraints.length > 0 && (<div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-zinc-200">Constraints</h3>
            <ul className="space-y-1">
              {question.constraints.map((constraint, i) => (<li key={i} className="text-sm text-zinc-400 font-mono">
                  &bull; {constraint}
                </li>))}
            </ul>
          </div>)}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-200">Examples</h3>
          {question.examples.map((example, i) => (<Card key={i} className="border-zinc-800 bg-zinc-900/50 p-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">Input</Badge>
                  <code className="text-sm font-mono text-zinc-300">{example.input}</code>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="text-xs">Output</Badge>
                  <code className="text-sm font-mono text-zinc-300">{example.output}</code>
                </div>
                {example.explanation && (<p className="mt-2 text-xs text-zinc-500 italic">
                    Explanation: {example.explanation}
                  </p>)}
              </div>
            </Card>))}
        </div>

        {visibleTestCases.length > 0 && (<div className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200">Test Cases</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Case</TableHead>
                  <TableHead className="text-xs">Input</TableHead>
                  <TableHead className="text-xs">Expected Output</TableHead>
                  <TableHead className="text-xs">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTestCases.map((tc, i) => (<TableRow key={tc.id}>
                    <TableCell className="text-xs text-zinc-500">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">{tc.input}</TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">{tc.expectedOutput}</TableCell>
                    <TableCell className="text-xs text-zinc-500">{tc.points}</TableCell>
                  </TableRow>))}
              </TableBody>
            </Table>
          </div>)}

        {question.hints && question.hints.length > 0 && (<Accordion type="multiple" className="w-full">
            <AccordionItem value="hints" className="border-zinc-800">
              <AccordionTrigger className="text-sm text-zinc-300 hover:text-zinc-100">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-400"/>
                  Hints ({question.hints.length})
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                {question.hints.map((hint, i) => (<div key={i} className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-zinc-400">
                    <span className="font-medium text-amber-400">Hint {i + 1}:</span>{" "}
                    {hint}
                  </div>))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>)}
      </div>
    </ScrollArea>);
}

import { lazy, Suspense, useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Code } from "lucide-react";
const Editor = lazy(() => import("@monaco-editor/react"));
const editorFallback = (<div className="flex h-full w-full flex-col gap-2 p-4">
      <Skeleton className="h-8 w-48"/>
      <Skeleton className="h-4 w-32"/>
      <Skeleton className="h-4 w-64"/>
      <Skeleton className="h-4 w-40"/>
      <Skeleton className="h-4 w-56"/>
      <Skeleton className="h-4 w-36"/>
      <Skeleton className="h-4 w-72"/>
      <Skeleton className="h-4 w-24"/>
      <Skeleton className="h-4 w-48"/>
      <Skeleton className="h-4 w-60"/>
    </div>);
export function CodeEditor({ language, value, onChange }) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 500);
        return () => clearTimeout(timer);
    }, []);
    function handleChange(newValue) {
        if (newValue !== undefined) {
            onChange(newValue);
        }
    }
    function handleEditorDidMount(editor) {
        editor.onDidChangeCursorPosition((e) => {
            setCursorPosition({ line: e.position.lineNumber, column: e.position.column });
        });
    }
    return (<div className="flex h-full flex-col">
      <Suspense fallback={editorFallback}>
        <Editor height="100%" language={language} value={value} theme="vs-dark" onChange={handleChange} onMount={handleEditorDidMount} options={{
            fontSize: 14,
            minimap: { enabled: true },
            wordWrap: "on",
            lineNumbers: "on",
            bracketPairColorization: { enabled: true },
            tabSize: 2,
            scrollBeyondLastLine: false,
            renderWhitespace: "selection",
            cursorBlinking: "smooth",
            cursorSmoothCaretAnimation: "on",
            smoothScrolling: true,
            padding: { top: 16 },
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontLigatures: true,
            automaticLayout: true,
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            overviewRulerLanes: 0,
            scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
            },
        }}/>
      </Suspense>
      <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900 px-4 py-1 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <Code className="h-3 w-3"/>
          <span className="capitalize">{language}</span>
        </div>
        <div className={cn("flex items-center gap-3", isLoaded ? "text-zinc-500" : "text-zinc-600")}>
          <span>Ln {cursorPosition.line}, Col {cursorPosition.column}</span>
          <span className="h-3 w-px bg-zinc-700"/>
          <span>{isLoaded ? "Auto-saved" : "Loading..."}</span>
          {isLoaded && (<span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>)}
        </div>
      </div>
    </div>);
}

import { useRef, useState } from "react";
import { Upload, X, File } from "lucide-react";
import { cn } from "@/lib/utils";

function FileInput({ accept, onChange, value, className, placeholder = "Choose file" }) {
    const inputRef = useRef(null);
    const [fileName, setFileName] = useState(value?.name || null);

    const handleChange = (e) => {
        const file = e.target.files?.[0] || null;
        setFileName(file?.name || null);
        onChange?.(e);
    };

    const handleClear = (e) => {
        e.stopPropagation();
        setFileName(null);
        if (inputRef.current) inputRef.current.value = "";
        const syntheticEvent = { target: { files: [] } };
        onChange?.(syntheticEvent);
    };

    return (
        <div
            className={cn(
                "flex items-center gap-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white/50 dark:bg-zinc-800/50 px-3 py-2 text-sm transition-colors hover:border-slate-300 dark:hover:border-zinc-600 cursor-pointer",
                className
            )}
            onClick={() => inputRef.current?.click()}
        >
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                onChange={handleChange}
                className="hidden"
            />
            {fileName ? (
                <>
                    <File className="h-4 w-4 shrink-0 text-violet-500 dark:text-violet-400" />
                    <span className="flex-1 truncate text-slate-700 dark:text-zinc-300">{fileName}</span>
                    <button
                        type="button"
                        onClick={handleClear}
                        className="rounded-md p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </>
            ) : (
                <>
                    <Upload className="h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" />
                    <span className="text-slate-400 dark:text-zinc-500">{placeholder}</span>
                </>
            )}
        </div>
    );
}

export { FileInput };

import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function InlineSelect({ value, onValueChange, options, className = "", disabled = false, ariaLabel = "Select an option" }) {
    const selectedOption = options.find((option) => option.value === value) || options[0];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    aria-label={ariaLabel}
                    className={cn("h-10 w-full justify-between border-slate-200 bg-white px-3 text-left font-normal text-slate-700 shadow-sm hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800", className)}
                    disabled={disabled}
                >
                    <span className="truncate">{selectedOption?.label || ariaLabel}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
                {options.map((option) => (
                    <DropdownMenuItem
                        key={option.value}
                        onSelect={() => onValueChange(option.value)}
                        className="min-h-10 justify-between"
                    >
                        <span className="truncate">{option.label}</span>
                        {option.value === value && <Check className="h-4 w-4 text-violet-600 dark:text-violet-400" />}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

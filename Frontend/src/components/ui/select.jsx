import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SelectContext = React.createContext(null);

function collectOptions(children, options = []) {
    React.Children.forEach(children, (child) => {
        if (!React.isValidElement(child)) return;
        if (child.type === SelectItem) {
            options.push({ value: String(child.props.value), label: child.props.children });
        } else if (child.props.children) {
            collectOptions(child.props.children, options);
        }
    });
    return options;
}

function Select({ children, value, defaultValue, onValueChange, open: openProp, defaultOpen = false, onOpenChange, disabled = false }) {
    const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
    const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
    const selectedValue = value === undefined ? internalValue : value;
    const open = openProp === undefined ? internalOpen : openProp;
    const options = collectOptions(children);
    const selectedOption = options.find((option) => option.value === String(selectedValue));

    const setOpen = (nextOpen) => {
        if (openProp === undefined) setInternalOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };
    const selectValue = (nextValue) => {
        if (value === undefined) setInternalValue(nextValue);
        onValueChange?.(nextValue);
        setOpen(false);
    };

    return (
        <SelectContext.Provider value={{ value: selectedValue, label: selectedOption?.label, open, setOpen, selectValue, disabled }}>
            {children}
        </SelectContext.Provider>
    );
}

const SelectGroup = ({ children }) => <div role="group" className="space-y-1">{children}</div>;

const SelectValue = ({ placeholder, children }) => {
    const context = React.useContext(SelectContext);
    if (!context) throw new Error("SelectValue must be used inside Select.");
    return <span className="line-clamp-1">{context.label ?? children ?? placeholder}</span>;
};

const SelectTrigger = React.forwardRef(({ className, children, disabled, ...props }, ref) => {
    const context = React.useContext(SelectContext);
    if (!context) throw new Error("SelectTrigger must be used inside Select.");
    return (
        <button
            ref={ref}
            type="button"
            className={cn("flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 dark:border-zinc-700 bg-white/50 dark:bg-zinc-800/50 px-3 py-2 text-sm text-slate-900 dark:text-zinc-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1", className)}
            disabled={disabled ?? context.disabled}
            aria-haspopup="dialog"
            aria-expanded={context.open}
            onClick={() => context.setOpen(true)}
            {...props}
        >
            {children}
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
    );
});
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = React.forwardRef(({ className, children }, ref) => {
    const context = React.useContext(SelectContext);
    if (!context) throw new Error("SelectContent must be used inside Select.");
    return (
        <Dialog open={context.open} onOpenChange={context.setOpen}>
            <DialogContent ref={ref} className={cn("max-h-[85vh] max-w-md overflow-hidden", className)}>
                <DialogHeader>
                    <DialogTitle>{context.label || "Choose an option"}</DialogTitle>
                    <DialogDescription>Select one of the available options.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[65vh] space-y-1 overflow-y-auto">{children}</div>
            </DialogContent>
        </Dialog>
    );
});
SelectContent.displayName = "SelectContent";

const SelectItem = React.forwardRef(({ className, children, value, disabled = false, onSelect, ...props }, ref) => {
    const context = React.useContext(SelectContext);
    if (!context) throw new Error("SelectItem must be used inside Select.");
    const selected = context.value !== undefined && String(context.value) === String(value);
    return (
        <button
            ref={ref}
            type="button"
            role="option"
            aria-selected={selected}
            disabled={disabled || context.disabled}
            className={cn("relative flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-700 dark:text-zinc-300 outline-none transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 focus-visible:bg-slate-100 dark:focus-visible:bg-zinc-800 disabled:pointer-events-none disabled:opacity-50", className)}
            onClick={(event) => {
                onSelect?.(event);
                if (!event.defaultPrevented) context.selectValue(value);
            }}
            {...props}
        >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {selected && <Check className="h-4 w-4" />}
            </span>
            {children}
        </button>
    );
});
SelectItem.displayName = "SelectItem";

const SelectLabel = ({ className, children, ...props }) => (
    <div className={cn("px-3 py-1.5 text-sm font-semibold text-slate-500 dark:text-zinc-400", className)} {...props}>
        {children}
    </div>
);

const SelectSeparator = ({ className, ...props }) => (
    <div role="separator" className={cn("my-1 h-px bg-slate-200 dark:bg-zinc-800", className)} {...props} />
);

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem, SelectLabel, SelectSeparator };

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => (<DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn("z-50 min-w-[8rem] overflow-hidden rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1 text-slate-900 dark:text-zinc-100 shadow-xl shadow-slate-100 dark:shadow-black/20 backdrop-blur-xl animate-in fade-in-0 zoom-in-95 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", className)} {...props}/>
  </DropdownMenuPrimitive.Portal>));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;
const DropdownMenuItem = React.forwardRef(({ className, inset, ...props }, ref) => (<DropdownMenuPrimitive.Item ref={ref} className={cn("relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 dark:text-zinc-300 outline-none transition-colors focus:bg-slate-100 dark:focus:bg-zinc-800 focus:text-slate-900 dark:focus:text-zinc-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0", inset && "pl-8", className)} {...props}/>));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;
const DropdownMenuLabel = React.forwardRef(({ className, inset, ...props }, ref) => (<DropdownMenuPrimitive.Label ref={ref} className={cn("px-2 py-1.5 text-xs font-semibold text-slate-500 dark:text-zinc-500", inset && "pl-8", className)} {...props}/>));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;
const DropdownMenuSeparator = React.forwardRef(({ className, ...props }, ref) => (<DropdownMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-slate-200 dark:bg-zinc-800", className)} {...props}/>));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;
export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, };

import { motion } from "framer-motion";
import { useNavigate, Link } from "react-router-dom";
import { Bell, ChevronRight, Home, User, Settings, LogOut, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const ROLE_COLORS = {
    staff: "from-violet-500 to-indigo-500",
    placement: "from-blue-500 to-cyan-500",
    student: "from-emerald-500 to-teal-500",
    admin: "from-violet-500 to-indigo-500",
};

const NOTIFICATIONS = [
    { id: "1", title: "Test Scheduled", message: "Frontend Assessment tomorrow at 10 AM", time: "1h ago" },
    { id: "2", title: "Assessment Completed", message: "You scored 250/300 in DSA", time: "2d ago" },
];

export function Header({ breadcrumbs = [] }) {
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const { theme, toggleTheme } = useUIStore();

    const userInitials = user?.name
        ?.split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "??";

    const settingsHref = user?.role ? `/${user.role}/settings` : "/settings";
    const defaultBreadcrumbs = [{ label: "Home", href: useAuthStore.getState().homeFor(user?.role) || "/dashboard" }];
    const allBreadcrumbs = [...defaultBreadcrumbs, ...breadcrumbs];

    return (
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-slate-200 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-950/60 px-6 backdrop-blur-xl">
            <nav className="flex flex-1 items-center gap-1 text-sm">
                {allBreadcrumbs.map((crumb, index) => (
                    <span key={index} className="flex items-center gap-1">
                        {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-600" />}
                        {index === 0 ? <Home className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" /> : null}
                        <span className={cn("transition-colors", index === allBreadcrumbs.length - 1 ? "text-slate-800 dark:text-zinc-200" : "text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300")}>
                            {crumb.label}
                        </span>
                    </span>
                ))}
            </nav>

            <div className="flex items-center gap-3">
                {/* Theme Switch Toggle Button */}
                <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-zinc-400 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-zinc-200"
                    title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
                >
                    {theme === "dark" ? <Sun className="h-4.5 w-4.5 text-amber-400" /> : <Moon className="h-4.5 w-4.5 text-indigo-400" />}
                </button>

                {/* Notifications Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-zinc-400 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-zinc-200">
                            <Bell className="h-4.5 w-4.5" />
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                                {NOTIFICATIONS.length}
                            </motion.span>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {NOTIFICATIONS.map((n) => (
                            <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2">
                                <div className="flex w-full items-center justify-between">
                                    <span className="text-sm font-medium text-slate-800 dark:text-zinc-200">{n.title}</span>
                                    <span className="text-[10px] text-slate-400 dark:text-zinc-500">{n.time}</span>
                                </div>
                                <span className="text-xs text-slate-500 dark:text-zinc-400">{n.message}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* User Menu Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800/60">
                            <Avatar className="h-8 w-8">
                                <AvatarFallback className={cn("bg-gradient-to-br text-[10px] font-bold text-white", ROLE_COLORS[user?.role || "admin"])}>
                                    {userInitials}
                                </AvatarFallback>
                            </Avatar>
                            <div className="hidden text-left md:block">
                                <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">{user?.name || "Guest"}</p>
                                <p className="text-[11px] capitalize text-slate-500 dark:text-zinc-500">{user?.role || ""}</p>
                            </div>
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>
                            <div className="flex flex-col space-y-1">
                                <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">{user?.name}</p>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">{user?.username}</p>
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => navigate(settingsHref)}>
                            <Settings className="mr-2 h-4 w-4" />
                            Account Settings
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={logout} className="text-red-500 focus:text-red-500 dark:text-red-400 dark:focus:text-red-400">
                            <LogOut className="mr-2 h-4 w-4" />
                            Sign out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </header>
    );
}

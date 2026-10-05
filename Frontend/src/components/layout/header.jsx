import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellRing, ChevronRight, Home, Settings, LogOut, Sun, Moon, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { getAvatarImage } from "@/lib/avatar-options";
import { Button } from "@/components/ui/button";

const ROLE_COLORS = {
    staff: "from-violet-500 to-indigo-500",
    placement: "from-blue-500 to-cyan-500",
    student: "from-emerald-500 to-teal-500",
    admin: "from-violet-500 to-indigo-500",
};

export function Header({ breadcrumbs = [] }) {
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const { theme, toggleTheme } = useUIStore();
    const [notifications, setNotifications] = useState([]);
    const [notificationError, setNotificationError] = useState("");
    const [notificationLoading, setNotificationLoading] = useState(true);
    const [readIds, setReadIds] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(`notification-read:${user?.id || user?.username || "guest"}`) || "[]");
        } catch {
            return [];
        }
    });
    const readStorageKey = `notification-read:${user?.id || user?.username || "guest"}`;

    useEffect(() => {
        try {
            setReadIds(JSON.parse(localStorage.getItem(readStorageKey) || "[]"));
        } catch {
            setReadIds([]);
        }
    }, [readStorageKey]);

    useEffect(() => {
        let cancelled = false;
        const loadNotifications = async () => {
            setNotificationLoading(true);
            setNotificationError("");
            try {
                const [tests, interviews] = await Promise.all([api.tests.list(), api.interviews.list()]);
                const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
                const testNotices = (Array.isArray(tests) ? tests : [])
                    .filter((test) => {
                        const recentlyCreated = new Date(test.createdAt || 0).getTime() >= cutoff;
                        const isOpenForStudent = user?.role !== "student" || !["completed", "cheated", "disqualified"].includes(test.attempt?.status);
                        return user?.role === "student" ? isOpenForStudent : recentlyCreated;
                    })
                    .map((test) => ({
                        id: `test:${test.id}`,
                        title: user?.role === "student" ? "Assessment available" : "Assessment created",
                        message: test.title || test.name || "A new assessment is available.",
                        time: test.createdAt,
                        href: user?.role === "student" ? "/student/tests" : `/${user?.role}/tests`,
                    }));
                const interviewNotices = (Array.isArray(interviews) ? interviews : [])
                    .filter((interview) => {
                        const scheduledAt = new Date(interview.scheduledAt || 0).getTime();
                        const recentlyCreated = new Date(interview.createdAt || 0).getTime() >= cutoff;
                        return (scheduledAt >= Date.now() && scheduledAt <= Date.now() + 30 * 24 * 60 * 60 * 1000) || recentlyCreated;
                    })
                    .map((interview) => ({
                        id: `interview:${interview.id}`,
                        title: "Interview scheduled",
                        message: `${interview.type || "Interview"}${interview.studentName ? ` · ${interview.studentName}` : ""} · ${new Date(interview.scheduledAt).toLocaleString()}`,
                        time: interview.createdAt || interview.scheduledAt,
                        href: user?.role === "student" ? "/student/interviews" : user?.role === "placement" ? "/placement/interviews" : "/staff",
                    }));
                if (!cancelled) {
                    setNotifications([...testNotices, ...interviewNotices]
                        .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))
                        .slice(0, 10));
                }
            } catch (err) {
                if (!cancelled) setNotificationError(err.message || "Could not load notifications.");
            } finally {
                if (!cancelled) setNotificationLoading(false);
            }
        };

        if (user?.role) {
            loadNotifications();
            const refresh = window.setInterval(loadNotifications, 60_000);
            return () => {
                cancelled = true;
                window.clearInterval(refresh);
            };
        }
        return () => { cancelled = true; };
    }, [user?.id, user?.role, user?.username]);

    const unreadCount = useMemo(() => notifications.filter((notification) => !readIds.includes(notification.id)).length, [notifications, readIds]);
    const markRead = (notificationId) => {
        const next = [...new Set([...readIds, notificationId])];
        setReadIds(next);
        localStorage.setItem(readStorageKey, JSON.stringify(next));
    };
    const markAllRead = () => {
        const next = [...new Set([...readIds, ...notifications.map((notification) => notification.id)])];
        setReadIds(next);
        localStorage.setItem(readStorageKey, JSON.stringify(next));
    };
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
                        <button aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
                            {unreadCount ? <BellRing className="h-4.5 w-4.5" /> : <Bell className="h-4.5 w-4.5" />}
                            {unreadCount > 0 && (
                                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                                    {unreadCount}
                                </motion.span>
                            )}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                        <div className="flex items-center justify-between px-2">
                            <DropdownMenuLabel className="px-0">Notifications</DropdownMenuLabel>
                            {unreadCount > 0 && (
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={markAllRead}>
                                    <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                                </Button>
                            )}
                        </div>
                        <DropdownMenuSeparator />
                        {notificationLoading ? (
                            <p className="px-3 py-5 text-center text-xs text-slate-500 dark:text-zinc-400">Loading notifications...</p>
                        ) : notificationError ? (
                            <p role="alert" className="px-3 py-4 text-xs text-red-500">{notificationError}</p>
                        ) : notifications.length === 0 ? (
                            <p className="px-3 py-5 text-center text-xs text-slate-500 dark:text-zinc-400">You’re all caught up.</p>
                        ) : notifications.map((notification) => (
                            <DropdownMenuItem
                                key={notification.id}
                                onSelect={() => {
                                    markRead(notification.id);
                                    navigate(notification.href);
                                }}
                                className="flex flex-col items-start gap-0.5 py-2"
                            >
                                <div className="flex w-full items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800 dark:text-zinc-200">
                                        {!readIds.includes(notification.id) && <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" />}
                                        <span className="truncate">{notification.title}</span>
                                    </span>
                                    <span className="shrink-0 text-[10px] text-slate-400 dark:text-zinc-500">{notification.time ? new Date(notification.time).toLocaleDateString() : ""}</span>
                                </div>
                                <span className="line-clamp-2 text-xs text-slate-500 dark:text-zinc-400">{notification.message}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* User Menu Dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800/60">
                            <Avatar className="h-8 w-8">
                                {getAvatarImage(user?.avatar) && <AvatarImage src={getAvatarImage(user?.avatar)} alt="" />}
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

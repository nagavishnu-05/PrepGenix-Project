import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    Bell,
    BellRing,
    BarChart3,
    CheckCheck,
    ChevronRight,
    ClipboardList,
    FileCode,
    FileText,
    GraduationCap,
    LayoutDashboard,
    LogOut,
    Menu,
    Moon,
    RadioTower,
    Settings,
    Shield,
    Sun,
    Trophy,
    Users,
    Video,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { getAvatarImage } from "@/lib/avatar-options";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/portal/primitives";

const NAV = {
    student: [
        { label: "Dashboard", href: "/student", icon: LayoutDashboard, end: true },
        { label: "My Tests", href: "/student/tests", icon: ClipboardList },
        { label: "Interviews", href: "/student/interviews", icon: Video },
        { label: "My Report", href: "/student/report", icon: BarChart3 },
        { label: "Rankings", href: "/student/rankings", icon: Trophy },
    ],
    staff: [
        { label: "Dashboard", href: "/staff", icon: LayoutDashboard, end: true },
        { label: "Questions", href: "/staff/questions", icon: FileCode },
        { label: "Tests", href: "/staff/tests", icon: ClipboardList },
        { label: "Students", href: "/staff/students", icon: Users },
        { label: "Reports", href: "/staff/reports", icon: BarChart3 },
        { label: "Live Monitoring", href: "/staff/monitor", icon: RadioTower },
    ],
    placement: [
        { label: "Dashboard", href: "/placement", icon: LayoutDashboard, end: true },
        { label: "Students", href: "/placement/students", icon: GraduationCap },
        { label: "Resumes", href: "/placement/resumes", icon: FileText },
        { label: "Interviews", href: "/placement/interviews", icon: Video },
        { label: "Reports", href: "/placement/reports", icon: BarChart3 },
    ],
};

const ROLE_COLORS = {
    staff: "from-violet-500 to-indigo-500",
    placement: "from-blue-500 to-cyan-500",
    student: "from-emerald-500 to-teal-500",
    admin: "from-violet-500 to-indigo-500",
};

export function Header({ breadcrumbs = [] }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuthStore();
    const { theme, toggleTheme } = useUIStore();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [navOrder, setNavOrder] = useState([]);
    const [draggingHref, setDraggingHref] = useState(null);
    const longPressTimer = useRef(null);
    const longPressActive = useRef(false);
    const draggingHrefRef = useRef(null);
    const suppressNavClick = useRef(false);
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
    const defaultNavItems = NAV[user?.role] || [];
    const navItems = navOrder.length
        ? [...defaultNavItems].sort((a, b) => navOrder.indexOf(a.href) - navOrder.indexOf(b.href))
        : defaultNavItems;

    useEffect(() => {
        try {
            const savedOrder = JSON.parse(localStorage.getItem(`portal-nav-order:${user?.role}`) || "[]");
            setNavOrder(Array.isArray(savedOrder) ? savedOrder : []);
        } catch {
            setNavOrder([]);
        }
    }, [user?.role]);

    useEffect(() => {
        setMobileNavOpen(false);
    }, [location.pathname]);

    useEffect(() => () => window.clearTimeout(longPressTimer.current), []);

    const startNavPress = (href) => {
        window.clearTimeout(longPressTimer.current);
        longPressActive.current = false;
        suppressNavClick.current = false;
        longPressTimer.current = window.setTimeout(() => {
            longPressActive.current = true;
            draggingHrefRef.current = href;
            setDraggingHref(href);
        }, 350);
    };

    const moveNavItem = useCallback((targetHref) => {
        const activeDragHref = draggingHrefRef.current;
        if (!activeDragHref || activeDragHref === targetHref) return;
        const orderedHrefs = navItems.map((item) => item.href);
        const from = orderedHrefs.indexOf(activeDragHref);
        const to = orderedHrefs.indexOf(targetHref);
        if (from < 0 || to < 0) return;
        orderedHrefs.splice(to, 0, ...orderedHrefs.splice(from, 1));
        setNavOrder(orderedHrefs);
        localStorage.setItem(`portal-nav-order:${user?.role}`, JSON.stringify(orderedHrefs));
    }, [navItems, user?.role]);

    useEffect(() => {
        const handlePointerMove = (event) => {
            if (!draggingHrefRef.current) return;
            const target = event.target instanceof Element
                ? event.target.closest("[data-nav-href]")
                : null;
            if (target?.dataset.navHref) moveNavItem(target.dataset.navHref);
        };
        const stopDragging = () => {
            window.clearTimeout(longPressTimer.current);
            if (longPressActive.current) {
                suppressNavClick.current = true;
                draggingHrefRef.current = null;
                setDraggingHref(null);
                window.setTimeout(() => {
                    longPressActive.current = false;
                }, 0);
                window.setTimeout(() => {
                    suppressNavClick.current = false;
                }, 500);
            }
        };
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", stopDragging);
        window.addEventListener("pointercancel", stopDragging);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", stopDragging);
            window.removeEventListener("pointercancel", stopDragging);
        };
    }, [moveNavItem]);

    return (
        <motion.header
            initial={false}
            className="sticky top-4 z-50 mx-auto w-[92%] rounded-2xl border border-slate-200/60 bg-white/30 shadow-lg backdrop-blur-xl transition-colors duration-300 dark:border-zinc-800/30 dark:bg-zinc-950/30 sm:w-[95%] sm:max-w-6xl"
        >
            <div className="pointer-events-none relative grid h-20 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:gap-4 sm:px-6">
                <Link to={useAuthStore.getState().homeFor(user?.role) || "/"} className="pointer-events-auto flex shrink-0 items-center gap-2.5 rounded-xl px-1 py-1">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-md">
                        <Shield className="h-5 w-5 text-white" />
                    </span>
                    <span className="hidden sm:block">
                        <span className="block text-sm font-bold leading-tight text-slate-900 dark:text-white">PrepGenix</span>
                        <span className="block text-[10px] capitalize text-slate-500 dark:text-zinc-400">{user?.role || "Portal"}</span>
                    </span>
                </Link>

                <nav
                    aria-label="Main navigation"
                    onClickCapture={(event) => {
                        if (suppressNavClick.current) {
                            event.preventDefault();
                            event.stopPropagation();
                            suppressNavClick.current = false;
                        }
                    }}
                    onPointerLeave={() => {
                        if (!longPressActive.current) window.clearTimeout(longPressTimer.current);
                    }}
                    className="pointer-events-auto hidden min-w-0 items-center justify-center gap-1 justify-self-center xl:flex"
                >
                    {navItems.map((item) => {
                        const active = item.end ? location.pathname === item.href : location.pathname.startsWith(item.href);
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                to={item.href}
                                data-nav-href={item.href}
                                onPointerDown={() => startNavPress(item.href)}
                                aria-current={active ? "page" : undefined}
                                title={`Hold and drag to rearrange ${item.label}`}
                                className="flex shrink-0 touch-none"
                            >
                                <motion.span
                                    layout
                                    transition={{ type: "spring", stiffness: 420, damping: 25, mass: 0.6 }}
                                    className={cn(
                                        "group relative flex items-center justify-center gap-2 rounded-full px-2.5 py-2.5 text-sm font-medium leading-none transition-colors duration-200 2xl:px-3",
                                        active ? "text-violet-800 dark:text-violet-100" : "text-slate-600 hover:text-slate-950 dark:text-zinc-400 dark:hover:text-zinc-100",
                                        draggingHref === item.href && "z-20 scale-110 -translate-y-1 cursor-grabbing",
                                        draggingHref && draggingHref !== item.href && "cursor-grab"
                                    )}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="portal-active-tab"
                                            transition={{ type: "spring", stiffness: 420, damping: 23, mass: 0.5 }}
                                            className="absolute inset-0 rounded-full bg-violet-100/75 shadow-[0_2px_8px_-4px_rgba(109,40,217,0.28),inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-violet-200/70 dark:bg-white/15 dark:shadow-[0_3px_12px_-5px_rgba(139,92,246,0.4),inset_0_1px_1px_rgba(255,255,255,0.2)] dark:ring-white/10"
                                        />
                                    )}
                                    <Icon className="relative z-10 h-[18px] w-[18px] shrink-0 transition-transform duration-300 group-hover:-translate-y-0.5" />
                                    <span className="relative z-10 whitespace-nowrap">{item.label}</span>
                                </motion.span>
                            </Link>
                        );
                    })}
                </nav>

                <button
                    type="button"
                    aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
                    aria-expanded={mobileNavOpen}
                    onClick={() => setMobileNavOpen((open) => !open)}
                    className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-white/10 xl:hidden"
                >
                    <motion.span
                        key={mobileNavOpen ? "close" : "menu"}
                        initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 28 }}
                    >
                        {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </motion.span>
                </button>

                <div className="pointer-events-auto flex shrink-0 items-center gap-1 sm:gap-2">
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
                            <LoadingState label="Loading notifications" className="px-3 py-5 text-xs" />
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
            </div>

            <AnimatePresence initial={false}>
                {mobileNavOpen && (
                    <motion.nav
                        aria-label="Mobile navigation"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: "spring", stiffness: 360, damping: 32 }}
                        className="pointer-events-auto absolute left-1/2 top-full mt-2 grid w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 grid-cols-2 gap-1 rounded-2xl border border-white/70 bg-white/80 p-2.5 shadow-lg backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/80 xl:hidden"
                    >
                        {navItems.map((item) => {
                            const active = item.end ? location.pathname === item.href : location.pathname.startsWith(item.href);
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.href}
                                    to={item.href}
                                    aria-current={active ? "page" : undefined}
                                    className={cn(
                                        "flex min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
                                        active
                                            ? "bg-violet-600/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                                            : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100"
                                    )}
                                >
                                    <Icon className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                </Link>
                            );
                        })}
                    </motion.nav>
                )}
            </AnimatePresence>

            {breadcrumbs.length > 0 && (
                <div className="flex items-center gap-1 border-t border-slate-200/70 px-5 py-2 text-xs text-slate-500 dark:border-zinc-800/60 dark:text-zinc-400">
                    {breadcrumbs.map((crumb, index) => (
                        <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                            {index > 0 && <ChevronRight className="h-3 w-3 text-slate-400 dark:text-zinc-600" />}
                            <span>{crumb.label}</span>
                        </span>
                    ))}
                </div>
            )}
        </motion.header>
    );
}

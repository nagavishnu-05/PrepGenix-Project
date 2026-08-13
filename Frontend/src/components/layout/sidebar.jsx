import { Link, useLocation } from "react-router-dom";
import {
    LayoutDashboard,
    FileCode,
    ClipboardList,
    Users,
    BarChart3,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Settings,
    Video,
    Shield,
    GraduationCap,
    FileText,
    RadioTower,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { Separator } from "@/components/ui/separator";

const NAV = {
    student: [
        { label: "Dashboard", href: "/student", icon: LayoutDashboard, end: true },
        { label: "My Tests", href: "/student/tests", icon: ClipboardList },
        { label: "Interviews", href: "/student/interviews", icon: Video },
        { label: "My Report", href: "/student/report", icon: BarChart3 },
        { label: "Settings", href: "/student/settings", icon: Settings },
    ],
    staff: [
        { label: "Dashboard", href: "/staff", icon: LayoutDashboard, end: true },
        { label: "Questions", href: "/staff/questions", icon: FileCode },
        { label: "Tests", href: "/staff/tests", icon: ClipboardList },
        { label: "Students", href: "/staff/students", icon: Users },
        { label: "Reports", href: "/staff/reports", icon: BarChart3 },
        { label: "Live Monitoring", href: "/staff/monitor", icon: RadioTower },
        { label: "Settings", href: "/staff/settings", icon: Settings },
    ],
    placement: [
        { label: "Dashboard", href: "/placement", icon: LayoutDashboard, end: true },
        { label: "Students", href: "/placement/students", icon: GraduationCap },
        { label: "Resumes", href: "/placement/resumes", icon: FileText },
        { label: "Interviews", href: "/placement/interviews", icon: Video },
        { label: "Reports", href: "/placement/reports", icon: BarChart3 },
        { label: "Settings", href: "/placement/settings", icon: Settings },
    ],
};

const ROLE_LABEL = { student: "Student", staff: "Staff Coordinator", placement: "Placement Coordinator" };

export function Sidebar() {
    const location = useLocation();
    const user = useAuthStore((s) => s.user);
    const logout = useAuthStore((s) => s.logout);
    const { sidebarOpen, toggleSidebar } = useUIStore();
    const items = NAV[user?.role] || NAV.student;
    const roleLabel = ROLE_LABEL[user?.role] || "User";

    return (
        <aside
            className={cn(
                "fixed left-0 top-0 z-40 flex h-screen flex-col border-r sidebar-theme transition-all duration-300",
                sidebarOpen ? "w-64" : "w-[72px]"
            )}
        >
            <div className="flex h-16 items-center gap-3 px-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-md">
                    <Shield className="h-6 w-6 text-white" />
                </div>
                {sidebarOpen && (
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">Placement Portal</p>
                        <p className="truncate text-xs text-slate-500 dark:text-zinc-500">{roleLabel}</p>
                    </div>
                )}
            </div>

            <Separator className="bg-slate-200 dark:bg-zinc-800" />

            <nav className="flex-1 overflow-y-auto p-3">
                {items.map((item) => {
                    const active = item.end ? location.pathname === item.href : location.pathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                        <Link key={item.href} to={item.href} className="mb-1 block">
                            <div
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                    sidebarOpen ? "" : "justify-center px-0",
                                    active
                                        ? "bg-violet-600/15 text-violet-600 dark:text-violet-400 font-semibold"
                                        : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-zinc-200"
                                )}
                            >
                                <Icon className="h-4.5 w-4.5 shrink-0" />
                                {sidebarOpen && <span className="truncate">{item.label}</span>}
                            </div>
                        </Link>
                    );
                })}
            </nav>

            <Separator className="bg-slate-200 dark:bg-zinc-800" />
            <div className="p-3">
                {sidebarOpen && (
                    <div className="mb-3 flex items-center gap-3 rounded-lg bg-slate-100 dark:bg-zinc-900 p-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 dark:bg-zinc-800 text-sm font-semibold text-violet-600 dark:text-violet-400">
                            {(user?.name || "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900 dark:text-zinc-200">{user?.name}</p>
                            <p className="truncate text-xs text-slate-500 dark:text-zinc-500">{user?.username}</p>
                        </div>
                    </div>
                )}
                <button
                    onClick={logout}
                    className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400",
                        !sidebarOpen && "justify-center px-0"
                    )}
                >
                    <LogOut className="h-4.5 w-4.5 shrink-0" />
                    {sidebarOpen && <span>Logout</span>}
                </button>
            </div>

            <button
                onClick={toggleSidebar}
                className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white shadow-sm"
            >
                {sidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
        </aside>
    );
}

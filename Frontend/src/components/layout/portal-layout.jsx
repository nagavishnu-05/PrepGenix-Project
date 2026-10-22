import { Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { Header } from "@/components/layout/header";

// The interview room renders its own full-screen shell (question, answer box,
// webcam preview). The portal nav (Dashboard, My Resume, ...) must not sit on
// top of it, so the header is dropped for the interview route.
const HIDE_HEADER_PREFIXES = ["/student/interview/"];

export function PortalLayout({ breadcrumbs = [] }) {
    const user = useAuthStore((s) => s.user);
    const location = useLocation();
    if (!user) return null;

    const hideHeader = HIDE_HEADER_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {!hideHeader && <Header breadcrumbs={breadcrumbs} />}
            <main className={hideHeader ? "flex-1" : "flex-1"}>
                <div className={hideHeader ? "" : "px-4 pb-4 pt-8 sm:px-6 sm:pb-6 sm:pt-10"}>
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

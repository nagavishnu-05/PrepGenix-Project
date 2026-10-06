import { Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { Header } from "@/components/layout/header";

export function PortalLayout({ breadcrumbs = [] }) {
    const user = useAuthStore((s) => s.user);
    if (!user) return null;

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <Header breadcrumbs={breadcrumbs} />
            <main className="flex-1">
                <div className="px-4 pb-4 pt-8 sm:px-6 sm:pb-6 sm:pt-10">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}

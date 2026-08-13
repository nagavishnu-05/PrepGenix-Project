import { Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export function PortalLayout({ breadcrumbs = [] }) {
    const user = useAuthStore((s) => s.user);
    const { sidebarOpen } = useUIStore();
    if (!user) return null;

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <motion.div
                initial={false}
                animate={{ marginLeft: sidebarOpen ? 260 : 72 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className="flex flex-1 flex-col overflow-hidden"
            >
                <Header breadcrumbs={breadcrumbs} />
                <main className="flex-1 overflow-y-auto">
                    <div className="p-6">
                        <Outlet />
                    </div>
                </main>
            </motion.div>
        </div>
    );
}

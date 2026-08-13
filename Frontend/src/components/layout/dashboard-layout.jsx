import { useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
export function DashboardLayout({ breadcrumbs = [] }) {
    const navigate = useNavigate();
    const { isAuthenticated, isLoading } = useAuthStore();
    const { sidebarOpen } = useUIStore();
    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            navigate("/login");
        }
    }, [isAuthenticated, isLoading, navigate]);
    if (isLoading) {
        return (<div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500"/>
          <p className="text-sm text-zinc-500">Loading...</p>
        </div>
      </div>);
    }
    if (!isAuthenticated) {
        return null;
    }
    return (<div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <motion.div initial={false} animate={{ marginLeft: sidebarOpen ? 260 : 72 }} transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }} className="flex flex-1 flex-col overflow-hidden">
        <Header breadcrumbs={breadcrumbs}/>
        <main className="flex-1 overflow-y-auto">
          <div className="p-6"><Outlet /></div>
        </main>
      </motion.div>
    </div>);
}

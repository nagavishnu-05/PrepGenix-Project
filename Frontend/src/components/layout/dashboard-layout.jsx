import { useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/auth-store";
import { Header } from "@/components/layout/header";
import { LoadingState } from "@/components/portal/primitives";
export function DashboardLayout({ breadcrumbs = [] }) {
    const navigate = useNavigate();
    const { isAuthenticated, isLoading } = useAuthStore();
    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            navigate("/login");
        }
    }, [isAuthenticated, isLoading, navigate]);
    if (isLoading) {
        return (<div className="flex h-screen items-center justify-center bg-background">
        <LoadingState label="Loading your account" />
      </div>);
    }
    if (!isAuthenticated) {
        return null;
    }
    return (<div className="flex min-h-screen flex-col bg-background">
        <Header breadcrumbs={breadcrumbs}/>
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 pb-4 pt-8 sm:px-6 sm:pb-6 sm:pt-10"><Outlet /></div>
        </main>
    </div>);
}

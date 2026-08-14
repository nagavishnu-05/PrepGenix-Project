import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Home from "@/pages/Home";
import { PortalLayout } from "@/components/layout/portal-layout";
import { useAuthStore } from "@/store/auth-store";

import StudentDashboard from "@/pages/student/StudentDashboard";
import StudentTests from "@/pages/student/StudentTests";
import TakeTest from "@/pages/student/TakeTest";
import StudentInterviews from "@/pages/student/StudentInterviews";
import StudentReport from "@/pages/student/StudentReport";
import SettingsPage from "@/pages/Settings";

import StaffDashboard from "@/pages/staff/StaffDashboard";
import StaffQuestions from "@/pages/staff/StaffQuestions";
import StaffTests from "@/pages/staff/StaffTests";
import StaffStudents from "@/pages/staff/StaffStudents";
import StaffReports from "@/pages/staff/StaffReports";
import LiveMonitoring from "@/pages/staff/LiveMonitoring";

import PlacementDashboard from "@/pages/placement/PlacementDashboard";
import PlacementStudents from "@/pages/placement/PlacementStudents";
import PlacementResumes from "@/pages/placement/PlacementResumes";
import PlacementInterviews from "@/pages/placement/PlacementInterviews";
import PlacementReports from "@/pages/placement/PlacementReports";

function RequireRole({ role, children }) {
    const user = useAuthStore((s) => s.user);
    const isBooting = useAuthStore((s) => s.isBooting);
    if (isBooting) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-500" />
            </div>
        );
    }
    if (!user) return <Navigate to="/?login=1" replace />;
    if (role && user.role !== role) return <Navigate to={useAuthStore.getState().homeFor(user.role)} replace />;
    return children;
}

export function App() {
    const loadUser = useAuthStore((s) => s.loadUser);
    const logout = useAuthStore((s) => s.logout);

    useEffect(() => {
        loadUser();
        const onUnauthorized = () => logout();
        window.addEventListener("auth-unauthorized", onUnauthorized);
        return () => window.removeEventListener("auth-unauthorized", onUnauthorized);
    }, [loadUser, logout]);

    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Navigate to="/" replace />} />

            <Route path="/student" element={<RequireRole role="student"><PortalLayout /></RequireRole>}>
                <Route index element={<StudentDashboard />} />
                <Route path="tests" element={<StudentTests />} />
                <Route path="take/:attemptId" element={<TakeTest />} />
                <Route path="interviews" element={<StudentInterviews />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="profile" element={<Navigate to="/student/settings" replace />} />
                <Route path="report" element={<StudentReport />} />
            </Route>

            <Route path="/staff" element={<RequireRole role="staff"><PortalLayout /></RequireRole>}>
                <Route index element={<StaffDashboard />} />
                <Route path="questions" element={<StaffQuestions />} />
                <Route path="tests" element={<StaffTests />} />
                <Route path="students" element={<StaffStudents />} />
                <Route path="reports" element={<StaffReports />} />
                <Route path="monitor" element={<LiveMonitoring />} />
                <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="/placement" element={<RequireRole role="placement"><PortalLayout /></RequireRole>}>
                <Route index element={<PlacementDashboard />} />
                <Route path="students" element={<PlacementStudents />} />
                <Route path="resumes" element={<PlacementResumes />} />
                <Route path="interviews" element={<PlacementInterviews />} />
                <Route path="reports" element={<PlacementReports />} />
                <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

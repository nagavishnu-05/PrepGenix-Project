import { useAuthStore } from "@/store/auth-store";
import { CandidateDashboard } from "@/components/dashboard/candidate-dashboard";
import { InterviewerDashboard } from "@/components/dashboard/interviewer-dashboard";
export default function DashboardPage() {
    const { user } = useAuthStore();
    if (user?.role === "admin") {
        return <AdminDashboard />;
    }
    if (user?.role === "interviewer") {
        return <InterviewerDashboard />;
    }
    return <CandidateDashboard />;
}
function AdminDashboard() {
    return (<div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Admin Dashboard</h1>
        <p className="text-zinc-400">Manage assessments, candidates, and platform settings.</p>
      </div>
    </div>);
}

import { motion } from "framer-motion";
import { Users, Calendar, FileCheck, Plus, BarChart3, Settings, } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/auth-store";
const quickActions = [
    { label: "Create Assessment", icon: Plus, color: "from-violet-500 to-indigo-500" },
    { label: "View Reports", icon: BarChart3, color: "from-emerald-500 to-teal-500" },
    { label: "Manage Candidates", icon: Users, color: "from-amber-500 to-orange-500" },
    { label: "Settings", icon: Settings, color: "from-zinc-500 to-zinc-600" },
];
export function InterviewerDashboard() {
    const { user } = useAuthStore();
    return (<div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-zinc-100">
          Welcome, {user?.name?.split(" ")[0] || "Michael"} 👋
        </h1>
        <p className="mt-1 text-zinc-400">
          Here&apos;s an overview of your interview activities.
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500">
                <Users className="h-6 w-6 text-white"/>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">3</p>
                <p className="text-sm text-zinc-400">Active Interviews</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500">
                <Calendar className="h-6 w-6 text-white"/>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">5</p>
                <p className="text-sm text-zinc-400">Upcoming Interviews</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
                <FileCheck className="h-6 w-6 text-white"/>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">12</p>
                <p className="text-sm text-zinc-400">Completed Reviews</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {quickActions.map((action) => (<button key={action.label} className="group flex flex-col items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-800/30 p-6 transition-all hover:bg-zinc-800/60 hover:border-zinc-700">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${action.color} transition-transform group-hover:scale-110`}>
                    <action.icon className="h-6 w-6 text-white"/>
                  </div>
                  <span className="text-sm font-medium text-zinc-300">{action.label}</span>
                </button>))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Recent Assessments */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Assessments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
            { name: "Frontend Assessment", candidates: 12, status: "active" },
            { name: "Backend Systems", candidates: 8, status: "completed" },
            { name: "DSA Challenge", candidates: 15, status: "active" },
        ].map((assessment) => (<div key={assessment.name} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
                <div>
                  <p className="font-medium text-zinc-100">{assessment.name}</p>
                  <p className="text-sm text-zinc-400">{assessment.candidates} candidates</p>
                </div>
                <Badge variant={assessment.status === "active" ? "success" : "secondary"}>
                  {assessment.status}
                </Badge>
              </div>))}
          </CardContent>
        </Card>
      </motion.div>
    </div>);
}

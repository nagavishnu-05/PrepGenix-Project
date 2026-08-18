import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, ArrowRight, GraduationCap, UserCog, Briefcase, Hash, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

const ROLES = [
    { id: "student", label: "Student", hint: "Register No + Roll No", icon: GraduationCap, u: "Register Number", p: "Roll Number" },
    { id: "staff", label: "Staff", hint: "Test & question management", icon: UserCog, u: "Email", p: "Password" },
    { id: "placement", label: "Placement", hint: "Resumes & interviews", icon: Briefcase, u: "Email", p: "Password" },
];

const DEMO = {
    student: ["2023001", "23CS001"],
    staff: ["staff@gmail.com", "staff123"],
    placement: ["placement@gmail.com", "placement123"],
};

export default function LoginPage() {
    const navigate = useNavigate();
    const login = useAuthStore((s) => s.login);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const user = useAuthStore((s) => s.user);
    const [role, setRole] = useState("student");
    const [username, setUsername] = useState("2023001");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isAuthenticated && user) navigate(useAuthStore.getState().homeFor(user.role));
    }, [isAuthenticated, user, navigate]);

    const pickRole = (id) => {
        setRole(id);
        setError("");
        const demo = DEMO[id];
        setUsername(demo[0]);
        setPassword("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await login(role, username.trim(), password.trim());
        } catch (err) {
            setError(err.message || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen">
            <motion.div
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
                className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-violet-600 via-indigo-700 to-zinc-900 p-10 lg:flex"
            >
                <div>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                            <Shield className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-2xl font-bold text-white">Placement Portal</span>
                    </div>
                    <div className="mt-16 max-w-md space-y-4">
                        <h1 className="text-4xl font-bold leading-tight text-white">Assess, practice, and get placed.</h1>
                        <p className="text-sm leading-relaxed text-white/70">
                            Adaptive aptitude &amp; coding tests, technical interviews, and smart resume-based role
                            categorization — all in one platform for students, staff, and placement coordinators.
                        </p>
                    </div>
                </div>
                <div className="space-y-2 text-xs text-white/50">
                    <p className="font-semibold text-white/80">Demo accounts</p>
                    <p>Student — 2023001 / 23CS001</p>
                    <p>Staff — staff@gmail.com / staff123</p>
                    <p>Placement — placement@gmail.com / placement123</p>
                </div>
            </motion.div>

            <div className="flex flex-1 items-center justify-center bg-zinc-950 p-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="w-full max-w-md"
                >
                    <div className="mb-8 text-center lg:hidden">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600">
                            <Shield className="h-7 w-7 text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-white">Placement Portal</h1>
                    </div>

                    <h2 className="mb-6 text-2xl font-semibold text-white">Sign in</h2>

                    <div className="mb-6 grid grid-cols-3 gap-2">
                        {ROLES.map((r) => {
                            const Icon = r.icon;
                            const active = role === r.id;
                            return (
                                <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => pickRole(r.id)}
                                    className={cn(
                                        "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-all",
                                        active
                                            ? "border-violet-500 bg-violet-600/10 text-violet-300"
                                            : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                    <span className="text-[11px] font-medium">{r.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                                <Hash className="h-4 w-4 text-zinc-500" />
                                {ROLES.find((r) => r.id === role).u}
                            </label>
                            <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                                <KeyRound className="h-4 w-4 text-zinc-500" />
                                {ROLES.find((r) => r.id === role).p}
                            </label>
                            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>

                        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

                        <Button type="submit" size="lg" className="w-full" variant="gradient" disabled={loading}>
                            {loading ? "Signing in..." : "Sign in"}
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </form>

                    <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-xs text-zinc-500">
                        <p className="mb-2 font-medium text-zinc-400">Demo credentials</p>
                        <p>Student: 2023001 / 23CS001</p>
                        <p>Staff: staff@gmail.com / staff123</p>
                        <p>Placement: placement@gmail.com / placement123</p>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

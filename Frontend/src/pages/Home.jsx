import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
    GraduationCap, 
    UserCog, 
    Briefcase, 
    Shield, 
    ArrowRight, 
    Hash, 
    KeyRound, 
    X, 
    BrainCircuit, 
    FileCode, 
    Activity, 
    CheckCircle 
} from "lucide-react";
import { Navbar } from "@/components/landing/navbar";
import { FeaturesSection } from "@/components/landing/features-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

const ROLES = [
    { id: "student", label: "Student", hint: "Register No + Roll No", icon: GraduationCap, u: "Register Number", p: "Roll Number", placeholderU: "Enter Register Number (e.g., 2023001)", placeholderP: "Enter Roll Number (e.g., 23CS001)" },
    { id: "staff", label: "Staff", hint: "Test & question management", icon: UserCog, u: "Email Address", p: "Password", placeholderU: "staff@gmail.com", placeholderP: "••••••••" },
    { id: "placement", label: "Placement", hint: "Resumes & interviews", icon: Briefcase, u: "Email Address", p: "Password", placeholderU: "placement@gmail.com", placeholderP: "••••••••" },
];

export default function Home() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const login = useAuthStore((s) => s.login);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const user = useAuthStore((s) => s.user);

    // Login Form State
    const [isSignInOpen, setIsSignInOpen] = useState(false);
    const [role, setRole] = useState("student");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Redirect if authenticated
    useEffect(() => {
        if (isAuthenticated && user) {
            navigate(useAuthStore.getState().homeFor(user.role));
        }
    }, [isAuthenticated, user, navigate]);

    // Check for login query parameter
    useEffect(() => {
        if (searchParams.get("login") === "1") {
            setIsSignInOpen(true);
        }
    }, [searchParams]);

    const handleCloseSignIn = () => {
        setIsSignInOpen(false);
        if (searchParams.get("login")) {
            setSearchParams({});
        }
    };

    const handleRoleChange = (roleId) => {
        setRole(roleId);
        setUsername("");
        setPassword("");
        setError("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await login(role, username, password);
        } catch (err) {
            setError(err.message || "Invalid credentials. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-background text-slate-800 dark:text-zinc-200 transition-colors duration-300 overflow-x-hidden">
            {/* Header & Navigation */}
            <Navbar onSignInClick={() => setIsSignInOpen(true)} />

            {/* Hero Section */}
            <section className="relative flex min-h-[85vh] items-center justify-center overflow-hidden py-16 px-4">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-violet-500/5 dark:from-violet-600/10 via-transparent to-transparent" />
                    <div className="absolute left-1/2 top-0 h-[450px] w-[750px] -translate-x-1/2 bg-gradient-to-b from-violet-500/5 dark:from-violet-500/8 to-transparent blur-3xl" />
                </div>

                <div className="relative z-10 mx-auto max-w-7xl w-full grid grid-cols-1 gap-12 lg:grid-cols-12 items-center">
                    
                    {/* Hero Left Column (Copy) */}
                    <div className="lg:col-span-7 text-left space-y-6">
                        <motion.div 
                            initial={{ opacity: 0, y: 15 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            transition={{ duration: 0.5 }}
                        >
                            <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 dark:border-violet-500/20 bg-violet-50 dark:bg-violet-500/10 px-4 py-1.5 text-xs sm:text-sm font-semibold text-violet-700 dark:text-violet-300">
                                <span className="relative flex h-2 w-2">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
                                </span>
                                Prepare. Perform. Prevail.
                            </span>
                        </motion.div>

                        <motion.h1 
                            initial={{ opacity: 0, y: 20 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="text-4xl font-black sm:text-5xl md:text-6xl tracking-tight leading-[1.1] text-slate-900 dark:text-white"
                        >
                            PrepGenix
                            <br />
                            <span className="bg-gradient-to-r from-violet-700 via-indigo-700 to-violet-600 dark:from-violet-400 dark:via-indigo-400 dark:to-violet-400 bg-clip-text text-transparent text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-wide block mt-2">
                                Beyond Aptitude. Beyond Interviews
                            </span>
                        </motion.h1>

                        <motion.p 
                            initial={{ opacity: 0, y: 20 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="text-base sm:text-lg text-slate-650 dark:text-zinc-400 leading-relaxed max-w-2xl"
                        >
                            The premier Placement Readiness and Continuous Assessment Portal curated for the CSE Department 
                            of Velammal College of Engineering &amp; Technology. Master aptitude modules, validate sandboxed 
                            programming solutions, experience simulated interviews, and optimize your student profiling.
                        </motion.p>

                        <motion.div 
                            initial={{ opacity: 0, y: 20 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            transition={{ duration: 0.6, delay: 0.3 }}
                            className="pt-2 flex flex-wrap gap-4"
                        >
                            <Button variant="default" size="xl" onClick={() => setIsSignInOpen(true)} className="group cursor-pointer">
                                Access Portal
                                <ArrowRight className="h-5 w-5 ml-1.5 transition-transform group-hover:translate-x-1" />
                            </Button>
                            <a href="#features">
                                <Button variant="outline" size="xl" className="cursor-pointer">
                                    Explore Features
                                </Button>
                            </a>
                        </motion.div>
                    </div>

                    {/* Hero Right Column (Branded Assessment Mockup) */}
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }} 
                        animate={{ opacity: 1, scale: 1 }} 
                        transition={{ duration: 0.7, delay: 0.2 }}
                        className="lg:col-span-5 relative w-full"
                    >
                        <div className="relative rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 p-1.5 shadow-2xl shadow-slate-100 dark:shadow-black/50 backdrop-blur-xl">
                            <div className="flex items-center gap-2 rounded-t-xl border-b border-slate-200 dark:border-zinc-800/40 bg-slate-50 dark:bg-zinc-950/60 px-4 py-3">
                                <div className="flex gap-1.5">
                                    <div className="h-3 w-3 rounded-full bg-red-400/80" />
                                    <div className="h-3 w-3 rounded-full bg-yellow-400/80" />
                                    <div className="h-3 w-3 rounded-full bg-green-400/80" />
                                </div>
                                <span className="ml-2 text-xs font-medium text-slate-500 dark:text-zinc-500">
                                    vcet_student_profile.json
                                </span>
                            </div>
                            
                            <div className="p-6 font-mono text-[11px] sm:text-xs leading-relaxed text-left space-y-4">
                                <div className="space-y-1">
                                    <p className="text-violet-600 dark:text-violet-400">{"{"}</p>
                                    <p className="pl-4"><span className="text-amber-600 dark:text-amber-400">"institution"</span>: <span className="text-emerald-600 dark:text-emerald-400">"VCET, Madurai"</span>,</p>
                                    <p className="pl-4"><span className="text-amber-600 dark:text-amber-400">"department"</span>: <span className="text-emerald-600 dark:text-emerald-400">"Computer Science &amp; Engineering"</span>,</p>
                                    <p className="pl-4"><span className="text-amber-600 dark:text-amber-400">"focus"</span>: <span className="text-emerald-600 dark:text-emerald-400">"Aptitude, Coding &amp; Interviews"</span>,</p>
                                    <p className="pl-4"><span className="text-amber-600 dark:text-amber-400">"proctoring"</span>: <span className="text-emerald-650 dark:text-emerald-400">true</span></p>
                                    <p className="text-violet-600 dark:text-violet-400">{"}"}</p>
                                </div>
                                
                                <hr className="border-slate-200 dark:border-zinc-800" />
                                
                                <div className="flex flex-col gap-2.5">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="h-4.5 w-4.5 text-emerald-500" />
                                        <span className="font-semibold text-slate-800 dark:text-zinc-200">Adaptive Mocking Ready</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="h-4.5 w-4.5 text-emerald-500" />
                                        <span className="font-semibold text-slate-800 dark:text-zinc-200">AI Resume Indexing Syncing</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Features Info Section */}
            <div id="features" className="border-t border-slate-200 dark:border-zinc-800/40 bg-white/40 dark:bg-zinc-950/20 py-8">
                <FeaturesSection />
            </div>

            {/* Integrated slide-over Sign In Panel */}
            <AnimatePresence>
                {isSignInOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={handleCloseSignIn}
                            className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm"
                        />

                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                onClick={(e) => e.stopPropagation()}
                                className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_30px_80px_rgba(15,23,42,0.2)] dark:border-zinc-800/80 dark:bg-zinc-950/95"
                            >
                                <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-500 opacity-90" />

                                <div className="relative p-6 sm:p-8">
                                    <div className="mb-6 flex items-start justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm">
                                                <Shield className="h-5 w-5 text-white" />
                                            </div>
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-100/90">Access portal</p>
                                                <h2 className="text-2xl font-bold text-white">Sign In</h2>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleCloseSignIn}
                                            className="rounded-xl bg-white/10 p-2 text-white/90 transition-colors hover:bg-white/15 hover:text-white"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
                                        <div className="mb-5">
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Placement Access</h3>
                                            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                                                Select your department role and continue with your credentials.
                                            </p>
                                        </div>

                                        <div className="mb-5 grid grid-cols-3 gap-2">
                                            {ROLES.map((r) => {
                                                const Icon = r.icon;
                                                const active = role === r.id;
                                                return (
                                                    <button
                                                        key={r.id}
                                                        type="button"
                                                        onClick={() => handleRoleChange(r.id)}
                                                        className={cn(
                                                            "flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-all cursor-pointer",
                                                            active
                                                                ? "border-violet-500 bg-violet-500/10 text-violet-700 shadow-sm dark:text-violet-300"
                                                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-white"
                                                        )}
                                                    >
                                                        <Icon className="h-4.5 w-4.5" />
                                                        <span className="text-[10px] font-bold tracking-tight">{r.label}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <form onSubmit={handleSubmit} className="space-y-4">
                                            <div className="space-y-1.5">
                                                <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700 dark:text-zinc-300">
                                                    <Hash className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                                                    {ROLES.find((r) => r.id === role).u}
                                                </label>
                                                <Input
                                                    value={username}
                                                    onChange={(e) => setUsername(e.target.value)}
                                                    placeholder={ROLES.find((r) => r.id === role).placeholderU}
                                                    required
                                                />
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700 dark:text-zinc-300">
                                                    <KeyRound className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
                                                    {ROLES.find((r) => r.id === role).p}
                                                </label>
                                                <Input
                                                    type="password"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    placeholder={ROLES.find((r) => r.id === role).placeholderP}
                                                    required
                                                />
                                            </div>

                                            {error && (
                                                <motion.p
                                                    initial={{ opacity: 0, y: -5 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400"
                                                >
                                                    {error}
                                                </motion.p>
                                            )}

                                            <Button type="submit" size="lg" className="mt-2 w-full cursor-pointer" variant="gradient" disabled={loading}>
                                                {loading ? "Signing in..." : "Sign In"}
                                                <ArrowRight className="h-4 w-4 ml-1.5" />
                                            </Button>
                                        </form>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>

            {/* Footer */}
            <footer className="border-t border-slate-200/80 dark:border-zinc-800/40 bg-white/80 dark:bg-zinc-950/80 py-6 transition-colors duration-300 backdrop-blur-sm">
                <div className="mx-auto max-w-6xl px-6 text-center space-y-1.5">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-zinc-200">
                        Velammal College of Engineering &amp; Technology, Madurai
                    </p>
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-zinc-400">
                        Placement readiness dashboard curated by the Department of Computer Science and Engineering.
                    </p>
                    <p className="pt-3 text-[10px] sm:text-xs text-slate-400 dark:text-zinc-500">
                        &copy; {new Date().getFullYear()} Velammal College of Engineering &amp; Technology. All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
}

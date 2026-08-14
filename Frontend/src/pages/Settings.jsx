import { useEffect, useState } from "react";
import { User, Phone, Mail, FileText, KeyRound, Sun, Moon, Lock, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/portal/primitives";
import { StatusBadge } from "@/components/portal/status-badge";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function PerfRow({ label, list }) {
    if (!list?.length) return <p className="text-sm text-slate-500 dark:text-zinc-500">No {label.toLowerCase()} attempts yet.</p>;
    return (
        <div className="space-y-2">
            {(list || []).slice().reverse().map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-3">
                    <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-zinc-200">{item.testTitle || item.type}</p>
                        <p className="text-xs text-slate-500 dark:text-zinc-500">{new Date(item.date).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {item.rating != null && <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{item.rating}/5</span>}
                        {item.score != null && <span className="text-sm text-slate-500 dark:text-zinc-400">{item.score}/{item.total}</span>}
                        <StatusBadge value={item.result || item.status || "completed"} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function SettingsPage() {
    const user = useAuthStore((s) => s.user);
    const { theme, setTheme } = useUIStore();
    const [student, setStudent] = useState(null);
    const [loadingStudent, setLoadingStudent] = useState(user?.role === "student");

    // Password state
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [pwdMsg, setPwdMsg] = useState({ type: "", text: "" });
    const [pwdLoading, setPwdLoading] = useState(false);

    const regNo = user?.username;

    useEffect(() => {
        if (user?.role === "student" && regNo) {
            api.students.get(regNo)
                .then(setStudent)
                .catch(() => {})
                .finally(() => setLoadingStudent(false));
        }
    }, [user, regNo]);

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setPwdMsg({ type: "", text: "" });
        if (newPassword !== confirmPassword) {
            setPwdMsg({ type: "error", text: "New passwords do not match" });
            return;
        }
        if (newPassword.length < 4) {
            setPwdMsg({ type: "error", text: "Password must be at least 4 characters long" });
            return;
        }
        setPwdLoading(true);
        try {
            await api.auth.changePassword({ currentPassword, newPassword });
            setPwdMsg({ type: "success", text: "Password updated successfully!" });
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err) {
            setPwdMsg({ type: "error", text: err.message || "Failed to change password" });
        } finally {
            setPwdLoading(false);
        }
    };

    const isStudent = user?.role === "student";
    const p = student || {};
    const perf = p.performance || {};
    const [resume, setResume] = useState(null);
    const [uploadingResume, setUploadingResume] = useState(false);
    const [resumeError, setResumeError] = useState(null);

    useEffect(() => {
        if (!isStudent || !regNo) return;
        api.resumes.get(regNo).then(setResume).catch(() => setResume(null));
    }, [isStudent, regNo]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Account Settings"
                description="Manage your profile details, security preferences, and visual theme"
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Left column: User Identity Card */}
                <div className="space-y-6">
                    <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-2xl font-bold text-white shadow-lg">
                                {(user?.name || "?").slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{user?.name}</h2>
                                <p className="text-sm text-slate-500 dark:text-zinc-500">{user?.username}</p>
                                <span className="mt-2 inline-block rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold capitalize text-violet-600 dark:text-violet-300 border border-violet-200 dark:border-violet-500/20">
                                    {user?.role === "staff" ? "Staff Coordinator" : user?.role === "placement" ? "Placement Coordinator" : "Student"}
                                </span>
                            </div>

                            {isStudent && (
                                <>
                                    <div className="flex flex-wrap justify-center gap-2 text-xs text-slate-600 dark:text-zinc-400">
                                        <span className="rounded-md bg-slate-100 dark:bg-zinc-800 px-2.5 py-1">{p.department || "CSE"}</span>
                                        <span className="rounded-md bg-slate-100 dark:bg-zinc-800 px-2.5 py-1">{p.batch || "2023-2027"}</span>
                                        <span className="rounded-md bg-slate-100 dark:bg-zinc-800 px-2.5 py-1">CGPA {p.cgpa || "—"}</span>
                                    </div>
                                    <div className="mt-2 w-full space-y-2 text-sm text-slate-600 dark:text-zinc-400">
                                        <p className="flex items-center justify-center gap-2"><Mail className="h-4 w-4 text-slate-400 dark:text-zinc-500" />{p.email || "—"}</p>
                                        <p className="flex items-center justify-center gap-2"><Phone className="h-4 w-4 text-slate-400 dark:text-zinc-500" />{p.mobile || "—"}</p>
                                    </div>
                                </>
                            )}
                            {/* Resume Upload Card (Student) */}
                            {isStudent && (
                                <div className="w-full mt-4">
                                    <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                                        <CardHeader>
                                            <CardTitle className="text-sm font-medium text-slate-500 dark:text-zinc-400">Resume</CardTitle>
                                            <CardDescription className="text-xs text-slate-400 dark:text-zinc-500">Upload your resume for parsing and categorization</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-3">
                                                {resume ? (
                                                    <div className="rounded-md border border-slate-200 dark:border-zinc-800 p-3 text-sm text-slate-700 dark:text-zinc-300">
                                                        <p className="font-medium">{resume.fileName}</p>
                                                        <p className="text-xs text-slate-500">Uploaded: {new Date(resume.uploadedAt).toLocaleString()}</p>
                                                        <p className="text-xs text-slate-500">Top category: {resume.topCategory || "—"}</p>
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-slate-500">No resume uploaded yet.</p>
                                                )}

                                                <div className="flex items-center gap-2">
                                                    <input id="resume-file" type="file" accept=".pdf,.docx,.txt" className="text-sm text-slate-600 dark:text-zinc-400" onChange={async (e) => {
                                                        const f = e.target.files && e.target.files[0];
                                                        if (!f) return;
                                                        setResumeError(null);
                                                        setUploadingResume(true);
                                                        try {
                                                            const res = await api.resumes.upload(regNo, f);
                                                            setResume(res);
                                                        } catch (err) {
                                                            setResumeError(err.message);
                                                        } finally {
                                                            setUploadingResume(false);
                                                        }
                                                    }} />
                                                    <button className="px-3 py-1 rounded bg-violet-600 text-white text-xs cursor-pointer" disabled={uploadingResume} onClick={() => document.getElementById('resume-file').click()}>
                                                        {uploadingResume ? 'Uploading…' : 'Choose file'}
                                                    </button>
                                                    {resume && <button className="px-3 py-1 rounded border border-slate-200 dark:border-zinc-700 text-xs text-slate-600 dark:text-zinc-300 cursor-pointer" onClick={async () => {
                                                        try {
                                                            await api.resumes.parse(regNo);
                                                            const updated = await api.resumes.get(regNo);
                                                            setResume(updated);
                                                        } catch (err) { setResumeError(err.message); }
                                                    }}>Re-parse</button>}
                                                </div>
                                                {resumeError && <p className="text-xs text-red-400">{resumeError}</p>}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Appearance / Theme Switch Card */}
                    <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-zinc-300">
                                <Sparkles className="h-4 w-4 text-violet-500 dark:text-violet-400" /> Theme &amp; Appearance
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-500 dark:text-zinc-500">
                                Choose between Dark mode and Light mode
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setTheme("dark")}
                                    className={cn(
                                        "flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all cursor-pointer",
                                        theme === "dark"
                                            ? "border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300"
                                            : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700"
                                    )}
                                >
                                    <Moon className="h-6 w-6" />
                                    <span className="text-xs font-medium">Dark Mode</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTheme("light")}
                                    className={cn(
                                        "flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all cursor-pointer",
                                        theme === "light"
                                            ? "border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300"
                                            : "border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 text-slate-500 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700"
                                    )}
                                >
                                    <Sun className="h-6 w-6" />
                                    <span className="text-xs font-medium">Light Mode</span>
                                </button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right columns: Academic info & Security */}
                <div className="space-y-6 lg:col-span-2">
                    {/* Password & Security Card */}
                    <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-zinc-300">
                                <Lock className="h-4 w-4 text-violet-500 dark:text-violet-400" /> Account Security
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-500 dark:text-zinc-500">
                                Update your login password securely
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300">Current Password</label>
                                    <Input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        required
                                        placeholder="Enter current password"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300">New Password</label>
                                    <Input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                        placeholder="Enter new password"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-700 dark:text-zinc-300">Confirm New Password</label>
                                    <Input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        placeholder="Confirm new password"
                                    />
                                </div>

                                {pwdMsg.text && (
                                    <p className={cn("rounded-lg border px-3 py-2 text-xs font-medium", pwdMsg.type === "error" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400")}>
                                        {pwdMsg.text}
                                    </p>
                                )}

                                <Button type="submit" variant="gradient" disabled={pwdLoading}>
                                    <KeyRound className="h-4 w-4 mr-2" />
                                    {pwdLoading ? "Updating..." : "Update Password"}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Student Academic & Resume Info */}
                    {isStudent && (
                        <>
                            <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                                <CardHeader><CardTitle className="text-sm font-medium text-slate-500 dark:text-zinc-400">Academic Records</CardTitle></CardHeader>
                                <CardContent className="grid grid-cols-3 gap-4">
                                    <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-4 text-center">
                                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{p.tenth || "—"}%</p>
                                        <p className="text-xs text-slate-500 dark:text-zinc-500">10th Percentage</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-4 text-center">
                                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{p.twelfth || "—"}%</p>
                                        <p className="text-xs text-slate-500 dark:text-zinc-500">12th Percentage</p>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/40 p-4 text-center">
                                        <p className="text-2xl font-bold text-slate-900 dark:text-white">{p.cgpa || "—"}</p>
                                        <p className="text-xs text-slate-500 dark:text-zinc-500">Current CGPA</p>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                                <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-zinc-400"><FileText className="h-4 w-4 text-violet-500 dark:text-violet-400" /> Resume Categorization</CardTitle></CardHeader>
                                <CardContent>
                                    {p.resumeCategories?.length ? (
                                        <div className="flex flex-wrap gap-2">
                                            {p.resumeCategories.map((c, i) => (
                                                <span key={i} className="rounded-md border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-700 dark:text-violet-300">
                                                    {typeof c === "string" ? c : c.name}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500 dark:text-zinc-500">No resume categorized yet. The Placement Coordinator will upload and categorize your resume.</p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                                <CardHeader><CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-zinc-400"><User className="h-4 w-4 text-violet-500 dark:text-violet-400" /> Performance History</CardTitle></CardHeader>
                                <CardContent className="space-y-5">
                                    <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-450 dark:text-zinc-500">Aptitude Tests</p>
                                        <PerfRow label="Aptitude" list={perf.aptitude} />
                                    </div>
                                    <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-450 dark:text-zinc-500">Coding Tests</p>
                                        <PerfRow label="Coding" list={perf.coding} />
                                    </div>
                                    <div>
                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-450 dark:text-zinc-500">Technical Interviews</p>
                                        <PerfRow label="Interviews" list={perf.interview} />
                                    </div>
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

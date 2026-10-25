import { useCallback, useEffect, useState } from "react";
import {
    BadgeCheck,
    BrainCircuit,
    Download,
    Eye,
    FileText,
    RefreshCw,
    Sparkles,
    Upload,
    CheckCircle2,
    CircleAlert,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileInput } from "@/components/ui/file-input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, EmptyState, LoadingState } from "@/components/portal/primitives";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth-store";

const MAX_RESUME_SIZE = 8 * 1024 * 1024;

function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "Size unavailable";
    return bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function categoryName(category) {
    return typeof category === "string" ? category : category?.name;
}

function resumeReadiness(resume) {
    if (!resume) return { label: "Resume needed", ready: false };
    if (String(resume.text || "").trim().length < 40) return { label: "Text needs review", ready: false };
    return { label: "Parsed and ready", ready: true };
}

export default function StudentResume() {
    const regNo = useAuthStore((state) => state.user?.username);
    const [resume, setResume] = useState(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    const loadResume = useCallback(async () => {
        if (!regNo) return;
        setLoading(true);
        setError("");
        try {
            setResume(await api.resumes.get(regNo));
        } catch (loadError) {
            if (loadError.message === "Resume not found") {
                setResume(null);
            } else {
                setError(loadError.message || "Could not load your resume.");
            }
        } finally {
            setLoading(false);
        }
    }, [regNo]);

    useEffect(() => {
        loadResume();
    }, [loadResume]);

    useEffect(() => () => {
        if (preview?.url) URL.revokeObjectURL(preview.url);
    }, [preview]);

    const selectFile = (event) => {
        const file = event.target.files?.[0] || null;
        setError("");
        setNotice("");
        if (file && !/\.(pdf|docx|txt)$/i.test(file.name)) {
            setSelectedFile(null);
            setError("Choose a PDF, DOCX, or TXT resume.");
            return;
        }
        if (file && file.size > MAX_RESUME_SIZE) {
            setSelectedFile(null);
            setError("Choose a resume smaller than 8 MB.");
            return;
        }
        setSelectedFile(file);
    };

    const uploadResume = async () => {
        if (!selectedFile || !regNo) return;
        setWorking(true);
        setError("");
        setNotice("");
        try {
            const updated = await api.resumes.upload(regNo, selectedFile);
            setResume(updated);
            setSelectedFile(null);
            setNotice("Resume uploaded and parsed successfully.");
        } catch (uploadError) {
            setError(uploadError.message || "Resume upload or parsing failed.");
        } finally {
            setWorking(false);
        }
    };

    const reparseResume = async () => {
        if (!resume || !regNo) return;
        setWorking(true);
        setError("");
        setNotice("");
        try {
            setResume(await api.resumes.parse(regNo));
            setNotice("Resume parsing completed successfully.");
        } catch (parseError) {
            setError(parseError.message || "Resume parsing failed.");
        } finally {
            setWorking(false);
        }
    };

    const getResumeBlob = async () => {
        if (!resume) return null;
        return api.resumes.file(regNo);
    };

    const previewResume = async () => {
        if (!resume) return;
        setPreviewLoading(true);
        setError("");
        try {
            const blob = await getResumeBlob();
            const url = URL.createObjectURL(blob);
            setPreview((current) => {
                if (current?.url) URL.revokeObjectURL(current.url);
                return { url, fileName: resume.fileName, contentType: blob.type };
            });
        } catch (previewError) {
            setError(previewError.message || "Could not open the resume file.");
        } finally {
            setPreviewLoading(false);
        }
    };

    const downloadResume = async () => {
        if (!resume) return;
        setPreviewLoading(true);
        setError("");
        try {
            const blob = await getResumeBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = resume.fileName || "resume";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (downloadError) {
            setError(downloadError.message || "Could not download the resume file.");
        } finally {
            setPreviewLoading(false);
        }
    };

    const categories = (resume?.categories || []).map(categoryName).filter(Boolean);
    const skills = resume?.skills || [];
    const readiness = resumeReadiness(resume);
    const extractedTextLength = String(resume?.text || "").trim().length;

    return (
        <div className="space-y-5">
            <PageHeader
                title="Resume Parsing"
                description="Upload your resume once. AI uses it and the interview role to generate personalized questions automatically when you start."
                action={resume && (
                    <Badge variant={readiness.ready ? "success" : "warning"} className="gap-1.5 px-3 py-1.5">
                        {readiness.ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                        {readiness.label}
                    </Badge>
                )}
            />

            {error && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                    <span>{error}</span>
                    <Button variant="outline" size="sm" onClick={loadResume} disabled={loading}>Retry loading</Button>
                </div>
            )}
            {notice && (
                <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                    {notice}
                </div>
            )}

            {loading ? (
                <LoadingState label="Loading your resume" className="min-h-48" />
            ) : (
                <>
                    {resume && (
                        <div className="grid gap-3 sm:grid-cols-3">
                            {[
                                { label: "Skills detected", value: skills.length },
                                { label: "Career categories", value: categories.length },
                                { label: "Readable text", value: `${extractedTextLength.toLocaleString()} characters` },
                            ].map((stat) => (
                                <Card key={stat.label}>
                                    <CardContent className="p-4">
                                        <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">{stat.label}</p>
                                        <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{stat.value}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                    {resume && !readiness.ready && (
                        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>The parser found very little readable text. If this is a scanned PDF, upload a text-based PDF or DOCX so your interview questions can be grounded in your resume.</p>
                        </div>
                    )}

                    <div className="grid gap-4 lg:grid-cols-3">
                        <Card className="lg:col-span-2">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Upload className="h-5 w-5 text-violet-500" />
                                    {resume ? "Update your resume" : "Upload your resume"}
                                </CardTitle>
                                <CardDescription>
                                    PDF, DOCX, or TXT · maximum 8 MB. Skills and career categories are detected automatically from readable resume text.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <FileInput
                                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                                    value={selectedFile}
                                    placeholder="Choose a resume file"
                                    onChange={selectFile}
                                />
                                {selectedFile && (
                                    <p className="text-xs text-slate-500 dark:text-zinc-400">
                                        {selectedFile.name} · {formatSize(selectedFile.size)}
                                    </p>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    <Button onClick={uploadResume} disabled={!selectedFile || working}>
                                        {working ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                        {working ? "Uploading and parsing..." : resume ? "Replace and parse" : "Upload and parse"}
                                    </Button>
                                    {resume && (
                                        <Button variant="outline" onClick={reparseResume} disabled={working}>
                                            <RefreshCw className={`h-4 w-4 ${working ? "animate-spin" : ""}`} />
                                            Parse current resume again
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <BadgeCheck className="h-5 w-5 text-emerald-500" />
                                    Parsing status
                                </CardTitle>
                                <CardDescription>Resume details used to generate your interview questions automatically.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {!resume ? (
                                    <p className="text-sm text-slate-500 dark:text-zinc-400">No resume uploaded yet.</p>
                                ) : (
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <p className="font-medium text-slate-900 dark:text-white">{resume.fileName}</p>
                                            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500">{formatSize(resume.size)}</p>
                                        </div>
                                        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-zinc-800">
                                            <span className="text-slate-500 dark:text-zinc-400">Top category</span>
                                            <span className="font-medium text-violet-700 dark:text-violet-300">{resume.topCategory || "Not categorized"}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-slate-500 dark:text-zinc-400">Last parsed</span>
                                            <span className="text-right text-xs text-slate-700 dark:text-zinc-300">
                                                {resume.parsedAt ? new Date(resume.parsedAt).toLocaleString() : "Not parsed"}
                                            </span>
                                        </div>
                                        <div className="flex gap-2 border-t border-slate-100 pt-3 dark:border-zinc-800">
                                            <Button variant="outline" size="sm" onClick={previewResume} disabled={previewLoading}>
                                                <Eye className="h-4 w-4" /> Preview
                                            </Button>
                                            <Button variant="outline" size="sm" onClick={downloadResume} disabled={previewLoading}>
                                                <Download className="h-4 w-4" /> Download
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {!resume ? (
                        <EmptyState
                            icon={FileText}
                            title="Build your interview profile"
                            description="Upload a clear, text-readable PDF, DOCX, or TXT resume. AI will use the extracted skills and experience to ask relevant questions when your interview begins."
                        />
                    ) : (
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Sparkles className="h-5 w-5 text-amber-500" />
                                        Extracted skills
                                    </CardTitle>
                                    <CardDescription>{skills.length} skill{skills.length === 1 ? "" : "s"} found in your resume.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {skills.length ? (
                                        <div className="flex flex-wrap gap-2">
                                            {skills.slice(0, 60).map((skill, index) => (
                                                <span key={`${skill}-${index}`} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300">
                                                    {skill}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500 dark:text-zinc-400">No skills were detected. Try uploading a clearer or text-based document.</p>
                                    )}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <BrainCircuit className="h-5 w-5 text-blue-500" />
                                        Career categories
                                    </CardTitle>
                                    <CardDescription>Areas AI can use to tailor interview questions to your experience.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {categories.length ? (
                                        <div className="flex flex-wrap gap-2">
                                            {categories.map((category, index) => (
                                                <span key={`${category}-${index}`} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                                                    {category}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500 dark:text-zinc-400">No categories detected yet. Re-parse after checking that the resume text is readable.</p>
                                    )}
                                </CardContent>
                            </Card>

                        </div>
                    )}
                </>
            )}

            <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null); }}>
                <DialogContent className="max-h-[90vh] max-w-5xl">
                    <DialogHeader>
                        <DialogTitle>{preview?.fileName || "Resume preview"}</DialogTitle>
                        <DialogDescription>
                            {preview?.contentType === "application/pdf" ? "PDF preview" : "Text resume preview"}
                        </DialogDescription>
                    </DialogHeader>
                    {preview && (
                        <iframe
                            title={`Preview of ${preview.fileName}`}
                            src={preview.url}
                            className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white dark:border-zinc-800"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

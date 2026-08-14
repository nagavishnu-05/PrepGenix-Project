import { useState, useEffect, useCallback } from "react";
import { Search, Users, FileText, BrainCircuit } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { api } from "@/lib/api";

export default function PlacementStudents() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [batch, setBatch] = useState("");
    const [search, setSearch] = useState("");
    const [cat, setCat] = useState("");

    const load = useCallback(() => {
        setLoading(true);
        api.reports.students({ batch: batch || undefined, search: search || undefined, categorized: cat === "categorized" })
            .then(setRows)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [batch, search, cat]);

    useEffect(() => {
        const t = setTimeout(load, search ? 400 : 0);
        return () => clearTimeout(t);
    }, [load]);

    return (
        <div>
            <PageHeader title="Students" description="Browse candidates and their assessment profiles" />

            <Card className="border-slate-200/80 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/40">
                <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                            <Input placeholder="Search by name or reg number..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                        </div>
                        <Select value={batch} onValueChange={setBatch}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All batches" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">All batches</SelectItem>
                                {[...new Set(rows.map((r) => r.batch).filter(Boolean))].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={cat} onValueChange={setCat}>
                            <SelectTrigger className="w-48"><SelectValue placeholder="All students" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">All students</SelectItem>
                                <SelectItem value="categorized">Categorized (have resume)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="py-10 text-center text-sm text-slate-500 dark:text-zinc-500">Loading...</p>
                    ) : rows.length === 0 ? (
                        <EmptyState icon={Users} title="No students" description="No student records match the filters." />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Candidate</TableHead>
                                    <TableHead>Batch</TableHead>
                                    <TableHead>CGPA</TableHead>
                                    <TableHead>Tests</TableHead>
                                    <TableHead>Aptitude</TableHead>
                                    <TableHead>Coding</TableHead>
                                    <TableHead>Interview</TableHead>
                                    <TableHead>Category</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((s) => (
                                    <TableRow key={s.regNo}>
                                        <TableCell>
                                            <p className="font-medium text-slate-800 dark:text-zinc-100">{s.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-zinc-500">{s.regNo}</p>
                                        </TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{s.batch || "—"}</TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{s.cgpa ?? "—"}</TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{s.aptitudeCount + s.codingCount}</TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{s.aptitudeCount ? `${s.aptitudeAverage}%` : "—"}</TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">{s.codingCount ? `${s.codingAverage}%` : "—"}</TableCell>
                                        <TableCell className="text-sm text-slate-600 dark:text-zinc-300">
                                            {s.lastInterview ? <span className="text-amber-600 dark:text-amber-400">★ {s.lastInterview.rating}/5</span> : "—"}
                                        </TableCell>
                                        <TableCell>
                                            {s.hasResume ? (
                                                <span className="flex items-center gap-1 text-xs text-violet-650 dark:text-violet-400"><FileText className="h-3.5 w-3.5" /> {s.topCategory || s.categories[0] || "Parsed"}</span>
                                            ) : (
                                                <BrainCircuit className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-650" />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

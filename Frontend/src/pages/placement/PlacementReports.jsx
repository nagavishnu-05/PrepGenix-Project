import { useState, useEffect } from "react";
import { Search, Users } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, EmptyState } from "@/components/portal/primitives";
import { api } from "@/lib/api";

export default function PlacementReports() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [batch, setBatch] = useState("");
    const [search, setSearch] = useState("");

    useEffect(() => {
        setLoading(true);
        api.reports.students({ batch: batch || undefined, search: search || undefined })
            .then(setRows)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [batch, search]);

    const resultColor = (r) => {
        if (r === "selected") return "text-emerald-400";
        if (r === "passed") return "text-blue-400";
        if (r === "failed") return "text-red-400";
        return "text-zinc-400";
    };

    return (
        <div>
            <PageHeader title="Reports" description="Placement readiness across all candidates" />

            <Card className="border-zinc-800/80 bg-zinc-900/40">
                <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-48">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                            <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                        </div>
                        <Select value={batch} onValueChange={setBatch}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All batches" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">All batches</SelectItem>
                                {[...new Set(rows.map((r) => r.batch).filter(Boolean))].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="py-10 text-center text-sm text-zinc-500">Loading...</p>
                    ) : rows.length === 0 ? (
                        <EmptyState icon={Users} title="No data" description="No student performance data yet." />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Candidate</TableHead>
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
                                            <p className="font-medium text-zinc-100">{s.name}</p>
                                            <p className="text-xs text-zinc-500">{s.regNo} • {s.batch || ""}</p>
                                        </TableCell>
                                        <TableCell>
                                            <p className="text-sm text-zinc-200">{s.aptitudeCount ? `${s.aptitudeAverage}% avg` : "—"}</p>
                                            {s.lastAptitude && <p className={`text-xs ${resultColor(s.lastAptitude.result)}`}>{s.lastAptitude.result} · {s.lastAptitude.percentage}%</p>}
                                        </TableCell>
                                        <TableCell>
                                            <p className="text-sm text-zinc-200">{s.codingCount ? `${s.codingAverage}% avg` : "—"}</p>
                                            {s.lastCoding && <p className={`text-xs ${resultColor(s.lastCoding.result)}`}>{s.lastCoding.result} · {s.lastCoding.percentage}%</p>}
                                        </TableCell>
                                        <TableCell>
                                            <p className="text-sm text-zinc-200">{s.interviewCount || "—"}</p>
                                            {s.lastInterview && <p className="text-xs text-amber-400">★ {s.lastInterview.rating}/5</p>}
                                        </TableCell>
                                        <TableCell className="text-sm text-violet-400">{s.topCategory || "—"}</TableCell>
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

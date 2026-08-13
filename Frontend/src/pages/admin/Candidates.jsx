import { useState, useMemo } from "react";
import { Search, Download, ChevronDown, ChevronUp, AlertTriangle, BarChart3, Mail, Clock, Shield, } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { candidateList } from "@/lib/mock-data";
export default function CandidatesPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedId, setExpandedId] = useState(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const filteredCandidates = useMemo(() => {
        let list = candidateList;
        if (statusFilter !== "all") {
            list = list.filter((c) => c.status === statusFilter);
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
        }
        return list;
    }, [searchQuery, statusFilter]);
    const toggleExpand = (id) => {
        setExpandedId((prev) => (prev === id ? null : id));
    };
    const exportCSV = () => {
        const headers = ["Name", "Email", "Tests Taken", "Avg Score", "Status", "Violations"];
        const rows = filteredCandidates.map((c) => [
            c.name,
            c.email,
            c.testsTaken,
            c.avgScore,
            c.status,
            c.violations,
        ]);
        const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "candidates.csv";
        a.click();
        URL.revokeObjectURL(url);
    };
    return (<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Candidate Management</h1>
          <p className="text-zinc-400">
            View and manage {candidateList.length} registered candidates.
          </p>
        </div>
        <Button variant="outline" onClick={exportCSV}>
          <Download className="h-4 w-4"/>
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                <Shield className="h-5 w-5 text-violet-400"/>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">
                  {candidateList.length}
                </p>
                <p className="text-xs text-zinc-500">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <BarChart3 className="h-5 w-5 text-emerald-400"/>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">
                  {candidateList.filter((c) => c.status === "active").length}
                </p>
                <p className="text-xs text-zinc-500">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-400"/>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">
                  {candidateList.filter((c) => c.status === "inactive").length}
                </p>
                <p className="text-xs text-zinc-500">Inactive</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-400"/>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">
                  {candidateList.reduce((acc, c) => acc + c.violations, 0)}
                </p>
                <p className="text-xs text-zinc-500">Total Violations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/>
              <Input placeholder="Search candidates..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9"/>
            </div>
            <div className="flex gap-1">
              {["all", "active", "inactive"].map((status) => (<button key={status} onClick={() => setStatusFilter(status)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === status
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"}`}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Tests Taken</TableHead>
                <TableHead>Avg Score</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Violations</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCandidates.length === 0 ? (<TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <p className="text-sm text-zinc-500">No candidates found</p>
                  </TableCell>
                </TableRow>) : (filteredCandidates.map((candidate) => {
            const initials = candidate.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase();
            const isExpanded = expandedId === candidate.id;
            return (<>
                      <TableRow key={candidate.id} className="cursor-pointer" onClick={() => toggleExpand(candidate.id)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-gradient-to-br from-violet-600 to-indigo-600 text-xs font-bold text-white">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-zinc-100">{candidate.name}</p>
                              <p className="text-xs text-zinc-500">{candidate.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-zinc-300">{candidate.testsTaken}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
                              <div className={`h-full rounded-full transition-all ${candidate.avgScore >= 80
                    ? "bg-emerald-500"
                    : candidate.avgScore >= 60
                        ? "bg-amber-500"
                        : "bg-red-500"}`} style={{ width: `${candidate.avgScore}%` }}/>
                            </div>
                            <span className="text-sm font-medium text-zinc-200">
                              {candidate.avgScore}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-zinc-400">{candidate.lastActive}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={candidate.status === "active" ? "success" : "secondary"}>
                            {candidate.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm font-medium ${candidate.violations > 5
                    ? "text-red-400"
                    : candidate.violations > 2
                        ? "text-amber-400"
                        : "text-zinc-400"}`}>
                            {candidate.violations}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(candidate.id);
                }}>
                            {isExpanded ? (<ChevronUp className="h-4 w-4"/>) : (<ChevronDown className="h-4 w-4"/>)}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (<TableRow key={`${candidate.id}-expanded`}>
                          <TableCell colSpan={7} className="bg-zinc-800/20 p-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                              <div className="flex items-center gap-3 rounded-lg bg-zinc-800/30 p-3">
                                <Mail className="h-4 w-4 text-zinc-500"/>
                                <div>
                                  <p className="text-xs text-zinc-500">Email</p>
                                  <p className="text-sm text-zinc-200">{candidate.email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 rounded-lg bg-zinc-800/30 p-3">
                                <BarChart3 className="h-4 w-4 text-zinc-500"/>
                                <div>
                                  <p className="text-xs text-zinc-500">Performance</p>
                                  <p className="text-sm text-zinc-200">
                                    {candidate.testsTaken} tests, {candidate.avgScore}% avg
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 rounded-lg bg-zinc-800/30 p-3">
                                <AlertTriangle className="h-4 w-4 text-zinc-500"/>
                                <div>
                                  <p className="text-xs text-zinc-500">Violations</p>
                                  <p className="text-sm text-zinc-200">
                                    {candidate.violations} total recorded
                                  </p>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>)}
                    </>);
        }))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>);
}

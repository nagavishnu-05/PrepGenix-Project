import { useState } from "react";
import { Eye, AlertTriangle, Camera, Clock, User, Flag, Square, Shield, Activity, } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { mockTests } from "@/lib/mock-data";
const mockMonitored = [];
const statusConfig = {
    active: { label: "Active", dot: "bg-emerald-400", badge: "success" },
    idle: { label: "Idle", dot: "bg-amber-400", badge: "warning" },
    violation: { label: "Violation", dot: "bg-red-400", badge: "destructive" },
};
export default function MonitoringPage() {
    const [selectedTest, setSelectedTest] = useState("");
    const activeCount = mockMonitored.filter((c) => c.status === "active").length;
    const totalViolations = mockMonitored.reduce((acc, c) => acc + c.violations, 0);
    const avgEyeContact = Math.round(mockMonitored.reduce((acc, c) => acc + c.eyeContact, 0) / mockMonitored.length);
    return (<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Live Monitoring</h1>
          <p className="text-zinc-400">Real-time proctoring and candidate oversight.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="success" className="gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"/>
            Live
          </Badge>
          <Select value={selectedTest} onValueChange={setSelectedTest}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select test"/>
            </SelectTrigger>
            <SelectContent>
              {mockTests
            .filter((t) => t.status === "active")
            .map((test) => (<SelectItem key={test.id} value={test.id}>
                    {test.title}
                  </SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <User className="h-5 w-5 text-emerald-400"/>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">{activeCount}</p>
                <p className="text-xs text-zinc-500">Active Candidates</p>
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
                <p className="text-lg font-bold text-zinc-100">{totalViolations}</p>
                <p className="text-xs text-zinc-500">Total Violations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                <Eye className="h-5 w-5 text-violet-400"/>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">{avgEyeContact}%</p>
                <p className="text-xs text-zinc-500">Avg Eye Contact</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <Shield className="h-5 w-5 text-blue-400"/>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">
                  {mockMonitored.filter((c) => c.violations === 0).length}
                </p>
                <p className="text-xs text-zinc-500">No Violations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockMonitored.map((candidate) => {
            const cfg = statusConfig[candidate.status];
            return (<Card key={candidate.id} className="relative overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-gradient-to-br from-violet-600 to-indigo-600 text-xs font-bold text-white">
                        {candidate.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{candidate.name}</p>
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`}/>
                        <span className="text-[10px] text-zinc-500">{cfg.label}</span>
                      </div>
                    </div>
                  </div>
                  <Badge variant={cfg.badge} className="text-[10px]">
                    {cfg.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex aspect-video items-center justify-center rounded-lg bg-zinc-950 border border-zinc-800">
                  <div className="flex flex-col items-center gap-2 text-zinc-600">
                    <Camera className="h-8 w-8"/>
                    <span className="text-xs">Camera Feed</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 rounded-md bg-zinc-800/30 px-2.5 py-1.5">
                    <Activity className="h-3 w-3 text-zinc-500"/>
                    <span className="text-[11px] text-zinc-400 truncate">
                      {candidate.currentQuestion}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md bg-zinc-800/30 px-2.5 py-1.5">
                    <Clock className="h-3 w-3 text-zinc-500"/>
                    <span className="text-[11px] text-zinc-400">{candidate.timeElapsed}</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md bg-zinc-800/30 px-2.5 py-1.5">
                    <Eye className="h-3 w-3 text-zinc-500"/>
                    <span className="text-[11px] text-zinc-400">{candidate.eyeContact}%</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-md bg-zinc-800/30 px-2.5 py-1.5">
                    <AlertTriangle className="h-3 w-3 text-zinc-500"/>
                    <span className={`text-[11px] ${candidate.violations > 3
                    ? "text-red-400"
                    : candidate.violations > 0
                        ? "text-amber-400"
                        : "text-zinc-400"}`}>
                      {candidate.violations} violations
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" className="flex-1">
                    <Square className="h-3 w-3"/>
                    End Test
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1">
                    <Flag className="h-3 w-3"/>
                    Flag
                  </Button>
                </div>
              </CardContent>
            </Card>);
        })}
      </div>
    </div>);
}

import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { mockAttempt } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";
const historyRows = [
    {
        testId: "test-3",
        testName: "Data Structures & Algorithms",
        date: mockAttempt.startedAt,
        score: mockAttempt.score,
        totalScore: mockAttempt.totalScore,
        status: "completed",
        timeTaken: "1h 0m",
        violations: 2,
    },
];
export default function HistoryPage() {
    return (<div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-zinc-100">Test History</h1>
        <p className="text-zinc-400">Review your past assessment attempts and results.</p>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-zinc-400">Total Tests</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100">1</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-zinc-400">Average Score</p>
              <p className="mt-1 text-2xl font-bold text-zinc-100">83%</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-zinc-400">Pass Rate</p>
              <p className="mt-1 text-2xl font-bold text-emerald-400">100%</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* History Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assessment History</CardTitle>
          </CardHeader>
          <CardContent>
            {historyRows.length > 0 ? (<Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test Name</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Time Taken</TableHead>
                    <TableHead>Violations</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.map((row) => {
                const percentage = Math.round((row.score / row.totalScore) * 100);
                return (<TableRow key={row.testId}>
                        <TableCell className="font-medium text-zinc-100">
                          {row.testName}
                        </TableCell>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-24">
                              <Progress value={percentage}/>
                            </div>
                            <span className="text-sm font-medium text-zinc-100">
                              {row.score}/{row.totalScore}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="success">{row.status}</Badge>
                        </TableCell>
                        <TableCell>{row.timeTaken}</TableCell>
                        <TableCell>
                          {row.violations > 0 ? (<span className="text-amber-400">{row.violations}</span>) : (<span className="text-emerald-400">0</span>)}
                        </TableCell>
                      </TableRow>);
            })}
                </TableBody>
              </Table>) : (<div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/50">
                  <FileText className="h-8 w-8 text-zinc-500"/>
                </div>
                <h3 className="mt-4 text-lg font-medium text-zinc-300">
                  No history yet
                </h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Complete an assessment to see your history here.
                </p>
              </div>)}
          </CardContent>
        </Card>
      </motion.div>
    </div>);
}

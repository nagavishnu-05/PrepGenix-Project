import { Link } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, Calendar, Shield, AlertTriangle, Code, FileText, } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockTests } from "@/lib/mock-data";
import { cn, formatDate, formatDuration, getDifficultyBg } from "@/lib/utils";
export default function TestsPage() {
    const [activeTab, setActiveTab] = useState("all");
    const filteredTests = mockTests.filter((test) => {
        if (activeTab === "all")
            return true;
        return test.status === activeTab;
    });
    const statusVariant = (status) => {
        switch (status) {
            case "active":
                return "success";
            case "upcoming":
                return "info";
            case "completed":
                return "secondary";
            default:
                return "secondary";
        }
    };
    return (<div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-zinc-100">My Assessments</h1>
        <p className="text-zinc-400">Browse and take available coding assessments.</p>
      </motion.div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredTests.map((test, i) => (<motion.div key={test.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.4 }}>
                <Card className="group h-full transition-all hover:border-zinc-700">
                  <CardContent className="flex h-full flex-col p-6">
                    <div className="flex-1 space-y-4">
                      <div className="flex items-start justify-between">
                        <h3 className="text-lg font-semibold text-zinc-100 group-hover:text-white">
                          {test.title}
                        </h3>
                        <Badge variant={statusVariant(test.status)}>
                          {test.status}
                        </Badge>
                      </div>

                      <p className="text-sm text-zinc-400 line-clamp-2">
                        {test.description}
                      </p>

                      {/* Difficulty badges */}
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Set(test.questions.map((q) => q.difficulty))).map((diff) => (<span key={diff} className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", getDifficultyBg(diff))}>
                              {diff}
                            </span>))}
                      </div>

                      {/* Meta info */}
                      <div className="grid grid-cols-2 gap-3 text-sm text-zinc-400">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5"/>
                          {formatDuration(test.duration)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Code className="h-3.5 w-3.5"/>
                          {test.questions.length} questions
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5"/>
                          {formatDate(test.startDate)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Shield className="h-3.5 w-3.5"/>
                          {test.totalPoints} pts
                        </div>
                      </div>

                      {test.proctoringEnabled && (<div className="flex items-center gap-1.5 text-xs text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5"/>
                          AI Proctoring Enabled
                        </div>)}
                    </div>

                    <div className="mt-6">
                      {test.status === "active" ? (<Link to={`/assessment/${test.id}`}>
                          <Button variant="gradient" className="w-full">
                            Start Assessment
                          </Button>
                        </Link>) : test.status === "upcoming" ? (<Link to={`/assessment/${test.id}`}>
                          <Button variant="outline" className="w-full">
                            View Details
                          </Button>
                        </Link>) : (<Button variant="secondary" className="w-full">
                          View Results
                        </Button>)}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>))}
          </div>

          {filteredTests.length === 0 && (<div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/50">
                <FileText className="h-8 w-8 text-zinc-500"/>
              </div>
              <h3 className="mt-4 text-lg font-medium text-zinc-300">
                No tests found
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                No assessments match the selected filter.
              </p>
            </div>)}
        </TabsContent>
      </Tabs>
    </div>);
}

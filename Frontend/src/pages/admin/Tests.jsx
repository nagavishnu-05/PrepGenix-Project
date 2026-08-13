import { useState, useMemo } from "react";
import { Plus, Search, Edit3, Trash2, Eye, FileCode, Calendar, Clock, HelpCircle, } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { mockTests } from "@/lib/mock-data";
import { formatDate, formatDuration } from "@/lib/utils";
const statusConfig = {
    draft: { label: "Draft", variant: "secondary" },
    upcoming: { label: "Upcoming", variant: "info" },
    active: { label: "Active", variant: "success" },
    completed: { label: "Completed", variant: "outline" },
    expired: { label: "Expired", variant: "destructive" },
};
export default function ManageTestsPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [activeTab, setActiveTab] = useState("all");
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [selectedTest, setSelectedTest] = useState(null);
    const filteredTests = useMemo(() => {
        let tests = mockTests;
        if (activeTab !== "all") {
            tests = tests.filter((t) => t.status === activeTab);
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            tests = tests.filter((t) => t.title.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q));
        }
        return tests;
    }, [activeTab, searchQuery]);
    const handleDelete = (testId) => {
        setSelectedTest(testId);
        setDeleteDialogOpen(true);
    };
    const confirmDelete = () => {
        setDeleteDialogOpen(false);
        setSelectedTest(null);
    };
    return (<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Manage Tests</h1>
          <p className="text-zinc-400">Create, edit, and manage coding assessments.</p>
        </div>
        <a href="/admin/create-test">
          <Button variant="gradient">
            <Plus className="h-4 w-4"/>
            Create Test
          </Button>
        </a>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/>
              <Input placeholder="Search tests..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9"/>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">
                All
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {mockTests.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="draft">Draft</TabsTrigger>
              <TabsTrigger value="active">
                Active
                <Badge variant="success" className="ml-2 text-[10px]">
                  {mockTests.filter((t) => t.status === "active").length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsContent value={activeTab} className="mt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Test Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Questions</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTests.length === 0 ? (<TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <FileCode className="h-8 w-8 text-zinc-600"/>
                          <p className="text-sm text-zinc-500">No tests found</p>
                        </div>
                      </TableCell>
                    </TableRow>) : (filteredTests.map((test) => {
            const status = statusConfig[test.status];
            return (<TableRow key={test.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-zinc-100">{test.title}</p>
                              <p className="max-w-xs truncate text-xs text-zinc-500">
                                {test.description}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5 text-sm text-zinc-300">
                              <HelpCircle className="h-3.5 w-3.5 text-zinc-500"/>
                              {test.questions.length}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5 text-sm text-zinc-300">
                              <Clock className="h-3.5 w-3.5 text-zinc-500"/>
                              {formatDuration(test.duration)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                              <Calendar className="h-3.5 w-3.5 text-zinc-500"/>
                              {test.startDate ? formatDate(test.startDate) : "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                              <Calendar className="h-3.5 w-3.5 text-zinc-500"/>
                              {test.endDate ? formatDate(test.endDate) : "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye className="h-4 w-4"/>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Edit3 className="h-4 w-4"/>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => handleDelete(test.id)}>
                                <Trash2 className="h-4 w-4"/>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>);
        }))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Test</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this test? This action cannot be undone and will
              remove all associated data including submissions and attempts.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="h-4 w-4"/>
              Delete Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);
}

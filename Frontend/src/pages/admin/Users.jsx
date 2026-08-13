import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Trash2, Edit3, UserCog, Loader2, } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
const ROLE_COLORS = {
    admin: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    candidate: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    interviewer: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};
export default function AdminUsersPage() {
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [showDialog, setShowDialog] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        role: "candidate",
        adminId: "",
        candidateId: "",
    });
    const loadUsers = useCallback(async () => {
        setIsLoading(true);
        try {
            const { api } = await import("@/lib/api");
            const data = await api.admin.users.list();
            setUsers(data);
        }
        catch {
            setUsers([]);
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    useEffect(() => { loadUsers(); }, [loadUsers]);
    const filteredUsers = users.filter((u) => {
        if (!searchQuery)
            return true;
        const q = searchQuery.toLowerCase();
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) ||
            u.adminId?.toLowerCase().includes(q) || u.candidateId?.toLowerCase().includes(q);
    });
    const resetForm = () => {
        setForm({ name: "", email: "", password: "", role: "candidate", adminId: "", candidateId: "" });
        setEditingId(null);
    };
    const openEdit = (u) => {
        setForm({
            name: u.name,
            email: u.email,
            password: "",
            role: u.role,
            adminId: u.adminId || "",
            candidateId: u.candidateId || "",
        });
        setEditingId(u.id);
        setShowDialog(true);
    };
    const handleSave = async () => {
        setSaving(true);
        try {
            const { api } = await import("@/lib/api");
            const role = form.role;
            if (editingId) {
                await api.admin.users.update(editingId, {
                    name: form.name,
                    email: form.email,
                    role,
                    adminId: form.adminId || undefined,
                    candidateId: form.candidateId || undefined,
                });
            }
            else {
                await api.admin.users.create({
                    name: form.name,
                    email: form.email,
                    password: form.password || undefined,
                    role,
                    adminId: form.adminId || undefined,
                    candidateId: form.candidateId || undefined,
                });
            }
            setShowDialog(false);
            resetForm();
            loadUsers();
        }
        catch (e) {
            alert("Failed to save user: " + (e instanceof Error ? e.message : "Unknown error"));
        }
        finally {
            setSaving(false);
        }
    };
    const handleDelete = async (id) => {
        if (!confirm("Delete this user? This cannot be undone."))
            return;
        try {
            const { api } = await import("@/lib/api");
            await api.admin.users.delete(id);
            loadUsers();
        }
        catch {
            alert("Failed to delete user");
        }
    };
    return (<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">User Management</h1>
          <p className="text-zinc-400">Create and manage admin & candidate accounts with manual IDs.</p>
        </div>
        <Button variant="gradient" onClick={() => { resetForm(); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-1"/>
          Add User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/>
            <Input placeholder="Search by name, email, or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9"/>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (<div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-500"/>
            </div>) : (<Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Admin ID</TableHead>
                  <TableHead>Candidate ID</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (<TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <p className="text-sm text-zinc-500">No users found</p>
                    </TableCell>
                  </TableRow>) : (filteredUsers.map((u) => {
                const initials = u.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                return (<TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-gradient-to-br from-violet-600 to-indigo-600 text-xs font-bold text-white">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-zinc-100">{u.name}</p>
                              <p className="text-xs text-zinc-500">{u.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ROLE_COLORS[u.role]}>
                            {u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono text-zinc-300">{u.adminId || "-"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-mono text-zinc-300">{u.candidateId || "-"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-zinc-500">{new Date(u.createdAt).toLocaleDateString()}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}>
                              <Edit3 className="h-4 w-4"/>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => handleDelete(u.id)}>
                              <Trash2 className="h-4 w-4"/>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>);
            }))}
              </TableBody>
            </Table>)}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) {
        setShowDialog(false);
        resetForm();
    } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-100">{editingId ? "Edit User" : "Add New User"}</DialogTitle>
            <DialogDescription>Set user details including custom admin/candidate IDs.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Full Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe"/>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Email</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com"/>
            </div>
            {!editingId && (<div className="space-y-2">
                <label className="text-xs text-zinc-400">Password</label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters"/>
              </div>)}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100">
                <option value="candidate">Candidate</option>
                <option value="admin">Admin</option>
                <option value="interviewer">Interviewer</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-400">Admin ID (manual)</label>
                <Input value={form.adminId} onChange={(e) => setForm({ ...form, adminId: e.target.value })} placeholder="ADM001" disabled={form.role !== "admin"}/>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-zinc-400">Candidate ID (manual)</label>
                <Input value={form.candidateId} onChange={(e) => setForm({ ...form, candidateId: e.target.value })} placeholder="CAN001" disabled={form.role !== "candidate"}/>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>Cancel</Button>
            <Button variant="gradient" onClick={handleSave} disabled={saving || !form.name || !form.email}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1"/> : <UserCog className="h-4 w-4 mr-1"/>}
              {editingId ? "Update" : "Create"} User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>);
}

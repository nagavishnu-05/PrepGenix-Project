import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

const EMPTY_FIELDS = {
    name: "",
    email: "",
    mobile: "",
    rollNo: "",
    tenth: "",
    twelfth: "",
    cgpa: "",
};

function fieldsFromStudent(student) {
    return Object.fromEntries(
        Object.keys(EMPTY_FIELDS).map((field) => [field, student?.[field] ?? ""])
    );
}

const EDIT_FIELDS = [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "email", label: "Email", type: "email" },
    { key: "mobile", label: "Mobile", type: "tel" },
    { key: "rollNo", label: "Roll number", type: "text" },
    { key: "tenth", label: "10th percentage", type: "text", inputMode: "decimal" },
    { key: "twelfth", label: "12th percentage", type: "text", inputMode: "decimal" },
    { key: "cgpa", label: "CGPA", type: "text", inputMode: "decimal" },
];

export function StudentEditDialog({ student, onClose, onSaved }) {
    const [fields, setFields] = useState(EMPTY_FIELDS);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        setFields(fieldsFromStudent(student));
        setError("");
    }, [student]);

    const save = async (event) => {
        event.preventDefault();
        if (!student) return;

        setSaving(true);
        setError("");
        try {
            const updatedStudent = await api.students.update(student.regNo, {
                ...fields,
                name: fields.name.trim(),
                email: fields.email.trim(),
                mobile: fields.mobile.trim(),
                rollNo: fields.rollNo.trim(),
                tenth: fields.tenth.trim(),
                twelfth: fields.twelfth.trim(),
                cgpa: fields.cgpa.trim(),
            });
            onSaved(updatedStudent);
            onClose();
        } catch (saveError) {
            setError(saveError.message || "Failed to update student.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={Boolean(student)} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit student details</DialogTitle>
                    <DialogDescription>
                        Update profile and academic details. Registration number, batch, and password are not changed here.
                    </DialogDescription>
                </DialogHeader>

                {student && (
                    <form onSubmit={save} className="space-y-5">
                        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/50 sm:grid-cols-2">
                            <div>
                                <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Registration number</p>
                                <p className="mt-1 break-all text-sm font-semibold text-slate-800 dark:text-zinc-100">{student.regNo}</p>
                            </div>
                            <div>
                                <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">Batch (unchanged)</p>
                                <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-zinc-100">{student.batch || "Unassigned"}</p>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            {EDIT_FIELDS.map(({ key, label, type, required, inputMode }) => (
                                <div key={key} className={key === "name" || key === "email" ? "space-y-1.5 sm:col-span-1" : "space-y-1.5"}>
                                    <Label htmlFor={`student-edit-${key}`}>{label}{required ? " *" : ""}</Label>
                                    <Input
                                        id={`student-edit-${key}`}
                                        type={type}
                                        inputMode={inputMode}
                                        autoComplete={key === "email" ? "email" : key === "mobile" ? "tel" : "off"}
                                        required={required}
                                        value={fields[key]}
                                        onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))}
                                    />
                                </div>
                            ))}
                        </div>

                        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                            <Button type="submit" disabled={saving || !fields.name.trim()}>
                                {saving ? "Saving..." : "Save changes"}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

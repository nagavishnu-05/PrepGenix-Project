import { useEffect, useState } from "react";
import { AlertCircle, BrainCircuit, Code2, Trophy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, SimpleProgress } from "@/components/portal/primitives";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAvatarImage } from "@/lib/avatar-options";
import { api } from "@/lib/api";

const categories = [
    { key: "overall", title: "Overall", description: "Average across aptitude and coding tests", icon: Trophy, color: "text-amber-500", bar: "from-amber-500 to-orange-400" },
    { key: "aptitude", title: "Aptitude", description: "Average across aptitude tests", icon: BrainCircuit, color: "text-emerald-500", bar: "from-emerald-500 to-teal-400" },
    { key: "coding", title: "Coding", description: "Average across coding tests", icon: Code2, color: "text-violet-500", bar: "from-violet-600 to-indigo-500" },
];

function RankingSummary({ category, ranking }) {
    const Icon = category.icon;
    const hasRank = ranking?.rank != null;
    return (
        <Card className="border-slate-200/80 bg-white/70 dark:border-zinc-800/80 dark:bg-zinc-900/40">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-slate-600 dark:text-zinc-300">
                    <Icon className={`h-4 w-4 ${category.color}`} />
                    {category.title}
                </CardTitle>
                <p className="text-xs text-slate-500 dark:text-zinc-500">{category.description}</p>
            </CardHeader>
            <CardContent>
                <div className="flex items-baseline justify-between gap-2">
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">
                        {hasRank ? `#${ranking.rank}` : "—"}
                    </p>
                    <p className="text-xl font-semibold text-slate-800 dark:text-zinc-100">{hasRank ? `${ranking.average}%` : "No score"}</p>
                </div>
                {hasRank && <SimpleProgress value={ranking.average} className={`mt-3 [&>div]:bg-gradient-to-r ${category.bar}`} />}
                <p className="mt-2 text-xs text-slate-500 dark:text-zinc-500">
                    {hasRank ? `Ranked ${ranking.participants} of ${ranking.studentCount} students` : `${ranking?.participants || 0} of ${ranking?.studentCount || 0} students ranked`}
                    {` · ${ranking?.testsTaken || 0} completed ${ranking?.testsTaken === 1 ? "test" : "tests"}`}
                </p>
            </CardContent>
        </Card>
    );
}

function RankingsTable({ category, ranking }) {
    const entries = ranking?.entries || [];
    return (
        <Card className="border-slate-200/80 bg-white/70 dark:border-zinc-800/80 dark:bg-zinc-900/40">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
                <div>
                    <CardTitle className="text-base">{category.title} Rankings</CardTitle>
                    <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
                        Ranked by average score · {ranking?.participants || 0} ranked of {ranking?.studentCount || 0} students
                    </p>
                </div>
                <TabsList aria-label="Select ranking category">
                    {categories.map((item) => (
                        <TabsTrigger key={item.key} value={item.key}>{item.title}</TabsTrigger>
                    ))}
                </TabsList>
            </CardHeader>
            <CardContent>
                {entries.length === 0 ? (
                    <p className="py-12 text-center text-sm text-slate-500 dark:text-zinc-500">No student results are available yet.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-20">Rank</TableHead>
                                <TableHead>Student</TableHead>
                                <TableHead className="text-right">Tests</TableHead>
                                <TableHead className="w-48 text-right">Average</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {entries.map((entry, index) => (
                                <TableRow
                                    key={`${entry.name}-${index}`}
                                    className={entry.isCurrentUser ? "bg-violet-50 dark:bg-violet-500/10" : ""}
                                >
                                    <TableCell className="font-semibold text-slate-800 dark:text-zinc-200">
                                        {entry.rank == null ? "—" : `#${entry.rank}`}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex min-w-0 items-center gap-3">
                                            <Avatar className="h-9 w-9 shrink-0">
                                                {getAvatarImage(entry.avatar) && <AvatarImage src={getAvatarImage(entry.avatar)} alt="" />}
                                                <AvatarFallback>{entry.name?.slice(0, 1)?.toUpperCase() || "?"}</AvatarFallback>
                                            </Avatar>
                                            <span className="truncate font-medium text-slate-800 dark:text-zinc-200">
                                                {entry.name}
                                                {entry.isCurrentUser && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">YOU</span>}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">{entry.testsTaken}</TableCell>
                                    <TableCell className="text-right">
                                        {entry.average == null ? (
                                            <span className="text-slate-400 dark:text-zinc-500">Not ranked</span>
                                        ) : (
                                            <span className="font-semibold text-slate-900 dark:text-white">{entry.average}%</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    );
}

export default function StudentRankings() {
    const [rankings, setRankings] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState("overall");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        api.reports.rankings()
            .then((data) => {
                if (active) setRankings(data.rankings);
            })
            .catch((err) => {
                if (active) setError(err.message || "Unable to load rankings.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, []);

    const selected = categories.find((category) => category.key === selectedCategory) || categories[0];

    return (
        <div className="space-y-6">
            <PageHeader title="Rankings" description="Compare your overall, aptitude, and coding averages with all students." />
            {loading ? (
                <div className="space-y-6" aria-label="Loading rankings">
                    <div className="grid gap-4 md:grid-cols-3">{categories.map((category) => <Card key={category.key} className="h-40 animate-pulse bg-slate-100 dark:bg-zinc-900/50" />)}</div>
                    <Card className="h-96 animate-pulse bg-slate-100 dark:bg-zinc-900/50" />
                </div>
            ) : error ? (
                <Card role="alert" className="border-red-200 bg-red-50/70 dark:border-red-500/20 dark:bg-red-500/5">
                    <CardContent className="flex items-center gap-3 py-6 text-sm text-red-700 dark:text-red-300">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        {error}
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="grid gap-4 md:grid-cols-3">
                        {categories.map((category) => (
                            <RankingSummary key={category.key} category={category} ranking={rankings?.[category.key]} />
                        ))}
                    </div>
                    <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
                        <RankingsTable category={selected} ranking={rankings?.[selectedCategory]} />
                    </Tabs>
                </>
            )}
        </div>
    );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACCENTS = {
    violet: "from-violet-600 to-indigo-600",
    emerald: "from-emerald-600 to-teal-600",
    amber: "from-amber-500 to-orange-500",
    blue: "from-blue-600 to-cyan-600",
    rose: "from-rose-500 to-pink-600",
};

export function StatsCard({ title, value, sub, icon: Icon, accent = "violet" }) {
    return (
        <Card className="border-zinc-800/80 bg-zinc-900/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">{title}</CardTitle>
                {Icon && (
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${ACCENTS[accent] || ACCENTS.violet}`}>
                        <Icon className="h-4.5 w-4.5 text-white" />
                    </div>
                )}
            </CardHeader>
            <CardContent>
                <div className="text-3xl font-bold text-white">{value}</div>
                {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
            </CardContent>
        </Card>
    );
}

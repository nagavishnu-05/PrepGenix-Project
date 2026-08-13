import { motion } from "framer-motion";
const stats = [
    {
        value: "10K+",
        label: "Tests Completed",
        gradient: "from-violet-600/20 to-indigo-600/20",
        border: "border-violet-500/20",
        text: "text-violet-400",
    },
    {
        value: "500+",
        label: "Companies",
        gradient: "from-emerald-600/20 to-teal-600/20",
        border: "border-emerald-500/20",
        text: "text-emerald-400",
    },
    {
        value: "25+",
        label: "Languages",
        gradient: "from-blue-600/20 to-cyan-600/20",
        border: "border-blue-500/20",
        text: "text-blue-400",
    },
    {
        value: "99.9%",
        label: "Uptime",
        gradient: "from-amber-600/20 to-orange-600/20",
        border: "border-amber-500/20",
        text: "text-amber-400",
    },
];
export function StatsSection() {
    return (<section className="relative py-24">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }} className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {stats.map((stat, index) => (<motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.1, duration: 0.5 }} className={`group relative overflow-hidden rounded-2xl border ${stat.border} bg-gradient-to-br ${stat.gradient} p-8 text-center backdrop-blur-xl transition-all duration-300 hover:scale-[1.02]`}>
              <div className="absolute inset-0 bg-zinc-950/40"/>
              <div className="relative">
                <motion.div initial={{ scale: 0.5, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 + index * 0.1, duration: 0.5 }} className={`text-4xl font-bold tracking-tight ${stat.text} sm:text-5xl`}>
                  {stat.value}
                </motion.div>
                <p className="mt-2 text-sm font-medium text-zinc-400">
                  {stat.label}
                </p>
              </div>
            </motion.div>))}
        </motion.div>
      </div>
    </section>);
}

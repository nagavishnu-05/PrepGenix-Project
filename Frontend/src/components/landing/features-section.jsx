import { motion } from "framer-motion";
import { Shield, Play, BarChart3, Lock, FileText, Trophy, } from "lucide-react";
import { cn } from "@/lib/utils";
const features = [
    {
        icon: Shield,
        title: "AI Proctoring",
        description: "Advanced AI monitoring ensures assessment integrity with real-time face detection, tab switching alerts, and behavioral analysis.",
        gradient: "from-violet-500/10 to-indigo-500/10 dark:from-violet-500/20 dark:to-indigo-500/20",
        iconColor: "text-violet-600 dark:text-violet-400",
        borderHover: "hover:border-violet-500/30",
    },
    {
        icon: Play,
        title: "Code Execution",
        description: "Support for 20+ programming languages with sandboxed execution, custom test cases, and instant compilation feedback.",
        gradient: "from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/20 dark:to-teal-500/20",
        iconColor: "text-emerald-650 dark:text-emerald-400",
        borderHover: "hover:border-emerald-500/30",
    },
    {
        icon: BarChart3,
        title: "Real-time Analytics",
        description: "Comprehensive performance insights with time tracking, code quality metrics, and detailed submission history.",
        gradient: "from-blue-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:to-cyan-500/20",
        iconColor: "text-blue-600 dark:text-blue-400",
        borderHover: "hover:border-blue-500/30",
    },
    {
        icon: Lock,
        title: "Secure Browser",
        description: "Enterprise-grade security features including fullscreen mode, clipboard restrictions, and browser lockdown.",
        gradient: "from-amber-500/10 to-orange-500/10 dark:from-amber-500/20 dark:to-orange-500/20",
        iconColor: "text-amber-600 dark:text-amber-400",
        borderHover: "hover:border-amber-500/30",
    },
    {
        icon: FileText,
        title: "Smart Reports",
        description: "AI-generated detailed reports with skill assessments, improvement recommendations, and comparative analysis.",
        gradient: "from-pink-500/10 to-rose-500/10 dark:from-pink-500/20 dark:to-rose-500/20",
        iconColor: "text-pink-600 dark:text-pink-400",
        borderHover: "hover:border-pink-500/30",
    },
    {
        icon: Trophy,
        title: "Global Leaderboard",
        description: "Compete with developers worldwide, track rankings across categories, and showcase verified achievements.",
        gradient: "from-red-500/10 to-rose-500/10 dark:from-red-500/20 dark:to-rose-500/20",
        iconColor: "text-red-600 dark:text-red-400",
        borderHover: "hover:border-red-500/30",
    },
];
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 },
    },
};
const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
    },
};
export function FeaturesSection() {
    return (<section className="relative py-24">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-500/5 dark:from-zinc-900 via-transparent to-transparent"/>

      <div className="relative mx-auto max-w-6xl px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.6 }} className="mb-16 text-center">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white sm:text-4xl">
            Why{" "}
            <span className="bg-gradient-to-r from-violet-600 to-indigo-650 dark:from-violet-400 dark:to-indigo-400 bg-clip-text text-transparent">
              PrepGenix
            </span>
            ?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-550 dark:text-zinc-400 font-medium">
            Everything you need to run world-class coding assessments, from
            creation to evaluation.
          </p>
        </motion.div>

        <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (<motion.div key={feature.title} variants={itemVariants} whileHover={{ y: -4, transition: { duration: 0.2 } }} className={cn("group relative rounded-2xl border border-slate-200/80 dark:border-zinc-800/60 bg-white/70 dark:bg-zinc-900/40 p-7 backdrop-blur-xl transition-all duration-300", feature.borderHover)}>
                <div className={cn("mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br", feature.gradient)}>
                  <Icon className={cn("h-6 w-6", feature.iconColor)}/>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-zinc-100">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-655 dark:text-zinc-400">
                  {feature.description}
                </p>
              </motion.div>);
          })}
        </motion.div>
      </div>
    </section>);
}

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
const floatingCodeSnippets = [
    { text: "const solve = (arr) => {", x: "8%", y: "20%", delay: 0 },
    { text: "  return arr.sort()", x: "82%", y: "15%", delay: 0.4 },
    { text: "    .filter(n => n > 0)", x: "5%", y: "70%", delay: 0.8 },
    { text: "}", x: "85%", y: "65%", delay: 1.2 },
    { text: "// O(n log n)", x: "12%", y: "45%", delay: 0.6 },
    { text: "assert(result === 42)", x: "78%", y: "42%", delay: 1.0 },
];
export function HeroSection() {
    return (<section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-violet-600/10 via-transparent to-transparent"/>
        <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 bg-gradient-to-b from-violet-500/8 to-transparent blur-3xl"/>
        <div className="absolute bottom-0 left-1/4 h-[400px] w-[600px] bg-gradient-to-t from-indigo-500/5 to-transparent blur-3xl"/>
      </div>

      {floatingCodeSnippets.map((snippet, i) => (<motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 + snippet.delay, duration: 0.8 }} className="absolute hidden font-mono text-xs text-zinc-700/60 lg:block" style={{ left: snippet.x, top: snippet.y }}>
          <motion.div animate={{ y: [0, -8, 0] }} transition={{
                duration: 4 + i * 0.5,
                repeat: Infinity,
                ease: "easeInOut",
            }} className="rounded-lg border border-zinc-800/40 bg-zinc-900/40 px-3 py-1.5 backdrop-blur-sm">
            {snippet.text}
          </motion.div>
        </motion.div>))}

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 text-sm text-violet-300 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75"/>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500"/>
            </span>
            AI-Powered Assessment Engine v2.0
          </div>
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.4, 0, 0.2, 1] }} className="text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">
          AI-Powered Coding
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Assessment Platform
          </span>
        </motion.h1>

        <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3, ease: [0.4, 0, 0.2, 1] }} className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
          Evaluate developers with precision. Real-time AI proctoring, 20+
          language support, comprehensive analytics, and enterprise-grade security
          — all in one platform.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.45, ease: [0.4, 0, 0.2, 1] }} className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link to="/dashboard">
            <Button variant="gradient" size="xl" className="group">
              Start Free Assessment
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1"/>
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="outline" size="xl" className="group">
              <Play className="h-4 w-4"/>
              View Demo
            </Button>
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.6, ease: [0.4, 0, 0.2, 1] }} className="mx-auto mt-16 max-w-3xl">
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-1 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center gap-2 rounded-xl border-b border-zinc-800/40 bg-zinc-950/60 px-4 py-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-red-500/80"/>
                <div className="h-3 w-3 rounded-full bg-yellow-500/80"/>
                <div className="h-3 w-3 rounded-full bg-green-500/80"/>
              </div>
              <span className="ml-2 text-xs text-zinc-600">
                assessment.py — CodeAssess Editor
              </span>
            </div>
            <div className="p-6 font-mono text-sm leading-relaxed">
              <div>
                <span className="text-violet-400">class</span>{" "}
                <span className="text-emerald-400">Solution</span>
                <span className="text-zinc-500">:</span>
              </div>
              <div className="pl-4">
                <span className="text-violet-400">def</span>{" "}
                <span className="text-amber-400">twoSum</span>
                <span className="text-zinc-400">(self, nums, target):</span>
              </div>
              <div className="pl-8">
                <span className="text-zinc-500"># AI-powered analysis active</span>
              </div>
              <div className="pl-8">
                <span className="text-violet-400">for</span>{" "}
                <span className="text-zinc-300">i, num</span>{" "}
                <span className="text-violet-400">in</span>{" "}
                <span className="text-zinc-300">
                  enumerate(nums):
                </span>
              </div>
              <div className="pl-12">
                <span className="text-zinc-300">complement = target - num</span>
              </div>
              <div className="pl-12">
                <span className="text-violet-400">if</span>{" "}
                <span className="text-zinc-300">complement</span>{" "}
                <span className="text-violet-400">in</span>{" "}
                <span className="text-zinc-300">seen:</span>
              </div>
              <div className="pl-16">
                <span className="text-violet-400">return</span>{" "}
                <span className="text-zinc-300">[seen[complement], i]</span>
              </div>
              <div className="pl-12">
                <span className="text-zinc-300">seen[num] = i</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span className="text-xs text-emerald-400/80">
                  All 47 test cases passed
                </span>
                <span className="ml-2 text-xs text-zinc-600">|</span>
                <span className="ml-2 text-xs text-zinc-500">
                  Proctoring: No violations detected
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>);
}

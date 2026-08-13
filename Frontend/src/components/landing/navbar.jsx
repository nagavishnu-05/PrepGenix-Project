import { Link } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { Menu, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
const navLinks = [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "About", href: "#about" },
    { label: "Documentation", href: "#docs" },
];
export function Navbar() {
    const [mobileOpen, setMobileOpen] = useState(false);
    return (<header className="sticky top-0 z-50 border-b border-zinc-800/40 bg-background/60 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/20">
            <Shield className="h-4.5 w-4.5 text-white"/>
          </div>
          <span className="bg-gradient-to-r from-zinc-100 to-zinc-300 bg-clip-text text-lg font-bold text-transparent">
            CodeAssess
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (<a key={link.label} href={link.href} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200">
              {link.label}
            </a>))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link to="/login">
            <Button variant="ghost" size="sm">
              Sign In
            </Button>
          </Link>
          <Link to="/dashboard">
            <Button variant="gradient" size="sm">
              Get Started
            </Button>
          </Link>
        </div>

        <button onClick={() => setMobileOpen(!mobileOpen)} className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 md:hidden">
          {mobileOpen ? (<X className="h-5 w-5"/>) : (<Menu className="h-5 w-5"/>)}
        </button>
      </div>

      {mobileOpen && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="border-t border-zinc-800/40 bg-background/95 backdrop-blur-xl md:hidden">
          <div className="space-y-1 px-6 py-4">
            {navLinks.map((link) => (<a key={link.label} href={link.href} onClick={() => setMobileOpen(false)} className="block rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200">
                {link.label}
              </a>))}
            <div className="flex flex-col gap-2 pt-4">
              <Link to="/login" onClick={() => setMobileOpen(false)}>
                <Button variant="outline" size="sm" className="w-full">
                  Sign In
                </Button>
              </Link>
              <Link to="/dashboard" onClick={() => setMobileOpen(false)}>
                <Button variant="gradient" size="sm" className="w-full">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>)}
    </header>);
}

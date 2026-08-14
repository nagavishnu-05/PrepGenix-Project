import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { Menu, X, Sun, Moon, LayoutDashboard, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/store/ui-store";
import { useAuthStore } from "@/store/auth-store";

export function Navbar({ onSignInClick }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const { theme, toggleTheme } = useUIStore();
    const user = useAuthStore((s) => s.user);
    const navigate = useNavigate();

    const handleDashboardRedirect = () => {
        if (user) {
            navigate(useAuthStore.getState().homeFor(user.role));
        }
    };

    return (
        <header className="sticky top-4 z-50 mx-auto w-[92%] sm:w-[95%] max-w-6xl rounded-2xl border border-slate-200/60 dark:border-zinc-800/30 bg-white/30 dark:bg-zinc-950/30 backdrop-blur-xl shadow-lg transition-colors duration-300">
            <div className="flex h-20 items-center justify-between px-4 sm:px-6">
                
                {/* Left Side: Theme Toggle */}
                <div className="flex items-center">
                    <button
                        onClick={toggleTheme}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-zinc-400 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800 hover:text-slate-950 dark:hover:text-zinc-200 cursor-pointer"
                        title="Toggle theme"
                    >
                        {theme === "dark" ? (
                            <Sun className="h-4.5 w-4.5 text-amber-500" />
                        ) : (
                            <Moon className="h-4.5 w-4.5 text-indigo-600" />
                        )}
                    </button>
                </div>

                {/* Center Block: Centered logos & college title */}
                <div className="flex flex-1 items-center justify-center gap-2 sm:gap-3.5 px-2">
                    {/* VCET Logo */}
                    <img 
                        src="/VCET Logo.jpg" 
                        alt="VCET Logo" 
                        className="h-9 w-9 sm:h-11 sm:w-11 object-contain rounded-full bg-white p-0.5 shadow-sm border border-slate-100" 
                    />
                    
                    {/* College Title & Dept Subtitle */}
                    <div className="flex flex-col text-center">
                        <h1 className="text-[10px] sm:text-[12px] md:text-base font-extrabold tracking-tight text-slate-900 dark:text-zinc-100 uppercase leading-none">
                            Velammal College of Engineering &amp; Technology
                        </h1>
                        <h2 className="text-[9px] sm:text-[11px] font-bold text-violet-600 dark:text-violet-400 tracking-wider uppercase mt-1">
                            Department of CSE
                        </h2>
                    </div>
                    
                    {/* CSE Logo */}
                    <img 
                        src="/CSE LOGO.jpg" 
                        alt="CSE Logo" 
                        className="h-9 w-9 sm:h-11 sm:w-11 object-contain rounded-full bg-white p-0.5 shadow-sm border border-slate-100" 
                    />
                </div>

                {/* Right Side: Access button */}
                <div className="hidden items-center md:flex">
                    {user ? (
                        <Button variant="gradient" size="sm" onClick={handleDashboardRedirect} className="cursor-pointer">
                            <LayoutDashboard className="h-4 w-4 mr-1.5" />
                            Dashboard
                        </Button>
                    ) : (
                        <Button variant="default" size="sm" onClick={onSignInClick} className="cursor-pointer">
                            <KeyRound className="h-4 w-4 mr-1.5" />
                            Sign In
                        </Button>
                    )}
                </div>

                {/* Mobile controls */}
                <div className="flex items-center md:hidden">
                    <button 
                        onClick={() => setMobileOpen(!mobileOpen)} 
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-zinc-400 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
                    >
                        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>
            </div>

            {/* Mobile Expand Menu */}
            {mobileOpen && (
                <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: "auto" }} 
                    exit={{ opacity: 0, height: 0 }} 
                    className="border-t border-slate-200 dark:border-zinc-800/40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md rounded-b-2xl overflow-hidden md:hidden"
                >
                    <div className="px-6 py-4">
                        <div className="flex flex-col gap-2.5">
                            {user ? (
                                <Button variant="gradient" size="sm" className="w-full" onClick={() => { setMobileOpen(false); handleDashboardRedirect(); }}>
                                    <LayoutDashboard className="h-4 w-4 mr-1.5" />
                                    Go to Dashboard
                                </Button>
                            ) : (
                                <Button variant="default" size="sm" className="w-full" onClick={() => { setMobileOpen(false); onSignInClick(); }}>
                                    <KeyRound className="h-4 w-4 mr-1.5" />
                                    Sign In
                                </Button>
                            )}
                        </div>
                    </div>
                </motion.div>
            )}
        </header>
    );
}

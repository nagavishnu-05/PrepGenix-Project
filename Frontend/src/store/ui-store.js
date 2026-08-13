import { create } from "zustand";

const initialTheme = typeof window !== "undefined" ? (localStorage.getItem("theme") || "dark") : "dark";
if (typeof document !== "undefined") {
    if (initialTheme === "dark") {
        document.documentElement.classList.add("dark");
    } else {
        document.documentElement.classList.remove("dark");
    }
}

export const useUIStore = create((set) => ({
    sidebarOpen: true,
    theme: initialTheme,
    commandPaletteOpen: false,
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setTheme: (theme) => {
        if (typeof document !== "undefined") {
            if (theme === "dark") document.documentElement.classList.add("dark");
            else document.documentElement.classList.remove("dark");
            localStorage.setItem("theme", theme);
        }
        set({ theme });
    },
    toggleTheme: () => set((state) => {
        const next = state.theme === "dark" ? "light" : "dark";
        if (typeof document !== "undefined") {
            if (next === "dark") document.documentElement.classList.add("dark");
            else document.documentElement.classList.remove("dark");
            localStorage.setItem("theme", next);
        }
        return { theme: next };
    }),
    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));

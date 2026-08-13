import { create } from "zustand";
import { api } from "@/lib/api";

export const useAuthStore = create((set, get) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isBooting: true,

    login: async (role, username, password) => {
        set({ isBooting: false, isLoading: true });
        try {
            const { token, user } = await api.auth.login(role, username, password);
            localStorage.setItem("auth-token", token);
            set({ user, token, isAuthenticated: true, isLoading: false });
            return user;
        } catch (err) {
            set({ isLoading: false });
            throw new Error(err.message || "Login failed");
        }
    },

    logout: () => {
        localStorage.removeItem("auth-token");
        set({ user: null, token: null, isAuthenticated: false, isBooting: false });
    },

    loadUser: async () => {
        const token = localStorage.getItem("auth-token");
        if (!token) {
            set({ isBooting: false });
            return null;
        }
        try {
            const user = await api.auth.me();
            set({ user, token, isAuthenticated: true, isBooting: false });
            return user;
        } catch {
            localStorage.removeItem("auth-token");
            set({ user: null, token: null, isAuthenticated: false, isBooting: false });
            return null;
        }
    },

    homeFor: (role) => {
        if (role === "staff") return "/staff";
        if (role === "placement") return "/placement";
        return "/student";
    },
}));

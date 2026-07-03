import { create } from "zustand";

interface AuthModalStore {
  isOpen: boolean;
  view: "login" | "register";
  open: (view?: "login" | "register") => void;
  close: () => void;
  setView: (view: "login" | "register") => void;
}

export const useAuthModal = create<AuthModalStore>((set) => ({
  isOpen: false,
  view: "login",
  open: (view = "login") => set({ isOpen: true, view }),
  close: () => set({ isOpen: false }),
  setView: (view) => set({ view }),
}));

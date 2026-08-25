import { create } from "zustand";

interface AppStore {
  toast: { message: string; type: "success" | "error" | "info"; visible: boolean };
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  hideToast: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  toast: { message: "", type: "info", visible: false },
  showToast: (message, type = "info") => {
    set({ toast: { message, type, visible: true } });
    setTimeout(() => set({ toast: { message: "", type: "info", visible: false } }), 4000);
  },
  hideToast: () => set({ toast: { message: "", type: "info", visible: false } }),
}));

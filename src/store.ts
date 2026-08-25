import { create } from "zustand";

interface AppStore {
  toast: { message: string; type: "success" | "error" | "info"; visible: boolean };
  showToast: (
    messageOrToast: string | { message: string; type?: "success" | "error" | "info" },
    type?: "success" | "error" | "info"
  ) => void;
  hideToast: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  toast: { message: "", type: "info", visible: false },
  showToast: (messageOrToast, type = "info") => {
    const message = typeof messageOrToast === "string" ? messageOrToast : messageOrToast.message;
    const toastType = typeof messageOrToast === "string" ? type : (messageOrToast.type || "info");
    set({ toast: { message, type: toastType, visible: true } });
    setTimeout(() => set({ toast: { message: "", type: "info", visible: false } }), 4000);
  },
  hideToast: () => set({ toast: { message: "", type: "info", visible: false } }),
}));

import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  kind: 'error' | 'success' | 'info'
}

interface ToastStore {
  toasts: Toast[]
  addToast: (message: string, kind?: Toast['kind']) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  addToast: (message, kind = 'info') => {
    const id = crypto.randomUUID()
    set({ toasts: [...get().toasts, { id, message, kind }] })
    // Auto-dismiss after 5 seconds
    setTimeout(() => get().removeToast(id), 5000)
  },

  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

/** Convenience helpers */
export function toastError(message: string) {
  useToastStore.getState().addToast(message, 'error')
}

export function toastSuccess(message: string) {
  useToastStore.getState().addToast(message, 'success')
}

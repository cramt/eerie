import { contextBridge, ipcRenderer } from 'electron'

/** The API exposed to the renderer via window.eerie */
export interface EerieAPI {
  daemon: {
    call: (method: string, params: unknown) => Promise<unknown>
  }
  file: {
    read: (path: string) => Promise<string>
    write: (path: string, content: string) => Promise<boolean>
  }
  dialog: {
    open: () => Promise<string | null>
    save: (defaultPath?: string) => Promise<string | null>
  }
}

contextBridge.exposeInMainWorld('eerie', {
  daemon: {
    call: (method: string, params: unknown) =>
      ipcRenderer.invoke('daemon:call', method, params),
  },
  file: {
    read: (path: string) => ipcRenderer.invoke('file:read', path),
    write: (path: string, content: string) => ipcRenderer.invoke('file:write', path, content),
  },
  dialog: {
    open: () => ipcRenderer.invoke('dialog:open'),
    save: (defaultPath?: string) => ipcRenderer.invoke('dialog:save', defaultPath),
  },
} satisfies EerieAPI)

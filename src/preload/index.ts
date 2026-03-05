import { contextBridge, ipcRenderer } from 'electron'

/** The API exposed to the renderer via window.eerie */
export interface EerieAPI {
  daemon: {
    ping: () => Promise<string | null>
    connected: () => Promise<boolean>
  }
  sim: {
    dc: (netlist: unknown) => Promise<unknown>
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
    ping: () => ipcRenderer.invoke('daemon:ping'),
    connected: () => ipcRenderer.invoke('daemon:connected'),
  },
  sim: {
    dc: (netlist: unknown) => ipcRenderer.invoke('sim:dc', netlist),
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

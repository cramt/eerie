/// <reference types="vite/client" />

// File System Access API (not yet in default TS lib)
interface FileSystemFileHandle {
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritableFileStream>
  readonly name: string
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | ArrayBuffer | Blob): Promise<void>
  close(): Promise<void>
}

interface OpenFilePickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[]
  multiple?: boolean
}

interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description: string; accept: Record<string, string[]> }[]
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>
}

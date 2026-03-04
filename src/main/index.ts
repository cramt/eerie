import WebSocket from "ws";
// Polyfill WebSocket for Node.js (roam-ws needs it as a global)
Object.assign(globalThis, { WebSocket });

import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { join } from "path";
import { readFile, writeFile } from "fs/promises";
import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";
import {
  connectEerieDaemon,
  EerieDaemonClient,
} from "../codegen/generated-rpc";

let mainWindow: BrowserWindow | null = null;
let daemonProcess: ChildProcess | null = null;
let daemonClient: EerieDaemonClient | null = null;

// ── Daemon management ──────────────────────────────────────────────────────

async function startDaemon() {
  const daemonBin = app.isPackaged
    ? join(process.resourcesPath, "eerie-daemon")
    : join(__dirname, "../../target/debug/eerie-daemon");

  try {
    daemonProcess = spawn(daemonBin, [], {
      stdio: ["ignore", "pipe", "inherit"],
    });

    const port = await readDaemonPort(daemonProcess);
    daemonClient = await connectEerieDaemon(`127.0.0.1:${port}`);
    console.log(`Connected to eerie-daemon on port ${port}`);

    // Notify renderer that daemon is connected
    mainWindow?.webContents.send("daemon:status", true);

    daemonProcess.on("exit", (code) => {
      console.log(`eerie-daemon exited with code ${code}`);
      daemonProcess = null;
      daemonClient = null;
      mainWindow?.webContents.send("daemon:status", false);
    });
  } catch (err) {
    console.warn("Could not start eerie-daemon:", err);
    mainWindow?.webContents.send("daemon:status", false);
  }
}

function readDaemonPort(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: child.stdout! });
    rl.once("line", (line) => {
      rl.close();
      const m = line.match(/^PORT (\d+)$/);
      if (m) resolve(Number(m[1]));
      else reject(new Error(`unexpected daemon output: ${line}`));
    });
    child.on("exit", () =>
      reject(new Error("daemon exited before announcing port")),
    );
  });
}

// ── Window ─────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#0f111a",
    titleBarStyle: "default",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow!.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// ── IPC handlers ───────────────────────────────────────────────────────────

function setupIpcHandlers() {
  ipcMain.handle("daemon:call", async (_event, method: string, params: unknown) => {
    if (!daemonClient) throw new Error("daemon not connected");
    const fn = (daemonClient as unknown as Record<string, unknown>)[method];
    if (typeof fn !== "function") throw new Error(`unknown daemon method: ${method}`);
    return await (fn as Function).call(daemonClient, params);
  });

  ipcMain.handle("daemon:connected", () => {
    return daemonClient !== null;
  });

  ipcMain.handle("file:read", async (_event, path: string) => {
    return await readFile(path, "utf-8");
  });

  ipcMain.handle("file:write", async (_event, path: string, content: string) => {
    await writeFile(path, content, "utf-8");
    return true;
  });

  ipcMain.handle("dialog:open", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [
        { name: "Eerie Circuit", extensions: ["eerie"] },
        { name: "All Files", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("dialog:save", async (_event, defaultPath?: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: [
        { name: "Eerie Circuit", extensions: ["eerie"] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });
}

// ── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();

  // Fire-and-forget: daemon starts in background, doesn't block the window
  startDaemon();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  daemonProcess?.kill();
  if (process.platform !== "darwin") app.quit();
});

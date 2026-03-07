import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { join, resolve, extname } from "path";
import { readFile, writeFile } from "fs/promises";
import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";
import { watch, type FSWatcher } from "fs";
import {
  connectEerieDaemon,
  EerieDaemonClient,
} from "../codegen/generated-rpc";
import type { Netlist } from "../codegen/types";

const isDev = !app.isPackaged;

const ALLOWED_EXTENSIONS = new Set([".eerie", ".yaml", ".yml"]);

function validateFilePath(filePath: string): void {
  const resolved = resolve(filePath);
  const ext = extname(resolved);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`File access denied: only ${[...ALLOWED_EXTENSIONS].join(", ")} files are allowed`);
  }
}

let mainWindow: BrowserWindow | null = null;
let daemonProcess: ChildProcess | null = null;
let daemonClient: EerieDaemonClient | null = null;
let rustWatchers: FSWatcher[] = [];

// ── Daemon management ──────────────────────────────────────────────────────

function getDaemonBinPath(): string {
  return process.env["EERIE_DAEMON_BIN"]
    ?? (app.isPackaged
      ? join(process.resourcesPath, "eerie-daemon")
      : join(__dirname, "../../target/debug/eerie-daemon"));
}

async function startDaemon() {
  const daemonBin = getDaemonBinPath();

  try {
    if (isDev) {
      const workerCmd = "cargo run -p eerie-daemon --bin eerie-worker --";
      console.log("[dev] Starting daemon via cargo run...");
      daemonProcess = spawn("cargo", ["run", "-p", "eerie-daemon", "--bin", "eerie-daemon"], {
        stdio: ["ignore", "pipe", "inherit"],
        env: { ...process.env, EERIE_WORKER_CMD: workerCmd },
      });
    } else {
      const workerBin = join(process.resourcesPath, "eerie-worker");
      daemonProcess = spawn(daemonBin, [], {
        stdio: ["ignore", "pipe", "inherit"],
        env: { ...process.env, EERIE_WORKER_CMD: workerBin },
      });
    }

    const port = await readDaemonPort(daemonProcess);
    daemonClient = await connectEerieDaemon(`127.0.0.1:${port}`);
    console.log(`Connected to eerie-daemon on port ${port}`);

    // Notify renderer that daemon is connected
    mainWindow?.webContents.send("daemon:status", true);

    daemonProcess.on("exit", (code) => {
      console.log(`eerie-daemon exited with code ${code}`);
      daemonProcess = null;
      daemonClient = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("daemon:status", false);
      }
    });
  } catch (err) {
    console.warn("Could not start eerie-daemon:", err);
    mainWindow?.webContents.send("daemon:status", false);
  }
}

async function restartDaemon() {
  console.log("[dev] Rust source changed — restarting daemon...");
  if (daemonProcess) {
    daemonProcess.kill();
    daemonProcess = null;
    daemonClient = null;
  }
  await startDaemon();
}

function watchRustSources() {
  if (!isDev) return;

  const rootDir = join(__dirname, "../..");
  const srcDirs = ["eerie-core/src", "eerie-daemon/src", "eerie-rpc/src"];
  let debounce: ReturnType<typeof setTimeout> | null = null;

  for (const dir of srcDirs) {
    try {
      const w = watch(join(rootDir, dir), { recursive: true }, (_event, filename) => {
        if (!filename?.endsWith(".rs")) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => restartDaemon(), 300);
      });
      rustWatchers.push(w);
    } catch {
      console.warn(`[dev] Could not watch ${dir}`);
    }
  }
  console.log("[dev] Watching Rust sources — daemon will auto-restart on changes");
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
  ipcMain.handle("daemon:ping", async () => {
    if (!daemonClient) return null;
    return await daemonClient.ping();
  });

  ipcMain.handle("daemon:connected", () => {
    return daemonClient !== null;
  });

  ipcMain.handle("sim:run", async (_event, netlist: Netlist) => {
    if (!daemonClient) throw new Error("daemon not connected");
    return await daemonClient.simulate(netlist);
  });

  ipcMain.handle("file:read", async (_event, path: string) => {
    validateFilePath(path);
    return await readFile(path, "utf-8");
  });

  ipcMain.handle("file:write", async (_event, path: string, content: string) => {
    validateFilePath(path);
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
  watchRustSources();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  rustWatchers.forEach(w => w.close());
  daemonProcess?.kill();
  if (process.platform !== "darwin") app.quit();
});

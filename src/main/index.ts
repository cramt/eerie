import { app, BrowserWindow, ipcMain, shell, dialog } from "electron";
import { join } from "path";
import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";
import {
  connectEerieDaemon,
  EerieDaemonClient,
} from "../renderer/src/types/generated-rpc";

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

    // The daemon prints "PORT <n>" on the first stdout line.
    const port = await readDaemonPort(daemonProcess);

    daemonClient = await connectEerieDaemon(`127.0.0.1:${port}`);
    console.log(`Connected to eerie-daemon on port ${port}`);

    daemonProcess.on("exit", (code) => {
      console.log(`eerie-daemon exited with code ${code}`);
      daemonProcess = null;
      daemonClient = null;
    });
  } catch (err) {
    console.warn("Could not start eerie-daemon:", err);
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

function requireClient(): EerieDaemonClient {
  if (!daemonClient) throw new Error("daemon not connected");
  return daemonClient;
}

ipcMain.handle("daemon:ping", async () => {
  return requireClient().ping().send();
});

ipcMain.handle("daemon:fileRead", async (_e, path: string) => {
  const result = await requireClient().fileRead(path).send();
  if (!result.ok) throw new Error(result.error);
  return result.value;
});

ipcMain.handle(
  "daemon:fileWrite",
  async (_e, path: string, content: string) => {
    const result = await requireClient().fileWrite(path, content).send();
    if (!result.ok) throw new Error(result.error);
  },
);

ipcMain.handle("daemon:circuitParseYaml", async (_e, yaml: string) => {
  const result = await requireClient().circuitParseYaml(yaml).send();
  if (!result.ok) throw new Error(result.error);
  return result.value;
});

ipcMain.handle("daemon:circuitToYaml", async (_e, circuit: unknown) => {
  const result = await requireClient()
    .circuitToYaml(circuit as never)
    .send();
  if (!result.ok) throw new Error(result.error);
  return result.value;
});

ipcMain.handle("daemon:circuitNew", async (_e, name: string) => {
  const result = await requireClient().circuitNew(name).send();
  if (!result.ok) throw new Error(result.error);
  return result.value;
});

ipcMain.handle("daemon:simDc", async (_e, circuit: unknown) => {
  const result = await requireClient()
    .simDc(circuit as never)
    .send();
  if (!result.ok) throw new Error(result.error);
  return result.value;
});

ipcMain.handle("dialog:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [
      { name: "Eerie Circuits", extensions: ["eerie", "yaml", "yml"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("dialog:save", async (_e, defaultPath?: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultPath ?? "untitled.eerie",
    filters: [{ name: "Eerie Circuits", extensions: ["eerie"] }],
  });
  return result.canceled ? null : result.filePath;
});

// ── App lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await startDaemon();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  daemonProcess?.kill();
  if (process.platform !== "darwin") app.quit();
});

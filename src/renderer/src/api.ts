import {
  EerieServiceClient,
  connectEerieService,
  type EerieServiceCaller,
  type SimResult,
  type Netlist,
  type Capabilities,
} from "../../codegen/generated-rpc";

export type { SimResult, Netlist, Capabilities };

export type SimulateResponse =
  | { ok: true; value: SimResult }
  | { ok: false; error: { message: string } };

// ── Runtime mode detection ─────────────────────────────────────────────────
// VITE_MODE is set at build time to "native" or "wasm".
// In native mode, the vite dev server proxies /rpc to the daemon.
// In production native builds, the daemon serves the frontend itself.

const VITE_MODE = import.meta.env.VITE_MODE as "native" | "wasm";

// ── Connect to backend ─────────────────────────────────────────────────────

let clientPromise: Promise<EerieServiceCaller> | null = null;

function getClient(): Promise<EerieServiceCaller> {
  if (clientPromise) return clientPromise;

  if (VITE_MODE === "native") {
    const url = `ws://${location.host}/rpc`;
    console.log(`[eerie] native mode — connecting to ${url}`);
    clientPromise = connectEerieService(url);
  } else {
    console.log(
      "[eerie] WASM mode — simulation runs in browser via roam inprocess",
    );
    clientPromise = connectWasm();
  }

  return clientPromise;
}

async function connectWasm(): Promise<EerieServiceCaller> {
  const [
    wasmMod,
    { InProcessTransport },
    { helloExchangeInitiator, defaultHello },
  ] = await Promise.all([
    import("eerie-wasm"),
    import("@bearcove/roam-inprocess"),
    import("@bearcove/roam-core"),
  ]);

  // wasm-pack --target web requires explicit initialization
  await wasmMod.default();

  let rustLink: { deliver(payload: Uint8Array): void } | null = null;
  const transport = new InProcessTransport((payload: Uint8Array) => {
    if (!rustLink) throw new Error("rustLink not initialized");
    rustLink.deliver(payload);
  });
  rustLink = wasmMod.start_acceptor((payload: Uint8Array) => {
    transport.pushMessage(payload);
  });

  const connection = await helloExchangeInitiator(transport, defaultHello());
  return new EerieServiceClient(connection.asCaller());
}

// ── Analysis dispatch ──────────────────────────────────────────────────────

function getAnalysisTag(netlist: Netlist): string {
  for (const item of netlist.items) {
    if (item.tag === "Analysis") return item.value.tag;
  }
  return "Op";
}

export async function isReady(): Promise<boolean> {
  try {
    await getClient();
    return true;
  } catch {
    return false;
  }
}

export async function simulate(netlist: Netlist): Promise<SimulateResponse> {
  try {
    const client = await getClient();
    const tag = getAnalysisTag(netlist);

    let result: { ok: true; value: SimResult } | { ok: false; error: string };
    switch (tag) {
      case "Op":
        result = await client.simulateOp(netlist);
        break;
      case "Dc":
        result = await client.simulateDc(netlist);
        break;
      case "Ac":
        result = await client.simulateAc(netlist);
        break;
      case "Tran":
        result = await client.simulateTran(netlist);
        break;
      case "Noise":
        result = await client.simulateNoise(netlist);
        break;
      case "Tf":
        result = await client.simulateTf(netlist);
        break;
      case "Sens":
        result = await client.simulateSens(netlist);
        break;
      case "Pz":
        result = await client.simulatePz(netlist);
        break;
      default:
        result = await client.simulateOp(netlist);
        break;
    }

    if (!result.ok) throw new Error(result.error);
    return { ok: true, value: result.value };
  } catch (e) {
    return { ok: false, error: { message: String(e) } };
  }
}

// ── Capabilities ─────────────────────────────────────────────────────────────
// Queried once on first use. Tells us what the backend can do (e.g. file I/O,
// and in the future: python xspice modules, etc.)

let capabilitiesPromise: Promise<Capabilities> | null = null;

export function getCapabilities(): Promise<Capabilities> {
  if (!capabilitiesPromise) {
    capabilitiesPromise = (async () => {
      try {
        const client = await getClient();
        const res = await client.getCapabilities();
        if (res.ok) return res.value;
      } catch { /* fall through */ }
      // WASM or unreachable daemon — no native capabilities
      return { file_io: false };
    })();
  }
  return capabilitiesPromise;
}

// ── File I/O ─────────────────────────────────────────────────────────────────

export interface FileContent {
  path: string;
  content: string;
}

// ── Virtual filesystem (localStorage, used when daemon has no file_io) ───────

const VFS_PREFIX = "eerie-vfs:";

export function vfsListFiles(): string[] {
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith(VFS_PREFIX)) {
      names.push(key.slice(VFS_PREFIX.length));
    }
  }
  return names.sort();
}

export function vfsReadFile(name: string): string | null {
  return localStorage.getItem(VFS_PREFIX + name);
}

export function vfsWriteFile(name: string, content: string): void {
  localStorage.setItem(VFS_PREFIX + name, content);
}

export function vfsDeleteFile(name: string): void {
  localStorage.removeItem(VFS_PREFIX + name);
}

// ── Daemon-side file I/O (used when daemon has file_io capability) ───────────

async function openFileDaemon(path: string): Promise<FileContent> {
  const client = await getClient();
  const res = await client.fileOpen({ path });
  if (!res.ok) throw new Error(res.error);
  return { path: res.value.name, content: res.value.content };
}

async function saveFileDaemon(
  path: string,
  content: string,
): Promise<void> {
  const client = await getClient();
  const res = await client.fileSave({ path, content });
  if (!res.ok) throw new Error(res.error);
}

// ── Public API ───────────────────────────────────────────────────────────────
// Open/save-as need a UI picker, so the logic lives in App.tsx / a dialog
// component. These lower-level functions are used by that UI.

export async function readFile(path: string): Promise<FileContent> {
  const caps = await getCapabilities();
  if (caps.file_io) return openFileDaemon(path);
  const content = vfsReadFile(path);
  if (content == null) throw new Error(`File not found: ${path}`);
  return { path, content };
}

export async function writeFile(path: string, content: string): Promise<void> {
  const caps = await getCapabilities();
  if (caps.file_io) return saveFileDaemon(path, content);
  vfsWriteFile(path, content);
}

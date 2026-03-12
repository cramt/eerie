import YAML from "yaml";
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

let clientPromise: Promise<EerieServiceCaller> | null = null;

function getClient(): Promise<EerieServiceCaller> {
  if (clientPromise) return clientPromise;

  if (import.meta.env.VITE_MODE === "native") {
    const url = `ws://${location.host}/rpc`;
    console.log(`[eerie] native mode — connecting to ${url}`);
    clientPromise = connectEerieService(url);
  } else {
    console.log(
      "[eerie] WASM mode — simulation runs in browser via roam inprocess",
    );
    clientPromise = (async () => {
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

      const connection = await helloExchangeInitiator(
        transport,
        defaultHello(),
      );
      return new EerieServiceClient(connection.asCaller());
    })();
  }

  return clientPromise;
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
      } catch {
        /* fall through */
      }
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
// Projects stored as:
//   eerie-project:{projectName}         → manifest YAML
//   eerie-circuit:{projectName}/{circuitName} → circuit YAML

const VFS_PROJECT_PREFIX = "eerie-project:";
const VFS_CIRCUIT_PREFIX = "eerie-circuit:";

export function vfsListProjects(): string[] {
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith(VFS_PROJECT_PREFIX)) {
      names.push(key.slice(VFS_PROJECT_PREFIX.length));
    }
  }
  return names.sort();
}

export function vfsReadManifest(project: string): string | null {
  return localStorage.getItem(VFS_PROJECT_PREFIX + project);
}

export function vfsWriteManifest(project: string, content: string): void {
  localStorage.setItem(VFS_PROJECT_PREFIX + project, content);
}

export function vfsListCircuits(project: string): string[] {
  const prefix = VFS_CIRCUIT_PREFIX + project + "/";
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith(prefix)) {
      names.push(key.slice(prefix.length));
    }
  }
  return names.sort();
}

export function vfsReadCircuit(project: string, circuit: string): string | null {
  return localStorage.getItem(VFS_CIRCUIT_PREFIX + project + "/" + circuit);
}

export function vfsWriteCircuit(project: string, circuit: string, content: string): void {
  localStorage.setItem(VFS_CIRCUIT_PREFIX + project + "/" + circuit, content);
}

export function vfsDeleteCircuit(project: string, circuit: string): void {
  localStorage.removeItem(VFS_CIRCUIT_PREFIX + project + "/" + circuit);
}

export function vfsDeleteProject(project: string): void {
  localStorage.removeItem(VFS_PROJECT_PREFIX + project);
  const prefix = VFS_CIRCUIT_PREFIX + project + "/";
  const keysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith(prefix)) keysToDelete.push(key);
  }
  for (const key of keysToDelete) localStorage.removeItem(key);
}

// ── Daemon-side file I/O (used when daemon has file_io capability) ───────────

async function openFileDaemon(path: string): Promise<FileContent> {
  const client = await getClient();
  const res = await client.fileOpen({ path });
  if (!res.ok) throw new Error(res.error);
  return { path: res.value.name, content: res.value.content };
}

async function saveFileDaemon(path: string, content: string): Promise<void> {
  const client = await getClient();
  const res = await client.fileSave({ path, content });
  if (!res.ok) throw new Error(res.error);
}

// ── Public file API ───────────────────────────────────────────────────────────

export async function readFile(path: string): Promise<FileContent> {
  const caps = await getCapabilities();
  if (caps.file_io) return openFileDaemon(path);
  throw new Error("Use vfsReadCircuit for VFS mode");
}

export async function writeFile(path: string, content: string): Promise<void> {
  const caps = await getCapabilities();
  if (caps.file_io) return saveFileDaemon(path, content);
  throw new Error("Use vfsWriteCircuit for VFS mode");
}

// ── Project API ───────────────────────────────────────────────────────────────

export interface ProjectComponent {
  name: string;
  type_id: string;
  name_prefix?: string;
  properties: Record<string, unknown>;
}

export interface ProjectInfo {
  name: string;
  circuits: string[];
  /** Other (non-circuit) files in the project directory, with full filenames. */
  files: string[];
  /** Component library from eerie.yaml, or null if not defined. */
  components: ProjectComponent[] | null;
}

/** Return the project directory the daemon was started in (native mode only). */
export async function getProjectDir(): Promise<string | null> {
  const caps = await getCapabilities();
  if (!caps.file_io) return null;
  try {
    const client = await getClient();
    const res = await client.getProjectDir();
    if (res.ok) return res.value.path;
  } catch { /* ignore */ }
  return null;
}

/** Parse the `components` array from a manifest YAML string. */
function parseManifestComponents(manifestYaml: string): ProjectComponent[] | null {
  try {
    const manifest = YAML.parse(manifestYaml) as { components?: unknown[] };
    if (!Array.isArray(manifest?.components)) return null;
    return manifest.components.map((c: any) => ({
      name: c.name ?? c.type_id,
      type_id: c.type_id,
      name_prefix: c.name_prefix,
      properties: c.properties ?? {},
    }));
  } catch {
    return null;
  }
}

/** List a project directory (native mode). Reads eerie.yaml + scans .eerie files. */
export async function listProject(path: string): Promise<ProjectInfo> {
  const client = await getClient();
  const res = await client.listProject({ path });
  if (!res.ok) throw new Error(res.error);
  let name = path;
  let components: ProjectComponent[] | null = null;
  try {
    const manifest = YAML.parse(res.value.manifest_yaml) as { name?: string };
    if (manifest?.name) name = manifest.name;
    components = parseManifestComponents(res.value.manifest_yaml);
  } catch { /* use path as fallback */ }
  return { name, circuits: res.value.circuits, files: res.value.files, components };
}

/** Get the component library for a VFS project (reads its manifest from localStorage). */
export function vfsGetProjectComponents(project: string): ProjectComponent[] | null {
  const manifestYaml = vfsReadManifest(project);
  if (!manifestYaml) return null;
  return parseManifestComponents(manifestYaml);
}

/** Read the raw eerie.yaml manifest for a project. */
export async function readManifest(projectPath: string): Promise<string> {
  const caps = await getCapabilities();
  if (caps.file_io) {
    const file = await openFileDaemon(`${projectPath}/eerie.yaml`);
    return file.content;
  }
  return vfsReadManifest(projectPath) ?? '';
}

/** Write the raw eerie.yaml manifest for a project. */
export async function saveManifest(projectPath: string, content: string): Promise<void> {
  const caps = await getCapabilities();
  if (caps.file_io) {
    await saveFileDaemon(`${projectPath}/eerie.yaml`, content);
  } else {
    vfsWriteManifest(projectPath, content);
  }
}

/** Read a circuit file (native: full path; VFS: uses vfsReadCircuit). */
export async function readCircuit(projectPath: string, circuitName: string): Promise<string> {
  const caps = await getCapabilities();
  if (caps.file_io) {
    const file = await openFileDaemon(`${projectPath}/${circuitName}`);
    return file.content;
  }
  const content = vfsReadCircuit(projectPath, circuitName);
  if (content == null) throw new Error(`Circuit not found: ${projectPath}/${circuitName}`);
  return content;
}

/** Save a circuit file (native: full path; VFS: uses vfsWriteCircuit). */
export async function saveCircuit(projectPath: string, circuitName: string, content: string): Promise<void> {
  const caps = await getCapabilities();
  if (caps.file_io) {
    await saveFileDaemon(`${projectPath}/${circuitName}`, content);
  } else {
    vfsWriteCircuit(projectPath, circuitName, content);
  }
}

/** Create a new project (native: writes eerie.yaml; VFS: writes manifest). */
export async function createProject(projectPath: string, name: string): Promise<void> {
  const manifestYaml = `name: ${name}\n`;
  const caps = await getCapabilities();
  if (caps.file_io) {
    await saveFileDaemon(`${projectPath}/eerie.yaml`, manifestYaml);
  } else {
    vfsWriteManifest(projectPath, manifestYaml);
  }
}

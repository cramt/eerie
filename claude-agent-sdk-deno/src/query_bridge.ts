/**
 * Bridge between the embedded Deno runtime and the Claude Agent SDK.
 *
 * The pipe RID is set up by the Rust side via a classic script before this
 * module is loaded. We read it from `globalThis.__eerie_pipe_rid`.
 *
 * Protocol (NDJSON over the Rust↔JS pipe):
 *
 * Rust → JS:
 *   { "type": "query", "params": { "prompt": "...", "options": { ... } } }
 *
 * JS → Rust:
 *   { "type": "message", "data": <sdk message> }
 *   { "type": "query_done" }
 *   { "type": "error", "message": "..." }
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

const ops = (globalThis as any).__eerieOps;
const rid: number = (globalThis as any).__eerie_pipe_rid;

if (rid === undefined || rid === null) {
  throw new Error(
    `__eerie_pipe_rid not set on globalThis (got ${rid}).`
  );
}

// Remove CLAUDECODE env var so the Agent SDK can spawn claude without nesting issues.
try {
  if (typeof process !== "undefined" && process.env) {
    delete process.env.CLAUDECODE;
  }
} catch {}
try {
  if (typeof Deno !== "undefined" && Deno.env) {
    Deno.env.delete("CLAUDECODE");
  }
} catch {}

const encoder = new TextEncoder();

/** Recursively strip null-valued keys. facet-json serializes None as null,
 *  but the Agent SDK treats null differently from undefined (absent). */
function stripNulls(obj: any): any {
  if (obj === null || obj === undefined) return undefined;
  if (Array.isArray(obj)) return obj.map(stripNulls);
  if (typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null) out[k] = stripNulls(v);
    }
    return out;
  }
  return obj;
}

async function writeToRust(msg: object): Promise<void> {
  const line = JSON.stringify(msg) + "\n";
  await ops.op_eerie_pipe_write(rid, encoder.encode(line));
}

(async () => {
  try {
    while (true) {
      const raw = await ops.op_eerie_pipe_read(rid);
      if (raw === null) break;
      const rawBytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);

      let request: any;
      try {
        request = JSON.parse(new TextDecoder().decode(rawBytes));
      } catch (e) {
        await writeToRust({ type: "error", message: `JSON parse error: ${e}` });
        continue;
      }

      if (!request || request.type !== "query") {
        await writeToRust({
          type: "error",
          message: `Unknown request type: ${request?.type ?? "(null)"}`,
        });
        continue;
      }

      try {
        const params = stripNulls(request.params);
        if (!params.options) params.options = {};

        // The bundled SDK can't find cli.js via import.meta.url (we're in a
        // temp file). Point it to the installed Claude Code CLI binary instead.
        // Since the path has no .js extension, the SDK treats it as a native
        // binary and spawns it directly (not via node).
        if (!params.options.pathToClaudeCodeExecutable) {
          params.options.pathToClaudeCodeExecutable = "claude";
        }

        // Ensure CLAUDECODE is not inherited by the claude subprocess.
        if (!params.options.env) {
          const env = typeof Deno !== "undefined" ? Deno.env.toObject() : { ...process.env };
          delete env.CLAUDECODE;
          params.options.env = env;
        }

        for await (const message of query(params)) {
          await writeToRust({ type: "message", data: message });
        }
        await writeToRust({ type: "query_done" });
      } catch (e: any) {
        // Dump all enumerable properties for debugging
        let extra = "";
        try { extra = JSON.stringify(e, Object.getOwnPropertyNames(e)); } catch {}
        await writeToRust({
          type: "error",
          message: `${e?.message ?? e}\ndetails: ${extra}`
        });
      }
    }
  } catch (e: any) {
    await writeToRust({ type: "error", message: `Fatal: ${e?.stack ?? e}` });
  }

  ops.op_eerie_pipe_close(rid);
})();

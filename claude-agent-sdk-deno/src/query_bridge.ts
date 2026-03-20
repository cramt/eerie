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

const encoder = new TextEncoder();

async function writeToRust(msg: object): Promise<void> {
  const line = JSON.stringify(msg) + "\n";
  await ops.op_eerie_pipe_write(rid, encoder.encode(line));
}

(async () => {
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

    if (request.type !== "query") {
      await writeToRust({
        type: "error",
        message: `Unknown request type: ${request.type}`,
      });
      continue;
    }

    try {
      for await (const message of query(request.params)) {
        await writeToRust({ type: "message", data: message });
      }
      await writeToRust({ type: "query_done" });
    } catch (e: any) {
      await writeToRust({ type: "error", message: String(e?.message ?? e) });
    }
  }

  ops.op_eerie_pipe_close(rid);
})();

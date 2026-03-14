/**
 * Claude agent running inside an embedded Deno runtime.
 *
 * Protocol (NDJSON over the Rust<->JS pipe):
 *
 * Rust → JS  (one JSON line per request):
 *   { "type": "prompt", "messages": [{"role":"user"|"assistant","content":"..."}], "system"?: "..." }
 *
 * JS → Rust  (one JSON line per event):
 *   { "type": "delta",  "text": "..." }
 *   { "type": "done",   "stop_reason": string, "usage": { "input_tokens": N, "output_tokens": N } }
 *   { "type": "error",  "message": "..." }
 */

import Anthropic from "@anthropic-ai/sdk";

const ops = (globalThis as any).__eerieOps;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const rid: number = ops.op_eerie_pipe_open();

async function writeToRust(msg: object): Promise<void> {
  const line = JSON.stringify(msg) + "\n";
  await ops.op_eerie_pipe_write(rid, encoder.encode(line));
}

const client = new Anthropic();

// Wrap in async IIFE — execute_script runs in a classic (non-module) context
// where top-level await is not available.
(async () => {
  while (true) {
    // op_eerie_pipe_read returns Option<Vec<u8>> via serde; serde_v8 serializes
    // Vec<u8> as a plain JS array, so we normalize it to Uint8Array.
    const raw = await ops.op_eerie_pipe_read(rid);
    if (raw === null) break; // Rust closed the pipe — shut down
    const rawBytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);

    let request: { type: string; messages: Anthropic.MessageParam[]; system?: string };
    try {
      request = JSON.parse(decoder.decode(rawBytes));
    } catch (e) {
      await writeToRust({ type: "error", message: `JSON parse error: ${e}` });
      continue;
    }

    if (request.type !== "prompt") {
      await writeToRust({ type: "error", message: `Unknown request type: ${request.type}` });
      continue;
    }

    try {
      const stream = client.messages.stream({
        model: "claude-opus-4-6",
        max_tokens: 8096,
        thinking: { type: "adaptive" },
        ...(request.system ? { system: request.system } : {}),
        messages: request.messages,
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          await writeToRust({ type: "delta", text: event.delta.text });
        }
      }

      const final = await stream.finalMessage();
      await writeToRust({
        type: "done",
        stop_reason: final.stop_reason,
        usage: {
          input_tokens: final.usage.input_tokens,
          output_tokens: final.usage.output_tokens,
        },
      });
    } catch (e: any) {
      await writeToRust({ type: "error", message: String(e?.message ?? e) });
    }
  }

  ops.op_eerie_pipe_close(rid);
})();

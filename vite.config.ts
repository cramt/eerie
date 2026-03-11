import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawn, type ChildProcess } from "child_process";
import { createConnection } from "net";
import type { Plugin, ViteDevServer } from "vite";

const mode = process.env.VITE_MODE;
if (mode !== "native" && mode !== "wasm") {
  throw new Error(
    `VITE_MODE must be "native" or "wasm", got ${JSON.stringify(mode)}`,
  );
}

// ── Daemon vite plugin (native dev mode) ────────────────────────────────────
// Spawns `cargo watch` to rebuild and restart eerie-daemon on Rust changes.
// Reads "PORT <n>" from stdout each time the daemon (re)starts.

function eerieDaemon(): Plugin {
  let child: ChildProcess | null = null;
  let daemonPort: number | null = null;
  let server: ViteDevServer | null = null;
  let firstPortResolve: ((port: number) => void) | null = null;

  return {
    name: "eerie-daemon",
    apply: "serve",

    async configResolved() {
      if (mode !== "native") return;

      // Use cargo-watch to auto-rebuild and restart on Rust changes.
      // -w flags scope what's watched; -x runs the cargo subcommand.
      child = spawn(
        "cargo",
        [
          "watch",
          "-w",
          "eerie-daemon",
          "-w",
          "eerie-rpc",
          "-x",
          "run -p eerie-daemon",
        ],
        {
          stdio: ["ignore", "pipe", "inherit"],
          env: {
            ...process.env,
            EERIE_PROJECT_DIR: resolve("examples/getting-started"),
          },
        },
      );

      // Listen for PORT lines on every daemon (re)start
      child.stdout!.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) {
          const m = line.match(/^PORT (\d+)/);
          if (m) {
            daemonPort = Number(m[1]);
            console.log(`[eerie-daemon] listening on port ${daemonPort}`);
            if (firstPortResolve) {
              firstPortResolve(daemonPort);
              firstPortResolve = null;
            } else if (server) {
              // Daemon restarted — trigger full reload so frontend reconnects
              server.ws.send({ type: "full-reload", path: "*" });
            }
          }
        }
      });

      // Wait for the first PORT before vite finishes starting
      daemonPort = await new Promise<number>((resolve, reject) => {
        firstPortResolve = resolve;

        child!.on("error", reject);
        child!.on("exit", (code) => {
          if (!daemonPort) reject(new Error(`daemon exited with code ${code}`));
        });
        setTimeout(() => reject(new Error("daemon startup timeout")), 120_000);
      });
      console.log(`[eerie-daemon] initial port ${daemonPort}`);
    },

    configureServer(srv) {
      if (mode !== "native") return;
      server = srv;

      // Proxy WebSocket connections on /rpc to the daemon
      srv.httpServer?.on("upgrade", (req, socket, _head) => {
        if (req.url !== "/rpc") return;
        if (!daemonPort) {
          socket.destroy();
          return;
        }

        const port = daemonPort;
        const upstream = createConnection({ host: "127.0.0.1", port }, () => {
          upstream.write(
            `GET /rpc HTTP/1.1\r\n` +
              `Host: localhost:${port}\r\n` +
              `Upgrade: websocket\r\n` +
              `Connection: Upgrade\r\n` +
              `Sec-WebSocket-Key: ${req.headers["sec-websocket-key"]}\r\n` +
              `Sec-WebSocket-Version: 13\r\n` +
              `\r\n`,
          );
          upstream.pipe(socket);
          socket.pipe(upstream);
        });
        upstream.on("error", () => socket.destroy());
        socket.on("error", () => upstream.destroy());
      });
    },

    closeBundle() {
      if (child) {
        child.kill();
        child = null;
      }
    },
  };
}

// ── WASM watcher plugin (wasm dev mode) ─────────────────────────────────────
// Runs `cargo watch` to rebuild eerie-wasm on Rust changes, then triggers
// a page reload so the browser picks up the new .wasm binary.

function eerieWasmWatch(): Plugin {
  let child: ChildProcess | null = null;

  return {
    name: "eerie-wasm-watch",
    apply: "serve",

    configResolved() {
      if (mode !== "wasm") return;

      child = spawn(
        "cargo",
        [
          "watch",
          "-w",
          "eerie-wasm",
          "-w",
          "eerie-rpc",
          "-s",
          "wasm-pack build eerie-wasm --dev --target web --out-dir pkg",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      child.stdout!.on("data", (chunk: Buffer) => {
        process.stdout.write(`[eerie-wasm] ${chunk}`);
      });
      child.stderr!.on("data", (chunk: Buffer) => {
        process.stderr.write(`[eerie-wasm] ${chunk}`);
      });
    },

    configureServer(server) {
      if (mode !== "wasm" || !child) return;

      // Watch for wasm-pack output to complete, then reload
      child.stdout!.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (
          text.includes("Your wasm pkg is ready") ||
          text.includes("[INFO]: Optional fields")
        ) {
          console.log("[eerie-wasm] rebuild complete, reloading...");
          server.ws.send({ type: "full-reload", path: "*" });
        }
      });
    },

    closeBundle() {
      if (child) {
        child.kill();
        child = null;
      }
    },
  };
}

// ── Codegen watcher plugin (both modes) ─────────────────────────────────────
// Watches Rust sources and re-runs eerie-codegen to regenerate TS types.
// Vite picks up the changed .ts files via its own HMR.

function eerieCodegenWatch(): Plugin {
  let child: ChildProcess | null = null;

  return {
    name: "eerie-codegen-watch",
    apply: "serve",

    configResolved() {
      child = spawn(
        "cargo",
        [
          "watch",
          "-w",
          "eerie-codegen",
          "-w",
          "eerie-rpc",
          "-s",
          "cargo run -p eerie-codegen",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );

      child.stdout!.on("data", (chunk: Buffer) => {
        process.stdout.write(`[eerie-codegen] ${chunk}`);
      });
      child.stderr!.on("data", (chunk: Buffer) => {
        process.stderr.write(`[eerie-codegen] ${chunk}`);
      });
    },

    closeBundle() {
      if (child) {
        child.kill();
        child = null;
      }
    },
  };
}

export default defineConfig({
  root: "src/renderer",
  resolve: {
    alias: {
      "@renderer": resolve("src/renderer/src"),
    },
  },
  plugins: [
    react({ babel: { plugins: ["babel-plugin-react-compiler"] } }),
    eerieDaemon(),
    eerieWasmWatch(),
    eerieCodegenWatch(),
  ],
  optimizeDeps: {
    include: ["konva", "react-konva", "react", "react-dom", "zustand", "yaml"],
    exclude: ["eerie-wasm"],
  },
  server: {
    open: true,
  },
  build: {
    outDir: resolve("dist"),
    sourcemap: true,
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-konva": ["konva", "react-konva"],
        },
      },
    },
  },
});

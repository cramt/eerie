import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import type { Plugin } from "vite";

function rustBuildPlugin(): Plugin {
  let building = false;

  function build() {
    if (building) return;
    building = true;
    console.log("\n[rust] cargo build --workspace");
    try {
      execSync("cargo build --workspace", { stdio: "inherit" });
    } catch {
      console.error("[rust] build failed");
    } finally {
      building = false;
    }
  }

  return {
    name: "rust-build",
    buildStart() {
      build();
    },
    configureServer(server) {
      const globs = ["eerie-*/src/**/*.rs", "eerie-*/Cargo.toml"];
      for (const g of globs) server.watcher.add(g);

      let debounce: ReturnType<typeof setTimeout> | null = null;
      server.watcher.on("change", (file) => {
        if (!file.endsWith(".rs") && !file.endsWith("Cargo.toml")) return;
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(build, 300);
      });
    },
  };
}

export default defineConfig({
  main: {
    //plugins: [rustBuildPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react()],
    // WASM support - loaded via fetch in a web worker
    assetsInclude: ["**/*.wasm"],
  },
});

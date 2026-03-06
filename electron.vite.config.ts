import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@bearcove/roam-core", "@bearcove/roam-tcp", "@bearcove/roam-wire", "@bearcove/roam-postcard"] })],
  },
  preload: {
    build: {
      rollupOptions: {
        external: ["electron"],
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [react({ babel: { plugins: ["babel-plugin-react-compiler"] } })],
    optimizeDeps: {
      include: ["konva", "react-konva", "react", "react-dom", "zustand", "yaml"],
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom"],
            "vendor-konva": ["konva", "react-konva"],
          },
        },
      },
    },
    // WASM support - loaded via fetch in a web worker
    assetsInclude: ["**/*.wasm"],
  },
});

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactCompiler from "eslint-plugin-react-compiler";

export default tseslint.config(
  { ignores: ["out/", "dist/", "src/codegen/", "src/renderer/src/wasm/"] },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: {
      "react-hooks": reactHooks,
      "react-compiler": reactCompiler,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-compiler/react-compiler": "error",
    },
  },
);

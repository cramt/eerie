/**
 * e2e/inspect.ts — Playwright Electron inspector for debugging.
 *
 * Launches the Electron app (using the pre-built output in out/) and runs
 * commands like screenshot, eval, html, click, accessibility.
 *
 * Prerequisites: run `pnpm build:electron-vite` (or `pnpm dev` once) first.
 *
 * Usage (all through nix develop):
 *   pnpm e2e:screenshot                        # take a screenshot
 *   pnpm e2e:screenshot --wait 5000             # wait 5s before capturing
 *   pnpm e2e:screenshot --name my-shot          # custom filename
 *   pnpm e2e:eval "document.title"              # evaluate JS in renderer
 *   pnpm e2e:html                               # dump page HTML
 *   pnpm e2e:click "button.my-btn"              # click an element
 *   pnpm e2e:click "button" --screenshot after  # click then screenshot
 *   pnpm e2e:accessibility                      # dump accessibility tree
 *
 * Screenshots saved to e2e/screenshots/ (gitignored).
 * Claude Code can view them with the Read tool.
 */

import { _electron as electron } from "playwright-core";
import { join, dirname } from "path";
import { mkdirSync, existsSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const screenshotDir = join(__dirname, "screenshots");

const args = process.argv.slice(2);
const command = args[0] ?? "screenshot";

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

async function main() {
  const mainEntry = join(projectRoot, "out/main/index.js");
  if (!existsSync(mainEntry)) {
    console.error(
      "Error: out/main/index.js not found. Run `pnpm build:electron-vite` first."
    );
    process.exit(1);
  }

  const electronPath = join(projectRoot, "node_modules", ".bin", "electron");

  console.log("Launching Electron app...");
  const app = await electron.launch({
    executablePath: electronPath,
    args: [mainEntry],
    env: {
      ...process.env,
      // Skip daemon for pure UI inspection (override with --daemon)
      ...(hasFlag("daemon") ? {} : { EERIE_DAEMON_BIN: "/bin/false" }),
    },
  });

  const page = await app.firstWindow();
  console.log(`Window title: ${await page.title()}`);

  const waitMs = parseInt(getFlag("wait") ?? "2000", 10);
  if (waitMs > 0) {
    console.log(`Waiting ${waitMs}ms for app to settle...`);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  try {
    switch (command) {
      case "screenshot": {
        mkdirSync(screenshotDir, { recursive: true });
        const name = getFlag("name") ?? `screenshot-${Date.now()}`;
        const path = join(screenshotDir, `${name}.png`);
        await page.screenshot({ path, fullPage: true });
        console.log(`Screenshot saved: ${path}`);
        break;
      }

      case "eval": {
        const expr = args[1];
        if (!expr) {
          console.error("Usage: pnpm e2e:eval <expression>");
          process.exit(1);
        }
        const result = await page.evaluate(expr);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "html": {
        const html = await page.content();
        console.log(html);
        break;
      }

      case "click": {
        const selector = args[1];
        if (!selector) {
          console.error(
            "Usage: pnpm e2e:click <selector> [--screenshot name] [--wait ms]"
          );
          process.exit(1);
        }
        await page.click(selector);
        console.log(`Clicked: ${selector}`);

        const screenshotAfter = getFlag("screenshot");
        if (screenshotAfter) {
          await new Promise((r) => setTimeout(r, 500));
          mkdirSync(screenshotDir, { recursive: true });
          const path = join(screenshotDir, `${screenshotAfter}.png`);
          await page.screenshot({ path, fullPage: true });
          console.log(`Screenshot saved: ${path}`);
        }
        break;
      }

      case "accessibility": {
        const snapshot = await page.accessibility.snapshot();
        console.log(JSON.stringify(snapshot, null, 2));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error(
          "Commands: screenshot, eval, html, click, accessibility"
        );
        process.exit(1);
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

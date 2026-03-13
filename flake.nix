{
  description = "Eerie - Circuit Design and Simulation";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    crane = {
      url = "github:ipetkov/crane";
    };
    pnpm2nix-nzbr = {
      url = "github:FliegendeWurst/pnpm2nix-nzbr";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    rust-overlay,
    crane,
    pnpm2nix-nzbr,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        overlays = [(import rust-overlay)];
        pkgs = import nixpkgs {inherit system overlays;};

        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          targets = ["wasm32-unknown-unknown"];
          extensions = ["rust-src" "rust-analyzer" "clippy" "rustfmt"];
        };

        wasm-bindgen-cli_0_2_114 = pkgs.wasm-bindgen-cli.overrideAttrs (old: rec {
          version = "0.2.114";
          src = pkgs.fetchCrate {
            pname = "wasm-bindgen-cli";
            inherit version;
            hash = "sha256-xrCym+rFY6EUQFWyWl6OPA+LtftpUAE5pIaElAIVqW0=";
          };
          cargoDeps = pkgs.rustPlatform.fetchCargoVendor {
            inherit src;
            name = "wasm-bindgen-cli-${version}-vendor.tar.gz";
            hash = "sha256-Z8+dUXPQq7S+Q7DWNr2Y9d8GMuEdSnq00quUR0wDNPM=";
          };
        });

        wasm-pack_14 = pkgs.wasm-pack.overrideAttrs (old: rec {
          version = "0.14.0";
          src = pkgs.fetchFromGitHub {
            owner = "rustwasm";
            repo = "wasm-pack";
            rev = "v${version}";
            hash = "sha256-ik6AJUKuT3GCDTZbHWcplcB7cS0CIcZwFNa6SvGzsIQ=";
          };
          cargoDeps = pkgs.rustPlatform.fetchCargoVendor {
            inherit src;
            name = "wasm-pack-${version}-vendor.tar.gz";
            hash = "sha256-n9xuwlj8+3fDTHMS2XobqWFc6mNHQcmmvebRDc82oSo=";
          };
        });

        craneLib = (crane.mkLib pkgs).overrideToolchain rustToolchain;

        src = pkgs.lib.cleanSourceWith {
          src = ./.;
          filter = craneLib.filterCargoSources;
        };

        commonCraneArgs = {
          inherit src;
          strictDeps = true;
        };

        # Pre-build all cargo dependencies (cached across rebuilds)
        cargoArtifacts = craneLib.buildDepsOnly commonCraneArgs;

        # Vendored cargo sources for offline builds (wasm sandbox)
        cargoVendorDir = craneLib.vendorCargoDeps commonCraneArgs;

        # ── pnpm dependency management (pnpm2nix-nzbr) ────────────────────
        mkPnpmPackage = (pkgs.callPackage "${pnpm2nix-nzbr}/derivation.nix" {}).mkPnpmPackage;

        # Isolate lockfile so IFD is not invalidated by unrelated source changes
        lockfileSource = pkgs.lib.fileset.toSource {
          root = ./.;
          fileset = ./pnpm-lock.yaml;
        };

        lockfilePassthru = let
          ref = mkPnpmPackage {
            workspace = ./.;
            components = [];
            pname = "eerie-ref";
            version = "0.1.0";
            nodejs = pkgs.nodejs_22;
            pnpm = pkgs.pnpm;
            script = "build";
            pnpmLockYaml = lockfileSource + "/pnpm-lock.yaml";
          };
        in {
          inherit (ref) patchedLockfileYaml processResultAllDeps;
        };

        # Minimal source for dependency installation — only package.json + lockfile
        depsSource = pkgs.lib.fileset.toSource {
          root = ./.;
          fileset = pkgs.lib.fileset.unions [
            ./package.json
            ./pnpm-workspace.yaml
          ];
        };

        # Cached pnpm install (invalidated only by dependency changes)
        installedDeps = pkgs.stdenv.mkDerivation {
          name = "eerie-deps";
          src = depsSource;
          nativeBuildInputs = [pkgs.nodejs_22 pkgs.pnpm];
          strictDeps = true;

          configurePhase = ''
            export HOME=$NIX_BUILD_TOP
            export npm_config_nodedir=${pkgs.nodejs_22}
            echo "manage-package-manager-versions=false" >> .npmrc
            cp -fv ${lockfilePassthru.patchedLockfileYaml} pnpm-lock.yaml
            mkdir -p eerie-wasm/pkg
            pnpm store add $(cat ${lockfilePassthru.processResultAllDeps})
            pnpm install --ignore-scripts --force --frozen-lockfile
          '';

          buildPhase = "true";

          installPhase = ''
            mkdir -p $out
            cp -a . $out/
          '';
        };

        # ── WASM build (thevenin simulation engine) ───────────────────────
        wasmPkg = pkgs.stdenv.mkDerivation {
          pname = "eerie-wasm";
          version = "0.1.0";
          src = ./.;
          nativeBuildInputs = [rustToolchain wasm-pack_14 wasm-bindgen-cli_0_2_114 pkgs.binaryen];
          buildPhase = ''
            export HOME=$NIX_BUILD_TOP
            export CARGO_HOME=$NIX_BUILD_TOP/.cargo-home
            mkdir -p $CARGO_HOME
            cp ${cargoVendorDir}/config.toml $CARGO_HOME/config.toml

            wasm-pack build eerie-wasm --target web --out-dir pkg
            wasm-opt -O eerie-wasm/pkg/eerie_wasm_bg.wasm -o eerie-wasm/pkg/eerie_wasm_bg.wasm
          '';
          installPhase = ''
            mkdir -p $out
            cp -r eerie-wasm/pkg/* $out/
          '';
        };

        # ── Web frontend (vite build) ────────────────────────────────────────
        frontendSrc = pkgs.lib.cleanSourceWith {
          src = ./.;
          filter = path: _type:
            !(
              builtins.match ".*/target(/.*)?$" path
              != null
              || builtins.match ".*/node_modules(/.*)?$" path != null
              || builtins.match ".*/out(/.*)?$" path != null
              || builtins.match ".*/dist(/.*)?$" path != null
            );
        };

        mkFrontend = {
          viteMode,
          includeWasm ? false,
        }:
          pkgs.stdenv.mkDerivation {
            pname = "eerie-frontend-${viteMode}";
            version = "0.1.0";
            src = frontendSrc;
            nativeBuildInputs = [pkgs.nodejs_22 pkgs.pnpm];
            strictDeps = true;

            configurePhase =
              ''
                export HOME=$NIX_BUILD_TOP
                export npm_config_nodedir=${pkgs.nodejs_22}
                echo "manage-package-manager-versions=false" >> .npmrc

                cp -a ${installedDeps}/node_modules .
                chmod -R u+w node_modules

                cp -f ${lockfilePassthru.patchedLockfileYaml} pnpm-lock.yaml
              ''
              + pkgs.lib.optionalString includeWasm ''
                # Copy WASM build output
                mkdir -p eerie-wasm/pkg
                cp -r ${wasmPkg}/* eerie-wasm/pkg/
              '';

            buildPhase = ''
              VITE_MODE=${viteMode} pnpm exec vite build
            '';

            installPhase = ''
              mkdir -p $out
              cp -r dist/* $out/
            '';
          };

        frontendNative = mkFrontend {viteMode = "native";};
        frontendWasm = mkFrontend {
          viteMode = "wasm";
          includeWasm = true;
        };

        # ── Daemon binary (native simulation via thevenin) ───────────────
        # rust-embed looks for ../dist/ relative to the eerie-daemon crate
        # at compile time — provide the pre-built native frontend.
        daemonBin = craneLib.buildPackage (commonCraneArgs
          // {
            inherit cargoArtifacts;
            pname = "eerie-daemon";
            cargoExtraArgs = "-p eerie-daemon";
            # Copy the pre-built frontend into dist/ so rust-embed can find it
            preBuild = ''
              mkdir -p dist
              cp -r --no-preserve=all ${frontendNative}/* dist/
            '';
          });

        # ── Eerie (daemon + embedded frontend) ──────────────────────────
        eerie = pkgs.stdenv.mkDerivation {
          pname = "eerie";
          version = "0.1.0";
          dontUnpack = true;

          installPhase = ''
            mkdir -p $out/bin
            mkdir -p $out/share/eerie
            mkdir -p $out/share/applications
            mkdir -p $out/share/icons/hicolor/scalable/apps
            mkdir -p $out/share/metainfo

            cp ${daemonBin}/bin/eerie-daemon $out/bin/eerie-daemon
            cp -r ${frontendNative}/* $out/share/eerie/

            cp ${./data/io.github.cramt.Eerie.desktop} \
              $out/share/applications/io.github.cramt.Eerie.desktop
            cp ${./data/io.github.cramt.Eerie.svg} \
              $out/share/icons/hicolor/scalable/apps/io.github.cramt.Eerie.svg
            cp ${./data/io.github.cramt.Eerie.metainfo.xml} \
              $out/share/metainfo/io.github.cramt.Eerie.metainfo.xml
          '';

          meta = with pkgs.lib; {
            description = "Circuit design and simulation tool";
            license = licenses.gpl3Plus;
            platforms = platforms.linux;
          };
        };

        # ── Static frontend only (WASM demo) ────────────────────────────
        eerie-web = pkgs.stdenv.mkDerivation {
          pname = "eerie-web";
          version = "0.1.0";
          dontUnpack = true;

          installPhase = ''
            mkdir -p $out
            cp -r ${frontendWasm}/* $out/
          '';
        };

        ci-build = pkgs.writeShellScriptBin "ci-build" ''
          set -euo pipefail
          echo "=== Building eerie ==="
          ${pkgs.nix}/bin/nix build .#eerie --print-build-logs
          echo ""
          echo "=== Build complete ==="
        '';

        update-deps = pkgs.writeShellScriptBin "update-deps" ''
          set -euo pipefail
          echo "=== Updating all dependencies ==="

          echo ""
          echo "--- Nix flake inputs ---"
          ${pkgs.nix}/bin/nix flake update

          echo ""
          echo "--- Cargo dependencies ---"
          ${rustToolchain}/bin/cargo update

          echo ""
          echo "--- pnpm dependencies ---"
          ${pkgs.pnpm}/bin/pnpm update --latest

          echo ""
          echo "=== All dependencies updated ==="
        '';
      in {
        packages = {
          default = eerie;
          inherit eerie eerie-web ci-build update-deps;
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            rustToolchain
            wasm-pack_14
            cargo-watch
            nodejs_22
            pnpm
            pkg-config
            openssl
            git
            jq
            yq-go
            rsync
            cargo-dist
          ];

          shellHook = ''
            export RUST_BACKTRACE=1
            export RUST_LOG=info
            echo "=== Eerie dev environment ==="
            echo "  rustc:    $(rustc --version)"
            echo "  node:     $(node --version)"
            echo "  pnpm:     $(pnpm --version)"
            echo ""
            echo "  Native dev:  pnpm dev:native  (daemon + WS, auto-rebuild)"
            echo "  WASM dev:    pnpm dev:wasm    (browser only, auto-rebuild)"
            echo "  Build WASM:  pnpm build:wasm"
            echo "  Codegen:     pnpm codegen"
          '';
        };
      }
    );
}

#!/usr/bin/env node
// Postinstall: downloads the platform-specific binary from GitHub Releases.

const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = "your-org/lite-task";
const VERSION = require("./package.json").version;
const BIN_DIR = path.join(__dirname, "bin");

function getBinaryName() {
  const { platform, arch } = process;
  if (platform === "darwin" && arch === "arm64") return "lite-task-mcp-macos-arm64";
  if (platform === "darwin" && arch === "x64")   return "lite-task-mcp-macos-x64";
  if (platform === "linux"  && arch === "x64")   return "lite-task-mcp-linux-x64";
  if (platform === "linux"  && arch === "arm64") return "lite-task-mcp-linux-arm64";
  if (platform === "win32"  && arch === "x64")   return "lite-task-mcp-windows-x64.exe";
  throw new Error(`Unsupported platform: ${platform} ${arch}`);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    function get(url) {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}\n${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      }).on("error", reject);
    }
    get(url);
  });
}

async function main() {
  const binaryName = getBinaryName();
  const url = `https://github.com/${REPO}/releases/download/v${VERSION}/${binaryName}`;
  const destName = process.platform === "win32" ? "lite-task-mcp.exe" : "lite-task-mcp";
  const dest = path.join(BIN_DIR, destName);

  fs.mkdirSync(BIN_DIR, { recursive: true });

  console.log(`lite-task-mcp: downloading ${binaryName} v${VERSION}...`);
  await download(url, dest);

  if (process.platform !== "win32") {
    fs.chmodSync(dest, 0o755);
  }

  console.log(`lite-task-mcp: installed → ${dest}`);
}

main().catch((err) => {
  console.error(`lite-task-mcp: install failed — ${err.message}`);
  console.error("You can install manually: https://github.com/your-org/lite-task/releases");
  process.exit(1);
});

#!/usr/bin/env node
// Thin wrapper — spawns the downloaded platform binary.

const { spawn } = require("child_process");
const path = require("path");

const bin = path.join(
  __dirname,
  "bin",
  process.platform === "win32" ? "lite-task-mcp.exe" : "lite-task-mcp",
);

const proc = spawn(bin, process.argv.slice(2), { stdio: "inherit" });
proc.on("exit", (code) => process.exit(code ?? 0));
proc.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error(
      "lite-task-mcp binary not found. Try reinstalling: npm install -g lite-task-mcp",
    );
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

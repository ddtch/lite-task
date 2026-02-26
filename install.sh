#!/bin/sh
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/your-org/lite-task/main/task-light/install.sh | sh
#   INSTALL_DIR=~/.local/bin sh install.sh
#   VERSION=0.2.0 sh install.sh

set -e

REPO="your-org/lite-task"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
VERSION="${VERSION:-}"

# ── detect platform ──────────────────────────────────────────────────────────
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *)      echo "Error: unsupported OS: $OS" >&2; exit 1 ;;
esac

case "$ARCH" in
  x86_64)        ARCH_NAME="x64" ;;
  arm64|aarch64) ARCH_NAME="arm64" ;;
  *)             echo "Error: unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

BINARY="lite-task-mcp-${PLATFORM}-${ARCH_NAME}"

# ── resolve version ───────────────────────────────────────────────────────────
if [ -z "$VERSION" ]; then
  echo "Fetching latest release..."
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed 's/.*"v\([^"]*\)".*/\1/')
fi

# ── download ──────────────────────────────────────────────────────────────────
URL="https://github.com/${REPO}/releases/download/v${VERSION}/${BINARY}"
DEST="${INSTALL_DIR}/lite-task-mcp"

echo "Downloading lite-task-mcp v${VERSION} (${PLATFORM}-${ARCH_NAME})..."

if ! curl -fsSL "$URL" -o "$DEST" 2>/dev/null; then
  # Fallback: try with sudo if destination isn't writable
  echo "Permission denied — retrying with sudo..."
  curl -fsSL "$URL" | sudo tee "$DEST" > /dev/null
  sudo chmod +x "$DEST"
else
  chmod +x "$DEST"
fi

echo ""
echo "✓ Installed to $DEST"
echo ""
echo "Usage:"
echo "  LITE_TASK_URL=http://localhost:8011 lite-task-mcp"

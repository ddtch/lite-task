# This formula lives in a separate tap repo: github.com/your-org/homebrew-lite-task
# Users install with:
#   brew tap your-org/lite-task
#   brew install lite-task-mcp

class LiteTaskMcp < Formula
  desc "MCP server for lite-task — connect AI tools to your local task manager"
  homepage "https://github.com/your-org/lite-task"
  version "0.1.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/your-org/lite-task/releases/download/v#{version}/lite-task-mcp-macos-arm64"
      sha256 "PLACEHOLDER_MACOS_ARM64_SHA256"
    end
    on_intel do
      url "https://github.com/your-org/lite-task/releases/download/v#{version}/lite-task-mcp-macos-x64"
      sha256 "PLACEHOLDER_MACOS_X64_SHA256"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/your-org/lite-task/releases/download/v#{version}/lite-task-mcp-linux-arm64"
      sha256 "PLACEHOLDER_LINUX_ARM64_SHA256"
    end
    on_intel do
      url "https://github.com/your-org/lite-task/releases/download/v#{version}/lite-task-mcp-linux-x64"
      sha256 "PLACEHOLDER_LINUX_X64_SHA256"
    end
  end

  def install
    bin.install stable.url.split("/").last => "lite-task-mcp"
  end

  test do
    output = shell_output("echo '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}' | LITE_TASK_URL=http://localhost:9 #{bin}/lite-task-mcp 2>&1", 1)
    assert_match "jsonrpc", output
  end
end

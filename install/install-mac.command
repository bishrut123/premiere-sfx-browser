#!/bin/bash
# SFX Browser installer for macOS.
# Double-click this file (from the unzipped download), or run in Terminal:
#   curl -fsSL https://raw.githubusercontent.com/bishrut123/premiere-sfx-browser/main/install/install-mac.command | bash
set -euo pipefail

REPO="bishrut123/premiere-sfx-browser"
DEST_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$DEST_DIR/sfx-browser"

echo "=== SFX Browser installer ==="

# 1. Find the panel files: next to this script (unzipped download), or download the latest release.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)"
SRC="$HERE/sfx-browser"
TMP=""
if [ ! -f "$SRC/CSXS/manifest.xml" ]; then
  echo "Downloading the latest version from GitHub…"
  TMP="$(mktemp -d)"
  curl -fsSL "https://github.com/$REPO/releases/latest/download/SFX-Browser.zip" -o "$TMP/SFX-Browser.zip"
  unzip -q "$TMP/SFX-Browser.zip" -d "$TMP"
  SRC="$TMP/SFX-Browser/sfx-browser"
fi
if [ ! -f "$SRC/CSXS/manifest.xml" ]; then
  echo "Could not find the panel files. Make sure you unzipped the whole download." >&2
  exit 1
fi

# 2. Allow unsigned extensions (Premiere 2022–2024 use CSXS 11, 2025+ use CSXS 12).
for v in 10 11 12 13; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done
killall cfprefsd 2>/dev/null || true
echo "✓ Allowed unsigned extensions"

# 3. Copy the panel into the extensions folder (replacing an older version).
mkdir -p "$DEST_DIR"
if [ -L "$DEST" ]; then
  rm "$DEST"            # a link (developer install): remove the link only
elif [ -e "$DEST" ]; then
  rm -rf "$DEST"
fi
cp -R "$SRC" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
echo "✓ Installed to: $DEST"

[ -n "$TMP" ] && rm -rf "$TMP"

echo
echo "Done! Quit Premiere Pro completely (Cmd+Q), reopen it, then go to"
echo "Window > Extensions > SFX Browser."
echo

#!/bin/bash
# Builds dist/SFX-Browser.zip for a GitHub release:
#   SFX-Browser/
#     install-mac.command, install-windows.bat, HOW TO INSTALL.txt
#     sfx-browser/   (the extension: only git-tracked runtime files)
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="dist"
STAGE="$OUT/SFX-Browser"
rm -rf "$OUT"
mkdir -p "$STAGE/sfx-browser"

# Extension files: everything tracked except dev/repo-only files.
git ls-files | grep -vE '^(install/|tools/|TESTING\.md$|\.debug$|\.git)' | while read -r f; do
  mkdir -p "$STAGE/sfx-browser/$(dirname "$f")"
  cp "$f" "$STAGE/sfx-browser/$f"
done

cp install/install-mac.command install/install-windows.bat "install/HOW TO INSTALL.txt" "$STAGE/"
chmod +x "$STAGE/install-mac.command"
# Windows files need CRLF line endings.
perl -pi -e 's/\r?\n/\r\n/' "$STAGE/install-windows.bat" "$STAGE/HOW TO INSTALL.txt"

(cd "$OUT" && COPYFILE_DISABLE=1 zip -qrX SFX-Browser.zip SFX-Browser -x '*/._*' '*.DS_Store')
echo "Built $OUT/SFX-Browser.zip"
unzip -l "$OUT/SFX-Browser.zip"

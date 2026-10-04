# SFX Browser — Premiere Pro panel

A local sound-effects browser for Premiere Pro: folder tree, instant search, preview,
favorites, drag-to-timeline and click-to-add. No account, no limits. Read-only on your library.

Built as a **CEP** extension (HTML/JS + Node.js + ExtendScript). Works on Windows and macOS,
Premiere Pro 2022 (22.0) and later.

## Folder layout

```
sfx-browser/
  CSXS/manifest.xml   extension manifest (id, host versions, Node enabled)
  index.html          panel UI
  css/style.css       dark compact styling
  js/main.js          panel logic (scan, search, preview, favorites, drag)
  jsx/host.jsx        ExtendScript running inside Premiere (import, insert)
  .debug              enables Chrome DevTools at http://localhost:8099
```

## Install

The extension is unsigned, so you first allow unsigned extensions, then put the
`sfx-browser` folder in your user CEP extensions folder.

### 1. Allow unsigned extensions (once per machine)

Premiere 2022–2024 use CSXS 11, Premiere 2025+ use CSXS 12. Set all three keys; extra ones do no harm.

**macOS** (Terminal):

```bash
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
defaults write com.adobe.CSXS.13 PlayerDebugMode 1
```

If it doesn't take effect, log out and back in (macOS caches preferences), or run `killall cfprefsd`.

**Windows** (Command Prompt, no admin needed):

```bat
reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f
reg add HKCU\Software\Adobe\CSXS.13 /v PlayerDebugMode /t REG_SZ /d 1 /f
```

### 2. Put the folder in the extensions directory

The folder must be at:

- **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/sfx-browser`
- **Windows:** `%APPDATA%\Adobe\CEP\extensions\sfx-browser`
  (i.e. `C:\Users\<you>\AppData\Roaming\Adobe\CEP\extensions\sfx-browser`)

Create the `CEP\extensions` folders if they don't exist. Either **copy** the folder there,
or **link** it so edits apply without recopying (recommended while we're building):

**macOS:**

```bash
mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions
ln -s "/path/to/sfx-browser" ~/Library/Application\ Support/Adobe/CEP/extensions/sfx-browser
```

**Windows** (Command Prompt; a junction needs no admin):

```bat
mkdir "%APPDATA%\Adobe\CEP\extensions"
mklink /J "%APPDATA%\Adobe\CEP\extensions\sfx-browser" "D:\path\to\sfx-browser"
```

### 3. Open the panel

Restart Premiere Pro, then **Window > Extensions > SFX Browser**. Dock it wherever you like;
it works narrow (below ~320 px wide the folder tree collapses behind the ☰ button).

## Update

- **Linked install:** replace/edit files in the source folder, then close and reopen the panel
  (Window > Extensions > SFX Browser). Changes to `CSXS/manifest.xml`
  need a Premiere restart.
- **Copied install:** delete the old `sfx-browser` folder in the extensions directory, copy the
  new one in, restart Premiere.

Your settings, index cache and favorites are stored outside the extension folder, so updating
never loses them.

## Debugging

With the panel open, browse to `http://localhost:8099` in Chrome to get DevTools for the panel.

## Uninstall

Delete the `sfx-browser` folder (or link) from the extensions directory.

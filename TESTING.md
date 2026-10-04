# Manual test checklist

Run on both macOS and Windows. Tick each item.

## Stage 1 — Panel loads

- [ ] Window > Extensions shows **SFX Browser**; the panel opens.
- [ ] Status bar reads `Panel loaded · Premiere <version> · Node <version> · …`.
- [ ] With a sequence open, the status bar shows `Seq: <name>`; with none, `No active sequence`
      (reopen the panel after switching to refresh).
- [ ] Dock the panel narrow (< 320 px): the ☰ button appears and toggles the folder pane.
- [ ] `http://localhost:8099` in Chrome opens DevTools for the panel, no red errors in Console.

## Stage 2 — Folder tree, scan, search

- [ ] Empty panel says "No library folders yet. Click + to add your SFX folder."
- [ ] **+** opens a folder picker; choose your SFX folder. Status counts up `Scanning… N files`,
      then shows `N sounds`. The tree shows the root with your folders and counts.
- [ ] Click a folder: list shows its sounds *including subfolders*; count matches the tree.
- [ ] ▸/▾ expands/collapses folders; expansion is remembered after reopening the panel.
- [ ] **All Sounds** shows the whole library.
- [ ] Type in search: results update on every keystroke with no lag; `whoosh big` matches names
      containing both words. Esc clears search and returns to the selected folder.
- [ ] Scroll quickly through thousands of rows: smooth, no blank gaps.
- [ ] Close and reopen the panel: list appears immediately (from cache), then refreshes quietly.
- [ ] Add a new .wav to the library in Finder/Explorer, click **↻**: it appears.
- [ ] Try adding a subfolder of an existing root: rejected with a message.
- [ ] Hover the root, click **×**, then **Remove?**: root disappears; library files untouched.
- [ ] Unplug/unmount the library drive and reopen the panel: root shows `(offline)` in red,
      sounds are dimmed, status says `Not connected: <name> — showing last scan`.
- [ ] macOS `._` files and non-audio files never appear.

## Stage 3 — Preview

- [ ] Click a sound: it plays immediately; ▶ appears and a blue progress line runs under the row.
- [ ] Click another sound: the first stops, the new one plays.
- [ ] Click the playing sound again: it restarts from the beginning.
- [ ] Space pauses (❚❚ shown) and resumes. When a sound has finished, Space plays it again.
      Space must NOT start/stop Premiere's timeline while the panel is focused.
- [ ] The ▶/❚❚ button under the waveform pauses and resumes too.
- [ ] ↑/↓ move through the list and each sound auto-previews; the list scrolls to keep it visible.
- [ ] ↑/↓ also work while the cursor is in the search box (Space there types a space).
- [ ] .wav, .mp3, .m4a and .aif/.aiff all preview.
- [ ] Waveform pane appears at the bottom for the selected sound: two lanes for stereo, one for mono.
- [ ] Blue playhead moves with playback; time reads `current / total`.
- [ ] Click anywhere on the waveform: playback jumps there (and starts if paused/finished).
      Drag across it to scrub.
- [ ] Arrowing quickly through the list doesn't lag; returning to a sound shows its waveform instantly.
- [ ] Rename a file in Finder/Explorer (without rescanning), click it in the panel:
      `File missing or moved: … — click ↻ to rescan` appears in red.
- [ ] Unmount the library drive, click a sound: `Library "<name>" is not connected`.
- [ ] A corrupt/unsupported file (e.g. rename a .txt to .wav): `Can't preview …` message, no freeze.

## Stage 4 — Add at playhead (+ dB)

Use a scratch sequence for these.

- [ ] Select a sound, click **Add**: it lands at the playhead on the first audio track that is empty
      for the whole length of the sound. Status: `Added <name> to A<n>`.
- [ ] Double-clicking a sound does the same.
- [ ] Project panel: a bin **SFX** exists and contains the sound.
- [ ] Add the same sound again elsewhere: no second copy appears in the Project panel (reused).
- [ ] A sound already imported elsewhere in the project (outside SFX) is reused, not re-imported.
- [ ] Fill every audio track at the playhead, click Add: a new audio track is created at the bottom
      and the sound goes there (`(new track)`).
- [ ] Locked tracks are skipped.
- [ ] Set dB to −12, Add: Effect Controls > Volume > Level shows −12.0 dB. Set +6: shows +6.0 dB.
      0 dB leaves the level untouched. Double-click the slider or click ↺: resets to 0. Value is remembered.
- [ ] Close all sequences, click Add: `No active sequence — open a sequence in the Timeline first`.
- [ ] Rename a library file (no rescan), Add it: `File missing or moved…`.
- [ ] Ctrl/Cmd+Z in Premiere undoes the placement.

## Stage 5 — Drag & drop

- [ ] Drag a sound from the list onto a timeline audio track: it's placed where you drop it.
- [ ] Within a second or two the status says `Dropped <name>` and, if dB ≠ 0, its Volume Level
      matches the slider.
- [ ] The dropped sound's project item ends up in the **SFX** bin.
- [ ] Drag a sound into the Project panel: it's imported and moved into the SFX bin.
- [ ] Known limit: if the same file is already in the project, Premiere may still create a second
      project item on drop (Premiere does the drop import itself). Click-to-add always reuses.

# Unified Repo Tool

Single‑page client‑side tool that unifies:
- Cleaner (select & delete),
- Bundle (export selection JSON / list),
- Deploy (deploy ZIP or single file to a target root directory),
with a **console** that logs both **DRYRUN** and **APPLY** actions.

## Files
- `index.html`
- `styles.css`
- `app.js`

## How to use
1. Open `index.html` in a modern browser.
2. Fill **Owner**, **Repository**, **Branch**, **Token** (fine‑grained, `contents:read/write`).
3. Click **Connect** to load the Git tree.
4. Use the **tree** to select files/folders (tri‑state checkboxes).
5. Actions:
   - **A** Export JSON of selection (copy/download).
   - **B** Export listing (text or JSON).
   - **C** Delete selected (dry‑run first, then apply).
   - **D** Deploy ZIP or single file into the chosen target root (Patch or Replace).
6. The **Console** logs all DRYRUN/APPLY events and can be copied or downloaded.

## Notes
- All operations run on the client; the PAT is never sent to any server other than GitHub.
- Replace mode for deploy will delete files in the target root that are absent from the archive (be careful).
- Protected paths are skipped unless explicitly allowed.

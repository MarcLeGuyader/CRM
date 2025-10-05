
# Repo Cleaner Tool (Client-side)

This tool allows you to **clean your GitHub repository** directly from your browser — without any backend — 
by using the GitHub API (Personal Access Token with `contents:read/write` permission).

## Features
- Dry-run analysis before deletion.
- Selective deletion (keeps only listed folders/files).
- Visual progress and log.
- Downloadable JSON report.

## Default keep list
- `assets/`
- `spec/`
- `tools/`
- `.github/`
- `README.md`
- `LICENSE`

## Usage
1. Open `cleaner.html` in your browser.
2. Enter your GitHub repo info and PAT.
3. Review the "Keep list".
4. Click **Analyze (Dry-run)** to preview deletions.
5. Click **Cleanup (Apply)** to remove unwanted files.
6. Optionally **Download report**.

## Security
Test on a branch or fork before applying to main.

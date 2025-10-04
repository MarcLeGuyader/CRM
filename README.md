# CRM (Spec-first scaffold)

This repository is generated from the agreed specifications.

## Sections
- Top Banner (RGB 75,134,128) with logo and buttons.
- Filter Console (collapsible) between banner and opportunities list.
- Opportunities List with alternating rows RGB(216,214,208) and columns including Company + Contact full name.
- Debug Console (collapsible) at bottom.

All buttons are wired to no-op handlers (stubs) that call into `core/*` for future implementation.

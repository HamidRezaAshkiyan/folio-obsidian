# Folio Bullet Journal — Obsidian Plugin

An Obsidian plugin built specifically for the **Folio** Bullet Journal Markdown and Vault convention.

## Features

- **Dedicated Bullet Journal View**:
  - Switch between **Daily Log**, **Spaces** (`Spaces/*.md`), **Future Log** (`Future Log.md`), and a vault-wide **Carry to Paper** queue (`[paper:no]`).
  - Day navigation (`◀` `Today` `▶`) and editable **Notebook Page** (`page: 42` frontmatter).
  - Rapid-log bar supporting Folio prefixes (`. `, `o `, `= `, `- `, `*. `, `!- `).
  - One-click `.` ↔ `×` completion toggle, `*` Priority / `!` Inspiration modifiers, `[paper:no]` ↔ `[paper:ok]` toggles, and smart Migration (`>` Tomorrow / Space, `<` Future Log).
  - Dynamic `#tag` filter chips, signifier filters, clickable `[[wikilinks]]`, and `AUTO` / `LTR` / `RTL` text direction (Persian/Arabic/Hebrew).
  - Auto-maintains `Daily Notes/YYYY-MM-index.md` on save.
- **In-Note Rendering (Reading View & Live Preview)**:
  - Styled signifiers, modifiers, muted `[HH:MM]` timestamps, clickable `.` ↔ `×` toggles, clickable `[paper:no]` / `[paper:ok]` pills, and automatic RTL alignment directly inside regular Markdown notes.
- **Editor & Global Commands**:
  - `Open Bullet Journal view`
  - `Open today's Daily Log in Folio view`
  - `Quick rapid log to today's Daily Log`
  - `Toggle Folio Action (.) ↔ Done (×) on current line`
  - `Toggle Carry to Paper ([paper:no] ↔ [paper:ok]) on current line`

## Build

```bash
cd obsidian-plugin
npm install
npm run build
```

This generates `main.js` alongside `manifest.json` and `styles.css`.

## Install in Your Obsidian Vault

Copy (or symlink) `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/folio-bujo/` directory:

```bash
VAULT=~/Obsidian/BuJo-Vault
mkdir -p "$VAULT/.obsidian/plugins/folio-bujo"
cp manifest.json main.js styles.css "$VAULT/.obsidian/plugins/folio-bujo/"
```

Then in Obsidian:
1. Go to **Settings → Community plugins** and enable community plugins if needed.
2. Click **Reload** and toggle **Folio Bullet Journal** on.
3. Click the notebook icon in the left ribbon (or run **Folio Bullet Journal: Open Bullet Journal view** from the Command Palette).

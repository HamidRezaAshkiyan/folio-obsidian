# AGENTS.md — Folio Bullet Journal (Obsidian Plugin)

## Overview
Obsidian community plugin (`folio-bujo`) implementing the **Folio** Bullet Journal Markdown and vault convention. Provides a dedicated Bullet Journal view (Daily Log, Spaces, Future Log, and vault-wide Carry-to-Paper queue), in-note Live Preview and Reading View decorations, RTL/LTR auto-detection (Persian/Arabic/Hebrew), and editor commands for rapid logging.

## Tech Stack & Requirements
- **Language:** TypeScript (`^5.6.3`, targeting ES2020)
- **Bundler:** esbuild (`^0.24.0`, CommonJS output to `main.js`)
- **Platform:** Obsidian Plugin API (`obsidian ^1.7.2`, `minAppVersion: 1.5.0`, desktop & mobile)
- **Editor Engine:** CodeMirror 6 (`@codemirror/state`, `@codemirror/view`) for Live Preview decorations
- **Testing:** Node.js built-in test runner (`node:test`) with in-memory esbuild bundling

## Repository Structure
```text
.
├── manifest.json          # Obsidian plugin metadata (id: folio-bujo, isDesktopOnly: false)
├── versions.json          # Plugin version -> minAppVersion map
├── package.json           # Scripts (dev, build, test) & devDependencies
├── esbuild.config.mjs     # CJS bundler -> main.js (externals: obsidian, electron, @codemirror/*, @lezer/*)
├── tsconfig.json          # TypeScript config
├── styles.css             # Plugin styling (journal view, signifiers, paper badges, RTL alignment)
├── src/
│   ├── main.ts            # Plugin entry point (FolioPlugin): view, ribbon, 5 commands, extensions
│   ├── model.ts           # Pure data model, Markdown parser/serializer, signifiers, RTL & tag helpers
│   ├── vault.ts           # FolioVaultService: daily logs, spaces, future log, monthly index, paper queue
│   ├── view.ts            # FolioJournalView (ItemView): Daily/Spaces/Future/Carry-to-Paper UI
│   ├── live-preview.ts    # CodeMirror 6 ViewPlugin for in-editor signifiers, timestamps, and pills
│   ├── reading-view.ts    # MarkdownPostProcessor for Reading View rendering & click toggles
│   ├── modals.ts          # QuickRapidLogModal and migration modals
│   └── settings.ts        # FolioSettings interface, defaults, and FolioSettingTab
└── tests/
    └── model.test.mjs     # Unit tests for parser/serializer roundtrips, RTL, tags, and spans
```

## Architecture & Key Flows
- **Entry Point (`src/main.ts`):** `FolioPlugin` loads settings, initializes `FolioVaultService`, registers `FolioJournalView` (`FOLIO_VIEW_TYPE`), adds the ribbon icon and 5 commands (`open-journal`, `open-today`, `quick-rapid-log`, `toggle-action-done-line`, `toggle-paper-synced-line`), and wires `registerFolioReadingView` + `createFolioLivePreviewExtension`.
- **Markdown Model (`src/model.ts`):** Pure, Obsidian-free module that parses/serializes Folio entry lines (`[modifier][signifier] [HH:MM] text [paper:ok|no]`), Obsidian checklists (`- [ ]` / `- [x]`), YAML frontmatter (`date`, `page`, `space`, `tags`), Unicode `#tags`, RTL detection, and exact character spans (`ParsedLineSpans`) for CodeMirror decorations.
- **Vault Layer (`src/vault.ts`):** Manages vault folder structure (`Daily Notes/`, `Spaces/`, `Reviews/`, `Future Log.md`), creates/loads/saves `FolioDocument`s, auto-updates `Daily Notes/YYYY-MM-index.md` on save, and scans `[paper:no]` entries across the vault.
- **Dual Rendering:** `src/live-preview.ts` (CM6 extension) and `src/reading-view.ts` (Markdown post-processor) both consume `model.ts` span/line parsers to render clickable `.` ↔ `×` and `[paper:no]` ↔ `[paper:ok]` controls directly in regular notes.

## Development & Commands
```bash
npm install          # Install dev dependencies
npm run dev          # Watch mode via esbuild (inline sourcemaps -> main.js)
npm run build        # Typecheck (tsc -noEmit -skipLibCheck) + production minified main.js
npm test             # Run unit tests (node --test tests/model.test.mjs)
```
To test locally in an Obsidian vault, copy or symlink `manifest.json`, `main.js`, and `styles.css` into `<vault>/.obsidian/plugins/folio-bujo/`.

## Configuration & Environment
No environment variables are used. Runtime settings are stored by Obsidian in `data.json` via `FolioSettings` (`src/settings.ts`):
- `dailyNotesFolder` (`"Daily Notes"`), `spacesFolder` (`"Spaces"`), `reviewsFolder` (`"Reviews"`), `futureLogPath` (`"Future Log.md"`)
- `defaultPage` (`1`), `directionMode` (`"auto" | "ltr" | "rtl"`)
- Feature toggles: `enableReadingView`, `enableLivePreview`, `showPaperBadges`, `autoUpdateMonthlyIndex`

## Conventions & Gotchas
- **Keep `src/model.ts` pure:** Do not import `obsidian` inside `src/model.ts`. `tests/model.test.mjs` bundles `src/model.ts` in-memory with esbuild and runs it in plain Node without Obsidian mocks.
- **Lossless Roundtripping:** Changes to `parseFolioDocument` / `serializeFolioDocument` must preserve frontmatter fields (`extraFrontmatter`), prose lines, timestamps, modifiers (`*`, `!`), signifiers (`.`, `×`, `>`, `<`, `~`, `o`, `=`, `-`), and `[paper:ok|no]` tags.
- **CM6 & Obsidian Externals:** Never bundle `obsidian`, `electron`, `@codemirror/*`, or `@lezer/*` — `esbuild.config.mjs` marks them external so the plugin shares Obsidian's runtime instances.
- **Build Artifacts:** `main.js` is generated on build; verify both `npm run build` and `npm test` pass before releasing.
- **Mobile Compatibility:** `isDesktopOnly` is `false` in `manifest.json`; avoid Node/Electron-only APIs in `src/`.

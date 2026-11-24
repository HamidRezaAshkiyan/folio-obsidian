import { Editor, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import {
  formatEntryLine,
  isActionFamily,
  nextEntryId,
  parseEntryLine,
  parseRapidInputFull,
  toggleDone,
} from "./model";
import { DEFAULT_SETTINGS, FolioSettingTab, FolioSettings } from "./settings";
import { FolioVaultService } from "./vault";
import { FOLIO_VIEW_TYPE, FolioJournalView } from "./view";
import { QuickRapidLogModal } from "./modals";
import { registerFolioReadingView } from "./reading-view";
import { createFolioLivePreviewExtension } from "./live-preview";

export default class FolioPlugin extends Plugin {
  settings: FolioSettings = { ...DEFAULT_SETTINGS };
  vaultService!: FolioVaultService;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.vaultService = new FolioVaultService(this.app, () => this.settings);

    this.registerView(FOLIO_VIEW_TYPE, (leaf) => new FolioJournalView(leaf, this));

    this.addRibbonIcon("book-open", "Open Folio Bullet Journal", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-journal",
      name: "Open bullet journal view",
      callback: () => {
        void this.activateView();
      },
    });

    this.addCommand({
      id: "open-today",
      name: "Open today's daily log",
      callback: async () => {
        const view = await this.activateView();
        await view.openDaily(this.vaultService.todayDateStr());
      },
    });

    this.addCommand({
      id: "quick-rapid-log",
      name: "Quick rapid log to today's daily log",
      callback: () => {
        const today = this.vaultService.todayDateStr();
        new QuickRapidLogModal(this.app, `Daily Notes/${today}`, async (raw, defaultSig) => {
          const { modifier, signifier, text } = parseRapidInputFull(raw, defaultSig);
          if (!text) return;
          const doc = await this.vaultService.openOrCreateDaily(today);
          doc.entries.push({
            id: nextEntryId(doc),
            time: this.vaultService.nowHHMM(),
            modifier,
            signifier,
            text,
            paperSynced: false,
          });
          await this.vaultService.saveDocument(doc);
          new Notice("Logged entry to today's daily log");
          this.refreshViews();
        }).open();
      },
    });

    this.addCommand({
      id: "toggle-action-done-line",
      name: "Toggle action done on current line",
      editorCallback: (editor: Editor) => {
        const lineNum = editor.getCursor().line;
        const lineText = editor.getLine(lineNum);
        const parsed = parseEntryLine(lineText);
        if (!parsed || !isActionFamily(parsed.signifier)) {
          new Notice("Current line is not an action entry");
          return;
        }
        const updated = formatEntryLine({
          ...parsed,
          signifier: toggleDone(parsed.signifier),
        });
        editor.setLine(lineNum, updated);
      },
    });

    this.addCommand({
      id: "toggle-paper-synced-line",
      name: "Toggle carry-to-paper on current line",
      editorCallback: (editor: Editor) => {
        const lineNum = editor.getCursor().line;
        const lineText = editor.getLine(lineNum);
        const parsed = parseEntryLine(lineText);
        if (!parsed) {
          new Notice("Current line is not a rapid-log entry");
          return;
        }
        const updated = formatEntryLine({
          ...parsed,
          paperSynced: !parsed.paperSynced,
        });
        editor.setLine(lineNum, updated);
      },
    });

    registerFolioReadingView(this);
    this.registerEditorExtension(createFolioLivePreviewExtension(this));
    this.addSettingTab(new FolioSettingTab(this.app, this));
  }

  onunload(): void {
    // Views and listeners registered via Obsidian helpers are cleaned up automatically.
  }

  async activateView(): Promise<FolioJournalView> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(FOLIO_VIEW_TYPE)[0] ?? null;

    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: FOLIO_VIEW_TYPE, active: true });
    }

    workspace.revealLeaf(leaf);
    return leaf.view as FolioJournalView;
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(FOLIO_VIEW_TYPE)) {
      if (leaf.view instanceof FolioJournalView) {
        void leaf.view.refresh();
      }
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

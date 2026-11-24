import { ItemView, Menu, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import {
  Entry,
  EntryFilter,
  FolioDocument,
  SIGNIFIER_LABEL,
  SIGNIFIER_SYMBOL,
  Signifier,
  SpaceInfo,
  collectInlineTags,
  entryHasTag,
  isActionFamily,
  isRtlText,
  matchesFilter,
  modifierSymbol,
  nextEntryId,
  parseRapidInputFull,
  toggleDone,
  toggleInspiration,
  togglePriority,
} from "./model";
import { MigrateEntryModal, MigrationTarget, PromptModal } from "./modals";
import type FolioPlugin from "./main";
import type { PaperPendingItem } from "./vault";

export const FOLIO_VIEW_TYPE = "folio-bujo-view";

type ViewMode = "document" | "carry-to-paper";

export class FolioJournalView extends ItemView {
  private viewMode: ViewMode = "document";
  private activeDate: string;
  private activeDocPath: string;
  private currentDoc: FolioDocument | null = null;
  private spaces: SpaceInfo[] = [];
  private paperQueue: PaperPendingItem[] = [];

  private activeFilter: EntryFilter = "all";
  private activeTag: string | null = null;
  private searchQuery = "";
  private rapidSignifier: Signifier = "action";
  private editingEntryId: number | null = null;
  private refreshTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: FolioPlugin
  ) {
    super(leaf);
    this.activeDate = this.plugin.vaultService.todayDateStr();
    this.activeDocPath = this.plugin.vaultService.dailyPath(this.activeDate);
  }

  getViewType(): string {
    return FOLIO_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Folio Bullet Journal";
  }

  getIcon(): string {
    return "book-open";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("folio-view-root");
    await this.plugin.vaultService.ensureStructure();
    await this.loadAndRender();

    const scheduleRefresh = () => {
      if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => {
        this.refreshTimer = null;
        void this.loadAndRender();
      }, 250);
    };

    this.registerEvent(this.app.vault.on("modify", scheduleRefresh));
    this.registerEvent(this.app.vault.on("create", scheduleRefresh));
    this.registerEvent(this.app.vault.on("delete", scheduleRefresh));
    this.registerEvent(this.app.vault.on("rename", scheduleRefresh));
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.contentEl.empty();
  }

  async openDaily(dateStr?: string): Promise<void> {
    this.viewMode = "document";
    this.activeDate = dateStr ?? this.plugin.vaultService.todayDateStr();
    this.activeDocPath = this.plugin.vaultService.dailyPath(this.activeDate);
    this.activeTag = null;
    this.editingEntryId = null;
    await this.loadAndRender();
  }

  async openDocumentPath(path: string): Promise<void> {
    this.viewMode = "document";
    this.activeDocPath = path;
    this.activeTag = null;
    this.editingEntryId = null;
    await this.loadAndRender();
  }

  async refresh(): Promise<void> {
    await this.loadAndRender();
  }

  private async loadAndRender(): Promise<void> {
    const svc = this.plugin.vaultService;
    this.spaces = await svc.listSpaces(this.activeDate);

    if (this.viewMode === "carry-to-paper") {
      this.paperQueue = await svc.collectPaperPending();
      this.render();
      return;
    }

    if (this.activeDocPath === svc.dailyPath(this.activeDate)) {
      this.currentDoc = await svc.openOrCreateDaily(this.activeDate);
    } else if (this.activeDocPath.toLowerCase() === svc.folders.futureLog.toLowerCase()) {
      this.currentDoc = await svc.openOrCreateFutureLog();
    } else {
      this.currentDoc = await svc.loadDocument(this.activeDocPath);
      if (!this.currentDoc) {
        this.currentDoc = await svc.openOrCreateDaily(this.activeDate);
        this.activeDocPath = this.currentDoc.path;
      }
    }

    this.render();
  }

  private resolveDirection(text: string): "rtl" | "ltr" {
    const mode = this.plugin.settings.directionMode;
    if (mode === "rtl") return "rtl";
    if (mode === "ltr") return "ltr";
    return isRtlText(text) ? "rtl" : "ltr";
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();

    const layout = root.createDiv({ cls: "folio-layout" });
    this.renderSidebar(layout);

    const main = layout.createDiv({ cls: "folio-main" });
    if (this.viewMode === "carry-to-paper") {
      this.renderCarryToPaperView(main);
    } else if (this.currentDoc) {
      this.renderDocumentView(main, this.currentDoc);
    }
  }

  private renderSidebar(parent: HTMLElement): void {
    const sidebar = parent.createDiv({ cls: "folio-sidebar" });

    const brand = sidebar.createDiv({ cls: "folio-sidebar-header" });
    brand.createSpan({ text: "FOLIO", cls: "folio-brand-title" });
    brand.createSpan({ text: "BuJo", cls: "folio-brand-badge" });

    const navList = sidebar.createDiv({ cls: "folio-nav-list" });
    navList.createDiv({ text: "SPACES", cls: "folio-section-label" });

    for (const space of this.spaces) {
      const isActive =
        this.viewMode === "document" &&
        (space.isDaily
          ? this.activeDocPath === this.plugin.vaultService.dailyPath(this.activeDate)
          : this.activeDocPath === space.path);

      const item = navList.createEl("button", {
        cls: `folio-nav-item ${isActive ? "is-active" : ""}`,
      });
      const iconSpan = item.createSpan({ cls: "folio-nav-icon" });
      setIcon(iconSpan, space.isDaily ? "calendar" : "folder");
      item.createSpan({ text: space.name, cls: "folio-nav-label" });
      item.createSpan({ text: String(space.entryCount), cls: "folio-nav-count" });

      item.addEventListener("click", () => {
        if (space.isDaily) {
          void this.openDaily(this.activeDate);
        } else {
          void this.openDocumentPath(space.path);
        }
      });
    }

    const addSpaceBtn = navList.createEl("button", {
      cls: "folio-nav-item folio-nav-add",
    });
    const plusIcon = addSpaceBtn.createSpan({ cls: "folio-nav-icon" });
    setIcon(plusIcon, "plus");
    addSpaceBtn.createSpan({ text: "New Space", cls: "folio-nav-label" });
    addSpaceBtn.addEventListener("click", () => {
      new PromptModal(this.app, "Create New Space", "e.g. Studio & Work", "", async (name) => {
        try {
          const doc = await this.plugin.vaultService.createSpace(name);
          await this.openDocumentPath(doc.path);
        } catch (err) {
          new Notice(String(err));
        }
      }).open();
    });

    navList.createDiv({ text: "COLLECTIONS", cls: "folio-section-label" });

    const futurePath = this.plugin.vaultService.folders.futureLog;
    const futureBtn = navList.createEl("button", {
      cls: `folio-nav-item ${
        this.viewMode === "document" && this.activeDocPath.toLowerCase() === futurePath.toLowerCase()
          ? "is-active"
          : ""
      }`,
    });
    const futureIcon = futureBtn.createSpan({ cls: "folio-nav-icon" });
    setIcon(futureIcon, "calendar-clock");
    futureBtn.createSpan({ text: "Future Log", cls: "folio-nav-label" });
    futureBtn.addEventListener("click", () => {
      void this.openDocumentPath(futurePath);
    });

    const paperBtn = navList.createEl("button", {
      cls: `folio-nav-item ${this.viewMode === "carry-to-paper" ? "is-active" : ""}`,
    });
    const paperIcon = paperBtn.createSpan({ cls: "folio-nav-icon" });
    setIcon(paperIcon, "notebook-pen");
    paperBtn.createSpan({ text: "Carry to Paper", cls: "folio-nav-label" });
    paperBtn.addEventListener("click", () => {
      this.viewMode = "carry-to-paper";
      void this.loadAndRender();
    });
  }

  private renderDocumentView(main: HTMLElement, doc: FolioDocument): void {
    // Header bar
    const header = main.createDiv({ cls: "folio-header" });
    const titleGroup = header.createDiv({ cls: "folio-title-group" });
    titleGroup.createEl("h2", { text: doc.title, cls: "folio-doc-title" });

    if (doc.kind === "daily") {
      const pageBtn = titleGroup.createEl("button", {
        cls: "folio-page-pill",
        text: doc.page !== null ? `Notebook p. ${doc.page}` : "Set p. #",
        attr: { title: "Click to update physical notebook page number" },
      });
      pageBtn.addEventListener("click", () => {
        new PromptModal(
          this.app,
          "Physical Notebook Page",
          "Page number (e.g. 42)",
          doc.page !== null ? String(doc.page) : "",
          async (val) => {
            const parsed = Number.parseInt(val, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              doc.page = parsed;
              await this.plugin.vaultService.saveDocument(doc);
              this.render();
            }
          }
        ).open();
      });
    }

    const controls = header.createDiv({ cls: "folio-header-controls" });

    if (doc.kind === "daily") {
      const prevBtn = controls.createEl("button", { cls: "folio-icon-btn", attr: { title: "Previous Day" } });
      setIcon(prevBtn, "chevron-left");
      prevBtn.addEventListener("click", () => {
        void this.openDaily(this.plugin.vaultService.shiftDate(this.activeDate, -1));
      });

      const todayBtn = controls.createEl("button", { cls: "folio-btn", text: "Today" });
      todayBtn.addEventListener("click", () => {
        void this.openDaily(this.plugin.vaultService.todayDateStr());
      });

      const nextBtn = controls.createEl("button", { cls: "folio-icon-btn", attr: { title: "Next Day" } });
      setIcon(nextBtn, "chevron-right");
      nextBtn.addEventListener("click", () => {
        void this.openDaily(this.plugin.vaultService.shiftDate(this.activeDate, 1));
      });
    }

    const dirBtn = controls.createEl("button", {
      cls: "folio-btn folio-dir-btn",
      text: this.plugin.settings.directionMode.toUpperCase(),
      attr: { title: "Cycle text direction: AUTO / LTR / RTL" },
    });
    dirBtn.addEventListener("click", async () => {
      const order = ["auto", "ltr", "rtl"] as const;
      const idx = order.indexOf(this.plugin.settings.directionMode);
      this.plugin.settings.directionMode = order[(idx + 1) % order.length];
      await this.plugin.saveSettings();
      this.render();
    });

    const openMdBtn = controls.createEl("button", {
      cls: "folio-icon-btn",
      attr: { title: "Open raw Markdown file" },
    });
    setIcon(openMdBtn, "file-text");
    openMdBtn.addEventListener("click", async () => {
      const file = this.app.vault.getAbstractFileByPath(doc.path);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf("tab").openFile(file);
      }
    });

    // Rapid Log Input Bar
    this.renderRapidLogBar(main, doc);

    // Filter + Tag Bar
    this.renderFilterBar(main, doc);

    // Summary stats & Carry-to-Paper quick action
    const pendingCount = doc.entries.filter((e) => !e.paperSynced).length;
    const statsBar = main.createDiv({ cls: "folio-stats-bar" });
    const openActions = doc.entries.filter((e) => e.signifier === "action").length;
    const doneActions = doc.entries.filter((e) => e.signifier === "done").length;
    statsBar.createSpan({
      text: `${doc.entries.length} entries · ${openActions} open · ${doneActions} done`,
      cls: "folio-stats-text",
    });

    if (this.plugin.settings.showPaperBadges && pendingCount > 0) {
      const carryAllBtn = statsBar.createEl("button", {
        cls: "folio-carry-all-btn",
        text: `Mark all ${pendingCount} carried to paper`,
      });
      carryAllBtn.addEventListener("click", async () => {
        for (const e of doc.entries) {
          e.paperSynced = true;
        }
        await this.plugin.vaultService.saveDocument(doc);
        new Notice(`Marked ${pendingCount} entries as [paper:ok]`);
        this.render();
      });
    }

    // Filtered Entries List
    const listEl = main.createDiv({ cls: "folio-entry-list" });
    const needle = this.searchQuery.trim().toLowerCase();
    const filtered = doc.entries.filter((entry) => {
      if (!matchesFilter(entry.signifier, this.activeFilter)) return false;
      if (this.activeTag && !entryHasTag(entry, this.activeTag)) return false;
      if (needle && !entry.text.toLowerCase().includes(needle) && !entry.time.includes(needle)) {
        return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      const emptyEl = listEl.createDiv({ cls: "folio-empty-state" });
      emptyEl.setText(
        doc.entries.length === 0
          ? "No entries yet. Use the rapid-log bar above (. Action, o Event, = Emotion, - Note)."
          : "No entries match the active filters."
      );
    } else {
      for (const entry of filtered) {
        this.renderEntryRow(listEl, doc, entry);
      }
    }
  }

  private renderRapidLogBar(parent: HTMLElement, doc: FolioDocument): void {
    const bar = parent.createDiv({ cls: "folio-rapid-bar" });

    const sigGroup = bar.createDiv({ cls: "folio-sig-selector" });
    const quickSigs: Signifier[] = ["action", "event", "emotion", "note"];
    for (const sig of quickSigs) {
      const btn = sigGroup.createEl("button", {
        cls: `folio-sig-btn folio-sig-${sig} ${this.rapidSignifier === sig ? "is-active" : ""}`,
        text: SIGNIFIER_SYMBOL[sig],
        attr: { title: `${SIGNIFIER_LABEL[sig]} (${SIGNIFIER_SYMBOL[sig]})` },
      });
      btn.addEventListener("click", () => {
        this.rapidSignifier = sig;
        this.render();
      });
    }

    const input = bar.createEl("input", {
      type: "text",
      cls: "folio-rapid-input",
      placeholder: `Rapid log (${SIGNIFIER_SYMBOL[this.rapidSignifier]} ${SIGNIFIER_LABEL[this.rapidSignifier]}) — or prefix . o = - *. !-`,
    });

    const submitEntry = async () => {
      const raw = input.value.trim();
      if (!raw) return;
      const { modifier, signifier, text } = parseRapidInputFull(raw, this.rapidSignifier);
      if (!text) return;

      doc.entries.push({
        id: nextEntryId(doc),
        time: this.plugin.vaultService.nowHHMM(),
        modifier,
        signifier,
        text,
        paperSynced: false,
      });
      input.value = "";
      await this.plugin.vaultService.saveDocument(doc);
      this.render();
    };

    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        void submitEntry();
      }
    });

    const addBtn = bar.createEl("button", { cls: "folio-rapid-submit", text: "Log" });
    addBtn.addEventListener("click", () => void submitEntry());
  }

  private renderFilterBar(parent: HTMLElement, doc: FolioDocument): void {
    const bar = parent.createDiv({ cls: "folio-filter-bar" });

    const filters: Array<{ id: EntryFilter; label: string }> = [
      { id: "all", label: "ALL" },
      { id: "action", label: ". Action" },
      { id: "event", label: "o Event" },
      { id: "emotion", label: "= Emotion" },
      { id: "note", label: "- Note" },
    ];

    const filterGroup = bar.createDiv({ cls: "folio-filter-pills" });
    for (const f of filters) {
      const pill = filterGroup.createEl("button", {
        cls: `folio-pill ${this.activeFilter === f.id ? "is-active" : ""}`,
        text: f.label,
      });
      pill.addEventListener("click", () => {
        this.activeFilter = f.id;
        this.render();
      });
    }

    const searchInput = bar.createEl("input", {
      type: "search",
      cls: "folio-search-input",
      placeholder: "Filter entries…",
      value: this.searchQuery,
    });
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.render();
    });

    const tags = collectInlineTags(doc.entries);
    if (tags.length > 0) {
      const tagRow = parent.createDiv({ cls: "folio-tag-row" });
      for (const tag of tags) {
        const chip = tagRow.createEl("button", {
          cls: `folio-tag-chip ${this.activeTag === tag ? "is-active" : ""}`,
          text: tag,
        });
        chip.addEventListener("click", () => {
          this.activeTag = this.activeTag === tag ? null : tag;
          this.render();
        });
      }
    }
  }

  private renderEntryRow(parent: HTMLElement, doc: FolioDocument, entry: Entry): void {
    const dir = this.resolveDirection(entry.text);
    const row = parent.createDiv({
      cls: `folio-entry-row folio-entry-${entry.signifier} ${
        entry.signifier === "done" || entry.signifier === "cancelled" ? "is-muted" : ""
      } ${dir === "rtl" ? "is-rtl" : "is-ltr"}`,
    });

    // Modifier badge (* or !)
    if (entry.modifier !== "none") {
      row.createSpan({
        cls: `folio-modifier folio-mod-${entry.modifier}`,
        text: modifierSymbol(entry.modifier),
        attr: { title: entry.modifier === "priority" ? "Priority (*)" : "Inspiration (!)" },
      });
    }

    // Clickable signifier button
    const sigBtn = row.createEl("button", {
      cls: `folio-entry-sig folio-sig-${entry.signifier}`,
      text: SIGNIFIER_SYMBOL[entry.signifier],
      attr: {
        title: isActionFamily(entry.signifier)
          ? `${SIGNIFIER_LABEL[entry.signifier]} — click to toggle Done, right-click for menu`
          : `${SIGNIFIER_LABEL[entry.signifier]} — right-click for menu`,
      },
    });
    sigBtn.addEventListener("click", async () => {
      if (isActionFamily(entry.signifier)) {
        entry.signifier = toggleDone(entry.signifier);
        await this.plugin.vaultService.saveDocument(doc);
        this.render();
      }
    });
    sigBtn.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.openEntryContextMenu(evt, doc, entry);
    });

    // Timestamp
    row.createSpan({
      cls: "folio-entry-time",
      text: `[${entry.time}]`,
    });

    // Text or inline editor
    if (this.editingEntryId === entry.id) {
      const editInput = row.createEl("input", {
        type: "text",
        cls: "folio-inline-edit",
        value: entry.text,
        attr: { dir },
      });
      editInput.focus();
      const commit = async () => {
        const next = editInput.value.trim();
        this.editingEntryId = null;
        if (next && next !== entry.text) {
          entry.text = next;
          await this.plugin.vaultService.saveDocument(doc);
        }
        this.render();
      };
      editInput.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          void commit();
        } else if (evt.key === "Escape") {
          this.editingEntryId = null;
          this.render();
        }
      });
      editInput.addEventListener("blur", () => void commit());
    } else {
      const textEl = row.createDiv({
        cls: "folio-entry-text",
        attr: { dir },
      });
      this.renderRichText(textEl, entry.text, doc.path);
      textEl.addEventListener("dblclick", () => {
        this.editingEntryId = entry.id;
        this.render();
      });
    }

    // Carry to Paper pill
    if (this.plugin.settings.showPaperBadges) {
      const paperBtn = row.createEl("button", {
        cls: `folio-paper-pill ${entry.paperSynced ? "is-ok" : "is-no"}`,
        text: entry.paperSynced ? "paper:ok" : "paper:no",
        attr: { title: "Toggle Carry to Paper status" },
      });
      paperBtn.addEventListener("click", async () => {
        entry.paperSynced = !entry.paperSynced;
        await this.plugin.vaultService.saveDocument(doc);
        this.render();
      });
    }

    // Quick hover actions
    const actions = row.createDiv({ cls: "folio-entry-actions" });

    const prioBtn = actions.createEl("button", {
      cls: `folio-mini-btn ${entry.modifier === "priority" ? "is-active" : ""}`,
      text: "*",
      attr: { title: "Toggle Priority (*)" },
    });
    prioBtn.addEventListener("click", async () => {
      entry.modifier = togglePriority(entry.modifier);
      await this.plugin.vaultService.saveDocument(doc);
      this.render();
    });

    const inspBtn = actions.createEl("button", {
      cls: `folio-mini-btn ${entry.modifier === "inspiration" ? "is-active" : ""}`,
      text: "!",
      attr: { title: "Toggle Inspiration (!)" },
    });
    inspBtn.addEventListener("click", async () => {
      entry.modifier = toggleInspiration(entry.modifier);
      await this.plugin.vaultService.saveDocument(doc);
      this.render();
    });

    const migrateBtn = actions.createEl("button", {
      cls: "folio-mini-btn",
      text: ">",
      attr: { title: "Migrate (>) or Schedule (<)" },
    });
    migrateBtn.addEventListener("click", () => {
      this.openMigratePicker(doc, entry);
    });

    const moreBtn = actions.createEl("button", {
      cls: "folio-mini-btn",
      text: "⋯",
      attr: { title: "More actions" },
    });
    moreBtn.addEventListener("click", (evt) => {
      this.openEntryContextMenu(evt, doc, entry);
    });
  }

  private renderRichText(container: HTMLElement, text: string, sourcePath: string): void {
    // Tokenize [[wikilinks]] and #tags
    const regex = /(\[\[[^\]]+\]\]|#[\p{L}\p{N}_\-\u200C]+)/gu;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        container.appendText(text.slice(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith("[[")) {
        const inner = token.slice(2, -2);
        const [target, alias] = inner.split("|");
        const link = container.createEl("a", {
          cls: "folio-wikilink internal-link",
          text: alias ?? target,
          href: target,
        });
        link.addEventListener("click", (evt) => {
          evt.preventDefault();
          void this.app.workspace.openLinkText(target, sourcePath, false);
        });
      } else if (token.startsWith("#")) {
        const tagBtn = container.createEl("span", {
          cls: "folio-inline-tag",
          text: token,
        });
        tagBtn.addEventListener("click", () => {
          const normalized = token.toLowerCase();
          this.activeTag = this.activeTag === normalized ? null : normalized;
          this.render();
        });
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      container.appendText(text.slice(lastIndex));
    }
  }

  private openEntryContextMenu(evt: MouseEvent, doc: FolioDocument, entry: Entry): void {
    const menu = new Menu();

    const sigChoices: Signifier[] = [
      "action",
      "done",
      "event",
      "emotion",
      "note",
      "migrated",
      "scheduled",
      "cancelled",
    ];
    for (const sig of sigChoices) {
      menu.addItem((item) =>
        item
          .setTitle(`${SIGNIFIER_SYMBOL[sig]}  ${SIGNIFIER_LABEL[sig]}`)
          .setChecked(entry.signifier === sig)
          .onClick(async () => {
            entry.signifier = sig;
            await this.plugin.vaultService.saveDocument(doc);
            this.render();
          })
      );
    }

    menu.addSeparator();

    menu.addItem((item) =>
      item.setTitle("Migrate / Schedule…").setIcon("arrow-right").onClick(() => {
        this.openMigratePicker(doc, entry);
      })
    );

    menu.addItem((item) =>
      item.setTitle("Edit text").setIcon("pencil").onClick(() => {
        this.editingEntryId = entry.id;
        this.render();
      })
    );

    menu.addItem((item) =>
      item
        .setTitle(entry.paperSynced ? "Mark [paper:no]" : "Mark [paper:ok]")
        .setIcon("notebook-pen")
        .onClick(async () => {
          entry.paperSynced = !entry.paperSynced;
          await this.plugin.vaultService.saveDocument(doc);
          this.render();
        })
    );

    menu.addSeparator();

    menu.addItem((item) =>
      item.setTitle("Delete entry").setIcon("trash").onClick(async () => {
        doc.entries = doc.entries.filter((e) => e.id !== entry.id);
        await this.plugin.vaultService.saveDocument(doc);
        this.render();
      })
    );

    menu.showAtMouseEvent(evt);
  }

  private openMigratePicker(doc: FolioDocument, entry: Entry): void {
    const svc = this.plugin.vaultService;
    const baseDate = doc.date ?? svc.todayDateStr();
    const tomorrow = svc.shiftDate(baseDate, 1);

    const targets: MigrationTarget[] = [
      {
        label: `> Tomorrow (${tomorrow})`,
        description: svc.dailyPath(tomorrow),
        targetPath: svc.dailyPath(tomorrow),
        scheduled: false,
      },
      {
        label: `< Future Log`,
        description: svc.folders.futureLog,
        targetPath: svc.folders.futureLog,
        scheduled: true,
      },
    ];

    for (const space of this.spaces) {
      if (space.isDaily || space.path === doc.path) continue;
      targets.push({
        label: `> Space: ${space.name}`,
        description: space.path,
        targetPath: space.path,
        scheduled: false,
      });
    }

    new MigrateEntryModal(this.app, targets, async (choice) => {
      try {
        await svc.migrateEntry(doc, entry.id, choice.targetPath, choice.scheduled);
        new Notice(`${choice.scheduled ? "Scheduled (<)" : "Migrated (>)"} to ${choice.label}`);
        await this.loadAndRender();
      } catch (err) {
        new Notice(`Migration failed: ${String(err)}`);
      }
    }).open();
  }

  private renderCarryToPaperView(main: HTMLElement): void {
    const header = main.createDiv({ cls: "folio-header" });
    const titleGroup = header.createDiv({ cls: "folio-title-group" });
    titleGroup.createEl("h2", { text: "Carry to Paper Queue", cls: "folio-doc-title" });
    titleGroup.createSpan({
      text: `${this.paperQueue.length} pending`,
      cls: "folio-page-pill",
    });

    if (this.paperQueue.length === 0) {
      const empty = main.createDiv({ cls: "folio-empty-state" });
      empty.setText("All caught up! Every recent entry is synced to your physical notebook ([paper:ok]).");
      return;
    }

    // Group by document
    const grouped = new Map<string, { title: string; items: PaperPendingItem[] }>();
    for (const item of this.paperQueue) {
      let group = grouped.get(item.docPath);
      if (!group) {
        group = { title: item.docTitle, items: [] };
        grouped.set(item.docPath, group);
      }
      group.items.push(item);
    }

    const list = main.createDiv({ cls: "folio-paper-queue-list" });
    for (const [docPath, group] of grouped) {
      const section = list.createDiv({ cls: "folio-paper-group" });
      const groupHeader = section.createDiv({ cls: "folio-paper-group-header" });

      const titleBtn = groupHeader.createEl("button", {
        cls: "folio-paper-group-title",
        text: group.title,
      });
      titleBtn.addEventListener("click", () => void this.openDocumentPath(docPath));

      const markDocBtn = groupHeader.createEl("button", {
        cls: "folio-carry-all-btn",
        text: `Mark ${group.items.length} ok`,
      });
      markDocBtn.addEventListener("click", async () => {
        const doc = await this.plugin.vaultService.loadDocument(docPath);
        if (!doc) return;
        for (const e of doc.entries) e.paperSynced = true;
        await this.plugin.vaultService.saveDocument(doc);
        await this.loadAndRender();
      });

      for (const item of group.items) {
        const dir = this.resolveDirection(item.entry.text);
        const row = section.createDiv({
          cls: `folio-entry-row folio-entry-${item.entry.signifier} ${dir === "rtl" ? "is-rtl" : "is-ltr"}`,
        });
        row.createSpan({
          cls: `folio-entry-sig folio-sig-${item.entry.signifier}`,
          text: `${modifierSymbol(item.entry.modifier)}${SIGNIFIER_SYMBOL[item.entry.signifier]}`,
        });
        row.createSpan({ cls: "folio-entry-time", text: `[${item.entry.time}]` });
        const textEl = row.createDiv({ cls: "folio-entry-text", attr: { dir } });
        this.renderRichText(textEl, item.entry.text, docPath);

        const okBtn = row.createEl("button", {
          cls: "folio-paper-pill is-no",
          text: "Mark paper:ok",
        });
        okBtn.addEventListener("click", async () => {
          const doc = await this.plugin.vaultService.loadDocument(docPath);
          if (!doc) return;
          const target = doc.entries.find((e) => e.id === item.entry.id);
          if (target) {
            target.paperSynced = true;
            await this.plugin.vaultService.saveDocument(doc);
            await this.loadAndRender();
          }
        });
      }
    }
  }
}

import { App, TFile, TFolder, normalizePath } from "obsidian";
import {
  Entry,
  FolioDocument,
  SpaceInfo,
  formatDateWithWeekday,
  nextEntryId,
  parseFolioDocument,
  serializeFolioDocument,
  slugify,
} from "./model";
import type { FolioSettings } from "./settings";

export interface PaperPendingItem {
  docPath: string;
  docTitle: string;
  entry: Entry;
}

export class FolioVaultService {
  constructor(
    private app: App,
    private getSettings: () => FolioSettings
  ) {}

  get folders() {
    const s = this.getSettings();
    return {
      daily: s.dailyNotesFolder,
      spaces: s.spacesFolder,
      reviews: s.reviewsFolder,
      futureLog: s.futureLogPath,
    };
  }

  todayDateStr(): string {
    return this.formatLocalDate(new Date());
  }

  nowHHMM(): string {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  formatLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  shiftDate(dateStr: string, deltaDays: number): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return this.todayDateStr();
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + deltaDays);
    return this.formatLocalDate(d);
  }

  dailyPath(dateStr: string): string {
    return normalizePath(`${this.folders.daily}/${dateStr}.md`);
  }

  async ensureFolder(folderPath: string): Promise<void> {
    const norm = normalizePath(folderPath);
    if (!norm) return;
    const existing = this.app.vault.getAbstractFileByPath(norm);
    if (!existing) {
      await this.app.vault.createFolder(norm);
    }
  }

  async ensureStructure(): Promise<void> {
    await this.ensureFolder(this.folders.daily);
    await this.ensureFolder(this.folders.spaces);
    await this.ensureFolder(this.folders.reviews);

    const futurePath = normalizePath(this.folders.futureLog);
    if (!this.app.vault.getAbstractFileByPath(futurePath)) {
      const doc: FolioDocument = {
        path: futurePath,
        title: "Future Log",
        kind: "future-log",
        date: null,
        page: null,
        space: "Future Log",
        tags: ["bujo", "future-log"],
        extraFrontmatter: [],
        entries: [],
        proseLines: [
          "# Future Log",
          "Scheduled tasks (`<`) and upcoming events across future months.",
        ],
      };
      await this.app.vault.create(futurePath, serializeFolioDocument(doc));
    }
  }

  async loadDocument(path: string): Promise<FolioDocument | null> {
    const norm = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(norm);
    if (!(file instanceof TFile)) return null;
    const raw = await this.app.vault.read(file);
    return parseFolioDocument(norm, raw, this.folders);
  }

  async saveDocument(doc: FolioDocument): Promise<void> {
    const norm = normalizePath(doc.path);
    const parentIdx = norm.lastIndexOf("/");
    if (parentIdx > 0) {
      await this.ensureFolder(norm.slice(0, parentIdx));
    }
    const content = serializeFolioDocument(doc);
    const existing = this.app.vault.getAbstractFileByPath(norm);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(norm, content);
    }

    if (doc.kind === "daily" && doc.date && this.getSettings().autoUpdateMonthlyIndex) {
      await this.updateMonthlyIndex(doc.date);
    }
  }

  async latestNotebookPage(): Promise<number | null> {
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.folders.daily));
    if (!(folder instanceof TFolder)) return null;

    const files = folder.children
      .filter((f): f is TFile => f instanceof TFile && f.extension === "md" && !f.name.endsWith("-index.md"))
      .sort((a, b) => b.name.localeCompare(a.name));

    for (const file of files) {
      const raw = await this.app.vault.read(file);
      const doc = parseFolioDocument(file.path, raw, this.folders);
      if (doc.page !== null) return doc.page;
    }
    return null;
  }

  async openOrCreateDaily(dateStr: string): Promise<FolioDocument> {
    await this.ensureFolder(this.folders.daily);
    const path = this.dailyPath(dateStr);
    const existing = await this.loadDocument(path);
    if (existing) return existing;

    const page = (await this.latestNotebookPage()) ?? this.getSettings().defaultPage;
    const doc: FolioDocument = {
      path,
      title: formatDateWithWeekday(dateStr),
      kind: "daily",
      date: dateStr,
      page,
      space: null,
      tags: ["bujo", "daily"],
      extraFrontmatter: [],
      entries: [],
      proseLines: [],
    };
    await this.saveDocument(doc);
    return doc;
  }

  async createSpace(name: string): Promise<FolioDocument> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Space name cannot be empty");
    const slug = slugify(trimmed);
    if (!slug) throw new Error("Space name must contain letters or numbers");

    await this.ensureFolder(this.folders.spaces);
    const path = normalizePath(`${this.folders.spaces}/${slug}.md`);
    const existing = await this.loadDocument(path);
    if (existing) return existing;

    const doc: FolioDocument = {
      path,
      title: trimmed,
      kind: "space",
      date: null,
      page: null,
      space: trimmed,
      tags: ["bujo", "space", slug],
      extraFrontmatter: [],
      entries: [],
      proseLines: [],
    };
    await this.saveDocument(doc);
    return doc;
  }

  async listSpaces(activeDateStr?: string): Promise<SpaceInfo[]> {
    const dateStr = activeDateStr ?? this.todayDateStr();
    const dailyPath = this.dailyPath(dateStr);
    const dailyDoc = await this.loadDocument(dailyPath);

    const spaces: SpaceInfo[] = [
      {
        name: "Daily Log",
        slug: "daily-log",
        isDaily: true,
        path: dailyPath,
        entryCount: dailyDoc?.entries.length ?? 0,
      },
    ];

    const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.folders.spaces));
    if (folder instanceof TFolder) {
      const files = folder.children
        .filter((f): f is TFile => f instanceof TFile && f.extension === "md")
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const file of files) {
        const doc = await this.loadDocument(file.path);
        if (doc) {
          spaces.push({
            name: doc.space ?? doc.title,
            slug: file.basename,
            isDaily: false,
            path: file.path,
            entryCount: doc.entries.length,
          });
        }
      }
    }

    return spaces;
  }

  async openOrCreateFutureLog(): Promise<FolioDocument> {
    await this.ensureStructure();
    const doc = await this.loadDocument(this.folders.futureLog);
    if (doc) return doc;
    return {
      path: normalizePath(this.folders.futureLog),
      title: "Future Log",
      kind: "future-log",
      date: null,
      page: null,
      space: "Future Log",
      tags: ["bujo", "future-log"],
      extraFrontmatter: [],
      entries: [],
      proseLines: [],
    };
  }

  async updateMonthlyIndex(dateStr: string): Promise<void> {
    const ym = dateStr.slice(0, 7); // YYYY-MM
    const indexPath = normalizePath(`${this.folders.daily}/${ym}-index.md`);
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.folders.daily));
    if (!(folder instanceof TFolder)) return;

    const dailyFiles = folder.children
      .filter(
        (f): f is TFile =>
          f instanceof TFile &&
          f.extension === "md" &&
          !f.name.endsWith("-index.md") &&
          f.name.startsWith(ym)
      )
      .sort((a, b) => a.name.localeCompare(b.name));

    const prose: string[] = [
      `# ${ym} — Monthly Index`,
      "",
      "| Daily Log | Notebook Page | Open (.) | Done (×) |",
      "| --- | --- | --- | --- |",
    ];

    for (const file of dailyFiles) {
      const doc = await this.loadDocument(file.path);
      if (!doc) continue;
      const openCount = doc.entries.filter((e) => e.signifier === "action").length;
      const doneCount = doc.entries.filter((e) => e.signifier === "done").length;
      const pStr = doc.page !== null ? `p. ${doc.page}` : "—";
      prose.push(`| [[${file.basename}]] | ${pStr} | ${openCount} | ${doneCount} |`);
    }

    const indexDoc: FolioDocument = {
      path: indexPath,
      title: `${ym} Monthly Index`,
      kind: "index",
      date: null,
      page: null,
      space: null,
      tags: ["bujo", "index"],
      extraFrontmatter: [["month", ym]],
      entries: [],
      proseLines: prose,
    };

    const content = serializeFolioDocument(indexDoc);
    const existing = this.app.vault.getAbstractFileByPath(indexPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(indexPath, content);
    }
  }

  async migrateEntry(
    sourceDoc: FolioDocument,
    entryId: number,
    targetPath: string,
    scheduled: boolean
  ): Promise<void> {
    const entry = sourceDoc.entries.find((e) => e.id === entryId);
    if (!entry) throw new Error(`Entry ${entryId} not found`);

    const originalText = entry.text;
    const targetStem = targetPath.replace(/\\/g, "/").split("/").pop()?.replace(/\.md$/, "") ?? targetPath;
    const sourceStem = sourceDoc.path.replace(/\\/g, "/").split("/").pop()?.replace(/\.md$/, "") ?? "source";

    entry.signifier = scheduled ? "scheduled" : "migrated";
    if (!entry.text.includes("[[")) {
      entry.text = `${originalText} → [[${targetStem}]]`;
    }
    await this.saveDocument(sourceDoc);

    let targetDoc = await this.loadDocument(targetPath);
    if (!targetDoc) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(targetStem)) {
        targetDoc = await this.openOrCreateDaily(targetStem);
      } else if (normalizePath(targetPath).toLowerCase() === normalizePath(this.folders.futureLog).toLowerCase()) {
        targetDoc = await this.openOrCreateFutureLog();
      } else {
        targetDoc = await this.createSpace(targetStem);
      }
    }

    targetDoc.entries.push({
      id: nextEntryId(targetDoc),
      time: this.nowHHMM(),
      modifier: entry.modifier,
      signifier: "action",
      text: `${originalText} (from [[${sourceStem}]])`,
      paperSynced: false,
    });
    await this.saveDocument(targetDoc);
  }

  async collectPaperPending(limitDocs = 30): Promise<PaperPendingItem[]> {
    const items: PaperPendingItem[] = [];
    const dailyFolder = this.app.vault.getAbstractFileByPath(normalizePath(this.folders.daily));
    const spacesFolder = this.app.vault.getAbstractFileByPath(normalizePath(this.folders.spaces));

    const files: TFile[] = [];
    if (dailyFolder instanceof TFolder) {
      const dailyFiles = dailyFolder.children
        .filter((f): f is TFile => f instanceof TFile && f.extension === "md" && !f.name.endsWith("-index.md"))
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, limitDocs);
      files.push(...dailyFiles);
    }
    if (spacesFolder instanceof TFolder) {
      const spaceFiles = spacesFolder.children
        .filter((f): f is TFile => f instanceof TFile && f.extension === "md")
        .sort((a, b) => a.name.localeCompare(b.name));
      files.push(...spaceFiles);
    }

    for (const file of files) {
      const doc = await this.loadDocument(file.path);
      if (!doc) continue;
      for (const entry of doc.entries) {
        if (!entry.paperSynced) {
          items.push({
            docPath: doc.path,
            docTitle: doc.title,
            entry,
          });
        }
      }
    }

    return items;
  }
}

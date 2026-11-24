import { MarkdownPostProcessorContext, TFile } from "obsidian";
import {
  Entry,
  SIGNIFIER_LABEL,
  SIGNIFIER_SYMBOL,
  formatEntryLine,
  isActionFamily,
  isRtlText,
  modifierSymbol,
  parseEntryLine,
  toggleDone,
} from "./model";
import type FolioPlugin from "./main";

export function registerFolioReadingView(plugin: FolioPlugin): void {
  plugin.registerMarkdownPostProcessor((el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    if (!plugin.settings.enableReadingView) return;

    const section = ctx.getSectionInfo(el);
    if (!section) return;

    // Only transform top-level block elements (p or ul) that contain Folio rapid-log lines
    const block = el.firstElementChild;
    if (!block || (block.tagName !== "P" && block.tagName !== "UL")) return;

    const allLines = section.text.split("\n");
    const slice = allLines.slice(section.lineStart, section.lineEnd + 1);
    const nonEmpty = slice.filter((l) => l.trim().length > 0);
    if (nonEmpty.length === 0) return;

    // Check if every non-empty line in this section is a valid Folio rapid-log entry
    // Note: ignore plain Markdown bullets like `- item` unless they look like Folio lines
    // (either have `[HH:MM]`, `[paper:ok|no]`, or appear alongside other Folio lines)
    const parsed: Array<{ lineIndex: number; entry: Entry }> = [];
    let hasStrongFolioSignal = false;

    for (let i = 0; i < slice.length; i++) {
      const raw = slice[i];
      if (!raw.trim()) continue;
      const entry = parseEntryLine(raw, i + 1);
      if (!entry) {
        return; // Mixed prose/normal markdown block — leave untouched
      }
      if (
        entry.signifier !== "note" ||
        entry.time !== "--:--" ||
        raw.includes("[paper:ok]") ||
        raw.includes("[paper:no]") ||
        entry.modifier !== "none"
      ) {
        hasStrongFolioSignal = true;
      }
      parsed.push({ lineIndex: section.lineStart + i, entry });
    }

    if (!hasStrongFolioSignal || parsed.length === 0) return;

    // Replace rendered block with Folio styled list
    el.empty();
    const container = el.createDiv({ cls: "folio-reading-block" });

    for (const { lineIndex, entry } of parsed) {
      const mode = plugin.settings.directionMode;
      const dir = mode === "rtl" ? "rtl" : mode === "ltr" ? "ltr" : isRtlText(entry.text) ? "rtl" : "ltr";

      const row = container.createDiv({
        cls: `folio-entry-row folio-reading-row folio-entry-${entry.signifier} ${
          entry.signifier === "done" || entry.signifier === "cancelled" ? "is-muted" : ""
        } ${dir === "rtl" ? "is-rtl" : "is-ltr"}`,
      });

      if (entry.modifier !== "none") {
        row.createSpan({
          cls: `folio-modifier folio-mod-${entry.modifier}`,
          text: modifierSymbol(entry.modifier),
        });
      }

      const sigBtn = row.createEl("button", {
        cls: `folio-entry-sig folio-sig-${entry.signifier}`,
        text: SIGNIFIER_SYMBOL[entry.signifier],
        attr: { title: SIGNIFIER_LABEL[entry.signifier] },
      });
      if (isActionFamily(entry.signifier)) {
        sigBtn.addEventListener("click", async () => {
          const nextEntry: Entry = { ...entry, signifier: toggleDone(entry.signifier) };
          await replaceLineInFile(plugin, ctx.sourcePath, lineIndex, formatEntryLine(nextEntry));
        });
      }

      if (entry.time !== "--:--") {
        row.createSpan({ cls: "folio-entry-time", text: `[${entry.time}]` });
      }

      const textEl = row.createDiv({ cls: "folio-entry-text", attr: { dir } });
      renderInlineText(plugin, textEl, entry.text, ctx.sourcePath);

      if (plugin.settings.showPaperBadges) {
        const paperBtn = row.createEl("button", {
          cls: `folio-paper-pill ${entry.paperSynced ? "is-ok" : "is-no"}`,
          text: entry.paperSynced ? "paper:ok" : "paper:no",
          attr: { title: "Toggle Carry to Paper status" },
        });
        paperBtn.addEventListener("click", async () => {
          const nextEntry: Entry = { ...entry, paperSynced: !entry.paperSynced };
          await replaceLineInFile(plugin, ctx.sourcePath, lineIndex, formatEntryLine(nextEntry));
        });
      }
    }
  });
}

function renderInlineText(
  plugin: FolioPlugin,
  container: HTMLElement,
  text: string,
  sourcePath: string
): void {
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
        void plugin.app.workspace.openLinkText(target, sourcePath, false);
      });
    } else if (token.startsWith("#")) {
      container.createSpan({ cls: "folio-inline-tag", text: token });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    container.appendText(text.slice(lastIndex));
  }
}

async function replaceLineInFile(
  plugin: FolioPlugin,
  sourcePath: string,
  lineIndex: number,
  newLine: string
): Promise<void> {
  const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
  if (!(file instanceof TFile)) return;
  await plugin.app.vault.process(file, (content) => {
    const lines = content.split("\n");
    if (lineIndex < 0 || lineIndex >= lines.length) return content;
    lines[lineIndex] = newLine;
    return lines.join("\n");
  });
}

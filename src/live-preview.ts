import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  SIGNIFIER_SYMBOL,
  formatEntryLine,
  isActionFamily,
  isRtlText,
  parseEntryLineWithSpans,
  toggleDone,
} from "./model";
import type FolioPlugin from "./main";

class PaperBadgeWidget extends WidgetType {
  constructor(
    private paperSynced: boolean,
    private lineFrom: number,
    private lineTo: number
  ) {
    super();
  }

  eq(other: PaperBadgeWidget): boolean {
    return (
      other.paperSynced === this.paperSynced &&
      other.lineFrom === this.lineFrom &&
      other.lineTo === this.lineTo
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `folio-paper-pill folio-cm-paper-widget ${this.paperSynced ? "is-ok" : "is-no"}`;
    btn.textContent = this.paperSynced ? "paper:ok" : "paper:no";
    btn.title = "Click to toggle Carry to Paper status";
    btn.addEventListener("mousedown", (evt) => {
      evt.preventDefault();
      const lineText = view.state.doc.sliceString(this.lineFrom, this.lineTo);
      const parsed = parseEntryLineWithSpans(lineText);
      if (!parsed) return;
      const updated = formatEntryLine({
        ...parsed.entry,
        paperSynced: !parsed.entry.paperSynced,
      });
      view.dispatch({
        changes: { from: this.lineFrom, to: this.lineTo, insert: updated },
      });
    });
    return btn;
  }
}

class SignifierWidget extends WidgetType {
  constructor(
    private symbol: string,
    private sig: string,
    private clickable: boolean,
    private lineFrom: number,
    private lineTo: number
  ) {
    super();
  }

  eq(other: SignifierWidget): boolean {
    return (
      other.symbol === this.symbol &&
      other.sig === this.sig &&
      other.lineFrom === this.lineFrom &&
      other.lineTo === this.lineTo
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.className = `folio-cm-sig-widget folio-sig-${this.sig} ${this.clickable ? "is-clickable" : ""}`;
    span.textContent = this.symbol;
    if (this.clickable) {
      span.title = "Click to toggle Action (.) ↔ Done (×)";
      span.addEventListener("mousedown", (evt) => {
        evt.preventDefault();
        const lineText = view.state.doc.sliceString(this.lineFrom, this.lineTo);
        const parsed = parseEntryLineWithSpans(lineText);
        if (!parsed) return;
        const updated = formatEntryLine({
          ...parsed.entry,
          signifier: toggleDone(parsed.entry.signifier),
        });
        view.dispatch({
          changes: { from: this.lineFrom, to: this.lineTo, insert: updated },
        });
      });
    }
    return span;
  }
}

export function createFolioLivePreviewExtension(plugin: FolioPlugin) {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = this.buildDecorations(view);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = this.buildDecorations(update.view);
        }
      }

      private buildDecorations(view: EditorView): DecorationSet {
        if (!plugin.settings.enableLivePreview) {
          return Decoration.none;
        }

        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.doc;
        const cursorHead = view.state.selection.main.head;
        const cursorLine = doc.lineAt(cursorHead).number;

        // Detect frontmatter end line (if file starts with ---)
        let frontmatterEndLine = 0;
        if (doc.lines >= 2 && doc.line(1).text.trim() === "---") {
          for (let n = 2; n <= doc.lines; n++) {
            if (doc.line(n).text.trim() === "---") {
              frontmatterEndLine = n;
              break;
            }
          }
        }

        for (const { from, to } of view.visibleRanges) {
          let pos = from;
          while (pos <= to) {
            const line = doc.lineAt(pos);
            pos = line.to + 1;

            if (line.number <= frontmatterEndLine) continue;

            const text = line.text;
            const parsed = parseEntryLineWithSpans(text);
            if (!parsed) continue;

            // Avoid hijacking normal markdown bullet lists unless they have a Folio signal
            const isPlainDash =
              parsed.entry.signifier === "note" &&
              parsed.entry.modifier === "none" &&
              parsed.timeFrom === null &&
              parsed.paperFrom === null;
            if (isPlainDash) continue;

            // Avoid hijacking Obsidian checklists without Folio timestamp/paper tags
            const isPlainChecklist =
              /^[-*]\s+\[[ xX]\]/.test(text.trim()) &&
              parsed.timeFrom === null &&
              parsed.paperFrom === null;
            if (isPlainChecklist) continue;

            const isCursorOnLine = line.number === cursorLine;
            const mode = plugin.settings.directionMode;
            const isRtl =
              mode === "rtl" ? true : mode === "ltr" ? false : isRtlText(parsed.entry.text);

            const lineClasses = [
              "folio-cm-line",
              `folio-cm-sig-${parsed.entry.signifier}`,
              parsed.entry.signifier === "done" || parsed.entry.signifier === "cancelled"
                ? "folio-cm-muted"
                : "",
              isRtl ? "folio-cm-rtl" : "",
            ]
              .filter(Boolean)
              .join(" ");

            builder.add(
              line.from,
              line.from,
              Decoration.line({
                attributes: {
                  class: lineClasses,
                  dir: isRtl ? "rtl" : "ltr",
                },
              })
            );

            // Modifier mark (* or !)
            if (parsed.modifierFrom !== null && parsed.modifierTo !== null) {
              builder.add(
                line.from + parsed.modifierFrom,
                line.from + parsed.modifierTo,
                Decoration.mark({
                  class: `folio-cm-modifier folio-mod-${parsed.entry.modifier}`,
                })
              );
            }

            // Signifier mark or clickable widget (when cursor is not on this line)
            const sigAbsFrom = line.from + parsed.signifierFrom;
            const sigAbsTo = line.from + parsed.signifierTo;
            if (!isCursorOnLine) {
              builder.add(
                sigAbsFrom,
                sigAbsTo,
                Decoration.replace({
                  widget: new SignifierWidget(
                    SIGNIFIER_SYMBOL[parsed.entry.signifier],
                    parsed.entry.signifier,
                    isActionFamily(parsed.entry.signifier),
                    line.from,
                    line.to
                  ),
                })
              );
            } else {
              builder.add(
                sigAbsFrom,
                sigAbsTo,
                Decoration.mark({
                  class: `folio-cm-sig folio-sig-${parsed.entry.signifier}`,
                })
              );
            }

            // Timestamp mark [HH:MM]
            if (parsed.timeFrom !== null && parsed.timeTo !== null) {
              builder.add(
                line.from + parsed.timeFrom,
                line.from + parsed.timeTo,
                Decoration.mark({ class: "folio-cm-time" })
              );
            }

            // Carry to Paper pill widget or mark
            if (parsed.paperFrom !== null && parsed.paperTo !== null) {
              const paperAbsFrom = line.from + parsed.paperFrom;
              const paperAbsTo = line.from + parsed.paperTo;
              if (!isCursorOnLine && plugin.settings.showPaperBadges) {
                builder.add(
                  paperAbsFrom,
                  paperAbsTo,
                  Decoration.replace({
                    widget: new PaperBadgeWidget(parsed.entry.paperSynced, line.from, line.to),
                  })
                );
              } else {
                builder.add(
                  paperAbsFrom,
                  paperAbsTo,
                  Decoration.mark({
                    class: `folio-cm-paper ${parsed.entry.paperSynced ? "is-ok" : "is-no"}`,
                  })
                );
              }
            }
          }
        }

        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

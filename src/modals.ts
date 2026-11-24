import { App, FuzzySuggestModal, Modal, Setting } from "obsidian";
import { Signifier, SIGNIFIER_LABEL, SIGNIFIER_SYMBOL, parseRapidInputFull } from "./model";

export interface MigrationTarget {
  label: string;
  description: string;
  targetPath: string;
  scheduled: boolean;
}

export class MigrateEntryModal extends FuzzySuggestModal<MigrationTarget> {
  constructor(
    app: App,
    private targets: MigrationTarget[],
    private onChoose: (target: MigrationTarget) => void
  ) {
    super(app);
    this.setPlaceholder("Migrate (>) or schedule (<) entry to…");
  }

  getItems(): MigrationTarget[] {
    return this.targets;
  }

  getItemText(item: MigrationTarget): string {
    return `${item.label} ${item.description}`;
  }

  renderSuggestion(match: { item: MigrationTarget }, el: HTMLElement): void {
    const { item } = match;
    el.createEl("div", { text: item.label, cls: "folio-modal-item-title" });
    el.createEl("div", { text: item.description, cls: "folio-modal-item-desc" });
  }

  onChooseItem(item: MigrationTarget): void {
    this.onChoose(item);
  }
}

export class PromptModal extends Modal {
  private value: string;

  constructor(
    app: App,
    private titleText: string,
    private placeholder: string,
    initialValue: string,
    private onSubmit: (value: string) => void
  ) {
    super(app);
    this.value = initialValue;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.titleText });

    const inputEl = contentEl.createEl("input", {
      type: "text",
      cls: "folio-modal-input",
      placeholder: this.placeholder,
      value: this.value,
    });
    inputEl.focus();
    inputEl.select();

    inputEl.addEventListener("input", () => {
      this.value = inputEl.value;
    });
    inputEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        this.submit();
      }
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Cancel")
          .onClick(() => this.close())
      )
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => this.submit())
      );
  }

  private submit(): void {
    const trimmed = this.value.trim();
    if (!trimmed) return;
    this.close();
    this.onSubmit(trimmed);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class QuickRapidLogModal extends Modal {
  private activeSig: Signifier = "action";
  private text = "";

  constructor(
    app: App,
    private targetLabel: string,
    private onSubmit: (raw: string, defaultSig: Signifier) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("folio-quick-log-modal");
    contentEl.createEl("h3", { text: `Rapid Log → ${this.targetLabel}` });

    const sigBar = contentEl.createDiv({ cls: "folio-sig-picker" });
    const sigs: Signifier[] = ["action", "event", "emotion", "note"];
    const buttons: Record<string, HTMLButtonElement> = {};

    for (const sig of sigs) {
      const btn = sigBar.createEl("button", {
        cls: `folio-sig-chip ${sig === this.activeSig ? "is-active" : ""}`,
        text: `${SIGNIFIER_SYMBOL[sig]} ${SIGNIFIER_LABEL[sig]}`,
      });
      buttons[sig] = btn;
      btn.addEventListener("click", () => {
        this.activeSig = sig;
        for (const s of sigs) {
          buttons[s].toggleClass("is-active", s === sig);
        }
        inputEl.focus();
      });
    }

    const inputEl = contentEl.createEl("input", {
      type: "text",
      cls: "folio-modal-input",
      placeholder: "Prefix with . o = - *. !- or type directly…",
    });
    inputEl.focus();
    inputEl.addEventListener("input", () => {
      this.text = inputEl.value;
    });
    inputEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        this.submit();
      }
    });

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((btn) =>
        btn
          .setButtonText("Log Entry")
          .setCta()
          .onClick(() => this.submit())
      );
  }

  private submit(): void {
    const parsed = parseRapidInputFull(this.text, this.activeSig);
    if (!parsed.text) return;
    this.close();
    this.onSubmit(this.text, this.activeSig);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

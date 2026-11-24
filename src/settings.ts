import { App, PluginSettingTab, Setting } from "obsidian";
import type FolioPlugin from "./main";

export type DirectionMode = "auto" | "ltr" | "rtl";

export interface FolioSettings {
  dailyNotesFolder: string;
  spacesFolder: string;
  reviewsFolder: string;
  futureLogPath: string;
  defaultPage: number;
  directionMode: DirectionMode;
  enableReadingView: boolean;
  enableLivePreview: boolean;
  showPaperBadges: boolean;
  autoUpdateMonthlyIndex: boolean;
}

export const DEFAULT_SETTINGS: FolioSettings = {
  dailyNotesFolder: "Daily Notes",
  spacesFolder: "Spaces",
  reviewsFolder: "Reviews",
  futureLogPath: "Future Log.md",
  defaultPage: 1,
  directionMode: "auto",
  enableReadingView: true,
  enableLivePreview: true,
  showPaperBadges: true,
  autoUpdateMonthlyIndex: true,
};

export class FolioSettingTab extends PluginSettingTab {
  plugin: FolioPlugin;

  constructor(app: App, plugin: FolioPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Vault paths").setHeading();

    new Setting(containerEl)
      .setName("Daily notes folder")
      .setDesc("Folder storing YYYY-MM-DD.md daily logs and monthly index files.")
      .addText((text) =>
        text
          .setPlaceholder("Daily Notes")
          .setValue(this.plugin.settings.dailyNotesFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNotesFolder = value.trim() || "Daily Notes";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Spaces folder")
      .setDesc("Folder storing Folio collection spaces (e.g., studio-work.md).")
      .addText((text) =>
        text
          .setPlaceholder("Spaces")
          .setValue(this.plugin.settings.spacesFolder)
          .onChange(async (value) => {
            this.plugin.settings.spacesFolder = value.trim() || "Spaces";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Future log path")
      .setDesc("Path to the future log Markdown file.")
      .addText((text) =>
        text
          .setPlaceholder("Future Log.md")
          .setValue(this.plugin.settings.futureLogPath)
          .onChange(async (value) => {
            this.plugin.settings.futureLogPath = value.trim() || "Future Log.md";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Display and behavior").setHeading();

    new Setting(containerEl)
      .setName("Default notebook page")
      .setDesc("Starting physical notebook page number when no prior daily log exists.")
      .addText((text) =>
        text
          .setPlaceholder("1")
          .setValue(String(this.plugin.settings.defaultPage))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              this.plugin.settings.defaultPage = parsed;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Text direction")
      .setDesc("Auto detects RTL (Persian, Arabic, Hebrew) per entry using the first strong character.")
      .addDropdown((dd) =>
        dd
          .addOption("auto", "Auto (per entry)")
          .addOption("ltr", "Left-to-right (LTR)")
          .addOption("rtl", "Right-to-left (RTL)")
          .setValue(this.plugin.settings.directionMode)
          .onChange(async (value) => {
            this.plugin.settings.directionMode = value as DirectionMode;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(containerEl)
      .setName("Show carry-to-paper badges")
      .setDesc("Display interactive [paper:no] and [paper:ok] badges in views and notes.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showPaperBadges).onChange(async (value) => {
          this.plugin.settings.showPaperBadges = value;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(containerEl)
      .setName("Auto-update monthly index")
      .setDesc("Keep Daily Notes/YYYY-MM-index.md in sync when saving daily logs.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoUpdateMonthlyIndex).onChange(async (value) => {
          this.plugin.settings.autoUpdateMonthlyIndex = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Style entries in reading view")
      .setDesc("Render rapid-log lines with interactive signifiers and badges inside normal notes.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableReadingView).onChange(async (value) => {
          this.plugin.settings.enableReadingView = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Style entries in live preview")
      .setDesc("Highlight signifiers, timestamps, and paper badges in the Markdown editor.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableLivePreview).onChange(async (value) => {
          this.plugin.settings.enableLivePreview = value;
          await this.plugin.saveSettings();
        })
      );
  }
}

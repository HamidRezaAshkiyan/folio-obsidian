export type Signifier =
  | "action"
  | "done"
  | "migrated"
  | "scheduled"
  | "cancelled"
  | "event"
  | "emotion"
  | "note";

export type EntryModifier = "none" | "priority" | "inspiration";

export type EntryFilter = "all" | "action" | "event" | "emotion" | "note";

export type DocKind = "daily" | "space" | "review" | "future-log" | "index" | "other";

export interface Entry {
  id: number;
  time: string;
  modifier: EntryModifier;
  signifier: Signifier;
  text: string;
  paperSynced: boolean;
}

export interface FolioDocument {
  path: string;
  title: string;
  kind: DocKind;
  date: string | null; // YYYY-MM-DD
  page: number | null;
  space: string | null;
  tags: string[];
  extraFrontmatter: Array<[string, string]>;
  entries: Entry[];
  proseLines: string[];
}

export interface SpaceInfo {
  name: string;
  slug: string;
  isDaily: boolean;
  path: string;
  entryCount: number;
}

export interface ParsedLineSpans {
  entry: Entry;
  /** Offset of modifier char if present */
  modifierFrom: number | null;
  modifierTo: number | null;
  /** Offset of signifier char (or `- [ ]` / `- [x]` prefix) */
  signifierFrom: number;
  signifierTo: number;
  /** Offset of `[HH:MM]` if present */
  timeFrom: number | null;
  timeTo: number | null;
  /** Offset of `[paper:ok]` or `[paper:no]` if present */
  paperFrom: number | null;
  paperTo: number | null;
}

export const SIGNIFIER_SYMBOL: Record<Signifier, string> = {
  action: ".",
  done: "×",
  migrated: ">",
  scheduled: "<",
  cancelled: "~",
  event: "o",
  emotion: "=",
  note: "-",
};

export const SIGNIFIER_LABEL: Record<Signifier, string> = {
  action: "Action",
  done: "Done",
  migrated: "Migrated",
  scheduled: "Scheduled",
  cancelled: "Cancelled",
  event: "Event",
  emotion: "Emotion",
  note: "Note",
};

export function signifierFromSymbol(s: string): Signifier | null {
  switch (s.trim()) {
    case ".":
    case "•":
      return "action";
    case "×":
    case "x":
    case "X":
      return "done";
    case ">":
      return "migrated";
    case "<":
      return "scheduled";
    case "~":
      return "cancelled";
    case "o":
    case "O":
    case "○":
      return "event";
    case "=":
      return "emotion";
    case "-":
    case "—":
      return "note";
    default:
      return null;
  }
}

export function isActionFamily(sig: Signifier): boolean {
  return (
    sig === "action" ||
    sig === "done" ||
    sig === "migrated" ||
    sig === "scheduled" ||
    sig === "cancelled"
  );
}

export function toggleDone(sig: Signifier): Signifier {
  switch (sig) {
    case "action":
      return "done";
    case "done":
      return "action";
    case "migrated":
    case "scheduled":
    case "cancelled":
      return "action";
    default:
      return sig;
  }
}

export function matchesFilter(sig: Signifier, filter: EntryFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "action":
      return isActionFamily(sig);
    case "event":
      return sig === "event";
    case "emotion":
      return sig === "emotion";
    case "note":
      return sig === "note";
  }
}

export function modifierSymbol(mod: EntryModifier): string {
  if (mod === "priority") return "*";
  if (mod === "inspiration") return "!";
  return "";
}

export function togglePriority(mod: EntryModifier): EntryModifier {
  return mod === "priority" ? "none" : "priority";
}

export function toggleInspiration(mod: EntryModifier): EntryModifier {
  return mod === "inspiration" ? "none" : "inspiration";
}

export function isRtlChar(ch: string): boolean {
  const u = ch.codePointAt(0);
  if (u === undefined) return false;
  return (
    (u >= 0x0590 && u <= 0x05ff) || // Hebrew
    (u >= 0x0600 && u <= 0x06ff) || // Arabic & Persian
    (u >= 0x0700 && u <= 0x074f) || // Syriac
    (u >= 0x0750 && u <= 0x077f) || // Arabic Supplement
    (u >= 0x0780 && u <= 0x07bf) || // Thaana
    (u >= 0x07c0 && u <= 0x07ff) || // NKo
    (u >= 0x08a0 && u <= 0x08ff) || // Arabic Extended-A
    (u >= 0xfb1d && u <= 0xfb4f) || // Hebrew Presentation Forms
    (u >= 0xfb50 && u <= 0xfdff) || // Arabic Presentation Forms-A
    (u >= 0xfe70 && u <= 0xfeff) // Arabic Presentation Forms-B
  );
}

const LETTER_REGEX = /\p{L}/u;

export function isRtlText(text: string): boolean {
  for (const ch of text) {
    if (isRtlChar(ch)) return true;
    if (LETTER_REGEX.test(ch)) return false;
  }
  return false;
}

const TAG_CHAR_REGEX = /[\p{L}\p{N}_\-\u200C]/u;

export function extractInlineTags(text: string): string[] {
  const tags: string[] = [];
  for (const token of text.split(/\s+/)) {
    if (!token.startsWith("#")) continue;
    const rest = token.slice(1);
    let clean = "";
    for (const ch of rest) {
      if (TAG_CHAR_REGEX.test(ch)) {
        clean += ch;
      } else {
        break;
      }
    }
    if (clean.length > 0) {
      const tag = `#${clean.toLowerCase()}`;
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }
  return tags;
}

export function entryHasTag(entry: Entry, tag: string): boolean {
  const needle = tag.startsWith("#") ? tag.toLowerCase() : `#${tag.toLowerCase()}`;
  return extractInlineTags(entry.text).includes(needle);
}

export function collectInlineTags(entries: Entry[]): string[] {
  const all = new Set<string>();
  for (const entry of entries) {
    for (const t of extractInlineTags(entry.text)) {
      all.add(t);
    }
  }
  return Array.from(all).sort();
}

const ALNUM_REGEX = /[\p{L}\p{N}]/u;

export function slugify(name: string): string {
  let out = "";
  let prevDash = false;
  for (const ch of name) {
    if (ALNUM_REGEX.test(ch)) {
      out += ch.toLowerCase();
      prevDash = false;
    } else if (!prevDash && out.length > 0) {
      out += "-";
      prevDash = true;
    }
  }
  return out.replace(/-+$/, "");
}

export function parseRapidInputFull(
  raw: string,
  defaultSig: Signifier = "action"
): { modifier: EntryModifier; signifier: Signifier; text: string } {
  const trimmed = raw.trim();
  const chars = Array.from(trimmed);

  // 2-char modifier + signifier prefix like `*. `, `!- `, `*o `
  if (chars.length >= 3 && (chars[0] === "*" || chars[0] === "!") && /\s/.test(chars[2])) {
    const sig = signifierFromSymbol(chars[1]);
    if (sig) {
      const modifier: EntryModifier = chars[0] === "*" ? "priority" : "inspiration";
      const rest = chars.slice(2).join("").trim();
      return { modifier, signifier: sig, text: rest };
    }
  }

  // 1-char modifier or signifier followed by whitespace
  if (chars.length >= 2 && /\s/.test(chars[1])) {
    if (chars[0] === "*") {
      return { modifier: "priority", signifier: defaultSig, text: chars.slice(1).join("").trim() };
    }
    if (chars[0] === "!") {
      return {
        modifier: "inspiration",
        signifier: defaultSig,
        text: chars.slice(1).join("").trim(),
      };
    }
    const sig = signifierFromSymbol(chars[0]);
    if (sig) {
      return { modifier: "none", signifier: sig, text: chars.slice(1).join("").trim() };
    }
  }

  return { modifier: "none", signifier: defaultSig, text: trimmed };
}

function extractPaperSuffix(s: string): { text: string; paperSynced: boolean; suffix: string | null } {
  const t = s.trimEnd();
  if (t.endsWith("[paper:ok]")) {
    return { text: t.slice(0, -"[paper:ok]".length).trimEnd(), paperSynced: true, suffix: "[paper:ok]" };
  }
  if (t.endsWith("[paper:no]")) {
    return { text: t.slice(0, -"[paper:no]".length).trimEnd(), paperSynced: false, suffix: "[paper:no]" };
  }
  return { text: t, paperSynced: false, suffix: null };
}

const LEADING_TIME_REGEX = /^\[(\d{2}:\d{2})\](?:\s+(.*))?$/;

function extractLeadingTime(s: string): { time: string; text: string; hasTime: boolean } {
  const t = s.trim();
  const m = LEADING_TIME_REGEX.exec(t);
  if (m) {
    return { time: m[1], text: (m[2] ?? "").trim(), hasTime: true };
  }
  return { time: "--:--", text: t, hasTime: false };
}

export function parseEntryLineWithSpans(line: string, id = 1): ParsedLineSpans | null {
  const leadingSpaces = line.length - line.trimStart().length;
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---")) {
    return null;
  }

  const trimmedEndOffset = leadingSpaces + trimmed.length;

  // Obsidian checklist compatibility: `- [ ] ...` or `- [x] ...`
  const checklistMatch = /^([-*]\s+\[([ xX])\])\s+(.*)$/.exec(trimmed);
  if (checklistMatch) {
    const prefix = checklistMatch[1];
    const isDone = checklistMatch[2].toLowerCase() === "x";
    const rest = checklistMatch[3];
    const { text: withoutPaper, paperSynced, suffix } = extractPaperSuffix(rest);
    const { time, text, hasTime } = extractLeadingTime(withoutPaper);
    if (!text) return null;

    const restOffset = leadingSpaces + prefix.length + 1;
    const paperFrom = suffix ? trimmedEndOffset - suffix.length : null;
    const paperTo = suffix ? trimmedEndOffset : null;
    const timeFrom = hasTime ? restOffset : null;
    const timeTo = hasTime ? restOffset + 7 : null;

    return {
      entry: {
        id,
        time,
        modifier: "none",
        signifier: isDone ? "done" : "action",
        text,
        paperSynced,
      },
      modifierFrom: null,
      modifierTo: null,
      signifierFrom: leadingSpaces,
      signifierTo: leadingSpaces + prefix.length,
      timeFrom,
      timeTo,
      paperFrom,
      paperTo,
    };
  }

  const chars = Array.from(trimmed);
  let modifier: EntryModifier = "none";
  let modifierFrom: number | null = null;
  let modifierTo: number | null = null;
  let scanOffset = leadingSpaces;
  let scanChars = chars;

  if (
    chars.length >= 3 &&
    (chars[0] === "*" || chars[0] === "!") &&
    /\s/.test(chars[2]) &&
    signifierFromSymbol(chars[1]) !== null
  ) {
    modifier = chars[0] === "*" ? "priority" : "inspiration";
    modifierFrom = leadingSpaces;
    modifierTo = leadingSpaces + chars[0].length;
    scanOffset += chars[0].length;
    scanChars = chars.slice(1);
  }

  if (scanChars.length < 3 || !/\s/.test(scanChars[1])) {
    return null;
  }

  const sig = signifierFromSymbol(scanChars[0]);
  if (!sig) return null;

  const signifierFrom = scanOffset;
  const signifierTo = scanOffset + scanChars[0].length;

  const afterSig = scanChars.slice(1).join("");
  const wsAfterSig = afterSig.length - afterSig.trimStart().length;
  const rest = afterSig.trim();
  if (!rest) return null;

  const { text: withoutPaper, paperSynced, suffix } = extractPaperSuffix(rest);
  const { time, text, hasTime } = extractLeadingTime(withoutPaper);
  if (!text) return null;

  const restStartOffset = signifierTo + wsAfterSig;
  const timeFrom = hasTime ? restStartOffset : null;
  const timeTo = hasTime ? restStartOffset + 7 : null;
  const paperFrom = suffix ? trimmedEndOffset - suffix.length : null;
  const paperTo = suffix ? trimmedEndOffset : null;

  return {
    entry: {
      id,
      time,
      modifier,
      signifier: sig,
      text,
      paperSynced,
    },
    modifierFrom,
    modifierTo,
    signifierFrom,
    signifierTo,
    timeFrom,
    timeTo,
    paperFrom,
    paperTo,
  };
}

export function parseEntryLine(line: string, id = 1): Entry | null {
  return parseEntryLineWithSpans(line, id)?.entry ?? null;
}

export function formatEntryLine(entry: Entry): string {
  const paper = entry.paperSynced ? "[paper:ok]" : "[paper:no]";
  const prefix = `${modifierSymbol(entry.modifier)}${SIGNIFIER_SYMBOL[entry.signifier]}`;
  if (entry.time && entry.time !== "--:--") {
    return `${prefix} [${entry.time}] ${entry.text} ${paper}`;
  }
  return `${prefix} ${entry.text} ${paper}`;
}

export function inferDocKind(
  path: string,
  folders = { daily: "Daily Notes", spaces: "Spaces", reviews: "Reviews", futureLog: "Future Log.md" }
): DocKind {
  const norm = path.replace(/\\/g, "/");
  if (norm.endsWith("-index.md")) return "index";
  if (norm.startsWith(`${folders.daily}/`)) return "daily";
  if (norm.startsWith(`${folders.spaces}/`)) return "space";
  if (norm.startsWith(`${folders.reviews}/`)) return "review";
  if (norm.toLowerCase() === folders.futureLog.toLowerCase()) return "future-log";
  return "other";
}

function fileStem(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() ?? "Untitled";
  return base.endsWith(".md") ? base.slice(0, -3) : base;
}

export function formatDateWithWeekday(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${dateStr} (${weekday})`;
}

export function parseFolioDocument(
  path: string,
  raw: string,
  folders = { daily: "Daily Notes", spaces: "Spaces", reviews: "Reviews", futureLog: "Future Log.md" }
): FolioDocument {
  let date: string | null = null;
  let page: number | null = null;
  let space: string | null = null;
  let titleFm: string | null = null;
  const tags: string[] = [];
  const extraFrontmatter: Array<[string, string]> = [];

  const normalized = raw.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  // Avoid spurious trailing empty line from final newline
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  let idx = 0;
  if (lines.length > 0 && lines[0].trim() === "---") {
    idx = 1;
    let inTagsList = false;
    while (idx < lines.length) {
      const line = lines[idx];
      if (line.trim() === "---") {
        idx += 1;
        break;
      }
      if (inTagsList) {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ")) {
          const t = trimmed.slice(2).trim().replace(/^["']|["']$/g, "");
          if (t) tags.push(t);
          idx += 1;
          continue;
        } else {
          inTagsList = false;
        }
      }
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim();
        const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
        switch (key) {
          case "date":
            if (/^\d{4}-\d{2}-\d{2}$/.test(val)) date = val;
            break;
          case "page": {
            const parsed = Number.parseInt(val, 10);
            if (!Number.isNaN(parsed) && parsed >= 0) page = parsed;
            break;
          }
          case "space":
            if (val) space = val;
            break;
          case "title":
            if (val) titleFm = val;
            break;
          case "tags":
            if (!val) {
              inTagsList = true;
            } else {
              const stripped = val.replace(/^\[/, "").replace(/\]$/, "");
              for (const part of stripped.split(",")) {
                const t = part.trim().replace(/^["']|["']$/g, "");
                if (t) tags.push(t);
              }
            }
            break;
          default:
            extraFrontmatter.push([key, val]);
            break;
        }
      }
      idx += 1;
    }
  }

  const entries: Entry[] = [];
  const proseLines: string[] = [];
  let nextId = 1;

  for (let i = idx; i < lines.length; i++) {
    const line = lines[i];
    const entry = parseEntryLine(line, nextId);
    if (entry) {
      entries.push(entry);
      nextId += 1;
    } else {
      proseLines.push(line);
    }
  }

  while (proseLines.length > 0 && proseLines[0].trim() === "") {
    proseLines.shift();
  }
  while (proseLines.length > 0 && proseLines[proseLines.length - 1].trim() === "") {
    proseLines.pop();
  }

  const kind = inferDocKind(path, folders);
  const stem = fileStem(path);
  if (!date && kind === "daily" && /^\d{4}-\d{2}-\d{2}$/.test(stem)) {
    date = stem;
  }

  const title =
    titleFm ??
    space ??
    (date ? formatDateWithWeekday(date) : stem);

  return {
    path,
    title,
    kind,
    date,
    page,
    space,
    tags,
    extraFrontmatter,
    entries,
    proseLines,
  };
}

export function serializeFolioDocument(doc: FolioDocument): string {
  let out = "";
  const hasFm =
    doc.date !== null ||
    doc.page !== null ||
    doc.space !== null ||
    doc.tags.length > 0 ||
    doc.extraFrontmatter.length > 0;

  if (hasFm) {
    out += "---\n";
    if (doc.date !== null) {
      out += `date: ${doc.date}\n`;
    }
    if (doc.page !== null) {
      out += `page: ${doc.page}\n`;
    }
    if (doc.space !== null) {
      out += `space: ${doc.space}\n`;
    }
    if (doc.tags.length > 0) {
      out += "tags:\n";
      for (const tag of doc.tags) {
        out += `  - ${tag}\n`;
      }
    }
    for (const [k, v] of doc.extraFrontmatter) {
      out += `${k}: ${v}\n`;
    }
    out += "---\n";
  }

  for (const entry of doc.entries) {
    out += `${formatEntryLine(entry)}\n`;
  }

  if (doc.proseLines.length > 0) {
    if (doc.entries.length > 0) {
      out += "\n";
    }
    for (const line of doc.proseLines) {
      out += `${line}\n`;
    }
  }

  return out;
}

export function nextEntryId(doc: FolioDocument): number {
  let max = 0;
  for (const e of doc.entries) {
    if (e.id > max) max = e.id;
  }
  return max + 1;
}

import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Bundle src/model.ts in memory to ESM and import it for testing
const result = await build({
  entryPoints: ["src/model.ts"],
  bundle: true,
  format: "esm",
  write: false,
});
const code = result.outputFiles[0].text;
const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

test("roundtrips Folio daily markdown with modifiers and tags", () => {
  const sample = `---
date: 2026-11-21
page: 42
tags:
  - bujo
  - daily
---
*. [08:15] Finalize studio lighting sketch #studio [paper:no]
o [09:30] Coffee with Maya at Blue Bottle — discussed zine layout [paper:ok]
= [10:45] Calm and unhurried after walking without headphones [paper:no]
!- [11:10] Christopher Alexander: living spaces come from small repairs #reading [paper:no]
× [11:25] Order fountain pen ink refill [paper:ok]
`;

  const doc = mod.parseFolioDocument("Daily Notes/2026-11-21.md", sample);
  assert.equal(doc.date, "2026-11-21");
  assert.equal(doc.page, 42);
  assert.equal(doc.kind, "daily");
  assert.equal(doc.entries.length, 5);
  assert.equal(doc.entries[0].modifier, "priority");
  assert.equal(doc.entries[0].signifier, "action");
  assert.equal(doc.entries[0].paperSynced, false);
  assert.equal(doc.entries[1].signifier, "event");
  assert.equal(doc.entries[1].paperSynced, true);
  assert.equal(doc.entries[3].modifier, "inspiration");
  assert.equal(doc.entries[3].signifier, "note");
  assert.deepEqual(mod.collectInlineTags(doc.entries), ["#reading", "#studio"]);

  const serialized = mod.serializeFolioDocument(doc);
  assert.equal(serialized, sample);
});

test("detects RTL text and extracts Unicode/Persian tags", () => {
  assert.equal(mod.isRtlText("سلام دنیا"), true);
  assert.equal(mod.isRtlText("1234 مطالعه کتاب #کار"), true);
  assert.equal(mod.isRtlText("Finish studio lighting sketch"), false);
  assert.equal(mod.isRtlText("Meeting about سلام at 10:00"), false);

  assert.equal(mod.slugify("Studio & Work"), "studio-work");
  assert.equal(mod.slugify("کار و مطالعه"), "کار-و-مطالعه");
  assert.deepEqual(mod.extractInlineTags("برنامه‌ریزی #کار و #studio"), ["#کار", "#studio"]);
});

test("parses rapid input prefixes and Obsidian checklists", () => {
  assert.deepEqual(mod.parseRapidInputFull("*. Ship release", "action"), {
    modifier: "priority",
    signifier: "action",
    text: "Ship release",
  });
  assert.deepEqual(mod.parseRapidInputFull("!- Insightful quote", "action"), {
    modifier: "inspiration",
    signifier: "note",
    text: "Insightful quote",
  });

  const checklist = "- [ ] Ship release\n- [x] Write docs\n";
  const doc = mod.parseFolioDocument("Spaces/work.md", checklist);
  assert.equal(doc.entries.length, 2);
  assert.equal(doc.entries[0].signifier, "action");
  assert.equal(doc.entries[0].text, "Ship release");
  assert.equal(doc.entries[1].signifier, "done");
  assert.equal(doc.entries[1].text, "Write docs");
});

test("computes accurate character spans for Live Preview decorations", () => {
  const line = "*. [08:15] Priority task [paper:no]";
  const spans = mod.parseEntryLineWithSpans(line);
  assert.ok(spans);
  assert.equal(line.slice(spans.modifierFrom, spans.modifierTo), "*");
  assert.equal(line.slice(spans.signifierFrom, spans.signifierTo), ".");
  assert.equal(line.slice(spans.timeFrom, spans.timeTo), "[08:15]");
  assert.equal(line.slice(spans.paperFrom, spans.paperTo), "[paper:no]");
});

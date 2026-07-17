---
date: 2026-07-17
---

# AGENTS.md

Operating manual for any agent working in this vault. Read it all. Follow it exactly.

## Purpose

This vault is the knowledge corpus behind a public RAG chat on Luke's portfolio site. Every note gets chunked, embedded, retrieved, and quoted back to strangers by an LLM speaking as Luke. Everything in here is public. All notes are written in Luke's first person voice, stating his actual positions plainly, so that retrieved chunks already sound like him.

## The privacy stop rule

This vault is public. There is no privacy layer downstream of it. Filtering happens at the Bear export, but you are the last check. If a note contains anything about my personal life, my partner, my coworkers' opinions, my employer's non-public work, compensation, health, or anything I would not put on a slide at a conference, flag it and stop. Do not "sanitize" it yourself and continue. Ask me.

## Frontmatter schema

Every note gets this frontmatter, exactly:

```yaml
---
title: Design systems fail on adoption not coverage
created: 2024-03-11
updated: 2026-07-14
tags: [designsystems, opinions, axon]
type: evergreen        # evergreen | project | person | source | log | moc
status: seed           # seed | growing | settled
---
```

- `tags`: flat and pluralized. No nesting, no hierarchy.
- `created` / `updated`: load-bearing. The chat needs to know when Luke thought something. Update `updated` on every edit. Never leave it stale.
- `type`: drives how the indexer chunks and weights the note. Allowed: `evergreen`, `project`, `person`, `source`, `log`, `moc`.
- `status`: how much the model should trust it. Allowed: `seed` (half-formed), `growing`, `settled` (Luke stands behind it).

## Voice rules

- First person, always. "I think X," never "It is generally thought that X."
- Have opinions. State them plainly. "There are pros and cons" is useless to retrieval.
- No em dashes anywhere.
- No marketing language, no hedging filler, no preamble.

## Note conventions

- One idea per note. Two ideas retrieve badly for both. Split.
- Title is a claim, not a topic. "Design systems fail on adoption not coverage" beats "Design systems." The title is prepended to every chunk.
- Lead with the claim in the first sentence. No throat-clearing. The first sentence is often all that survives into an answer.
- `##` headings every ~300 words. The indexer splits on headings, so each section must stand alone out of context.
- Spell out proper nouns on first use in each note. Chunks read in isolation: "Axon, Instinct's design system," not "the system."

## Linking conventions

- `[[wikilinks]]` inline, in prose, at the point the concept comes up. No "Related" section at the bottom.
- Link to notes that do not exist yet if the concept deserves one. An unresolved link is a to-do, not an error.
- Every note links to at least one MOC and at least one sibling note. Orphans are invisible to synthesis.
- Link people, projects, and tools by name every time, not by pronoun.

## MOCs

`type: moc` notes are hub notes, one per domain, living in `/mocs`. An MOC is a paragraph of Luke's actual take on the domain with links woven through the prose, not a list of links. That prose answers "what does he think about X."

## Folders

PARA at the top level, mirroring Bear:

```
/projects      active, time-bound
/areas         ongoing
/resources     reference and sources
/archive       done or dead
/mocs          hub notes
```

Folders are for Luke. Tags and links are for the machine. Do not encode meaning in folder depth.

## Common tasks

**Add a note from raw Bear text.** Run the privacy stop rule first. Extract one idea. Write a claim title, lead with the claim, add frontmatter (`created` from the Bear note's date, `updated` today, `status: seed` unless told otherwise). Add inline wikilinks including one MOC. Place in the matching PARA folder.

**Split an overloaded note.** One new note per idea, each with its own claim title and full frontmatter. Cross-link the siblings inline. Keep the original's `created` date on the piece closest to the original idea; new pieces get today. Update anything that linked to the original.

**Promote a seed to settled.** Only when Luke says so. Reread the note: claim-first, proper nouns spelled out, links present. Set `status: settled`, bump `updated`.

**Refresh a MOC.** Reread the domain's notes. Rewrite the MOC prose to reflect the current takes, weaving in links to every relevant note. Bump `updated`.

**Find and fix orphans.** List notes with no incoming or outgoing links. For each, add inline links to one MOC and at least one sibling, in prose where the concept naturally appears. Do not bolt on a links section.

## What not to do

- Do not delete notes.
- Do not rewrite Luke's opinions into neutral prose.
- Do not add hedges.
- Do not restructure folders.
- Do not touch anything in `/archive` without asking.

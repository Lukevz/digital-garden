---
title: File over app is why I keep everything in markdown
created: 2025-05-24
updated: 2026-07-26
tags: [pkm, tools, opinions]
type: evergreen
status: settled
---

Everything I write lives in plain markdown files because of file over app: the notes have to outlast whatever tool I'm using this year. Steph Ango's phrase, and it's the single principle that decides my whole setup. If a note is trapped in a proprietary format or a hosted editor, I don't really own it, I'm renting it.

## The publishing pipeline this produced

Before I hand-built the current site I published straight out of Bear, see [[Figma and Bear are my daily tools]]. Bear's own WordPress publishing was too limited, and honestly I'd be happy never touching another WordPress site. I tried an Astro workflow with automated Bear exports on Netlify first, and it was too heavy and had too many moving parts for someone who isn't a developer. What worked was Blot, which turns any folder into a website, wired to iCloud.

The gap was frontmatter, since Bear exports don't have any. So I built an Apple Shortcut: it finds notes tagged draft, flips the tag to live, exports markdown to iCloud Drive, flattens nested tags, writes frontmatter with tags and modified date, and overwrites the file. Tagging a note in Bear was the publish button. The whole walkthrough is at /#writing/how-to-use-bear-as-a-cms.

## Why I moved off it

I wanted full control of the design, which is what [[lukevz.com is hand-built with vanilla HTML CSS and JS]] gave me. But nothing about the notes changed when I switched, which is the entire argument for file over app: the files just pointed somewhere new. Same reason [[52 is about owning your thinking again|52]] is local and markdown-based. I don't use Obsidian anymore either; I gave it over a year and the UI stayed clunky and the mobile experience frustrated me, and I take most of my notes on my iPhone. Hubs: [[PKM MOC]], [[Site MOC]].

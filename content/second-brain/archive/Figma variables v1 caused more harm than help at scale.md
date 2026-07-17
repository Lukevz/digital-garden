---
title: Figma variables v1 caused more harm than help at scale
created: 2026-07-17
updated: 2026-07-17
tags: [designsystems, pwc, figma]
type: project
status: settled
---

When Figma shipped variables in 2023, it was the feature we'd needed for years: our system had to support multiple color themes, and mode switching was the answer. Another designer on the design system team and I rebuilt the entire library on variables. Then we published it to 120-plus designers and hundreds and hundreds of connected Figma files, and it turned into months of chaos.

## What went wrong

Files ended up with a mix of styles and variables, which was survivable: select everything, use selection colors, swap to variables. But something got corrupted in one of our merges and duplicate instances of the variables and tokens appeared in consuming files. We spent a stressful few months troubleshooting people's files and helping them revert, and in some cases even Figma support couldn't fix it. The best theory anyone landed on was cache versioning, some stale snapshot of the library file. Nobody ever truly fixed it.

The lesson: a v1 platform feature, even one you genuinely need, is not mature enough to bet a live library on. At that scale the blast radius is every file downstream. The library in question is the one from [[I ran the design system serving 3000 products at PwC]], and the thing variables eventually delivered anyway is why [[Design tokens are the unlock]]. Hub: [[Design Systems MOC]].

---
title: Most companies do not need a custom design system
created: 2026-07-17
updated: 2026-07-17
tags: [designsystems, opinions]
type: evergreen
status: settled
---

You really don't always need a custom design system. A fully custom system made sense at PwC because it serviced thousands of products and we needed complete control. Most companies aren't that, and they can get away with taking Material, shadcn/ui, or Tailwind as a base and building their own themes on top.

The thing that makes theming-on-a-base work is [[Design tokens are the unlock|tokens]], and there's a newer reason to prefer popular bases too: AI agents already know them. The custom route only pays off when the scale and control requirements are real, like they were at [[I ran the design system serving 3000 products at PwC|PwC]]. Either way the hard part stays the same: [[Design systems are a shared language not a component library|adoption and shared language]], not the components. Hub: [[Design Systems MOC]].

---
date: 2026-05-20
---

# Prototyping in code: how three designers kept up with seventy-five engineers
Three designers, 75 engineers, and a Figma workflow that couldn't keep up. Axon Labs is the prototyping environment we built to change how design operates at Instinct — not a tooling experiment, but a workflow shift that moved iteration cycles from weeks to hours and rebalanced where designers spend their time.

## Problem
The pressure had been building for a while. Engineering had adopted Cursor and Claude Code and was shipping faster than design could specify. Meanwhile, we were three designers supporting roughly 75 engineers, a 25:1 ratio that was straining at the seams. 

The traditional Figma workflow — build a screen for every state, manually wire prototypes, iterate in high-fidelity for weeks — wasn't keeping up.

The clearest example was a multi-location project we ran in parallel with a product-wide UI refresh. Every label, every dropdown, every component was scrutinized because we were rebuilding for a fundamentally different operating model. I'd commit to a direction, spend weeks producing high-fidelity screens, and by the time engineering had something built, the design had drifted. Going back to update Figma was rework. Engineers were waiting on me. I was waiting on them. And despite how organized the Figma files were, PMs and engineers couldn't navigate the iterations — they just wanted one place to click through the flow end to end.

We ended up retreating to FigJam decision trees and screenshots to get any alignment at all. It worked, but it exposed the real problem: high-fidelity Figma prototypes are too brittle for genuinely complex flows, and they pull people into the visual layer before the underlying logic is settled.

## Process
The initial bet was that engineering tools had outpaced design tools to the point where it was worth meeting engineering on their terms. Cursor, Claude Code, and Lovable were getting 70–80% of the way to a clickable prototype faster than we could build one screen in Figma. The question was whether we could make that workflow credible for a product as complex as Instinct.

I set up Axon Labs as a Next.js repo on Vercel, scaffolded with Material UI, and rebuilt our custom theme from our Figma tokens — variables, type, spacing, icons, component-by-component. Figma still won on high-fidelity control, so we treated it as the source for design intent and pointed Axon Labs at it. Once the foundation matched, we could direct Cursor at our refreshed Figma screens and assemble prototypes in code that were visually credible against production.

The Vercel deployment previews turned out to be the unlock. Every feature branch got its own URL. We built a simple landing page that tracks which designer is working on what, with clickable links into each prototype. Designers operate more like engineers now — sharing artifacts by merging branches, rebasing onto each other's work, comparing old versions by visiting old preview URLs.

A lot of what got us here was earlier discipline that paid off late. The UI refresh had standardized our token and component naming. We'd kept Figma libraries tight enough that the mapping into Axon Labs was tractable. Without that, the rebuild wouldn't have been possible — we'd have just been re-creating the drift problem in a second tool.

We also tried the obvious alternatives. Figma Make hit a context wall around 100 prompts and started making the same mistakes repeatedly. I pushed one project to 230+ prompts and the token cost wasn't even the worst part — it was the tedium of correcting the same drift over and over. Lovable had similar limitations. The pattern was the same: these tools are session-based. Our product is product-based. We needed something that retained context across multiple teams working on overlapping surfaces, not a chat that forgot what we'd built last week.

The workflow that emerged is the part I'd defend hardest. We don't start in Axon Labs. We start in FigJam — user flows, decision trees, simple shapes. Everyone can read FigJam. It doesn't suck non-designers into the visual layer too early. Once the team is aligned on the underlying logic, we move into Labs to prove it. The prototype becomes a visualization of an agreement that already exists, not the artifact people argue over.

## Outcome
All three designers are in Axon Labs for at least a couple of hours every day. PMs and engineers click the prototype URLs and compare iterations against old deployment previews. Engineering can inspect the rendered components for tokens, icons, and structural hints, which has replaced a meaningful chunk of the annotation work that used to go into Figma handoff.

The iteration cycle has compressed from days or weeks to minutes or hours for most projects. The time that bought back is what matters more than the speed itself — we're now spending more of our hours whiteboarding, doing user flows, sketching personas, and doing the deep problem-framing work that used to get squeezed out by the production work of assembling screens. The 25:1 ratio still isn't comfortable, but it's no longer breaking.

Our CPTO has been openly supportive of the shift. He's the kind of leader who wants both the framework and the clickable artifact, and the old workflow forced us to pick one. Now we can do both, even as a small team. That's the change he's named most explicitly.

The honest tradeoff is source of truth. Artifacts now live in multiple places — FigJam for flows, Figma for high-fidelity reference, Axon Labs for clickable proof. This isn't unique to us; design tools haven't caught up to multi-surface workflows. Our mitigation is designer-as-shepherd: whoever owns a project is responsible for telling PMs and engineers exactly where the canonical artifact is at any given moment. We're using some of the time we bought back to write better tickets and clearer annotations with AI assistance, which has made the handoff less dependent on any single source.

The work is still evolving. We're moving toward a single component library shared between Axon Labs and the production repo — right now they're two libraries kept loosely in sync via Figma Code Connect, and the drift between them is the next problem to solve.

## In hindsight
The thing I'd tell another design team considering this: the tooling isn't the hard part. The hard part is being honest about which problems prototyping in code actually solves and which it makes worse. It speeds up iteration and tightens the loop with engineering. It also fragments your source of truth. Both of those are real, and you can't pretend the second one away because the first one feels good. The workflow only works if a designer is actively shepherding the whole project from problem to handoff. The tools don't do that part — they amplify whoever's doing it.

#business/career
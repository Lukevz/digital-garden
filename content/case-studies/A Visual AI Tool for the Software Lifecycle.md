---
date: 2026-05-18
---

# A Visual AI Tool for the Software Lifecycle
SDLC Canvas was a visual AI tool that let anyone — not just engineers — build a product backlog in a day instead of weeks. I was the lead designer for two years, from the whiteboarding session that became the proof of concept to a tool with 3,500+ users being licensed to Fortune 500 clients across every major industry.

## Problem
In late 2022, generative AI was new, error-prone, and intimidating to most of PwC's workforce. The firm has 360,000 people; the vast majority of them weren't engineers, weren't prompt-fluent, and couldn't safely use ChatGPT for client work anyway because of confidentiality constraints. PwC Digital wanted a way to bring AI into the software development lifecycle that didn't require technical proficiency to use — and that handled client data securely by default.

The early pushback was real: *why not just use ChatGPT?* If we couldn't answer that, the tool was dead. The answer had to be visible in the product itself, not in a pitch deck.

There was also a transparency problem. AI made mistakes constantly back then, and we couldn't ship something that blurred the line between human work and AI output. Users needed to see, at a glance, what came from where — and be able to grab anything and revise it.

## Process
The product started in a conference room. Me, a QA lead, a QA director, and our managing director over Products & Technology Design spent a full day at a whiteboard sketching rough flows. Six weeks later, engineers had a working prototype of the core idea — a pipeline that mapped to the SDLC itself. Business objectives → features → user story titles → full user stories → test cases → automation scripts. You could enter anywhere on the pipeline and only go as far as you needed.

That pipeline metaphor solved the transparency problem too. Every node showed its inputs and its outputs. AI-generated content was visually distinct from human-edited content. Selecting any card opened an AI assistant panel from the right — a companion co-pilot that let you revise inline without leaving the canvas. That right-side panel pattern is everywhere now in Notion, Cursor, and others; at the time it was something we were pioneering inside the firm, and it became Canvas's signature interaction.

The hardest design problem was the audience split. Pendo analytics, support tickets, and dozens of user interviews — many of them run with our senior PM — kept pointing at the same thing: 70–80% of our users were non-technical. They were the ones driving feature priorities, and they wanted simplicity. But we also had a vocal power-user contingent asking for deeper technical controls. I spent a lot of time figuring out which surfaces stayed clean and which ones earned a few clicks of depth. Most technical controls ended up one or two layers in, not on the canvas itself. That call held up.

The breakthrough moment for the team came when we shipped Send to Azure DevOps, and shortly after, Send to Jira. Until then, Canvas could look like a clever silo. Demoing a backlog that started as a brain-dumped meeting transcript and ended as tickets in the team's actual tooling — securely, with client data we couldn't have put into ChatGPT — was when the managing director I reported to and several other directors started calling out the flow as the cleanest UX in the portfolio. That handoff was what made Canvas not-ChatGPT in a way you could see.

The companion AI panel pattern travelled. It moved to our design system documentation site, where it became the primary support surface before users would open a ticket. It later showed up in the Design Marketplace too.
Alongside the product work, I built a custom UI kit on top of our global design system — 65+ components specific to Canvas's needs, plus Figma templates and custom GPTs for generating mock data and demo screens fast. That kit existed for a practical reason: I was both the lead designer on Canvas and the UX manager for the firm's design system, supporting a team of 30 designers across multiple products. I needed a way to keep up with 15–20 engineers shipping continuously. The kit became a foundation other designers used when their AI products needed to interoperate with Canvas, which wasn't the original intent but ended up being one of the more useful artifacts.

## Outcome
Backlog in a Day wasn't an aspiration. It was the POC we delivered six weeks after the whiteboarding session, and it scaled from there. By the time I rotated off, Canvas had 3,500+ users, the full pipeline from business objectives to automation scripts was in production, and the tool was being licensed to Fortune 500 clients across every major industry PwC services. (PwC services 86% of the Fortune 500; I can't name specific clients, but the client base spanned industries.)

Beyond the headline numbers:
* The right-side AI companion pattern, which we shipped before it was common, propagated to the design system docs site and the Design Marketplace.
* The custom UI kit became shared infrastructure for other AI-adjacent products in the firm.
* Send to ADO / Send to Jira changed how leadership talked about the product internally — it stopped getting compared to ChatGPT and started getting compared to the tools it integrated with.
* Voice input (paste a meeting transcript, get extracted context), onboarding agents, real-time collaboration, and creative-brief generation all shipped on top of the original pipeline without breaking it.

## In hindsight
The one I'd revisit is the integration with the firm's generative UI tool. I'd mocked up and roughly prototyped a flow where a finalized creative brief in Canvas would generate four UI options in the Gen UI tool — extending Backlog in a Day into Wireframes in a Day. It didn't ship, but not for design or product reasons. The two tools sat in different departments, prioritization went elsewhere, and the source-of-truth question (does the design live in code or in Figma?) never got resolved at the org level. If I were doing it again, I'd push harder and earlier for that cross-department alignment, because the design problem was tractable; the organizational one was the constraint.

The other thing I'd do differently: lock the core promise earlier. We spent real time on technical explorations that, while interesting, pulled focus from the one thing the product had to be great at — giving a non-technical user enough context and structure to produce a useful backlog visually. Once we recommitted to that, everything got easier.

#business/career
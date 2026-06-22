---
date: 2025-05-24
---

# How to use Bear as a CMS
#output/writing

![](How%20to%20use%20Bear%20as%20a%20CMS/ChatGPT%20Image%20May%2024,%202025,%2003_00_08%20PM.png)

Recently, I made the switch to Bear as my daily driver for notes. It's beautiful to write in, supports Markdown, and keeps digital note-taking simple without unnecessary features. While Bear does offer WordPress publishing, it's quite limited—and honestly, in 2025, I'd be happy never looking at another WordPress site again.

I wanted to build out my digital garden without rebuilding all my posts, but I also wanted full control over design and layout. The challenge was finding a way to publish directly from Bear while maintaining the Markdown philosophy of “[file over app](https://stephango.com/file-over-app)"—ensuring your notes last beyond any specific tool or proprietary format.
# Why not use Obsidian?
I used Obsidian for over a year and appreciated its text-based approach and fast loading times. However, the UI always felt clunky regardless of themes and plugins, and the mobile experience frustrated me since I take most notes on my iPhone. While Obsidian Publish exists for digital gardening, it's a paid service that didn't give me the theme control I wanted, and continually exporting notes from Bear and republishing was tedious.
# Finding the Right Solution
Initially, I built an Astro-based workflow using automations to export Bear notes and Netlify for hosting. You can [watch an unscripted walkthrough here](https://share.cleanshot.com/Qk8f0LxW). But this approach felt heavy and overly complex for someone who isn't a developer—too many moving parts for what should be lightweight, tool-agnostic files.

The breakthrough came when I discovered ~[Blot](https://blot.im/)~, which creates a website from any folder. It accepts .txt, .rtf, .html, .md, or plain images—just connect a cloud folder (I used iCloud) and it handles the rest.
# The Apple Shortcuts Solution
The main challenge was that Bear exports lack [frontmatter](https://jekyllrb.com/docs/front-matter/)— the metadata that static site generators use for titles, dates, and other attributes. After hours of refinement with ChatGPT, I created an Apple Shortcut to bridge this gap.

#### [Download the shortcut here](https://www.icloud.com/shortcuts/9a47934e83d845bea7b8f659cd15e913)
### How It Works
1. **Searches for notes** tagged "draft" in Bear (you add this tag when ready to publish)
2. Updates tags** from "draft" to "live" (effectively "publishing" in Bear)
3. Exports as Markdown** to iCloud Drive where Blot picks them up
4. **Processes tags** by stripping "/" from nested tags (e.g., "Personal/Travel" becomes "travel")
5. Creates frontmatter** with tags, modified date, and original content
6. **Overwrites the file** with the new version including frontmatter
7. **Adds delay** to prevent timeouts before processing the next note

This order was crucial to avoid errors while protecting the Bear environment—the only change Bear sees is tags switching from draft to live.
### Automation Setup
I set this to run automatically at 8:30am daily on my phone. Whatever I queued the day before would publish automatically, preserving original edit and modified dates while avoiding Apple Shortcuts limits.

You can see the ~[latest iteration of my Blot site here](https://lumos.blot.im/)~.
# Why I Moved On
I loved this setup—it was nearly free (just Blot hosting) and required minimal maintenance. However, scaling issues emerged in a digital garden context: revisited notes didn't always update correctly, and backdating imported notes required manual intervention.

Now I use a Bear → Notion → Super.so workflow. I write everything in Bear first, then when a post is "ready," I set it to "read only" in Bear to prevent destructive changes. From there, I manually copy content to a single Notion database where I can set categories, custom dates, and add integrations like YouTube embeds or Figma files.

![](How%20to%20use%20Bear%20as%20a%20CMS/CleanShot%202025-05-24%20at%2015.53.26@2x.png)

It's not nearly as robust or interconnected as Obsidian Publish or Jekyll, but I couldn't get over how most publishing platforms felt like developer documentation rather than offering the simple, elegant experience I found in Bear. I still hope Bear creates a more robust publishing system, but for now this works for me. It's a bit more manual work, but it ensures my notes are always preserved and backed up—if Bear or Notion ever disappear, all my notes can easily be reconstructed.

# Alternative Uses
While I've moved on from this approach, the shortcut could be repurposed for:

* **Automated backups** of Bear notes to cloud storage
* **Simple publishing** for basic blogs or note sharing
* **Export workflows** for migrating to other platforms

At the end of the day, it was a valuable experiment that taught me a lot about automation and the balance between simplicity and functionality.

 

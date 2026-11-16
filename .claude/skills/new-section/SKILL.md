---
name: new-section
description: Build or rebuild a page section for this website. Use whenever the user asks to add, create, or rebuild a section of a page.
---

# New Section Workflow

Follow these steps in order whenever adding or rebuilding a page section:

1. **Read the design rules first**
   - Read `DESIGN.md` (and `BRAND-MOTION-STUDY.md` if working on `gram-street-coffee` or `deli-chic`, or the page's own CSS `:root` tokens) plus `CLAUDE.md`.
   - Use only tokens from the palette, type scale, spacing scale, and radius scale. Never hardcode off-palette hex colours or invent ad-hoc font sizes.
   - Keep one primary action colour for buttons and key highlights.

2. **Confirm the section's content**
   - If the user has not provided the section's real copy, ask for it before inventing copy (or clearly flag any temporary demo copy if the brand is fictional).
   - Never use placeholder text such as `lorem ipsum`, `TODO`, or generic filler.

3. **Build the section cleanly**
   - Build the section as its own component file (in React/Vite projects) or as a clearly scoped, self-contained `<section>` block with its own CSS/JS rules (in single-file HTML pages).
   - Include descriptive `alt` text on all images, lazy-load below-the-fold images (`loading="lazy"`), and use appropriately sized WebP assets (`<= 300 KB` hero, `<= 150 KB` other images).
   - Keep animations subtle (`< 500ms`, `transform` and `opacity` only, trigger once, nothing important waits on them) and respect `prefers-reduced-motion: reduce` as well as `html[data-motion="off"]`.
   - Ensure every button, link, and interactive control has a clear hover state and `:focus-visible` outline.

4. **Check at 390px, 768px, and 1440px**
   - Verify the section at `390px` (phone), `768px` (tablet), and `1440px` (desktop):
     - No text too small or too large; no mid-word clipping.
     - No horizontal overflow (`scrollWidth <= innerWidth`) and nothing touching the screen edge.
     - Touch targets / buttons are thumb-friendly (`>= 44px` tap area on mobile).
     - Images are not stretched or awkwardly cropped at any width.
   - Fix any layout issues found.

5. **Match surrounding spacing and hierarchy**
   - Check that vertical spacing above and below the section, heading sizes, and container gutters match the rest of the page.

6. **Rebuild and finish with a three-line summary**
   - Run `npm run build` so `www/` reflects the change.
   - End with a concise three-line summary:
     1. **What was built**: the section and its one-line job.
     2. **Which file(s)**: exact file path(s) created or updated.
     3. **Review**: anything the user should check (e.g. copy, mobile layout, or visual balance).

# Prompt Pack (`prompts.md`)

Reusable prompt templates for website and 3D development, organized by project stage. Fill in every `[bracket]` before sending — never send empty brackets.

---

## 1. Start

### The brief (write this before opening any tool)
```text
[Business name] sells [what] to [who]. The site's one goal is to get visitors to [the one action]. It should feel [three words], like [a comparison].
```

### List the sections
```text
List the sections a homepage for [business name] should have, in order, with one line on the job of each. Don't build anything yet.
```

### The plan (run in plan mode)
```text
Here is the brief: [your brief]

Plan a one-page website for this. Follow CLAUDE.md and DESIGN.md for the stack and design system. Use the images and video in [asset folder]. List the sections in order, what each contains and which asset it uses. Don't build yet.
```

### Three design directions
```text
Suggest three design directions for [business name]. For each: a display font and a body font from Google Fonts, five colours with hex codes (background, text, primary, accent, muted), and a one-line description of the mood. Show them as a simple preview page.
```

### Lock the design system
```text
Use direction [number]. Set it up as the design system for the whole project, and add a Design section to DESIGN.md / CLAUDE.md with the fonts, the colours and these rules:
- Only use colours from the palette.
- Spacing between sections is consistent across the site.
- Rounded corners are small and the same everywhere.
- One accent colour, used only for buttons and key highlights.
```

---

## 2. Build

### New section (five-part prompt)
```text
Context: [who this is for and what it is]
Task: Build the [section name] section.
Details: [what it must include]. [what it must avoid].
Reference: [a screenshot, or "none"]
Done when: [how you will judge it]
```

### New section, short form (uses `.claude/skills/new-section/SKILL.md`)
```text
Add the [section name] section: [the content, in one or two sentences].
```

### From design words
```text
Restyle the [section]. [layout word]. [type words]. [space word]. [surface words].
```
*Vocabulary:*
- **Layout:** `split layout`, `centred`, `full-bleed`, `grid`, `bento grid`, `asymmetric`
- **Type:** `serif`, `sans-serif`, `display font`, `tight tracking`, `large scale`
- **Space:** `whitespace`, `padding`, `breathing room`
- **Surface:** `flat`, `soft shadow`, `grain`, `glass`, `border`
- **Motion:** `fade in`, `slide up`, `stagger`, `parallax`, `hover lift`

### From a reference screenshot (form only — never copy brand, text, or images)
```text
Use this screenshot as a reference for layout, spacing and proportions only. Keep our own content, colours and fonts. Rebuild the [section] in this structure.
```

### Options
```text
Give me three versions of [thing], each on its own preview route. Describe each in one line.
```

### Pick one
```text
Use [number]. [One or two small adjustments]. Keep everything else the same.
```

### Which cinematic moves suit this site?
```text
Here are five cinematic moves a website can use: a slow video hero, scroll-linked motion, a pinned section, depth (parallax), and a 3D object drawn live in the browser.

The [business name] homepage will already have the slow video hero. Which two of the other four would suit it best, and why? For each of the two, say where on the page it would go, what it adds to the story, and what it costs in loading time and on weaker phones. Then say in one line each why you left out the other two.

Don't build anything yet.
```

### Cinematic move: a pinned scroll story
```text
Add a new section called "[name]", directly after "[section before it]". It is a pinned scroll story with three steps: [one], [two], [three].

How it should behave:
- When the section reaches the top of the screen, it holds still while the visitor keeps scrolling.
- Each step replaces the one before it, in step with the scroll. A step is a large number, a short heading and one sentence of real copy.
- After the third step, the section lets go and the page scrolls on as normal.

How to build it:
- Use GSAP ScrollTrigger for the pinning and the scroll-linked changes.
- It must work with touch scrolling on phones, with no jumping and no sideways scroll (use overflow-x: clip on body).
- If the visitor has asked for reduced motion, don't pin anything. Show the three steps as a plain stacked layout instead.
- Follow DESIGN.md and CLAUDE.md.
- Ask me before installing any package.
```

### Cinematic move: one 3D moment
```text
In the "[section]" section, add one 3D moment: a single [object] that turns slowly, placed beside the text.

How to build it:
- Build the [object] in code with Three.js. Don't download a 3D model.
- It turns slowly by itself, and tilts a little more as the visitor scrolls. Gentle, never fast.
- Its colours and lighting follow DESIGN.md.
- Keep the [existing image] where it is. The [object] is a small accent, not a replacement for the image.

Keep the page fast and safe:
- Load the 3D code only when the "[section]" section is near the screen, not when the page first opens.
- On small phones, and when the visitor has asked for reduced motion, don't load the 3D at all. Show a still image of the [object] in the same place instead.
- If 3D fails for any reason, show the same still image and keep the rest of the page working.

In your plan, tell me how you will make the still image. Ask me before installing any package.
```

### A working contact form
```text
Add a contact section with a form: name, email and message. On submit, save the entry to the leads table in my Supabase project (with Row Level Security enabled: public insert only, no public read). Use only the public key in the site and store it in .env.local. Validate that the email looks real and the message isn't empty. Show a clear success message, and a clear error message if it fails. Add basic protection against spam bots.
```

---

## 3. Fix

### From a screenshot
```text
In this screenshot, [what is wrong] in [where]. Fix it. Keep everything else the same.
```

### One change
```text
[What is wrong, in plain words]. [The one limit]. Keep everything else the same.
```

### An error
```text
I'm getting this error. Fix it and tell me in one line what caused it.

[paste the whole error]
```

### When you are lost
```text
What files are in this project and what does each one do?
```

---

## 4. Assets (Google Flow / Image & Video)

### The image formula (6 parts)
```text
[Subject]. [Setting]. [Lighting]. [Camera]. [Mood and palette]. [Format].
```

### Style line (paste into every prompt for shoot consistency; change only the subject)
```text
[Lighting]. [Camera]. [Mood and palette].
```

### Refine an image (one change)
```text
Same scene and lighting. [The one thing to change].
```

### Hero video from text
```text
Slow motion close-up of [subject and one small movement]. Camera locked off, no movement. [Lighting]. [Palette]. Calm and minimal. No text, no people's faces. 16:9.
```

### Hero video from your own still (upload still as starting frame)
```text
[One small movement]. Light shifts very slightly. The camera pushes in extremely slowly. Nothing else moves.
```

### Exploded-view picture 1 (Image, 16:9, 1 result)
```text
[Product and its parts], studio product photo, side view. The set is centred and small in the frame, with a lot of empty space above it. Plain [colour] background, soft warm light from the left. No text, no hands, no steam.
```

### Exploded-view picture 2 (attach picture 1 first)
```text
Keep this exact set, the same camera, the same light and the same background. Show it as an exploded view: [part] floats at the top, [part] floats in the middle, and [part] stays at the bottom. All in one straight vertical line, with clear gaps between them. Nothing else changes.
```

### Exploded-view video (Frames: picture 1 in Start, picture 2 in End)
```text
[The parts that move] lift straight up, slowly and smoothly, until the set is fully apart. [The part that stays] does not move. The camera does not move. The background and the light do not change.
```

### Prepare files for the web
```text
Prepare the files in [images folder] for the web:
- Convert every image to WebP, sized for how it will be used: hero up to 1920px wide (<= 300 KB), product shots up to 1000px wide (<= 150 KB).
- Compress hero.mp4: 1080p at most, no audio track, under 4 MB.
- Save the first frame of the video as hero-poster.webp.
- Show me a table of file sizes before and after.
If you need to install a tool to do this, tell me first.
```

---

## 5. Finish

### Images and video, checked
```text
Check every image and the hero video on the page:
1. Each image is loaded at the right size for where it appears, and images below the hero load lazily.
2. Each image has alt text describing what's in it.
3. The hero video is muted, loops, plays inline on phones, and shows the poster until it's ready.
4. No image is stretched or cropped badly at any screen width (390px, 768px, 1440px).
Fix what's wrong and list what you changed.
```

### The mobile check (paste screenshots first)
```text
At phone width (390px): [problem one], [problem two], and [problem three]. Fix these three. Ensure navigation fits cleanly behind a menu button on small screens.
```

### The polish pass
```text
Do a polish pass on the whole page: consistent spacing between sections, consistent heading sizes, every button and link has a hover state and focus-visible outline, and section animations are subtle (< 500ms, once) and the same throughout. List what you changed.
```

### The speed check
```text
Check the page's loading speed and tell me the three changes that would improve it most.
```

### Cost of cinematic moves
```text
Measure how much the scroll story and the 3D [object] added to the page's loading weight. Compare the page before and after these two additions and show me the numbers in a small table. Then list every file you changed or added, and every package you installed.
```

### Key safety check
```text
Confirm that no secret key is used anywhere in the site's code, that .env.local is in .gitignore, and no keys or passwords are committed in git history.
```

### Search and sharing (SEO, favicon, social preview)
```text
Set up the basics for search and sharing:
- A page title under 60 characters and a description between 60 and 155 characters.
- A share image at 1200 by 630 in WebP.
- A favicon made from our logo.
- A sitemap and a robots file.
```

---

## 6. Going Further (Real-Time 3D & Scroll Video)

### Standalone 3D page technical baseline (from the 3D Prompt Pack)
Every standalone Three.js r169 / WebGL2 page should include:
- Self-contained `index.html` (or modular script) with Three.js r169 via jsDelivr import map (`three` + `three/addons`) or pure WebGL2 fragment shader, no external `.glb` or image files required.
- Top-level `CONFIG` block + `PRESETS` array (4 live-switchable colour/copy themes via a fixed bottom-right swatch pill).
- URL parameters: `?embed` (hide UI/preset pill), `?preset=N` (start on preset N), `?tour` (auto-scroll down and back).
- `devicePixelRatio` capped at `2` (`1.5` for full-screen raymarching), resize-safe, 60 fps target, responsive down to `390px` portrait screens.
- `IntersectionObserver` scroll reveals + `prefers-reduced-motion` support.

### Build from a full specification (`PROMPT.md`)
```text
Read PROMPT.md and build the website exactly as it specifies. Do not ask me questions unless you are blocked. When it is built, run the checks listed at the end of the prompt and tell me which ones passed.
```

### One round of fixes after a big build
```text
I scrolled the whole page. [Number] fixes, and keep everything else exactly as it is.
1. In the "[part]" part, [what I see]. [What I want instead].
2. [What I see]. [What I want instead].
When you're done, look at all of them at 1440 wide and 390 wide and tell me what you changed.
```

### Scroll plays the video
```text
I've put a [length]-second video in the project folder: [file name]. It shows [what happens in it]. Add a new section called "[name]", after "[section]", where scrolling plays this video: scroll down and [it moves forward], scroll up and it goes back. Prepare the video for the web first, so that scrubbing is smooth. Beside it, [number] short lines appear one at a time: [the lines]. With reduced motion turned on, show a still image instead. Don't change anything else.
```

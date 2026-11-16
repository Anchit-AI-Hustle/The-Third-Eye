---
name: web-3d-section
description: Build or update a real-time 3D WebGL/Three.js section, standalone 3D landing page, or scroll-scrubbed video story. Use when the user asks for Three.js, WebGL2, real-time 3D objects, or scroll-driven product reveals.
---

# Real-Time 3D & Scroll-Story Workflow

Apply these standards whenever building a 3D scene or scroll-driven visual story:

1. **Start with the story, not the 3D**
   - Define what happens first, what happens next, and what the visitor should feel.
   - Apply **cinematic restraint**: a slow hero visual plus at most **one or two** other cinematic moves (scroll-linked motion, pinned section, parallax, or one 3D moment). Never stack all five on one page.

2. **Architecture for standalone 3D pages (Three.js r169 / WebGL2)**
   - Self-contained HTML/JS/CSS with Three.js r169 via jsDelivr import map (`three` + `three/addons`) or zero-dependency WebGL2 fragment shaders, generating geometry/textures procedurally when no external `.glb` is needed.
   - Put every tweakable value (colours, counts, speeds, in-3D copy) in a top-level `CONFIG` block and a `PRESETS` array.
   - Support standard URL parameters:
     - `?embed` — hide the preset dock / overlay UI
     - `?preset=N` — start on preset index `N`
     - `?tour` — automatically scroll down and back (for scrollable 3D pages)
   - Cap pixel ratio: `Math.min(window.devicePixelRatio, 2)` (or `1.5` for heavy full-screen fragment raymarchers). Handle `resize` cleanly and target 60 fps.
   - Drive scroll storytelling from a smoothed scroll progress (`lerp`) each frame rather than timers, so scrolling backwards reverses cleanly.

3. **Performance & safety guards for 3D inside marketing pages**
   - **Lazy-load 3D** only when the section approaches the viewport (`IntersectionObserver`), never blocking initial page paint.
   - **Small phones (`<= 480px` / `390px`)**: do not load heavy live 3D; render a crisp, lightweight still `.webp` image in the same slot instead.
   - **Reduced motion (`prefers-reduced-motion: reduce` or `html[data-motion="off"]`)**: do not run continuous rotation, pinning, or WebGL loops; show the still image or a plain stacked layout.
   - **WebGL failure fallback**: wrap renderer creation in `try/catch` and fall back gracefully to the still image so the page never breaks.

4. **Scroll-scrubbed video alternative**
   - When photorealism matters more than live camera interaction, use a short (3–6s) locked-camera video made from a single Start -> End image pair.
   - Prepare for web scrubbing: `<= 1080p`, audio stripped (`-an`), `< 4 MB` (ideally `< 1 MB`), fast-seekable keyframes (`-g 1` or dense keyframes, `-movflags +faststart`), plus a `-poster.webp` first frame.
   - Respect `prefers-reduced-motion` by showing the static poster image instead of scrubbing.

5. **Verify before finishing**
   - Scroll slowly forwards and backwards; verify no jumping, no sideways scroll (`overflow-x: clip`, never `overflow-x: hidden` on `body`), and clean re-framing at `390px`, `768px`, and `1440px`.
   - Measure added bundle/asset weight and report it clearly.

"use client";

import { useEffect, useRef, useState } from "react";

import { onMediaChange } from "@/hooks/useReducedMotion";

// The "third eye": a layered WebGL scene built from four depth planes — an
// outer particle nebula, three counter-rotating iris rings, a faceted core,
// and a bloom sprite. The layers sit at genuinely different Z positions and
// parallax against each other, which is what produces depth; a single rotating
// object at one depth reads as a flat spinning badge no matter how detailed.
//
// Guards, in order of how badly each one bites in production:
//   • WebGL unavailable/blocked  → onFallback() so the caller can show art
//   • tab hidden or scrolled off → loop parked, zero GPU draw
//   • high-DPR displays          → pixel ratio capped at 2
//   • prefers-reduced-motion     → one composed frame, then stop
//   • unmount                    → every geometry/material/renderer disposed
export function HeroCanvas({ onFallback }: { onFallback?: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // Held in a ref so an inline callback from the caller cannot re-trigger the
  // effect — that would tear down and rebuild the WebGL context every render.
  const fallbackRef = useRef(onFallback);
  fallbackRef.current = onFallback;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let cleanup = () => {};

    import("three")
      .then((THREE) => {
        if (disposed || !mount) return;

        const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        let reduce = motionQuery.matches;
        const w = () => mount.clientWidth || window.innerWidth;
        const h = () => mount.clientHeight || 560;

        let renderer: import("three").WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: true,
            powerPreference: "low-power",
            failIfMajorPerformanceCaveat: false,
          });
        } catch {
          // Software-blocked WebGL, exhausted contexts, or a hardened browser.
          setFailed(true);
          fallbackRef.current?.();
          return;
        }

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w(), h());
        renderer.setClearColor(0x000000, 0);
        mount.appendChild(renderer.domElement);
        Object.assign(renderer.domElement.style, {
          width: "100%",
          height: "100%",
          display: "block",
        });

        // Teardown is assembled as each resource appears rather than written
        // once at the end of setup. Anything that throws part-way through —
        // no IntersectionObserver on older Safari, a driver fault while
        // building the scene — lands in the .catch() below with the context
        // and some listeners already live. With cleanup still the initial
        // no-op at that point, React would drop the canvas without releasing
        // the context, and a few client-side navigations would exhaust the
        // browser's context quota.
        const teardown: Array<() => void> = [
          () => {
            renderer.dispose();
            renderer.forceContextLoss();
            if (renderer.domElement.parentNode === mount) {
              mount.removeChild(renderer.domElement);
            }
          },
        ];
        // Reverse order, so each resource is released before whatever it was
        // built on top of.
        cleanup = () => {
          while (teardown.length) teardown.pop()?.();
        };

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(52, w() / h(), 0.1, 200);
        camera.position.z = 7.4;

        const ACCENT = 0x4fc3f7;
        const VIOLET = 0x7b5cf0;
        const disposables: { dispose: () => void }[] = [];
        const track = <T extends { dispose: () => void }>(x: T) => {
          disposables.push(x);
          return x;
        };
        // Closes over the array, so it disposes whatever was tracked before a
        // throw, not just a fully-built scene.
        teardown.push(() => disposables.forEach((d) => d.dispose()));

        // Parent group carries the shared parallax; each layer rotates within it.
        const root = new THREE.Group();
        scene.add(root);

        // ── Layer 1 (far): particle nebula ────────────────────────
        // Depth is faked per-point via size attenuation, so points further
        // back genuinely render smaller and dimmer.
        const COUNT = 2600;
        const pos = new Float32Array(COUNT * 3);
        for (let i = 0; i < COUNT; i++) {
          const u = Math.random();
          const v = Math.random();
          const theta = 2 * Math.PI * u;
          const phi = Math.acos(2 * v - 1);
          // Shell thickness varies so the cloud has volume rather than being
          // a hollow eggshell.
          const r = 3.1 + (Math.random() - 0.5) * 1.4;
          pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
          pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.82;
          pos[i * 3 + 2] = r * Math.cos(phi);
        }
        const nebulaGeo = track(new THREE.BufferGeometry());
        nebulaGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const nebulaMat = track(
          new THREE.PointsMaterial({
            color: ACCENT,
            size: 0.028,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        const nebula = new THREE.Points(nebulaGeo, nebulaMat);
        root.add(nebula);

        // ── Layer 2: three iris rings on separate axes ────────────
        const rings: import("three").Mesh[] = [];
        const RING_SPEC = [
          { r: 2.35, tube: 0.012, color: ACCENT, opacity: 0.55, z: 0.0 },
          { r: 1.92, tube: 0.008, color: ACCENT, opacity: 0.35, z: 0.45 },
          { r: 2.68, tube: 0.006, color: VIOLET, opacity: 0.4, z: -0.6 },
        ];
        RING_SPEC.forEach((s, i) => {
          const geo = track(new THREE.TorusGeometry(s.r, s.tube, 8, 128));
          const mat = track(
            new THREE.MeshBasicMaterial({
              color: s.color,
              transparent: true,
              opacity: s.opacity,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          );
          const ring = new THREE.Mesh(geo, mat);
          ring.position.z = s.z;
          ring.rotation.x = Math.PI / 2.6 + i * 0.35;
          ring.rotation.y = i * 0.5;
          rings.push(ring);
          root.add(ring);
        });

        // ── Layer 3: faceted core ─────────────────────────────────
        const coreGeo = track(new THREE.IcosahedronGeometry(1.05, 1));
        const coreMat = track(
          new THREE.MeshBasicMaterial({
            color: ACCENT,
            wireframe: true,
            transparent: true,
            opacity: 0.32,
          }),
        );
        const core = new THREE.Mesh(coreGeo, coreMat);
        root.add(core);

        // ── Layer 4 (near): bloom + pupil ─────────────────────────
        const bloomGeo = track(new THREE.SphereGeometry(0.62, 32, 32));
        const bloomMat = track(
          new THREE.MeshBasicMaterial({
            color: ACCENT,
            transparent: true,
            opacity: 0.16,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        const bloom = new THREE.Mesh(bloomGeo, bloomMat);
        root.add(bloom);

        const pupilGeo = track(new THREE.SphereGeometry(0.26, 24, 24));
        const pupilMat = track(
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
        );
        root.add(new THREE.Mesh(pupilGeo, pupilMat));

        // ── Damped pointer parallax ───────────────────────────────
        // Raw pointer values snap; easing toward a target is what makes the
        // scene feel like it has mass.
        const target = { x: 0, y: 0 };
        const eased = { x: 0, y: 0 };
        const onMove = (e: PointerEvent) => {
          if (e.pointerType === "touch") return;
          target.x = (e.clientX / window.innerWidth - 0.5) * 0.55;
          target.y = (e.clientY / window.innerHeight - 0.5) * 0.55;
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        teardown.push(() => window.removeEventListener("pointermove", onMove));

        const onResize = () => {
          camera.aspect = w() / h();
          camera.updateProjectionMatrix();
          renderer.setSize(w(), h());
        };
        window.addEventListener("resize", onResize);
        teardown.push(() => window.removeEventListener("resize", onResize));

        // ── Run only when actually on screen and visible ──────────
        let raf = 0;
        teardown.push(() => cancelAnimationFrame(raf));
        let onScreen = true;
        let visible = document.visibilityState !== "hidden";
        // `reduce` belongs in this guard, not just in the initial branch:
        // IntersectionObserver always delivers an entry on observe(), so
        // without it the static single-frame path would immediately be
        // restarted into a continuous loop for exactly the users who asked
        // for no animation.
        const running = () => !reduce && onScreen && visible && !disposed;

        const io = new IntersectionObserver(
          ([entry]) => {
            onScreen = entry.isIntersecting;
            if (running() && !raf) loop();
          },
          { threshold: 0 },
        );
        io.observe(mount);
        teardown.push(() => io.disconnect());

        const onVis = () => {
          visible = document.visibilityState !== "hidden";
          if (running() && !raf) loop();
        };
        document.addEventListener("visibilitychange", onVis);
        teardown.push(() => document.removeEventListener("visibilitychange", onVis));

        const clock = new THREE.Clock();
        const draw = (t: number) => {
          // Exponential smoothing toward the pointer target.
          eased.x += (target.x - eased.x) * 0.045;
          eased.y += (target.y - eased.y) * 0.045;

          root.rotation.y = t * 0.1 + eased.x;
          root.rotation.x = Math.sin(t * 0.14) * 0.12 + eased.y;

          // Counter-rotation is what reads as separate mechanical layers.
          rings[0].rotation.z = t * 0.22;
          rings[1].rotation.z = -t * 0.34;
          rings[2].rotation.z = t * 0.16;

          core.rotation.y = -t * 0.18;
          core.rotation.x = t * 0.09;
          core.scale.setScalar(1 + Math.sin(t * 1.3) * 0.045);

          bloom.scale.setScalar(1 + Math.sin(t * 0.9) * 0.09);
          bloomMat.opacity = 0.13 + Math.sin(t * 0.9) * 0.045;

          nebula.rotation.y = -t * 0.045;

          renderer.render(scene, camera);
        };

        const loop = () => {
          if (!running()) {
            raf = 0;
            return;
          }
          raf = requestAnimationFrame(loop);
          draw(clock.getElapsedTime());
        };

        // One composed frame at a flattering point in the cycle, then idle.
        const drawStatic = () => draw(2.1);

        if (reduce) drawStatic();
        else loop();

        // Tracked live rather than read once: someone turning reduced motion on
        // while the page is open is usually reacting to this canvas. Handled
        // here instead of by re-running the effect, which would tear down and
        // rebuild the WebGL context for a preference change.
        const offMotionChange = onMediaChange(motionQuery, (e) => {
          reduce = e.matches;
          if (reduce) {
            cancelAnimationFrame(raf);
            raf = 0;
            drawStatic();
          } else if (running() && !raf) {
            loop();
          }
        });
        teardown.push(offMotionChange);
      })
      .catch(() => {
        // Release whatever setup got built before the throw. The component
        // stays mounted showing the fallback, so waiting for React to unmount
        // would hold a dead WebGL context open for the life of the page.
        cleanup();
        cleanup = () => {};
        setFailed(true);
        fallbackRef.current?.();
      });

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  // On failure the CSS gradient below is the whole visual — the hero copy
  // still needs something behind it.
  if (failed) {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(79,195,247,0.16), transparent 55%), radial-gradient(circle at 50% 45%, rgba(123,92,240,0.10), transparent 70%)",
        }}
      />
    );
  }

  return <div ref={mountRef} aria-hidden className="pointer-events-none absolute inset-0" />;
}

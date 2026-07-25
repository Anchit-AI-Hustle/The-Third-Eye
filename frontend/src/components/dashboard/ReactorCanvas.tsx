"use client";

import { useEffect, useRef } from "react";

// A compact live 3D "arc reactor" for the dashboard: concentric torus rings
// spinning on different axes around a glowing core, in the app cyan. Lazy-loads
// three (off the server bundle), DPR-capped, pauses when the tab is hidden,
// respects prefers-reduced-motion, and disposes on unmount. Purely decorative.
export function ReactorCanvas({ size = 150 }: { size?: number }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};

    import("three").then((THREE) => {
      if (disposed || !mount) return;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.z = 5;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(size, size);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);

      const CYAN = 0x4fc3f7;
      const group = new THREE.Group();
      scene.add(group);

      const mkRing = (r: number, tube: number, op: number) => {
        const g = new THREE.TorusGeometry(r, tube, 16, 64);
        const m = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: op });
        return { mesh: new THREE.Mesh(g, m), g, m };
      };
      const rings = [mkRing(1.7, 0.03, 0.5), mkRing(1.35, 0.05, 0.7), mkRing(1.0, 0.04, 0.85)];
      rings[0].mesh.rotation.x = 1.1;
      rings[1].mesh.rotation.y = 1.1;
      rings[2].mesh.rotation.x = 0.5;
      rings.forEach((r) => group.add(r.mesh));

      // Core + additive glow.
      const coreG = new THREE.SphereGeometry(0.42, 32, 32);
      const coreM = new THREE.MeshBasicMaterial({ color: 0xd7f3ff });
      const core = new THREE.Mesh(coreG, coreM);
      group.add(core);
      const glowG = new THREE.SphereGeometry(0.75, 32, 32);
      const glowM = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
      group.add(new THREE.Mesh(glowG, glowM));

      let hidden = false;
      const onVis = () => { hidden = document.visibilityState === "hidden"; if (!hidden) loop(); };
      document.addEventListener("visibilitychange", onVis);

      const clock = new THREE.Clock();
      const loop = () => {
        if (disposed || hidden) return;
        raf = requestAnimationFrame(loop);
        const t = clock.getElapsedTime();
        const s = reduce ? 0.15 : 1;
        rings[0].mesh.rotation.z = t * 0.6 * s;
        rings[1].mesh.rotation.z = -t * 0.9 * s;
        rings[2].mesh.rotation.y = t * 1.2 * s;
        core.scale.setScalar(1 + Math.sin(t * 2) * (reduce ? 0.02 : 0.08));
        group.rotation.y = Math.sin(t * 0.3) * 0.25;
        renderer.render(scene, camera);
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        document.removeEventListener("visibilitychange", onVis);
        rings.forEach((r) => { r.g.dispose(); r.m.dispose(); });
        coreG.dispose(); coreM.dispose(); glowG.dispose(); glowM.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      };
    }).catch(() => { /* WebGL unavailable / three failed to load — purely decorative, ignore */ });

    return () => { disposed = true; cleanup(); };
  }, [size]);

  return <div ref={mountRef} style={{ width: size, height: size }} className="my-4" aria-hidden />;
}

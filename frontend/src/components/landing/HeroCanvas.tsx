"use client";

import { useEffect, useRef } from "react";

// A lightweight Three.js backdrop for the landing hero: a slowly-rotating
// particle "eye" (a sphere shell of points) around a glowing wireframe core,
// in the app's cyan. Mouse parallax, DPR-capped, pauses when the tab is hidden,
// respects prefers-reduced-motion, and fully disposes on unmount.
export function HeroCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let raf = 0;

    // Import three lazily so it never touches the server bundle.
    let cleanup = () => {};
    import("three").then((THREE) => {
      if (disposed || !mount) return;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      const w = () => mount.clientWidth || window.innerWidth;
      const h = () => mount.clientHeight || 520;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, w() / h(), 0.1, 100);
      camera.position.z = 6;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w(), h());
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";

      const group = new THREE.Group();
      scene.add(group);

      // Particle sphere shell — the "eye".
      const COUNT = 3000;
      const positions = new Float32Array(COUNT * 3);
      for (let i = 0; i < COUNT; i++) {
        // even-ish distribution on a sphere with a little radial jitter
        const u = Math.random(), v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = 2.6 + (Math.random() - 0.5) * 0.35;
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const pMat = new THREE.PointsMaterial({
        color: 0x4fc3f7, size: 0.03, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const points = new THREE.Points(pGeo, pMat);
      group.add(points);

      // Glowing wireframe core.
      const coreGeo = new THREE.IcosahedronGeometry(1.15, 1);
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0x4fc3f7, wireframe: true, transparent: true, opacity: 0.28,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);

      // Inner solid glow.
      const glowGeo = new THREE.SphereGeometry(0.55, 32, 32);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0x4fc3f7, transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      group.add(new THREE.Mesh(glowGeo, glowMat));

      // Mouse parallax.
      const target = { x: 0, y: 0 };
      const onMove = (e: MouseEvent) => {
        target.x = (e.clientX / window.innerWidth - 0.5) * 0.6;
        target.y = (e.clientY / window.innerHeight - 0.5) * 0.6;
      };
      window.addEventListener("mousemove", onMove);

      const onResize = () => { camera.aspect = w() / h(); camera.updateProjectionMatrix(); renderer.setSize(w(), h()); };
      window.addEventListener("resize", onResize);

      let hidden = false;
      const onVis = () => { hidden = document.visibilityState === "hidden"; if (!hidden) loop(); };
      document.addEventListener("visibilitychange", onVis);

      const clock = new THREE.Clock();
      const loop = () => {
        if (disposed || hidden) return;
        raf = requestAnimationFrame(loop);
        const t = clock.getElapsedTime();
        const speed = reduce ? 0.04 : 0.12;
        group.rotation.y = t * speed + target.x;
        group.rotation.x = Math.sin(t * 0.15) * 0.15 + target.y;
        core.rotation.y = -t * 0.2;
        core.rotation.x = t * 0.1;
        const pulse = 1 + Math.sin(t * 1.4) * (reduce ? 0.01 : 0.05);
        core.scale.setScalar(pulse);
        renderer.render(scene, camera);
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVis);
        pGeo.dispose(); pMat.dispose(); coreGeo.dispose(); coreMat.dispose();
        glowGeo.dispose(); glowMat.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      };
    });

    return () => { disposed = true; cleanup(); };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 -z-0 pointer-events-none" aria-hidden />;
}

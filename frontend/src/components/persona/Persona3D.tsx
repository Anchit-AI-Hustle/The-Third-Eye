"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// A self-contained holographic 3D persona rendered with three.js (no external
// model files, no extra deps). Each voice agent gets one, tinted to its accent
// colour; it idles with a slow rotation + shimmer and reacts when the agent is
// speaking (the core pulses and the aura flares) so the persona visibly "talks".
//
// Built imperatively (one WebGL context per instance) so it drops into any
// surface — the assistant, the Online Agents stage, a resume hero — as a plain
// component. `speaking`/`level` are read via refs each frame (no re-mounts).

export function Persona3D({
  color = "#4FC3F7",
  speaking = false,
  level = 0,
  className = "",
}: {
  color?: string;
  speaking?: boolean;
  level?: number;   // 0..1 live voice amplitude (optional; falls back to a pulse)
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const speakingRef = useRef(speaking);
  const levelRef = useRef(level);
  speakingRef.current = speaking;
  levelRef.current = level;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof window === "undefined") return;

    const col = new THREE.Color(color);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      return; // WebGL unavailable — leave the slot empty rather than crash
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    // ── Core: a faceted "head" — solid inner + wireframe shell ────────────────
    const group = new THREE.Group();
    scene.add(group);

    const coreGeo = new THREE.IcosahedronGeometry(1.15, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    const shellMat = new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: 0.7 });
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1), shellMat);
    group.add(shell);

    // ── Aura: a point cloud sphere that flares while speaking ─────────────────
    const AURA = 900;
    const auraPos = new Float32Array(AURA * 3);
    const auraBase = new Float32Array(AURA); // base radius per point
    for (let i = 0; i < AURA; i++) {
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u, phi = Math.acos(2 * v - 1);
      const r = 1.7 + Math.random() * 0.9;
      auraBase[i] = r;
      auraPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      auraPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      auraPos[i * 3 + 2] = r * Math.cos(phi);
    }
    const auraGeo = new THREE.BufferGeometry();
    auraGeo.setAttribute("position", new THREE.BufferAttribute(auraPos, 3));
    const auraMat = new THREE.PointsMaterial({ color: col, size: 0.045, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const aura = new THREE.Points(auraGeo, auraMat);
    group.add(aura);

    // ── Orbiting rings ────────────────────────────────────────────────────────
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.9 + i * 0.22, 0.012, 8, 96),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5 }),
      );
      ring.rotation.x = Math.PI / 2 + i * 0.5;
      ring.rotation.y = i * 0.8;
      group.add(ring);
      rings.push(ring);
    }

    const resize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    let t = 0;
    let flare = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const dt = clock.getDelta();
      t += dt;
      // Target intensity: live level when provided, else a speaking pulse.
      const target = speakingRef.current ? Math.max(0.35, levelRef.current || (0.5 + 0.5 * Math.sin(t * 12))) : 0;
      flare += (target - flare) * Math.min(1, dt * 8);

      group.rotation.y += dt * (0.25 + flare * 0.6);
      group.rotation.x = Math.sin(t * 0.3) * 0.12;

      const s = 1 + flare * 0.16 + Math.sin(t * 2) * 0.01;
      core.scale.setScalar(s);
      coreMat.opacity = 0.1 + flare * 0.35;
      shellMat.opacity = 0.55 + flare * 0.35;
      shell.rotation.z += dt * 0.15;

      // Aura points breathe outward with the flare.
      const pos = auraGeo.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < AURA; i++) {
        const base = auraBase[i];
        const k = (base + flare * 0.5 + Math.sin(t * 3 + i) * 0.03) / base;
        arr[i * 3] = (auraPos[i * 3]) * k;
        arr[i * 3 + 1] = (auraPos[i * 3 + 1]) * k;
        arr[i * 3 + 2] = (auraPos[i * 3 + 2]) * k;
      }
      pos.needsUpdate = true;
      auraMat.opacity = 0.55 + flare * 0.4;

      rings.forEach((r, i) => { r.rotation.z += dt * (0.3 + i * 0.2) * (1 + flare); });

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      coreGeo.dispose(); coreMat.dispose(); shellMat.dispose();
      auraGeo.dispose(); auraMat.dispose();
      rings.forEach((r) => { r.geometry.dispose(); (r.material as THREE.Material).dispose(); });
      shell.geometry.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [color]);

  return <div ref={mountRef} className={className} aria-hidden />;
}

'use client';
import { useEffect, useRef } from 'react';

const EMOJIS = ['🦁', '🐘', '🐒', '🦇', '🦋', '🐜', '👑'];
const PARTICLE_COUNT = 36;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  emoji: string;
  rot: number;
  vrot: number;
  radius: number;
}

/** Slow elegant emojis drifting in the background. They bounce off the
 *  viewport edges and gently swap velocity components when they collide
 *  with each other (an approximation of an elastic bounce in 2D). */
export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);

    function resize() {
      if (!canvas || !ctx) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    // Seed particles deterministically per mount (fresh each visit, no SSR concerns)
    const seedRng = mulberry32(0xC0FFEE);
    const W = window.innerWidth;
    const H = window.innerHeight;
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => {
      const size = 26 + seedRng() * 26;          // 26–52 px
      const speed = 12 + seedRng() * 16;         // 12–28 px/sec — slow & elegant
      const angle = seedRng() * Math.PI * 2;
      return {
        x: seedRng() * W,
        y: seedRng() * H,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        emoji: EMOJIS[Math.floor(seedRng() * EMOJIS.length)],
        rot: seedRng() * Math.PI * 2,
        vrot: (seedRng() - 0.5) * 0.4,           // very slow rotation
        radius: size * 0.42,
      };
    });

    function step(now: number) {
      if (!ctx || !canvas) return;
      const last = lastRef.current || now;
      const dt = Math.min(0.05, (now - last) / 1000); // clamp big gaps
      lastRef.current = now;

      const W = window.innerWidth;
      const H = window.innerHeight;

      const ps = particlesRef.current;

      // Integrate
      for (const p of ps) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;

        // Wall bounce
        if (p.x - p.radius < 0)       { p.x = p.radius;     p.vx = Math.abs(p.vx); }
        else if (p.x + p.radius > W)  { p.x = W - p.radius; p.vx = -Math.abs(p.vx); }
        if (p.y - p.radius < 0)       { p.y = p.radius;     p.vy = Math.abs(p.vy); }
        else if (p.y + p.radius > H)  { p.y = H - p.radius; p.vy = -Math.abs(p.vy); }
      }

      // Pairwise collisions — O(n²) but n=36, totally fine.
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i], b = ps[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist2 = dx * dx + dy * dy;
          const minDist = a.radius + b.radius;
          if (dist2 < minDist * minDist && dist2 > 0.0001) {
            const dist = Math.sqrt(dist2);
            // Unit normal
            const nx = dx / dist, ny = dy / dist;
            // Separate so they no longer overlap (split the overlap evenly)
            const overlap = (minDist - dist) / 2;
            a.x -= nx * overlap; a.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;
            // Equal-mass elastic collision: swap normal components
            const va = a.vx * nx + a.vy * ny;
            const vb = b.vx * nx + b.vy * ny;
            const diff = vb - va;
            a.vx += diff * nx; a.vy += diff * ny;
            b.vx -= diff * nx; b.vy -= diff * ny;
          }
        }
      }

      // Render
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 0.18;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of ps) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.font = `${p.size}px "Segoe UI Emoji", "Apple Color Emoji", system-ui, sans-serif`;
        ctx.fillText(p.emoji, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 0 }}
    />
  );
}

// Small deterministic PRNG so a fresh render seeds the same start state.
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

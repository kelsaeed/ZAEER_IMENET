'use client';
import { useEffect, useRef } from 'react';

const EMOJIS = ['🦁', '🐘', '🐒', '🦇', '🦋', '🐜', '👑'];
// Tuned down from 36 → 18 after the user reported the canvas looked
// glitchy on a desktop browser. With 36 emojis the pairwise collision
// pass (O(n²) = 1296 ops/frame) plus 36 emoji-glyph paints per frame
// could pip the 16ms frame budget on weaker GPUs / Chromium with HW
// acceleration partially disabled. Halving it keeps the same vibe at
// roughly a quarter of the per-frame cost.
const PARTICLE_COUNT = 18;

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
    // If the user has asked the OS to reduce motion, don't render
    // anything — a moving background is the first thing to drop.
    if (typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);

    // Pre-rasterize each emoji glyph ONCE to its own offscreen canvas, then
    // drawImage() it per frame. Painting a colour-emoji glyph with fillText
    // every frame (18×) is the single most expensive thing this loop did;
    // drawImage of a cached bitmap is an order of magnitude cheaper and
    // GPU-friendly. Sprites are rendered at a supersampled size so they stay
    // crisp when scaled to each particle's size on HiDPI displays.
    const SPRITE_PX = 64;
    const spriteCache = new Map<string, HTMLCanvasElement>();
    for (const emoji of EMOJIS) {
      const s = document.createElement('canvas');
      s.width = s.height = Math.ceil(SPRITE_PX * dpr);
      const sctx = s.getContext('2d');
      if (sctx) {
        sctx.scale(dpr, dpr);
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.font = `${Math.floor(SPRITE_PX * 0.8)}px "Segoe UI Emoji", "Apple Color Emoji", system-ui, sans-serif`;
        sctx.fillText(emoji, SPRITE_PX / 2, SPRITE_PX / 2);
      }
      spriteCache.set(emoji, s);
    }

    // Cap the simulation at ~30fps. The drift is 12–28 px/sec — at that speed
    // 30fps is visually indistinguishable from 60fps but halves the work.
    const FRAME_MS = 1000 / 30;

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
      // 30fps gate: keep requesting frames but only integrate + repaint once
      // the frame interval has elapsed. Cheap early-out the rest of the time.
      const last = lastRef.current || now;
      if (now - last < FRAME_MS) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
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

      // Render — drawImage a cached sprite per particle instead of painting
      // the emoji glyph from scratch each frame.
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 0.18;
      for (const p of ps) {
        const sprite = spriteCache.get(p.emoji);
        if (!sprite) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.drawImage(sprite, -p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(step);
    }

    // Pause the loop entirely while the tab is hidden — no point integrating
    // physics or painting a background nobody can see, and resuming cleanly
    // avoids a big `dt` jump (lastRef is reset on resume).
    function onVisibility() {
      if (document.hidden) {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      } else if (rafRef.current == null) {
        lastRef.current = 0;
        rafRef.current = requestAnimationFrame(step);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    rafRef.current = requestAnimationFrame(step);

    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
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

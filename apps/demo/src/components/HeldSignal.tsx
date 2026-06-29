import { useEffect, useRef } from "react";

interface Props {
  locked?: boolean;
  width?: number;
  height?: number;
  seed?: number;
  className?: string;
}

/**
 * The signature element. An unverified feed reads as a restless graphite
 * sparkline; on a real on-chain verify it snaps flat and locks acid-lime.
 * Drives the SVG `d` attribute directly in a rAF (no React re-render); honors
 * prefers-reduced-motion (static line, colour swap only).
 */
export default function HeldSignal({ locked = false, width = 220, height = 44, seed = 1, className }: Props) {
  const pathRef = useRef<SVGPathElement>(null);
  const baseRef = useRef<SVGLineElement>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const N = 56;
    const mid = height / 2;
    const noise = (x: number) =>
      Math.sin(x * 0.9 + seed) * 0.5 + Math.sin(x * 0.37 + seed * 2) * 0.3 + Math.sin(x * 1.7 + seed) * 0.2;

    let t = seed * 13;
    let lock = locked ? 1 : 0;
    let raf = 0;

    const draw = () => {
      let d = "";
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * width;
        const wob = noise(i * 0.55 + t) * (height * 0.34);
        const y = mid - wob * (1 - lock);
        d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
      }
      const p = pathRef.current;
      if (p) {
        p.setAttribute("d", d);
        p.setAttribute("stroke", lock > 0.55 ? "var(--verified)" : "var(--dim)");
        p.style.filter = lock > 0.55 ? "drop-shadow(0 0 6px rgba(198,242,78,.5))" : "none";
      }
      if (baseRef.current) baseRef.current.style.opacity = String(lock * 0.5);
    };

    if (reduce) {
      lock = locked ? 1 : 0;
      draw();
      return;
    }
    const loop = () => {
      t += 0.045;
      lock += ((lockedRef.current ? 1 : 0) - lock) * 0.1;
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [width, height, seed]);

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <line
        ref={baseRef}
        x1="0"
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="var(--verified)"
        strokeWidth="1"
        strokeDasharray="2 4"
        style={{ opacity: 0 }}
      />
      <path ref={pathRef} fill="none" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

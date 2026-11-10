import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

/**
 * StreakFlame: an animated streak flame whose color and motion grow with the streak.
 * Pure inline SVG + CSS keyframes. Transforms/opacity only. Respects prefers-reduced-motion.
 *
 *   <StreakFlame days={streak} />            // 24px inline
 *   <StreakFlame days={streak} size={80} />  // hero / celebration
 */

export type StreakTier = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function getStreakTier(days: number): StreakTier {
  if (!(days > 0)) return 0;
  if (days < 5) return 1;
  if (days < 10) return 2;
  if (days < 25) return 3;
  if (days < 50) return 4;
  if (days < 100) return 5;
  return 6;
}

// @@TIERS-START
const TIERS = [
  { base: "#9CA3AF", tip: "#9CA3AF", mid: "#D1D5DB", core: "#E5E7EB", scale: 1, amp: 0, skew: 0, speed: 1, sparks: 0, halo: 0, midOn: false, coreOp: 0 },
  { base: "#FDE047", tip: "#FACC15", mid: "#FEF08A", core: "#FEFCE8", scale: 0.72, amp: 0.035, skew: 2.5, speed: 0.55, sparks: 0, halo: 0, midOn: false, coreOp: 0.55 },
  { base: "#FBBF24", tip: "#F97316", mid: "#FDE68A", core: "#FEF3C7", scale: 0.82, amp: 0.05, skew: 4, speed: 0.8, sparks: 0, halo: 0, midOn: false, coreOp: 0.7 },
  { base: "#F97316", tip: "#EF4444", mid: "#FDBA74", core: "#FEF9C3", scale: 0.9, amp: 0.07, skew: 5, speed: 1, sparks: 0, halo: 0.25, midOn: false, coreOp: 1 },
  { base: "#EF4444", tip: "#EC4899", mid: "#FB923C", core: "#FEF3C7", scale: 0.95, amp: 0.08, skew: 6, speed: 1.15, sparks: 3, halo: 0.35, midOn: true, coreOp: 1 },
  { base: "#EC4899", tip: "#A855F7", mid: "#F9A8D4", core: "#FDF4FF", scale: 1, amp: 0.1, skew: 7.5, speed: 1.3, sparks: 5, halo: 0.6, midOn: true, coreOp: 1 },
  { base: "#A855F7", tip: "#7C3AED", mid: "#E9D5FF", core: "#FFFFFF", scale: 1.04, amp: 0.11, skew: 8, speed: 1.4, sparks: 9, halo: 0.85, midOn: true, coreOp: 1 },
];

const PATHS = {
  outer: "M32 4C36 16 50 24 50 40C50 52 42 60 32 60C22 60 14 52 14 40C14 30 20 24 24 18C25 25 28 28 30 29C29 20 30 12 32 4Z",
  mid: "M32 20C35 28 43 34 43 44C43 53 38 58 32 58C26 58 21 53 21 44C21 37 26 33 28 27C29 32 31 33 32 34C31 29 31 24 32 20Z",
  core: "M32 36C35 41 38 45 38 50C38 55 35 58 32 58C29 58 26 55 26 50C26 45 29 41 32 36Z",
};

// Rising embers: x offset at the base, horizontal drift, duration (s), delay fraction.
const SPARKS = [
  { x: -6, dx: -5, d: 1.5, f: 0 }, { x: 5, dx: 6, d: 1.8, f: 0.45 }, { x: 0, dx: -2, d: 1.6, f: 0.8 },
  { x: -10, dx: -8, d: 2.0, f: 0.25 }, { x: 9, dx: 4, d: 1.7, f: 0.6 }, { x: -3, dx: 7, d: 1.9, f: 0.1 },
  { x: 7, dx: -6, d: 1.55, f: 0.7 }, { x: -8, dx: 3, d: 1.75, f: 0.35 }, { x: 2, dx: -9, d: 2.1, f: 0.9 },
];

// Burst sparks: a fan shot upward on tier-up.
const SHOTS = Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i / 9 - 0.5) * Math.PI * 1.5;
  return { dx: +(Math.cos(a) * 40).toFixed(1), dy: +(Math.sin(a) * 40 + 8).toFixed(1) };
});
// @@TIERS-END

// @@CSS-START
const CSS = `
.sf{display:inline-block;flex:none;overflow:visible;vertical-align:middle}
.sf *{transform-box:view-box}
.sf-b{transform-origin:32px 60px;transform:scale(var(--sf-s))}
.sf-l{transform-origin:32px 60px;animation:sf-lick var(--sf-d) ease-in-out infinite;animation-delay:var(--sf-dl)}
@keyframes sf-lick{
0%,100%{transform:translateX(0) skewX(0deg) scale(1,1)}
22%{transform:translateX(calc(var(--sf-k)*.12px)) skewX(calc(var(--sf-k)*1deg)) scale(calc(1 - var(--sf-a)*.35),calc(1 + var(--sf-a)))}
48%{transform:translateX(calc(var(--sf-k)*-.04px)) skewX(calc(var(--sf-k)*-.55deg)) scale(calc(1 + var(--sf-a)*.25),calc(1 - var(--sf-a)*.6))}
74%{transform:translateX(calc(var(--sf-k)*-.12px)) skewX(calc(var(--sf-k)*-1deg)) scale(calc(1 - var(--sf-a)*.2),calc(1 + var(--sf-a)*.55))}
}
.sf-burst .sf-b{animation:sf-flare 1.2s cubic-bezier(.2,.8,.25,1) both}
@keyframes sf-flare{0%{transform:scale(var(--sf-s))}16%{transform:scale(calc(var(--sf-s)*1.4))}100%{transform:scale(var(--sf-s))}}
.sf-shot{opacity:0}
.sf-burst .sf-shot{animation:sf-shoot .9s cubic-bezier(.15,.7,.3,1) both}
@keyframes sf-shoot{0%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(var(--sf-x),var(--sf-y))}}
.sf-halo{transform-origin:32px 40px;opacity:var(--sf-h)}
.sf-burst .sf-halo{animation:sf-halo-flare 1.2s ease-out both}
@keyframes sf-halo-flare{0%{opacity:var(--sf-h);transform:scale(1)}16%{opacity:1;transform:scale(1.2)}100%{opacity:var(--sf-h);transform:scale(1)}}
.sf-t6 .sf-halo{animation:sf-pulse 2.4s ease-in-out infinite}
@keyframes sf-pulse{0%,100%{opacity:var(--sf-h);transform:scale(1)}50%{opacity:calc(var(--sf-h)*.65);transform:scale(1.08)}}
.sf-t6 .sf-core{animation:sf-lick var(--sf-d) ease-in-out infinite,sf-shimmer 1.1s ease-in-out infinite;animation-delay:var(--sf-dl),0s}
@keyframes sf-shimmer{0%,100%{opacity:1}50%{opacity:.82}}
.sf-spark{opacity:0;animation:sf-rise var(--sf-d) linear infinite;animation-delay:var(--sf-dl)}
@keyframes sf-rise{0%{opacity:0;transform:translate(0,0) scale(1)}18%{opacity:.95}100%{opacity:0;transform:translate(var(--sf-x),-56px) scale(.4)}}
@media (prefers-reduced-motion:reduce){.sf *{animation:none!important}.sf-spark,.sf-shot{display:none}}
`;
// @@CSS-END

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export interface StreakFlameProps {
  days: number;
  /** Rendered size in px (square). Default 24. Below 40px sparks are hidden. */
  size?: number;
  className?: string;
}

export function StreakFlame({ days, size = 24, className }: StreakFlameProps) {
  const tier = getStreakTier(days);
  const T = TIERS[tier];
  const uid = "sf" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const small = size < 40;
  const live = tier > 0;

  // Tier-up burst: fires once when the tier goes up (not on first mount, not on a drop).
  const prev = useRef<StreakTier | null>(null);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (prev.current !== null && tier > prev.current && tier > 0) setBurst((b) => b + 1);
    prev.current = tier;
  }, [tier]);

  const layer = (base: number, delay: number, ampMul: number, skewMul: number): Vars => ({
    "--sf-d": `${(base / T.speed).toFixed(2)}s`,
    "--sf-dl": `${-delay}s`,
    "--sf-a": +(T.amp * ampMul).toFixed(3),
    "--sf-k": +(T.skew * skewMul).toFixed(2),
  });

  return (
    <>
      <style href="streak-flame" precedence="medium">{CSS}</style>
      <svg
        key={burst}
        viewBox="0 0 64 64"
        width={size}
        height={size}
        role="img"
        aria-label={`${days} day streak`}
        className={`sf sf-t${tier}${burst ? " sf-burst" : ""}${className ? " " + className : ""}`}
        style={{ "--sf-s": T.scale, "--sf-h": small ? T.halo * 0.5 : T.halo } as Vars}
      >
        <defs>
          <linearGradient id={`${uid}-o`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={T.tip} />
            <stop offset="1" stopColor={T.base} />
          </linearGradient>
          <linearGradient id={`${uid}-m`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={T.mid} />
            <stop offset="1" stopColor="#FFFFFF" />
          </linearGradient>
          <radialGradient id={`${uid}-h`}>
            <stop offset="0" stopColor={T.base} />
            <stop offset="1" stopColor={T.base} stopOpacity="0" />
          </radialGradient>
        </defs>

        {T.halo > 0 && <circle className="sf-halo" cx="32" cy="40" r="30" fill={`url(#${uid}-h)`} />}

        <g className="sf-b">
          {live ? (
            <>
              <g className="sf-l" style={layer(0.9, 0, 1, 1)}>
                <path d={PATHS.outer} fill={`url(#${uid}-o)`} />
              </g>
              {T.midOn && (
                <g className="sf-l" style={layer(1.3, 0.4, 1.2, 1.1)}>
                  <path d={PATHS.mid} fill={`url(#${uid}-m)`} />
                </g>
              )}
              <g className="sf-l sf-core" style={{ ...layer(1.7, 0.9, 1.3, 0.7), opacity: T.coreOp }}>
                <path d={PATHS.core} fill={T.core} />
              </g>
            </>
          ) : (
            <g>
              <path d={PATHS.outer} fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="2.5" strokeLinejoin="round" />
              {!small && <path d="M33 2C29 -4 36 -8 32 -14" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />}
              <circle cx="32" cy="52" r="3" fill="#9CA3AF" />
            </g>
          )}
        </g>

        {!small &&
          SPARKS.slice(0, T.sparks).map((s, i) => {
            const d = s.d / T.speed;
            return (
              <circle
                key={i}
                className="sf-spark"
                cx={32 + s.x}
                cy="46"
                r={i % 3 === 0 ? 1.8 : 1.3}
                fill={i % 2 ? T.mid : T.core}
                style={{ "--sf-d": `${d.toFixed(2)}s`, "--sf-dl": `${(-s.f * d).toFixed(2)}s`, "--sf-x": `${s.dx}px` } as Vars}
              />
            );
          })}

        {!small &&
          burst > 0 &&
          SHOTS.map((s, i) => (
            <circle
              key={i}
              className="sf-shot"
              cx="32"
              cy="38"
              r="1.8"
              fill={i % 2 ? T.mid : T.core}
              style={{ "--sf-x": `${s.dx}px`, "--sf-y": `${s.dy}px` } as Vars}
            />
          ))}
      </svg>
    </>
  );
}

export default StreakFlame;

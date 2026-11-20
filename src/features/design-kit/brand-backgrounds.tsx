"use client";

import * as React from "react";
import { BrandLogo } from "@/features/auth/components/auth-shell";
import { cn } from "@/lib/utils";

/**
 * Options for the brand panel behind the booking and sign-in pages, each built
 * from RMIT's pixel (RMIT_RedPixel.svg, unaltered in shape) on RMIT navy, for
 * picking one. Drawn at the panel's real size with its real words, so they
 * compare as they would be seen. Nothing here is wired into the app yet.
 */

/** RMIT's pixel, as in RmitPixel: viewBox 0 0 52.14 50.19. */
const PIXEL = "M26.21,0h-6.68v5.43h-11.15v11.34H0v16.65h8.37v11.34h11.13v5.43h5.91c13.78,0,25.93-11.13,25.93-25.02S40.03,0,26.21,0";
const PIXEL_W = 52.14;
const PIXEL_H = 50.19;
const RED = "#e61e2a";

function Pixel({ size, x, y, fill = RED, opacity = 1, rotate = 0, stroke }: { size: number; x: number | string; y: number | string; fill?: string; opacity?: number; rotate?: number; stroke?: string }) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${PIXEL_W} ${PIXEL_H}`}
      className="pointer-events-none absolute"
      style={{ width: size, height: (size * PIXEL_H) / PIXEL_W, left: x, top: y, opacity, transform: rotate ? `rotate(${rotate}deg)` : undefined }}
    >
      <path d={PIXEL} fill={stroke ? "none" : fill} stroke={stroke} strokeWidth={stroke ? 1.25 : undefined} vectorEffect={stroke ? "non-scaling-stroke" : undefined} />
    </svg>
  );
}

/** A small deterministic random, so a scatter draws the same every time. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface Option {
  id: string;
  name: string;
  note: string;
  ground: React.ReactNode;
}

const OPTIONS: Option[] = [
  {
    id: "current",
    name: "A · Before",
    note: "What B replaced: glows and a faint grid.",
    ground: (
      <>
        <div className="absolute -bottom-40 -left-24 size-[560px] rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -top-32 -right-24 size-[420px] rounded-full bg-[#4b52d6]/25 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]" />
      </>
    ),
  },
  {
    id: "watermark",
    name: "B · Watermark (live)",
    note: "One large pixel bleeding off the corner, navy on navy, a red glow behind it.",
    ground: (
      <>
        <div className="absolute -right-32 -bottom-40 size-[520px] rounded-full bg-primary/25 blur-3xl" />
        <Pixel size={620} x={150} y={330} fill="#ffffff" opacity={0.05} />
      </>
    ),
  },
  {
    id: "tile",
    name: "C · Pixel tile",
    note: "A quiet repeat of small pixels, fading out towards the words.",
    ground: (
      <>
        <svg aria-hidden className="absolute inset-0 size-full [mask-image:radial-gradient(ellipse_at_bottom_left,black_10%,transparent_70%)]">
          <defs>
            <pattern id="bg-tile" width="44" height="44" patternUnits="userSpaceOnUse">
              <path d={PIXEL} fill="#ffffff" fillOpacity="0.07" transform="translate(12 12) scale(0.38)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg-tile)" />
        </svg>
        <div className="absolute -bottom-40 -left-24 size-[460px] rounded-full bg-primary/25 blur-3xl" />
      </>
    ),
  },
  {
    id: "scatter",
    name: "D · Scatter",
    note: "A handful of pixels at different sizes, one in red.",
    ground: (() => {
      const rand = seeded(11);
      const dots = Array.from({ length: 9 }, () => ({ size: 18 + Math.round(rand() * 70), x: Math.round(rand() * 380), y: Math.round(rand() * 640), opacity: 0.04 + rand() * 0.07 }));
      return (
        <>
          <div className="absolute -top-32 -right-24 size-[420px] rounded-full bg-[#4b52d6]/25 blur-3xl" />
          {dots.map((d, i) => (
            <Pixel key={i} size={d.size} x={d.x} y={d.y} fill="#ffffff" opacity={d.opacity} />
          ))}
          <Pixel size={36} x={330} y={120} opacity={0.9} />
        </>
      );
    })(),
  },
  {
    id: "dissolve",
    name: "E · Dissolve",
    note: "Squares on the pixel's own grid, gathering into red at the foot of the panel.",
    ground: (() => {
      const rand = seeded(5);
      const cell = 22;
      const cells: Array<{ x: number; y: number; red: boolean; opacity: number }> = [];
      for (let row = 0; row < 32; row++) {
        for (let col = 0; col < 24; col++) {
          const depth = row / 31; // 0 at the top, 1 at the foot
          // Clear of the words: below the lead, and not under the small print at the foot.
          if (row < 20 || (row >= 26 && col < 12) || rand() > depth * depth * depth * 0.8) continue;
          cells.push({ x: col * cell, y: row * cell, red: rand() < depth * 0.35, opacity: 0.05 + depth * 0.18 });
        }
      }
      return (
        <svg aria-hidden className="absolute inset-0 size-full">
          {cells.map((c, i) => (
            <rect key={i} x={c.x + 1} y={c.y + 1} width={cell - 2} height={cell - 2} fill={c.red ? RED : "#ffffff"} fillOpacity={c.red ? c.opacity * 1.8 : c.opacity * 0.5} />
          ))}
        </svg>
      );
    })(),
  },
  {
    id: "contours",
    name: "F · Contours",
    note: "The pixel's outline, repeated outwards like a map's contour lines.",
    ground: (
      <>
        <div className="absolute -bottom-40 -left-24 size-[460px] rounded-full bg-primary/20 blur-3xl" />
        {[120, 220, 320, 420, 520, 620, 720].map((size, i) => (
          <Pixel key={size} size={size} x={-size * 0.35} y={560 - size * 0.48} stroke={`rgba(255,255,255,${0.12 - i * 0.012})`} />
        ))}
      </>
    ),
  },
  {
    id: "steps",
    name: "G · Steps",
    note: "Only the pixel's stepped edge, repeated as a band across the panel.",
    ground: (
      <>
        <svg aria-hidden className="absolute inset-0 size-full [mask-image:linear-gradient(to_top,black,transparent_75%)]">
          <defs>
            <pattern id="bg-steps" width="104" height="100" patternUnits="userSpaceOnUse">
              {/* The left half of the pixel: its stepped edge, nothing of the curve. */}
              <path d="M26.21,0h-6.68v5.43h-11.15v11.34H0v16.65h8.37v11.34h11.13v5.43h6.71" fill="none" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1" transform="scale(2)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#bg-steps)" />
        </svg>
        <div className="absolute -top-32 -right-24 size-[420px] rounded-full bg-[#4b52d6]/25 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 size-[460px] rounded-full bg-primary/25 blur-3xl" />
      </>
    ),
  },
  {
    id: "split",
    name: "H · Red pixel",
    note: "Flat navy, one big red pixel cropped at the foot. The boldest.",
    ground: (
      <>
        <Pixel size={420} x={-120} y={430} />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-navy/70 to-transparent" />
      </>
    ),
  },
];

/** A's two glows. */
function Glows({ red = 0.3, blue = 0.25 }: { red?: number; blue?: number }) {
  return (
    <>
      <div className="absolute -bottom-40 -left-24 size-[560px] rounded-full blur-3xl" style={{ background: `rgba(230,30,42,${red})` }} />
      <div className="absolute -top-32 -right-24 size-[420px] rounded-full blur-3xl" style={{ background: `rgba(75,82,214,${blue})` }} />
    </>
  );
}

/** A's grid, faded at the edges. */
function Grid({ opacity = 0.045, mask = "radial-gradient(ellipse at center, black 35%, transparent 80%)" }: { opacity?: number; mask?: string }) {
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,${opacity}) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,${opacity}) 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}

/** B's pixel, where B puts it, as SVG over the whole panel; `children` are drawn with the pixel as their clip. */
const PIXEL_AT = `translate(150 330) scale(${620 / PIXEL_W})`;
function PixelSvg({ id, children }: { id: string; children: (clip: string) => React.ReactNode }) {
  return (
    <svg aria-hidden className="absolute top-0 left-0" width={440} height={640} viewBox="0 0 440 640">
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={PIXEL} transform={PIXEL_AT} />
        </clipPath>
        <pattern id={`${id}-grid`} width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#ffffff" strokeWidth="1" />
        </pattern>
        <radialGradient id={`${id}-glow`} cx="0.35" cy="0.85" r="0.8">
          <stop offset="0" stopColor={RED} stopOpacity="0.55" />
          <stop offset="0.6" stopColor="#4b52d6" stopOpacity="0.25" />
          <stop offset="1" stopColor="#4b52d6" stopOpacity="0" />
        </radialGradient>
      </defs>
      {children(`url(#${id}-clip)`)}
    </svg>
  );
}

const COMBOS: Option[] = [
  {
    id: "ab-both",
    name: "AB1 · Both",
    note: "A as it was, with B's pixel laid over it.",
    ground: (
      <>
        <Glows />
        <Grid />
        <Pixel size={620} x={150} y={330} fill="#ffffff" opacity={0.05} />
      </>
    ),
  },
  {
    id: "ab-grid-in",
    name: "AB2 · Grid in the pixel",
    note: "A's glows; the grid only inside the pixel, so the pixel is drawn by the grid.",
    ground: (
      <>
        <Glows />
        <PixelSvg id="ab2">{(clip) => <rect width="440" height="640" fill="url(#ab2-grid)" opacity="0.2" clipPath={clip} />}</PixelSvg>
      </>
    ),
  },
  {
    id: "ab-glow-in",
    name: "AB3 · Glow in the pixel",
    note: "Navy panel with A's faint grid; A's red and blue glow lives inside the pixel.",
    ground: (
      <>
        <Grid />
        <PixelSvg id="ab3">{(clip) => <rect width="440" height="640" fill="url(#ab3-glow)" clipPath={clip} />}</PixelSvg>
      </>
    ),
  },
  {
    id: "ab-outline",
    name: "AB4 · Outline over A",
    note: "A untouched, with the pixel traced in a fine line.",
    ground: (
      <>
        <Glows />
        <Grid />
        <Pixel size={620} x={150} y={330} stroke="rgba(255,255,255,0.14)" />
      </>
    ),
  },
  {
    id: "ab-cutout",
    name: "AB5 · Grid around the pixel",
    note: "A's grid everywhere but the pixel, which reads as a quiet solid shape.",
    ground: (
      <>
        <Glows />
        <PixelSvg id="ab5">
          {(clip) => (
            <>
              <mask id="ab5-out">
                <rect width="440" height="640" fill="#ffffff" />
                <path d={PIXEL} transform={PIXEL_AT} fill="#000000" />
              </mask>
              <rect width="440" height="640" fill="url(#ab5-grid)" opacity="0.06" mask="url(#ab5-out)" />
              <rect width="440" height="640" fill="#ffffff" opacity="0.035" clipPath={clip} />
            </>
          )}
        </PixelSvg>
      </>
    ),
  },
  {
    id: "ab-soft",
    name: "AB6 · Soft",
    note: "A's glows, the grid only at the top, the pixel fainter at the foot: each in its own place.",
    ground: (
      <>
        <Glows red={0.26} blue={0.25} />
        <Grid mask="linear-gradient(to bottom, black, transparent 55%)" />
        <Pixel size={620} x={150} y={330} fill="#ffffff" opacity={0.035} />
      </>
    ),
  },
];

export function BrandBackgrounds() {
  return (
    <main className="min-h-screen bg-canvas px-6 py-10 text-foreground sm:px-10">
      <header className="mx-auto mb-8 max-w-7xl">
        <h1 className="text-xl font-semibold tracking-tight">Brand panel backgrounds</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Options for the panel beside the booking and sign-in pages, each built from RMIT&apos;s pixel on RMIT navy. B is live; A is what it replaced.</p>
      </header>
      <div className="mx-auto grid max-w-7xl gap-8 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
        {OPTIONS.map((option) => (
          <figure key={option.id} className="space-y-2" data-testid={`bg-option-${option.id}`}>
            <Panel ground={option.ground} />
            <figcaption>
              <p className="text-[13px] font-semibold">{option.name}</p>
              <p className="text-2xs text-muted-foreground">{option.note}</p>
            </figcaption>
          </figure>
        ))}
      </div>

      <section className="mx-auto mt-14 max-w-7xl" data-testid="bg-combos">
        <h2 className="text-base font-semibold tracking-tight">A + B</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">A&apos;s glows and grid with B&apos;s pixel, put together six ways.</p>
        <div className="mt-6 grid gap-8 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
          {COMBOS.map((option) => (
            <figure key={option.id} className="space-y-2" data-testid={`bg-option-${option.id}`}>
              <Panel ground={option.ground} />
              <figcaption>
                <p className="text-[13px] font-semibold">{option.name}</p>
                <p className="text-2xs text-muted-foreground">{option.note}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-7xl" data-testid="bg-pixel-sizes">
        <h2 className="text-base font-semibold tracking-tight">B · pixel size</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          The live panel on a {TALL.width}×{TALL.height} screen (the panel is {TALL.width}px wide), drawn at half size. The pixel is a share of the screen&apos;s height, never under {PIXEL_FLOOR}px.
        </p>
        <div className="mt-6 flex flex-wrap gap-6">
          {PIXEL_SIZES.map((size) => (
            <figure key={size.vh} className="space-y-2">
              <div className="overflow-hidden rounded-2xl" style={{ width: PANEL_W / 2, height: TALL.height / 2 }}>
                <div style={{ width: PANEL_W, height: TALL.height, transform: "scale(0.5)", transformOrigin: "top left" }}>
                  <WatermarkPanel pixel={Math.max(PIXEL_FLOOR, (size.vh / 100) * TALL.height)} />
                </div>
              </div>
              <figcaption>
                <p className="text-[13px] font-semibold">
                  {size.vh}vh{size.note && <span className="ml-1.5 font-normal text-muted-foreground">{size.note}</span>}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}

/** A tall desktop screen, the kind the pixel's size matters on. */
const TALL = { width: 2000, height: 1175 };
/** The panel's width on a wide screen (xl:w-[520px] in AuthShell). */
const PANEL_W = 520;
const PIXEL_FLOOR = 560;
const PIXEL_SIZES: Array<{ vh: number; note?: string }> = [{ vh: 60 }, { vh: 70 }, { vh: 82, note: "now" }, { vh: 90 }, { vh: 97, note: "before" }];

/** Option B as AuthShell draws it, for a pixel this many px wide: the same offsets and glow, in proportion. */
function WatermarkPanel({ pixel }: { pixel: number }) {
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-navy p-10 text-white">
      <div className="pointer-events-none absolute rounded-full bg-primary/25 blur-3xl" style={{ right: pixel * -0.21, bottom: pixel * -0.26, width: pixel * 0.84, height: pixel * 0.84 }} />
      <svg aria-hidden viewBox={`0 0 ${PIXEL_W} ${PIXEL_H}`} className="pointer-events-none absolute opacity-[0.05]" style={{ right: pixel * -0.532, bottom: pixel * -0.463, width: pixel, height: (pixel * PIXEL_H) / PIXEL_W }}>
        <path fill="#ffffff" d={PIXEL} />
      </svg>
      <div aria-hidden className="relative">
        <BrandLogo tone="onNavy" className="h-8" />
      </div>
      <div aria-hidden className="relative space-y-6">
        <h2 className="max-w-md text-[34px] leading-[1.15] font-semibold tracking-tight text-balance">Book a task with the creative team.</h2>
        <p className="max-w-sm text-[15px] leading-relaxed text-white/70">Tell Vietnam marketing what you need and by when. You get a ticket straight away, and can follow the work as it moves.</p>
      </div>
      <div aria-hidden className="relative text-xs text-white/50">
        Central Creative Team · Streamline
        <span className="mt-0.5 block text-[10px] text-white/35">Published 20 Nov 2026, 14:25</span>
      </div>
    </div>
  );
}

/** The brand panel as the booking page draws it, at its real width, with a ground behind its words. */
function Panel({ ground }: { ground: React.ReactNode }) {
  return (
    <div className="relative flex h-[640px] w-full max-w-[440px] flex-col justify-between overflow-hidden rounded-2xl bg-navy p-10 text-white shadow-[0_24px_60px_-24px_rgba(0,0,84,0.45)]">
      <div className="pointer-events-none absolute inset-0">{ground}</div>
      <div aria-hidden className="relative">
        <BrandLogo tone="onNavy" className="h-8" />
      </div>
      <div aria-hidden className={cn("relative space-y-5")}>
        <h2 className="text-[30px] leading-[1.15] font-semibold tracking-tight text-balance">Book a task with the creative team.</h2>
        <p className="max-w-sm text-[14px] leading-relaxed text-white/70">Tell Vietnam marketing what you need and by when. You get a ticket straight away, and can follow the work as it moves.</p>
      </div>
      <div aria-hidden className="relative text-xs text-white/50">
        Central Creative Team · Streamline
        <span className="mt-0.5 block text-[10px] text-white/35">Published 20 Nov 2026, 14:25</span>
      </div>
    </div>
  );
}

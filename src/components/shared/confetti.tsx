"use client";

import * as React from "react";

/**
 * A short confetti burst for finishing a task.
 *
 * One canvas lives in the shell and listens for `celebrate()`, so anything that
 * completes work can set it off without threading props around. The whole thing
 * is over in well under three seconds, draws nothing when the viewer asks for
 * reduced motion, and stops its animation frame the moment the last piece
 * leaves the screen.
 */

const DURATION = 2200;
const FADE_FROM = 1500;
const GRAVITY = 1500;
const DRAG = 0.86;

const COLORS = ["#e11d48", "#f97316", "#facc15", "#16a34a", "#0ea5e9", "#4f46e5", "#9333ea", "#ec4899"];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Half-width and half-height of the paper rectangle. */
  w: number;
  h: number;
  color: string;
  /** Rotation in the plane of the screen, and how fast it turns. */
  rot: number;
  spin: number;
  /** Flutter: the piece turns edge-on as it tumbles, so it flashes thin and wide. */
  tilt: number;
  flutter: number;
  ribbon: boolean;
}

type Listener = () => void;

const listeners = new Set<Listener>();

/** Fire the burst. No-op until the canvas is mounted. */
export function celebrate() {
  for (const listener of listeners) listener();
}

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/** A cannon: `count` pieces from (x, y) fired along `angle` (radians, up is -π/2). */
function cannon(pieces: Piece[], x: number, y: number, angle: number, spread: number, speed: number, count: number) {
  for (let i = 0; i < count; i++) {
    const theta = angle + random(-spread, spread);
    const velocity = speed * random(0.55, 1.15);
    const ribbon = Math.random() < 0.25;
    pieces.push({
      x,
      y,
      vx: Math.cos(theta) * velocity,
      vy: Math.sin(theta) * velocity,
      w: ribbon ? random(2, 3.5) : random(4, 7),
      h: ribbon ? random(9, 16) : random(4, 8),
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      rot: random(0, Math.PI * 2),
      spin: random(-9, 9),
      tilt: random(0, Math.PI * 2),
      flutter: random(6, 13),
      ribbon,
    });
  }
}

export function ConfettiCanvas() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let pieces: Piece[] = [];
    let frame = 0;
    let startedAt = 0;
    let lastAt = 0;

    const clear = () => context.clearRect(0, 0, canvas.width, canvas.height);

    const draw = (now: number) => {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const elapsed = now - startedAt;
      const dt = Math.min((now - lastAt) / 1000, 1 / 30);
      lastAt = now;

      clear();
      context.globalAlpha = elapsed < FADE_FROM ? 1 : Math.max(0, 1 - (elapsed - FADE_FROM) / (DURATION - FADE_FROM));

      for (const piece of pieces) {
        piece.vy += GRAVITY * dt;
        piece.vx -= piece.vx * DRAG * dt;
        piece.vy -= piece.vy * DRAG * dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.rot += piece.spin * dt;
        piece.tilt += piece.flutter * dt;

        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.rot);
        // cos(tilt) turns the piece edge-on and back, which reads as tumbling paper.
        context.scale(1, Math.cos(piece.tilt));
        context.fillStyle = piece.color;
        if (piece.ribbon) context.fillRect(-piece.w, -piece.h, piece.w * 2, piece.h * 2);
        else {
          context.beginPath();
          context.roundRect(-piece.w, -piece.h, piece.w * 2, piece.h * 2, 1.5);
          context.fill();
        }
        context.restore();
      }
      context.globalAlpha = 1;

      pieces = pieces.filter((p) => p.y < height + 40 && p.x > -60 && p.x < width + 60);

      if (elapsed < DURATION && pieces.length > 0) {
        frame = requestAnimationFrame(draw);
      } else {
        frame = 0;
        pieces = [];
        clear();
      }
    };

    const start = () => {
      if (reduced.matches) return;
      const ratio = window.devicePixelRatio || 1;
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      // Two cannons from the bottom corners, plus a shower over the middle: the
      // corners give it the arc, the shower fills the screen for a beat.
      pieces = [];
      cannon(pieces, 0, height, -Math.PI / 3.4, 0.34, height * 1.5, 55);
      cannon(pieces, width, height, -Math.PI + Math.PI / 3.4, 0.34, height * 1.5, 55);
      cannon(pieces, width / 2, -20, Math.PI / 2, 0.9, height * 0.35, 45);

      startedAt = performance.now();
      lastAt = startedAt;
      if (!frame) frame = requestAnimationFrame(draw);
    };

    listeners.add(start);
    return () => {
      listeners.delete(start);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[200]" data-testid="confetti" />;
}

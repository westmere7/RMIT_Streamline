"use client";

import { Loader2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** The frame on screen, in CSS pixels. */
const FRAME = 260;
/** The square handed on to the upload, which shrinks it to the avatar's own size. */
const OUTPUT = 512;
const MAX_ZOOM = 4;

export interface CropState {
  /** Quarter turns clockwise, 0–3. */
  turns: number;
  /** 1 fills the frame edge to edge; more is closer. */
  zoom: number;
  /** Where the picture's centre sits from the frame's, in frame pixels. */
  x: number;
  y: number;
}

export const INITIAL_CROP: CropState = { turns: 0, zoom: 1, x: 0, y: 0 };

/** The picture's width and height once turned. */
function turned(width: number, height: number, turns: number): { width: number; height: number } {
  return turns % 2 === 0 ? { width, height } : { width: height, height: width };
}

/** How much the picture is scaled to fill a frame `frame` wide at this zoom. */
export function cropScale(width: number, height: number, state: CropState, frame = FRAME): number {
  const t = turned(width, height, state.turns);
  return (frame / Math.min(t.width, t.height)) * state.zoom;
}

/** The same state, moved back so the picture still covers the whole frame. */
export function clampCrop(width: number, height: number, state: CropState, frame = FRAME): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, state.zoom));
  const t = turned(width, height, state.turns);
  const scale = cropScale(width, height, { ...state, zoom }, frame);
  const roomX = Math.max(0, (t.width * scale - frame) / 2);
  const roomY = Math.max(0, (t.height * scale - frame) / 2);
  return { turns: ((state.turns % 4) + 4) % 4, zoom, x: Math.min(roomX, Math.max(-roomX, state.x)), y: Math.min(roomY, Math.max(-roomY, state.y)) };
}

/** Draws what the frame shows onto a square canvas `size` wide. */
export function drawCrop(context: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number, state: CropState, size: number, frame = FRAME): void {
  const k = size / frame;
  context.save();
  context.imageSmoothingQuality = "high";
  context.translate(size / 2 + state.x * k, size / 2 + state.y * k);
  context.rotate((state.turns * Math.PI) / 2);
  const scale = cropScale(width, height, state, frame) * k;
  context.scale(scale, scale);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

/**
 * Framing a new profile photo before it is saved: drag to place it, zoom in,
 * turn it a quarter at a time. The circle is what the avatar shows; what is
 * handed back is the square around it, which the upload then shrinks.
 */
export function AvatarCropDialog({ file, onCancel, onConfirm }: { file: File | null; onCancel: () => void; onConfirm: (cropped: File) => void | Promise<void> }) {
  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent size="sm" data-testid="avatar-crop-dialog">
        <DialogHeader>
          <DialogTitle>Adjust photo</DialogTitle>
          <DialogDescription>Drag to place it.</DialogDescription>
        </DialogHeader>
        {file && <Cropper key={`${file.name}-${file.size}-${file.lastModified}`} file={file} onCancel={onCancel} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  );
}

function Cropper({ file, onCancel, onConfirm }: { file: File; onCancel: () => void; onConfirm: (cropped: File) => void | Promise<void> }) {
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [state, setState] = React.useState<CropState>(INITIAL_CROP);
  const [busy, setBusy] = React.useState(false);
  const drag = React.useRef<{ id: number; startX: number; startY: number; from: CropState } | null>(null);

  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setImage(img);
    img.onerror = () => setFailed(true);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const width = image?.naturalWidth ?? 1;
  const height = image?.naturalHeight ?? 1;
  const update = (next: Partial<CropState> | ((current: CropState) => Partial<CropState>)) =>
    setState((current) => clampCrop(width, height, { ...current, ...(typeof next === "function" ? next(current) : next) }));
  const scale = cropScale(width, height, state);

  const confirm = async () => {
    if (!image) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const context = canvas.getContext("2d");
    if (!context) return;
    drawCrop(context, image, width, height, state, OUTPUT);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    setBusy(true);
    try {
      await onConfirm(new File([blob], "avatar.png", { type: "image/png" }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-3">
        <div
          className={cn("relative touch-none overflow-hidden rounded-lg bg-muted select-none", image ? "cursor-grab active:cursor-grabbing" : "")}
          style={{ width: FRAME, height: FRAME }}
          onPointerDown={(event) => {
            if (!image) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, from: state };
          }}
          onPointerMove={(event) => {
            const d = drag.current;
            if (!d || d.id !== event.pointerId) return;
            update({ x: d.from.x + event.clientX - d.startX, y: d.from.y + event.clientY - d.startY });
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(event) => image && update((current) => ({ zoom: current.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1) }))}
          tabIndex={0}
          role="application"
          aria-label="Photo position. Arrow keys move it, plus and minus zoom."
          onKeyDown={(event) => {
            const step = event.shiftKey ? 20 : 5;
            const moves: Record<string, Partial<CropState>> = {
              ArrowLeft: { x: state.x - step },
              ArrowRight: { x: state.x + step },
              ArrowUp: { y: state.y - step },
              ArrowDown: { y: state.y + step },
              "+": { zoom: state.zoom * 1.1 },
              "=": { zoom: state.zoom * 1.1 },
              "-": { zoom: state.zoom / 1.1 },
            };
            const move = moves[event.key];
            if (!move) return;
            event.preventDefault();
            update(move);
          }}
          data-testid="avatar-crop-frame"
        >
          {image && (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob being framed, not a page image
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
              style={{ width, height, transform: `translate(-50%, -50%) translate(${state.x}px, ${state.y}px) rotate(${state.turns * 90}deg) scale(${scale})` }}
            />
          )}
          {/* The circle the avatar shows; outside it is dimmed. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(0_0_0/0.5)] ring-2 ring-white/80" />
          {!image && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] text-muted-foreground">
              {failed ? "That image could not be read." : <Loader2 className="size-5 animate-spin" />}
            </div>
          )}
        </div>

        <div className="flex w-full items-center gap-2" style={{ maxWidth: FRAME }}>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom out" disabled={!image || state.zoom <= 1} onClick={() => update({ zoom: state.zoom / 1.2 })}>
            <ZoomOut />
          </Button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={state.zoom}
            onChange={(event) => update({ zoom: Number(event.target.value) })}
            disabled={!image}
            aria-label="Zoom"
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary"
            data-testid="avatar-crop-zoom"
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom in" disabled={!image || state.zoom >= MAX_ZOOM} onClick={() => update({ zoom: state.zoom * 1.2 })}>
            <ZoomIn />
          </Button>
          <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Rotate left" disabled={!image} onClick={() => update((current) => ({ turns: current.turns + 3 }))} data-testid="avatar-crop-rotate-left">
            <RotateCcw />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Rotate right" disabled={!image} onClick={() => update((current) => ({ turns: current.turns + 1 }))} data-testid="avatar-crop-rotate-right">
            <RotateCw />
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void confirm()} disabled={!image || busy} data-testid="avatar-crop-confirm">
          {busy && <Loader2 className="animate-spin" />} Use photo
        </Button>
      </DialogFooter>
    </>
  );
}

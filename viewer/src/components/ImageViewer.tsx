import { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from "react";
import type { Transform, Polygon, Point } from "../types";
import { SvgOverlay } from "./SvgOverlay";

interface Props {
  src: string;
  markupMode: boolean;
  polygons: Polygon[];
  onAddPolygon: (p: Polygon) => void;
  strokeColor: string;
  strokeWidth: number;
  onScaleChange?: (scale: number) => void;
}

export interface ImageViewerHandle {
  zoomBy: (factor: number) => void;
  fitToView: () => void;
}

export const ImageViewer = forwardRef<ImageViewerHandle, Props>(function ImageViewer({
  src,
  markupMode,
  polygons,
  onAddPolygon,
  strokeColor,
  strokeWidth,
  onScaleChange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const onScaleChangeRef = useRef(onScaleChange);
  useEffect(() => { onScaleChangeRef.current = onScaleChange; });

  // ---- draw canvas ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imgRef.current;
    if (!canvas || !ctx || !img || !img.complete) return;

    const { x, y, scale } = transformRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
    ctx.restore();
  }, []);

  const scheduleDraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // ---- fit image ----
  const fitImage = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (!iw || !ih) return;
    const scale = Math.min(cw / iw, ch / ih, 1);
    const x = (cw - iw * scale) / 2;
    const y = (ch - ih * scale) / 2;
    transformRef.current = { x, y, scale };
    setTransform({ x, y, scale });
    onScaleChangeRef.current?.(scale);
    scheduleDraw();
  }, [scheduleDraw]);

  // ---- load image ----
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      fitImage();
    };
    img.src = src;
  }, [src, fitImage]);

  // ---- resize canvas ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      setContainerSize({ w: container.clientWidth, h: container.clientHeight });
      fitImage();
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [fitImage]);

  // ---- sync transform state for SVG ----
  const commitTransform = useCallback(() => {
    setTransform({ ...transformRef.current });
    onScaleChangeRef.current?.(transformRef.current.scale);
  }, []);

  // ---- wheel zoom ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (markupMode) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const t = transformRef.current;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newScale = Math.min(Math.max(t.scale * factor, 0.05), 50);
      const ratio = newScale / t.scale;

      transformRef.current = {
        x: mx - (mx - t.x) * ratio,
        y: my - (my - t.y) * ratio,
        scale: newScale,
      };
      commitTransform();
      scheduleDraw();
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [markupMode, scheduleDraw, commitTransform]);

  // ---- pan ----
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (markupMode) return;
      if (e.button !== 0) return;
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    },
    [markupMode]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning.current || markupMode) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      commitTransform();
      scheduleDraw();
    },
    [markupMode, scheduleDraw, commitTransform]
  );

  const onMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // ---- programmatic zoom (from buttons) ----
  const zoomBy = useCallback(
    (factor: number) => {
      const container = containerRef.current;
      if (!container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const cx = cw / 2;
      const cy = ch / 2;

      const t = transformRef.current;
      const newScale = Math.min(Math.max(t.scale * factor, 0.05), 50);
      const ratio = newScale / t.scale;

      transformRef.current = {
        x: cx - (cx - t.x) * ratio,
        y: cy - (cy - t.y) * ratio,
        scale: newScale,
      };
      commitTransform();
      scheduleDraw();
    },
    [scheduleDraw, commitTransform]
  );

  useImperativeHandle(ref, () => ({ zoomBy, fitToView: fitImage }), [zoomBy, fitImage]);

  // ---- convert screen point to image coords ----
  const screenToImage = useCallback((sx: number, sy: number): Point => {
    const t = transformRef.current;
    return {
      x: (sx - t.x) / t.scale,
      y: (sy - t.y) / t.scale,
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative", cursor: markupMode ? "crosshair" : "grab" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
      <SvgOverlay
        polygons={polygons}
        transform={transform}
        containerWidth={containerSize.w}
        containerHeight={containerSize.h}
        markupMode={markupMode}
        onAddPolygon={onAddPolygon}
        screenToImage={screenToImage}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
      />
    </div>
  );
});

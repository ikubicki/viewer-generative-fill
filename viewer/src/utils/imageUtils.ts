import type { Point, Polygon, BBox } from "../types";

const PADDING = 20;

export function getPolygonBBox(
  points: Point[],
  imgWidth: number,
  imgHeight: number,
  padding = PADDING
): BBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const x = Math.max(0, Math.floor(minX - padding));
  const y = Math.max(0, Math.floor(minY - padding));
  const x2 = Math.min(imgWidth, Math.ceil(maxX + padding));
  const y2 = Math.min(imgHeight, Math.ceil(maxY + padding));
  return { x, y, width: x2 - x, height: y2 - y };
}

export function cropImage(
  img: HTMLImageElement,
  bbox: BBox
): string {
  const canvas = document.createElement("canvas");
  canvas.width = bbox.width;
  canvas.height = bbox.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    img,
    bbox.x,
    bbox.y,
    bbox.width,
    bbox.height,
    0,
    0,
    bbox.width,
    bbox.height
  );
  return canvas.toDataURL("image/png");
}

export function createMask(
  polygon: Polygon,
  bbox: BBox
): string {
  const canvas = document.createElement("canvas");
  canvas.width = bbox.width;
  canvas.height = bbox.height;
  const ctx = canvas.getContext("2d")!;

  // Black background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, bbox.width, bbox.height);

  // White polygon (area to inpaint)
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  const pts = polygon.points;
  if (pts.length > 0) {
    ctx.moveTo(pts[0].x - bbox.x, pts[0].y - bbox.y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x - bbox.x, pts[i].y - bbox.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  return canvas.toDataURL("image/png");
}

export function createCropWithOverlay(
  img: HTMLImageElement,
  polygon: Polygon,
  bbox: BBox
): string {
  const canvas = document.createElement("canvas");
  canvas.width = bbox.width;
  canvas.height = bbox.height;
  const ctx = canvas.getContext("2d")!;

  // Draw cropped image
  ctx.drawImage(
    img,
    bbox.x,
    bbox.y,
    bbox.width,
    bbox.height,
    0,
    0,
    bbox.width,
    bbox.height
  );

  // Draw polygon overlay
  ctx.strokeStyle = polygon.stroke;
  ctx.lineWidth = polygon.strokeWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  const pts = polygon.points;
  if (pts.length > 0) {
    ctx.moveTo(pts[0].x - bbox.x, pts[0].y - bbox.y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x - bbox.x, pts[i].y - bbox.y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  return canvas.toDataURL("image/png");
}

export async function compositeImages(
  originalUrl: string,
  resultDataUrl: string,
  bbox: BBox
): Promise<string> {
  const [origImg, resultImg] = await Promise.all([
    loadImage(originalUrl),
    loadImage(resultDataUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = origImg.naturalWidth;
  canvas.height = origImg.naturalHeight;
  const ctx = canvas.getContext("2d")!;

  // Draw original
  ctx.drawImage(origImg, 0, 0);

  // Draw result at bbox position
  ctx.drawImage(
    resultImg,
    0,
    0,
    resultImg.naturalWidth,
    resultImg.naturalHeight,
    bbox.x,
    bbox.y,
    bbox.width,
    bbox.height
  );

  return canvas.toDataURL("image/png");
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

import { useRef, useCallback } from "react";
import type { Polygon, Point, Transform } from "../types";

interface Props {
  polygons: Polygon[];
  transform: Transform;
  containerWidth: number;
  containerHeight: number;
  markupMode: boolean;
  onAddPolygon: (p: Polygon) => void;
  screenToImage: (sx: number, sy: number) => Point;
  strokeColor: string;
  strokeWidth: number;
}

function pointsToSvg(points: Point[]): string {
  if (points.length === 0) return "";
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

export function SvgOverlay({
  polygons,
  transform,
  containerWidth,
  containerHeight,
  markupMode,
  onAddPolygon,
  screenToImage,
  strokeColor,
  strokeWidth,
}: Props) {
  const drawingPoints = useRef<Point[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const activePolyRef = useRef<SVGPolygonElement>(null);
  const isDrawing = useRef(false);

  const getLocalCoords = useCallback(
    (e: React.MouseEvent): Point => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      return screenToImage(sx, sy);
    },
    [screenToImage]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!markupMode || e.button !== 0) return;
      e.stopPropagation();
      isDrawing.current = true;
      const pt = getLocalCoords(e);
      drawingPoints.current = [pt];
      if (activePolyRef.current) {
        activePolyRef.current.setAttribute("points", pointsToSvg([pt]));
      }
    },
    [markupMode, getLocalCoords]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing.current) return;
      e.stopPropagation();
      const pt = getLocalCoords(e);
      drawingPoints.current.push(pt);
      if (activePolyRef.current) {
        activePolyRef.current.setAttribute(
          "points",
          pointsToSvg(drawingPoints.current)
        );
      }
    },
    [getLocalCoords]
  );

  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing.current) return;
      e.stopPropagation();
      isDrawing.current = false;
      const pts = drawingPoints.current;
      if (pts.length > 2) {
        onAddPolygon({
          points: [...pts],
          stroke: strokeColor,
          strokeWidth,
        });
      }
      drawingPoints.current = [];
      if (activePolyRef.current) {
        activePolyRef.current.setAttribute("points", "");
      }
    },
    [onAddPolygon, strokeColor, strokeWidth]
  );

  const { x, y, scale } = transform;

  return (
    <svg
      ref={svgRef}
      className={`svg-overlay${markupMode ? " drawing" : ""}`}
      width={containerWidth}
      height={containerHeight}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <g transform={`translate(${x}, ${y}) scale(${scale})`}>
        {polygons.map((poly, i) => (
          <polygon
            key={i}
            points={pointsToSvg(poly.points)}
            fill="none"
            stroke={poly.stroke}
            strokeWidth={poly.strokeWidth / scale}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {/* active drawing polygon */}
        <polygon
          ref={activePolyRef}
          points=""
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth / scale}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.8}
        />
      </g>
    </svg>
  );
}

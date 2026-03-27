import { useState } from "react";
import { ImageViewer } from "./components/ImageViewer";
import { Toolbar } from "./components/Toolbar";
import { Thumbnails } from "./components/Thumbnails";
import type { Polygon } from "./types";
import "./App.css";

const IMAGE_URLS = [
  "http://127.0.0.1:5500/assets/1.jpeg",
  "http://127.0.0.1:5500/assets/2.jpeg",
  "http://127.0.0.1:5500/assets/3.jpeg",
  "http://127.0.0.1:5500/assets/4.jpeg",
];

export default function App() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [markupMode, setMarkupMode] = useState(false);
  const [polygons, setPolygons] = useState<Record<number, Polygon[]>>({});
  const [strokeColor, setStrokeColor] = useState("#ff3366");
  const [strokeWidth, setStrokeWidth] = useState(3);

  const currentPolygons = polygons[currentIndex] ?? [];

  const addPolygon = (polygon: Polygon) => {
    setPolygons((prev) => ({
      ...prev,
      [currentIndex]: [...(prev[currentIndex] ?? []), polygon],
    }));
  };

  const clearPolygons = () => {
    setPolygons((prev) => {
      const next = { ...prev };
      delete next[currentIndex];
      return next;
    });
  };

  const undoPolygon = () => {
    setPolygons((prev) => {
      const list = prev[currentIndex] ?? [];
      if (list.length === 0) return prev;
      return { ...prev, [currentIndex]: list.slice(0, -1) };
    });
  };

  return (
    <div className="app">
      <Toolbar
        markupMode={markupMode}
        onToggleMarkup={() => setMarkupMode((m) => !m)}
        strokeColor={strokeColor}
        onStrokeColorChange={setStrokeColor}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
        onClear={clearPolygons}
        onUndo={undoPolygon}
        canUndo={currentPolygons.length > 0}
      />
      <div className="viewer-area">
        <ImageViewer
          src={IMAGE_URLS[currentIndex]}
          markupMode={markupMode}
          polygons={currentPolygons}
          onAddPolygon={addPolygon}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
        />
      </div>
      <Thumbnails
        urls={IMAGE_URLS}
        currentIndex={currentIndex}
        onSelect={setCurrentIndex}
      />
    </div>
  );
}

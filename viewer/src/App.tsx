import { useState, useRef, useCallback } from "react";
import { ImageViewer } from "./components/ImageViewer";
import type { ImageViewerHandle } from "./components/ImageViewer";
import { Toolbar } from "./components/Toolbar";
import { Thumbnails } from "./components/Thumbnails";
import { GenerativeFillPanel } from "./components/GenerativeFillPanel";
import type { Polygon, FillSession } from "./types";
import { compositeImages } from "./utils/imageUtils";
import { generateFill } from "./services/comfyui";
import "./App.css";

const DEFAULT_IMAGE_URLS = [
  "/assets/1.jpeg",
  "/assets/2.jpeg",
  "/assets/3.jpeg",
  "/assets/4.jpeg",
];

export default function App() {
  const viewerRef = useRef<ImageViewerHandle>(null);
  const [imageUrls, setImageUrls] = useState(DEFAULT_IMAGE_URLS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [markupMode, setMarkupMode] = useState(false);
  const [polygons, setPolygons] = useState<Record<number, Polygon[]>>({});
  const [strokeColor, setStrokeColor] = useState("#ff3366");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [fillSession, setFillSession] = useState<FillSession | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);

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

  // ---- Generative Fill ----
  const openGenerativeFill = useCallback(() => {
    if (currentPolygons.length !== 1) return;
    const polygon = currentPolygons[0];
    const extracted = viewerRef.current?.extractRegion(polygon);
    if (!extracted) return;

    setFillError(null);
    setFillSession({
      crop: extracted.cropWithOverlay,
      mask: extracted.mask,
      bbox: extracted.bbox,
      polygon,
      isGenerating: false,
    });
  }, [currentPolygons]);

  const handleGenerate = useCallback(
    async (prompt: string, checkpoint: string) => {
      if (!fillSession) return;
      setFillError(null);
      setFillSession((s) => (s ? { ...s, isGenerating: true, result: undefined } : s));

      try {
        // Get the clean crop (without overlay) for the API
        const polygon = fillSession.polygon;
        const extracted = viewerRef.current?.extractRegion(polygon);
        if (!extracted) throw new Error("Could not extract region");

        const result = await generateFill(extracted.crop, extracted.mask, prompt, checkpoint);
        setFillSession((s) => (s ? { ...s, isGenerating: false, result } : s));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setFillError(msg);
        setFillSession((s) => (s ? { ...s, isGenerating: false } : s));
      }
    },
    [fillSession]
  );

  const handleAccept = useCallback(async () => {
    if (!fillSession?.result) return;

    try {
      const composited = await compositeImages(
        imageUrls[currentIndex],
        fillSession.result,
        fillSession.bbox
      );
      setImageUrls((prev) => {
        const next = [...prev];
        next[currentIndex] = composited;
        return next;
      });
      // Clear polygon and exit markup
      setPolygons((prev) => {
        const next = { ...prev };
        delete next[currentIndex];
        return next;
      });
      setMarkupMode(false);
      setFillSession(null);
      setFillError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFillError(msg);
    }
  }, [fillSession, imageUrls, currentIndex]);

  const handleCancelFill = useCallback(() => {
    setFillSession(null);
    setFillError(null);
  }, []);

  const showGenerativeFillButton = markupMode && currentPolygons.length === 1 && !fillSession;

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
        onZoomIn={() => viewerRef.current?.zoomBy(1.3)}
        onZoomOut={() => viewerRef.current?.zoomBy(1 / 1.3)}
        onFitToView={() => viewerRef.current?.fitToView()}
        zoomPercent={zoomPercent}
        showGenerativeFill={showGenerativeFillButton}
        onGenerativeFill={openGenerativeFill}
      />
      <div className="viewer-area">
        <ImageViewer
          ref={viewerRef}
          src={imageUrls[currentIndex]}
          markupMode={markupMode}
          polygons={currentPolygons}
          onAddPolygon={addPolygon}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          onScaleChange={(s) => setZoomPercent(Math.round(s * 100))}
        />
        {fillSession && (
          <GenerativeFillPanel
            session={fillSession}
            onGenerate={handleGenerate}
            onAccept={handleAccept}
            onRegenerate={handleGenerate}
            onCancel={handleCancelFill}
          />
        )}
        {fillError && (
          <div className="gf-error-toast" onClick={() => setFillError(null)}>
            ⚠ {fillError}
          </div>
        )}
      </div>
      <Thumbnails
        urls={imageUrls}
        currentIndex={currentIndex}
        onSelect={setCurrentIndex}
      />
    </div>
  );
}

# AI Viewer — Technical Specification

## 1. Overview

**AI Viewer** is an image viewer with markup (annotation) and AI-powered generative fill, built with React + TypeScript + Vite. It loads images from given URLs, allows navigating between them, zoom and pan on canvas, freehand SVG polygon drawing in markup mode, and inpainting selected regions via ComfyUI.

---

## 2. Tech Stack

| Layer          | Technology                   |
| -------------- | ---------------------------- |
| Framework      | React 19 + TypeScript 5.9    |
| Bundler        | Vite 8                       |
| Rendering      | HTML Canvas (image) + SVG (annotations) |
| Styling        | Vanilla CSS (dark theme)     |
| Image server   | Five Server (127.0.0.1:5500) |
| AI Backend     | ComfyUI (127.0.0.1:8188) — inpainting |

---

## 3. Architecture

```
viewer/src/
├── main.tsx                    # entry point, React mount
├── App.tsx                     # main component, application state
├── App.css                     # global application styles
├── index.css                   # CSS reset
├── types.ts                    # shared TS types
├── components/
│   ├── ImageViewer.tsx          # canvas with zoom/pan + mounts SvgOverlay
│   ├── SvgOverlay.tsx           # SVG layer for polygon drawing
│   ├── Toolbar.tsx              # toolbar (markup, color, width, undo/clear, zoom, gen.fill)
│   ├── Thumbnails.tsx           # thumbnail strip for image switching
│   └── GenerativeFillPanel.tsx  # side panel for generative fill (prompt, preview, model)
├── services/
│   └── comfyui.ts               # ComfyUI API integration (upload, workflow, polling)
└── utils/
    └── imageUtils.ts            # image utilities (crop, mask, composite)
```

---

## 4. Data Types (`types.ts`)

```typescript
interface Point {
  x: number;    // X coordinate in image space (native pixels)
  y: number;    // Y coordinate in image space (native pixels)
}

interface Polygon {
  points: Point[];      // list of polygon points
  stroke: string;       // stroke color (hex)
  strokeWidth: number;  // line thickness (px)
}

interface Transform {
  x: number;    // X offset (screen px)
  y: number;    // Y offset (screen px)
  scale: number; // scale factor
}

interface BBox {
  x: number;    // top-left X (image px)
  y: number;    // top-left Y (image px)
  w: number;    // width (px)
  h: number;    // height (px)
}

interface FillSession {
  crop: string;       // data URL of the cropped region (with polygon overlay)
  mask: string;       // data URL of black-and-white mask (white = selection)
  bbox: BBox;         // bounding box of the selected region
  polygon: Polygon;   // polygon used for selection
  result?: string;    // data URL of the generation result (optional, after completion)
  isGenerating: boolean; // whether generation is in progress
}
```

---

## 5. Components — Details

### 5.1 `App`

**Responsibility:** Manages global application state.

**State:**
- `imageUrls: string[]` — mutable list of image URLs (updated after generative fill accept)
- `currentIndex: number` — index of the currently selected image
- `markupMode: boolean` — whether markup mode is active
- `polygons: Record<number, Polygon[]>` — polygon map per image (key = index)
- `strokeColor: string` — current drawing color (default `#ff3366`)
- `strokeWidth: number` — current line thickness (default `3`)
- `zoomPercent: number` — current zoom level in percent (default `100`)
- `fillSession: FillSession | null` — active generative fill session (null = inactive)
- `fillError: string | null` — generative fill error message

**Refs:**
- `viewerRef: React.RefObject<ImageViewerHandle>` — ref to `ImageViewer`, used for programmatic zoom (`zoomBy`) and fit-to-view (`fitToView`)

**Polygon operations:**
- `addPolygon(polygon)` — adds a polygon to the current image
- `undoPolygon()` — removes the last polygon from the current image
- `clearPolygons()` — clears all polygons for the current image

**Image source:**
```typescript
const IMAGE_URLS = [
  "http://127.0.0.1:5500/assets/1.jpeg",
  "http://127.0.0.1:5500/assets/2.jpeg",
  "http://127.0.0.1:5500/assets/3.jpeg",
  "http://127.0.0.1:5500/assets/4.jpeg",
];
```

---

### 5.2 `ImageViewer`

**Responsibility:** Renders the image on canvas with zoom and pan support.

**Props:**
| Prop             | Type                       | Description                       |
| ---------------- | -------------------------- | --------------------------------- |
| `src`            | `string`                   | Image URL                         |
| `markupMode`     | `boolean`                  | Whether markup mode is active     |
| `polygons`       | `Polygon[]`                | Polygons to display               |
| `onAddPolygon`   | `(p: Polygon) => void`     | Polygon added callback            |
| `strokeColor`    | `string`                   | Current drawing color             |
| `strokeWidth`    | `number`                   | Current line thickness            |
| `onScaleChange`  | `(scale: number) => void`  | Callback invoked on scale change (optional) |

**Imperative Handle (`ImageViewerHandle`):**
| Method          | Signature                                            | Description                                                  |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `zoomBy`        | `(factor: number) => void`                           | Programmatic zoom to the center of the view (×factor)        |
| `fitToView`     | `() => void`                                         | Fit image to container                                       |
| `extractRegion` | `(polygon: Polygon) => { crop, cropWithOverlay, mask, bbox }` | Extracts a region from canvas based on the polygon's bounding box |

The component uses `forwardRef` — `App` holds `viewerRef` and invokes handle methods from toolbar buttons.

`onScaleChange` is stored in a `useRef` (updated via `useEffect`) to avoid an infinite re-render loop caused by a new inline arrow reference in `useCallback` dependencies.

**Mechanisms:**

| Feature              | Description                                                                        |
| -------------------- | ---------------------------------------------------------------------------------- |
| **Loading**          | `new Image()` with `crossOrigin="anonymous"`, fit to container on load             |
| **Fit to view**      | `scale = min(containerW/imgW, containerH/imgH, 1)`, center image                  |
| **Zoom**             | Mouse wheel scroll, zoom to cursor position, scale range: `0.05–50`               |
| **Pan**              | LMB drag (mousedown → mousemove → mouseup)                                        |
| **Resize**           | `ResizeObserver` on container → auto-resize canvas and re-fit                      |
| **Markup lock**      | When `markupMode=true`, wheel and pan events are ignored — view is locked          |
| **Programmatic zoom**| `zoomBy(factor)` method — zoom to view center, invoked from toolbar buttons        |
| **Fit to view**      | `fitToView()` method — resets view to fit image in container                       |

**Coordinate conversion:**
```
screenToImage(sx, sy) → { x: (sx - transform.x) / transform.scale,
                          y: (sy - transform.y) / transform.scale }
```

**Rendering:** Uses `requestAnimationFrame` for smooth canvas redrawing.

---

### 5.3 `SvgOverlay`

**Responsibility:** SVG layer overlaid on the canvas for drawing and displaying polygons.

**Props:**
| Prop              | Type                                   | Description                            |
| ----------------- | -------------------------------------- | -------------------------------------- |
| `polygons`        | `Polygon[]`                            | Saved polygons to render               |
| `transform`       | `Transform`                            | Current view transform                 |
| `containerWidth`  | `number`                               | Container width (px)                   |
| `containerHeight` | `number`                               | Container height (px)                  |
| `markupMode`      | `boolean`                              | Whether drawing is active              |
| `onAddPolygon`    | `(p: Polygon) => void`                 | Callback after drawing finishes        |
| `screenToImage`   | `(sx: number, sy: number) => Point`    | Screen → image coordinate conversion   |
| `strokeColor`     | `string`                               | Color for new drawing                  |
| `strokeWidth`     | `number`                               | Thickness for new drawing              |

**Mechanisms:**

- **Freehand drawing:** mousedown starts, mousemove adds points, mouseup finalizes the polygon
- **Minimum threshold:** polygon is saved only when `points.length > 2`
- **Image coordinates:** points are converted via `screenToImage()` — polygons are stored in image space, independent of zoom/pan
- **SVG transform:** `<g transform="translate(x, y) scale(s)">` synchronized with canvas
- **Thickness scaling:** `strokeWidth / scale` ensures visually constant line thickness regardless of zoom
- **Live preview:** During drawing, the current polygon (opacity 0.8) is visible and updated in real-time via direct DOM manipulation (`setAttribute`)

**SVG structure:**
```svg
<svg class="svg-overlay drawing" width="..." height="...">
  <g transform="translate(x, y) scale(s)">
    <!-- saved polygons -->
    <polygon points="..." fill="none" stroke="..." stroke-width="..." />
    <!-- actively drawn polygon -->
    <polygon points="..." fill="none" stroke="..." opacity="0.8" />
  </g>
</svg>
```

**Pointer events & event isolation:**
- Normal mode: `pointer-events: none` on SVG + no React event handlers (`onMouseDown={undefined}`) — events pass through to canvas (zoom/pan)
- Markup mode: `pointer-events: all` + `cursor: crosshair` + active React event handlers — SVG captures mouse
- SvgOverlay handlers use `stopPropagation()` to prevent propagation to the ImageViewer container during drawing

---

### 5.4 `Toolbar`

**Responsibility:** Top toolbar.

**UI Elements:**

| Element              | Display Condition     | Description                                    |
| -------------------- | --------------------- | ---------------------------------------------- |
| **－** button        | Always                | Zoom out (÷1.3 to view center)                |
| Zoom display         | Always                | Current zoom in percent (e.g. `100%`), `tabular-nums` |
| **＋** button        | Always                | Zoom in (×1.3 to view center)                 |
| **⊡** button         | Always                | Fit to view — fit image to container           |
| Markup button        | Always                | Toggle markup on/off, highlighted when active  |
| Color picker         | `markupMode=true`     | Input type="color" for stroke color            |
| Range slider         | `markupMode=true`     | Line thickness 1–20px                          |
| Undo button          | `markupMode=true`     | Undo last polygon, disabled when none          |
| Clear button         | `markupMode=true`     | Clears all polygons for the current image      |
| ✨ Generative Fill   | `markupMode=true` && exactly 1 polygon && no active fill session | Opens generative fill panel |

---

### 5.5 `Thumbnails`

**Responsibility:** Bottom thumbnail strip.

**Behavior:**
- Displays thumbnails for all images from `IMAGE_URLS`
- Active thumbnail is highlighted (`border-color: #e94560`, `opacity: 1`)
- Inactive: `opacity: 0.6`, hover: `opacity: 0.85`
- Clicking changes `currentIndex` in `App`
- Strip is scrollable (`overflow-x: auto`)

---

### 5.6 `GenerativeFillPanel`

**Responsibility:** Side panel (top-right corner of viewer area) for managing generative fill.

**Props:**
| Prop           | Type                                         | Description                                |
| -------------- | -------------------------------------------- | ------------------------------------------ |
| `session`      | `FillSession`                                | Active fill session (crop, mask, result)   |
| `onGenerate`   | `(prompt: string, checkpoint: string) => void` | Generation callback with prompt and model |
| `onAccept`     | `() => void`                                 | Accept result                              |
| `onRegenerate` | `(prompt: string, checkpoint: string) => void` | Regenerate with new prompt               |
| `onCancel`     | `() => void`                                 | Cancel fill session                        |

**Internal state:**
- `prompt: string` — prompt text
- `checkpoints: string[]` — list of available models (fetched from ComfyUI API on mount)
- `selectedCheckpoint: string` — selected model
- `loadingModels: boolean` — model list loading state

**UI Elements:**
1. **Header** — title "Generative Fill" + close button
2. **Preview** — crop preview (before generation) or result preview (after generation)
3. **Model selector** — dropdown with available ComfyUI checkpoints (auto-detected)
4. **Prompt textarea** — description of desired result, Enter submits
5. **Spinner** — animated circle during generation
6. **Action buttons:**
   - 🚀 Generate (before result)
   - ✓ Accept / ↻ Regenerate / ✕ Cancel (after result)

---

### 5.7 Service `comfyui.ts`

**Responsibility:** ComfyUI API integration at `http://127.0.0.1:8188`.

**Exported functions:**

| Function         | Signature                                                                        | Description                                             |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `getCheckpoints` | `() => Promise<string[]>`                                                        | Fetches list of available checkpoint models from ComfyUI |
| `generateFill`   | `(crop: string, mask: string, prompt: string, checkpoint?: string) => Promise<string>` | Full inpainting flow: upload → workflow → queue → poll → returns data URL |

**ComfyUI Workflow (inpainting):**
```
CheckpointLoaderSimple (selected model)
  ├── MODEL → KSampler
  ├── CLIP → CLIPTextEncode (positive prompt)
  └── CLIP → CLIPTextEncode (negative: "blurry, bad quality, ...")
  └── VAE → VAEEncodeForInpaint, VAEDecode

LoadImage (crop) → VAEEncodeForInpaint
LoadImage (mask) → ImageToMask (red channel) → VAEEncodeForInpaint

KSampler:
  - steps: 20
  - cfg: 7
  - sampler: euler_ancestral
  - scheduler: normal
  - denoise: 0.85

VAEDecode → SaveImage → result
```

**API calls:**
- `POST /upload/image` — upload crop and mask as PNG
- `POST /prompt` — queue workflow
- `GET /history/{prompt_id}` — poll result (every 1s, timeout 120s)
- `GET /view?filename=...&subfolder=...&type=output` — fetch generated image
- `GET /object_info/CheckpointLoaderSimple` — list available checkpoints

---

### 5.8 Utilities `imageUtils.ts`

**Exported functions:**

| Function               | Description                                                                       |
| --------------------- | --------------------------------------------------------------------------------- |
| `getPolygonBBox(p)`   | Calculates polygon bounding box with 32px margin                                 |
| `cropImage(src, bbox)`| Crops a rectangular region from the image                                        |
| `createMask(polygon, bbox)` | Creates a black-and-white mask (black background, white filled polygon)    |
| `createCropWithOverlay(src, polygon, bbox)` | Crop with polygon stroke overlay (for preview)           |
| `compositeImages(base, result, bbox)` | Composites generation result back onto the original at bbox position |
| `loadImage(src)`      | Promise wrapper for loading Image from data URL or URL                           |

---

## 6. User Interactions

### 6.1 Normal Mode (markup OFF)

```
Mouse wheel      →  Zoom to cursor (×1.1 / ÷1.1)
LMB + drag       →  Pan (move view)
＋ button         →  Zoom in ×1.3 (to view center)
－ button         →  Zoom out ÷1.3 (to view center)
⊡ button          →  Fit to view (reset view)
Thumbnail click   →  Switch image (preserves polygons per image)
```

### 6.2 Markup Mode (markup ON)

```
Mouse wheel      →  Locked (no reaction)
LMB + drag       →  Locked on canvas, freehand drawing on SVG
LMB down         →  Start drawing polygon
LMB move         →  Add points to polygon (real-time preview)
LMB up           →  Finish and save polygon (if >2 points)
```

### 6.3 Generative Fill

**Activation conditions:** `markupMode=true`, exactly 1 drawn polygon, no active fill session.

**Flow:**
1. User draws a polygon in markup mode
2. "✨ Generative Fill" button appears in the toolbar
3. Clicking opens a side panel with:
   - Preview of the cropped region (crop with polygon overlay)
   - Model selector (auto-detected from ComfyUI)
   - Prompt field
4. User enters a prompt and clicks "Generate" (or presses Enter)
5. System:
   - Extracts clean crop and mask from canvas (via `extractRegion`)
   - Uploads crop and mask to ComfyUI
   - Queues inpainting workflow
   - Polls result (every 1s, max 120s)
6. Result appears in the panel preview
7. User can:
   - **Accept** → result is composited onto the original image (URL replaced in state)
   - **Regenerate** → re-generate with current prompt/model
   - **Cancel** → return without changes

**Accept:** `compositeImages()` overlays the result onto the original, updates `imageUrls[currentIndex]` as a data URL, clears polygons, exits markup mode.

---

## 7. Visual Theme

Dark theme — color palette:

| Element            | Color      |
| ------------------ | ---------- |
| App background     | `#1a1a2e`  |
| Viewer background  | `#0d0d1a`  |
| Toolbar background | `#16213e`  |
| Borders            | `#0f3460`  |
| Text               | `#e0e0e0`  |
| Secondary text     | `#9ca3af`  |
| Accent (active)    | `#e94560`  |
| Default stroke     | `#ff3366`  |

---

## 8. Limitations & Assumptions

- Images are loaded from an external server (Five Server on port 5500)
- No persistence — polygons are kept in memory only (React state)
- No touch / mobile gesture support
- Polygons are closed SVG `<polygon>` elements with no fill (`fill="none"`)
- No annotation export/import
- Line thickness is not scaled proportionally to image size — it is visually constant
- Generative fill requires a running ComfyUI instance on `localhost:8188`
- ComfyUI must have at least one checkpoint model installed (e.g. Realistic Vision V5.1 Inpainting)
- After accepting generative fill, the original is overwritten in memory (data URL) — no undo to original

---

## 9. Running

```bash
cd viewer
npm install
npm run dev        # → http://localhost:5173
```

**Requirements:**
- File server at `http://127.0.0.1:5500/assets/` with files `1.jpeg`–`4.jpeg`
- ComfyUI at `http://127.0.0.1:8188` (required for generative fill)
  - At least one checkpoint in `models/checkpoints/`

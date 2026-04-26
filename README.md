# AI Viewer — Generative Fill

An image viewer with freehand annotation and AI-powered generative fill (inpainting), built with React + TypeScript + Vite.

## Features

- Browse a set of images with a thumbnail strip
- Zoom (mouse wheel, +/- buttons) and pan on canvas
- Markup mode — draw freehand SVG polygons over the image
- Generative fill — select a region with a polygon and inpaint it using ComfyUI (FLUX.1 Fill Dev)
- Accept or discard the inpainting result

## Tech Stack

| Layer       | Technology                              |
|-------------|-----------------------------------------|
| Framework   | React 19 + TypeScript                   |
| Bundler     | Vite                                    |
| Rendering   | HTML Canvas (image) + SVG (markup)      |
| AI Backend  | ComfyUI (FLUX.1 Fill Dev inpainting)    |

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI) running locally on `http://127.0.0.1:8188` with the **FLUX.1 Fill Dev** model

## Getting Started

```bash
cd viewer
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Project Structure

```
viewer/src/
├── App.tsx                      # Main component and application state
├── types.ts                     # Shared TypeScript types
├── components/
│   ├── ImageViewer.tsx           # Canvas with zoom/pan, mounts SvgOverlay
│   ├── SvgOverlay.tsx            # SVG layer for freehand polygon drawing
│   ├── Toolbar.tsx               # Toolbar: markup, zoom, generative fill
│   ├── Thumbnails.tsx            # Thumbnail strip for image switching
│   └── GenerativeFillPanel.tsx   # Side panel: prompt, preview, accept/discard
├── services/
│   └── comfyui.ts               # ComfyUI API integration
└── utils/
    └── imageUtils.ts            # Image crop, mask, and composite utilities
```

## Configuration

Image URLs are defined in `viewer/src/App.tsx` in `DEFAULT_IMAGE_URLS`. By default they point to `/assets/*` served by Vite from `viewer/public/assets/`.

ComfyUI endpoint and model names are configured at the top of `viewer/src/services/comfyui.ts`.

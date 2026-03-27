# AI Viewer — Specyfikacja techniczna

## 1. Przegląd

**AI Viewer** to przeglądarka obrazów z funkcją adnotacji (markup), zbudowana w React + TypeScript + Vite. Umożliwia ładowanie obrazków z podanych URL-i, nawigację między nimi, zoom i pan na canvas, oraz rysowanie freehand poligonów SVG w trybie markup.

---

## 2. Stack technologiczny

| Warstwa        | Technologia                  |
| -------------- | ---------------------------- |
| Framework      | React 19 + TypeScript 5.9    |
| Bundler        | Vite 8                       |
| Rendering      | HTML Canvas (obraz) + SVG (adnotacje) |
| Styling        | Vanilla CSS (ciemny motyw)   |
| Serwer obrazów | Five Server (127.0.0.1:5500) |
| AI Backend     | ComfyUI (127.0.0.1:8188) — inpainting |

---

## 3. Architektura

```
viewer/src/
├── main.tsx                    # punkt wejścia, mount React
├── App.tsx                     # główny komponent, stan aplikacji
├── App.css                     # style globalne aplikacji
├── index.css                   # reset CSS
├── types.ts                    # współdzielone typy TS
├── components/
│   ├── ImageViewer.tsx          # canvas z zoom/pan + montuje SvgOverlay
│   ├── SvgOverlay.tsx           # warstwa SVG do rysowania poligonów
│   ├── Toolbar.tsx              # pasek narzędzi (markup, kolor, grubość, undo/clear, zoom, gen.fill)
│   ├── Thumbnails.tsx           # miniaturki do przełączania obrazów
│   └── GenerativeFillPanel.tsx  # panel boczny do generative fill (prompt, podgląd, model)
├── services/
│   └── comfyui.ts               # integracja z API ComfyUI (upload, workflow, polling)
└── utils/
    └── imageUtils.ts            # narzędzia obrazowe (crop, mask, composite)
```

---

## 4. Typy danych (`types.ts`)

```typescript
interface Point {
  x: number;    // współrzędna X w przestrzeni obrazka (piksele natywne)
  y: number;    // współrzędna Y w przestrzeni obrazka (piksele natywne)
}

interface Polygon {
  points: Point[];      // lista punktów poligonu
  stroke: string;       // kolor obrysu (hex)
  strokeWidth: number;  // grubość linii (px)
}

interface Transform {
  x: number;    // przesunięcie X (px ekranowe)
  y: number;    // przesunięcie Y (px ekranowe)
  scale: number; // współczynnik skalowania
}

interface BBox {
  x: number;    // lewy górny róg X (px obrazka)
  y: number;    // lewy górny róg Y (px obrazka)
  w: number;    // szerokość (px)
  h: number;    // wysokość (px)
}

interface FillSession {
  crop: string;       // data URL cropa regionu (z overlayem poligonu)
  mask: string;       // data URL czarno-białej maski (biały = zaznaczenie)
  bbox: BBox;         // bounding box zaznaczonego regionu
  polygon: Polygon;   // poligon użyty do zaznaczenia
  result?: string;    // data URL wyniku generacji (opcjonalny, po zakończeniu)
  isGenerating: boolean; // czy trwa generacja
}
```

---

## 5. Komponenty — szczegóły

### 5.1 `App`

**Odpowiedzialność:** Zarządza globalnym stanem aplikacji.

**Stan:**
- `imageUrls: string[]` — mutablena lista URL-i obrazków (aktualizowana po zatwierdzeniu generative fill)
- `currentIndex: number` — indeks aktualnie wybranego obrazka
- `markupMode: boolean` — czy tryb markup jest aktywny
- `polygons: Record<number, Polygon[]>` — mapa poligonów per obrazek (klucz = indeks)
- `strokeColor: string` — aktualny kolor rysowania (domyślnie `#ff3366`)
- `strokeWidth: number` — aktualna grubość linii (domyślnie `3`)
- `zoomPercent: number` — aktualny poziom zoomu w procentach (domyślnie `100`)
- `fillSession: FillSession | null` — aktywna sesja generative fill (null = nieaktywna)
- `fillError: string | null` — komunikat błędu generative fill

**Referencje:**
- `viewerRef: React.RefObject<ImageViewerHandle>` — ref do `ImageViewer`, używany do programowego zoom (`zoomBy`) i fit-to-view (`fitToView`)

**Operacje na poligonach:**
- `addPolygon(polygon)` — dodaje poligon do bieżącego obrazka
- `undoPolygon()` — usuwa ostatni poligon bieżącego obrazka
- `clearPolygons()` — czyści wszystkie poligony bieżącego obrazka

**Źródło obrazów:**
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

**Odpowiedzialność:** Renderowanie obrazka na canvas z obsługą zoom i pan.

**Props:**
| Prop             | Typ                        | Opis                              |
| ---------------- | -------------------------- | --------------------------------- |
| `src`            | `string`                   | URL obrazka                       |
| `markupMode`     | `boolean`                  | Czy tryb markup jest aktywny      |
| `polygons`       | `Polygon[]`                | Poligony do wyświetlenia          |
| `onAddPolygon`   | `(p: Polygon) => void`     | Callback dodania poligonu         |
| `strokeColor`    | `string`                   | Aktualny kolor rysowania          |
| `strokeWidth`    | `number`                   | Aktualna grubość linii            |
| `onScaleChange`  | `(scale: number) => void`  | Callback wywoływany przy zmianie skali (opcjonalny) |

**Imperative Handle (`ImageViewerHandle`):**
| Metoda          | Sygnatura                                            | Opis                                                         |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `zoomBy`        | `(factor: number) => void`                           | Programowy zoom do centrum widoku (×factor)                  |
| `fitToView`     | `() => void`                                         | Dopasowanie obrazka do kontenera                             |
| `extractRegion` | `(polygon: Polygon) => { crop, cropWithOverlay, mask, bbox }` | Wycina region z canvas na podstawie bounding box poligonu |

Komponent jest `forwardRef` — `App` trzyma `viewerRef` i wywołuje metody handle z przycisków toolbara.

`onScaleChange` jest przechowywany w `useRef` (aktualizowany w `useEffect`), aby uniknąć nieskończonej pętli re-renderów spowodowanej nową referencją inline arrow w zależnościach `useCallback`.

**Mechanizmy:**

| Funkcja          | Opis                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **Ładowanie**    | `new Image()` z `crossOrigin="anonymous"`, po załadowaniu dopasowanie do kontenera          |
| **Fit to view**  | `scale = min(containerW/imgW, containerH/imgH, 1)`, centrowanie obrazka                    |
| **Zoom**         | Scroll kółkiem myszy, zoom do pozycji kursora, zakres skali: `0.05–50`                     |
| **Pan**          | Przeciąganie LPM (mousedown → mousemove → mouseup)                                        |
| **Resize**       | `ResizeObserver` na kontenerze → automatyczne dopasowanie canvas i ponowny fit              |
| **Blokada w markup** | Gdy `markupMode=true`, zdarzenia wheel i pan są ignorowane — widok zablokowany         |
| **Zoom programowy** | Metoda `zoomBy(factor)` — zoom do centrum widoku, wywoływana z przycisków toolbara     |
| **Fit to view**  | Metoda `fitToView()` — resetuje widok do dopasowania obrazka w kontenerze                  |

**Konwersja współrzędnych:**
```
screenToImage(sx, sy) → { x: (sx - transform.x) / transform.scale,
                          y: (sy - transform.y) / transform.scale }
```

**Rendering:** Użycie `requestAnimationFrame` dla płynnego odrysowywania canvas.

---

### 5.3 `SvgOverlay`

**Odpowiedzialność:** Warstwa SVG nałożona na canvas do rysowania i wyświetlania poligonów.

**Props:**
| Prop              | Typ                                    | Opis                                   |
| ----------------- | -------------------------------------- | -------------------------------------- |
| `polygons`        | `Polygon[]`                            | Zapisane poligony do renderowania      |
| `transform`       | `Transform`                            | Aktualna transformacja widoku          |
| `containerWidth`  | `number`                               | Szerokość kontenera (px)               |
| `containerHeight` | `number`                               | Wysokość kontenera (px)                |
| `markupMode`      | `boolean`                              | Czy rysowanie aktywne                  |
| `onAddPolygon`    | `(p: Polygon) => void`                 | Callback po zakończeniu rysowania      |
| `screenToImage`   | `(sx: number, sy: number) => Point`    | Konwersja współrzędnych ekran → obraz  |
| `strokeColor`     | `string`                               | Kolor dla nowego rysunku               |
| `strokeWidth`     | `number`                               | Grubość dla nowego rysunku             |

**Mechanizmy:**

- **Rysowanie freehand:** mousedown rozpoczyna, mousemove dodaje punkty, mouseup finalizuje poligon
- **Minimalny próg:** poligon zapisywany tylko gdy `points.length > 2`
- **Współrzędne obrazkowe:** punkty konwertowane przez `screenToImage()` — poligony zapisane w przestrzeni obrazka, niezależne od zoom/pan
- **Transformacja SVG:** `<g transform="translate(x, y) scale(s)">` synchronizowana z canvas
- **Skalowanie grubości:** `strokeWidth / scale` zapewnia stałą wizualną grubość linii niezależnie od zoom
- **Aktywny podgląd:** Podczas rysowania widoczny jest bieżący poligon (opacity 0.8) aktualizowany w real-time przez bezpośrednią manipulację DOM (`setAttribute`)

**Struktura SVG:**
```svg
<svg class="svg-overlay drawing" width="..." height="...">
  <g transform="translate(x, y) scale(s)">
    <!-- zapisane poligony -->
    <polygon points="..." fill="none" stroke="..." stroke-width="..." />
    <!-- aktywnie rysowany poligon -->
    <polygon points="..." fill="none" stroke="..." opacity="0.8" />
  </g>
</svg>
```

**Pointer events & izolacja zdarzeń:**
- Tryb normalny: `pointer-events: none` na SVG + brak React event handlerów (`onMouseDown={undefined}`) — zdarzenia przechodzą do canvas (zoom/pan)
- Tryb markup: `pointer-events: all` + `cursor: crosshair` + aktywne React event handlery — SVG przechwytuje mysz
- Handlery w SvgOverlay używają `stopPropagation()` aby zapobiec propagacji do kontenera ImageViewer podczas rysowania

---

### 5.4 `Toolbar`

**Odpowiedzialność:** Pasek narzędzi u góry ekranu.

**Elementy UI:**

| Element              | Warunek wyświetlenia | Opis                                           |
| -------------------- | -------------------- | ---------------------------------------------- |
| Przycisk **－**      | Zawsze               | Zoom out (÷1.3 do centrum widoku)              |
| Wyświetlacz zoomu    | Zawsze               | Aktualny zoom w procentach (np. `100%`), `tabular-nums` |
| Przycisk **＋**      | Zawsze               | Zoom in (×1.3 do centrum widoku)               |
| Przycisk **⊡**       | Zawsze               | Fit to view — dopasowanie obrazka do kontenera  |
| Przycisk Markup      | Zawsze               | Toggle markup on/off, podświetlony gdy aktywny  |
| Color picker         | `markupMode=true`    | Input type="color" do wyboru koloru obrysu      |
| Range slider         | `markupMode=true`    | Grubość linii 1–20px                            |
| Przycisk Cofnij      | `markupMode=true`    | Undo ostatniego poligonu, disabled gdy brak     |
| Przycisk Wyczyść     | `markupMode=true`    | Kasuje wszystkie poligony bieżącego obrazka     |
| ✨ Generative Fill   | `markupMode=true` && dokładnie 1 poligon && brak aktywnej sesji fill | Otwiera panel generative fill |

---

### 5.5 `Thumbnails`

**Odpowiedzialność:** Dolny pasek z miniaturkami obrazów.

**Zachowanie:**
- Wyświetla miniaturki wszystkich obrazów z `IMAGE_URLS`
- Aktywna miniaturka podświetlona (`border-color: #e94560`, `opacity: 1`)
- Nieaktywne: `opacity: 0.6`, hover: `opacity: 0.85`
- Kliknięcie zmienia `currentIndex` w `App`
- Pasek przewijalny (`overflow-x: auto`)

---

### 5.6 `GenerativeFillPanel`

**Odpowiedzialność:** Panel boczny (prawy-górny róg viewer area) do zarządzania generative fill.

**Props:**
| Prop           | Typ                                          | Opis                                       |
| -------------- | -------------------------------------------- | ------------------------------------------ |
| `session`      | `FillSession`                                | Aktywna sesja fill (crop, mask, wynik)     |
| `onGenerate`   | `(prompt: string, checkpoint: string) => void` | Callback generacji z promptem i modelem  |
| `onAccept`     | `() => void`                                 | Zatwierdzenie wyniku                       |
| `onRegenerate` | `(prompt: string, checkpoint: string) => void` | Ponowna generacja z nowym promptem       |
| `onCancel`     | `() => void`                                 | Anulowanie sesji fill                      |

**Stan wewnętrzny:**
- `prompt: string` — tekst promptu
- `checkpoints: string[]` — lista dostępnych modeli (pobierana z ComfyUI API na mount)
- `selectedCheckpoint: string` — wybrany model
- `loadingModels: boolean` — stan ładowania listy modeli

**Elementy UI:**
1. **Header** — tytuł "Generative Fill" + przycisk zamknięcia
2. **Preview** — podgląd cropa (przed generacją) lub wyniku (po generacji)
3. **Model selector** — dropdown z dostępnymi checkpointami ComfyUI (auto-wykrywane)
4. **Prompt textarea** — opis pożądanego rezultatu, Enter wysyła
5. **Spinner** — animowany kółko podczas generacji
6. **Action buttons:**
   - 🚀 Generuj (przed wynikiem)
   - ✓ Zatwierdź / ↻ Przegeneruj / ✕ Anuluj (po wyniku)

---

### 5.7 Serwis `comfyui.ts`

**Odpowiedzialność:** Integracja z API ComfyUI na `http://127.0.0.1:8188`.

**Eksportowane funkcje:**

| Funkcja          | Sygnatura                                                                        | Opis                                                    |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `getCheckpoints` | `() => Promise<string[]>`                                                        | Pobiera listę dostępnych checkpoint modeli z ComfyUI    |
| `generateFill`   | `(crop: string, mask: string, prompt: string, checkpoint?: string) => Promise<string>` | Pełny flow inpaintingu: upload → workflow → queue → poll → zwraca data URL |

**Workflow ComfyUI (inpainting):**
```
CheckpointLoaderSimple (wybrany model)
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

VAEDecode → SaveImage → wynik
```

**API calls:**
- `POST /upload/image` — upload cropa i maski jako PNG
- `POST /prompt` — kolejkowanie workflow
- `GET /history/{prompt_id}` — polling wyniku (co 1s, timeout 120s)
- `GET /view?filename=...&subfolder=...&type=output` — pobranie wygenerowanego obrazu
- `GET /object_info/CheckpointLoaderSimple` — lista dostępnych checkpointów

---

### 5.8 Utilities `imageUtils.ts`

**Eksportowane funkcje:**

| Funkcja               | Opis                                                                              |
| --------------------- | --------------------------------------------------------------------------------- |
| `getPolygonBBox(p)`   | Oblicza bounding box poligonu z marginiesem 32px                                  |
| `cropImage(src, bbox)`| Wycina prostokątny region z obrazu                                                |
| `createMask(polygon, bbox)` | Tworzy czarno-białą maskę (czarne tło, biały wypełniony poligon)           |
| `createCropWithOverlay(src, polygon, bbox)` | Crop z nałożonym obrysem poligonu (do podglądu)          |
| `compositeImages(base, result, bbox)` | Nakłada wynik generacji z powrotem na oryginał w pozycji bbox      |
| `loadImage(src)`      | Promise wrapper do ładowania Image z data URL lub URL                             |

---

## 6. Interakcje użytkownika

### 6.1 Tryb normalny (markup OFF)

```
Scroll kółkiem  →  Zoom do kursora (×1.1 / ÷1.1)
LPM + drag      →  Pan (przesunięcie widoku)
Przycisk ＋     →  Zoom in ×1.3 (do centrum widoku)
Przycisk －     →  Zoom out ÷1.3 (do centrum widoku)
Przycisk ⊡      →  Fit to view (reset widoku)
Klik miniaturka  →  Zmiana obrazka (zachowuje poligony per obraz)
```

### 6.2 Tryb markup (markup ON)

```
Scroll kółkiem  →  Zablokowany (brak reakcji)
LPM + drag      →  Zablokowany na canvas, rysowanie freehand na SVG
LPM down        →  Rozpoczęcie rysowania poligonu
LPM move        →  Dodawanie punktów do poligonu (real-time podgląd)
LPM up          →  Zakończenie i zapis poligonu (jeśli >2 punkty)
```

### 6.3 Generative Fill

**Warunki aktywacji:** `markupMode=true`, dokładnie 1 narysowany poligon, brak aktywnej sesji fill.

**Flow:**
1. Użytkownik rysuje poligon w trybie markup
2. Pojawia się przycisk "✨ Generative Fill" w toolbarze
3. Kliknięcie otwiera panel boczny z:
   - Podglądem wyciętego regionu (crop z overlayem poligonu)
   - Selectorem modelu (auto-wykrywany z ComfyUI)
   - Polem promptu
4. Użytkownik wpisuje prompt i klika "Generuj" (lub Enter)
5. System:
   - Wycina czysty crop i maskę z canvas (via `extractRegion`)
   - Uploaduje crop i maskę do ComfyUI
   - Kolejkuje workflow inpainting
   - Polluje wynik (co 1s, max 120s)
6. Wynik pojawia się w podglądzie panelu
7. Użytkownik może:
   - **Zatwierdź** → wynik jest composited na oryginalny obraz (podmiana URL w state)
   - **Przegeneruj** → ponowna generacja z aktualnym promptem/modelem
   - **Anuluj** → powrót bez zmian

**Zatwierdzenie:** `compositeImages()` nakłada wynik na oryginał, aktualizuje `imageUrls[currentIndex]` jako data URL, czyści poligony, wyłącza markup mode.

---

## 7. Motyw wizualny

Ciemny motyw — paleta kolorów:

| Element          | Kolor      |
| ---------------- | ---------- |
| Tło aplikacji    | `#1a1a2e`  |
| Tło viewera      | `#0d0d1a`  |
| Tło toolbara     | `#16213e`  |
| Obramowania      | `#0f3460`  |
| Tekst            | `#e0e0e0`  |
| Tekst drugorzędny| `#9ca3af`  |
| Akcent (active)  | `#e94560`  |
| Domyślny stroke  | `#ff3366`  |

---

## 8. Ograniczenia i założenia

- Obrazy ładowane z zewnętrznego serwera (Five Server na porcie 5500)
- Brak persystencji — poligony trzymane tylko w pamięci (state React)
- Brak obsługi touch / gestów mobilnych
- Poligony to zamknięte `<polygon>` SVG bez wypełnienia (`fill="none"`)
- Brak eksportu/importu adnotacji
- Brak skalowania grubości linii proporcjonalnie do rozmiaru obrazu — grubość jest wizualnie stała
- Generative fill wymaga działającego ComfyUI na `localhost:8188`
- ComfyUI musi mieć zainstalowany co najmniej jeden checkpoint model (np. Realistic Vision V5.1 Inpainting)
- Po zatwierdzeniu generative fill, oryginał jest nadpisywany w pamięci (data URL) — brak powrotu do oryginału

---

## 9. Uruchomienie

```bash
cd viewer
npm install
npm run dev        # → http://localhost:5173
```

**Wymagania:**
- Serwer plików na `http://127.0.0.1:5500/assets/` z plikami `1.jpeg`–`4.jpeg`
- ComfyUI na `http://127.0.0.1:8188` (wymagany do generative fill)
  - Co najmniej jeden checkpoint w `models/checkpoints/`

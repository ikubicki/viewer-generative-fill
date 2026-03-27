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

---

## 3. Architektura

```
viewer/src/
├── main.tsx                    # punkt wejścia, mount React
├── App.tsx                     # główny komponent, stan aplikacji
├── App.css                     # style globalne aplikacji
├── index.css                   # reset CSS
├── types.ts                    # współdzielone typy TS
└── components/
    ├── ImageViewer.tsx          # canvas z zoom/pan + montuje SvgOverlay
    ├── SvgOverlay.tsx           # warstwa SVG do rysowania poligonów
    ├── Toolbar.tsx              # pasek narzędzi (markup, kolor, grubość, undo/clear)
    └── Thumbnails.tsx           # miniaturki do przełączania obrazów
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
```

---

## 5. Komponenty — szczegóły

### 5.1 `App`

**Odpowiedzialność:** Zarządza globalnym stanem aplikacji.

**Stan:**
- `currentIndex: number` — indeks aktualnie wybranego obrazka
- `markupMode: boolean` — czy tryb markup jest aktywny
- `polygons: Record<number, Polygon[]>` — mapa poligonów per obrazek (klucz = indeks)
- `strokeColor: string` — aktualny kolor rysowania (domyślnie `#ff3366`)
- `strokeWidth: number` — aktualna grubość linii (domyślnie `3`)
- `zoomPercent: number` — aktualny poziom zoomu w procentach (domyślnie `100`)

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
| Metoda       | Sygnatura                 | Opis                                              |
| ------------ | ------------------------- | ------------------------------------------------- |
| `zoomBy`     | `(factor: number) => void`| Programowy zoom do centrum widoku (×factor)        |
| `fitToView`  | `() => void`              | Dopasowanie obrazka do kontenera                   |

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

---

## 9. Uruchomienie

```bash
cd viewer
npm install
npm run dev        # → http://localhost:5173
```

Wymaga działającego serwera plików na `http://127.0.0.1:5500/assets/` z plikami `1.jpeg`–`4.jpeg`.

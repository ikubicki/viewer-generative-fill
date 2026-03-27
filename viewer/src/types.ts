export interface Point {
  x: number;
  y: number;
}

export interface Polygon {
  points: Point[];
  stroke: string;
  strokeWidth: number;
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FillSession {
  crop: string;          // data URL of cropped region
  mask: string;          // data URL of mask
  bbox: BBox;            // bounding box in image coords
  polygon: Polygon;      // the source polygon
  result?: string;       // data URL of generated result
  isGenerating: boolean;
}

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

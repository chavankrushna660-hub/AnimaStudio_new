import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw, Sparkles, Feather, ZoomIn, ZoomOut } from 'lucide-react';
import { Point, VectorObject, Bone, Pivot, Frame, Transform, RealismSettings, LassoControlPoint, SmartWarpPin, BrushSettings } from '../types';
import { transform3DVertex, project3DVertex, getFaceLightColor, deformVertices3D } from '../utils/engine3D';
import { 
  distance, 
  pointToPolylineDistance, 
  isPointInPolygon, 
  localToWorld, 
  worldToLocal, 
  deformPoints, 
  calculateBoundingBox,
  rotatePoint,
  findClosestView360
} from '../utils/math';

// Mesh Warp Bilinear Interpolation helper
const getWarpedPoint = (p: Point, meshState: any, bounds: any) => {
  if (!meshState || !meshState.active) return p;
  const { densityX, densityY, points } = meshState;
  
  const tx = bounds.width > 0 ? (p.x - bounds.x) / bounds.width : 0;
  const ty = bounds.height > 0 ? (p.y - bounds.y) / bounds.height : 0;
  
  // Find grid cell
  const cellX = Math.max(0, Math.min(densityX - 2, Math.floor(tx * (densityX - 1))));
  const cellY = Math.max(0, Math.min(densityY - 2, Math.floor(ty * (densityY - 1))));
  
  const idxTL = cellY * densityX + cellX;
  const idxTR = cellY * densityX + (cellX + 1);
  const idxBL = (cellY + 1) * densityX + cellX;
  const idxBR = (cellY + 1) * densityX + (cellX + 1);
  
  const topLeft = points[idxTL];
  const topRight = points[idxTR];
  const bottomLeft = points[idxBL];
  const bottomRight = points[idxBR];
  
  if (!topLeft || !topRight || !bottomLeft || !bottomRight) return p;
  
  const gridCellW = 1 / (densityX - 1);
  const gridCellH = 1 / (densityY - 1);
  const u = (tx - cellX * gridCellW) / gridCellW;
  const v = (ty - cellY * gridCellH) / gridCellH;
  
  const cu = Math.max(0, Math.min(1, u));
  const cv = Math.max(0, Math.min(1, v));
  
  const warpedX = topLeft.currentX * (1 - cu) * (1 - cv) +
                  topRight.currentX * cu * (1 - cv) +
                  bottomLeft.currentX * (1 - cu) * cv +
                  bottomRight.currentX * cu * cv;
                  
  const warpedY = topLeft.currentY * (1 - cu) * (1 - cv) +
                  topRight.currentY * cu * (1 - cv) +
                  bottomLeft.currentY * (1 - cu) * cv +
                  bottomRight.currentY * cu * cv;
                  
  return { x: warpedX, y: warpedY };
};

// 🌟 Distance from point to line segment helper
const pointToSegmentDistance = (p: Point, v: Point, w: Point): number => {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return distance(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y)
  });
};

// 🌟 Distance from point to polygon boundary helper
const pointToPolygonDistance = (p: Point, polygon: Point[]): number => {
  let minD = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const v = polygon[i];
    const w = polygon[(i + 1) % polygon.length];
    const d = pointToSegmentDistance(p, v, w);
    if (d < minD) {
      minD = d;
    }
  }
  return minD;
};

// 🌟 Lasso selection deformation point helper with seamless organic boundary welding
const deformWithLasso = (p: Point, obj: VectorObject): Point => {
  if (
    obj.lassoDeformState && 
    obj.lassoDeformState.active && 
    obj.lassoDeformState.lassoPoints && 
    obj.lassoDeformState.lassoPoints.length >= 3
  ) {
    const polygon = obj.lassoDeformState.lassoPoints;
    let sumX = 0;
    let sumY = 0;
    polygon.forEach(pt => {
      sumX += pt.x;
      sumY += pt.y;
    });
    const lassoCenter = { localX: sumX / polygon.length, localY: sumY / polygon.length };
    // Rigid body transform of selected pixels relative to center
    const pTransformed = localToWorld(p, obj.lassoDeformState.transform, lassoCenter);

    if (isPointInPolygon(p, polygon)) {
      return pTransformed;
    } else {
      const d = pointToPolygonDistance(p, polygon);
      const polyBounds = calculateBoundingBox(polygon);
      const size = Math.max(polyBounds.width, polyBounds.height);
      // Perfect localized transition radius: 20% of selection size, bounded between 15px and 45px
      const R = Math.max(15, Math.min(45, size * 0.2));
      if (d >= R) {
        return p; // Keep points outside the transition range completely static!
      }
      const t = 1 - d / R;
      const w = t * t * (3 - 2 * t); // Hermite smoothstep for organic blend
      return {
        x: p.x + w * (pTransformed.x - p.x),
        y: p.y + w * (pTransformed.y - p.y)
      };
    }
  }
  return p;
};

// 🌟 Lasso Control Points Mesh Shepard's IDW deform helper
const deformWithLassoControlPoints = (p: Point, controlPoints: LassoControlPoint[]): Point => {
  if (!controlPoints || controlPoints.length === 0) return p;

  // Let's find if any control point is moved
  let hasMovement = false;
  for (const cp of controlPoints) {
    if (Math.abs(cp.currentX - cp.originalX) > 0.05 || Math.abs(cp.currentY - cp.originalY) > 0.05) {
      hasMovement = true;
      break;
    }
  }
  if (!hasMovement) return p;

  // Shepard's Interpolation (IDW)
  let sumX = 0;
  let sumY = 0;
  let totalWeight = 0;
  const pPower = 2; // Power parameter for distance weighting

  for (const cp of controlPoints) {
    const dx = p.x - cp.originalX;
    const dy = p.y - cp.originalY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.1) {
      // Extremely close to a control point, return its exact current position
      return { x: cp.currentX, y: cp.currentY };
    }

    const weight = 1 / Math.pow(dist, pPower);
    sumX += (cp.currentX - cp.originalX) * weight;
    sumY += (cp.currentY - cp.originalY) * weight;
    totalWeight += weight;
  }

  if (totalWeight > 0) {
    return {
      x: p.x + sumX / totalWeight,
      y: p.y + sumY / totalWeight
    };
  }

  return p;
};

// Puppet Pin Warp Shepard's IDW helper
const deformWithPuppetPins = (p: Point, pins: Pivot[]) => {
  if (!pins || pins.length === 0) return p;
  
  const movedPins = pins.filter(pin => {
    const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
    const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
    return Math.abs(curX - pin.localX) > 0.1 || Math.abs(curY - pin.localY) > 0.1;
  });
  
  if (movedPins.length === 0) return p;
  
  let totalWeight = 0;
  let deltaX = 0;
  let deltaY = 0;
  
  for (const pin of pins) {
    const d = distance(p, { x: pin.localX, y: pin.localY });
    if (d < 1) {
      const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
      const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
      return { x: curX, y: curY };
    }
  }
  
  for (const pin of pins) {
    const d = distance(p, { x: pin.localX, y: pin.localY });
    const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
    const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
    
    const weight = 1 / (d * d);
    totalWeight += weight;
    deltaX += (curX - pin.localX) * weight;
    deltaY += (curY - pin.localY) * weight;
  }
  
  if (totalWeight > 0) {
    return {
      x: p.x + deltaX / totalWeight,
      y: p.y + deltaY / totalWeight
    };
  }
  
  return p;
};

// Smart Warp Pin deformation helper (based on customizable radius, falloff curve, non-destructive)
const deformWithSmartWarp = (p: Point, smartWarp: any): Point => {
  if (!smartWarp || !smartWarp.pins || smartWarp.pins.length === 0) return p;
  
  const pins = smartWarp.pins;
  const influenceRadius = smartWarp.influenceRadius || 120;
  const influenceFalloff = smartWarp.influenceFalloff || 'smooth';

  let dx = 0;
  let dy = 0;

  for (const pin of pins) {
    const dist = distance(p, { x: pin.originalX, y: pin.originalY });
    if (dist < influenceRadius) {
      let weight = 0;
      const ratio = dist / influenceRadius;
      if (influenceFalloff === 'linear') {
        weight = 1 - ratio;
      } else if (influenceFalloff === 'sharp') {
        weight = Math.pow(1 - ratio, 2);
      } else { // smooth
        weight = (1 + Math.cos(Math.PI * ratio)) / 2;
      }
      dx += (pin.currentX - pin.originalX) * weight;
      dy += (pin.currentY - pin.originalY) * weight;
    }
  }

  return {
    x: p.x + dx,
    y: p.y + dy
  };
};

// Textured triangle renderer for 2D HTML5 Canvas
const drawTexturedTriangle = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  u0: number, v0: number,
  u1: number, v1: number,
  u2: number, v2: number,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number
) => {
  // Find centroid of destination triangle
  const cx = (x0 + x1 + x2) / 3;
  const cy = (y0 + y1 + y2) / 3;

  // Slightly push vertices outward from centroid (e.g. by 0.5 pixels) to avoid rendering seams
  const expand = 0.5;
  
  let dx0 = x0 - cx;
  let dy0 = y0 - cy;
  let len0 = Math.sqrt(dx0 * dx0 + dy0 * dy0);
  if (len0 > 0) {
    x0 += (dx0 / len0) * expand;
    y0 += (dy0 / len0) * expand;
  }

  let dx1 = x1 - cx;
  let dy1 = y1 - cy;
  let len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  if (len1 > 0) {
    x1 += (dx1 / len1) * expand;
    y1 += (dy1 / len1) * expand;
  }

  let dx2 = x2 - cx;
  let dy2 = y2 - cy;
  let len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
  if (len2 > 0) {
    x2 += (dx2 / len2) * expand;
    y2 += (dy2 / len2) * expand;
  }

  const delta = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
  if (Math.abs(delta) < 0.0001) return;

  const a = (x0 * (v1 - v2) + x1 * (v2 - v0) + x2 * (v0 - v1)) / delta;
  const c = (x0 * (u2 - u1) + x1 * (u0 - u2) + x2 * (u1 - u0)) / delta;
  const e = (x0 * (u1 * v2 - u2 * v1) + x1 * (u2 * v0 - u0 * v2) + x2 * (u0 * v1 - u1 * v0)) / delta;

  const b = (y0 * (v1 - v2) + y1 * (v2 - v0) + y2 * (v0 - v1)) / delta;
  const d = (y0 * (u2 - u1) + y1 * (u0 - u2) + y2 * (u1 - u0)) / delta;
  const f = (y0 * (u1 * v2 - u2 * v1) + y1 * (u2 * v0 - u0 * v2) + y2 * (u0 * v1 - u1 * v0)) / delta;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.clip();

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
};

const isChildInsideParent = (
  child: VectorObject,
  parent: VectorObject,
  testTransform: Transform,
  objects: { [id: string]: VectorObject }
): boolean => {
  if (!parent.points || parent.points.length < 3) return true;
  
  // Get parent world points
  const parentPivot = parent.pivots[0] || { localX: 0, localY: 0 };
  const parentWorldPoints = parent.points.map(p => localToWorld(p, parent.transform, parentPivot));

  // Get child world points with testTransform
  const childPivot = child.pivots[0] || { localX: 0, localY: 0 };
  let localPoints = child.points;
  if (child.meshState && child.meshState.active) {
    const bounds = calculateBoundingBox(child.points);
    localPoints = child.points.map(p => getWarpedPoint(p, child.meshState, bounds));
  } else if (child.pins && child.pins.length > 0) {
    localPoints = child.points.map(p => deformWithPuppetPins(p, child.pins));
  }
  const childWorldPoints = localPoints.map(p => localToWorld(p, testTransform, childPivot));

  // Check if every child world point is inside the parent polygon
  return childWorldPoints.every(pt => isPointInPolygon(pt, parentWorldPoints));
};

const getTaperWidth = (i: number, N: number, baseWidth: number, enabled: boolean): number => {
  if (!enabled || N <= 2) return baseWidth;
  const taperLength = Math.min(15, Math.floor(N / 3.5));
  if (taperLength <= 0) return baseWidth;
  
  if (i < taperLength) {
    const ratio = i / taperLength;
    const factor = Math.sin(ratio * Math.PI / 2);
    return baseWidth * factor;
  } else if (i >= N - taperLength) {
    const ratio = (N - 1 - i) / taperLength;
    const factor = Math.sin(ratio * Math.PI / 2);
    return baseWidth * factor;
  }
  return baseWidth;
};

const createRealismPoint = (
  coords: Point,
  lastPt: Point | null,
  settings?: RealismSettings
): Point => {
  const now = Date.now();
  let w = settings?.maxThickness ?? 3.5;
  let angle = 0;
  
  if (lastPt) {
    const dist = Math.hypot(coords.x - lastPt.x, coords.y - lastPt.y);
    const dt = now - (lastPt.t ?? (now - 16));
    const timeDelta = Math.max(1, dt);
    
    // 1. Velocity-Based Auto-Taper
    if (settings?.autoTaperEnabled) {
      const speed = dist / timeDelta; // px per ms
      // Speed thinning formula: fast = thin, slow = thick
      const thinning = speed * (settings.thinningFactor * 10);
      w = Math.max(settings.minThickness, settings.maxThickness - thinning);
    }
    
    // 2. Stroke Angle
    angle = Math.atan2(coords.y - lastPt.y, coords.x - lastPt.x);
  } else {
    w = settings ? (settings.maxThickness + settings.minThickness) / 2 : 3.5;
  }
  
  // 3. Micro-Jitter
  let jitterX = 0;
  let jitterY = 0;
  if (settings?.microJitterEnabled) {
    const amt = settings.microJitterAmount;
    jitterX = Math.random() * amt - amt / 2;
    jitterY = Math.random() * amt - amt / 2;
  }
  
  // 4. Paper Grain static modifier
  let grainOpacity = 1.0;
  if (settings?.paperGrainEnabled) {
    const intensity = settings.paperGrainIntensity;
    grainOpacity = 1.0 - (Math.random() * intensity);
  }
  
  return {
    x: coords.x,
    y: coords.y,
    t: now,
    w: Number(w.toFixed(2)),
    angle,
    jitterX: Number(jitterX.toFixed(2)),
    jitterY: Number(jitterY.toFixed(2)),
    grainOpacity: Number(grainOpacity.toFixed(2))
  };
};

const applyBrushSettingsToCtx = (
  ctx: CanvasRenderingContext2D,
  brush: Partial<BrushSettings>,
  baseColor: string,
  strokeWidth: number
) => {
  const opacity = brush.strokeOpacity ?? 1.0;
  ctx.globalAlpha = ctx.globalAlpha * opacity;

  // Apply basic shadow if enabled
  if (brush.shadowEnabled) {
    ctx.shadowColor = brush.shadowColor ?? '#000000';
    ctx.shadowBlur = brush.shadowBlur ?? 4;
    ctx.shadowOffsetX = brush.shadowOffsetX ?? 2;
    ctx.shadowOffsetY = brush.shadowOffsetY ?? 2;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Hardness & blur filters
  const blurVal = brush.blur ?? 0;
  if (blurVal > 0) {
    ctx.filter = `blur(${blurVal}px)`;
  } else {
    ctx.filter = 'none';
  }
};

const drawVariableWidthStrokeInternal = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  baseColor: string,
  settings?: RealismSettings,
  widthOffset: number = 0,
  drawShading: boolean = true,
  brush?: Partial<BrushSettings>
) => {
  if (points.length === 0) return;

  ctx.save();
  if (brush) {
    applyBrushSettingsToCtx(ctx, brush, baseColor, brush.strokeWidth ?? 5);
  }

  ctx.beginPath();
  if (points.length === 1) {
    const pt = points[0];
    const r = Math.max(0.1, ((brush?.strokeWidth ?? 5) + widthOffset) / 2);
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();
  } else {
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const xc = (points[i].x + points[i - 1].x) / 2;
      const yc = (points[i].y + points[i - 1].y) / 2;
      ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
    }
    ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);

    ctx.strokeStyle = baseColor;
    ctx.lineWidth = (brush?.strokeWidth ?? 5) + widthOffset;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();
};

const drawVariableWidthStroke = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  baseColor: string,
  settings?: RealismSettings,
  brush?: Partial<BrushSettings>
) => {
  drawVariableWidthStrokeInternal(ctx, points, baseColor, settings, 0, false, brush);
};

interface CanvasAreaProps {
  objects: { [id: string]: VectorObject };
  setObjects: React.Dispatch<React.SetStateAction<{ [id: string]: VectorObject }>>;
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
  activeTool: string;
  frames: Frame[];
  currentFrameIndex: number;
  bones: Bone[];
  setBones: React.Dispatch<React.SetStateAction<Bone[]>>;
  activeLayerId: string;
  onionSkinEnabled: boolean;
  showBones?: boolean;
  isPlaying: boolean;
  historyPush: () => void;
  layers?: any[];
  setLayers?: React.Dispatch<React.SetStateAction<any[]>>;
  lassoPoints: Point[];
  setLassoPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  lassoMode: 'freehand' | 'pen';
  setLassoMode: (mode: 'freehand' | 'pen') => void;
  penLassoPoints: Point[];
  setPenLassoPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  realismSettings?: RealismSettings;
  is360WizardActive?: boolean;
  draft360Views?: any[];
  onionSkinEnabled360?: boolean;
  artboardW: number;
  setArtboardW: React.Dispatch<React.SetStateAction<number>>;
  artboardH: number;
  setArtboardH: React.Dispatch<React.SetStateAction<number>>;
  showCanvasSizePanel: boolean;
  setShowCanvasSizePanel: React.Dispatch<React.SetStateAction<boolean>>;
  adaptiveSubdivisionEnabled: boolean;
  adaptiveSubdivisionPoints: number;
  fillToolColor?: string;
  brushSettings?: BrushSettings;
  setBrushSettings?: React.Dispatch<React.SetStateAction<BrushSettings>>;
  selectedDeformPointIndex?: number | null;
  setSelectedDeformPointIndex?: (idx: number | null) => void;
  selectedDeformPointType?: 'standard' | 'grid' | '3d' | null;
  setSelectedDeformPointType?: (type: 'standard' | 'grid' | '3d' | null) => void;
  setOriginalDeformPointCoords?: (coords: { x: number; y: number; z?: number } | null) => void;
  setDeformPointTransform?: (t: Transform) => void;
}

export default function CanvasArea({
  objects,
  setObjects,
  selectedObjectId,
  setSelectedObjectId,
  activeTool,
  frames,
  currentFrameIndex,
  bones,
  setBones,
  activeLayerId,
  onionSkinEnabled,
  showBones = true,
  isPlaying,
  historyPush,
  layers = [],
  setLayers,
  lassoPoints,
  setLassoPoints,
  lassoMode,
  setLassoMode,
  penLassoPoints,
  setPenLassoPoints,
  realismSettings,
  is360WizardActive = false,
  draft360Views = [],
  onionSkinEnabled360 = true,
  artboardW,
  setArtboardW,
  artboardH,
  setArtboardH,
  showCanvasSizePanel,
  setShowCanvasSizePanel,
  adaptiveSubdivisionEnabled,
  adaptiveSubdivisionPoints,
  fillToolColor = '#4CAF50',
  brushSettings,
  setBrushSettings,
  selectedDeformPointIndex = null,
  setSelectedDeformPointIndex,
  selectedDeformPointType = null,
  setSelectedDeformPointType,
  setOriginalDeformPointCoords,
  setDeformPointTransform,
}: CanvasAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const backCanvasRef = useRef<HTMLCanvasElement>(null);
  const frontCanvasRef = useRef<HTMLCanvasElement>(null);
  const imagesCacheRef = useRef<{ [url: string]: HTMLImageElement }>({});

  const [dimensions, setDimensions] = useState({ width: 1000, height: 700 });

  const [tempArtboardW, setTempArtboardW] = useState<string>(artboardW.toString());
  const [tempArtboardH, setTempArtboardH] = useState<string>(artboardH.toString());

  useEffect(() => {
    setTempArtboardW(artboardW.toString());
    setTempArtboardH(artboardH.toString());
  }, [artboardW, artboardH]);

  const recenterCanvas = () => {
    try {
      const scaleX = (dimensions.width - 48) / artboardW;
      const scaleY = (dimensions.height - 48) / artboardH;
      const bestScale = Math.min(2.0, Math.max(0.3, Math.min(scaleX, scaleY)));
      const offsetX = (dimensions.width - artboardW * bestScale) / 2;
      const offsetY = (dimensions.height - artboardH * bestScale) / 2;
      
      setZoomScale(prev => {
        if (Math.abs(prev - bestScale) < 0.001) {
          return prev;
        }
        return bestScale;
      });
      
      setZoomOffset(prev => {
        if (Math.abs(prev.x - offsetX) < 0.01 && Math.abs(prev.y - offsetY) < 0.01) {
          return prev;
        }
        return { x: offsetX, y: offsetY };
      });
    } catch (err) {
      console.error("Recenter canvas failed", err);
    }
  };

  const paintColorAt = (worldCoords: Point, obj: VectorObject) => {
    if (!obj.smartMeshColor) return;
    
    const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
    const localPos = worldToLocal(worldCoords, obj.transform, localPivot);
    const smc = obj.smartMeshColor;
    const brushSize = smc.brushSize || 40;
    const brushColor = smc.brushColor || '#10b981';
    const brushOpacity = smc.brushOpacity !== undefined ? smc.brushOpacity : 1.0;
    
    let pointsChanged = false;
    let cellsChanged = false;

    // 1. If paintMode is 'point', update colors of vertices close to the local brush coordinate
    const updatedPoints = smc.points.map(pt => {
      // Warp point dynamically if pins are present so we check distance to where the point is currently deformed!
      const deformedLocal = deformWithSmartWarp({ x: pt.originalX, y: pt.originalY }, obj.smartWarp);
      const dist = distance(localPos, deformedLocal);
      
      if (dist <= brushSize) {
        pointsChanged = true;
        return {
          ...pt,
          color: brushColor,
          opacity: brushOpacity
        };
      }
      return pt;
    });

    // 2. If paintMode is 'cell', find cells whose center point is close to the local brush coordinate
    const updatedCells = smc.cells.map(cell => {
      // Compute the average center point of cell's 4 corner vertices
      let sumX = 0;
      let sumY = 0;
      let valid = true;
      
      cell.pointIds.forEach(pId => {
        const pt = smc.points.find(p => p.id === pId);
        if (pt) {
          const deformedLocal = deformWithSmartWarp({ x: pt.originalX, y: pt.originalY }, obj.smartWarp);
          sumX += deformedLocal.x;
          sumY += deformedLocal.y;
        } else {
          valid = false;
        }
      });
      
      if (valid) {
        const center = { x: sumX / cell.pointIds.length, y: sumY / cell.pointIds.length };
        const dist = distance(localPos, center);
        if (dist <= brushSize) {
          cellsChanged = true;
          return {
            ...cell,
            color: brushColor,
            opacity: brushOpacity
          };
        }
      }
      return cell;
    });

    if (pointsChanged || cellsChanged) {
      setObjects(prev => {
        const curObj = prev[obj.id];
        if (!curObj || !curObj.smartMeshColor) return prev;
        return {
          ...prev,
          [obj.id]: {
            ...curObj,
            smartMeshColor: {
              ...curObj.smartMeshColor,
              points: updatedPoints,
              cells: updatedCells
            }
          }
        };
      });
    }
  };

  const zoomIn = () => {
    try {
      const currentScale = zoomScale;
      const nextScale = Math.min(10.0, currentScale + 0.15);
      const factor = currentScale > 0 ? nextScale / currentScale : 1;
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
      
      setZoomScale(nextScale);
      setZoomOffset(prevOffset => ({
        x: centerX - (centerX - prevOffset.x) * factor,
        y: centerY - (centerY - prevOffset.y) * factor
      }));
    } catch (err) {
      console.error("Zoom in failed", err);
    }
  };

  const zoomOut = () => {
    try {
      const currentScale = zoomScale;
      const nextScale = Math.max(0.15, currentScale - 0.15);
      const factor = currentScale > 0 ? nextScale / currentScale : 1;
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
      
      setZoomScale(nextScale);
      setZoomOffset(prevOffset => ({
        x: centerX - (centerX - prevOffset.x) * factor,
        y: centerY - (centerY - prevOffset.y) * factor
      }));
    } catch (err) {
      console.error("Zoom out failed", err);
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      const newW = Math.max(300, Math.floor(width));
      const newH = Math.max(300, Math.floor(height));
      setDimensions(prev => {
        if (prev.width === newW && prev.height === newH) {
          return prev;
        }
        return { width: newW, height: newH };
      });
    });

    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Recenter automatically whenever dimensions, artboardW or artboardH change
  useEffect(() => {
    recenterCanvas();
  }, [dimensions, artboardW, artboardH]);

  const resolve360Object = (obj: VectorObject, objectsList: { [id: string]: VectorObject }): VectorObject => {
    if (obj.type !== '360_container') return obj;
    const rawViews = obj.views360 || [];
    if (rawViews.length === 0) return obj;

    // Sort views by angle to find upper and lower bounds
    const views = [...rawViews].sort((a, b) => a.angle - b.angle);
    const angle = ((obj.currentAngle360 ?? 0) % 360 + 360) % 360;

    let vLower = views[views.length - 1];
    let vUpper = views[0];

    for (let i = 0; i < views.length; i++) {
      if (views[i].angle <= angle) {
        vLower = views[i];
      }
    }
    for (let i = views.length - 1; i >= 0; i--) {
      if (views[i].angle >= angle) {
        vUpper = views[i];
      }
    }

    let angleDiff = vUpper.angle - vLower.angle;
    if (angleDiff < 0) angleDiff += 360;
    let currentDiff = angle - vLower.angle;
    if (currentDiff < 0) currentDiff += 360;

    const t = angleDiff === 0 ? 0 : currentDiff / angleDiff;

    const targetLower = objectsList[vLower.drawingId];
    const targetUpper = objectsList[vUpper.drawingId];
    const anchorDrawingId = views[0]?.drawingId;
    const anchorDrawing = objectsList[anchorDrawingId];

    if (!targetLower || !anchorDrawing) return obj;

    const targetDrawing = t > 0.5 && targetUpper ? targetUpper : targetLower;

    // Linear vertex interpolation if array lengths match
    let interpolatedPoints = targetLower.points;
    if (targetUpper && targetLower.points.length === targetUpper.points.length) {
      interpolatedPoints = targetLower.points.map((p, idx) => {
        const p2 = targetUpper.points[idx];
        return {
          ...p,
          x: p.x + (p2.x - p.x) * t,
          y: p.y + (p2.y - p.y) * t
        };
      });
    }

    let interpolatedSubPaths = targetLower.subPaths;
    if (targetUpper && targetLower.subPaths && targetUpper.subPaths && targetLower.subPaths.length === targetUpper.subPaths.length) {
      interpolatedSubPaths = targetLower.subPaths.map((subLower, sIdx) => {
        const subUpper = targetUpper.subPaths![sIdx];
        if (subLower.length === subUpper.length) {
          return subLower.map((p, pIdx) => {
            const p2 = subUpper[pIdx];
            return {
              ...p,
              x: p.x + (p2.x - p.x) * t,
              y: p.y + (p2.y - p.y) * t
            };
          });
        }
        return subLower;
      });
    }

    const boundsTarget = calculateBoundingBox(interpolatedPoints);
    const boundsAnchor = calculateBoundingBox(anchorDrawing.points);
    
    const txAnchor = anchorDrawing.transform.x;
    const tyAnchor = anchorDrawing.transform.y;
    const txTarget = targetUpper ? (targetLower.transform.x + (targetUpper.transform.x - targetLower.transform.x) * t) : targetLower.transform.x;
    const tyTarget = targetUpper ? (targetLower.transform.y + (targetUpper.transform.y - targetLower.transform.y) * t) : targetLower.transform.y;
    
    const canvasCXAnchor = (boundsAnchor.x + boundsAnchor.width / 2) + txAnchor;
    const canvasCYAnchor = (boundsAnchor.y + boundsAnchor.height / 2) + tyAnchor;
    const canvasCXTarget = (boundsTarget.x + boundsTarget.width / 2) + txTarget;
    const canvasCYTarget = (boundsTarget.y + boundsTarget.height / 2) + tyTarget;
    
    const dx = canvasCXAnchor - canvasCXTarget;
    const dy = canvasCYAnchor - canvasCYTarget;

    const alignedTransform = {
      ...targetDrawing.transform,
      x: obj.transform.x,
      y: obj.transform.y,
      rotation: obj.transform.rotation + (targetLower.transform.rotation + (targetUpper ? (targetUpper.transform.rotation - targetLower.transform.rotation) * t : 0) - anchorDrawing.transform.rotation),
      scaleX: obj.transform.scaleX * ((targetLower.transform.scaleX + (targetUpper ? (targetUpper.transform.scaleX - targetLower.transform.scaleX) * t : 0)) / anchorDrawing.transform.scaleX),
      scaleY: obj.transform.scaleY * ((targetLower.transform.scaleY + (targetUpper ? (targetUpper.transform.scaleY - targetLower.transform.scaleY) * t : 0)) / anchorDrawing.transform.scaleY),
    };

    const alignedPoints = interpolatedPoints.map(p => ({
      ...p,
      x: p.x + dx,
      y: p.y + dy
    }));

    const alignedSubPaths = interpolatedSubPaths?.map(sub => 
      sub.map(p => ({
        ...p,
        x: p.x + dx,
        y: p.y + dy
      }))
    );

    return {
      ...targetDrawing,
      transform: alignedTransform,
      points: alignedPoints,
      subPaths: alignedSubPaths,
      id: obj.id,
      name: obj.name,
      pivots: anchorDrawing.pivots && anchorDrawing.pivots.length > 0 ? anchorDrawing.pivots : obj.pivots,
    };
  };

  // Drawing state
  const [isDrawing, setIsPlayingState] = useState(false);
  const [strokePoints, setStrokePoints] = useState<Point[]>([]);
  const strokePointsRef = useRef<Point[]>([]);
  const [isDrawingLasso, setIsDrawingLasso] = useState(false);
  
  // Transform & drag gesture state
  const [dragMode, setDragMode] = useState<'none' | 'move' | 'rotate' | 'scale' | 'pivot' | 'pin' | 'meshPoint' | 'meshGridPoint' | 'puppetPin' | 'lassoControlPoint' | 'directRigBone' | 'zoom' | 'pan' | 'paintColor' | 'smartWarpPin'>('none');
  const [dragStartPoint, setDragStartPoint] = useState<Point>({ x: 0, y: 0 });
  const [initialTransform, setInitialTransform] = useState<any>(null);
  const [activeHandleIndex, setActiveHandleIndex] = useState<number | null>(null);
  const [draggedMeshPointIndex, setDraggedMeshPointIndex] = useState<number | null>(null);
  const [draggedDirectRigBoneId, setDraggedDirectRigBoneId] = useState<string | null>(null);
  
  // Selection anti-unselect 3-tap counter
  const [tapCount, setTapCount] = useState<number>(0);
  const [lastTapTime, setLastTapTime] = useState<number>(0);

  // Knife tool path state
  const [knifePath, setKnifePath] = useState<Point[]>([]);

  // Pen path creation state
  const [penPoints, setPenPoints] = useState<Point[]>([]);

  // Bone drawing state
  const [boneStartPoint, setBoneStartPoint] = useState<Point | null>(null);
  const [boneStartObject, setBoneStartObject] = useState<VectorObject | null>(null);
  const [boneStartPivot, setBoneStartPivot] = useState<Pivot | null>(null);
  const [snappedPivot, setSnappedPivot] = useState<{ objId: string; pivot: Pivot; worldX: number; worldY: number } | null>(null);
  const [elasticWarningId, setElasticWarningId] = useState<string | null>(null);
  const [currentCursorPos, setCurrentCursorPos] = useState<Point>({ x: 0, y: 0 });

  // 3D Bone and Vertex dragging states
  const [isDrawing3DBone, setIsDrawing3DBone] = useState(false);
  const [bone3DStartVtxIdx, setBone3DStartVtxIdx] = useState<number | null>(null);

  // Zoom & Pan Canvas states (100x zoom capability)
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [zoomOffset, setZoomOffset] = useState<Point>({ x: 0, y: 0 });

  // Touch screen multi-touch pinch gesture tracking refs
  const activePointersRef = useRef<{ [id: number]: Point }>({});
  const lastPinchDistRef = useRef<number>(0);
  const lastPinchMidRef = useRef<Point>({ x: 0, y: 0 });
  const dragStartScreenRef = useRef<Point>({ x: 0, y: 0 });
  const dragStartOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const lastPinchOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const lastPinchScaleRef = useRef<number>(1);
  const selectedObjInitialTransformRef = useRef<Transform | null>(null);

  // Get coordinates relative to canvas bounding box with zoom/pan applied
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = frontCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const appScale = (window as any).__appScale || 1;
    const screenX = (e.clientX - rect.left) / appScale;
    const screenY = (e.clientY - rect.top) / appScale;
    return {
      x: (screenX - zoomOffset.x) / zoomScale,
      y: (screenY - zoomOffset.y) / zoomScale,
    };
  };

  // Get all points of an object (including its subPaths)
  const getAllObjectPoints = (rawObj: VectorObject): Point[] => {
    const obj = resolve360Object(rawObj, objects);
    let all = [...obj.points];
    if (obj.subPaths && obj.subPaths.length > 0) {
      obj.subPaths.forEach(sub => {
        all = all.concat(sub);
      });
    }
    return all;
  };

  // Get all pivots from all active objects with their world coordinates
  const getAllPivotsWorld = () => {
    const list: { objId: string; pivot: Pivot; worldX: number; worldY: number }[] = [];
    Object.entries(objects).forEach(([objId, obj]) => {
      if (obj.isHidden) return;
      const p = obj.pivots[0] || { id: 'default', name: 'default', localX: 0, localY: 0, locked: false };
      const world = localToWorld({ x: p.localX, y: p.localY }, obj.transform, obj.pivots[0]);
      list.push({
        objId,
        pivot: p,
        worldX: world.x,
        worldY: world.y
      });
    });
    return list;
  };

  // Perform hit testing on any drawing path (including subPaths of merged drawings)
  const performHitTest = (coords: Point): VectorObject | null => {
    const activeObjects = Object.values(objects).filter(o => !o.isHidden);
    // Prioritize smaller objects or front objects (by rendering layer / creation time)
    const reversed = [...activeObjects].reverse();
    for (const rawObj of reversed) {
      const obj = resolve360Object(rawObj, objects);

      if (obj.type === '3d' && obj.vertices3D && obj.faces3D && obj.transform3D) {
        // Project all vertices
        const transformed3D = obj.vertices3D.map(v => transform3DVertex(v, obj.transform3D!.x, obj.transform3D!.y, obj.transform3D!.z, obj.transform3D!.rx, obj.transform3D!.ry, obj.transform3D!.rz, obj.transform3D!.sx, obj.transform3D!.sy, obj.transform3D!.sz));
        const projected = transformed3D.map(v => {
          const proj = project3DVertex(v, 400);
          return localToWorld(proj, obj.transform, obj.pivots[0] || { localX: 0, localY: 0 });
        });
        
        // Check all faces
        for (const face of obj.faces3D) {
          const poly = face.indices.map(idx => projected[idx]);
          if (isPointInPolygon(coords, poly)) {
            return rawObj; // Return the container/original object
          }
        }
        continue;
      }

      const pivot = obj.pivots[0] || { localX: 0, localY: 0 };
      
      // Hit test main points
      const worldPoints = obj.points.map(p => localToWorld(p, obj.transform, pivot));
      if (obj.fillColor && obj.fillColor !== 'transparent') {
        if (isPointInPolygon(coords, worldPoints)) {
          return rawObj; // Return the container/original object
        }
      }
      const dist = pointToPolylineDistance(coords, worldPoints);
      if (dist < 18) {
        return rawObj; // Return the container/original object
      }

      // Hit test sub-paths of merged drawings
      if (obj.subPaths && obj.subPaths.length > 0) {
        for (const sub of obj.subPaths) {
          const worldSubPoints = sub.map(p => localToWorld(p, obj.transform, pivot));
          if (obj.fillColor && obj.fillColor !== 'transparent') {
            if (isPointInPolygon(coords, worldSubPoints)) {
              return rawObj; // Return the container/original object
            }
          }
          const subDist = pointToPolylineDistance(coords, worldSubPoints);
          if (subDist < 18) {
            return rawObj; // Return the container/original object
          }
        }
      }
    }
    return null;
  };

  // Enforce locked bone rigid distance constraints!
  const enforceBoneConstraints = (updatedObjects: { [id: string]: VectorObject }) => {
    let resolved = true;
    for (let iter = 0; iter < 5; iter++) {
      for (const bone of bones) {
        const startObj = updatedObjects[bone.startObjectId];
        const endObj = updatedObjects[bone.endObjectId];
        if (!startObj || !endObj) continue;

        const startWorld = localToWorld({ x: bone.startLocalX, y: bone.startLocalY }, startObj.transform, startObj.pivots[0]);
        const endWorld = localToWorld({ x: bone.endLocalX, y: bone.endLocalY }, endObj.transform, endObj.pivots[0]);

        const dist = distance(startWorld, endWorld);
        // Force rigid non-detachable constraint under all circumstances to ensure solid connection
        if (Math.abs(dist - bone.lockedDistance) > 0.01) {
          const dx = endWorld.x - startWorld.x;
          const dy = endWorld.y - startWorld.y;
          const ratio = bone.lockedDistance / (dist || 1);
          
          const targetEndWorld = {
            x: startWorld.x + dx * ratio,
            y: startWorld.y + dy * ratio,
          };

          const worldDelta = {
            x: targetEndWorld.x - endWorld.x,
            y: targetEndWorld.y - endWorld.y,
          };

          endObj.transform = {
            ...endObj.transform,
            x: Number((endObj.transform.x + worldDelta.x).toFixed(2)),
            y: Number((endObj.transform.y + worldDelta.y).toFixed(2)),
          };
          resolved = false;
        }
      }
      if (resolved) break;
    }
  };

  // Recursively propagates transforms down the bone / parent-child hierarchy tree
  const propagateRigTransforms = (
    updatedObjects: { [id: string]: VectorObject },
    changedObjectId: string,
    deltaX: number,
    deltaY: number,
    deltaRot: number
  ) => {
    const parent = updatedObjects[changedObjectId];
    if (!parent) return;

    // Get child IDs from both:
    // 1. Direct parent-child hierarchy (child.parentId === parent.id)
    // 2. Bone connections (bone.startObjectId === parent.id)
    const directChildIds = Object.values(updatedObjects)
      .filter(o => o.parentId === changedObjectId)
      .map(o => o.id);
      
    const boneChildIds = bones
      .filter(b => b.startObjectId === changedObjectId)
      .map(b => b.endObjectId);

    // Union of all unique child IDs
    const uniqueChildIds = Array.from(new Set([...directChildIds, ...boneChildIds]));

    for (const childId of uniqueChildIds) {
      const child = updatedObjects[childId];
      if (!child) continue;

      // Find associated bone if any
      const bone = bones.find(b => b.startObjectId === changedObjectId && b.endObjectId === childId);

      // Determine rotation change
      const nextRotation = Number((child.transform.rotation + deltaRot).toFixed(2));
      
      // Apply basic translation & rotation
      child.transform = {
        ...child.transform,
        rotation: nextRotation,
        x: Number((child.transform.x + deltaX).toFixed(2)),
        y: Number((child.transform.y + deltaY).toFixed(2)),
      };

      // If the parent rotated, we should rotate the child's position around the parent's pivot/joint
      if (deltaRot !== 0) {
        let pJointLocal = { x: 0, y: 0 };
        if (bone) {
          pJointLocal = { x: bone.startLocalX, y: bone.startLocalY };
        } else if (parent.pivots && parent.pivots[0]) {
          pJointLocal = { x: parent.pivots[0].localX, y: parent.pivots[0].localY };
        }

        const parentJointWorld = localToWorld(
          pJointLocal,
          parent.transform,
          parent.pivots[0]
        );
        
        const childWorldPos = { x: child.transform.x, y: child.transform.y };
        const rotatedChildWorldPos = rotatePoint(childWorldPos, deltaRot, parentJointWorld);
        
        child.transform.x = Number(rotatedChildWorldPos.x.toFixed(2));
        child.transform.y = Number(rotatedChildWorldPos.y.toFixed(2));
      }

      // Enforce rigid joint connection: child joint must perfectly attach to parent joint
      const pJoint = localToWorld({ x: bone ? bone.startLocalX : 0, y: bone ? bone.startLocalY : 0 }, parent.transform, parent.pivots[0]);
      const cJoint = localToWorld({ x: bone ? bone.endLocalX : 0, y: bone ? bone.endLocalY : 0 }, child.transform, child.pivots[0]);
      
      const dx_joint = pJoint.x - cJoint.x;
      const dy_joint = pJoint.y - cJoint.y;

      child.transform.x = Number((child.transform.x + dx_joint).toFixed(2));
      child.transform.y = Number((child.transform.y + dy_joint).toFixed(2));

      // Recursively propagate to grandchild objects!
      propagateRigTransforms(updatedObjects, childId, deltaX, deltaY, deltaRot);
    }
    
    // Always enforce top-level strict skeletal constraints on final propagation output
    enforceBoneConstraints(updatedObjects);
  };

  // Generate 10 interactive handles for scaling, rotation, and pivot anchoring
  const getHandles = (obj: VectorObject) => {
    const box = calculateBoundingBox(getAllObjectPoints(obj));
    const pivot = (obj.pivots[0] || { id: 'default', name: 'default', localX: 0, localY: 0, locked: false }) as Pivot;
    
    const localHandles = [
      { type: 'scale', index: 0, x: box.x, y: box.y, cursor: 'nwse-resize' }, // Top-Left
      { type: 'scale', index: 1, x: box.x + box.width / 2, y: box.y, cursor: 'ns-resize' }, // Top-Center
      { type: 'scale', index: 2, x: box.x + box.width, y: box.y, cursor: 'nesw-resize' }, // Top-Right
      { type: 'scale', index: 3, x: box.x + box.width, y: box.y + box.height / 2, cursor: 'ew-resize' }, // Middle-Right
      { type: 'scale', index: 4, x: box.x + box.width, y: box.y + box.height, cursor: 'nwse-resize' }, // Bottom-Right
      { type: 'scale', index: 5, x: box.x + box.width / 2, y: box.y + box.height, cursor: 'ns-resize' }, // Bottom-Center
      { type: 'scale', index: 6, x: box.x, y: box.y + box.height, cursor: 'nesw-resize' }, // Bottom-Left
      { type: 'scale', index: 7, x: box.x, y: box.y + box.height / 2, cursor: 'ew-resize' }, // Middle-Left
      { type: 'rotate', index: 8, x: box.x + box.width / 2, y: box.y - 25, cursor: 'grab' }, // Rotation Handle
      { type: 'pivot', index: 9, x: pivot.localX, y: pivot.localY, cursor: 'move' } // Pivot Handle
    ];

    return localHandles.map(h => {
      const world = localToWorld({ x: h.x, y: h.y }, obj.transform, pivot);
      return {
        ...h,
        worldX: world.x,
        worldY: world.y
      };
    });
  };

  // Erase any drawing points under the mouse/pointer
  const erasePointsAt = (pt: Point) => {
    setObjects(prev => {
      const updated = { ...prev };
      let changed = false;
      
      Object.keys(updated).forEach(id => {
        const obj = updated[id];
        const filteredPoints = obj.points.filter(p => {
          const worldPt = localToWorld(p, obj.transform, obj.pivots[0]);
          return distance(worldPt, pt) > 20; // 20px eraser radius
        });

        if (filteredPoints.length !== obj.points.length) {
          changed = true;
          if (filteredPoints.length < 2) {
            delete updated[id];
          } else {
            updated[id] = {
              ...obj,
              points: filteredPoints
            };
          }
        }
      });

      if (changed) {
        return updated;
      }
      return prev;
    });
  };

  // Pointer Down event handler
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
    // Record active pointer
    activePointersRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    const pointerIds = Object.keys(activePointersRef.current);
    
    if (activeTool === 'ZOM') {
      if (pointerIds.length === 2) {
        const p1 = activePointersRef.current[Number(pointerIds[0])];
        const p2 = activePointersRef.current[Number(pointerIds[1])];
        
        const dist = distance(p1, p2);
        lastPinchDistRef.current = dist;
        lastPinchMidRef.current = {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2
        };
        lastPinchOffsetRef.current = { ...zoomOffset };
        lastPinchScaleRef.current = zoomScale;
        
        setDragMode('zoom');
      } else if (pointerIds.length === 1) {
        dragStartScreenRef.current = { x: e.clientX, y: e.clientY };
        dragStartOffsetRef.current = { ...zoomOffset };
        setDragMode('pan');
      }
      return;
    }

    if (pointerIds.length === 2) {
      if (activeTool === 'SEL') {
        const p1 = activePointersRef.current[Number(pointerIds[0])];
        const p2 = activePointersRef.current[Number(pointerIds[1])];
        const dist = distance(p1, p2);
        lastPinchDistRef.current = dist;

        if (selectedObjectId && objects[selectedObjectId]) {
          const obj = objects[selectedObjectId];
          selectedObjInitialTransformRef.current = { ...obj.transform };
          setDragMode('pinchScaleObj');
        } else {
          lastPinchMidRef.current = {
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
          };
          lastPinchOffsetRef.current = { ...zoomOffset };
          lastPinchScaleRef.current = zoomScale;
          setDragMode('zoom');
        }
      }
      return;
    }

    const coords = getCanvasCoords(e);
    setCurrentCursorPos(coords);

    // Check if we clicked on a Lasso Mesh Control Point!
    if (selectedObjectId && objects[selectedObjectId]) {
      const obj = objects[selectedObjectId];
      if (obj.lassoControlPoints && obj.lassoControlPoints.length > 0) {
        let clickedLcpIdx = -1;
        let minLcpDist = 14 / zoomScale;
        obj.lassoControlPoints.forEach((cp, idx) => {
          const worldPt = localToWorld({ x: cp.currentX, y: cp.currentY }, obj.transform, obj.pivots[0]);
          const d = distance(coords, worldPt);
          if (d < minLcpDist) {
            minLcpDist = d;
            clickedLcpIdx = idx;
          }
        });
        if (clickedLcpIdx !== -1) {
          setDragMode('lassoControlPoint');
          setDraggedMeshPointIndex(clickedLcpIdx);
          setDragStartPoint(coords);
          return;
        }
      }
    }

    // 1.5 Bone tool pointer down handler
    if (activeTool === 'BON') {
      if (selectedObjectId && objects[selectedObjectId]) {
        const obj = objects[selectedObjectId];
        if (obj.type === '3d' && obj.vertices3D && obj.transform3D) {
          // Check if we clicked on a 3D vertex first to start single 3D mesh skeletal rigging!
          const transformed3D = obj.vertices3D.map(v => transform3DVertex(v, obj.transform3D!.x, obj.transform3D!.y, obj.transform3D!.z, obj.transform3D!.rx, obj.transform3D!.ry, obj.transform3D!.rz, obj.transform3D!.sx, obj.transform3D!.sy, obj.transform3D!.sz));
          const projected = transformed3D.map(v => {
            const proj = project3DVertex(v, 400);
            return localToWorld(proj, obj.transform, obj.pivots[0] || { localX: 0, localY: 0 });
          });

          let clickedVtxIdx = -1;
          let minDist = 20; // pixels
          projected.forEach((pt, idx) => {
            const d = distance(coords, pt);
            if (d < minDist) {
              minDist = d;
              clickedVtxIdx = idx;
            }
          });

          if (clickedVtxIdx !== -1) {
            setIsDrawing3DBone(true);
            setBone3DStartVtxIdx(clickedVtxIdx);
            setCurrentCursorPos(coords);
            return;
          }
        }
      }

      // Fallback: draw standard inter-object bone linking pivots!
      const pList = getAllPivotsWorld();
      const clickedPivot = pList.find(item => distance(coords, { x: item.worldX, y: item.worldY }) < 15);
      if (clickedPivot) {
        setBoneStartPoint({ x: clickedPivot.worldX, y: clickedPivot.worldY });
        setBoneStartObject(objects[clickedPivot.objId]);
        setBoneStartPivot(clickedPivot.pivot);
        setSnappedPivot(null);
      } else {
        const clickedObj = performHitTest(coords);
        if (clickedObj) {
          setSelectedObjectId(clickedObj.id);
        }
      }
      return;
    }

    // 2. Add custom pivot point (PVT tool)
    if (activeTool === 'PVT' && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj) {
        const local = worldToLocal(coords, obj.transform, obj.pivots[0]);
        const newPivot: Pivot = {
          id: `pvt_${Date.now()}`,
          name: `Pivot_${obj.pivots.length + 1}`,
          localX: Number(local.x.toFixed(2)),
          localY: Number(local.y.toFixed(2)),
          locked: false,
        };
        updateObjectProperties(obj.id, { pivots: [newPivot, ...obj.pivots] });
        historyPush();
      }
      return;
    }

    // 3. Add puppet pin (PIN tool)
    if (activeTool === 'PIN' && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj) {
        // First check if we clicked on an existing pin to drag it!
        if (obj.pins && obj.pins.length > 0) {
          let clickedPinIndex = -1;
          let minPinDist = 14;
          obj.pins.forEach((pin, idx) => {
            const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
            const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
            const worldPin = localToWorld({ x: curX, y: curY }, obj.transform, obj.pivots[0]);
            const d = distance(coords, worldPin);
            if (d < minPinDist) {
              minPinDist = d;
              clickedPinIndex = idx;
            }
          });
          if (clickedPinIndex !== -1) {
            setDragMode('puppetPin');
            setDraggedMeshPointIndex(clickedPinIndex);
            setDragStartPoint(coords);
            return;
          }
        }

        // Otherwise, add a new puppet pin
        const local = worldToLocal(coords, obj.transform, obj.pivots[0]);
        const newPin: Pivot = {
          id: `pin_${Date.now()}`,
          name: `Pin_${(obj.pins || []).length + 1}`,
          localX: Number(local.x.toFixed(2)),
          localY: Number(local.y.toFixed(2)),
          locked: false,
          isActive: true,
        };
        const currentPins = obj.pins || [];
        updateObjectProperties(obj.id, { pins: [...currentPins, newPin] });
        historyPush();
      }
      return;
    }

    // 4. Knife slicing tool logic
    if (activeTool === 'KNF') {
      if (selectedObjectId) {
        setKnifePath([coords]);
        setDragMode('pivot');
      }
      return;
    }

    // Lasso Selection tool pointer down
    if (activeTool === 'LSO') {
      if (lassoMode === 'freehand') {
        setIsDrawingLasso(true);
        setLassoPoints([coords]);
      } else {
        // Pen Selection Mode
        // If double click (e.detail === 2) and we have enough points, close it!
        if (e.detail === 2 && penLassoPoints.length >= 3) {
          setLassoPoints([...penLassoPoints]);
          setPenLassoPoints([]);
          return;
        }

        if (penLassoPoints.length > 0) {
          const firstPt = penLassoPoints[0];
          const dist = distance(coords, firstPt);
          const threshold = 15 / zoomScale;
          if (dist < threshold) {
            // Close loop
            if (penLassoPoints.length >= 3) {
              setLassoPoints([...penLassoPoints]);
              setPenLassoPoints([]);
            }
            return;
          }
        }
        setPenLassoPoints(prev => [...prev, coords]);
      }
      return;
    }

    // 5. Vector Pen Tool creation logic
    if (activeTool === 'PEN') {
      if (penPoints.length > 0 && distance(coords, penPoints[0]) < 12) {
        if (penPoints.length >= 3) {
          const newId = `obj_${Date.now()}`;
          const name = `PenPath_${Object.keys(objects).length + 1}`;
          const newObj: VectorObject = {
            id: newId,
            name,
            type: 'shape',
            shapeType: 'rectangle',
            points: [...penPoints, penPoints[0]],
            strokeColor: '#E53935',
            strokeWidth: 3.5,
            fillColor: 'transparent',
            opacity: 1,
            transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
            pivots: [{ id: `pvt_${Date.now()}`, name: 'Pivot_1', localX: penPoints[0].x, localY: penPoints[0].y, locked: false }],
            parentId: null,
            childrenIds: [],
            layerId: activeLayerId,
            isLocked: false,
            isHidden: false,
          };
          setObjects(prev => ({ ...prev, [newId]: newObj }));
          setSelectedObjectId(newId);
          historyPush();
        }
        setPenPoints([]);
      } else {
        setPenPoints(prev => [...prev, coords]);
      }
      return;
    }

    // 6. Shapes Tool logic
    if (activeTool === 'SHP') {
      setIsPlayingState(true);
      setDragStartPoint(coords);
      return;
    }

    // 7. Eraser Tool logic
    if (activeTool === 'ERS') {
      setIsPlayingState(true);
      erasePointsAt(coords);
      return;
    }

    // 8. Fill Bucket Tool logic
    if (activeTool === 'FIL') {
      try {
        const clickedObj = performHitTest(coords);
        if (clickedObj) {
          // Only allow filling on currently selected drawings, strictly as requested!
          if (selectedObjectId === clickedObj.id) {
            if (clickedObj.type === '3d' && clickedObj.vertices3D && clickedObj.faces3D && clickedObj.transform3D) {
              const transformed3D = clickedObj.vertices3D.map(v => transform3DVertex(v, clickedObj.transform3D!.x, clickedObj.transform3D!.y, clickedObj.transform3D!.z, clickedObj.transform3D!.rx, clickedObj.transform3D!.ry, clickedObj.transform3D!.rz, clickedObj.transform3D!.sx, clickedObj.transform3D!.sy, clickedObj.transform3D!.sz));
              const projected = transformed3D.map(v => {
                const proj = project3DVertex(v, 400);
                return localToWorld(proj, clickedObj.transform, clickedObj.pivots[0] || { localX: 0, localY: 0 });
              });

              const matchedFaces: { idx: number; avgZ: number }[] = [];
              clickedObj.faces3D.forEach((face, idx) => {
                const poly = face.indices.map(i => projected[i]);
                if (isPointInPolygon(coords, poly)) {
                  let sumZ = 0;
                  face.indices.forEach(i => {
                    sumZ += transformed3D[i].z;
                  });
                  const avgZ = sumZ / face.indices.length;
                  matchedFaces.push({ idx, avgZ });
                }
              });

              if (matchedFaces.length > 0) {
                matchedFaces.sort((a, b) => a.avgZ - b.avgZ);
                const targetFaceIdx = matchedFaces[0].idx;
                const paintColor = fillToolColor;

                setObjects(prev => {
                  const updatedObj = { ...prev[clickedObj.id] };
                  const updatedFaces = [...(updatedObj.faces3D || [])];
                  updatedFaces[targetFaceIdx] = {
                    ...updatedFaces[targetFaceIdx],
                    baseColor: paintColor,
                    fillColor: paintColor
                  };
                  updatedObj.faces3D = updatedFaces;
                  updatedObj.selectedFaceIndex = targetFaceIdx;
                  return {
                    ...prev,
                    [clickedObj.id]: updatedObj
                  };
                });
                historyPush();
              }
            } else {
              // Check if path is closed
              const isPathClosedLocal = (obj: VectorObject): boolean => {
                if (obj.type === 'shape') return true;
                if (!obj.points || obj.points.length < 3) return false;
                const first = obj.points[0];
                const last = obj.points[obj.points.length - 1];
                const dx = first.x - last.x;
                const dy = first.y - last.y;
                return Math.sqrt(dx * dx + dy * dy) < 15;
              };

              const isClosed = isPathClosedLocal(clickedObj);
              setObjects(prev => ({
                ...prev,
                [clickedObj.id]: {
                  ...prev[clickedObj.id],
                  fillColor: isClosed ? fillToolColor : prev[clickedObj.id].fillColor,
                  strokeColor: !isClosed ? fillToolColor : prev[clickedObj.id].strokeColor
                }
              }));
              historyPush();
            }
          } else {
            // Select clicked object first
            setSelectedObjectId(clickedObj.id);
          }
        }
      } catch (err: any) {
        console.error("Fill tool error:", err);
        alert(`Failed to apply color fill: ${err.message || err}`);
      }
      return;
    }

    // 9. Eyedropper Tool logic
    if (activeTool === 'EYE') {
      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        alert(`Sampled Color -> Stroke: ${clickedObj.strokeColor}, Fill: ${clickedObj.fillColor}`);
      }
      return;
    }

    // 9.5. Geometry Deform Mesh Tool logic
    if (activeTool === 'MSH') {
      if (selectedObjectId && objects[selectedObjectId]) {
        const obj = objects[selectedObjectId];

        // If the object is a 3D model, handle 3D vertex selection
        if (obj.type === '3d' && obj.vertices3D && obj.transform3D) {
          const transformed3D = obj.vertices3D.map(v => transform3DVertex(v, obj.transform3D!.x, obj.transform3D!.y, obj.transform3D!.z, obj.transform3D!.rx, obj.transform3D!.ry, obj.transform3D!.rz, obj.transform3D!.sx, obj.transform3D!.sy, obj.transform3D!.sz));
          const projected = transformed3D.map(v => {
            const proj = project3DVertex(v, 400);
            return localToWorld(proj, obj.transform, obj.pivots[0] || { localX: 0, localY: 0 });
          });

          let clickedVtxIdx = -1;
          let minDist = 20; // pixels
          projected.forEach((pt, idx) => {
            const d = distance(coords, pt);
            if (d < minDist) {
              minDist = d;
              clickedVtxIdx = idx;
            }
          });

          if (clickedVtxIdx !== -1) {
            setDragMode('meshPoint');
            setDraggedMeshPointIndex(clickedVtxIdx);
            setDragStartPoint(coords);
            if (setSelectedDeformPointIndex && setSelectedDeformPointType && setOriginalDeformPointCoords && setDeformPointTransform) {
              setSelectedDeformPointIndex(clickedVtxIdx);
              setSelectedDeformPointType('3d');
              setOriginalDeformPointCoords({
                x: obj.vertices3D[clickedVtxIdx].x,
                y: obj.vertices3D[clickedVtxIdx].y,
                z: obj.vertices3D[clickedVtxIdx].z
              });
              setDeformPointTransform({
                x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0, cameraAngleX: 0, cameraAngleY: 0
              });
            }
            return;
          }
        }
        
        // 1. If mesh wrap grid is active, prioritize dragging mesh grid control points!
        else if (obj.meshState && obj.meshState.active) {
          let clickedMptIndex = -1;
          let minMptDist = 14; // Pixels threshold in world space
          obj.meshState.points.forEach((mpt, idx) => {
            const worldPt = localToWorld({ x: mpt.currentX, y: mpt.currentY }, obj.transform, obj.pivots[0]);
            const d = distance(coords, worldPt);
            if (d < minMptDist) {
              minMptDist = d;
              clickedMptIndex = idx;
            }
          });
          if (clickedMptIndex !== -1) {
            setDragMode('meshGridPoint');
            setDraggedMeshPointIndex(clickedMptIndex);
            setDragStartPoint(coords);
            if (setSelectedDeformPointIndex && setSelectedDeformPointType && setOriginalDeformPointCoords && setDeformPointTransform) {
              setSelectedDeformPointIndex(clickedMptIndex);
              setSelectedDeformPointType('grid');
              setOriginalDeformPointCoords({
                x: obj.meshState.points[clickedMptIndex].currentX,
                y: obj.meshState.points[clickedMptIndex].currentY
              });
              setDeformPointTransform({
                x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0, cameraAngleX: 0, cameraAngleY: 0
              });
            }
            return;
          }
        } else {
          // 2. Otherwise, check for standard drawing outline points dragging
          let clickedPointIndex = -1;
          let minPtDist = 14; // Pixels threshold in world space

          obj.points.forEach((pt, idx) => {
            const worldPt = localToWorld(pt, obj.transform, obj.pivots[0]);
            const d = distance(coords, worldPt);
            if (d < minPtDist) {
              minPtDist = d;
              clickedPointIndex = idx;
            }
          });

          if (clickedPointIndex !== -1) {
            setDragMode('meshPoint');
            setDraggedMeshPointIndex(clickedPointIndex);
            setDragStartPoint(coords);
            if (setSelectedDeformPointIndex && setSelectedDeformPointType && setOriginalDeformPointCoords && setDeformPointTransform) {
              setSelectedDeformPointIndex(clickedPointIndex);
              setSelectedDeformPointType('standard');
              setOriginalDeformPointCoords({
                x: obj.points[clickedPointIndex].x,
                y: obj.points[clickedPointIndex].y
              });
              setDeformPointTransform({
                x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0, cameraAngleX: 0, cameraAngleY: 0
              });
            }
            return;
          }
        }
      }

      // If we didn't drag any mesh point, select drawing
      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        setSelectedObjectId(clickedObj.id);
      }
      return;
    }

    // MCL (Mesh Coloring) tool pointer down logic
    if (activeTool === 'MCL') {
      if (selectedObjectId && objects[selectedObjectId]) {
        const obj = objects[selectedObjectId];
        if (obj.smartMeshColor) {
          setIsPlayingState(true); // set flag to indicate active painting
          setDragMode('paintColor');
          // Paint immediately at first click
          paintColorAt(coords, obj);
          return;
        }
      }
      // If we didn't paint, check if clicking another object
      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        setSelectedObjectId(clickedObj.id);
      }
      return;
    }

    // SWP (Smart Warp Pin) tool pointer down logic
    if (activeTool === 'SWP') {
      if (selectedObjectId && objects[selectedObjectId]) {
        const obj = objects[selectedObjectId];
        if (obj.smartWarp) {
          // 1. Check if we clicked on an existing smart warp pin to drag it!
          let clickedPinIdx = -1;
          let minPinDist = obj.smartWarp.pinSize || 30;
          obj.smartWarp.pins.forEach((pin, idx) => {
            const worldPin = localToWorld({ x: pin.currentX, y: pin.currentY }, obj.transform, obj.pivots[0]);
            const d = distance(coords, worldPin);
            if (d < minPinDist) {
              minPinDist = d;
              clickedPinIdx = idx;
            }
          });

          if (clickedPinIdx !== -1) {
            setDragMode('smartWarpPin');
            setDraggedMeshPointIndex(clickedPinIdx);
            setDragStartPoint(coords);
            return;
          }

          // 2. Otherwise, check if we clicked on the drawing to add a new pin!
          const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
          const newPin: SmartWarpPin = {
            id: `swp_pin_${Date.now()}`,
            originalX: Number(localPos.x.toFixed(2)),
            originalY: Number(localPos.y.toFixed(2)),
            currentX: Number(localPos.x.toFixed(2)),
            currentY: Number(localPos.y.toFixed(2)),
            locked: false,
            size: obj.smartWarp.pinSize || 16,
            color: '#0EA5E9',
            influenceRadius: obj.smartWarp.influenceRadius || 120,
            influenceFalloff: obj.smartWarp.influenceFalloff || 'smooth'
          };

          const updatedPins = [...(obj.smartWarp.pins || []), newPin];
          setObjects(prev => {
            const curObj = prev[selectedObjectId];
            if (!curObj) return prev;
            return {
              ...prev,
              [selectedObjectId]: {
                ...curObj,
                smartWarp: {
                  ...curObj.smartWarp!,
                  pins: updatedPins
                }
              }
            };
          });
          historyPush();
          return;
        }
      }
      // If we clicked outside, select another drawing
      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        setSelectedObjectId(clickedObj.id);
      }
      return;
    }

    // 10. Select & Transform Logic
    if (activeTool === 'SEL') {
      if (selectedObjectId) {
        const obj = objects[selectedObjectId];
        if (obj) {
          // Direct Rig bone joint clicking removed.

          // Check if we clicked on a puppet pin first!
          if (obj.pins && obj.pins.length > 0) {
            let clickedPinIdx = -1;
            let minPinDist = 14;
            obj.pins.forEach((pin, idx) => {
              const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
              const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
              const worldPin = localToWorld({ x: curX, y: curY }, obj.transform, obj.pivots[0]);
              const d = distance(coords, worldPin);
              if (d < minPinDist) {
                minPinDist = d;
                clickedPinIdx = idx;
              }
            });
            if (clickedPinIdx !== -1) {
              setDragMode('puppetPin');
              setDraggedMeshPointIndex(clickedPinIdx);
              setDragStartPoint(coords);
              return;
            }
          }

          const handles = getHandles(obj);
          const clickedHandle = handles.find(h => distance(coords, { x: h.worldX, y: h.worldY }) < 12);
          
          if (clickedHandle) {
            if (clickedHandle.type === 'scale') {
              setDragMode('scale');
              setActiveHandleIndex(clickedHandle.index);
            } else if (clickedHandle.type === 'rotate') {
              setDragMode('rotate');
              setActiveHandleIndex(8);
            } else if (clickedHandle.type === 'pivot') {
              setDragMode('pivot');
              setActiveHandleIndex(9);
            }
            setDragStartPoint(coords);
            setInitialTransform({ ...obj.transform });
            return;
          }
        }
      }

      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        setSelectedObjectId(clickedObj.id);
        setDragMode('move');
        setDragStartPoint(coords);
        setInitialTransform({ ...clickedObj.transform });
      } else {
        // Prevent canvas shifting, but preserve active selection per guidelines
        setDragMode('none');
      }
      return;
    }

    // 10.5 3D Proxy Model Tool Logic
    if (activeTool === '3D') {
      const clickedObj = performHitTest(coords);
      if (clickedObj && clickedObj.type === '3d') {
        setSelectedObjectId(clickedObj.id);
        setDragMode('rotate3D' as any);
        setDragStartPoint(coords);
        setInitialTransform({
          rx: clickedObj.transform3D?.rx ?? 0,
          ry: clickedObj.transform3D?.ry ?? 0,
          rz: clickedObj.transform3D?.rz ?? 0,
          x: clickedObj.transform.x,
          y: clickedObj.transform.y,
        });
      } else {
        setDragMode('none');
      }
      return;
    }

    // 11. Vector brush drawing logic
    if (activeTool === 'BRS') {
      setIsPlayingState(true);
      const startPt = createRealismPoint(coords, null, realismSettings);
      strokePointsRef.current = [startPt];
      setStrokePoints([startPt]);
      return;
    }
    } catch (err: any) {
      console.error("Pointer down handler failed:", err);
    }
  };

  // Pointer Move event handler
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
    // Update active pointer tracking coordinate
    if (activePointersRef.current[e.pointerId]) {
      activePointersRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    }

    const coords = getCanvasCoords(e);
    setCurrentCursorPos(coords);

    if (activeTool === 'SEL') {
      const pointerIds = Object.keys(activePointersRef.current);
      if (dragMode === 'pinchScaleObj' && pointerIds.length === 2 && selectedObjectId) {
        const p1 = activePointersRef.current[Number(pointerIds[0])];
        const p2 = activePointersRef.current[Number(pointerIds[1])];
        const dist = distance(p1, p2);
        if (lastPinchDistRef.current > 0 && selectedObjInitialTransformRef.current) {
          const ratio = dist / lastPinchDistRef.current;
          let scaleX = Number((selectedObjInitialTransformRef.current.scaleX * ratio).toFixed(4));
          let scaleY = Number((selectedObjInitialTransformRef.current.scaleY * ratio).toFixed(4));
          
          scaleX = Math.min(20.0, Math.max(0.05, scaleX));
          scaleY = Math.min(20.0, Math.max(0.05, scaleY));
          
          const obj = objects[selectedObjectId];
          if (obj) {
            if (obj.parentId && objects[obj.parentId]) {
              const parent = objects[obj.parentId];
              const isParentClosed = parent.type === 'shape' && parent.shapeType !== 'line';
              if (isParentClosed) {
                const testTransform = { ...obj.transform, scaleX, scaleY };
                if (!isChildInsideParent(obj, parent, testTransform, objects)) {
                  scaleX = obj.transform.scaleX;
                  scaleY = obj.transform.scaleY;
                }
              }
            }
            
            setObjects(prev => {
              if (!prev[selectedObjectId]) return prev;
              const updated = { ...prev };
              updated[selectedObjectId] = {
                ...updated[selectedObjectId],
                transform: {
                  ...updated[selectedObjectId].transform,
                  scaleX,
                  scaleY
                }
              };
              return updated;
            });
          }
        }
        return;
      }
      
      if (dragMode === 'zoom' && pointerIds.length === 2) {
        const p1 = activePointersRef.current[Number(pointerIds[0])];
        const p2 = activePointersRef.current[Number(pointerIds[1])];
        const dist = distance(p1, p2);
        if (lastPinchDistRef.current > 0) {
          const scaleChange = dist / lastPinchDistRef.current;
          let nextScale = lastPinchScaleRef.current * scaleChange;
          
          nextScale = Math.min(10.0, Math.max(0.15, nextScale));
          
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          
          const canvas = frontCanvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const appScale = (window as any).__appScale || 1;
            const midCanvasX = (midX - rect.left) / appScale;
            const midCanvasY = (midY - rect.top) / appScale;
            
            const worldX = (midCanvasX - lastPinchOffsetRef.current.x) / lastPinchScaleRef.current;
            const worldY = (midCanvasY - lastPinchOffsetRef.current.y) / lastPinchScaleRef.current;
            
            const nextOffsetX = midCanvasX - worldX * nextScale;
            const nextOffsetY = midCanvasY - worldY * nextScale;
            
            setZoomScale(nextScale);
            setZoomOffset({ x: nextOffsetX, y: nextOffsetY });
          }
        }
        return;
      }
    }

    if (activeTool === 'ZOM') {
      const pointerIds = Object.keys(activePointersRef.current);
      if (dragMode === 'zoom' && pointerIds.length === 2) {
        const p1 = activePointersRef.current[Number(pointerIds[0])];
        const p2 = activePointersRef.current[Number(pointerIds[1])];
        
        const dist = distance(p1, p2);
        if (lastPinchDistRef.current > 0) {
          const scaleChange = dist / lastPinchDistRef.current;
          let nextScale = lastPinchScaleRef.current * scaleChange;
          
          // Clamp scale to standard limits
          nextScale = Math.min(10.0, Math.max(0.15, nextScale));
          
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          
          const canvas = frontCanvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const appScale = (window as any).__appScale || 1;
            const midCanvasX = (midX - rect.left) / appScale;
            const midCanvasY = (midY - rect.top) / appScale;
            
            const worldX = (midCanvasX - lastPinchOffsetRef.current.x) / lastPinchScaleRef.current;
            const worldY = (midCanvasY - lastPinchOffsetRef.current.y) / lastPinchScaleRef.current;
            
            const nextOffsetX = midCanvasX - worldX * nextScale;
            const nextOffsetY = midCanvasY - worldY * nextScale;
            
            setZoomScale(nextScale);
            setZoomOffset({ x: nextOffsetX, y: nextOffsetY });
          }
        }
      } else if (dragMode === 'pan' && pointerIds.length === 1) {
        const appScale = (window as any).__appScale || 1;
        const dx = (e.clientX - dragStartScreenRef.current.x) / appScale;
        const dy = (e.clientY - dragStartScreenRef.current.y) / appScale;
        
        setZoomOffset({
          x: dragStartOffsetRef.current.x + dx,
          y: dragStartOffsetRef.current.y + dy
        });
      }
      return;
    }

    // directRigBone dragging handler removed.

    if (dragMode === 'meshGridPoint' && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj && obj.meshState && obj.meshState.active) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId]) return prev;
          const updatedMeshStatePoints = [...prev[selectedObjectId].meshState!.points];
          if (updatedMeshStatePoints[draggedMeshPointIndex]) {
            updatedMeshStatePoints[draggedMeshPointIndex] = {
              ...updatedMeshStatePoints[draggedMeshPointIndex],
              currentX: Number(localPos.x.toFixed(2)),
              currentY: Number(localPos.y.toFixed(2))
            };
          }
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              meshState: {
                ...prev[selectedObjectId].meshState!,
                points: updatedMeshStatePoints
              }
            }
          };
        });
      }
      return;
    }

    if (dragMode === 'puppetPin' && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId]) return prev;
          const updatedPins = [...(prev[selectedObjectId].pins || [])];
          if (updatedPins[draggedMeshPointIndex]) {
            updatedPins[draggedMeshPointIndex] = {
              ...updatedPins[draggedMeshPointIndex],
              currentLocalX: Number(localPos.x.toFixed(2)),
              currentLocalY: Number(localPos.y.toFixed(2))
            };
          }
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              pins: updatedPins
            }
          };
        });
      }
      return;
    }

    if (dragMode === 'lassoControlPoint' && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj && obj.lassoControlPoints) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId]) return prev;
          const updatedLcp = [...(prev[selectedObjectId].lassoControlPoints || [])];
          if (updatedLcp[draggedMeshPointIndex]) {
            updatedLcp[draggedMeshPointIndex] = {
              ...updatedLcp[draggedMeshPointIndex],
              currentX: Number(localPos.x.toFixed(2)),
              currentY: Number(localPos.y.toFixed(2))
            };
          }
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              lassoControlPoints: updatedLcp
            }
          };
        });
      }
      return;
    }

    if (dragMode === 'paintColor' && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj && obj.smartMeshColor) {
        paintColorAt(coords, obj);
      }
      return;
    }

    if (dragMode === 'smartWarpPin' && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj && obj.smartWarp) {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        setObjects(prev => {
          if (!prev[selectedObjectId]) return prev;
          const sw = prev[selectedObjectId].smartWarp;
          if (!sw) return prev;
          const updatedPins = [...sw.pins];
          if (updatedPins[draggedMeshPointIndex]) {
            updatedPins[draggedMeshPointIndex] = {
              ...updatedPins[draggedMeshPointIndex],
              currentX: Number(localPos.x.toFixed(2)),
              currentY: Number(localPos.y.toFixed(2))
            };
          }
          return {
            ...prev,
            [selectedObjectId]: {
              ...prev[selectedObjectId],
              smartWarp: {
                ...sw,
                pins: updatedPins
              }
            }
          };
        });
      }
      return;
    }

    if (dragMode === ('rotate3D' as any) && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj && obj.type === '3d' && obj.transform3D) {
        const dx = coords.x - dragStartPoint.x;
        const dy = coords.y - dragStartPoint.y;
        
        const nextRy = (initialTransform.ry + dx * 0.7) % 360;
        const nextRx = (initialTransform.rx - dy * 0.7) % 360;
        
        setObjects(prev => ({
          ...prev,
          [selectedObjectId]: {
            ...prev[selectedObjectId],
            transform3D: {
              ...prev[selectedObjectId].transform3D!,
              ry: Math.round(nextRy),
              rx: Math.round(nextRx)
            }
          }
        }));
      }
      return;
    }

    if (dragMode === 'meshPoint' && selectedObjectId && draggedMeshPointIndex !== null) {
      const obj = objects[selectedObjectId];
      if (obj) {
        if (obj.type === '3d' && obj.vertices3D) {
          // Deform 3D vertex coordinate!
          // Calculate movement delta in canvas coordinates
          const dx = coords.x - currentCursorPos.x;
          const dy = coords.y - currentCursorPos.y;
          
          setObjects(prev => {
            if (!prev[selectedObjectId]) return prev;
            const updatedVtx = [...(prev[selectedObjectId].vertices3D || [])];
            if (updatedVtx[draggedMeshPointIndex]) {
              const scaleFactor = 1.0 / (obj.transform3D?.sx || 1.0);
              const P_curr = {
                x: Number((updatedVtx[draggedMeshPointIndex].x + dx * scaleFactor).toFixed(2)),
                y: Number((updatedVtx[draggedMeshPointIndex].y + dy * scaleFactor).toFixed(2)),
                z: updatedVtx[draggedMeshPointIndex].z
              };
              updatedVtx[draggedMeshPointIndex] = P_curr;

              return {
                ...prev,
                [selectedObjectId]: {
                  ...prev[selectedObjectId],
                  vertices3D: updatedVtx
                }
              };
            }
            return prev;
          });
        } else {
          const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
          setObjects(prev => {
            if (!prev[selectedObjectId]) return prev;
            const updatedPoints = [...prev[selectedObjectId].points];
            const P_curr = {
              x: Number(localPos.x.toFixed(2)),
              y: Number(localPos.y.toFixed(2))
            };
            updatedPoints[draggedMeshPointIndex] = P_curr;

            // --- Adaptive Subdivision for 2D Drawings ---
            // If an edge exceeds 55.0 pixels, dynamically split it and insert new points!
            const N = updatedPoints.length;
            const THRESHOLD_2D = 55.0;
            let finalPoints = [...updatedPoints];
            let nextDraggedIndex = draggedMeshPointIndex;

            if (adaptiveSubdivisionEnabled && N >= 2) {
              const numPoints = Math.min(adaptiveSubdivisionPoints, 3); // strictly 1 to 3
              const leftIdx = (draggedMeshPointIndex - 1 + N) % N;
              const rightIdx = (draggedMeshPointIndex + 1) % N;

              const P_left = updatedPoints[leftIdx];
              const P_right = updatedPoints[rightIdx];

              const distLeft = distance(P_curr, P_left);

              // 1. Check Left Edge
              if (distLeft > THRESHOLD_2D) {
                const newPoints: { x: number, y: number }[] = [];
                for (let k = 1; k <= numPoints; k++) {
                  const t = k / (numPoints + 1);
                  newPoints.push({
                    x: Number((P_left.x * (1 - t) + P_curr.x * t).toFixed(2)),
                    y: Number((P_left.y * (1 - t) + P_curr.y * t).toFixed(2))
                  });
                }

                if (leftIdx === N - 1 && draggedMeshPointIndex === 0) {
                  finalPoints.push(...newPoints);
                } else {
                  finalPoints.splice(draggedMeshPointIndex, 0, ...newPoints);
                  nextDraggedIndex += numPoints;
                }
              }

              // 2. Check Right Edge
              const N2 = finalPoints.length;
              const currentP = finalPoints[nextDraggedIndex];
              const curRightIdx = (nextDraggedIndex + 1) % N2;
              const P_curRight = finalPoints[curRightIdx];
              const distRightSec = distance(currentP, P_curRight);

              if (distRightSec > THRESHOLD_2D) {
                const newPoints: { x: number, y: number }[] = [];
                for (let k = 1; k <= numPoints; k++) {
                  const t = k / (numPoints + 1);
                  newPoints.push({
                    x: Number((currentP.x * (1 - t) + P_curRight.x * t).toFixed(2)),
                    y: Number((currentP.y * (1 - t) + P_curRight.y * t).toFixed(2))
                  });
                }

                if (nextDraggedIndex === N2 - 1 && curRightIdx === 0) {
                  finalPoints.push(...newPoints);
                } else {
                  finalPoints.splice(nextDraggedIndex + 1, 0, ...newPoints);
                }
              }
            }

            if (nextDraggedIndex !== draggedMeshPointIndex) {
              setTimeout(() => setDraggedMeshPointIndex(nextDraggedIndex), 0);
            }

            return {
              ...prev,
              [selectedObjectId]: {
                ...prev[selectedObjectId],
                points: finalPoints
              }
            };
          });
        }
      }
      return;
    }

    if (activeTool === 'BON' && boneStartPoint) {
      const pList = getAllPivotsWorld();
      const nearPivot = pList.find(item => item.objId !== boneStartObject?.id && distance(coords, { x: item.worldX, y: item.worldY }) < 15);
      if (nearPivot) {
        setSnappedPivot(nearPivot);
        setCurrentCursorPos({ x: nearPivot.worldX, y: nearPivot.worldY });
      } else {
        setSnappedPivot(null);
        setCurrentCursorPos(coords);
      }
      return;
    }

    if (isDrawing && activeTool === 'BRS') {
      const lastPt = strokePointsRef.current[strokePointsRef.current.length - 1] || null;
      const nextPt = createRealismPoint(coords, lastPt, realismSettings);
      strokePointsRef.current.push(nextPt);
      setStrokePoints([...strokePointsRef.current]);

      // Direct canvas context paint for 0ms lag!
      const canvas = frontCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.save();
          // Align with active zoom & pan settings
          ctx.translate(zoomOffset.x, zoomOffset.y);
          ctx.scale(zoomScale, zoomScale);

          // Configure active brush context style
          applyBrushSettingsToCtx(ctx, brushSettings || {}, brushSettings?.strokeColor ?? '#000000', brushSettings?.strokeWidth ?? 5);

          ctx.beginPath();
          if (lastPt) {
            ctx.moveTo(lastPt.x, lastPt.y);
            ctx.lineTo(nextPt.x, nextPt.y);
          } else {
            ctx.arc(nextPt.x, nextPt.y, (brushSettings?.strokeWidth ?? 5) / 2, 0, Math.PI * 2);
          }

          ctx.strokeStyle = brushSettings?.strokeColor ?? '#000000';
          ctx.lineWidth = brushSettings?.strokeWidth ?? 5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          if (lastPt) {
            ctx.stroke();
          } else {
            ctx.fillStyle = brushSettings?.strokeColor ?? '#000000';
            ctx.fill();
          }

          ctx.restore();
        }
      }
      return;
    }

    if (isDrawingLasso && activeTool === 'LSO') {
      setLassoPoints(prev => [...prev, coords]);
      return;
    }

    if (isDrawing && activeTool === 'ERS') {
      erasePointsAt(coords);
      return;
    }

    if (selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (!obj) return;

      if (dragMode === 'move') {
        const dx = coords.x - dragStartPoint.x;
        const dy = coords.y - dragStartPoint.y;

        let nextX = Number((initialTransform.x + dx).toFixed(2));
        let nextY = Number((initialTransform.y + dy).toFixed(2));

        if (obj.parentId && objects[obj.parentId]) {
          const parent = objects[obj.parentId];
          const bone = bones.find(b => (b.startObjectId === obj.parentId && b.endObjectId === obj.id) || (b.startObjectId === obj.id && b.endObjectId === obj.parentId));
          
          const parentPivot = parent.pivots[0] || { localX: 0, localY: 0 };
          const parentPivotWorld = {
            x: parent.transform.x + parentPivot.localX,
            y: parent.transform.y + parentPivot.localY
          };

          const currentDist = distance({ x: nextX, y: nextY }, parentPivotWorld);
          const restLength = bone ? bone.lockedDistance : 120;
          const maxDistance = restLength * 1.5;

          if (currentDist > maxDistance) {
            // Elastic connection limit hit!
            const dx_parent = nextX - parentPivotWorld.x;
            const dy_parent = nextY - parentPivotWorld.y;
            const ratio = maxDistance / (currentDist || 1);
            
            nextX = Number((parentPivotWorld.x + dx_parent * ratio).toFixed(2));
            nextY = Number((parentPivotWorld.y + dy_parent * ratio).toFixed(2));
            setElasticWarningId(obj.id);
          } else {
            setElasticWarningId(null);
          }

          // Closed edge constraint for rigged child drawings
          const isParentClosed = parent.type === 'shape' && parent.shapeType !== 'line';
          if (isParentClosed) {
            // Test X movement independently (sliding collision response)
            const testTransformX = { ...obj.transform, x: nextX, y: obj.transform.y };
            if (!isChildInsideParent(obj, parent, testTransformX, objects)) {
              nextX = obj.transform.x;
            }
            // Test Y movement independently (sliding collision response)
            const testTransformY = { ...obj.transform, x: nextX, y: nextY };
            if (!isChildInsideParent(obj, parent, testTransformY, objects)) {
              nextY = obj.transform.y;
            }
          }
        } else {
          setElasticWarningId(null);
        }

        const deltaX = nextX - obj.transform.x;
        const deltaY = nextY - obj.transform.y;

        setObjects(prev => {
          const updated = { ...prev };
          updated[selectedObjectId] = {
            ...updated[selectedObjectId],
            transform: {
              ...updated[selectedObjectId].transform,
              x: nextX,
              y: nextY,
            }
          };

          // Relative translation for permanently attached drawings
          if (obj.attachedGroupId) {
            (Object.values(updated) as VectorObject[]).forEach(otherObj => {
              if (otherObj.id !== selectedObjectId && otherObj.attachedGroupId === obj.attachedGroupId) {
                updated[otherObj.id] = {
                  ...otherObj,
                  transform: {
                    ...otherObj.transform,
                    x: Number((otherObj.transform.x + deltaX).toFixed(2)),
                    y: Number((otherObj.transform.y + deltaY).toFixed(2))
                  }
                };
              }
            });
          }

          propagateRigTransforms(updated, selectedObjectId, deltaX, deltaY, 0);
          return updated;
        });
      }

      else if (dragMode === 'rotate') {
        const pivotWorld = localToWorld(
          { x: obj.pivots[0].localX, y: obj.pivots[0].localY },
          obj.transform,
          obj.pivots[0]
        );
        const angleStart = Math.atan2(dragStartPoint.y - pivotWorld.y, dragStartPoint.x - pivotWorld.x);
        const angleCurrent = Math.atan2(coords.y - pivotWorld.y, coords.x - pivotWorld.x);
        const deltaRad = angleCurrent - angleStart;
        const deltaDeg = (deltaRad * 180) / Math.PI;

        let nextRotation = Number((initialTransform.rotation + deltaDeg).toFixed(2));

        if (obj.parentId && objects[obj.parentId]) {
          const parent = objects[obj.parentId];
          const isParentClosed = parent.type === 'shape' && parent.shapeType !== 'line';
          if (isParentClosed) {
            const testTransform = { ...obj.transform, rotation: nextRotation };
            if (!isChildInsideParent(obj, parent, testTransform, objects)) {
              nextRotation = obj.transform.rotation; // block rotation outside parent
            }
          }
        }
        const deltaRot = nextRotation - obj.transform.rotation;

        setObjects(prev => {
          const updated = { ...prev };
          updated[selectedObjectId] = {
            ...updated[selectedObjectId],
            transform: {
              ...updated[selectedObjectId].transform,
              rotation: nextRotation
            }
          };

          propagateRigTransforms(updated, selectedObjectId, 0, 0, deltaRot);
          return updated;
        });
      }

      else if (dragMode === 'scale') {
        const pivotWorld = localToWorld(
          { x: obj.pivots[0].localX, y: obj.pivots[0].localY },
          obj.transform,
          obj.pivots[0]
        );
        const initialDist = distance(dragStartPoint, pivotWorld) || 1;
        const currentDist = distance(coords, pivotWorld);
        const scaleFactor = currentDist / initialDist;

        const nextScaleX = Number((initialTransform.scaleX * scaleFactor).toFixed(2));
        const nextScaleY = Number((initialTransform.scaleY * scaleFactor).toFixed(2));

        setObjects(prev => {
          const updated = { ...prev };
          const idx = activeHandleIndex;
          
          let scaleX = nextScaleX;
          let scaleY = nextScaleY;

          if (idx === 1 || idx === 5) {
            scaleX = initialTransform.scaleX;
          } else if (idx === 3 || idx === 7) {
            scaleY = initialTransform.scaleY;
          }

          if (obj.parentId && objects[obj.parentId]) {
            const parent = objects[obj.parentId];
            const isParentClosed = parent.type === 'shape' && parent.shapeType !== 'line';
            if (isParentClosed) {
              const testTransform = { ...obj.transform, scaleX, scaleY };
              if (!isChildInsideParent(obj, parent, testTransform, objects)) {
                scaleX = obj.transform.scaleX;
                scaleY = obj.transform.scaleY;
              }
            }
          }

          updated[selectedObjectId] = {
            ...updated[selectedObjectId],
            transform: {
              ...updated[selectedObjectId].transform,
              scaleX,
              scaleY
            }
          };

          propagateRigTransforms(updated, selectedObjectId, 0, 0, 0);
          return updated;
        });
      }

      else if (dragMode === 'pivot') {
        const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
        // Snap to nearest drawing point in local space if within 15px (world space converted to local threshold)
        let snappedLocal = { ...localPos };
        let minDistance = 15 / (obj.transform.scaleX || 1); // 15px threshold in local space
        obj.points.forEach(pt => {
          const dist = distance(localPos, pt);
          if (dist < minDistance) {
            minDistance = dist;
            snappedLocal = { ...pt };
          }
        });

        setObjects(prev => {
          const updated = { ...prev };
          const updatedPivots = [...updated[selectedObjectId].pivots];
          updatedPivots[0] = {
            ...updatedPivots[0],
            localX: Number(snappedLocal.x.toFixed(2)),
            localY: Number(snappedLocal.y.toFixed(2))
          };
          updated[selectedObjectId].pivots = updatedPivots;
          return updated;
        });
      }
    }

    if (dragMode === 'pivot' && activeTool === 'KNF') {
      setKnifePath(prev => [...prev, coords]);
    }
    } catch (err: any) {
      console.error("Pointer move handler failed:", err);
    }
  };

  // Pointer Up event handler
  const handlePointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    try {
    if (e && e.pointerId !== undefined) {
      delete activePointersRef.current[e.pointerId];
    } else {
      activePointersRef.current = {};
    }

    if (dragMode === 'pinchScaleObj') {
      const pointerIds = Object.keys(activePointersRef.current);
      if (pointerIds.length === 1) {
        const pt = activePointersRef.current[Number(pointerIds[0])];
        if (pt && selectedObjectId && objects[selectedObjectId]) {
          const coords = getCanvasCoords({ clientX: pt.x, clientY: pt.y } as any);
          setDragStartPoint(coords);
          setInitialTransform({ ...objects[selectedObjectId].transform });
          setDragMode('move');
        } else {
          setDragMode('none');
        }
      } else {
        setDragMode('none');
      }
      historyPush();
      return;
    }

    if (dragMode === 'zoom' || dragMode === 'pan') {
      const pointerIds = Object.keys(activePointersRef.current);
      if (pointerIds.length === 1 && activeTool === 'ZOM') {
        const pt = activePointersRef.current[Number(pointerIds[0])];
        if (pt) {
          dragStartScreenRef.current = { x: pt.x, y: pt.y };
          dragStartOffsetRef.current = { ...zoomOffset };
          setDragMode('pan');
        }
      } else {
        setDragMode('none');
      }
      return;
    }

    if (dragMode === ('rotate3D' as any)) {
      setDragMode('none');
      historyPush();
      return;
    }

    if (isDrawing && activeTool === 'BRS' && strokePointsRef.current.length > 1) {
      const pts = [...strokePointsRef.current];
      const newId = `obj_${Date.now()}`;
      const name = `Stroke_${Object.keys(objects).length + 1}`;
      
      const newObj: VectorObject = {
        id: newId,
        name,
        type: 'stroke',
        points: pts,
        strokeColor: brushSettings?.strokeColor ?? '#000000',
        strokeWidth: brushSettings?.strokeWidth ?? 3.5,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}`, name: 'Pivot_1', localX: pts[0].x, localY: pts[0].y, locked: false }],
        parentId: null,
        childrenIds: [],
        layerId: activeLayerId,
        isLocked: false,
        isHidden: false,
        brushType: brushSettings?.brushType ?? 'solid',
        strokeOpacity: brushSettings?.strokeOpacity ?? 1.0,
        hardness: brushSettings?.hardness ?? 0.8,
        blur: brushSettings?.blur ?? 0,
        shadowEnabled: brushSettings?.shadowEnabled ?? false,
        shadowColor: brushSettings?.shadowColor ?? '#000000',
        shadowBlur: brushSettings?.shadowBlur ?? 4,
        shadowOffsetX: brushSettings?.shadowOffsetX ?? 2,
        shadowOffsetY: brushSettings?.shadowOffsetY ?? 2,
      };

      setObjects(prev => ({ ...prev, [newId]: newObj }));
      setSelectedObjectId(newId);
      historyPush();
    }

    if (isDrawing && activeTool === 'SHP') {
      const minX = Math.min(dragStartPoint.x, currentCursorPos.x);
      const maxX = Math.max(dragStartPoint.x, currentCursorPos.x);
      const minY = Math.min(dragStartPoint.y, currentCursorPos.y);
      const maxY = Math.max(dragStartPoint.y, currentCursorPos.y);
      const w = maxX - minX;
      const h = maxY - minY;

      if (w > 5 && h > 5) {
        const newId = `obj_${Date.now()}`;
        const name = `Rectangle_${Object.keys(objects).length + 1}`;
        const points = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
          { x: minX, y: minY }
        ];

        const newObj: VectorObject = {
          id: newId,
          name,
          type: 'shape',
          shapeType: 'rectangle',
          points,
          strokeColor: '#1B5E20',
          strokeWidth: 3,
          fillColor: '#FFE082',
          opacity: 1,
          transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
          pivots: [{ id: `pvt_${Date.now()}`, name: 'Pivot_1', localX: minX + w/2, localY: minY + h/2, locked: false }],
          parentId: null,
          childrenIds: [],
          layerId: activeLayerId,
          isLocked: false,
          isHidden: false,
        };

        setObjects(prev => ({ ...prev, [newId]: newObj }));
        setSelectedObjectId(newId);
        historyPush();
      }
    }

    if (dragMode === 'pivot' && activeTool === 'KNF' && selectedObjectId && knifePath.length > 1) {
      const originalObj = objects[selectedObjectId];
      if (originalObj) {
        if (originalObj.type === '3d' && originalObj.vertices3D && originalObj.transform3D) {
          // 3D Knife deform / split gap
          const lineStart = knifePath[0];
          const lineEnd = knifePath[knifePath.length - 1];
          const scaleFactor = 1.0 / (originalObj.transform3D.sx || 1.0);

          setObjects(prev => {
            if (!prev[selectedObjectId]) return prev;
            const updatedVtx = [...(prev[selectedObjectId].vertices3D || [])];
            
            // Project vertices to find close ones
            const transformed3D = updatedVtx.map(v => transform3DVertex(v, originalObj.transform3D!.x, originalObj.transform3D!.y, originalObj.transform3D!.z, originalObj.transform3D!.rx, originalObj.transform3D!.ry, originalObj.transform3D!.rz, originalObj.transform3D!.sx, originalObj.transform3D!.sy, originalObj.transform3D!.sz));
            const projected = transformed3D.map(v => {
              const proj = project3DVertex(v, 400);
              return localToWorld(proj, originalObj.transform, originalObj.pivots[0] || { localX: 0, localY: 0 });
            });

            updatedVtx.forEach((v, idx) => {
              const proj = projected[idx];
              if (!proj) return;
              
              // Distance helper
              const dx = lineEnd.x - lineStart.x;
              const dy = lineEnd.y - lineStart.y;
              const len2 = dx * dx + dy * dy;
              let t = len2 === 0 ? 0 : ((proj.x - lineStart.x) * dx + (proj.y - lineStart.y) * dy) / len2;
              t = Math.max(0, Math.min(1, t));
              const closestPoint = { x: lineStart.x + t * dx, y: lineStart.y + t * dy };
              const dist = distance(proj, closestPoint);

              if (dist < 25) {
                // Calculate push vector (normal to segment)
                const segmentLength = Math.hypot(dx, dy) || 1;
                const normalX = -dy / segmentLength;
                const normalY = dx / segmentLength;
                
                // Check side
                const val = (lineEnd.x - lineStart.x) * (proj.y - lineStart.y) - (lineEnd.y - lineStart.y) * (proj.x - lineStart.x);
                const side = val >= 0 ? 1 : -1;
                
                // Offset vertices away from line to create a beautiful separation gap
                const pushDist = (25 - dist) * 0.7 * side;
                v.x = Number((v.x + normalX * pushDist * scaleFactor).toFixed(2));
                v.y = Number((v.y + normalY * pushDist * scaleFactor).toFixed(2));
              }
            });

            return {
              ...prev,
              [selectedObjectId]: {
                ...prev[selectedObjectId],
                vertices3D: updatedVtx
              }
            };
          });
          historyPush();
          setKnifePath([]);
          return;
        }

        const box = calculateBoundingBox(originalObj.points);
        const p1Points: Point[] = [];
        const p2Points: Point[] = [];
        
        const lineStart = knifePath[0];
        const lineEnd = knifePath[knifePath.length - 1];

        for (const p of originalObj.points) {
          const val = (lineEnd.x - lineStart.x) * (p.y - lineStart.y) - (lineEnd.y - lineStart.y) * (p.x - lineStart.x);
          if (val >= 0) {
            p1Points.push(p);
          } else {
            p2Points.push(p);
          }
        }

        if (p1Points.length > 2 && p2Points.length > 2) {
          const id1 = `obj_${Date.now()}_1`;
          const id2 = `obj_${Date.now()}_2`;

          const piece1: VectorObject = {
            ...originalObj,
            id: id1,
            name: `${originalObj.name}_part_1`,
            points: p1Points,
          };

          const piece2: VectorObject = {
            ...originalObj,
            id: id2,
            name: `${originalObj.name}_part_2`,
            points: p2Points,
          };

          setObjects(prev => {
            const updated = { ...prev };
            delete updated[selectedObjectId];
            updated[id1] = piece1;
            updated[id2] = piece2;
            return updated;
          });

          setSelectedObjectId(id1);
          historyPush();
        }
      }
      setKnifePath([]);
    }

    if (elasticWarningId) {
      const childId = elasticWarningId;
      const child = objects[childId];
      if (child && child.parentId && objects[child.parentId]) {
        const parent = objects[child.parentId];
        const bone = bones.find(b => (b.startObjectId === parent.id && b.endObjectId === childId) || (b.startObjectId === childId && b.endObjectId === parent.id));
        const restLength = bone ? bone.lockedDistance : 120;
        
        const parentPivot = parent.pivots[0] || { localX: 0, localY: 0 };
        const parentPivotWorld = {
          x: parent.transform.x + parentPivot.localX,
          y: parent.transform.y + parentPivot.localY
        };

        const currentDist = distance({ x: child.transform.x, y: child.transform.y }, parentPivotWorld) || 1;
        const dx_parent = child.transform.x - parentPivotWorld.x;
        const dy_parent = child.transform.y - parentPivotWorld.y;
        
        const ratio = restLength / currentDist;
        const targetX = Number((parentPivotWorld.x + dx_parent * ratio).toFixed(2));
        const targetY = Number((parentPivotWorld.y + dy_parent * ratio).toFixed(2));

        const deltaX = targetX - child.transform.x;
        const deltaY = targetY - child.transform.y;

        setObjects(prev => {
          const updated = { ...prev };
          updated[childId] = {
            ...updated[childId],
            transform: {
              ...updated[childId].transform,
              x: targetX,
              y: targetY
            }
          };
          propagateRigTransforms(updated, childId, deltaX, deltaY, 0);
          return updated;
        });
        historyPush();
      }
      setElasticWarningId(null);
    }

    if (dragMode === 'meshPoint' || dragMode === 'meshGridPoint' || dragMode === 'puppetPin' || dragMode === 'lassoControlPoint' || dragMode === 'smartWarpPin' || dragMode === 'paintColor') {
      if (dragMode === 'meshPoint' && selectedObjectId && draggedMeshPointIndex !== null) {
        const obj = objects[selectedObjectId];
        if (obj && obj.type === '3d' && obj.vertices3D && adaptiveSubdivisionEnabled) {
          const updatedVtx = [...obj.vertices3D];
          const P_curr = updatedVtx[draggedMeshPointIndex];
          if (P_curr) {
            const THRESHOLD_3D = 40.0;
            const faces = obj.faces3D || [];
            
            // Find neighbors of dragged vertex
            const neighborIndices = new Set<number>();
            faces.forEach(face => {
              const len = face.indices.length;
              for (let i = 0; i < len; i++) {
                const cur = face.indices[i];
                const next = face.indices[(i + 1) % len];
                if (cur === draggedMeshPointIndex) {
                  neighborIndices.add(next);
                } else if (next === draggedMeshPointIndex) {
                  neighborIndices.add(cur);
                }
              }
            });

            let nextFaces = [...faces];
            let nextVtx = [...updatedVtx];
            let changed = false;

            neighborIndices.forEach(neighIdx => {
              const P_neigh = nextVtx[neighIdx];
              if (P_neigh) {
                const dist = Math.sqrt(
                  Math.pow(P_curr.x - P_neigh.x, 2) +
                  Math.pow(P_curr.y - P_neigh.y, 2) +
                  Math.pow(P_curr.z - P_neigh.z, 2)
                );
                if (dist > THRESHOLD_3D) {
                  const numPoints = Math.min(adaptiveSubdivisionPoints, 2); // strictly max 2 points for 3D deformation as requested
                  const newVtxIndices: number[] = [];
                  for (let k = 1; k <= numPoints; k++) {
                    const t = k / (numPoints + 1);
                    const newV = {
                      x: Number((P_curr.x * (1 - t) + P_neigh.x * t).toFixed(2)),
                      y: Number((P_curr.y * (1 - t) + P_neigh.y * t).toFixed(2)),
                      z: Number((P_curr.z * (1 - t) + P_neigh.z * t).toFixed(2))
                    };
                    newVtxIndices.push(nextVtx.length);
                    nextVtx.push(newV);
                  }

                  // Update all faces containing this split edge
                  nextFaces = nextFaces.map(face => {
                    const indices = face.indices;
                    const len = indices.length;
                    let containsBoth = false;

                    for (let i = 0; i < len; i++) {
                      const cur = indices[i];
                      const next = indices[(i + 1) % len];
                      if (cur === draggedMeshPointIndex && next === neighIdx) {
                        containsBoth = true;
                        break;
                      } else if (cur === neighIdx && next === draggedMeshPointIndex) {
                        containsBoth = true;
                        break;
                      }
                    }

                    if (containsBoth) {
                      const nextIndices: number[] = [];
                      for (let i = 0; i < len; i++) {
                        const cur = indices[i];
                        const next = indices[(i + 1) % len];
                        nextIndices.push(cur);
                        if (cur === draggedMeshPointIndex && next === neighIdx) {
                          nextIndices.push(...newVtxIndices);
                        } else if (cur === neighIdx && next === draggedMeshPointIndex) {
                          nextIndices.push(...[...newVtxIndices].reverse());
                        }
                      }
                      return {
                        ...face,
                        indices: nextIndices
                      };
                    }
                    return face;
                  });
                  changed = true;
                }
              }
            });

            if (changed) {
              setObjects(prev => ({
                ...prev,
                [selectedObjectId]: {
                  ...prev[selectedObjectId],
                  vertices3D: nextVtx,
                  faces3D: nextFaces
                }
              }));
            }
          }
        }
      }

      if ((dragMode === 'meshPoint' || dragMode === 'meshGridPoint') && selectedObjectId && draggedMeshPointIndex !== null) {
        const obj = objects[selectedObjectId];
        if (obj) {
          let updatedCoords = null;
          if (dragMode === 'meshPoint' && obj.type === '3d' && obj.vertices3D) {
            updatedCoords = obj.vertices3D[draggedMeshPointIndex];
          } else if (dragMode === 'meshGridPoint' && obj.meshState && obj.meshState.points) {
            const pt = obj.meshState.points[draggedMeshPointIndex];
            updatedCoords = pt ? { x: pt.currentX, y: pt.currentY } : null;
          } else {
            updatedCoords = obj.points[draggedMeshPointIndex];
          }

          if (updatedCoords && setOriginalDeformPointCoords && setDeformPointTransform) {
            setOriginalDeformPointCoords(updatedCoords);
            setDeformPointTransform({
              x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0, cameraAngleX: 0, cameraAngleY: 0
            });
          }
        }
      }

      setDragMode('none');
      setDraggedMeshPointIndex(null);
      setIsPlayingState(false);
      historyPush();
    }

    if (activeTool === 'BON' && boneStartPoint && boneStartObject) {
      const pList = getAllPivotsWorld();
      const targetPivot = snappedPivot || pList.find(item => item.objId !== boneStartObject.id && distance(currentCursorPos, { x: item.worldX, y: item.worldY }) < 20);

      if (targetPivot) {
        const targetObj = objects[targetPivot.objId];
        const startLocal = worldToLocal(boneStartPoint, boneStartObject.transform, boneStartObject.pivots[0]);
        const endLocal = worldToLocal({ x: targetPivot.worldX, y: targetPivot.worldY }, targetObj.transform, targetObj.pivots[0]);
        const len = distance(boneStartPoint, { x: targetPivot.worldX, y: targetPivot.worldY });

        // Circular checks
        let circularDetected = false;
        let current: VectorObject | null = boneStartObject;
        while (current && current.parentId) {
          if (current.parentId === targetObj.id) {
            circularDetected = true;
            break;
          }
          current = objects[current.parentId];
        }

        if (circularDetected) {
          alert(`Circular dependency detected! Cannot connect bone.`);
        } else {
          const newBone: Bone = {
            id: `bone_${Date.now()}`,
            name: `Bone_${bones.length + 1}`,
            startObjectId: boneStartObject.id,
            endObjectId: targetObj.id,
            startLocalX: startLocal.x,
            startLocalY: startLocal.y,
            endLocalX: endLocal.x,
            endLocalY: endLocal.y,
            lockedDistance: Number(len.toFixed(2)) || 100,
            allowDetach: false,
            minAngle: -180,
            maxAngle: 180,
            enableConstraints: true,
          };

          setBones(prev => [...prev, newBone]);

          setObjects(prev => {
            const updated = { ...prev };
            updated[targetObj.id] = {
              ...updated[targetObj.id],
              parentId: boneStartObject.id,
            };
            if (!updated[boneStartObject.id].childrenIds.includes(targetObj.id)) {
              updated[boneStartObject.id].childrenIds = [...updated[boneStartObject.id].childrenIds, targetObj.id];
            }
            return updated;
          });

          historyPush();
        }
      }

      setBoneStartPoint(null);
      setBoneStartObject(null);
      setBoneStartPivot(null);
      setSnappedPivot(null);
    }

    if (isDrawing3DBone && bone3DStartVtxIdx !== null && selectedObjectId) {
      const obj = objects[selectedObjectId];
      if (obj && obj.type === '3d' && obj.vertices3D && obj.transform3D) {
        // Project all its vertices
        const transformed3D = obj.vertices3D.map(v => transform3DVertex(v, obj.transform3D!.x, obj.transform3D!.y, obj.transform3D!.z, obj.transform3D!.rx, obj.transform3D!.ry, obj.transform3D!.rz, obj.transform3D!.sx, obj.transform3D!.sy, obj.transform3D!.sz));
        const projected = transformed3D.map(v => {
          const proj = project3DVertex(v, 400);
          return localToWorld(proj, obj.transform, obj.pivots[0] || { localX: 0, localY: 0 });
        });

        let releasedVtxIdx = -1;
        let minDist = 20; // pixels
        projected.forEach((pt, idx) => {
          if (idx === bone3DStartVtxIdx) return;
          const d = distance(currentCursorPos, pt);
          if (d < minDist) {
            minDist = d;
            releasedVtxIdx = idx;
          }
        });

        if (releasedVtxIdx !== -1) {
          const newBone3D = {
            id: `bone3d_${Date.now()}`,
            name: `Bone3D_${((obj as any).bones3D || []).length + 1}`,
            rx: 0,
            ry: 0,
            rz: 0,
            startVertexIdx: bone3DStartVtxIdx,
            endVertexIdx: releasedVtxIdx
          };

          setObjects(prev => {
            const updated = { ...prev };
            const existingBones = (updated[selectedObjectId] as any).bones3D || [];
            updated[selectedObjectId] = {
              ...updated[selectedObjectId],
              bones3D: [...existingBones, newBone3D]
            } as any;
            return updated;
          });
          historyPush();
        }
      }
      setIsDrawing3DBone(false);
      setBone3DStartVtxIdx(null);
    }

    setIsPlayingState(false);
    setDragMode('none');
    setDraggedDirectRigBoneId(null);
    strokePointsRef.current = [];
    setStrokePoints([]);
    setIsDrawingLasso(false);
    } catch (err: any) {
      console.error("Pointer up handler failed:", err);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    // Only zoom on scroll wheel if the Zoom & Pan tool is active
    if (activeTool !== 'ZOM') return;
    
    e.preventDefault();
    
    // Zoom amount depending on deltaY
    const zoomFactor = 1.08;
    const isZoomIn = e.deltaY < 0;
    const currentScale = zoomScale;
    let nextScale = isZoomIn ? currentScale * zoomFactor : currentScale / zoomFactor;
    
    // Clamp scale to limits (0.15 to 10.0)
    nextScale = Math.min(10.0, Math.max(0.15, nextScale));
    
    const canvas = frontCanvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const appScale = (window as any).__appScale || 1;
      const cursorX = (e.clientX - rect.left) / appScale;
      const cursorY = (e.clientY - rect.top) / appScale;
      
      const worldX = (cursorX - zoomOffset.x) / currentScale;
      const worldY = (cursorY - zoomOffset.y) / currentScale;
      
      const nextOffsetX = cursorX - worldX * nextScale;
      const nextOffsetY = cursorY - worldY * nextScale;
      
      setZoomScale(nextScale);
      setZoomOffset({ x: nextOffsetX, y: nextOffsetY });
    }
  };

  const updateObjectProperties = (id: string, updates: Partial<VectorObject>) => {
    setObjects(prev => {
      if (!prev[id]) return prev;
      return {
        ...prev,
        [id]: { ...prev[id], ...updates }
      };
    });
  };

  // Dynamic canvas drawing loop
  useEffect(() => {
    const frontCanvas = frontCanvasRef.current;
    if (!frontCanvas) return;
    const ctx = frontCanvas.getContext('2d');
    if (!ctx) return;

    // Clear and Redraw physical viewport with slate workspace background (pasteboard)
    ctx.fillStyle = '#17171a';
    ctx.fillRect(0, 0, frontCanvas.width, frontCanvas.height);

    // Apply viewport zoom and pan offset transformation
    ctx.save();
    ctx.translate(zoomOffset.x, zoomOffset.y);
    ctx.scale(zoomScale, zoomScale);

    // DRAW ARTBOARD (The active drawing and vector canvas sheet)
    const artboardX = 0;
    const artboardY = 0;

    // Fill white page area representing the active animation stage
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(artboardX, artboardY, artboardW, artboardH);

    // Draw active artboard boundaries (Border lines showing canvas start/end)
    ctx.strokeStyle = '#f59e0b'; // Prominent Amber outline indicating the exact canvas boundary
    ctx.lineWidth = 3;
    ctx.strokeRect(artboardX, artboardY, artboardW, artboardH);

    // High contrast canvas start/end label markings
    ctx.fillStyle = '#fbbf24'; // High visibility amber labels
    ctx.font = 'bold 12px monospace';
    ctx.fillText('◀ CANVAS START (0, 0)', artboardX + 12, artboardY + 24);
    ctx.fillText(`CANVAS END (${artboardW}, ${artboardH}) ▶`, artboardX + artboardW - 195, artboardY + artboardH - 12);

    // Add visual crosshair corner marks to assist precision drawing alignment
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    // Top-Left Cross
    ctx.beginPath();
    ctx.moveTo(artboardX - 12, artboardY); ctx.lineTo(artboardX + 24, artboardY);
    ctx.moveTo(artboardX, artboardY - 12); ctx.lineTo(artboardX, artboardY + 24);
    ctx.stroke();

    // Bottom-Right Cross
    ctx.beginPath();
    ctx.moveTo(artboardX + artboardW - 24, artboardY + artboardH); ctx.lineTo(artboardX + artboardW + 12, artboardY + artboardH);
    ctx.moveTo(artboardX + artboardW, artboardY + artboardH - 24); ctx.lineTo(artboardX + artboardW, artboardY + artboardH + 12);
    ctx.stroke();

    // STRICT ARTBOARD CLIPPING - Prevents any artwork, deform, or other elements from leaking outside the canvas boundaries
    ctx.save();
    ctx.beginPath();
    ctx.rect(artboardX, artboardY, artboardW, artboardH);
    ctx.clip();

    // Sort layers by zIndex ascending
    const sortedLayers = [...(layers || [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
    
    // Sort all objects based on their layers zIndex, and then by their own zIndex if present
    const sortedObjects = Object.values(objects).sort((a, b) => {
      const layerA = sortedLayers.find(l => l.id === a.layerId);
      const layerB = sortedLayers.find(l => l.id === b.layerId);
      const zA = layerA ? (layerA.zIndex ?? 0) : 0;
      const zB = layerB ? (layerB.zIndex ?? 0) : 0;
      if (zA !== zB) {
        return zA - zB;
      }
      const objZA = a.zIndex ?? 0;
      const objZB = b.zIndex ?? 0;
      return objZA - objZB;
    });

    // Draw active layer drawings in sorted order
    sortedObjects.forEach((obj) => {
      const isDraftView = is360WizardActive && draft360Views.some(v => v.drawingId === obj.id);
      if (obj.isHidden && (!isDraftView || !onionSkinEnabled360)) return;
      
      const layer = (layers || []).find(l => l.id === obj.layerId);
      if (layer && layer.isHidden) return; // Skip if layer is hidden

      let drawObj = resolve360Object(obj, objects);

      const hasLassoDeform = !!(drawObj.lassoDeformState && drawObj.lassoDeformState.active && drawObj.lassoDeformState.lassoPoints && drawObj.lassoDeformState.lassoPoints.length >= 3);
      const localPivot = drawObj.pivots[0] || { localX: 0, localY: 0 };
      const polygon = drawObj.lassoDeformState?.lassoPoints || [];
      
      let lassoCenter = { localX: 0, localY: 0 };
      if (polygon.length > 0) {
        let sumX = 0;
        let sumY = 0;
        polygon.forEach(pt => {
          sumX += pt.x;
          sumY += pt.y;
        });
        lassoCenter = { localX: sumX / polygon.length, localY: sumY / polygon.length };
      }

      ctx.save();

      // Calculate warped local points
      const bounds = calculateBoundingBox(drawObj.points);
      let localPoints = drawObj.points;
      
      if (drawObj.lassoControlPoints && drawObj.lassoControlPoints.length > 0) {
        localPoints = drawObj.points.map((p, idx) => {
          const wasInsideLasso = drawObj.lassoControlPoints?.some(cp => cp.subPathIndex === undefined && cp.pointIndex === idx);
          if (wasInsideLasso && drawObj.lassoControlPoints) {
            return deformWithLassoControlPoints(p, drawObj.lassoControlPoints);
          }
          return p;
        });
      } else if (drawObj.lassoDeformState && drawObj.lassoDeformState.active) {
        localPoints = drawObj.points.map(p => deformWithLasso(p, drawObj));
      } else if (drawObj.meshState && drawObj.meshState.active) {
        localPoints = drawObj.points.map(p => getWarpedPoint(p, drawObj.meshState, bounds));
      } else if (drawObj.pins && drawObj.pins.length > 0) {
        localPoints = drawObj.points.map(p => deformWithPuppetPins(p, drawObj.pins));
      } else if (drawObj.smartWarp && drawObj.smartWarp.pins && drawObj.smartWarp.pins.length > 0) {
        localPoints = drawObj.points.map(p => deformWithSmartWarp(p, drawObj.smartWarp));
      }

      // Get pivot and project points to world space
      const pivot = drawObj.pivots[0] || { localX: 0, localY: 0 };
      const worldPoints = localPoints.map(p => localToWorld(p, drawObj.transform, pivot));

      // Draw all paths (main points + subPaths of merged drawings)
      const drawAllPaths = () => {
        ctx.beginPath();
        if (worldPoints.length > 0) {
          ctx.moveTo(worldPoints[0].x, worldPoints[0].y);
          for (let i = 1; i < worldPoints.length; i++) {
            ctx.lineTo(worldPoints[i].x, worldPoints[i].y);
          }
        }
        if (drawObj.subPaths && drawObj.subPaths.length > 0) {
          drawObj.subPaths.forEach((sub, subIdx) => {
            let localSubPoints = sub;
            if (drawObj.lassoControlPoints && drawObj.lassoControlPoints.length > 0) {
              localSubPoints = sub.map((p, idx) => {
                const wasInsideLasso = drawObj.lassoControlPoints?.some(cp => cp.subPathIndex === subIdx && cp.pointIndex === idx);
                if (wasInsideLasso && drawObj.lassoControlPoints) {
                  return deformWithLassoControlPoints(p, drawObj.lassoControlPoints);
                }
                return p;
              });
            } else if (drawObj.lassoDeformState && drawObj.lassoDeformState.active) {
              localSubPoints = sub.map(p => deformWithLasso(p, drawObj));
            } else if (drawObj.meshState && drawObj.meshState.active) {
              const subBounds = calculateBoundingBox(sub);
              localSubPoints = sub.map(p => getWarpedPoint(p, drawObj.meshState, subBounds));
            } else if (drawObj.pins && drawObj.pins.length > 0) {
              localSubPoints = sub.map(p => deformWithPuppetPins(p, drawObj.pins));
            } else if (drawObj.smartWarp && drawObj.smartWarp.pins && drawObj.smartWarp.pins.length > 0) {
              localSubPoints = sub.map(p => deformWithSmartWarp(p, drawObj.smartWarp));
            }
            const worldSubPoints = localSubPoints.map(p => localToWorld(p, drawObj.transform, pivot));
            if (worldSubPoints.length > 0) {
              ctx.moveTo(worldSubPoints[0].x, worldSubPoints[0].y);
              for (let i = 1; i < worldSubPoints.length; i++) {
                ctx.lineTo(worldSubPoints[i].x, worldSubPoints[i].y);
              }
            }
          });
        }
      };

      // Apply filter effects (depth blur, opacity)
      let combinedAlpha = drawObj.opacity !== undefined ? drawObj.opacity : 1;
      if (obj.isHidden && isDraftView) {
        combinedAlpha *= 0.25; // ghost onion skin!
      }
      if (layer) {
        combinedAlpha *= layer.opacity !== undefined ? layer.opacity : 1;
        if (layer.blurAmount && layer.blurAmount > 0) {
          ctx.filter = `blur(${layer.blurAmount}px)`;
        } else {
          ctx.filter = 'none';
        }
      } else {
        ctx.filter = 'none';
      }
      ctx.globalAlpha = combinedAlpha;

      // 1. Drop Shadow Effect
      if (drawObj.shadow && drawObj.shadow.enabled) {
        ctx.shadowColor = drawObj.shadow.color || 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = drawObj.shadow.blur ?? 10;
        ctx.shadowOffsetX = drawObj.shadow.offsetX ?? 5;
        ctx.shadowOffsetY = drawObj.shadow.offsetY ?? 5;
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // Draw vector paths, 3D proxy or image
      if (drawObj.type === '3d' && drawObj.vertices3D && drawObj.faces3D && drawObj.transform3D) {
        // Apply bone-based rigging deformation to the single mesh
        const skinnedVertices = deformVertices3D(drawObj.vertices3D, (drawObj as any).bones3D || []);
        
        const transformed3D = skinnedVertices.map(v => transform3DVertex(v, drawObj.transform3D!.x, drawObj.transform3D!.y, drawObj.transform3D!.z, drawObj.transform3D!.rx, drawObj.transform3D!.ry, drawObj.transform3D!.rz, drawObj.transform3D!.sx, drawObj.transform3D!.sy, drawObj.transform3D!.sz));
        const projected = transformed3D.map(v => {
          const proj = project3DVertex(v, 400);
          return localToWorld(proj, drawObj.transform, drawObj.pivots[0] || { localX: 0, localY: 0 });
        });

        const facesWithDepth = drawObj.faces3D.map((face, index) => {
          let sumZ = 0;
          face.indices.forEach(idx => {
            if (transformed3D[idx]) {
              sumZ += transformed3D[idx].z;
            }
          });
          const avgZ = sumZ / face.indices.length;
          return {
            face,
            avgZ,
            index
          };
        });

        facesWithDepth.sort((a, b) => b.avgZ - a.avgZ);

        // Build unique edges list for rendering and highlight tracking
        const edgesList: [number, number][] = [];
        const edgeSet = new Set<string>();
        drawObj.faces3D.forEach(face => {
          const len = face.indices.length;
          for (let i = 0; i < len; i++) {
            const v0 = face.indices[i];
            const v1 = face.indices[(i + 1) % len];
            const min = Math.min(v0, v1);
            const max = Math.max(v0, v1);
            const key = `${min}_${max}`;
            if (!edgeSet.has(key)) {
              edgeSet.add(key);
              edgesList.push([min, max]);
            }
          }
        });

        facesWithDepth.forEach(({ face, index }) => {
          if (face.indices.length < 3) return;
          
          ctx.beginPath();
          if (projected[face.indices[0]]) {
            ctx.moveTo(projected[face.indices[0]].x, projected[face.indices[0]].y);
          }
          for (let i = 1; i < face.indices.length; i++) {
            const idx = face.indices[i];
            if (projected[idx]) {
              ctx.lineTo(projected[idx].x, projected[idx].y);
            }
          }
          ctx.closePath();

          const v0 = transformed3D[face.indices[0]] || { x: 0, y: 0, z: 0 };
          const v1 = transformed3D[face.indices[1]] || { x: 0, y: 0, z: 0 };
          const v2 = transformed3D[face.indices[2]] || { x: 0, y: 0, z: 0 };
          
          // Use dynamic real-time fillColor or fall back to pre-defined face baseColor
          const rawBaseColor = (drawObj.fillColor && drawObj.fillColor !== 'transparent') ? drawObj.fillColor : (face.baseColor || '#8D6E63');
          const litColor = getFaceLightColor(v0, v1, v2, rawBaseColor, 45);

          ctx.fillStyle = litColor;
          ctx.fill();

          ctx.lineWidth = drawObj.strokeWidth || 1.2;
          ctx.strokeStyle = drawObj.strokeColor || 'rgba(0,0,0,0.2)';
          if (!drawObj.hide3DGrid) {
            ctx.stroke();
          }

          // Golden face highlight overlay
          if (drawObj.selectedFaceIndex === index) {
            ctx.lineWidth = 3.0;
            ctx.strokeStyle = '#F59E0B'; // Bright Amber/Gold
            ctx.stroke();
          }
        });

        // Golden edge highlight overlay
        if (drawObj.selectedEdgeIndex !== undefined && drawObj.selectedEdgeIndex >= 0 && drawObj.selectedEdgeIndex < edgesList.length) {
          const [v0Idx, v1Idx] = edgesList[drawObj.selectedEdgeIndex];
          const p0 = projected[v0Idx];
          const p1 = projected[v1Idx];
          if (p0 && p1) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineWidth = 4.0;
            ctx.strokeStyle = '#F59E0B'; // Glowing Gold
            ctx.shadowColor = '#F59E0B';
            ctx.shadowBlur = 4;
            ctx.stroke();
            ctx.restore();
          }
        }

        // Draw lasso fills for 3D model!
        if (drawObj.lassoFills && drawObj.lassoFills.length > 0) {
          drawObj.lassoFills.forEach(fill => {
            ctx.save();
            
            // Clip 1: Only draw inside the faces of the 3D drawing
            ctx.beginPath();
            facesWithDepth.forEach(({ face }) => {
              if (face.indices.length < 3) return;
              if (projected[face.indices[0]]) {
                ctx.moveTo(projected[face.indices[0]].x, projected[face.indices[0]].y);
              }
              for (let i = 1; i < face.indices.length; i++) {
                const idx = face.indices[i];
                if (projected[idx]) {
                  ctx.lineTo(projected[idx].x, projected[idx].y);
                }
              }
              ctx.closePath();
            });
            ctx.clip();
            
            // Clip 2: Only draw inside the lasso selection path
            ctx.beginPath();
            const localPivot = drawObj.pivots[0] || { localX: 0, localY: 0 };
            const worldLassoPoints = fill.localLassoPoints.map(p => localToWorld(p, drawObj.transform, localPivot));
            if (worldLassoPoints.length > 0) {
              ctx.moveTo(worldLassoPoints[0].x, worldLassoPoints[0].y);
              for (let i = 1; i < worldLassoPoints.length; i++) {
                ctx.lineTo(worldLassoPoints[i].x, worldLassoPoints[i].y);
              }
              ctx.closePath();
            }
            ctx.clip();
            
            // Fill the clipped region with the lasso color
            ctx.fillStyle = fill.color;
            ctx.fillRect(artboardX - 100, artboardY - 100, artboardW + 200, artboardH + 200);
            ctx.restore();
          });
        }

        // Render Rigged Skeletal Bones on top of selected 3D Model
        if (selectedObjectId === drawObj.id && (drawObj as any).bones3D && (drawObj as any).bones3D.length > 0) {
          ctx.save();
          (drawObj as any).bones3D.forEach((bone: any) => {
            const startP = projected[bone.startVertexIdx];
            const endP = projected[bone.endVertexIdx];
            if (!startP || !endP) return;

            // Draw bone link
            ctx.beginPath();
            ctx.moveTo(startP.x, startP.y);
            ctx.lineTo(endP.x, endP.y);
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#22C55E'; // green-500
            ctx.shadowColor = '#22C55E';
            ctx.shadowBlur = 6;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Inner connector bone line
            ctx.beginPath();
            ctx.moveTo(startP.x, startP.y);
            ctx.lineTo(endP.x, endP.y);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#FFFFFF';
            ctx.stroke();

            // Draw Joint handles
            ctx.beginPath();
            ctx.arc(startP.x, startP.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#EAB308'; // yellow-500
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(endP.x, endP.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#22C55E'; // green-500
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();
          });
          ctx.restore();
        }

        // Draw vertex handles for deforming/cutting/bone adding in MSH/BON tools
        if (selectedObjectId === drawObj.id && (activeTool === 'MSH' || activeTool === 'BON')) {
          ctx.save();
          projected.forEach((p, idx) => {
            const isSelected = selectedDeformPointIndex === idx && selectedDeformPointType === '3d';
            ctx.beginPath();
            ctx.arc(p.x, p.y, (idx === draggedMeshPointIndex || isSelected) ? 7 : 4, 0, Math.PI * 2);
            ctx.fillStyle = (idx === draggedMeshPointIndex || isSelected) ? '#F59E0B' : '#3B82F6';
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.fill();
            ctx.stroke();
          });
          ctx.restore();
        }

        // Draw active drawing bone guide if isDrawing3DBone is true
        if (isDrawing3DBone && bone3DStartVtxIdx !== null && selectedObjectId === drawObj.id) {
          const startP = projected[bone3DStartVtxIdx];
          if (startP) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(startP.x, startP.y);
            ctx.lineTo(currentCursorPos.x, currentCursorPos.y);
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#F59E0B';
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.restore();
          }
        }

        ctx.restore();
        return;
      }

      // Draw vector paths or image
      if (drawObj.type === 'image' && drawObj.imageUrl) {
        // Render image
        let img = imagesCacheRef.current[drawObj.imageUrl];
        if (!img) {
          img = new Image();
          img.src = drawObj.imageUrl;
          img.onload = () => {
            imagesCacheRef.current[drawObj.imageUrl!] = img;
            setObjects(prev => ({ ...prev }));
          };
          imagesCacheRef.current[drawObj.imageUrl] = img;
        }
        
        if (img.complete && img.naturalWidth > 0) {
          const localPivot = drawObj.pivots[0] || { localX: 0, localY: 0 };
          const imgBounds = calculateBoundingBox(drawObj.points);
          
          const hasLassoDeformImage = !!(drawObj.lassoDeformState && drawObj.lassoDeformState.active && drawObj.lassoDeformState.lassoPoints && drawObj.lassoDeformState.lassoPoints.length >= 3);
          const hasMeshState = drawObj.meshState && drawObj.meshState.active;
          const hasPuppetPins = drawObj.pins && drawObj.pins.length > 0;

          if (hasLassoDeformImage || hasMeshState || hasPuppetPins) {
            // Draw textured mesh deformation!
            const COLS = 24;
            const ROWS = 24;
            
            const vertices: Point[][] = [];
            const worldVertices: Point[][] = [];

            for (let r = 0; r <= ROWS; r++) {
              vertices[r] = [];
              worldVertices[r] = [];
              const ty = r / ROWS;
              const py = imgBounds.y + ty * imgBounds.height;

              for (let c = 0; c <= COLS; c++) {
                const tx = c / COLS;
                const px = imgBounds.x + tx * imgBounds.width;
                const p = { x: px, y: py };
                
                let dp = p;
                if (hasLassoDeformImage) {
                  dp = deformWithLasso(p, drawObj);
                } else if (hasMeshState) {
                  dp = getWarpedPoint(p, drawObj.meshState, imgBounds);
                } else if (hasPuppetPins) {
                  dp = deformWithPuppetPins(p, drawObj.pins!);
                }
                
                vertices[r][c] = dp;
                // Project local deformed point to world space
                const wp = localToWorld(dp, drawObj.transform, localPivot);
                worldVertices[r][c] = wp;
              }
            }

            // Render each grid cell as 2 textured triangles
            for (let r = 0; r < ROWS; r++) {
              for (let c = 0; c < COLS; c++) {
                // Local fraction coords
                const tx0 = c / COLS;
                const tx1 = (c + 1) / COLS;
                const ty0 = r / ROWS;
                const ty1 = (r + 1) / ROWS;

                // Source UV coordinates on image
                const u0 = tx0 * img.naturalWidth;
                const u1 = tx1 * img.naturalWidth;
                const v0 = ty0 * img.naturalHeight;
                const v1 = ty1 * img.naturalHeight;

                // Destination World coords
                const d_tl = worldVertices[r][c];       // top-left
                const d_tr = worldVertices[r][c + 1];   // top-right
                const d_bl = worldVertices[r + 1][c];   // bottom-left
                const d_br = worldVertices[r + 1][c + 1]; // bottom-right

                // Triangle 1: top-left, top-right, bottom-left
                drawTexturedTriangle(
                  ctx,
                  img,
                  u0, v0,
                  u1, v0,
                  u0, v1,
                  d_tl.x, d_tl.y,
                  d_tr.x, d_tr.y,
                  d_bl.x, d_bl.y
                );

                // Triangle 2: top-right, bottom-right, bottom-left
                drawTexturedTriangle(
                  ctx,
                  img,
                  u1, v0,
                  u1, v1,
                  u0, v1,
                  d_tr.x, d_tr.y,
                  d_br.x, d_br.y,
                  d_bl.x, d_bl.y
                );
              }
            }
          } else {
            ctx.save();
            // Aligned Transformation Matrix matching localToWorld order perfectly!
            ctx.translate(drawObj.transform.x + localPivot.localX, drawObj.transform.y + localPivot.localY);
            
            // 2D Rotation around Pivot
            ctx.rotate((drawObj.transform.rotation * Math.PI) / 180);
            
            // 3D simulated rotation or standard Skew
            const skewX = drawObj.transform.skewX || 0;
            const skewY = drawObj.transform.skewY || 0;
            if (skewX !== 0 || skewY !== 0) {
              ctx.transform(1, Math.tan((skewY * Math.PI) / 180), Math.tan((skewX * Math.PI) / 180), 1, 0, 0);
            }
            
            // 3D rotation flips
            const rotateX = drawObj.transform.rotateX || 0;
            const rotateY = drawObj.transform.rotateY || 0;
            const cosRotX = Math.cos((rotateX * Math.PI) / 180);
            const cosRotY = Math.cos((rotateY * Math.PI) / 180);
            
            // Apply Scale (with 3D perspective / flip reduction factors matching localToWorld)
            ctx.scale(drawObj.transform.scaleX * cosRotY, drawObj.transform.scaleY * cosRotX);
            
            // Offset back to local coordinates
            ctx.translate(-localPivot.localX, -localPivot.localY);
            
            ctx.drawImage(img, imgBounds.x, imgBounds.y, imgBounds.width, imgBounds.height);
            ctx.restore();
          }
        }
      } else {
        // Render vector drawing
        if (drawObj.type === 'stroke') {
          // Map local points to world points, preserving our realism attributes!
          const worldStrokePoints = localPoints.map((p) => {
            const wp = localToWorld(p, drawObj.transform, pivot);
            return {
              ...wp,
              w: p.w,
              t: p.t,
              angle: p.angle,
              jitterX: p.jitterX,
              jitterY: p.jitterY,
              grainOpacity: p.grainOpacity
            };
          });
          
          const strokeBrush: Partial<BrushSettings> = {
            brushType: drawObj.brushType as any ?? 'solid',
            strokeWidth: drawObj.strokeWidth,
            strokeOpacity: drawObj.strokeOpacity ?? 1.0,
            hardness: drawObj.hardness ?? 0.8,
            blur: drawObj.blur ?? 0,
            shadowEnabled: drawObj.shadowEnabled ?? false,
            shadowColor: drawObj.shadowColor ?? '#000000',
            shadowBlur: drawObj.shadowBlur ?? 4,
            shadowOffsetX: drawObj.shadowOffsetX ?? 2,
            shadowOffsetY: drawObj.shadowOffsetY ?? 2,
          };

          drawVariableWidthStroke(ctx, worldStrokePoints, drawObj.strokeColor, realismSettings, strokeBrush);
          
          // Draw any subPaths of merged drawings
          if (drawObj.subPaths && drawObj.subPaths.length > 0) {
            drawObj.subPaths.forEach(sub => {
              let localSubPoints = sub;
              if (drawObj.meshState && drawObj.meshState.active) {
                const subBounds = calculateBoundingBox(sub);
                localSubPoints = sub.map(p => getWarpedPoint(p, drawObj.meshState, subBounds));
              } else if (drawObj.pins && drawObj.pins.length > 0) {
                localSubPoints = sub.map(p => deformWithPuppetPins(p, drawObj.pins));
              }
              const worldSubPoints = localSubPoints.map(p => {
                const wp = localToWorld(p, drawObj.transform, pivot);
                return {
                  ...wp,
                  w: p.w,
                  t: p.t,
                  angle: p.angle,
                  jitterX: p.jitterX,
                  jitterY: p.jitterY,
                  grainOpacity: p.grainOpacity
                };
              });
              drawVariableWidthStroke(ctx, worldSubPoints, drawObj.strokeColor, realismSettings, strokeBrush);
            });
          }
        } else {
          drawAllPaths();
          
          ctx.lineWidth = drawObj.strokeWidth;
          ctx.strokeStyle = drawObj.strokeColor;
          ctx.stroke();

          if (drawObj.fillColor && drawObj.fillColor !== 'transparent') {
            ctx.fillStyle = drawObj.fillColor;
            ctx.fill();
          }
        }
      }

      // 2. Inner Shadow Effect
      if (obj.innerShadow && obj.innerShadow.enabled && obj.type !== 'image') {
        ctx.save();
        
        // Clip to current vector path
        drawAllPaths();
        ctx.clip();
        
        ctx.shadowColor = obj.innerShadow.color || 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = obj.innerShadow.blur ?? 15;
        
        const angleRad = (((obj.innerShadow.angle ?? 120)) * Math.PI) / 180;
        ctx.shadowOffsetX = Math.cos(angleRad) * (obj.innerShadow.distance ?? 8);
        ctx.shadowOffsetY = Math.sin(angleRad) * (obj.innerShadow.distance ?? 8);
        
        ctx.globalCompositeOperation = 'source-atop';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.restore();
      }

      // 3. Color Overlay Effect
      if (obj.overlay && obj.overlay.enabled && obj.type !== 'image') {
        ctx.save();
        
        // Clip to current path
        drawAllPaths();
        ctx.clip();
        
        ctx.globalCompositeOperation = (obj.overlay.blendMode as any) || 'source-atop';
        ctx.fillStyle = obj.overlay.color || '#ff0055';
        ctx.globalAlpha = obj.overlay.opacity ?? 0.5;
        ctx.fill();
        
        ctx.restore();
      }

      // 4. Rim Light Effect
      if (obj.rimLight && obj.rimLight.enabled && obj.type !== 'image') {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = obj.rimLight.color || '#ffffff';
        ctx.lineWidth = obj.rimLight.thickness ?? 4;
        ctx.shadowColor = obj.rimLight.color || '#ffffff';
        ctx.shadowBlur = obj.rimLight.softness ?? 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        drawAllPaths();
        ctx.stroke();
        
        ctx.restore();
      }

      // 4.5 Lasso Fills (drawn relative to the local object space)
      if (obj.lassoFills && obj.lassoFills.length > 0 && obj.type !== 'image') {
        obj.lassoFills.forEach(fill => {
          ctx.save();
          
          // Clip 1: Only draw inside the parent drawing's bounds
          drawAllPaths();
          ctx.clip();
          
          // Clip 2: Only draw inside the lasso selection path
          ctx.beginPath();
          const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
          const worldLassoPoints = fill.localLassoPoints.map(p => localToWorld(p, obj.transform, localPivot));
          if (worldLassoPoints.length > 0) {
            ctx.moveTo(worldLassoPoints[0].x, worldLassoPoints[0].y);
            for (let i = 1; i < worldLassoPoints.length; i++) {
              ctx.lineTo(worldLassoPoints[i].x, worldLassoPoints[i].y);
            }
            ctx.closePath();
          }
          ctx.clip();
          
          // Fill the clipped region with the lasso color
          drawAllPaths();
          ctx.fillStyle = fill.color;
          ctx.fill();
          
          ctx.restore();
        });
      }

      // 4.6 Smart Mesh Coloring
      if (obj.smartMeshColor && obj.type !== 'image') {
        const smc = obj.smartMeshColor;
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        
        ctx.save();
        // Clip to the shape boundary so paint doesn't bleed outside the drawing
        drawAllPaths();
        ctx.clip();

        // 1. Draw each cell that has a color
        smc.cells.forEach(cell => {
          if (!cell.color) return;
          
          // Get the 4 corners of the cell
          const cellPoints = cell.pointIds.map(pId => {
            const pt = smc.points.find(p => p.id === pId);
            if (!pt) return null;
            // Apply warp pins to point positions dynamically if present!
            const finalLocal = deformWithSmartWarp({ x: pt.originalX, y: pt.originalY }, obj.smartWarp);
            return localToWorld(finalLocal, obj.transform, localPivot);
          });

          if (cellPoints.every(p => p !== null)) {
            ctx.save();
            ctx.globalAlpha = cell.opacity !== undefined ? cell.opacity : 1.0;
            ctx.beginPath();
            ctx.moveTo(cellPoints[0]!.x, cellPoints[0]!.y);
            for (let i = 1; i < cellPoints.length; i++) {
              ctx.lineTo(cellPoints[i]!.x, cellPoints[i]!.y);
            }
            ctx.closePath();
            ctx.fillStyle = cell.color;
            ctx.fill();
            ctx.restore();
          }
        });

        // 2. Draw each point that has a color (soft radial glow bleed)
        smc.points.forEach(pt => {
          if (!pt.color) return;

          // Apply warp pins to point position dynamically if present!
          const finalLocal = deformWithSmartWarp({ x: pt.originalX, y: pt.originalY }, obj.smartWarp);
          const worldPt = localToWorld(finalLocal, obj.transform, localPivot);
          const brushSize = smc.brushSize || 40;

          ctx.save();
          ctx.globalAlpha = pt.opacity !== undefined ? pt.opacity : 1.0;
          const grad = ctx.createRadialGradient(worldPt.x, worldPt.y, 0, worldPt.x, worldPt.y, brushSize);
          grad.addColorStop(0, pt.color);
          grad.addColorStop(1, 'transparent');
          
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(worldPt.x, worldPt.y, brushSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });

        ctx.restore();
      }

      ctx.restore();
    });

    // Draw select overlay bounding boxes & 10+ handles
    if (selectedObjectId && objects[selectedObjectId] && activeTool !== 'ZOM') {
      const rawObj = objects[selectedObjectId];
      const obj = resolve360Object(rawObj, objects);
      const box = calculateBoundingBox(getAllObjectPoints(rawObj));
      const pivot = obj.pivots[0] || { localX: 0, localY: 0 };
      
      const tl = localToWorld({ x: box.x, y: box.y }, obj.transform, pivot);
      const tr = localToWorld({ x: box.x + box.width, y: box.y }, obj.transform, pivot);
      const br = localToWorld({ x: box.x + box.width, y: box.y + box.height }, obj.transform, pivot);
      const bl = localToWorld({ x: box.x, y: box.y + box.height }, obj.transform, pivot);
      
      const tc = localToWorld({ x: box.x + box.width / 2, y: box.y }, obj.transform, pivot);
      const trRot = localToWorld({ x: box.x + box.width / 2, y: box.y - 25 }, obj.transform, pivot);

      // 1. Draw outer boundary box in world space
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.stroke();

      // 2. Draw line connecting to Top Rotation Handle
      ctx.beginPath();
      ctx.moveTo(tc.x, tc.y);
      ctx.lineTo(trRot.x, trRot.y);
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3. Draw the 10 interactive handles in world space
      const handles = getHandles(obj);
      handles.forEach(h => {
        ctx.save();
        ctx.strokeStyle = '#1E88E5';
        ctx.lineWidth = 1.5;

        if (h.type === 'scale') {
          ctx.fillStyle = '#FFFFFF';
          const size = (h.index % 2 === 0) ? 10 : 8;
          ctx.fillRect(h.worldX - size / 2, h.worldY - size / 2, size, size);
          ctx.strokeRect(h.worldX - size / 2, h.worldY - size / 2, size, size);
        } else if (h.type === 'rotate') {
          ctx.fillStyle = '#FF9800'; // Amber/orange for rotation!
          ctx.beginPath();
          ctx.arc(h.worldX, h.worldY, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (h.type === 'pivot') {
          ctx.fillStyle = '#E53935'; // Red for anchor/pivot joint!
          ctx.beginPath();
          ctx.arc(h.worldX, h.worldY, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(h.worldX - 4, h.worldY);
          ctx.lineTo(h.worldX + 4, h.worldY);
          ctx.moveTo(h.worldX, h.worldY - 4);
          ctx.lineTo(h.worldX, h.worldY + 4);
          ctx.stroke();
        }
        ctx.restore();
      });
    }

    // Render active Geometry Mesh deform wireframe/handles
    if (activeTool === 'MSH' && selectedObjectId && objects[selectedObjectId]) {
      const obj = objects[selectedObjectId];
      
      if (obj.meshState && obj.meshState.active) {
        const { densityX, densityY, points, showGrid, showPoints } = obj.meshState;
        ctx.save();
        
        // Convert all mesh points to world space
        const worldMeshPoints = points.map(mpt => {
          return localToWorld({ x: mpt.currentX, y: mpt.currentY }, obj.transform, obj.pivots[0]);
        });
        
        // 1. Draw Mesh Grid lines
        if (showGrid) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
          ctx.lineWidth = 1.2;
          
          // Draw horizontal lines
          for (let y = 0; y < densityY; y++) {
            for (let x = 0; x < densityX - 1; x++) {
              const p1 = worldMeshPoints[y * densityX + x];
              const p2 = worldMeshPoints[y * densityX + (x + 1)];
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
            }
          }
          
          // Draw vertical lines
          for (let x = 0; x < densityX; x++) {
            for (let y = 0; y < densityY - 1; y++) {
              const p1 = worldMeshPoints[y * densityX + x];
              const p2 = worldMeshPoints[(y + 1) * densityX + x];
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
            }
          }
          ctx.stroke();
        }
        
        // 2. Draw Mesh Grid points
        if (showPoints) {
          worldMeshPoints.forEach((mpt, idx) => {
            const isSelected = selectedDeformPointIndex === idx && selectedDeformPointType === 'grid';
            ctx.beginPath();
            ctx.arc(mpt.x, mpt.y, (dragMode === 'meshGridPoint' && draggedMeshPointIndex === idx || isSelected) ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = (dragMode === 'meshGridPoint' && draggedMeshPointIndex === idx || isSelected) ? '#F59E0B' : '#3B82F6';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
          });
        }
        ctx.restore();
      } else {
        // Draw standard vector outline if no active mesh grid
        ctx.save();
        const worldPts = obj.points.map(p => localToWorld(p, obj.transform, obj.pivots[0]));
        if (worldPts.length > 1) {
          ctx.beginPath();
          ctx.moveTo(worldPts[0].x, worldPts[0].y);
          for (let i = 1; i < worldPts.length; i++) {
            ctx.lineTo(worldPts[i].x, worldPts[i].y);
          }
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
          ctx.lineWidth = 1.8;
          ctx.setLineDash([2, 3]);
          ctx.stroke();
        }
        
        worldPts.forEach((pt, i) => {
          const isSelected = selectedDeformPointIndex === i && selectedDeformPointType === 'standard';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, (dragMode === 'meshPoint' && draggedMeshPointIndex === i || isSelected) ? 8 : 6, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === 'meshPoint' && draggedMeshPointIndex === i || isSelected) ? '#F59E0B' : '#3B82F6';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Small inner point
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
        });
        ctx.restore();
      }
    }

    // Render active Smart Mesh Coloring overlay (mesh grid, dots, brush cursor preview)
    if (activeTool === 'MCL' && selectedObjectId && objects[selectedObjectId]) {
      const obj = objects[selectedObjectId];
      if (obj.smartMeshColor) {
        const { densityX, densityY, points } = obj.smartMeshColor;
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        ctx.save();
        
        // 1. Draw Mesh Grid lines
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)'; // Emerald line
        ctx.lineWidth = 1.2;
        
        // Convert all points to world space
        const worldPoints = points.map(pt => {
          // Deform with smartWarp pins if present
          const localWarped = deformWithSmartWarp({ x: pt.originalX, y: pt.originalY }, obj.smartWarp);
          return localToWorld(localWarped, obj.transform, localPivot);
        });

        // Horizontal lines
        for (let y = 0; y < densityY; y++) {
          for (let x = 0; x < densityX - 1; x++) {
            const p1 = worldPoints[y * densityX + x];
            const p2 = worldPoints[y * densityX + (x + 1)];
            if (p1 && p2) {
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
            }
          }
        }
        
        // Vertical lines
        for (let x = 0; x < densityX; x++) {
          for (let y = 0; y < densityY - 1; y++) {
            const p1 = worldPoints[y * densityX + x];
            const p2 = worldPoints[(y + 1) * densityX + x];
            if (p1 && p2) {
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
            }
          }
        }
        ctx.stroke();

        // 2. Draw points
        worldPoints.forEach(pt => {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981'; // Emerald
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
        });

        // 3. Draw Brush circle overlay cursor preview
        if (currentCursorPos) {
          ctx.beginPath();
          ctx.arc(currentCursorPos.x, currentCursorPos.y, obj.smartMeshColor.brushSize || 40, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          
          // Draw center tiny crosshair
          ctx.beginPath();
          ctx.moveTo(currentCursorPos.x - 5, currentCursorPos.y);
          ctx.lineTo(currentCursorPos.x + 5, currentCursorPos.y);
          ctx.moveTo(currentCursorPos.x, currentCursorPos.y - 5);
          ctx.lineTo(currentCursorPos.x, currentCursorPos.y + 5);
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.8)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // Render active Smart Pin Warp overlay (selectable/draggable puppet-like deformation pins)
    if (activeTool === 'SWP' && selectedObjectId && objects[selectedObjectId]) {
      const obj = objects[selectedObjectId];
      if (obj.smartWarp) {
        const { pins, pinSize, influenceRadius, showInfluenceArea } = obj.smartWarp;
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        ctx.save();

        pins.forEach((pin, idx) => {
          const worldPin = localToWorld({ x: pin.currentX, y: pin.currentY }, obj.transform, localPivot);

          // 1. Draw Influence Radius Overlay
          if (showInfluenceArea !== false) {
            ctx.beginPath();
            ctx.arc(worldPin.x, worldPin.y, influenceRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(14, 165, 233, 0.25)'; // Sky blue soft circle
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.fillStyle = 'rgba(14, 165, 233, 0.03)';
            ctx.fill();
          }

          // 2. Draw Pin handle
          ctx.beginPath();
          ctx.arc(worldPin.x, worldPin.y, 8, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === 'smartWarpPin' && draggedMeshPointIndex === idx) ? '#F59E0B' : '#0EA5E9'; // Amber if dragged, Sky blue otherwise
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Inner pin center dot
          ctx.beginPath();
          ctx.arc(worldPin.x, worldPin.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = pin.locked ? '#000000' : '#FFFFFF'; // Black dot if locked
          ctx.fill();
        });
        ctx.restore();
      }
    }

    // Render Puppet Pins overlay for selected object if present
    if (selectedObjectId && objects[selectedObjectId]) {
      const obj = objects[selectedObjectId];
      if (obj.pins && obj.pins.length > 0) {
        ctx.save();
        obj.pins.forEach((pin, idx) => {
          const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
          const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
          const worldPin = localToWorld({ x: curX, y: curY }, obj.transform, obj.pivots[0]);
          
          ctx.beginPath();
          ctx.arc(worldPin.x, worldPin.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === 'puppetPin' && draggedMeshPointIndex === idx) ? '#F59E0B' : '#EF4444';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          
          // Inner core dot
          ctx.beginPath();
          ctx.arc(worldPin.x, worldPin.y, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
        });
        ctx.restore();
      }
    }

    // Render Lasso Deform Selection region polygon overlay for selected object
    if (selectedObjectId && objects[selectedObjectId]) {
      const obj = objects[selectedObjectId];
      if (obj.lassoDeformState && obj.lassoDeformState.lassoPoints && obj.lassoDeformState.lassoPoints.length >= 3) {
        ctx.save();
        
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        const worldLassoPoints = obj.lassoDeformState.lassoPoints.map(p => localToWorld(p, obj.transform, localPivot));
        
        ctx.beginPath();
        ctx.moveTo(worldLassoPoints[0].x, worldLassoPoints[0].y);
        for (let i = 1; i < worldLassoPoints.length; i++) {
          ctx.lineTo(worldLassoPoints[i].x, worldLassoPoints[i].y);
        }
        ctx.closePath();
        
        ctx.strokeStyle = '#F59E0B'; // Amber orange
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(245, 158, 11, 0.1)'; // Soft amber fill
        ctx.fill();
        
        ctx.restore();
      }
    }

    // Render Lasso Mesh Control Points overlay for selected object if present
    if (selectedObjectId && objects[selectedObjectId]) {
      const obj = objects[selectedObjectId];
      if (obj.lassoControlPoints && obj.lassoControlPoints.length > 0) {
        ctx.save();
        const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
        obj.lassoControlPoints.forEach((cp, idx) => {
          const worldPt = localToWorld({ x: cp.currentX, y: cp.currentY }, obj.transform, localPivot);
          
          ctx.beginPath();
          ctx.arc(worldPt.x, worldPt.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === 'lassoControlPoint' && draggedMeshPointIndex === idx) ? '#F59E0B' : '#3B82F6'; // Amber if dragging, else elegant blue
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
        ctx.restore();
      }
    }

    // Render active Pen path points & lines
    if (activeTool === 'PEN' && penPoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(penPoints[0].x, penPoints[0].y);
      for (let i = 1; i < penPoints.length; i++) {
        ctx.lineTo(penPoints[i].x, penPoints[i].y);
      }
      ctx.lineTo(currentCursorPos.x, currentCursorPos.y); // Dynamic rubberband line
      ctx.strokeStyle = '#E53935';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      // Draw little control point circles
      penPoints.forEach((pt, i) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#4CAF50' : '#FFEB3B';
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
      ctx.restore();
    }

    // Render Rectangle/Shapes Creation preview
    if (isDrawing && activeTool === 'SHP') {
      ctx.save();
      ctx.strokeStyle = '#FF9800';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      const w = currentCursorPos.x - dragStartPoint.x;
      const h = currentCursorPos.y - dragStartPoint.y;
      ctx.strokeRect(dragStartPoint.x, dragStartPoint.y, w, h);
      ctx.restore();
    }

    // Render active bones list linkage overlays
    if (showBones || activeTool === 'BON') {
      bones.forEach((bone) => {
        const startObj = objects[bone.startObjectId];
        const endObj = objects[bone.endObjectId];
        if (!startObj || !endObj) return;

        const p1 = localToWorld({ x: bone.startLocalX, y: bone.startLocalY }, startObj.transform, startObj.pivots[0]);
        const p2 = localToWorld({ x: bone.endLocalX, y: bone.endLocalY }, endObj.transform, endObj.pivots[0]);

        const isElasticWarning = (elasticWarningId === bone.endObjectId);

        // Render bone linkage line
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineWidth = isElasticWarning ? 5 : 4;
        ctx.strokeStyle = isElasticWarning ? '#FF1744' : '#2196F3'; // Red if elastic constraint warnings are triggered!
        ctx.stroke();

        // Render joint connection dots
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, 6, 0, Math.PI * 2);
        ctx.arc(p2.x, p2.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = isElasticWarning ? '#FF1744' : '#1B5E20';
        ctx.fill();

        // Draw beautiful warning badge if stretched to limit!
        if (isElasticWarning) {
          ctx.beginPath();
          ctx.arc((p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 20, 10, 0, Math.PI * 2);
          ctx.fillStyle = '#FF1744';
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('!', (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 20);
        }
        ctx.restore();
      });
    }

    // Render active bone tool drawing / rubberband snapping preview
    if (activeTool === 'BON' && boneStartPoint) {
      ctx.save();
      // Rubberband connection line
      ctx.beginPath();
      ctx.moveTo(boneStartPoint.x, boneStartPoint.y);
      ctx.lineTo(currentCursorPos.x, currentCursorPos.y);
      ctx.lineWidth = 3;
      ctx.strokeStyle = snappedPivot ? '#4CAF50' : '#FFEB3B'; // Snap green vs draft yellow!
      ctx.stroke();

      // Start Joint Anchor
      ctx.beginPath();
      ctx.arc(boneStartPoint.x, boneStartPoint.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#E53935';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Magnetic Snapping Glow Flash!
      if (snappedPivot) {
        ctx.beginPath();
        ctx.arc(snappedPivot.worldX, snappedPivot.worldY, 15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(76, 175, 80, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(snappedPivot.worldX, snappedPivot.worldY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#4CAF50';
        ctx.fill();
      }
      ctx.restore();
    }

    // Render current active brush line
    if (isDrawing && strokePoints.length > 0) {
      ctx.save();
      const previewColor = brushSettings?.strokeColor ?? '#000000';
      drawVariableWidthStroke(ctx, strokePoints, previewColor, realismSettings, brushSettings);
      ctx.restore();
    }

    // Render Knife slice trace line
    if (knifePath.length > 0 && activeTool === 'KNF') {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(knifePath[0].x, knifePath[0].y);
      for (let i = 1; i < knifePath.length; i++) {
        ctx.lineTo(knifePath[i].x, knifePath[i].y);
      }
      ctx.strokeStyle = '#2196F3';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    // Render current active Lasso selection path
    if (lassoPoints && lassoPoints.length > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      }
      ctx.closePath();
      
      // Beautiful amber glow fill
      ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
      ctx.fill();
      
      // Beautiful neon-amber dashed outline
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.restore();
    }

    // Render current in-progress Pen selection path
    if (activeTool === 'LSO' && lassoMode === 'pen' && penLassoPoints && penLassoPoints.length > 0) {
      ctx.save();
      
      // Draw path lines
      ctx.beginPath();
      ctx.moveTo(penLassoPoints[0].x, penLassoPoints[0].y);
      for (let i = 1; i < penLassoPoints.length; i++) {
        ctx.lineTo(penLassoPoints[i].x, penLassoPoints[i].y);
      }
      
      // Draw live rubberband line from last point to current cursor pos
      ctx.lineTo(currentCursorPos.x, currentCursorPos.y);
      
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
      ctx.lineWidth = 2 / zoomScale;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      
      // Draw the dots
      penLassoPoints.forEach((pt, index) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5 / zoomScale, 0, Math.PI * 2);
        
        if (index === 0) {
          // Accent highlighted circle for first point
          ctx.fillStyle = '#F59E0B';
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2 / zoomScale;
          ctx.fill();
          ctx.stroke();
          
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 9 / zoomScale, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
          ctx.lineWidth = 1.5 / zoomScale;
          ctx.stroke();
        } else {
          ctx.fillStyle = '#374151';
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 1.5 / zoomScale;
          ctx.fill();
          ctx.stroke();
        }
      });
      
      ctx.restore();
    }

    // Restore clipping path state
    ctx.restore();

    // Restore top-level viewport zoom/pan transformation
    ctx.restore();
  }, [
    objects,
    selectedObjectId,
    bones,
    isDrawing,
    strokePoints,
    knifePath,
    activeTool,
    boneStartPoint,
    currentCursorPos,
    snappedPivot,
    elasticWarningId,
    showBones,
    zoomScale,
    zoomOffset,
    lassoPoints,
    lassoMode,
    penLassoPoints,
    artboardW,
    artboardH
  ]);

  return (
    <div ref={containerRef} className="flex-1 bg-white relative overflow-hidden select-none">
      {/* Double canvas layout for background / overlays optimization */}
      <canvas
        ref={backCanvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0 pointer-events-none"
      />
      <canvas
        ref={frontCanvasRef}
        id="front-vector-canvas"
        width={dimensions.width}
        height={dimensions.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        className={`absolute inset-0 touch-none ${
          activeTool === 'ZOM' 
            ? (dragMode === 'pan' ? 'cursor-grabbing' : 'cursor-grab') 
            : 'cursor-crosshair'
        }`}
      />

      {/* Floating Lasso Selection Mode HUD */}
      {activeTool === 'LSO' && (
        <div id="canvas-lasso-mode-hud" className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-neutral-900/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-neutral-800 shadow-xl pointer-events-auto z-50 animate-fade-in text-white">
          <span className="text-[10px] text-amber-500 font-black uppercase tracking-wider mr-1">Selection Mode:</span>
          
          <button
            type="button"
            onClick={() => {
              setLassoMode('freehand');
              setPenLassoPoints([]);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              lassoMode === 'freehand'
                ? 'bg-amber-500 text-neutral-950 font-black shadow shadow-amber-500/30'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Lasso
          </button>
          
          <button
            type="button"
            onClick={() => {
              setLassoMode('pen');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
              lassoMode === 'pen'
                ? 'bg-amber-500 text-neutral-950 font-black shadow shadow-amber-500/30'
                : 'text-neutral-400 hover:text-white hover:bg-neutral-800/60'
            }`}
          >
            <Feather className="w-3.5 h-3.5" />
            Vector Pen
          </button>
          
          {lassoMode === 'pen' && penLassoPoints.length > 0 && (
            <>
              <div className="h-4 w-[1px] bg-neutral-800 mx-1" />
              <button
                type="button"
                disabled={penLassoPoints.length < 3}
                onClick={() => {
                  setLassoPoints([...penLassoPoints]);
                  setPenLassoPoints([]);
                }}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
                title="Connect first and last points to finalize the selection area"
              >
                Done ({penLassoPoints.length} pts)
              </button>
              
              <button
                type="button"
                onClick={() => setPenLassoPoints([])}
                className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* Premium Canvas Size Configuration Dialog Modal Overlay */}
      {showCanvasSizePanel && (
        <div 
          id="canvas-size-modal-overlay" 
          className="fixed inset-0 bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center z-[100] pointer-events-auto animate-fade-in"
        >
          <div 
            className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-2xl w-full max-w-sm flex flex-col gap-5 text-white animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-amber-500 font-extrabold tracking-widest uppercase">Canvas Setup</span>
              <h3 className="text-base font-black uppercase tracking-wider text-neutral-100">Adjust Stage Resolution</h3>
              <p className="text-[11px] text-neutral-400 font-semibold leading-relaxed">
                Resize the active drawing sheet. The canvas in the background will adapt instantly to your changes.
              </p>
            </div>

            {/* Live Size Badge */}
            <div className="bg-neutral-950 px-4 py-2 rounded-2xl border border-neutral-800 flex items-center justify-between font-mono">
              <span className="text-[10px] uppercase font-black text-neutral-500">Active Resolution</span>
              <span className="text-xs font-bold text-amber-400">{artboardW} × {artboardH} px</span>
            </div>

            {/* Presets Grid */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[9px] text-neutral-400 uppercase font-black tracking-wide">Presets</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'HD Stage', w: 1280, h: 720 },
                  { label: 'Full HD', w: 1920, h: 1080 },
                  { label: 'Square Post', w: 1080, h: 1080 },
                  { label: 'Standard', w: 1400, h: 900 }
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setArtboardW(p.w);
                      setArtboardH(p.h);
                      setTempArtboardW(p.w.toString());
                      setTempArtboardH(p.h.toString());
                    }}
                    className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-black uppercase text-left transition-all cursor-pointer ${
                      artboardW === p.w && artboardH === p.h
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-400'
                        : 'bg-neutral-850 hover:bg-neutral-800 border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div>{p.label}</div>
                    <div className="text-[9px] text-neutral-500 font-mono mt-0.5">{p.w}x{p.h}px</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Width */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-neutral-400 uppercase font-black tracking-wide">Width (px)</span>
                <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden h-9">
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(tempArtboardW) || artboardW;
                      const next = Math.max(100, current - 100);
                      setTempArtboardW(next.toString());
                      setArtboardW(next);
                    }}
                    className="w-8 h-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors font-bold text-xs shrink-0 cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="text"
                    value={tempArtboardW}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setTempArtboardW(val);
                      const parsed = parseInt(val);
                      if (!isNaN(parsed) && parsed >= 100 && parsed <= 10000) {
                        setArtboardW(parsed);
                      }
                    }}
                    className="w-full h-full bg-transparent text-center text-xs font-mono font-bold focus:outline-none text-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(tempArtboardW) || artboardW;
                      const next = Math.min(10000, current + 100);
                      setTempArtboardW(next.toString());
                      setArtboardW(next);
                    }}
                    className="w-8 h-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors font-bold text-xs shrink-0 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Height */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-neutral-400 uppercase font-black tracking-wide">Height (px)</span>
                <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden h-9">
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(tempArtboardH) || artboardH;
                      const next = Math.max(100, current - 100);
                      setTempArtboardH(next.toString());
                      setArtboardH(next);
                    }}
                    className="w-8 h-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors font-bold text-xs shrink-0 cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="text"
                    value={tempArtboardH}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setTempArtboardH(val);
                      const parsed = parseInt(val);
                      if (!isNaN(parsed) && parsed >= 100 && parsed <= 10000) {
                        setArtboardH(parsed);
                      }
                    }}
                    className="w-full h-full bg-transparent text-center text-xs font-mono font-bold focus:outline-none text-amber-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(tempArtboardH) || artboardH;
                      const next = Math.min(10000, current + 100);
                      setTempArtboardH(next.toString());
                      setArtboardH(next);
                    }}
                    className="w-8 h-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors font-bold text-xs shrink-0 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCanvasSizePanel(false);
                  // Trigger a fit/center
                  setTimeout(recenterCanvas, 0);
                }}
                className="flex-1 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-extrabold text-xs rounded-xl uppercase tracking-wider transition-colors cursor-pointer text-center"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const w = Math.max(100, Math.min(10000, parseInt(tempArtboardW) || artboardW));
                  const h = Math.max(100, Math.min(10000, parseInt(tempArtboardH) || artboardH));
                  setArtboardW(w);
                  setArtboardH(h);
                  setTempArtboardW(w.toString());
                  setTempArtboardH(h.toString());
                  setShowCanvasSizePanel(false);
                  
                  // Recenter and lock instantly
                  setTimeout(() => {
                    const scaleX = (dimensions.width - 48) / w;
                    const scaleY = (dimensions.height - 48) / h;
                    const bestScale = Math.min(2.0, Math.max(0.3, Math.min(scaleX, scaleY)));
                    const offsetX = (dimensions.width - w * bestScale) / 2;
                    const offsetY = (dimensions.height - h * bestScale) / 2;
                    setZoomScale(bestScale);
                    setZoomOffset({ x: offsetX, y: offsetY });
                  }, 0);
                }}
                className="flex-1 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-600 hover:to-amber-500 text-neutral-950 font-black text-xs rounded-xl uppercase tracking-wider transition-all cursor-pointer shadow-md text-center"
              >
                Apply & Fit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Canvas controls HUD */}
      <div id="canvas-zoom-hud" className="absolute bottom-4 right-4 flex items-center gap-1 bg-white/95 backdrop-blur-md px-2.5 py-1 rounded-full border border-gray-200 shadow-md pointer-events-auto z-50">
        <button
          id="btn-zoom-out"
          onClick={zoomOut}
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors flex items-center justify-center cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        
        <span className="font-mono text-xs font-bold text-gray-700 select-none min-w-[40px] text-center">
          {Math.round(zoomScale * 100)}%
        </span>

        <button
          id="btn-zoom-in"
          onClick={zoomIn}
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors flex items-center justify-center cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>

        <div className="h-4 w-[1px] bg-gray-200 mx-1" />

        <button
          id="btn-reset-zoom"
          onClick={recenterCanvas}
          className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors flex items-center justify-center cursor-pointer"
          title="Recenter & Fit Canvas to Viewport"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

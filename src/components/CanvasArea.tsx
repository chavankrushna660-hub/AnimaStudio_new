import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { Point, VectorObject, Bone, Pivot, Frame, Transform, RealismSettings } from '../types';
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

// 🌟 Lasso selection deformation point helper
const deformWithLasso = (p: Point, obj: VectorObject): Point => {
  if (
    obj.lassoDeformState && 
    obj.lassoDeformState.active && 
    obj.lassoDeformState.lassoPoints && 
    obj.lassoDeformState.lassoPoints.length >= 3
  ) {
    if (isPointInPolygon(p, obj.lassoDeformState.lassoPoints)) {
      const polygon = obj.lassoDeformState.lassoPoints;
      let sumX = 0;
      let sumY = 0;
      polygon.forEach(pt => {
        sumX += pt.x;
        sumY += pt.y;
      });
      const lassoCenter = { localX: sumX / polygon.length, localY: sumY / polygon.length };
      // Transform local point relative to the lasso polygon's center
      return localToWorld(p, obj.lassoDeformState.transform, lassoCenter);
    }
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

const drawVariableWidthStrokeInternal = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  baseColor: string,
  settings?: RealismSettings,
  widthOffset: number = 0,
  drawShading: boolean = true
) => {
  if (points.length === 0) return;
  if (points.length === 1) {
    const pt = points[0];
    const jX = settings?.microJitterEnabled ? (pt.jitterX ?? 0) : 0;
    const jY = settings?.microJitterEnabled ? (pt.jitterY ?? 0) : 0;
    const w = (pt.w ?? (settings?.maxThickness ?? 3.5)) + widthOffset;
    const taperedW = getTaperWidth(0, 1, w, settings?.autoTaperEnabled ?? true);
    
    ctx.save();
    if (settings?.paperGrainEnabled) {
      ctx.globalAlpha = ctx.globalAlpha * (pt.grainOpacity ?? 1.0);
    }
    ctx.beginPath();
    ctx.arc(pt.x + jX, pt.y + jY, Math.max(0.1, taperedW / 2), 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.restore();
    return;
  }

  // Draw segment by segment
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    
    // Apply micro-jitter
    const jX1 = settings?.microJitterEnabled ? (p1.jitterX ?? 0) : 0;
    const jY1 = settings?.microJitterEnabled ? (p1.jitterY ?? 0) : 0;
    const jX2 = settings?.microJitterEnabled ? (p2.jitterX ?? 0) : 0;
    const jY2 = settings?.microJitterEnabled ? (p2.jitterY ?? 0) : 0;
    
    // Paper Grain
    const gAlpha1 = settings?.paperGrainEnabled ? (p1.grainOpacity ?? 1.0) : 1.0;
    const gAlpha2 = settings?.paperGrainEnabled ? (p2.grainOpacity ?? 1.0) : 1.0;
    const segmentAlpha = (gAlpha1 + gAlpha2) / 2;
    
    // Widths with taper
    const w1 = getTaperWidth(i, points.length, p1.w ?? (settings?.maxThickness ?? 3.5), settings?.autoTaperEnabled ?? true) + widthOffset;
    const w2 = getTaperWidth(i + 1, points.length, p2.w ?? (settings?.maxThickness ?? 3.5), settings?.autoTaperEnabled ?? true) + widthOffset;
    const avgW = Math.max(0.1, (w1 + w2) / 2);
    
    ctx.save();
    
    if (settings?.paperGrainEnabled) {
      ctx.globalAlpha = ctx.globalAlpha * segmentAlpha;
    }
    
    ctx.beginPath();
    ctx.moveTo(p1.x + jX1, p1.y + jY1);
    ctx.lineTo(p2.x + jX2, p2.y + jY2);
    
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = avgW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    ctx.restore();

    // 2.5D Auto-Shading on the Core stroke only
    if (drawShading && settings?.autoShadingEnabled && points.length > 1) {
      const strokeAngle = p2.angle ?? Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const lightRad = (settings.shadingLightAngle ?? 45) * (Math.PI / 180);
      
      const angleDifference = strokeAngle - lightRad;
      const shadingIntensity = Math.cos(angleDifference);
      
      const perpX = -Math.sin(strokeAngle);
      const perpY = Math.cos(strokeAngle);
      
      const shadowOffset = avgW * 0.22;
      const isLeftHighlight = shadingIntensity > 0;
      
      // Highlight: drawn facing the light
      ctx.save();
      ctx.beginPath();
      const hSign = isLeftHighlight ? -1 : 1;
      ctx.moveTo(p1.x + jX1 + hSign * perpX * shadowOffset, p1.y + jY1 + hSign * perpY * shadowOffset);
      ctx.lineTo(p2.x + jX2 + hSign * perpX * shadowOffset, p2.y + jY2 + hSign * perpY * shadowOffset);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = Math.max(0.1, avgW * 0.35);
      ctx.globalAlpha = ctx.globalAlpha * Math.abs(shadingIntensity) * settings.shadingHighlightOpacity;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
      
      // Shadow: drawn facing away from light
      ctx.save();
      ctx.beginPath();
      const sSign = isLeftHighlight ? 1 : -1;
      ctx.moveTo(p1.x + jX1 + sSign * perpX * shadowOffset, p1.y + jY1 + sSign * perpY * shadowOffset);
      ctx.lineTo(p2.x + jX2 + sSign * perpX * shadowOffset, p2.y + jY2 + sSign * perpY * shadowOffset);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(0.1, avgW * 0.4);
      ctx.globalAlpha = ctx.globalAlpha * Math.abs(shadingIntensity) * settings.shadingShadowOpacity;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }
  }
};

const drawVariableWidthStroke = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  baseColor: string,
  settings?: RealismSettings
) => {
  if (settings?.inkBleedEnabled) {
    // PASS 1: Bleed Halo
    ctx.save();
    ctx.filter = `blur(${settings.inkBleedBlur}px)`;
    ctx.globalAlpha = ctx.globalAlpha * settings.inkBleedOpacity;
    
    drawVariableWidthStrokeInternal(ctx, points, baseColor, settings, settings.inkBleedWidthOffset, false);
    ctx.restore();
  }
  
  // PASS 2: Crisp Core & Shading
  drawVariableWidthStrokeInternal(ctx, points, baseColor, settings, 0, true);
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
  realismSettings?: RealismSettings;
  is360WizardActive?: boolean;
  draft360Views?: any[];
  onionSkinEnabled360?: boolean;
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
  realismSettings,
  is360WizardActive = false,
  draft360Views = [],
  onionSkinEnabled360 = true,
}: CanvasAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const backCanvasRef = useRef<HTMLCanvasElement>(null);
  const frontCanvasRef = useRef<HTMLCanvasElement>(null);
  const imagesCacheRef = useRef<{ [url: string]: HTMLImageElement }>({});

  const resolve360Object = (obj: VectorObject, objectsList: { [id: string]: VectorObject }): VectorObject => {
    if (obj.type !== '360_container') return obj;
    const views = obj.views360 || [];
    const closestView = findClosestView360(views, obj.currentAngle360 ?? 0);
    if (!closestView) return obj;
    const targetDrawing = objectsList[closestView.drawingId];
    const anchorDrawingId = views[0]?.drawingId;
    const anchorDrawing = objectsList[anchorDrawingId];
    if (!targetDrawing || !anchorDrawing) return obj;

    const boundsTarget = calculateBoundingBox(targetDrawing.points);
    const boundsAnchor = calculateBoundingBox(anchorDrawing.points);
    
    const txAnchor = anchorDrawing.transform.x;
    const tyAnchor = anchorDrawing.transform.y;
    const txTarget = targetDrawing.transform.x;
    const tyTarget = targetDrawing.transform.y;
    
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
      rotation: obj.transform.rotation + (targetDrawing.transform.rotation - anchorDrawing.transform.rotation),
      scaleX: obj.transform.scaleX * (targetDrawing.transform.scaleX / anchorDrawing.transform.scaleX),
      scaleY: obj.transform.scaleY * (targetDrawing.transform.scaleY / anchorDrawing.transform.scaleY),
    };

    const alignedPoints = targetDrawing.points.map(p => ({
      ...p,
      x: p.x + dx,
      y: p.y + dy
    }));

    const alignedSubPaths = targetDrawing.subPaths?.map(sub => 
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
  const [isDrawingLasso, setIsDrawingLasso] = useState(false);
  
  // Transform & drag gesture state
  const [dragMode, setDragMode] = useState<'none' | 'move' | 'rotate' | 'scale' | 'pivot' | 'pin' | 'meshPoint' | 'meshGridPoint' | 'puppetPin' | 'directRigBone'>('none');
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

  // Get coordinates relative to canvas bounding box with zoom/pan applied
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = frontCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
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
          return {
            x: obj.transform.x + proj.x,
            y: obj.transform.y + proj.y
          };
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
    for (let iter = 0; iter < 3; iter++) {
      for (const bone of bones) {
        const startObj = updatedObjects[bone.startObjectId];
        const endObj = updatedObjects[bone.endObjectId];
        if (!startObj || !endObj) continue;

        const startWorld = localToWorld({ x: bone.startLocalX, y: bone.startLocalY }, startObj.transform, startObj.pivots[0]);
        const endWorld = localToWorld({ x: bone.endLocalX, y: bone.endLocalY }, endObj.transform, endObj.pivots[0]);

        const dist = distance(startWorld, endWorld);
        if (Math.abs(dist - bone.lockedDistance) > 0.01 && !bone.allowDetach) {
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
      if (bone && !bone.allowDetach) {
        const pJoint = localToWorld({ x: bone.startLocalX, y: bone.startLocalY }, parent.transform, parent.pivots[0]);
        const cJoint = localToWorld({ x: bone.endLocalX, y: bone.endLocalY }, child.transform, child.pivots[0]);
        
        const dx = pJoint.x - cJoint.x;
        const dy = pJoint.y - cJoint.y;

        child.transform.x = Number((child.transform.x + dx).toFixed(2));
        child.transform.y = Number((child.transform.y + dy).toFixed(2));
      }

      // Recursively propagate to grandchild objects!
      propagateRigTransforms(updatedObjects, childId, deltaX, deltaY, deltaRot);
    }
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
    // Record active pointer
    activePointersRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    const pointerIds = Object.keys(activePointersRef.current);
    
    if (pointerIds.length === 2) {
      const p1 = activePointersRef.current[Number(pointerIds[0])];
      const p2 = activePointersRef.current[Number(pointerIds[1])];
      
      const dist = distance(p1, p2);
      lastPinchDistRef.current = dist;
      lastPinchMidRef.current = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      };
      
      setDragMode('zoom');
      return;
    }

    const coords = getCanvasCoords(e);
    setCurrentCursorPos(coords);

    // DRIG and BON tool handlers removed to fully clear old bone skeletal rigging code.

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
      setIsDrawingLasso(true);
      setLassoPoints([coords]);
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
      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        if (clickedObj.type === '3d' && clickedObj.vertices3D && clickedObj.faces3D && clickedObj.transform3D) {
          const transformed3D = clickedObj.vertices3D.map(v => transform3DVertex(v, clickedObj.transform3D!.x, clickedObj.transform3D!.y, clickedObj.transform3D!.z, clickedObj.transform3D!.rx, clickedObj.transform3D!.ry, clickedObj.transform3D!.rz, clickedObj.transform3D!.sx, clickedObj.transform3D!.sy, clickedObj.transform3D!.sz));
          const projected = transformed3D.map(v => {
            const proj = project3DVertex(v, 400);
            return {
              x: clickedObj.transform.x + proj.x,
              y: clickedObj.transform.y + proj.y
            };
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
            const paintColors = ['#FF9800', '#E53935', '#2196F3', '#4CAF50', '#9C27B0', '#FFEB3B'];
            // Cycle colors or just use orange as a vivid highlight
            const paintColor = paintColors[targetFaceIdx % paintColors.length];

            setObjects(prev => {
              const updatedObj = { ...prev[clickedObj.id] };
              const updatedFaces = [...(updatedObj.faces3D || [])];
              updatedFaces[targetFaceIdx] = {
                ...updatedFaces[targetFaceIdx],
                baseColor: paintColor,
                fillColor: paintColor
              };
              updatedObj.faces3D = updatedFaces;
              return {
                ...prev,
                [clickedObj.id]: updatedObj
              };
            });
            historyPush();
          }
        } else {
          setObjects(prev => ({
            ...prev,
            [clickedObj.id]: {
              ...prev[clickedObj.id],
              fillColor: '#FF9800'
            }
          }));
          historyPush();
        }
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
            return {
              x: obj.transform.x + proj.x,
              y: obj.transform.y + proj.y
            };
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
            return;
          }
        }
      }

      // If we didn't drag any mesh point, select drawing
      const clickedObj = performHitTest(coords);
      if (clickedObj) {
        setSelectedObjectId(clickedObj.id);
      } else {
        setSelectedObjectId(null);
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
        // Panning when clicking empty space
        setDragMode('pan');
        const canvas = frontCanvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          setDragStartPoint({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          });
        }
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
        setSelectedObjectId(null);
        setDragMode('pan');
        const canvas = frontCanvasRef.current;
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          setDragStartPoint({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
          });
        }
      }
      return;
    }

    // 11. Vector brush drawing logic
    if (activeTool === 'BRS') {
      setIsPlayingState(true);
      const startPt = createRealismPoint(coords, null, realismSettings);
      setStrokePoints([startPt]);
      return;
    }
  };

  // Pointer Move event handler
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Update active pointer tracking coordinate
    if (activePointersRef.current[e.pointerId]) {
      activePointersRef.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    }

    const pointerIds = Object.keys(activePointersRef.current);

    // Multi-touch Zoom (Pinch) Mode
    if (pointerIds.length === 2 && dragMode === 'zoom') {
      const p1 = activePointersRef.current[Number(pointerIds[0])];
      const p2 = activePointersRef.current[Number(pointerIds[1])];
      
      const dist = distance(p1, p2);
      const mid = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2
      };
      
      const factor = dist / (lastPinchDistRef.current || 1);
      const nextScale = Math.min(100, Math.max(0.1, zoomScale * factor));
      
      const canvas = frontCanvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const screenMidX = mid.x - rect.left;
        const screenMidY = mid.y - rect.top;
        
        const worldMidX = (screenMidX - zoomOffset.x) / zoomScale;
        const worldMidY = (screenMidY - zoomOffset.y) / zoomScale;
        
        const nextOffsetX = screenMidX - worldMidX * nextScale;
        const nextOffsetY = screenMidY - worldMidY * nextScale;
        
        const panDx = mid.x - lastPinchMidRef.current.x;
        const panDy = mid.y - lastPinchMidRef.current.y;
        
        setZoomScale(nextScale);
        setZoomOffset({
          x: nextOffsetX + panDx,
          y: nextOffsetY + panDy
        });
      }
      
      lastPinchDistRef.current = dist;
      lastPinchMidRef.current = mid;
      return;
    }

    // Single-finger Pan Mode
    if (dragMode === 'pan') {
      const canvas = frontCanvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const currentScreenX = e.clientX - rect.left;
        const currentScreenY = e.clientY - rect.top;
        const dx = currentScreenX - dragStartPoint.x;
        const dy = currentScreenY - dragStartPoint.y;
        
        setZoomOffset(prev => ({
          x: prev.x + dx,
          y: prev.y + dy
        }));
        
        setDragStartPoint({
          x: currentScreenX,
          y: currentScreenY
        });
      }
      return;
    }

    const coords = getCanvasCoords(e);
    setCurrentCursorPos(coords);

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
              updatedVtx[draggedMeshPointIndex] = {
                x: Number((updatedVtx[draggedMeshPointIndex].x + dx * scaleFactor).toFixed(2)),
                y: Number((updatedVtx[draggedMeshPointIndex].y + dy * scaleFactor).toFixed(2)),
                z: updatedVtx[draggedMeshPointIndex].z
              };
            }
            return {
              ...prev,
              [selectedObjectId]: {
                ...prev[selectedObjectId],
                vertices3D: updatedVtx
              }
            };
          });
        } else {
          const localPos = worldToLocal(coords, obj.transform, obj.pivots[0]);
          setObjects(prev => {
            if (!prev[selectedObjectId]) return prev;
            const updatedPoints = [...prev[selectedObjectId].points];
            updatedPoints[draggedMeshPointIndex] = {
              x: Number(localPos.x.toFixed(2)),
              y: Number(localPos.y.toFixed(2))
            };
            return {
              ...prev,
              [selectedObjectId]: {
                ...prev[selectedObjectId],
                points: updatedPoints
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
      setStrokePoints(prev => {
        const lastPt = prev[prev.length - 1] || null;
        const nextPt = createRealismPoint(coords, lastPt, realismSettings);
        return [...prev, nextPt];
      });
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
  };

  // Pointer Up event handler
  const handlePointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e && e.pointerId !== undefined) {
      delete activePointersRef.current[e.pointerId];
    } else {
      activePointersRef.current = {};
    }

    if (dragMode === 'zoom' || dragMode === 'pan') {
      setDragMode('none');
      return;
    }

    if (dragMode === ('rotate3D' as any)) {
      setDragMode('none');
      historyPush();
      return;
    }

    if (isDrawing && activeTool === 'BRS' && strokePoints.length > 1) {
      const newId = `obj_${Date.now()}`;
      const name = `Stroke_${Object.keys(objects).length + 1}`;
      
      const newObj: VectorObject = {
        id: newId,
        name,
        type: 'stroke',
        points: [...strokePoints],
        strokeColor: '#000000',
        strokeWidth: 3.5,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}`, name: 'Pivot_1', localX: strokePoints[0].x, localY: strokePoints[0].y, locked: false }],
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
              return {
                x: originalObj.transform.x + proj.x,
                y: originalObj.transform.y + proj.y
              };
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

    if (dragMode === 'meshPoint' || dragMode === 'meshGridPoint' || dragMode === 'puppetPin') {
      setDragMode('none');
      setDraggedMeshPointIndex(null);
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
          return {
            x: obj.transform.x + proj.x,
            y: obj.transform.y + proj.y
          };
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
    setStrokePoints([]);
    setIsDrawingLasso(false);
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

    // Clear and Redraw with a solid white background so video capture doesn't record as black
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, frontCanvas.width, frontCanvas.height);

    // Apply viewport zoom and pan offset transformation
    ctx.save();
    ctx.translate(zoomOffset.x, zoomOffset.y);
    ctx.scale(zoomScale, zoomScale);

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

      ctx.save();

      let drawObj = resolve360Object(obj, objects);

      // Calculate warped local points
      const bounds = calculateBoundingBox(drawObj.points);
      let localPoints = drawObj.points;
      
      if (drawObj.lassoDeformState && drawObj.lassoDeformState.active) {
        localPoints = drawObj.points.map(p => deformWithLasso(p, drawObj));
      } else if (drawObj.meshState && drawObj.meshState.active) {
        localPoints = drawObj.points.map(p => getWarpedPoint(p, drawObj.meshState, bounds));
      } else if (drawObj.pins && drawObj.pins.length > 0) {
        localPoints = drawObj.points.map(p => deformWithPuppetPins(p, drawObj.pins));
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
            if (drawObj.lassoDeformState && drawObj.lassoDeformState.active) {
              localSubPoints = sub.map(p => deformWithLasso(p, drawObj));
            } else if (drawObj.meshState && drawObj.meshState.active) {
              const subBounds = calculateBoundingBox(sub);
              localSubPoints = sub.map(p => getWarpedPoint(p, drawObj.meshState, subBounds));
            } else if (drawObj.pins && drawObj.pins.length > 0) {
              localSubPoints = sub.map(p => deformWithPuppetPins(p, drawObj.pins));
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
          return {
            x: drawObj.transform.x + proj.x,
            y: drawObj.transform.y + proj.y
          };
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

        facesWithDepth.forEach(({ face }) => {
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
          const litColor = getFaceLightColor(v0, v1, v2, face.baseColor || '#8D6E63', 45);

          ctx.fillStyle = litColor;
          ctx.fill();

          ctx.lineWidth = drawObj.strokeWidth || 1.2;
          ctx.strokeStyle = drawObj.strokeColor || 'rgba(0,0,0,0.2)';
          ctx.stroke();
        });

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
            ctx.beginPath();
            ctx.arc(p.x, p.y, idx === draggedMeshPointIndex ? 6 : 4, 0, Math.PI * 2);
            ctx.fillStyle = idx === draggedMeshPointIndex ? '#F59E0B' : '#3B82F6';
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
          
          const hasLassoDeform = drawObj.lassoDeformState && drawObj.lassoDeformState.active;
          const hasMeshState = drawObj.meshState && drawObj.meshState.active;
          const hasPuppetPins = drawObj.pins && drawObj.pins.length > 0;

          if (hasLassoDeform || hasMeshState || hasPuppetPins) {
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
                if (hasLassoDeform) {
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
          
          drawVariableWidthStroke(ctx, worldStrokePoints, drawObj.strokeColor, realismSettings);
          
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
              drawVariableWidthStroke(ctx, worldSubPoints, drawObj.strokeColor, realismSettings);
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

      ctx.restore();
    });

    // Draw select overlay bounding boxes & 10+ handles
    if (selectedObjectId && objects[selectedObjectId]) {
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
            ctx.beginPath();
            ctx.arc(mpt.x, mpt.y, 5, 0, Math.PI * 2);
            ctx.fillStyle = (dragMode === 'meshGridPoint' && draggedMeshPointIndex === idx) ? '#F59E0B' : '#3B82F6';
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
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = (dragMode === 'meshPoint' && draggedMeshPointIndex === i) ? '#F59E0B' : '#3B82F6';
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
      drawVariableWidthStroke(ctx, strokePoints, '#000000', realismSettings);
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
    lassoPoints
  ]);

  return (
    <div ref={containerRef} className="flex-1 bg-white relative overflow-hidden select-none">
      {/* Double canvas layout for background / overlays optimization */}
      <canvas
        ref={backCanvasRef}
        width={1000}
        height={700}
        className="absolute inset-0 pointer-events-none"
      />
      <canvas
        ref={frontCanvasRef}
        id="front-vector-canvas"
        width={1000}
        height={700}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="absolute inset-0 cursor-crosshair touch-none"
      />

      {/* Floating Canvas controls HUD */}
      <div id="canvas-zoom-hud" className="absolute bottom-4 right-4 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full border border-gray-200 shadow-md pointer-events-auto z-50">
        <span className="font-mono text-xs font-semibold text-gray-700 select-none">
          {Math.round(zoomScale * 100)}%
        </span>
        <div className="h-3 w-[1px] bg-gray-200" />
        <button
          id="btn-reset-zoom"
          onClick={() => {
            setZoomScale(1);
            setZoomOffset({ x: 0, y: 0 });
          }}
          className="p-1 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors flex items-center justify-center cursor-pointer"
          title="Reset Canvas Zoom & Pan (100%)"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

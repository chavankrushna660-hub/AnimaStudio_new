import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronLeft,
  ChevronDown,
  Settings, 
  Trash2, 
  Plus, 
  Lock, 
  Unlock, 
  Scale, 
  RotateCw, 
  Move,
  CheckSquare,
  Square as SquareIcon,
  Layers,
  Workflow,
  Sparkles,
  Feather,
  GitMerge,
  Maximize2,
  Folder,
  FolderPlus,
  Link,
  Unlink,
  Play,
  Zap,
  Info,
  Box,
  Palette,
  MapPin
} from 'lucide-react';
import { VectorObject, Bone, Layer, Pivot, Transform, Point, Frame, RealismSettings, SmartMeshColorState, SmartWarpState, ColorMeshPoint, ColorMeshCell, BrushSettings } from '../types';
import { distance, localToWorld, worldToLocal, calculateBoundingBox, isPointInPolygon, findClosestView360 } from '../utils/math';
import { extrude2DTo3D, deleteFace3D, extrudeFace3D, extrudeEdge3D } from '../utils/engine3D';

const hslToHex = (h: number, s: number = 100, l: number = 50): string => {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    const hex = Math.round(255 * color).toString(16).padStart(2, '0');
    return hex;
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
};

const hexToHue = (hex: string): number => {
  let r = 0, g = 0, b = 0;
  const hClean = hex.replace('#', '');
  if (hClean.length === 3) {
    r = parseInt(hClean[0] + hClean[0], 16);
    g = parseInt(hClean[1] + hClean[1], 16);
    b = parseInt(hClean[2] + hClean[2], 16);
  } else if (hClean.length === 6) {
    r = parseInt(hClean.substring(0, 2), 16);
    g = parseInt(hClean.substring(2, 4), 16);
    b = parseInt(hClean.substring(4, 6), 16);
  } else {
    return 220; // default to blue hue
  }
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  if (max === min) {
    h = 0;
  } else {
    const d = max - min;
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return Math.round(h * 360);
};

interface RightPanelProps {
  selectedObject: VectorObject | null;
  setSelectedObjectId: (id: string | null) => void;
  updateObject: (id: string, updates: Partial<VectorObject>) => void;
  deleteObject: (id: string) => void;
  objects: { [id: string]: VectorObject };
  bones: Bone[];
  addBone: (bone: Bone) => void;
  deleteBone: (id: string) => void;
  updateBone: (id: string, updates: Partial<Bone>) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  smartPinnedIds: string[]; // List of object IDs pinned to Smart Controls
  toggleSmartPin: (id: string) => void;
  activeTool: string;
  setActiveTool: (tool: string) => void;
  lassoPoints: Point[];
  setLassoPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  lassoMode: 'freehand' | 'pen';
  setLassoMode: (mode: 'freehand' | 'pen') => void;
  penLassoPoints: Point[];
  setPenLassoPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  frames: Frame[];
  setFrames: React.Dispatch<React.SetStateAction<Frame[]>>;
  currentFrameIndex: number;
  setCurrentFrameIndex: React.Dispatch<React.SetStateAction<number>>;
  setObjects: React.Dispatch<React.SetStateAction<{ [id: string]: VectorObject }>>;
  fps: number;
  setFps: (fps: number) => void;
  realismSettings?: RealismSettings;
  setRealismSettings?: React.Dispatch<React.SetStateAction<RealismSettings>>;
  convertTo3D?: (id: string) => void;
  brushSettings?: BrushSettings;
  setBrushSettings?: React.Dispatch<React.SetStateAction<BrushSettings>>;
}

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
  const childWorldPoints = child.points.map(p => localToWorld(p, testTransform, childPivot));

  // Check if every child world point is inside the parent polygon
  return childWorldPoints.every(pt => isPointInPolygon(pt, parentWorldPoints));
};

export default function RightPanel({
  selectedObject,
  setSelectedObjectId,
  updateObject,
  deleteObject,
  objects,
  bones,
  addBone,
  deleteBone,
  updateBone,
  open,
  setOpen,
  smartPinnedIds,
  toggleSmartPin,
  activeTool,
  setActiveTool,
  lassoPoints,
  setLassoPoints,
  lassoMode,
  setLassoMode,
  penLassoPoints,
  setPenLassoPoints,
  frames,
  setFrames,
  currentFrameIndex,
  setCurrentFrameIndex,
  setObjects,
  fps,
  setFps,
  realismSettings,
  setRealismSettings,
  convertTo3D,
  brushSettings,
  setBrushSettings,
}: RightPanelProps) {
  // Batch/Smart Controls check state
  const [smartCheckedIds, setSmartCheckedIds] = useState<{ [id: string]: boolean }>({});
  const [faceExtrudeDist, setFaceExtrudeDist] = useState<number>(30);
  const [edgeExtrudeDist, setEdgeExtrudeDist] = useState<number>(30);

  const isLassoActive = !!selectedObject?.lassoDeformState?.active;
  const currentTransformObj = selectedObject 
    ? (isLassoActive 
        ? (selectedObject.lassoDeformState?.transform || { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0 })
        : selectedObject.transform)
    : null;

  // AI Smooth Motion & Loop Generator States
  const [animationMode, setAnimationMode] = useState<'single' | 'multi'>('single');
  const [singleStartFrame, setSingleStartFrame] = useState(0);
  const [singleEndFrame, setSingleEndFrame] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [easeType, setEaseType] = useState<'linear' | 'easeIn' | 'easeOut' | 'easeInOut'>('linear');

  const [multiRefStartFrame, setMultiRefStartFrame] = useState(0);
  const [multiRefEndFrame, setMultiRefEndFrame] = useState(0);
  const [multiEndPosFrame, setMultiEndPosFrame] = useState(0);

  // Sync default frame limits when frames length changes
  React.useEffect(() => {
    if (singleEndFrame === 0 || singleEndFrame >= frames.length) {
      setSingleEndFrame(Math.max(0, frames.length - 1));
    }
    if (multiRefEndFrame === 0 || multiRefEndFrame >= frames.length) {
      setMultiRefEndFrame(Math.max(0, Math.max(0, frames.length - 2)));
    }
    if (multiEndPosFrame === 0 || multiEndPosFrame >= frames.length) {
      setMultiEndPosFrame(Math.max(0, frames.length - 1));
    }
  }, [frames.length]);
  
  // Opposite Controls State
  const [oppositeSection1, setOppositeSection1] = useState<string[]>([]);
  const [oppositeSection2, setOppositeSection2] = useState<string[]>([]);
  const [oppositeMode, setOppositeMode] = useState<'rotation' | 'moveX' | 'moveY'>('rotation');

  // Lasso Color Fill state
  const [lassoColor, setLassoColor] = useState('#E53935');

  // Smart Mesh Coloring State
  const [brushColor, setBrushColor] = useState('#10b981');

  const handleInitMeshColor = (obj: VectorObject, densityX: number, densityY: number) => {
    const bounds = calculateBoundingBox(obj.points.length > 0 ? obj.points : [{ x: -100, y: -100 }, { x: 100, y: 100 }]);
    const w = bounds.width || 200;
    const h = bounds.height || 200;
    const bx = bounds.x;
    const by = bounds.y;

    const cellWidth = w / (densityX - 1);
    const cellHeight = h / (densityY - 1);

    const points: ColorMeshPoint[] = [];
    const cells: ColorMeshCell[] = [];

    for (let y = 0; y < densityY; y++) {
      for (let x = 0; x < densityX; x++) {
        const px = bx + x * cellWidth;
        const py = by + y * cellHeight;
        points.push({
          id: `mcl_pt_${x}_${y}`,
          originalX: px,
          originalY: py,
          currentX: px,
          currentY: py,
          color: null,
          opacity: 1
        });
      }
    }

    for (let y = 0; y < densityY - 1; y++) {
      for (let x = 0; x < densityX - 1; x++) {
        const topLeftIdx = y * densityX + x;
        const topRightIdx = y * densityX + (x + 1);
        const bottomRightIdx = (y + 1) * densityX + (x + 1);
        const bottomLeftIdx = (y + 1) * densityX + x;

        cells.push({
          id: `mcl_cell_${x}_${y}`,
          pointIds: [
            points[topLeftIdx].id,
            points[topRightIdx].id,
            points[bottomRightIdx].id,
            points[bottomLeftIdx].id
          ],
          color: null,
          opacity: 1
        });
      }
    }

    const smartMeshColor: SmartMeshColorState = {
      densityX,
      densityY,
      points,
      cells,
      pointSize: 20,
      paintMode: 'cell',
      brushSize: 40,
      brushOpacity: 1.0,
      brushColor: '#10b981',
      activeLayerIndex: 0,
      previewMode: true,
      layers: [
        { id: 'mcl_layer_0', name: 'Base Color Layer', visible: true, locked: false }
      ]
    };

    updateObject(obj.id, { smartMeshColor });
  };

  const handleUpdateMeshColorConfig = (updates: Partial<SmartMeshColorState>) => {
    if (!selectedObject || !selectedObject.smartMeshColor) return;
    updateObject(selectedObject.id, {
      smartMeshColor: {
        ...selectedObject.smartMeshColor,
        ...updates
      }
    });
  };

  const handleAddMeshColorLayer = () => {
    if (!selectedObject || !selectedObject.smartMeshColor) return;
    const layers = [...selectedObject.smartMeshColor.layers];
    const newIdx = layers.length;
    layers.push({
      id: `mcl_layer_${Date.now()}`,
      name: `Layer ${newIdx + 1}`,
      visible: true,
      locked: false
    });
    handleUpdateMeshColorConfig({
      layers,
      activeLayerIndex: newIdx
    });
  };

  const handleDeleteMeshColorLayer = (idx: number) => {
    if (!selectedObject || !selectedObject.smartMeshColor) return;
    const layers = selectedObject.smartMeshColor.layers.filter((_, i) => i !== idx);
    const activeLayerIndex = Math.min(selectedObject.smartMeshColor.activeLayerIndex, layers.length - 1);
    handleUpdateMeshColorConfig({
      layers,
      activeLayerIndex
    });
  };

  const handleToggleMeshColorLayerVis = (idx: number) => {
    if (!selectedObject || !selectedObject.smartMeshColor) return;
    const layers = selectedObject.smartMeshColor.layers.map((l, i) => i === idx ? { ...l, visible: !l.visible } : l);
    handleUpdateMeshColorConfig({ layers });
  };

  const handleClearMeshColors = (obj: VectorObject) => {
    if (!obj.smartMeshColor) return;
    const points = obj.smartMeshColor.points.map(p => ({ ...p, color: null }));
    const cells = obj.smartMeshColor.cells.map(c => ({ ...c, color: null }));
    updateObject(obj.id, {
      smartMeshColor: {
        ...obj.smartMeshColor,
        points,
        cells
      }
    });
  };

  const handleInitSmartWarp = (obj: VectorObject) => {
    const smartWarp: SmartWarpState = {
      pins: [],
      pinSize: 30,
      influenceRadius: 120,
      influenceFalloff: 'smooth',
      showInfluenceArea: true,
      previewMode: true
    };
    updateObject(obj.id, { smartWarp });
  };

  const handleUpdateSmartWarpConfig = (updates: Partial<SmartWarpState>) => {
    if (!selectedObject || !selectedObject.smartWarp) return;
    updateObject(selectedObject.id, {
      smartWarp: {
        ...selectedObject.smartWarp,
        ...updates
      }
    });
  };

  const handleTogglePinLock = (pinId: string) => {
    if (!selectedObject || !selectedObject.smartWarp) return;
    const pins = selectedObject.smartWarp.pins.map(p => p.id === pinId ? { ...p, locked: !p.locked } : p);
    handleUpdateSmartWarpConfig({ pins });
  };

  const handleDeletePin = (pinId: string) => {
    if (!selectedObject || !selectedObject.smartWarp) return;
    const pins = selectedObject.smartWarp.pins.filter(p => p.id !== pinId);
    handleUpdateSmartWarpConfig({ pins });
  };

  const handleResetWarpPins = (obj: VectorObject) => {
    if (!obj.smartWarp) return;
    const updates: Partial<VectorObject> = {
      smartWarp: {
        ...obj.smartWarp,
        pins: []
      }
    };
    if (obj.originalPointsBackup) {
      updates.points = [...obj.originalPointsBackup];
    }
    if (obj.originalSubPathsBackup) {
      updates.subPaths = [...obj.originalSubPathsBackup];
    }
    updateObject(obj.id, updates);
  };

  // Permanent Attachment state
  const [attachmentPieces, setAttachmentPieces] = useState<string[]>([]);
  const [attachSelectedId, setAttachSelectedId] = useState('');

  // Lasso handlers
  const handleApplyLassoFill = () => {
    if (lassoPoints.length < 3) {
      alert("Please draw a closed lasso region on the canvas first!");
      return;
    }
    
    // If selectedObject exists, fill it. Otherwise fill all drawings!
    let targetObjects = selectedObject ? [selectedObject] : Object.values(objects);
    
    if (targetObjects.length === 0) {
      alert("No drawings available to fill.");
      return;
    }

    targetObjects.forEach(obj => {
      const localPivot = obj.pivots[0] || { localX: 0, localY: 0 };
      const localLassoPoints = lassoPoints.map(wp => worldToLocal(wp, obj.transform, localPivot));
      
      const currentFills = obj.lassoFills || [];
      const updatedFills = [...currentFills, { localLassoPoints, color: lassoColor }];
      
      updateObject(obj.id, { lassoFills: updatedFills });
    });

    setLassoPoints([]);
    setActiveTool('SEL');
  };

  const handleClearLassoFills = () => {
    if (selectedObject) {
      updateObject(selectedObject.id, { lassoFills: [] });
    } else {
      Object.values(objects).forEach(obj => {
        if (obj.lassoFills && obj.lassoFills.length > 0) {
          updateObject(obj.id, { lassoFills: [] });
        }
      });
    }
  };

  const handleRemoveLassoArea = () => {
    setLassoPoints([]);
  };

  // Attachment Handlers
  const handleAddAttachmentPiece = (id: string) => {
    if (!id) return;
    if (attachmentPieces.includes(id)) return;
    setAttachmentPieces(prev => [...prev, id]);
    setAttachSelectedId('');
  };

  const handleExecuteAttach = () => {
    const allIdsToAttach = [...attachmentPieces];
    if (selectedObject && !allIdsToAttach.includes(selectedObject.id)) {
      allIdsToAttach.push(selectedObject.id);
    }

    if (allIdsToAttach.length < 2) {
      alert("Please add at least 2 drawings to attach.");
      return;
    }

    const newGroupId = `attach_gp_${Date.now()}`;

    allIdsToAttach.forEach(id => {
      updateObject(id, { attachedGroupId: newGroupId });
    });

    setAttachmentPieces([]);
    alert(`Successfully attached ${allIdsToAttach.length} drawings together! They are now locked to move as a group.`);
  };

  const handleDetachObject = () => {
    if (!selectedObject) return;
    if (selectedObject.type === '3d' || (selectedObject.parentId && objects[selectedObject.parentId]?.type === '3d')) {
      alert("Rigged 3D objects are permanently locked for safety and performance to prevent physics and skinning decoupling.");
      return;
    }
    updateObject(selectedObject.id, { attachedGroupId: undefined });
    alert(`Successfully detached ${selectedObject.name}.`);
  };

  // AI Smooth Motion & Loop Generator handlers
  const [hasBackup, setHasBackup] = useState(!!localStorage.getItem('generator_original_frames_backup'));

  const handleRestoreBackup = () => {
    const backup = localStorage.getItem('generator_original_frames_backup');
    if (backup) {
      const parsed = JSON.parse(backup);
      setFrames(parsed);
      if (parsed[0]) {
        setObjects(parsed[0].objects);
      }
      setCurrentFrameIndex(0);
      alert("Successfully restored original reference frames!");
    }
  };

  const interpolateTransform = (tStart: Transform, tEnd: Transform, t: number): Transform => {
    const rotStart = tStart.rotation ?? 0;
    const rotEnd = tEnd.rotation ?? 0;
    const rotation = rotStart + t * (rotEnd - rotStart);

    return {
      x: Number((tStart.x + t * (tEnd.x - tStart.x)).toFixed(2)),
      y: Number((tStart.y + t * (tEnd.y - tStart.y)).toFixed(2)),
      rotation: Number(rotation.toFixed(2)),
      scaleX: Number(((tStart.scaleX ?? 1) + t * ((tEnd.scaleX ?? 1) - (tStart.scaleX ?? 1))).toFixed(2)),
      scaleY: Number(((tStart.scaleY ?? 1) + t * ((tEnd.scaleY ?? 1) - (tStart.scaleY ?? 1))).toFixed(2)),
      skewX: tStart.skewX !== undefined && tEnd.skewX !== undefined ? Number((tStart.skewX + t * (tEnd.skewX - tStart.skewX)).toFixed(2)) : tStart.skewX,
      skewY: tStart.skewY !== undefined && tEnd.skewY !== undefined ? Number((tStart.skewY + t * (tEnd.skewY - tStart.skewY)).toFixed(2)) : tStart.skewY,
      rotateX: tStart.rotateX !== undefined && tEnd.rotateX !== undefined ? Number((tStart.rotateX + t * (tEnd.rotateX - tStart.rotateX)).toFixed(2)) : tStart.rotateX,
      rotateY: tStart.rotateY !== undefined && tEnd.rotateY !== undefined ? Number((tStart.rotateY + t * (tEnd.rotateY - tStart.rotateY)).toFixed(2)) : tStart.rotateY,
      perspective: tStart.perspective !== undefined && tEnd.perspective !== undefined ? Number((tStart.perspective + t * (tEnd.perspective - tStart.perspective)).toFixed(2)) : tStart.perspective,
    };
  };

  const handleGenerateSingleStep = () => {
    if (frames.length < 2) {
      alert("Please add at least 2 frames (Start & End) to generate an animation.");
      return;
    }
    
    const F = Math.round(durationSeconds * fps);
    if (F < 2) {
      alert("Please select a longer duration or higher FPS to generate at least 2 frames.");
      return;
    }

    const startIdx = Math.max(0, Math.min(singleStartFrame, frames.length - 1));
    const endIdx = Math.max(0, Math.min(singleEndFrame, frames.length - 1));

    if (startIdx === endIdx) {
      alert("Start and End frames must be different.");
      return;
    }

    // Save backup first
    localStorage.setItem('generator_original_frames_backup', JSON.stringify(frames));
    setHasBackup(true);

    const startFrameObjects = frames[startIdx].objects;
    const endFrameObjects = frames[endIdx].objects;

    const newFrames: Frame[] = [];

    for (let i = 0; i < F; i++) {
      const rawT = i / (F - 1);
      
      // Apply Easing
      let t = rawT;
      if (easeType === 'easeIn') {
        t = rawT * rawT;
      } else if (easeType === 'easeOut') {
        t = rawT * (2 - rawT);
      } else if (easeType === 'easeInOut') {
        t = rawT < 0.5 ? 2 * rawT * rawT : -1 + (4 - 2 * rawT) * rawT;
      }

      const frameObjects: { [objectId: string]: any } = {};

      const allObjIds = Array.from(new Set([
        ...Object.keys(startFrameObjects),
        ...Object.keys(endFrameObjects)
      ]));

      allObjIds.forEach(objId => {
        const startObj = startFrameObjects[objId];
        const endObj = endFrameObjects[objId];

        if (startObj && endObj) {
          const interpolatedTransform = interpolateTransform(startObj.transform, endObj.transform, t);

          let points = startObj.points;
          if (startObj.points && endObj.points && startObj.points.length === endObj.points.length) {
            points = startObj.points.map((p, pIdx) => {
              const ep = endObj.points[pIdx];
              return {
                x: Number((p.x + t * (ep.x - p.x)).toFixed(2)),
                y: Number((p.y + t * (ep.y - p.y)).toFixed(2))
              };
            });
          }

          let subPaths = startObj.subPaths;
          if (startObj.subPaths && endObj.subPaths && startObj.subPaths.length === endObj.subPaths.length) {
            subPaths = startObj.subPaths.map((path, pathIdx) => {
              const ePath = endObj.subPaths[pathIdx];
              if (path.length === ePath.length) {
                return path.map((pt, ptIdx) => {
                  const ePt = ePath[ptIdx];
                  return {
                    x: Number((pt.x + t * (ePt.x - pt.x)).toFixed(2)),
                    y: Number((pt.y + t * (ePt.y - pt.y)).toFixed(2))
                  };
                });
              }
              return path;
            });
          }

          let pivots = startObj.pivots;
          if (startObj.pivots && endObj.pivots && startObj.pivots.length === endObj.pivots.length) {
            pivots = startObj.pivots.map((pvt, pvtIdx) => {
              const ePvt = endObj.pivots[pvtIdx];
              return {
                ...pvt,
                localX: Number((pvt.localX + t * (ePvt.localX - pvt.localX)).toFixed(2)),
                localY: Number((pvt.localY + t * (ePvt.localY - pvt.localY)).toFixed(2)),
              };
            });
          }

          const opacity = startObj.opacity !== undefined && endObj.opacity !== undefined
            ? Number((startObj.opacity + t * (endObj.opacity - startObj.opacity)).toFixed(2))
            : startObj.opacity;

          frameObjects[objId] = {
            ...startObj,
            transform: interpolatedTransform,
            points,
            subPaths,
            pivots,
            opacity,
          };
        } else if (startObj) {
          frameObjects[objId] = JSON.parse(JSON.stringify(startObj));
        } else if (endObj) {
          frameObjects[objId] = JSON.parse(JSON.stringify(endObj));
        }
      });

      newFrames.push({
        index: i,
        objects: frameObjects,
      });
    }

    setFrames(newFrames);
    setObjects(JSON.parse(JSON.stringify(newFrames[0].objects)));
    setCurrentFrameIndex(0);
    alert(`Successfully generated smooth single-step animation with ${F} frames! Click Play to view.`);
  };

  const handleGenerateMultiStep = () => {
    if (frames.length < 2) {
      alert("Please add at least 2 frames to generate a walk cycle/loop.");
      return;
    }

    const F = Math.round(durationSeconds * fps);
    if (F < 2) {
      alert("Please select a longer duration or higher FPS to generate at least 2 frames.");
      return;
    }

    const refStart = Math.max(0, Math.min(multiRefStartFrame, frames.length - 1));
    const refEnd = Math.max(0, Math.min(multiRefEndFrame, frames.length - 1));
    const endPosIdx = Math.max(0, Math.min(multiEndPosFrame, frames.length - 1));

    if (refStart > refEnd) {
      alert("Walk cycle reference Start Frame must be less than or equal to End Frame.");
      return;
    }

    const M = refEnd - refStart + 1;

    // Save backup first
    localStorage.setItem('generator_original_frames_backup', JSON.stringify(frames));
    setHasBackup(true);

    const startFrameObjects = frames[refStart].objects;
    const endFrameObjects = frames[endPosIdx].objects;

    const journeyVectors: { [objId: string]: { dx: number; dy: number } } = {};
    let totalDx = 0;
    let totalDy = 0;
    let countMatched = 0;

    Object.keys(startFrameObjects).forEach(objId => {
      const startObj = startFrameObjects[objId];
      const endObj = endFrameObjects[objId];
      if (startObj && endObj) {
        const dx = endObj.transform.x - startObj.transform.x;
        const dy = endObj.transform.y - startObj.transform.y;
        journeyVectors[objId] = { dx, dy };
        totalDx += dx;
        totalDy += dy;
        countMatched++;
      }
    });

    const avgDx = countMatched > 0 ? totalDx / countMatched : 0;
    const avgDy = countMatched > 0 ? totalDy / countMatched : 0;

    const newFrames: Frame[] = [];

    for (let i = 0; i < F; i++) {
      const rawT = i / (F - 1);
      
      let t = rawT;
      if (easeType === 'easeIn') {
        t = rawT * rawT;
      } else if (easeType === 'easeOut') {
        t = rawT * (2 - rawT);
      } else if (easeType === 'easeInOut') {
        t = rawT < 0.5 ? 2 * rawT * rawT : -1 + (4 - 2 * rawT) * rawT;
      }

      const refIdx = refStart + (i % M);
      const refObjects = frames[refIdx].objects;

      const frameObjects: { [objId: string]: any } = {};

      Object.keys(refObjects).forEach(objId => {
        const refObj = refObjects[objId];
        if (!refObj) return;

        const jVec = journeyVectors[objId] || { dx: avgDx, dy: avgDy };

        const translatedTransform = {
          ...refObj.transform,
          x: Number((refObj.transform.x + t * jVec.dx).toFixed(2)),
          y: Number((refObj.transform.y + t * jVec.dy).toFixed(2))
        };

        frameObjects[objId] = {
          ...JSON.parse(JSON.stringify(refObj)),
          transform: translatedTransform
        };
      });

      newFrames.push({
        index: i,
        objects: frameObjects
      });
    }

    setFrames(newFrames);
    setObjects(JSON.parse(JSON.stringify(newFrames[0].objects)));
    setCurrentFrameIndex(0);
    alert(`Successfully generated walk cycle loop with ${F} frames! Poses repeat, and position glides seamlessly to the target location.`);
  };

  // Hierarchy Management & Auto-Rigging
  const [expandedNodes, setExpandedNodes] = useState<{ [id: string]: boolean }>({});
  const [activeMenuObjectId, setActiveMenuObjectId] = useState<string | null>(null);
  const [activeMenuType, setActiveMenuType] = useState<'options' | 'addChild' | 'addSibling' | null>(null);

  // Merge pieces state (Make Single Drawing)
  const [mergePieces, setMergePieces] = useState<string[]>([]);
  const [isMergeDropdownOpen, setIsMergeDropdownOpen] = useState(false);

  React.useEffect(() => {
    setMergePieces([]);
    setIsMergeDropdownOpen(false);
  }, [selectedObject?.id]);

  const handleMakeSingle = () => {
    if (!selectedObject || mergePieces.length === 0) return;

    const primary = selectedObject;
    const primaryPivot = primary.pivots[0] || { localX: 0, localY: 0 };
    let newSubPaths = [...(primary.subPaths || [])];

    mergePieces.forEach(secondaryId => {
      const secondary = objects[secondaryId];
      if (!secondary) return;

      const secondaryPivot = secondary.pivots[0] || { localX: 0, localY: 0 };

      // Convert main points
      const convertedMainPath = secondary.points.map(p => {
        const worldPt = localToWorld(p, secondary.transform, secondaryPivot);
        return worldToLocal(worldPt, primary.transform, primaryPivot);
      });
      if (convertedMainPath.length > 0) {
        newSubPaths.push(convertedMainPath);
      }

      // Convert subpaths
      if (secondary.subPaths && secondary.subPaths.length > 0) {
        secondary.subPaths.forEach(sub => {
          const convertedSubPath = sub.map(p => {
            const worldPt = localToWorld(p, secondary.transform, secondaryPivot);
            return worldToLocal(worldPt, primary.transform, primaryPivot);
          });
          if (convertedSubPath.length > 0) {
            newSubPaths.push(convertedSubPath);
          }
        });
      }

      // Delete the secondary object
      deleteObject(secondaryId);
    });

    // Update primary with merged paths
    updateObject(primary.id, {
      subPaths: newSubPaths
    });

    // Reset local merge state
    setMergePieces([]);
    setIsMergeDropdownOpen(false);
  };

  // Mesh wrap generator helper
  const handleInitMesh = (densityX: number, densityY: number) => {
    if (!selectedObject) return;
    const bounds = calculateBoundingBox(selectedObject.points);
    const points: any[] = [];
    const stepX = bounds.width / (densityX - 1);
    const stepY = bounds.height / (densityY - 1);
    for (let y = 0; y < densityY; y++) {
      for (let x = 0; x < densityX; x++) {
        const px = bounds.x + x * stepX;
        const py = bounds.y + y * stepY;
        points.push({
          id: `mpt_${Date.now()}_${y}_${x}`,
          originalX: px,
          originalY: py,
          currentX: px,
          currentY: py,
          pinned: false,
          pinType: null
        });
      }
    }
    updateObject(selectedObject.id, {
      meshState: {
        active: true,
        densityX,
        densityY,
        points,
        originalPoints: JSON.parse(JSON.stringify(points)),
        pointSize: 30,
        showGrid: true,
        showPoints: true,
        previewMode: true
      }
    });
  };

  const handleStyleChange = (effect: 'shadow' | 'innerShadow' | 'rimLight' | 'overlay', updates: any) => {
    if (!selectedObject) return;
    const currentEffect = selectedObject[effect] || {};
    updateObject(selectedObject.id, {
      [effect]: {
        ...currentEffect,
        ...updates
      }
    });
  };

  const relateChildToParent = (parentId: string, childId: string) => {
    if (parentId === childId) return;
    const parentObj = objects[parentId];
    const childObj = objects[childId];
    if (!parentObj || !childObj) return;

    // Detect Circular reference
    let current: VectorObject | null = parentObj;
    while (current) {
      if (current.id === childId) {
        alert(`Circular dependency detected! ${childObj.name} is already an ancestor of ${parentObj.name}.`);
        return;
      }
      current = current.parentId ? objects[current.parentId] : null;
    }

    // Auto-create pivots if missing for parent
    let parentPivot = parentObj.pivots?.[0];
    if (!parentPivot) {
      const pBox = calculateBoundingBox(parentObj.points);
      const pLocalX = pBox.x + pBox.width / 2;
      const pLocalY = pBox.y + pBox.height / 2;
      parentPivot = {
        id: `pvt_${Date.now()}_p`,
        name: `Pivot_1`,
        localX: Number(pLocalX.toFixed(2)),
        localY: Number(pLocalY.toFixed(2)),
        locked: false
      };
      updateObject(parentObj.id, { pivots: [parentPivot] });
    }

    let childPivot = childObj.pivots?.[0];
    if (!childPivot) {
      const cBox = calculateBoundingBox(childObj.points);
      const cLocalX = cBox.x + cBox.width / 2;
      const cLocalY = cBox.y + cBox.height / 2;
      childPivot = {
        id: `pvt_${Date.now()}_c`,
        name: `Pivot_1`,
        localX: Number(cLocalX.toFixed(2)),
        localY: Number(cLocalY.toFixed(2)),
        locked: false
      };
      updateObject(childObj.id, { pivots: [childPivot] });
    }

    // Relate child to parent in state
    updateObject(childObj.id, { parentId: parentObj.id });

    // Also update parent's childrenIds to include childId
    const currentChildren = parentObj.childrenIds || [];
    if (!currentChildren.includes(childId)) {
      updateObject(parentObj.id, { childrenIds: [...currentChildren, childId] });
    }

    // Check if there is already a bone between them. If not, create one!
    const boneExists = bones.some(b => 
      (b.startObjectId === parentObj.id && b.endObjectId === childObj.id) ||
      (b.startObjectId === childObj.id && b.endObjectId === parentObj.id)
    );

    if (!boneExists) {
      // Determine lock joint connection points
      const startWorld = localToWorld({ x: parentPivot.localX, y: parentPivot.localY }, parentObj.transform, parentPivot);
      const childLocalJoint = worldToLocal(startWorld, childObj.transform, childPivot);

      const newBone: Bone = {
        id: `bone_${Date.now()}`,
        name: `${parentObj.name}_to_${childObj.name}`,
        startObjectId: parentObj.id,
        endObjectId: childObj.id,
        startLocalX: parentPivot.localX,
        startLocalY: parentPivot.localY,
        endLocalX: Number(childLocalJoint.x.toFixed(2)),
        endLocalY: Number(childLocalJoint.y.toFixed(2)),
        lockedDistance: 0, // perfect joint lock at 0 distance in world space
        allowDetach: false,
        minAngle: -180,
        maxAngle: 180,
        enableConstraints: true,
      };

      addBone(newBone);
    }
  };

  const handleRemoveFromParent = (childId: string) => {
    const child = objects[childId];
    if (!child) return;
    const pId = child.parentId;
    
    // Once a 3D model is rigged or has parent-child relationships, they cannot be detached!
    if (child.type === '3d' || (pId && objects[pId]?.type === '3d')) {
      alert("Rigged 3D objects are permanently locked for safety and performance to prevent physics and skinning decoupling.");
      return;
    }
    
    // Update child
    updateObject(childId, { parentId: null });

    // Update parent's childrenIds list
    if (pId && objects[pId]) {
      const parent = objects[pId];
      updateObject(pId, {
        childrenIds: (parent.childrenIds || []).filter(id => id !== childId)
      });
    }

    // Delete associated bones
    const bonesToDelete = bones.filter(b => 
      (b.startObjectId === pId && b.endObjectId === childId) ||
      (b.startObjectId === childId && b.endObjectId === pId)
    );
    bonesToDelete.forEach(b => deleteBone(b.id));
  };

  // Direct connection creation state
  const [connDrawingA, setConnDrawingA] = useState<string>('');
  const [connDrawingB, setConnDrawingB] = useState<string>('');
  const [parentSelection, setParentSelection] = useState<'A_is_parent' | 'B_is_parent'>('A_is_parent');

  const handleCreateDirectConnection = () => {
    if (!connDrawingA || !connDrawingB) {
      alert('Please select both drawings first.');
      return;
    }
    if (connDrawingA === connDrawingB) {
      alert('Cannot connect a drawing to itself.');
      return;
    }

    const objA = objects[connDrawingA];
    const objB = objects[connDrawingB];
    if (!objA || !objB) return;

    const parentObj = parentSelection === 'A_is_parent' ? objA : objB;
    const childObj = parentSelection === 'A_is_parent' ? objB : objA;

    // Check circular dependencies
    let current: VectorObject | null = parentObj;
    while (current && current.parentId) {
      if (current.parentId === childObj.id) {
        alert(`Circular dependency detected! ${childObj.name} is already an ancestor of ${parentObj.name}.`);
        return;
      }
      current = objects[current.parentId];
    }

    // Auto-create pivots if missing
    let parentPivot = parentObj.pivots[0];
    if (!parentPivot) {
      const pBox = calculateBoundingBox(parentObj.points);
      const pLocalX = pBox.x + pBox.width / 2;
      const pLocalY = pBox.y + pBox.height / 2;
      parentPivot = {
        id: `pvt_${Date.now()}_p`,
        name: `Pivot_1`,
        localX: Number(pLocalX.toFixed(2)),
        localY: Number(pLocalY.toFixed(2)),
        locked: false
      };
      updateObject(parentObj.id, { pivots: [parentPivot] });
    }

    let childPivot = childObj.pivots[0];
    if (!childPivot) {
      const cBox = calculateBoundingBox(childObj.points);
      const cLocalX = cBox.x + cBox.width / 2;
      const cLocalY = cBox.y + cBox.height / 2;
      childPivot = {
        id: `pvt_${Date.now()}_c`,
        name: `Pivot_1`,
        localX: Number(cLocalX.toFixed(2)),
        localY: Number(cLocalY.toFixed(2)),
        locked: false
      };
      updateObject(childObj.id, { pivots: [childPivot] });
    }

    // Relate child to parent
    updateObject(childObj.id, { parentId: parentObj.id });

    // Determine lock distance in world space
    const startWorld = localToWorld({ x: parentPivot.localX, y: parentPivot.localY }, parentObj.transform, parentPivot);
    const endWorld = localToWorld({ x: childPivot.localX, y: childPivot.localY }, childObj.transform, childPivot);
    const len = distance(startWorld, endWorld);

    // Create the connection bone
    const newBone: Bone = {
      id: `bone_${Date.now()}`,
      name: `Bone_${bones.length + 1}`,
      startObjectId: parentObj.id,
      endObjectId: childObj.id,
      startLocalX: parentPivot.localX,
      startLocalY: parentPivot.localY,
      endLocalX: childPivot.localX,
      endLocalY: childPivot.localY,
      lockedDistance: Number(len.toFixed(2)) || 100,
      allowDetach: false,
      minAngle: -180,
      maxAngle: 180,
      enableConstraints: true,
    };

    addBone(newBone);
    setConnDrawingA('');
    setConnDrawingB('');
  };

  const handleBreakConnection = (boneId: string) => {
    const bone = bones.find(b => b.id === boneId);
    if (!bone) return;
    
    // Clear the parent child hierarchy linkage
    updateObject(bone.endObjectId, { parentId: null });
    deleteBone(boneId);
  };

  // Handle value increments/decrements (sliders tap +/- buttons)
  const handleNudge = (property: string, amount: number) => {
    if (!selectedObject) return;

    // Apply to selected drawing's active lasso region if active
    if (selectedObject.lassoDeformState?.active) {
      const currentLassoState = selectedObject.lassoDeformState;
      const currentTransform = currentLassoState.transform || {
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0
      };
      const val = (currentTransform as any)[property] || 0;
      const nextVal = Number((val + amount).toFixed(2));
      const transformUpdate = { ...currentTransform, [property]: nextVal };
      updateObject(selectedObject.id, {
        lassoDeformState: {
          ...currentLassoState,
          transform: transformUpdate
        }
      });
      return;
    }

    // Apply to selected drawing
    const val = (selectedObject.transform as any)[property] || 0;
    const nextVal = Number((val + amount).toFixed(2));

    // Enforce parent closed edges constraint if rigged and parent has closed edges
    if ((property === 'x' || property === 'y') && selectedObject.parentId && objects[selectedObject.parentId]) {
      const parent = objects[selectedObject.parentId];
      const isParentClosed = parent.type === 'shape' && parent.shapeType !== 'line';
      if (isParentClosed) {
        const testTransform = { ...selectedObject.transform, [property]: nextVal };
        if (!isChildInsideParent(selectedObject, parent, testTransform, objects)) {
          return; // reject move
        }
      }
    }

    const transformUpdate = { ...selectedObject.transform, [property]: nextVal };
    updateObject(selectedObject.id, { transform: transformUpdate });

    // Synchronization for permanently attached drawings
    if ((property === 'x' || property === 'y') && selectedObject.attachedGroupId) {
      Object.values(objects).forEach(otherObj => {
        if (otherObj.id !== selectedObject.id && otherObj.attachedGroupId === selectedObject.attachedGroupId) {
          const oVal = (otherObj.transform as any)[property] || 0;
          const nextOVal = Number((oVal + amount).toFixed(2));
          updateObject(otherObj.id, { transform: { ...otherObj.transform, [property]: nextOVal } });
        }
      });
    }

    // BATCH APPLY to checked Smart Control drawings
    const checkedIds = Object.keys(smartCheckedIds).filter(id => smartCheckedIds[id] && objects[id]);
    checkedIds.forEach(id => {
      if (id === selectedObject.id) return; // Already updated
      const obj = objects[id];
      const oVal = (obj.transform as any)[property] || 0;
      const nextOVal = Number((oVal + amount).toFixed(2));
      updateObject(id, { transform: { ...obj.transform, [property]: nextOVal } });
    });

    // OPPOSITE CONTROLS BATCH APPLY
    if (property === 'rotation') {
      oppositeSection1.forEach(id => {
        if (id === selectedObject.id) return;
        const obj = objects[id];
        const currentRot = obj.transform.rotation;
        updateObject(id, { transform: { ...obj.transform, rotation: Number((currentRot + amount).toFixed(2)) } });
      });
      oppositeSection2.forEach(id => {
        if (id === selectedObject.id) return;
        const obj = objects[id];
        const currentRot = obj.transform.rotation;
        updateObject(id, { transform: { ...obj.transform, rotation: Number((currentRot - amount).toFixed(2)) } });
      });
    }
  };

  const handleSliderChange = (property: string, value: number) => {
    if (!selectedObject) return;

    // Apply to selected drawing's active lasso region if active
    if (selectedObject.lassoDeformState?.active) {
      const currentLassoState = selectedObject.lassoDeformState;
      const currentTransform = currentLassoState.transform || {
        x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0
      };
      const transformUpdate = { ...currentTransform, [property]: value };
      updateObject(selectedObject.id, {
        lassoDeformState: {
          ...currentLassoState,
          transform: transformUpdate
        }
      });
      return;
    }

    // Enforce parent closed edges constraint if rigged and parent has closed edges
    if ((property === 'x' || property === 'y') && selectedObject.parentId && objects[selectedObject.parentId]) {
      const parent = objects[selectedObject.parentId];
      const isParentClosed = parent.type === 'shape' && parent.shapeType !== 'line';
      if (isParentClosed) {
        const testTransform = { ...selectedObject.transform, [property]: value };
        if (!isChildInsideParent(selectedObject, parent, testTransform, objects)) {
          return; // reject move
        }
      }
    }

    const delta = value - ((selectedObject.transform as any)[property] || 0);

    const transformUpdate = { ...selectedObject.transform, [property]: value };
    updateObject(selectedObject.id, { transform: transformUpdate });

    // Synchronization for permanently attached drawings
    if ((property === 'x' || property === 'y') && selectedObject.attachedGroupId) {
      Object.values(objects).forEach(otherObj => {
        if (otherObj.id !== selectedObject.id && otherObj.attachedGroupId === selectedObject.attachedGroupId) {
          const oVal = (otherObj.transform as any)[property] || 0;
          const nextOVal = Number((oVal + delta).toFixed(2));
          updateObject(otherObj.id, { transform: { ...otherObj.transform, [property]: nextOVal } });
        }
      });
    }

    // Batch Apply
    const checkedIds = Object.keys(smartCheckedIds).filter(id => smartCheckedIds[id] && objects[id]);
    checkedIds.forEach(id => {
      if (id === selectedObject.id) return;
      const obj = objects[id];
      updateObject(id, { transform: { ...obj.transform, [property]: value } });
    });
  };

  const handleSmartCheckboxToggle = (id: string) => {
    setSmartCheckedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Add selected drawing to Opposite Section 1/2
  const handleAddToOpposite = (section: 1 | 2) => {
    if (!selectedObject) return;
    const id = selectedObject.id;
    if (section === 1) {
      if (!oppositeSection1.includes(id)) {
        setOppositeSection1([...oppositeSection1, id]);
        setOppositeSection2(oppositeSection2.filter(x => x !== id));
      }
    } else {
      if (!oppositeSection2.includes(id)) {
        setOppositeSection2([...oppositeSection2, id]);
        setOppositeSection1(oppositeSection1.filter(x => x !== id));
      }
    }
  };

  // Find bones associated with the selected object
  const selectedObjectBones = selectedObject 
    ? bones.filter(b => b.startObjectId === selectedObject.id || b.endObjectId === selectedObject.id)
    : [];

  // Recursive Tree Node Renderer for VS Code style directory parenting tree
  const renderTreeNode = (obj: VectorObject, depth: number): React.ReactNode => {
    const hasChildren = obj.childrenIds && obj.childrenIds.length > 0;
    const isExpanded = expandedNodes[obj.id] !== false; // expanded by default
    const isSelected = selectedObject?.id === obj.id;

    // Recursive search for direct child objects
    const childObjects = Object.values(objects).filter(o => o.parentId === obj.id);

    return (
      <div key={obj.id} className="space-y-1">
        {/* Node Label Row */}
        <div 
          className={`group flex items-center justify-between py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
            isSelected 
              ? 'bg-amber-500/20 text-white border border-amber-500/20 font-bold shadow shadow-amber-500/5' 
              : 'hover:bg-neutral-800/40 text-neutral-350'
          }`}
          style={{ paddingLeft: `${Math.max(8, depth * 12)}px` }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedObjectId(obj.id);
          }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Collapse / Expand Toggle for folder nodes */}
            {childObjects.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedNodes(prev => ({ ...prev, [obj.id]: !isExpanded }));
                }}
                className="p-0.5 rounded hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-all flex items-center justify-center"
              >
                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            ) : (
              <span className="w-4 h-4" /> // spacing indent
            )}

            {/* Icon */}
            <Folder className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-amber-400' : 'text-neutral-500'}`} />

            {/* Object Name */}
            <span className="truncate text-xs font-bold leading-none tracking-tight">{obj.name}</span>
          </div>

          {/* Actions Hover Rail */}
          <div className="flex items-center gap-1 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
            {/* Add Child / Sibling Action */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuObjectId(obj.id);
                setActiveMenuType('options');
              }}
              className="p-1 rounded bg-neutral-800/80 hover:bg-amber-500 hover:text-neutral-950 text-neutral-400 transition-all flex items-center justify-center"
              title="Add Child / Sibling"
            >
              <Plus className="w-3 h-3" />
            </button>

            {/* Break Relationship Action (if not a root parent) */}
            {obj.parentId && obj.type !== '3d' && objects[obj.parentId]?.type !== '3d' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveFromParent(obj.id);
                }}
                className="p-1 rounded bg-neutral-800/80 hover:bg-rose-500/20 hover:text-rose-400 text-neutral-500 transition-all flex items-center justify-center"
                title="Detach from parent"
              >
                <Unlink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Inline Actions Selector Dropdown Overlay */}
        {activeMenuObjectId === obj.id && (
          <div 
            className="p-2.5 bg-neutral-950/95 border border-neutral-800/95 rounded-xl space-y-2 text-xs"
            style={{ marginLeft: `${Math.max(12, (depth + 1) * 12)}px` }}
          >
            {activeMenuType === 'options' && (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveMenuType('addChild')}
                  className="w-full text-left py-1.5 px-2 bg-neutral-900 hover:bg-amber-500/10 text-amber-400 hover:text-amber-300 font-bold rounded-lg transition-all flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-500" />
                  Add Child Drawing
                </button>
                {obj.parentId && (
                  <button
                    type="button"
                    onClick={() => setActiveMenuType('addSibling')}
                    className="w-full text-left py-1.5 px-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-neutral-200 font-bold rounded-lg transition-all flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5 text-neutral-400" />
                    Add Sibling Drawing
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenuObjectId(null);
                    setActiveMenuType(null);
                  }}
                  className="w-full text-center py-1.5 text-neutral-500 hover:text-neutral-400 font-bold rounded-lg hover:bg-neutral-900/60 transition-all"
                >
                  Cancel
                </button>
              </div>
            )}

            {activeMenuType === 'addChild' && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-neutral-400 block font-bold uppercase tracking-wide">Add Child to {obj.name}</span>
                <div className="flex gap-1.5">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        relateChildToParent(obj.id, e.target.value);
                        setActiveMenuObjectId(null);
                        setActiveMenuType(null);
                      }
                    }}
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500 font-bold"
                    defaultValue=""
                  >
                    <option value="" disabled>-- Choose Drawing --</option>
                    {Object.values(objects)
                      .filter(o => {
                        // Cannot be itself
                        if (o.id === obj.id) return false;
                        // Cannot be its parent already
                        if (o.id === obj.parentId) return false;
                        // Avoid circular reference
                        let temp: VectorObject | null = obj;
                        while (temp) {
                          if (temp.id === o.id) return false;
                          temp = temp.parentId ? objects[temp.parentId] : null;
                        }
                        return true;
                      })
                      .map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))
                    }
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuObjectId(null);
                      setActiveMenuType(null);
                    }}
                    className="px-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 font-bold rounded-lg transition-all"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {activeMenuType === 'addSibling' && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-neutral-400 block font-bold uppercase tracking-wide">Add Sibling to {obj.name}</span>
                <div className="flex gap-1.5">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        if (obj.parentId) {
                          relateChildToParent(obj.parentId, e.target.value);
                        }
                        setActiveMenuObjectId(null);
                        setActiveMenuType(null);
                      }
                    }}
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500 font-bold"
                    defaultValue=""
                  >
                    <option value="" disabled>-- Choose Drawing --</option>
                    {Object.values(objects)
                      .filter(o => {
                        if (o.id === obj.id) return false;
                        if (obj.parentId) {
                          if (o.id === obj.parentId) return false;
                          let temp: VectorObject | null = objects[obj.parentId];
                          while (temp) {
                            if (temp.id === o.id) return false;
                            temp = temp.parentId ? objects[temp.parentId] : null;
                          }
                        }
                        return true;
                      })
                      .map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))
                    }
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuObjectId(null);
                      setActiveMenuType(null);
                    }}
                    className="px-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 font-bold rounded-lg transition-all"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recursive rendering of children node rows */}
        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {childObjects.map(childObj => renderTreeNode(childObj, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`absolute right-0 h-full transition-all duration-200 shrink-0 z-30 ${
        open ? 'w-80' : 'w-0'
      }`}
    >
      {/* Slider Open Close Handle Button */}
      <button
        onClick={() => setOpen(!open)}
        className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-16 bg-neutral-800 hover:bg-amber-500 border-y border-l border-neutral-700 hover:border-amber-400 rounded-l-lg flex items-center justify-center text-neutral-400 hover:text-neutral-950 transition-all cursor-pointer z-50 shadow-lg shadow-black/20"
      >
        {open ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      <div className={`w-full h-full bg-neutral-900/95 backdrop-blur-md border-l border-neutral-800 flex flex-col overflow-hidden ${
        open ? 'w-80' : 'w-0 border-l-0'
      }`}>
        {open && (
        <div className="flex-1 flex flex-col h-full overflow-hidden select-none font-semibold">
          {/* Header */}
          <div className="h-14 border-b border-neutral-800 flex items-center justify-between px-4 shrink-0">
            <span className="text-xs uppercase tracking-widest font-black text-neutral-400 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-amber-500" />
              PROPERTIES PANEL
            </span>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-850 text-neutral-400 hover:text-rose-400 transition-all lg:hidden"
              title="Close Sidebar"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
            {!selectedObject ? (
              <div className="text-center py-12 text-xs text-neutral-600 font-bold border border-dashed border-neutral-800/80 rounded-2xl p-4">
                Select a drawing from the canvas or left hierarchy tree to inspect and transform.
              </div>
            ) : (
              <>
                {/* LASSO DEFORM & SELECTION PANEL */}
                {selectedObject && (
                  <div className="space-y-4 bg-amber-500/5 p-4 rounded-2xl border border-amber-500/20 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between border-b border-amber-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5 font-mono">
                        <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                        Lasso Deform Selection
                      </span>
                      <button
                        id="toggle-lasso-deform"
                        disabled={!selectedObject.lassoDeformState?.lassoPoints || selectedObject.lassoDeformState.lassoPoints.length === 0}
                        onClick={() => {
                          const currentlyActive = selectedObject.lassoDeformState?.active ?? false;
                          const currentDeform = selectedObject.lassoDeformState || {
                            active: false,
                            lassoPoints: [],
                            transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0 }
                          };
                          updateObject(selectedObject.id, {
                            lassoDeformState: {
                              ...currentDeform,
                              active: !currentlyActive
                            }
                          });
                        }}
                        className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition-all ${
                          selectedObject.lassoDeformState?.active 
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold' 
                            : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white disabled:opacity-40 disabled:pointer-events-none'
                        }`}
                      >
                        {selectedObject.lassoDeformState?.active ? 'TRANSFORM SELECTED' : 'APPLY TO LASSO'}
                      </button>
                    </div>

                    {/* Selection Mode Toggle */}
                    <div className="flex bg-neutral-900/60 p-1 rounded-xl border border-neutral-800/60 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setLassoMode('freehand');
                          setPenLassoPoints([]);
                        }}
                        className={`flex-1 py-1.5 px-2 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all ${
                          lassoMode === 'freehand'
                            ? 'bg-amber-500 text-neutral-950 font-black shadow shadow-amber-500/20'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Freehand Lasso
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLassoMode('pen');
                        }}
                        className={`flex-1 py-1.5 px-2 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all ${
                          lassoMode === 'pen'
                            ? 'bg-amber-500 text-neutral-950 font-black shadow shadow-amber-500/20'
                            : 'text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        <Feather className="w-3.5 h-3.5" />
                        Vector Pen
                      </button>
                    </div>

                    {/* Short instruction HUD */}
                    <div className="bg-neutral-900/40 border border-neutral-800/40 rounded-xl p-3 text-[10.5px] leading-relaxed text-neutral-300 space-y-2">
                      <div className="font-bold text-amber-400 flex items-center gap-1 font-mono">
                        <Info className="w-3.5 h-3.5 animate-bounce" /> Guide: Lasso Selection Deform
                      </div>
                      <p>
                        1. Select the <strong className="text-amber-400">Lasso tool (Sparkles)</strong> on the left toolbar and draw a closed region over the canvas.
                      </p>
                      <p>
                        2. Click <span className="text-white font-semibold">"Set Selected Region"</span> to assign the lasso area to this drawing.
                      </p>
                      <p>
                        3. Click <span className="text-white font-semibold">"APPLY TO LASSO"</span> above to transform ONLY the selected area using the sliders below.
                      </p>
                    </div>

                    <div className="space-y-3">
                      {/* Controls Row */}
                      <div className="flex gap-2">
                        <button
                          id="set-lasso-deform-region"
                          disabled={lassoPoints.length === 0}
                          onClick={() => {
                            // Find local center pivot of the selected object
                            const localPivot = selectedObject.pivots[0] || { localX: 0, localY: 0 };
                            // Convert world lassoPoints to local coordinates of the selected object
                            const localLassoPoints = lassoPoints.map(wp => worldToLocal(wp, selectedObject.transform, localPivot));
                            
                            updateObject(selectedObject.id, {
                              lassoDeformState: {
                                active: true,
                                lassoPoints: localLassoPoints,
                                transform: selectedObject.lassoDeformState?.transform || {
                                  x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, rotateX: 0, rotateY: 0, perspective: 0
                                }
                              }
                            });
                          }}
                          className="flex-1 py-2 bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 hover:text-white text-[10px] font-black rounded-lg transition-all uppercase tracking-wider disabled:opacity-30 disabled:pointer-events-none"
                        >
                          Set Selected Region ({lassoPoints.length} PTS)
                        </button>

                        {(selectedObject.lassoDeformState?.lassoPoints?.length ?? 0) > 0 && (
                          <button
                            onClick={() => {
                              updateObject(selectedObject.id, {
                                lassoDeformState: undefined
                              });
                            }}
                            className="px-3 bg-neutral-900 border border-neutral-800 hover:border-rose-950 text-neutral-400 hover:text-rose-400 rounded-lg transition-all"
                            title="Clear Deform Region"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Display current region status */}
                      <div className="flex items-center justify-between text-[10px] bg-neutral-900/40 px-3 py-2 rounded-xl border border-neutral-800/40">
                        <span className="text-neutral-400 font-mono">Assigned Region:</span>
                        <span className="text-neutral-200 font-bold font-mono">
                          {selectedObject.lassoDeformState?.lassoPoints 
                            ? `${selectedObject.lassoDeformState.lassoPoints.length} Points` 
                            : 'None'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* MESH TRANSFORM OPTIONS */}
                {activeTool === 'MSH' && (
                  <div className="space-y-4 bg-amber-500/5 p-4 rounded-2xl border border-amber-400/20 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between border-b border-amber-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                        MESH TRANSFORM OPTIONS
                      </span>
                    </div>

                    {!selectedObject.meshState ? (
                      <div className="space-y-3">
                        <p className="text-[10px] text-neutral-400 leading-normal font-bold">
                          Create a 2D control point mesh to wrap and warp this object's geometry fluidly!
                        </p>
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-neutral-400 block font-black uppercase tracking-wide">Grid Density Preset:</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              onClick={() => handleInitMesh(5, 5)}
                              className="py-1.5 bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              LOW (5x5)
                            </button>
                            <button
                              onClick={() => handleInitMesh(10, 10)}
                              className="py-1.5 bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              MED (10x10)
                            </button>
                            <button
                              onClick={() => handleInitMesh(20, 20)}
                              className="py-1.5 bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              HIGH (20x20)
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs">
                        {/* Point Size */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-neutral-400">
                            <span>Control Point Size</span>
                            <span className="text-amber-400 font-bold">{selectedObject.meshState.pointSize}px</span>
                          </div>
                          <input
                            type="range"
                            min="15"
                            max="50"
                            value={selectedObject.meshState.pointSize}
                            onChange={(e) => updateObject(selectedObject.id, {
                              meshState: {
                                ...selectedObject.meshState!,
                                pointSize: parseInt(e.target.value)
                              }
                            })}
                            className="w-full accent-amber-500"
                          />
                        </div>

                        {/* Checkboxes */}
                        <div className="space-y-2 pt-1 border-t border-neutral-800/40">
                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.meshState.showGrid}
                              onChange={(e) => updateObject(selectedObject.id, {
                                meshState: {
                                  ...selectedObject.meshState!,
                                  showGrid: e.target.checked
                                }
                              })}
                              className="accent-amber-500 rounded border-neutral-800"
                            />
                            <span>Show Grid Lines</span>
                          </label>

                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.meshState.showPoints}
                              onChange={(e) => updateObject(selectedObject.id, {
                                meshState: {
                                  ...selectedObject.meshState!,
                                  showPoints: e.target.checked
                                }
                              })}
                              className="accent-amber-500 rounded border-neutral-800"
                            />
                            <span>Show Grid Points</span>
                          </label>

                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.meshState.previewMode}
                              onChange={(e) => updateObject(selectedObject.id, {
                                meshState: {
                                  ...selectedObject.meshState!,
                                  previewMode: e.target.checked
                                }
                              })}
                              className="accent-amber-500 rounded border-neutral-800"
                            />
                            <span>Deform Live Preview</span>
                          </label>
                        </div>

                        {/* Done & Cancel buttons */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800/40">
                          <button
                            onClick={() => {
                              // Bake the deformation permanently into geometry points!
                              const bounds = calculateBoundingBox(selectedObject.points);
                              const deformedPoints = selectedObject.points.map(p => {
                                const { densityX, densityY, points } = selectedObject.meshState!;
                                const tx = bounds.width > 0 ? (p.x - bounds.x) / bounds.width : 0;
                                const ty = bounds.height > 0 ? (p.y - bounds.y) / bounds.height : 0;
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
                                return {
                                  x: topLeft.currentX * (1 - tx) * (1 - ty) + topRight.currentX * tx * (1 - ty) + bottomLeft.currentX * (1 - tx) * ty + bottomRight.currentX * tx * ty,
                                  y: topLeft.currentY * (1 - tx) * (1 - ty) + topRight.currentY * tx * (1 - ty) + bottomLeft.currentY * (1 - tx) * ty + bottomRight.currentY * tx * ty,
                                };
                              });
                              updateObject(selectedObject.id, {
                                points: deformedPoints,
                                meshState: undefined
                              });
                              setActiveTool('SEL');
                            }}
                            className="py-2 bg-emerald-500 text-neutral-950 hover:bg-emerald-400 font-bold rounded-xl transition-all shadow-md shadow-emerald-500/10"
                          >
                            Bake & Done
                          </button>
                          <button
                            onClick={() => {
                              // Cancel deformation
                              updateObject(selectedObject.id, {
                                meshState: undefined
                              });
                              setActiveTool('SEL');
                            }}
                            className="py-2 bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 font-bold rounded-xl transition-all"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SMART MESH COLORING OPTIONS */}
                {activeTool === 'MCL' && (
                  <div className="space-y-4 bg-emerald-500/5 p-4 rounded-2xl border border-emerald-400/20 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between border-b border-emerald-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Palette className="w-4 h-4 text-emerald-500 animate-pulse" />
                        SMART MESH COLORING
                      </span>
                    </div>

                    {!selectedObject ? (
                      <p className="text-[10px] text-neutral-400 font-bold leading-normal">
                        Select a drawing on the canvas first to paint on its mesh!
                      </p>
                    ) : !selectedObject.smartMeshColor ? (
                      <div className="space-y-3">
                        <p className="text-[10px] text-neutral-400 leading-normal font-bold">
                          Create a simplified mesh grid over this drawing. You can directly brush color onto mesh cells or points, and colors will warp automatically with your deformations!
                        </p>
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-neutral-400 block font-black uppercase tracking-wide">Grid Density Preset:</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              onClick={() => handleInitMeshColor(selectedObject, 6, 6)}
                              className="py-1.5 bg-neutral-800 hover:bg-emerald-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              LOW (6x6)
                            </button>
                            <button
                              onClick={() => handleInitMeshColor(selectedObject, 10, 10)}
                              className="py-1.5 bg-neutral-800 hover:bg-emerald-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              MED (10x10)
                            </button>
                            <button
                              onClick={() => handleInitMeshColor(selectedObject, 16, 16)}
                              className="py-1.5 bg-neutral-800 hover:bg-emerald-500 hover:text-neutral-950 text-neutral-300 text-[10px] font-black rounded-lg transition-all"
                            >
                              HIGH (16x16)
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs">
                        {/* Color Picker & Mode */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-black">Brush Color</span>
                            <span className="text-[10px] text-emerald-400 font-bold">Mode</span>
                          </div>
                          
                          <div className="flex gap-2">
                            <input 
                              type="color" 
                              value={brushColor} 
                              onChange={(e) => {
                                const val = e.target.value;
                                setBrushColor(val);
                                handleUpdateMeshColorConfig({ brushColor: val });
                              }}
                              className="w-10 h-8 rounded-lg border border-neutral-700 bg-transparent cursor-pointer shrink-0" 
                            />
                            <div className="flex-1 grid grid-cols-2 gap-1 bg-neutral-950 p-0.5 rounded-lg border border-neutral-800/40">
                              <button
                                onClick={() => handleUpdateMeshColorConfig({ paintMode: 'cell' })}
                                className={`py-1 text-[10px] font-bold rounded-md transition-all ${
                                  selectedObject.smartMeshColor.paintMode === 'cell' 
                                    ? 'bg-emerald-500 text-neutral-950' 
                                    : 'text-neutral-400 hover:text-white'
                                }`}
                              >
                                Fill Cell
                              </button>
                              <button
                                onClick={() => handleUpdateMeshColorConfig({ paintMode: 'point' })}
                                className={`py-1 text-[10px] font-bold rounded-md transition-all ${
                                  selectedObject.smartMeshColor.paintMode === 'point' 
                                    ? 'bg-emerald-500 text-neutral-950' 
                                    : 'text-neutral-400 hover:text-white'
                                }`}
                              >
                                Glow Point
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Brush Settings */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Brush Radius</span>
                            <span className="text-emerald-400 font-bold font-mono">{selectedObject.smartMeshColor.brushSize}px</span>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="120"
                            value={selectedObject.smartMeshColor.brushSize}
                            onChange={(e) => handleUpdateMeshColorConfig({ brushSize: parseInt(e.target.value) })}
                            className="w-full accent-emerald-500"
                          />

                          <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-2">
                            <span className="font-bold uppercase tracking-wider">Paint Opacity</span>
                            <span className="text-emerald-400 font-bold font-mono">{Math.round(selectedObject.smartMeshColor.brushOpacity * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={Math.round(selectedObject.smartMeshColor.brushOpacity * 100)}
                            onChange={(e) => handleUpdateMeshColorConfig({ brushOpacity: parseFloat(e.target.value) / 100 })}
                            className="w-full accent-emerald-500"
                          />
                        </div>

                        {/* Layers & View Settings */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Color Layers</span>
                            <button 
                              onClick={handleAddMeshColorLayer}
                              className="px-2 py-0.5 bg-neutral-800 hover:bg-emerald-500 hover:text-neutral-950 text-[9px] font-bold rounded transition-all flex items-center gap-1"
                            >
                              <Plus className="w-2.5 h-2.5" /> Add Layer
                            </button>
                          </div>
                          
                          <div className="space-y-1 max-h-28 overflow-y-auto bg-neutral-950/60 rounded-xl border border-neutral-800/40 p-1.5 scrollbar-thin">
                            {selectedObject.smartMeshColor.layers.map((layer, idx) => (
                              <div 
                                key={layer.id} 
                                onClick={() => handleUpdateMeshColorConfig({ activeLayerIndex: idx })}
                                className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                                  selectedObject.smartMeshColor?.activeLayerIndex === idx 
                                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold' 
                                    : 'text-neutral-400 hover:text-white border border-transparent hover:bg-neutral-800/40'
                                }`}
                              >
                                <span className="text-[10px] truncate">{layer.name}</span>
                                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                  <button 
                                    onClick={() => handleToggleMeshColorLayerVis(idx)}
                                    className="p-0.5 hover:text-emerald-400 text-neutral-500 transition-colors"
                                  >
                                    {layer.visible ? '👁' : '👁‍c'}
                                  </button>
                                  {selectedObject.smartMeshColor.layers.length > 1 && (
                                    <button 
                                      onClick={() => handleDeleteMeshColorLayer(idx)}
                                      className="p-0.5 hover:text-rose-400 text-neutral-500 transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Action Controls */}
                        <div className="space-y-1.5 border-t border-neutral-800/40 pt-2.5">
                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.smartMeshColor.previewMode}
                              onChange={(e) => handleUpdateMeshColorConfig({ previewMode: e.target.checked })}
                              className="accent-emerald-500 rounded border-neutral-800"
                            />
                            <span>Mesh Live Overlay Preview</span>
                          </label>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              onClick={() => {
                                if (window.confirm("Clear all mesh colors on this object?")) {
                                  handleClearMeshColors(selectedObject);
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-[10px] font-black rounded-lg border border-neutral-800 hover:border-rose-900 transition-all uppercase tracking-wider"
                            >
                              Clear Colors
                            </button>
                            <button
                              onClick={() => {
                                setActiveTool('SEL');
                              }}
                              className="py-1.5 bg-emerald-500 text-neutral-950 hover:bg-emerald-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider text-center"
                            >
                              ✓ Complete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SMART PIN WARP */}
                {activeTool === 'SWP' && (
                  <div className="space-y-4 bg-sky-500/5 p-4 rounded-2xl border border-sky-400/20 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between border-b border-sky-500/10 pb-2.5">
                      <span className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-sky-500 animate-pulse" />
                        SMART PIN WARPING
                      </span>
                    </div>

                    {!selectedObject ? (
                      <p className="text-[10px] text-neutral-400 font-bold leading-normal">
                        Select a drawing on the canvas first to place deformation pins!
                      </p>
                    ) : !selectedObject.smartWarp ? (
                      <div className="space-y-3">
                        <p className="text-[10px] text-neutral-400 leading-normal font-bold">
                          Add custom warp pins directly onto your drawing! Drag pins to deform the body part smoothly. This offers extremely precise puppet-like control with zero mesh clutter.
                        </p>
                        <button
                          onClick={() => handleInitSmartWarp(selectedObject)}
                          className="w-full py-2 bg-sky-500 text-neutral-950 hover:bg-sky-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider"
                        >
                          Initialize Smart Warp Pins
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 text-xs">
                        {/* Pin Options */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Pin Grab Size</span>
                            <span className="text-sky-400 font-bold font-mono">{selectedObject.smartWarp.pinSize}px</span>
                          </div>
                          <input
                            type="range"
                            min="20"
                            max="60"
                            value={selectedObject.smartWarp.pinSize}
                            onChange={(e) => handleUpdateSmartWarpConfig({ pinSize: parseInt(e.target.value) })}
                            className="w-full accent-sky-500"
                          />
                        </div>

                        {/* Influence Area Settings */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Influence Radius</span>
                            <span className="text-sky-400 font-bold font-mono">{selectedObject.smartWarp.influenceRadius}px</span>
                          </div>
                          <input
                            type="range"
                            min="30"
                            max="300"
                            value={selectedObject.smartWarp.influenceRadius}
                            onChange={(e) => handleUpdateSmartWarpConfig({ influenceRadius: parseInt(e.target.value) })}
                            className="w-full accent-sky-500"
                          />

                          <div className="space-y-1 mt-2">
                            <label className="text-[10px] text-neutral-400 block font-black uppercase tracking-wide">Deformation Falloff:</label>
                            <div className="grid grid-cols-3 gap-1">
                              {(['linear', 'smooth', 'sharp'] as const).map((falloff) => (
                                <button
                                  key={falloff}
                                  onClick={() => handleUpdateSmartWarpConfig({ influenceFalloff: falloff })}
                                  className={`py-1 text-[9px] font-black rounded-md uppercase transition-all ${
                                    selectedObject.smartWarp?.influenceFalloff === falloff
                                      ? 'bg-sky-500 text-neutral-950'
                                      : 'bg-neutral-800 text-neutral-400 hover:text-white'
                                  }`}
                                >
                                  {falloff}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Active Pins List */}
                        <div className="space-y-2 border-t border-neutral-800/40 pt-2.5">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="font-bold uppercase tracking-wider">Active Warp Pins ({selectedObject.smartWarp.pins.length})</span>
                          </div>
                          {selectedObject.smartWarp.pins.length === 0 ? (
                            <p className="text-[10px] text-neutral-500 italic">
                              Click anywhere directly on the drawing to add warp pins!
                            </p>
                          ) : (
                            <div className="space-y-1 max-h-24 overflow-y-auto bg-neutral-950/60 rounded-xl border border-neutral-800/40 p-1.5 scrollbar-thin">
                              {selectedObject.smartWarp.pins.map((pin, pIdx) => (
                                <div
                                  key={pin.id}
                                  className="flex items-center justify-between px-2 py-1.5 rounded-lg text-neutral-300 bg-neutral-900/40 border border-neutral-800/40"
                                >
                                  <span className="text-[10px] font-mono">Pin #{pIdx + 1} ({Math.round(pin.currentX)}, {Math.round(pin.currentY)})</span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => handleTogglePinLock(pin.id)}
                                      className="p-0.5 hover:text-sky-400 text-neutral-500 transition-colors"
                                      title={pin.locked ? "Unlock Pin" : "Lock Pin Position"}
                                    >
                                      {pin.locked ? '🔒' : '🔓'}
                                    </button>
                                    <button
                                      onClick={() => handleDeletePin(pin.id)}
                                      className="p-0.5 hover:text-rose-400 text-neutral-500 transition-colors"
                                      title="Delete Pin"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="space-y-1.5 border-t border-neutral-800/40 pt-2.5">
                          <label className="flex items-center gap-2 text-xs text-neutral-300 select-none cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedObject.smartWarp.showInfluenceArea}
                              onChange={(e) => handleUpdateSmartWarpConfig({ showInfluenceArea: e.target.checked })}
                              className="accent-sky-500 rounded border-neutral-800"
                            />
                            <span>Show Influence Radii Overlays</span>
                          </label>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              onClick={() => {
                                if (window.confirm("Reset all warp pins on this object?")) {
                                  handleResetWarpPins(selectedObject);
                                }
                              }}
                              className="py-1.5 bg-neutral-900 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-[10px] font-black rounded-lg border border-neutral-800 hover:border-rose-900 transition-all uppercase tracking-wider"
                            >
                              Reset Pins
                            </button>
                            <button
                              onClick={() => {
                                setActiveTool('SEL');
                              }}
                              className="py-1.5 bg-sky-500 text-neutral-950 hover:bg-sky-400 text-[10px] font-black rounded-lg transition-all uppercase tracking-wider text-center"
                            >
                              ✓ Complete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ADVANCED STYLING EFFECTS */}
                <div className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50">
                  <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider block border-b border-neutral-800/40 pb-2 flex items-center gap-1.5 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    ADVANCED EFFECTS PIPELINE
                  </div>

                  {/* 1. DROP SHADOW */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-300">1. Drop Shadow</span>
                      <button
                        onClick={() => handleStyleChange('shadow', { enabled: !(selectedObject.shadow?.enabled ?? false) })}
                        className={`text-[9px] font-black px-2 py-0.5 rounded-lg border transition-all ${
                          selectedObject.shadow?.enabled 
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}
                      >
                        {selectedObject.shadow?.enabled ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>

                    {(selectedObject.shadow?.enabled ?? false) && (
                      <div className="bg-neutral-950/50 p-3 rounded-xl border border-neutral-900 space-y-3 text-[10px]">
                        {/* Blur */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Blur Size</span>
                            <span className="text-amber-400 font-bold">{selectedObject.shadow?.blur ?? 15}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="80"
                            value={selectedObject.shadow?.blur ?? 15}
                            onChange={(e) => handleStyleChange('shadow', { blur: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Offset X */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Offset X</span>
                            <span className="text-amber-400 font-bold">{selectedObject.shadow?.offsetX ?? 0}px</span>
                          </div>
                          <input
                            type="range"
                            min="-50"
                            max="50"
                            value={selectedObject.shadow?.offsetX ?? 0}
                            onChange={(e) => handleStyleChange('shadow', { offsetX: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Offset Y */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Offset Y</span>
                            <span className="text-amber-400 font-bold">{selectedObject.shadow?.offsetY ?? 10}px</span>
                          </div>
                          <input
                            type="range"
                            min="-50"
                            max="50"
                            value={selectedObject.shadow?.offsetY ?? 10}
                            onChange={(e) => handleStyleChange('shadow', { offsetY: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Opacity */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Opacity</span>
                            <span className="text-amber-400 font-bold">{Math.round((selectedObject.shadow?.opacity ?? 0.3) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={selectedObject.shadow?.opacity ?? 0.3}
                            onChange={(e) => handleStyleChange('shadow', { opacity: parseFloat(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Color */}
                        <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-900">
                          <span className="text-neutral-500">Shadow Color</span>
                          <input
                            type="color"
                            value={selectedObject.shadow?.color ?? '#000000'}
                            onChange={(e) => handleStyleChange('shadow', { color: e.target.value })}
                            className="w-6 h-6 rounded bg-transparent cursor-pointer border-0"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. INNER SHADOW */}
                  <div className="space-y-2.5 pt-2 border-t border-neutral-800/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-300">2. Inner Shadow</span>
                      <button
                        onClick={() => handleStyleChange('innerShadow', { enabled: !(selectedObject.innerShadow?.enabled ?? false) })}
                        className={`text-[9px] font-black px-2 py-0.5 rounded-lg border transition-all ${
                          selectedObject.innerShadow?.enabled 
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}
                      >
                        {selectedObject.innerShadow?.enabled ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>

                    {(selectedObject.innerShadow?.enabled ?? false) && (
                      <div className="bg-neutral-950/50 p-3 rounded-xl border border-neutral-900 space-y-3 text-[10px]">
                        {/* Size/Blur */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Blur Size</span>
                            <span className="text-amber-400 font-bold">{selectedObject.innerShadow?.size ?? 15}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="80"
                            value={selectedObject.innerShadow?.size ?? 15}
                            onChange={(e) => handleStyleChange('innerShadow', { size: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Angle */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Lighting Angle</span>
                            <span className="text-amber-400 font-bold">{selectedObject.innerShadow?.angle ?? 120}°</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            value={selectedObject.innerShadow?.angle ?? 120}
                            onChange={(e) => handleStyleChange('innerShadow', { angle: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Distance */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Offset Distance</span>
                            <span className="text-amber-400 font-bold">{selectedObject.innerShadow?.distance ?? 10}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="60"
                            value={selectedObject.innerShadow?.distance ?? 10}
                            onChange={(e) => handleStyleChange('innerShadow', { distance: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Opacity */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Opacity</span>
                            <span className="text-amber-400 font-bold">{Math.round((selectedObject.innerShadow?.opacity ?? 0.5) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={selectedObject.innerShadow?.opacity ?? 0.5}
                            onChange={(e) => handleStyleChange('innerShadow', { opacity: parseFloat(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 3. COLOR OVERLAY */}
                  <div className="space-y-2.5 pt-2 border-t border-neutral-800/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-300">3. Color Overlay</span>
                      <button
                        onClick={() => handleStyleChange('overlay', { enabled: !(selectedObject.overlay?.enabled ?? false) })}
                        className={`text-[9px] font-black px-2 py-0.5 rounded-lg border transition-all ${
                          selectedObject.overlay?.enabled 
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}
                      >
                        {selectedObject.overlay?.enabled ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>

                    {(selectedObject.overlay?.enabled ?? false) && (
                      <div className="bg-neutral-950/50 p-3 rounded-xl border border-neutral-900 space-y-3 text-[10px]">
                        {/* Blend Mode */}
                        <div className="space-y-1.5">
                          <span className="text-neutral-500">Blend Mode</span>
                          <select
                            value={selectedObject.overlay?.blendMode ?? 'normal'}
                            onChange={(e) => handleStyleChange('overlay', { blendMode: e.target.value })}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-[10px] text-white outline-none"
                          >
                            <option value="normal">Normal (Tint)</option>
                            <option value="multiply">Multiply (Darken)</option>
                            <option value="screen">Screen (Lighten)</option>
                            <option value="overlay">Overlay (Contrast)</option>
                          </select>
                        </div>

                        {/* Opacity */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Tint Intensity</span>
                            <span className="text-amber-400 font-bold">{Math.round((selectedObject.overlay?.opacity ?? 0.5) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={selectedObject.overlay?.opacity ?? 0.5}
                            onChange={(e) => handleStyleChange('overlay', { opacity: parseFloat(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Color */}
                        <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-900">
                          <span className="text-neutral-500">Tint Color</span>
                          <input
                            type="color"
                            value={selectedObject.overlay?.color ?? '#ff0055'}
                            onChange={(e) => handleStyleChange('overlay', { color: e.target.value })}
                            className="w-6 h-6 rounded bg-transparent cursor-pointer border-0"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. RIM LIGHT */}
                  <div className="space-y-2.5 pt-2 border-t border-neutral-800/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-300">4. Rim Light</span>
                      <button
                        onClick={() => handleStyleChange('rimLight', { enabled: !(selectedObject.rimLight?.enabled ?? false) })}
                        className={`text-[9px] font-black px-2 py-0.5 rounded-lg border transition-all ${
                          selectedObject.rimLight?.enabled 
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}
                      >
                        {selectedObject.rimLight?.enabled ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>

                    {(selectedObject.rimLight?.enabled ?? false) && (
                      <div className="bg-neutral-950/50 p-3 rounded-xl border border-neutral-900 space-y-3 text-[10px]">
                        {/* Thickness */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Thickness</span>
                            <span className="text-amber-400 font-bold">{selectedObject.rimLight?.thickness ?? 4}px</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="20"
                            value={selectedObject.rimLight?.thickness ?? 4}
                            onChange={(e) => handleStyleChange('rimLight', { thickness: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Softness */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-500">Glow Softness</span>
                            <span className="text-amber-400 font-bold">{selectedObject.rimLight?.softness ?? 10}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="30"
                            value={selectedObject.rimLight?.softness ?? 10}
                            onChange={(e) => handleStyleChange('rimLight', { softness: parseInt(e.target.value) })}
                            className="w-full h-1 accent-amber-500 bg-neutral-800 rounded-lg cursor-pointer"
                          />
                        </div>

                        {/* Color */}
                        <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-900">
                          <span className="text-neutral-500">Light Color</span>
                          <input
                            type="color"
                            value={selectedObject.rimLight?.color ?? '#ffffff'}
                            onChange={(e) => handleStyleChange('rimLight', { color: e.target.value })}
                            className="w-6 h-6 rounded bg-transparent cursor-pointer border-0"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Object Metadata & Style */}
                <div className="space-y-3 bg-neutral-950/40 p-3.5 rounded-2xl border border-neutral-800/50">
                  <div className="flex items-center justify-between border-b border-neutral-800/40 pb-2">
                    <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider font-black">
                      Style & Metadata
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        deleteObject(selectedObject.id);
                        setSelectedObjectId(null);
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white transition-all text-[10px] font-black cursor-pointer"
                      title="Delete selected drawing completely"
                    >
                      <Trash2 className="w-3 h-3" />
                      DELETE
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-neutral-400">Object Name</span>
                    <input
                      type="text"
                      value={selectedObject.name}
                      onChange={(e) => updateObject(selectedObject.id, { name: e.target.value })}
                      className="bg-neutral-950 border border-neutral-800 text-xs px-2.5 py-1.5 rounded-xl text-white font-bold w-40 outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* 360° MASTER SLIDER CONTROLLER */}
                  {selectedObject.type === '360_container' && (
                    <div className="space-y-4 bg-amber-500/5 p-4 rounded-2xl border border-amber-400/20 shadow-lg shadow-black/20 mt-3 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-amber-500/10 pb-2.5">
                        <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <RotateCw className="w-4 h-4 text-amber-400 animate-spin-slow" />
                          360° Pseudo-3D Rotation
                        </span>
                        <span className="text-[9px] text-amber-500 font-extrabold bg-amber-500/10 px-1.5 py-0.5 rounded uppercase">
                          360 Master
                        </span>
                      </div>

                      <p className="text-[10px] text-neutral-400 leading-normal font-medium">
                        Drag the master slider to smoothly rotate the pseudo-3D object in 360 degrees. The engine instantly resolves to the closest camera angle.
                      </p>

                      {/* Rotation Slider */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-neutral-400">
                          <span>360° Camera Yaw</span>
                          <span className="text-amber-400 font-bold font-mono">{(selectedObject.currentAngle360 ?? 0)}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="359"
                          value={selectedObject.currentAngle360 ?? 0}
                          disabled={selectedObject.lockAngle360}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            updateObject(selectedObject.id, {
                              currentAngle360: val
                            });
                          }}
                          className={`w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer ${selectedObject.lockAngle360 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                      </div>

                      {/* Lock & Preview Controls */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            updateObject(selectedObject.id, {
                              lockAngle360: !selectedObject.lockAngle360
                            });
                          }}
                          className={`flex-1 text-[10px] py-1.5 rounded-lg border font-bold flex items-center justify-center gap-1 transition-all ${
                            selectedObject.lockAngle360 
                              ? 'bg-red-500/10 border-red-500/35 text-red-400' 
                              : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
                          }`}
                        >
                          {selectedObject.lockAngle360 ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          {selectedObject.lockAngle360 ? 'Unlock Angle' : 'Lock Angle'}
                        </button>
                        
                        <button
                          onClick={() => {
                            // Toggle spin preview
                            if ((window as any)._spin_timer) {
                              clearInterval((window as any)._spin_timer);
                              (window as any)._spin_timer = null;
                              // Force update
                              updateObject(selectedObject.id, { _isSpinning: false } as any);
                            } else {
                              const timer = setInterval(() => {
                                const currentObj = objects[selectedObject.id];
                                if (currentObj) {
                                  const nextAngle = ((currentObj.currentAngle360 ?? 0) + 3) % 360;
                                  updateObject(selectedObject.id, { currentAngle360: nextAngle });
                                }
                              }, 30);
                              (window as any)._spin_timer = timer;
                              updateObject(selectedObject.id, { _isSpinning: true } as any);
                            }
                          }}
                          className={`flex-1 text-[10px] py-1.5 rounded-lg border font-bold flex items-center justify-center gap-1 transition-all ${
                            (selectedObject as any)._isSpinning
                              ? 'bg-amber-500 text-black border-amber-500 font-extrabold'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5" />
                          {(selectedObject as any)._isSpinning ? 'Stop Tour' : 'Preview Tour'}
                        </button>
                      </div>

                      {/* Views Management */}
                      <div className="border-t border-neutral-800/40 pt-3 space-y-3">
                        <span className="text-[10px] text-neutral-400 block font-black uppercase tracking-wider">Angle View Registry</span>
                        
                        {/* List of registered views */}
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {(selectedObject.views360 || []).map((view, idx) => {
                            const isCurrent = findClosestView360(selectedObject.views360, selectedObject.currentAngle360 ?? 0)?.id === view.id;
                            return (
                              <div 
                                key={view.id} 
                                onClick={() => {
                                  updateObject(selectedObject.id, { currentAngle360: view.angle });
                                }}
                                className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer border transition-all ${
                                  isCurrent 
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
                                    : 'bg-neutral-950 border-neutral-900 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-amber-400 animate-pulse' : 'bg-neutral-700'}`} />
                                  <span className="font-bold">{view.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono bg-neutral-900 px-1.5 py-0.5 rounded text-neutral-400">
                                    {view.angle}°
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const nextAngle = prompt(`Enter new angle for "${view.name}" (0-359):`, view.angle.toString());
                                      if (nextAngle !== null) {
                                        const parsed = parseInt(nextAngle);
                                        if (!isNaN(parsed)) {
                                          const updatedViews = (selectedObject.views360 || []).map(v => 
                                            v.id === view.id ? { ...v, angle: parsed % 360 } : v
                                          );
                                          updateObject(selectedObject.id, { views360: updatedViews });
                                        }
                                      }
                                    }}
                                    className="p-1 text-neutral-500 hover:text-white rounded-md hover:bg-neutral-800 transition-colors"
                                    title="Edit Angle"
                                  >
                                    <Settings className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`Remove view "${view.name}"?`)) {
                                        const updatedViews = (selectedObject.views360 || []).filter(v => v.id !== view.id);
                                        updateObject(selectedObject.id, { views360: updatedViews });
                                        // Unhide drawing so the user doesn't lose it
                                        updateObject(view.drawingId, { isHidden: false });
                                      }
                                    }}
                                    className="p-1 text-red-500 hover:text-red-400 rounded-md hover:bg-red-500/10 transition-colors"
                                    title="Delete View"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Add View Form */}
                        <div className="bg-neutral-950 p-2.5 rounded-xl border border-neutral-900 space-y-2">
                          <span className="text-[9px] font-black uppercase text-neutral-500 block">Link Drawing as View</span>
                          <div className="flex gap-2">
                            <select
                              id="add-360-view-select"
                              className="bg-neutral-900 border border-neutral-800 rounded-lg text-xs p-1.5 text-neutral-300 outline-none flex-1"
                            >
                              <option value="">Select Drawing...</option>
                              {Object.values(objects)
                                .filter(obj => obj.id !== selectedObject.id && obj.type !== '360_container')
                                .map(obj => (
                                  <option key={obj.id} value={obj.id}>{obj.name}</option>
                                ))
                              }
                            </select>
                            <input
                              id="add-360-view-angle"
                              type="number"
                              placeholder="Angle"
                              min="0"
                              max="359"
                              className="bg-neutral-900 border border-neutral-800 rounded-lg text-xs p-1.5 text-neutral-300 w-16 outline-none text-center"
                            />
                            <button
                              onClick={() => {
                                const selEl = document.getElementById('add-360-view-select') as HTMLSelectElement;
                                const angEl = document.getElementById('add-360-view-angle') as HTMLInputElement;
                                const drawingId = selEl?.value;
                                const angle = parseInt(angEl?.value || '0');
                                if (!drawingId) {
                                  alert("Please select a drawing first.");
                                  return;
                                }
                                const existingViews = selectedObject.views360 || [];
                                const newView = {
                                  id: `view_${Date.now()}`,
                                  angle: angle % 360,
                                  drawingId,
                                  name: objects[drawingId]?.name || `View ${existingViews.length + 1}`,
                                };
                                updateObject(selectedObject.id, {
                                  views360: [...existingViews, newView]
                                });
                                // Hide original drawing
                                updateObject(drawingId, { isHidden: true });
                                if (selEl) selEl.value = "";
                                if (angEl) angEl.value = "";
                              }}
                              className="bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold px-3 py-1.5 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CONVERT SELECTED DRAWING TO 3D PROXY */}
                  {(selectedObject.type === 'stroke' || selectedObject.type === 'shape') && (
                    <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-4 rounded-2xl border border-amber-500/30 shadow-lg mt-3 space-y-2.5 animate-fade-in">
                      <div className="flex items-center gap-2">
                        <Box className="w-5 h-5 text-amber-400" />
                        <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                          ✨ 2D to 3D Extrusion Engine
                        </span>
                      </div>
                      <p className="text-[10px] text-neutral-300 leading-relaxed font-medium">
                        Instantly convert this 2D vector drawing into a fully-functional <b>3D wireframe mesh</b> based on its outline coordinates!
                      </p>
                      <button
                        type="button"
                        onClick={() => convertTo3D && convertTo3D(selectedObject.id)}
                        className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-black text-xs font-black py-2.5 px-4 rounded-xl shadow-md transition-all duration-200 flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer uppercase tracking-wider font-sans"
                      >
                        💫 Convert to 3D Object
                      </button>
                    </div>
                  )}

                  {/* 3D PROXY CONTROLLER MATRIX */}
                  {selectedObject.type === '3d' && selectedObject.transform3D && (
                    <div className="space-y-4 bg-amber-500/5 p-4 rounded-2xl border border-amber-400/20 shadow-lg shadow-black/20 mt-3 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-amber-500/10 pb-2.5">
                        <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-amber-400" />
                          3D Proxy Transform Matrix
                        </span>
                        <span className="text-[9px] text-amber-500 font-extrabold bg-amber-500/10 px-1.5 py-0.5 rounded uppercase">
                          {selectedObject.shape3DType}
                        </span>
                      </div>

                      <p className="text-[10px] text-neutral-400 leading-normal font-medium">
                        Manipulate coordinates directly across both 2D and 3D viewport metrics. Changes resolve to the projection layer in real-time.
                      </p>

                      {/* HIDE 3D GRID LINES TOGGLE */}
                      <div className="flex items-center justify-between bg-neutral-950/40 p-2.5 rounded-xl border border-neutral-800/50">
                        <span className="text-[10px] text-neutral-300 font-bold uppercase tracking-wider">
                          Hide 3D Grid Lines
                        </span>
                        <button
                          id="toggle-hide-3d-grid"
                          onClick={() => {
                            updateObject(selectedObject.id, {
                              hide3DGrid: !selectedObject.hide3DGrid
                            });
                          }}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                            selectedObject.hide3DGrid ? 'bg-amber-500' : 'bg-neutral-800'
                          }`}
                        >
                          <div
                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                              selectedObject.hide3DGrid ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* 🎲 3D ADVANCED MODELING STUDIO */}
                      <div className="space-y-3 bg-neutral-900/60 p-3.5 rounded-xl border border-neutral-800/80">
                        <div className="flex items-center justify-between border-b border-neutral-800/60 pb-2">
                          <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5" />
                            3D Modeling Studio
                          </span>
                          <span className="text-[8px] bg-amber-500/10 text-amber-400 font-bold px-1.5 py-0.5 rounded uppercase">
                            Mesh Sandbox
                          </span>
                        </div>

                        {/* HOLLOW (ANDAR SPACE) & DEPTH CONTROLS */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-neutral-300 font-bold uppercase">Make Model Hollow</span>
                            <button
                              id="toggle-3d-hollow"
                              onClick={() => {
                                const newHollow = !selectedObject.hollowEnabled;
                                const currentDepth = selectedObject.depth3D || 40;
                                const currentInner = selectedObject.innerSpace3D !== undefined ? selectedObject.innerSpace3D : 10;
                                const pts = selectedObject.originalPointsBackup || selectedObject.points;
                                if (pts) {
                                  const res = extrude2DTo3D(pts, selectedObject.fillColor, selectedObject.strokeColor, currentDepth, newHollow, currentInner);
                                  updateObject(selectedObject.id, {
                                    vertices3D: res.vertices,
                                    faces3D: res.faces,
                                    hollowEnabled: newHollow,
                                    innerSpace3D: currentInner
                                  });
                                }
                              }}
                              className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                                selectedObject.hollowEnabled ? 'bg-amber-500' : 'bg-neutral-800'
                              }`}
                            >
                              <div
                                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                                  selectedObject.hollowEnabled ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>

                          {/* Inner Wall Space Slider */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-neutral-400">
                              <span>Wall Thickness (Inner Space)</span>
                              <span className="text-amber-400 font-bold font-mono">
                                {selectedObject.innerSpace3D !== undefined ? selectedObject.innerSpace3D : 10}px
                              </span>
                            </div>
                            <input
                              type="range"
                              min="2"
                              max="60"
                              step="1"
                              disabled={!selectedObject.hollowEnabled}
                              value={selectedObject.innerSpace3D !== undefined ? selectedObject.innerSpace3D : 10}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                const currentDepth = selectedObject.depth3D || 40;
                                const pts = selectedObject.originalPointsBackup || selectedObject.points;
                                if (pts) {
                                  const res = extrude2DTo3D(pts, selectedObject.fillColor, selectedObject.strokeColor, currentDepth, !!selectedObject.hollowEnabled, val);
                                  updateObject(selectedObject.id, {
                                    vertices3D: res.vertices,
                                    faces3D: res.faces,
                                    innerSpace3D: val
                                  });
                                }
                              }}
                              className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer disabled:opacity-30"
                            />
                          </div>

                          {/* Extrusion Depth Slider */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-neutral-400">
                              <span>3D Extrusion Depth</span>
                              <span className="text-amber-400 font-bold font-mono">
                                {selectedObject.depth3D !== undefined ? selectedObject.depth3D : 40}px
                              </span>
                            </div>
                            <input
                              type="range"
                              min="5"
                              max="300"
                              step="5"
                              value={selectedObject.depth3D !== undefined ? selectedObject.depth3D : 40}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                const pts = selectedObject.originalPointsBackup || selectedObject.points;
                                const currentInner = selectedObject.innerSpace3D !== undefined ? selectedObject.innerSpace3D : 10;
                                if (pts) {
                                  const res = extrude2DTo3D(pts, selectedObject.fillColor, selectedObject.strokeColor, val, !!selectedObject.hollowEnabled, currentInner);
                                  updateObject(selectedObject.id, {
                                    vertices3D: res.vertices,
                                    faces3D: res.faces,
                                    depth3D: val
                                  });
                                }
                              }}
                              className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* FACE WORKBENCH */}
                        <div className="space-y-3.5 border-t border-neutral-800/60 pt-3">
                          <span className="text-[10px] text-amber-500 font-extrabold uppercase tracking-wider block">
                            Face Workbench
                          </span>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-neutral-400 shrink-0">Select Face</span>
                              <select
                                id="select-face-dropdown"
                                value={selectedObject.selectedFaceIndex !== undefined ? selectedObject.selectedFaceIndex : -1}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    selectedFaceIndex: val === -1 ? undefined : val
                                  });
                                }}
                                className="w-full bg-neutral-950 text-xs text-neutral-300 border border-neutral-800 rounded px-2 py-1 focus:outline-none focus:border-amber-500"
                              >
                                <option value="-1">None (Highlight Disabled)</option>
                                {(selectedObject.faces3D || []).map((face, idx) => (
                                  <option key={idx} value={idx}>
                                    Face #{idx} ({face.indices.length}-sided, Color: {face.fillColor})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {selectedObject.selectedFaceIndex !== undefined && (
                              <div className="bg-neutral-950/60 p-2.5 rounded-lg border border-amber-500/20 space-y-3 animate-fade-in">
                                <div className="text-[10px] text-amber-400 font-bold flex items-center justify-between">
                                  <span>Active Face: Face #{selectedObject.selectedFaceIndex}</span>
                                  <span className="text-[9px] text-neutral-500">Live Gold Outline</span>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  {/* Delete Face */}
                                  <button
                                    id="delete-face-btn"
                                    onClick={() => {
                                      const currentFaceIndex = selectedObject.selectedFaceIndex;
                                      if (currentFaceIndex === undefined || !selectedObject.faces3D) return;
                                      const updatedFaces = deleteFace3D(selectedObject.faces3D, currentFaceIndex);
                                      updateObject(selectedObject.id, {
                                        faces3D: updatedFaces,
                                        selectedFaceIndex: undefined
                                      });
                                    }}
                                    className="flex items-center justify-center gap-1 bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 rounded-lg py-1.5 text-[10px] font-bold uppercase transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete Face
                                  </button>

                                  {/* Extrude Face */}
                                  <button
                                    id="extrude-face-btn"
                                    onClick={() => {
                                      const currentFaceIndex = selectedObject.selectedFaceIndex;
                                      if (currentFaceIndex === undefined || !selectedObject.vertices3D || !selectedObject.faces3D) return;
                                      const res = extrudeFace3D(selectedObject.vertices3D, selectedObject.faces3D, currentFaceIndex, faceExtrudeDist);
                                      updateObject(selectedObject.id, {
                                        vertices3D: res.vertices,
                                        faces3D: res.faces,
                                        selectedFaceIndex: undefined
                                      });
                                    }}
                                    className="flex items-center justify-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg py-1.5 text-[10px] font-bold uppercase transition"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    Extrude Face
                                  </button>
                                </div>

                                {/* Face Extrude Slider */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                    <span>Face Extrude Distance</span>
                                    <span className="text-amber-400 font-bold font-mono">{faceExtrudeDist}px</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="5"
                                    max="150"
                                    step="5"
                                    value={faceExtrudeDist}
                                    onChange={(e) => setFaceExtrudeDist(parseInt(e.target.value))}
                                    className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                                  />
                                </div>

                                {/* Face Color Palette */}
                                <div className="space-y-1.5">
                                  <span className="text-[9px] text-neutral-400 block">Paint Selected Face</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F3F4F6', '#1F2937', '#B45309', '#111827'].map((color) => (
                                      <button
                                        key={color}
                                        onClick={() => {
                                          const currentFaceIndex = selectedObject.selectedFaceIndex;
                                          if (currentFaceIndex === undefined || !selectedObject.faces3D) return;
                                          const nextFaces = [...selectedObject.faces3D];
                                          nextFaces[currentFaceIndex] = {
                                            ...nextFaces[currentFaceIndex],
                                            baseColor: color,
                                            fillColor: color
                                          };
                                          updateObject(selectedObject.id, {
                                            faces3D: nextFaces
                                          });
                                        }}
                                        className="w-5 h-5 rounded border border-neutral-700/50 hover:scale-110 active:scale-95 transition"
                                        style={{ backgroundColor: color }}
                                        title={color}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* EDGE WORKBENCH */}
                        <div className="space-y-3.5 border-t border-neutral-800/60 pt-3">
                          <span className="text-[10px] text-amber-500 font-extrabold uppercase tracking-wider block">
                            Edge Workbench
                          </span>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-neutral-400 shrink-0">Select Edge</span>
                              <select
                                id="select-edge-dropdown"
                                value={selectedObject.selectedEdgeIndex !== undefined ? selectedObject.selectedEdgeIndex : -1}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  updateObject(selectedObject.id, {
                                    selectedEdgeIndex: val === -1 ? undefined : val
                                  });
                                }}
                                className="w-full bg-neutral-950 text-xs text-neutral-300 border border-neutral-800 rounded px-2 py-1 focus:outline-none focus:border-amber-500"
                              >
                                <option value="-1">None (Highlight Disabled)</option>
                                {(() => {
                                  const edgesList: [number, number][] = [];
                                  if (selectedObject.faces3D) {
                                    const edgeSet = new Set<string>();
                                    selectedObject.faces3D.forEach(face => {
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
                                  }
                                  return edgesList.map((edge, idx) => (
                                    <option key={idx} value={idx}>
                                      Edge #{idx} (Vertices {edge[0]}-{edge[1]})
                                    </option>
                                  ));
                                })()}
                              </select>
                            </div>

                            {selectedObject.selectedEdgeIndex !== undefined && (
                              <div className="bg-neutral-950/60 p-2.5 rounded-lg border border-amber-500/20 space-y-3 animate-fade-in">
                                {(() => {
                                  const edgesList: [number, number][] = [];
                                  if (selectedObject.faces3D) {
                                    const edgeSet = new Set<string>();
                                    selectedObject.faces3D.forEach(face => {
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
                                  }
                                  const currentEdge = edgesList[selectedObject.selectedEdgeIndex];
                                  if (!currentEdge) return null;

                                  return (
                                    <>
                                      <div className="text-[10px] text-amber-400 font-bold flex items-center justify-between">
                                        <span>Active Edge: Edge #{selectedObject.selectedEdgeIndex} (Verts {currentEdge[0]}-{currentEdge[1]})</span>
                                        <span className="text-[9px] text-neutral-500">Live Gold Line</span>
                                      </div>

                                      <button
                                        id="extrude-edge-btn"
                                        onClick={() => {
                                          const currentEdgeIndex = selectedObject.selectedEdgeIndex;
                                          if (currentEdgeIndex === undefined || !selectedObject.vertices3D || !selectedObject.faces3D) return;
                                          const [v0Idx, v1Idx] = currentEdge;
                                          const res = extrudeEdge3D(
                                            selectedObject.vertices3D,
                                            selectedObject.faces3D,
                                            v0Idx,
                                            v1Idx,
                                            edgeExtrudeDist,
                                            selectedObject.fillColor || '#F59E0B'
                                          );
                                          updateObject(selectedObject.id, {
                                            vertices3D: res.vertices,
                                            faces3D: res.faces,
                                            selectedEdgeIndex: undefined
                                          });
                                        }}
                                        className="w-full flex items-center justify-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg py-1.5 text-[10px] font-bold uppercase transition"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                        Extrude Selected Edge
                                      </button>

                                      {/* Edge Extrude Slider */}
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                          <span>Edge Extrude Distance</span>
                                          <span className="text-amber-400 font-bold font-mono">{edgeExtrudeDist}px</span>
                                        </div>
                                        <input
                                          type="range"
                                          min="5"
                                          max="150"
                                          step="5"
                                          value={edgeExtrudeDist}
                                          onChange={(e) => setEdgeExtrudeDist(parseInt(e.target.value))}
                                          className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                                        />
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 3D TRANSLATION (X, Y, Z) */}
                      <div className="space-y-2.5">
                        <span className="text-[10px] text-neutral-400 block font-black uppercase tracking-wider">3D Translation</span>
                        
                        {/* Translation X */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Translation X (Horizontal)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.x}px</span>
                          </div>
                          <input
                            type="range"
                            min="-500"
                            max="500"
                            value={selectedObject.transform3D.x}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, x: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Translation Y */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Translation Y (Vertical)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.y}px</span>
                          </div>
                          <input
                            type="range"
                            min="-500"
                            max="500"
                            value={selectedObject.transform3D.y}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, y: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Translation Z (Depth) */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Translation Z (Depth Plane)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.z}px</span>
                          </div>
                          <input
                            type="range"
                            min="-250"
                            max="500"
                            value={selectedObject.transform3D.z}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, z: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* 3D EULER ROTATION (X, Y, Z) */}
                      <div className="space-y-2.5 border-t border-neutral-800/40 pt-3">
                        <span className="text-[10px] text-neutral-400 block font-black uppercase tracking-wider">3D Euler Rotation (Angles)</span>
                        
                        {/* Rotation X (Pitch) */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Pitch Angle (X Axis)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.rx}°</span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={selectedObject.transform3D.rx}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, rx: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Rotation Y (Yaw) */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Yaw Angle (Y Axis)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.ry}°</span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={selectedObject.transform3D.ry}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, ry: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Rotation Z (Roll) */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Roll Angle (Z Axis)</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.rz}°</span>
                          </div>
                          <input
                            type="range"
                            min="-180"
                            max="180"
                            value={selectedObject.transform3D.rz}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, rz: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* 3D SCALE (X, Y, Z) */}
                      <div className="space-y-2.5 border-t border-neutral-800/40 pt-3">
                        <span className="text-[10px] text-neutral-400 block font-black uppercase tracking-wider">3D Mesh Scale Factor</span>
                        
                        {/* Scale X */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Scale X Factor</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.sx}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="4"
                            step="0.05"
                            value={selectedObject.transform3D.sx}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, sx: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Scale Y */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Scale Y Factor</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.sy}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="4"
                            step="0.05"
                            value={selectedObject.transform3D.sy}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, sy: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Scale Z */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400">
                            <span>Scale Z Factor</span>
                            <span className="text-amber-400 font-bold font-mono">{selectedObject.transform3D.sz}x</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="4"
                            step="0.05"
                            value={selectedObject.transform3D.sz}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              updateObject(selectedObject.id, {
                                transform3D: { ...selectedObject.transform3D!, sz: val }
                              });
                            }}
                            className="w-full accent-amber-500 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* SKELETAL BONE RIGGING STUDIO */}
                      <div className="space-y-3.5 border-t border-neutral-800/40 pt-3.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            Skeletal Mesh Rigging Studio
                          </span>
                          <span className="text-[8px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded font-bold uppercase">
                            Single Mesh LBS
                          </span>
                        </div>

                        <p className="text-[10px] text-neutral-400 leading-normal font-medium">
                          Rig your custom single 3D mesh by adding skeletal bones between vertices. Vertices will deform organically around joints based on bones' angles!
                        </p>

                        {/* List Active Bones */}
                        <div className="space-y-3">
                          <span className="text-[9px] text-neutral-400 font-black uppercase block tracking-wider">Active Bone Joints</span>
                          
                          {!selectedObject.bones3D || selectedObject.bones3D.length === 0 ? (
                            <div className="text-center py-4 bg-neutral-950/60 rounded-xl border border-neutral-850 border-dashed text-[10px] font-bold text-neutral-500">
                              No skeletal bone joints rigged yet. Add bone joints below!
                            </div>
                          ) : (
                            selectedObject.bones3D.map((bone: any, bIdx: number) => (
                              <div key={bone.id || bIdx} className="bg-neutral-950/80 p-3 rounded-xl border border-neutral-850 space-y-2.5">
                                <div className="flex items-center justify-between border-b border-neutral-900/60 pb-1.5">
                                  <span className="text-[10px] font-black text-amber-300 uppercase truncate">
                                    🦴 {bone.name || `Bone_${bIdx + 1}`}
                                  </span>
                                  <span className="text-[8.5px] font-mono text-neutral-500">
                                    Verts: {bone.startVertexIdx} ➔ {bone.endVertexIdx}
                                  </span>
                                </div>

                                {/* Slider for pitch */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                    <span>Joint Pitch (rx)</span>
                                    <span className="text-amber-400 font-bold font-mono">{bone.rx}°</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    value={bone.rx || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value);
                                      const newBones = [...(selectedObject.bones3D || [])];
                                      newBones[bIdx] = { ...newBones[bIdx], rx: val };
                                      updateObject(selectedObject.id, { bones3D: newBones });
                                    }}
                                    className="w-full accent-amber-500 h-1 bg-neutral-800 rounded appearance-none cursor-pointer"
                                  />
                                </div>

                                {/* Slider for yaw */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                    <span>Joint Yaw (ry)</span>
                                    <span className="text-amber-400 font-bold font-mono">{bone.ry || 0}°</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    value={bone.ry || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value);
                                      const newBones = [...(selectedObject.bones3D || [])];
                                      newBones[bIdx] = { ...newBones[bIdx], ry: val };
                                      updateObject(selectedObject.id, { bones3D: newBones });
                                    }}
                                    className="w-full accent-amber-500 h-1 bg-neutral-800 rounded appearance-none cursor-pointer"
                                  />
                                </div>

                                {/* Slider for roll */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[9px] text-neutral-400">
                                    <span>Joint Roll (rz)</span>
                                    <span className="text-amber-400 font-bold font-mono">{bone.rz || 0}°</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="-180"
                                    max="180"
                                    value={bone.rz || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value);
                                      const newBones = [...(selectedObject.bones3D || [])];
                                      newBones[bIdx] = { ...newBones[bIdx], rz: val };
                                      updateObject(selectedObject.id, { bones3D: newBones });
                                    }}
                                    className="w-full accent-amber-500 h-1 bg-neutral-800 rounded appearance-none cursor-pointer"
                                  />
                                </div>

                                <button
                                  onClick={() => {
                                    const newBones = (selectedObject.bones3D || []).filter((_: any, idx: number) => idx !== bIdx);
                                    updateObject(selectedObject.id, { bones3D: newBones });
                                  }}
                                  className="w-full py-1 text-[8.5px] bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-black rounded-lg transition-all active:scale-95"
                                >
                                  REMOVE BONE
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add New Bone Controller */}
                        <div className="bg-neutral-900/50 p-3 rounded-xl border border-neutral-850 space-y-3">
                          <span className="text-[9.5px] text-amber-400 font-black uppercase block tracking-wider">
                            + ADD NEW BONE SEGMENT
                          </span>

                          {/* Bone Name */}
                          <div className="space-y-1">
                            <label className="text-[8.5px] text-neutral-500 font-bold uppercase block">Bone Label / Part Name</label>
                            <input
                              type="text"
                              id="new-bone-name"
                              placeholder="e.g. Right Arm Joint"
                              className="w-full px-2.5 py-1.5 bg-neutral-950 border border-neutral-850 rounded-lg text-[10px] font-bold text-neutral-200 outline-none focus:border-amber-500/60"
                            />
                          </div>

                          {/* Choose start & end vertices dynamically based on total vertices of model */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[8px] text-neutral-500 font-bold uppercase block">Start Joint Vert</label>
                              <input
                                type="number"
                                id="new-bone-start"
                                min="0"
                                max={Math.max(0, (selectedObject.vertices3D?.length || 1) - 1)}
                                defaultValue="0"
                                className="w-full px-2 py-1 bg-neutral-950 border border-neutral-850 rounded text-[10px] font-mono text-amber-400 font-bold"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[8px] text-neutral-500 font-bold uppercase block">End Joint Vert</label>
                              <input
                                type="number"
                                id="new-bone-end"
                                min="0"
                                max={Math.max(0, (selectedObject.vertices3D?.length || 1) - 1)}
                                defaultValue="3"
                                className="w-full px-2 py-1 bg-neutral-950 border border-neutral-850 rounded text-[10px] font-mono text-amber-400 font-bold"
                              />
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              const nameInput = document.getElementById('new-bone-name') as HTMLInputElement;
                              const startInput = document.getElementById('new-bone-start') as HTMLInputElement;
                              const endInput = document.getElementById('new-bone-end') as HTMLInputElement;

                              const name = nameInput?.value || `Bone_${(selectedObject.bones3D || []).length + 1}`;
                              const startVal = parseInt(startInput?.value || '0');
                              const endVal = parseInt(endInput?.value || '3');

                              const newBone = {
                                id: `bone_${Date.now()}`,
                                name,
                                rx: 0,
                                ry: 0,
                                rz: 0,
                                startVertexIdx: startVal,
                                endVertexIdx: endVal
                              };

                              const existingBones = [...(selectedObject.bones3D || [])];
                              existingBones.push(newBone);
                              updateObject(selectedObject.id, { bones3D: existingBones });

                              if (nameInput) nameInput.value = '';
                              alert(`Organically rigged "${name}" bone joint connecting vertices ${startVal} ➔ ${endVal}! Use the bone sliders above to rotate & deform the 3D mesh.`);
                            }}
                            className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-lg transition-all active:scale-95 text-[10px]"
                          >
                            CONNECT SKELETAL BONE
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Color Picker Sub-section */}
                  <div className="pt-2 border-t border-neutral-800/40 space-y-2">
                    <span className="text-xs text-neutral-400 block font-bold">Stroke & Fill Colors</span>
                    
                    {/* Stroke Color */}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-neutral-500">Stroke Color</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={selectedObject.strokeColor || '#000000'}
                          onChange={(e) => updateObject(selectedObject.id, { strokeColor: e.target.value })}
                          className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                        />
                        <input
                          type="text"
                          value={selectedObject.strokeColor || ''}
                          onChange={(e) => updateObject(selectedObject.id, { strokeColor: e.target.value })}
                          className="bg-neutral-950 border border-neutral-800 text-[10px] px-2 py-1 rounded text-white font-mono w-20 outline-none"
                        />
                      </div>
                    </div>

                    {/* Fill Color */}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-neutral-500">Fill Color</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateObject(selectedObject.id, { fillColor: 'transparent' })}
                          className={`text-[9px] px-1.5 py-1 rounded font-bold border ${
                            selectedObject.fillColor === 'transparent'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                          }`}
                        >
                          None
                        </button>
                        <input
                          type="color"
                          disabled={selectedObject.fillColor === 'transparent'}
                          value={selectedObject.fillColor === 'transparent' ? '#ffffff' : (selectedObject.fillColor || '#ffffff')}
                          onChange={(e) => updateObject(selectedObject.id, { fillColor: e.target.value })}
                          className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 disabled:opacity-40"
                        />
                        <input
                          type="text"
                          value={selectedObject.fillColor || ''}
                          onChange={(e) => updateObject(selectedObject.id, { fillColor: e.target.value })}
                          className="bg-neutral-950 border border-neutral-800 text-[10px] px-2 py-1 rounded text-white font-mono w-20 outline-none"
                        />
                      </div>
                    </div>

                    {/* Preset Swatches for Fill Color */}
                    <div className="flex flex-wrap gap-1.5 pt-1 justify-end">
                      {['#FF5722', '#4CAF50', '#2196F3', '#9C27B0', '#FFEB3B', '#FF9800', '#000000', '#ffffff'].map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateObject(selectedObject.id, { fillColor: color })}
                          style={{ backgroundColor: color }}
                          className="w-4 h-4 rounded-full border border-neutral-700 hover:scale-110 active:scale-90 transition-transform"
                          title={`Set Fill to ${color}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Pin to Smart Controls Switch */}
                  <div className="flex items-center justify-between pt-2 border-t border-neutral-800/40">
                    <span className="text-xs text-neutral-400 font-bold">Pin to Smart Controls</span>
                    <button
                      onClick={() => toggleSmartPin(selectedObject.id)}
                      className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-lg transition-colors border ${
                        smartPinnedIds.includes(selectedObject.id)
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-neutral-950 text-neutral-500 border-neutral-800'
                      }`}
                    >
                      {smartPinnedIds.includes(selectedObject.id) ? 'PINNED' : 'PIN SC'}
                    </button>
                  </div>
                </div>

                {/* MAKE SINGLE / MERGE DRAWINGS CARD */}
                <div className="space-y-3 bg-neutral-950/40 p-3.5 rounded-2xl border border-neutral-800/50 relative">
                  <div className="flex items-center justify-between border-b border-neutral-800/40 pb-2">
                    <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center gap-1.5 font-bold">
                      <GitMerge className="w-3.5 h-3.5 text-amber-500" />
                      <span>MAKE SINGLE</span>
                    </div>
                    
                    <div className="relative">
                      <button
                        id="btn-add-merge-piece"
                        onClick={() => setIsMergeDropdownOpen(!isMergeDropdownOpen)}
                        className="p-1 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-amber-500 hover:text-amber-400 transition-all flex items-center justify-center cursor-pointer"
                        title="Add Drawing Piece to Merge"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      {isMergeDropdownOpen && (
                        <div className="absolute right-0 mt-1 w-56 bg-neutral-950 border border-neutral-800 rounded-xl shadow-xl z-50 overflow-hidden py-1 max-h-48 overflow-y-auto">
                          {(() => {
                            const availableDrawings = Object.values(objects).filter(obj => 
                              obj.id !== selectedObject.id && 
                              !mergePieces.includes(obj.id)
                            );
                            
                            if (availableDrawings.length === 0) {
                              return (
                                <div className="text-[10px] text-neutral-500 py-2 px-3 text-center">
                                  No other drawings available on canvas.
                                </div>
                              );
                            }
                            
                            return availableDrawings.map(obj => (
                              <button
                                key={obj.id}
                                onClick={() => {
                                  setMergePieces([...mergePieces, obj.id]);
                                  setIsMergeDropdownOpen(false);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-neutral-900 text-neutral-300 hover:text-white text-[11px] transition-colors flex items-center gap-1.5 font-semibold"
                              >
                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: obj.strokeColor || '#000000' }} />
                                <span className="truncate">{obj.name || `Drawing (${obj.id.slice(-4)})`}</span>
                              </button>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] text-neutral-500 block uppercase font-bold tracking-wide">Selected Pieces:</span>
                    {mergePieces.length === 0 ? (
                      <div className="text-[10px] text-neutral-400 italic py-1">
                        No pieces added yet. Click + to add other drawing pieces.
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                        {mergePieces.map(pieceId => {
                          const piece = objects[pieceId];
                          if (!piece) return null;
                          return (
                            <div key={pieceId} className="flex items-center justify-between bg-neutral-900/60 border border-neutral-800/40 px-2 py-1 rounded-lg text-[11px]">
                              <span className="text-neutral-300 font-medium truncate max-w-[150px]">{piece.name}</span>
                              <button
                                onClick={() => setMergePieces(mergePieces.filter(id => id !== pieceId))}
                                className="text-neutral-500 hover:text-rose-400 transition-colors"
                                title="Remove piece"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {mergePieces.length > 0 && (
                    <button
                      id="btn-execute-make-single"
                      onClick={handleMakeSingle}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black rounded-xl transition-all shadow-md shadow-amber-500/10 text-xs flex items-center justify-center gap-1.5 mt-2 cursor-pointer animate-fade-in"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      MAKE SINGLE DRAWING
                    </button>
                  )}
                </div>

                {/* Smooth X, Y Sliders (always visible, disabled if not independent or closed rigged) */}
                {selectedObject && (() => {
                  const isRigged = !!selectedObject.parentId || bones.some(b => b.startObjectId === selectedObject.id || b.endObjectId === selectedObject.id);
                  const hasClosedEdgesSelf = selectedObject.type === 'shape' && selectedObject.shapeType !== 'line';
                  const hasClosedEdgesParent = !!(selectedObject.parentId && objects[selectedObject.parentId] && objects[selectedObject.parentId].type === 'shape' && objects[selectedObject.parentId].shapeType !== 'line');
                  const isSmoothMoveEnabled = !isRigged || hasClosedEdgesSelf || hasClosedEdgesParent;

                  return (
                    <div className={`space-y-4 bg-amber-500/5 p-4 rounded-2xl border transition-all duration-300 shadow-lg shadow-black/20 ${
                      isSmoothMoveEnabled ? 'border-amber-400/20' : 'border-neutral-800 opacity-60'
                    }`}>
                      <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center justify-between pb-2 border-b border-amber-500/10">
                        <div className="flex items-center gap-1.5">
                          <Move className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                          <span>SMOOTH POSITION</span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                          !isRigged 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : isSmoothMoveEnabled 
                              ? 'bg-amber-500/20 text-amber-400 font-black' 
                              : 'bg-neutral-800 text-neutral-500 font-bold'
                        }`}>
                          {!isRigged 
                            ? 'INDEPENDENT' 
                            : isSmoothMoveEnabled 
                              ? 'RIGGED (CLOSED EDGES)' 
                              : 'DISABLED FOR RIGGED'}
                        </span>
                      </div>

                      {/* Slider: Translate X */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-400">{isLassoActive ? 'Lasso Region X Nudge' : 'Smooth Translate X'}</span>
                          <span className="text-white font-bold">{currentTransformObj ? currentTransformObj.x.toFixed(1) : '0.0'}px</span>
                        </div>
                        <input
                          type="range"
                          min="-500"
                          max="1500"
                          step="0.5"
                          disabled={!isLassoActive && !isSmoothMoveEnabled}
                          value={currentTransformObj ? currentTransformObj.x : 0}
                          onChange={(e) => handleSliderChange('x', Number(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                        <div className="flex items-center justify-between gap-1.5 pt-0.5">
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled}
                            onClick={() => handleNudge('x', -10)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -10px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled}
                            onClick={() => handleNudge('x', -1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -1px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled}
                            onClick={() => handleNudge('x', 1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            +1px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled}
                            onClick={() => handleNudge('x', 10)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            +10px
                          </button>
                        </div>
                      </div>

                      {/* Slider: Translate Y */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-400">{isLassoActive ? 'Lasso Region Y Nudge' : 'Smooth Translate Y'}</span>
                          <span className="text-white font-bold">{currentTransformObj ? currentTransformObj.y.toFixed(1) : '0.0'}px</span>
                        </div>
                        <input
                          type="range"
                          min="-500"
                          max="1500"
                          step="0.5"
                          disabled={!isLassoActive && !isSmoothMoveEnabled}
                          value={currentTransformObj ? currentTransformObj.y : 0}
                          onChange={(e) => handleSliderChange('y', Number(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                        <div className="flex items-center justify-between gap-1.5 pt-0.5">
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled}
                            onClick={() => handleNudge('y', -10)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -10px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled}
                            onClick={() => handleNudge('y', -1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -1px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled}
                            onClick={() => handleNudge('y', 1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            +1px
                          </button>
                          <button
                            disabled={!isLassoActive && !isSmoothMoveEnabled}
                            onClick={() => handleNudge('y', 10)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            +10px
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Transform Sliders & Click Buttons */}
                <div className="space-y-4">
                  <div className="text-[10px] text-neutral-500 font-black uppercase tracking-wider flex items-center gap-1">
                    <Maximize2 className="w-3.5 h-3.5 text-amber-500" />
                    TRANSFORMS (PRECISION) {isLassoActive && <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded ml-auto">LASSO SELECTED</span>}
                  </div>

                  {/* Slider: Rotate */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Rotation</span>
                      <span className="text-white font-bold">{(currentTransformObj?.rotation ?? 0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-360"
                      max="360"
                      value={currentTransformObj?.rotation ?? 0}
                      onChange={(e) => handleSliderChange('rotation', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('rotation', -5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -5°
                      </button>
                      <button
                        onClick={() => handleNudge('rotation', -1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -1°
                      </button>
                      <button
                        onClick={() => handleNudge('rotation', 1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +1°
                      </button>
                      <button
                        onClick={() => handleNudge('rotation', 5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +5°
                      </button>
                    </div>
                  </div>

                  {/* Slider: Scale X */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Scale X (Width)</span>
                      <span className="text-white font-bold">{(currentTransformObj?.scaleX ?? 1).toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="4"
                      step="0.05"
                      value={currentTransformObj?.scaleX ?? 1}
                      onChange={(e) => handleSliderChange('scaleX', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('scaleX', -0.1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -0.1
                      </button>
                      <button
                        onClick={() => handleNudge('scaleX', 0.1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +0.1
                      </button>
                    </div>
                  </div>

                  {/* Slider: Scale Y */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Scale Y (Height)</span>
                      <span className="text-white font-bold">{(currentTransformObj?.scaleY ?? 1).toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="4"
                      step="0.05"
                      value={currentTransformObj?.scaleY ?? 1}
                      onChange={(e) => handleSliderChange('scaleY', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('scaleY', -0.1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -0.1
                      </button>
                      <button
                        onClick={() => handleNudge('scaleY', 0.1)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +0.1
                      </button>
                    </div>
                  </div>

                  {/* Slider: Skew X */}
                  <div className="space-y-1 pt-1 border-t border-neutral-800/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Skew X (horizontal skew)</span>
                      <span className="text-white font-bold">{(currentTransformObj?.skewX ?? 0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="60"
                      step="1"
                      value={currentTransformObj?.skewX ?? 0}
                      onChange={(e) => handleSliderChange('skewX', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('skewX', -5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -5°
                      </button>
                      <button
                        onClick={() => handleNudge('skewX', 5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +5°
                      </button>
                    </div>
                  </div>

                  {/* Slider: Skew Y */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Skew Y (vertical skew)</span>
                      <span className="text-white font-bold">{(currentTransformObj?.skewY ?? 0)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="60"
                      step="1"
                      value={currentTransformObj?.skewY ?? 0}
                      onChange={(e) => handleSliderChange('skewY', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('skewY', -5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -5°
                      </button>
                      <button
                        onClick={() => handleNudge('skewY', 5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +5°
                      </button>
                    </div>
                  </div>

                  {/* 🎥 3D VIEW & DUAL-AXIS ROTATION SECTION */}
                  <div className="space-y-3 pt-2 border-t border-neutral-800/30">
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-400">
                      <span>🎥 3D View & Rotation System</span>
                    </div>

                    {/* Camera Angle X (Up/Down View) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Camera Angle View (Up-Down Tilt)</span>
                        <span className="text-white font-bold">{(currentTransformObj?.cameraAngleX ?? 0)}°</span>
                      </div>
                      <input
                        type="range"
                        min="-90"
                        max="90"
                        step="1"
                        value={currentTransformObj?.cameraAngleX ?? 0}
                        onChange={(e) => handleSliderChange('cameraAngleX', Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleNudge('cameraAngleX', -5)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          -5°
                        </button>
                        <button
                          onClick={() => handleNudge('cameraAngleX', 5)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          +5°
                        </button>
                      </div>
                    </div>

                    {/* Camera Angle Y (Left/Right View) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Camera Angle View (Left-Right Parallax)</span>
                        <span className="text-white font-bold">{(currentTransformObj?.cameraAngleY ?? 0)}°</span>
                      </div>
                      <input
                        type="range"
                        min="-90"
                        max="90"
                        step="1"
                        value={currentTransformObj?.cameraAngleY ?? 0}
                        onChange={(e) => handleSliderChange('cameraAngleY', Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleNudge('cameraAngleY', -5)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          -5°
                        </button>
                        <button
                          onClick={() => handleNudge('cameraAngleY', 5)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          +5°
                        </button>
                      </div>
                    </div>

                    {/* Rotate Vertical (0 to 360) */}
                    <div className="space-y-1 pt-1.5 border-t border-neutral-800/20">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Rotate Vertical (3D Pitch 0-360°)</span>
                        <span className="text-white font-bold">{(currentTransformObj?.rotateX ?? 0)}°</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        step="1"
                        value={currentTransformObj?.rotateX ?? 0}
                        onChange={(e) => handleSliderChange('rotateX', Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleNudge('rotateX', -10)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          -10°
                        </button>
                        <button
                          onClick={() => handleNudge('rotateX', 10)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          +10°
                        </button>
                      </div>
                    </div>

                    {/* Rotate Horizontal (0 to 360) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Rotate Horizontal (3D Yaw 0-360°)</span>
                        <span className="text-white font-bold">{(currentTransformObj?.rotateY ?? 0)}°</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        step="1"
                        value={currentTransformObj?.rotateY ?? 0}
                        onChange={(e) => handleSliderChange('rotateY', Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleNudge('rotateY', -10)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          -10°
                        </button>
                        <button
                          onClick={() => handleNudge('rotateY', 10)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          +10°
                        </button>
                      </div>
                    </div>

                    {/* Perspective Depth */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-400">Perspective Depth</span>
                        <span className="text-white font-bold">{(currentTransformObj?.perspective ?? 0)}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="800"
                        step="10"
                        value={currentTransformObj?.perspective ?? 0}
                        onChange={(e) => handleSliderChange('perspective', Number(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1.5 pt-0.5">
                        <button
                          onClick={() => handleSliderChange('perspective', 0)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          Disable
                        </button>
                        <button
                          onClick={() => handleNudge('perspective', 50)}
                          className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                        >
                          +50px
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Batch Transformations / Smart Controls Panel */}
                {smartPinnedIds.length > 0 && (
                  <div className="space-y-3 bg-neutral-950/40 p-3.5 rounded-2xl border border-neutral-800/50">
                    <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider block">
                      Smart Controls Batch
                    </div>
                    <div className="space-y-1.5">
                      {smartPinnedIds.map(id => {
                        const obj = objects[id];
                        if (!obj) return null;
                        const isChecked = !!smartCheckedIds[id];
                        return (
                          <div 
                            key={id} 
                            onClick={() => handleSmartCheckboxToggle(id)}
                            className="flex items-center justify-between p-2 rounded-xl bg-neutral-900 border border-neutral-800/80 cursor-pointer text-xs select-none hover:border-neutral-700 transition-colors"
                          >
                            <span className="truncate text-neutral-300 font-bold">{obj.name}</span>
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-amber-400" />
                            ) : (
                              <SquareIcon className="w-4 h-4 text-neutral-600" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-neutral-500 font-bold block pt-1 leading-normal">
                      Note: Adjusting any transforms above applies to all checked batch drawings instantly.
                    </span>
                  </div>
                )}

                {/* Opposite Smart Controls */}
                <div className="space-y-3 bg-neutral-950/40 p-3.5 rounded-2xl border border-neutral-800/50">
                  <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider block">
                    Opposite Smart Sync
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleAddToOpposite(1)}
                      className="flex-1 py-1 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800 active:scale-95 transition-all"
                    >
                      + Add to Section 1
                    </button>
                    <button
                      onClick={() => handleAddToOpposite(2)}
                      className="flex-1 py-1 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800 active:scale-95 transition-all"
                    >
                      + Add to Section 2
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1.5">
                    <div className="space-y-1">
                      <span className="text-[10px] text-neutral-500 font-black uppercase block">Section 1</span>
                      <div className="bg-neutral-950/60 p-2 rounded-xl text-[10px] text-neutral-400 min-h-12 border border-neutral-900 flex flex-col gap-1">
                        {oppositeSection1.length === 0 ? 'Empty' : oppositeSection1.map(id => (
                          <div key={id} className="flex items-center justify-between">
                            <span className="truncate">{objects[id]?.name || 'Unknown'}</span>
                            <button onClick={() => setOppositeSection1(prev => prev.filter(x => x !== id))} className="text-neutral-600 hover:text-rose-400">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-neutral-500 font-black uppercase block">Section 2</span>
                      <div className="bg-neutral-950/60 p-2 rounded-xl text-[10px] text-neutral-400 min-h-12 border border-neutral-900 flex flex-col gap-1">
                        {oppositeSection2.length === 0 ? 'Empty' : oppositeSection2.map(id => (
                          <div key={id} className="flex items-center justify-between">
                            <span className="truncate">{objects[id]?.name || 'Unknown'}</span>
                            <button onClick={() => setOppositeSection2(prev => prev.filter(x => x !== id))} className="text-neutral-600 hover:text-rose-400">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-bold block pt-1 leading-normal">
                    Limb Syncing: Section 1 rotates forward, Section 2 rotates backward in opposite directions on Rotation adjustments!
                  </span>
                </div>

                {/* Associated Rigging Bones list */}
                {selectedObjectBones.length > 0 && (
                  <div className="space-y-3 bg-neutral-950/40 p-3.5 rounded-2xl border border-neutral-800/50">
                    <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider block flex items-center gap-1">
                      <Workflow className="w-3.5 h-3.5 text-amber-500" />
                      Associated Rigging Bones
                    </div>
                    <div className="space-y-2">
                      {selectedObjectBones.map((bone) => (
                        <div key={bone.id} className="bg-neutral-900 p-2.5 rounded-xl border border-neutral-800 text-xs">
                          <div className="flex items-center justify-between font-bold">
                            <span className="text-neutral-200">{bone.name}</span>
                            <button 
                              onClick={() => deleteBone(bone.id)}
                              className="p-1 rounded text-neutral-500 hover:text-rose-400"
                              title="Delete bone link"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Detachment Constraints Toggle */}
                          <div className="flex items-center justify-between pt-2 mt-2 border-t border-neutral-800/50">
                            <span className="text-[10px] text-neutral-400 uppercase font-black">Allow Detachments</span>
                            <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                              LOCKED (RIGID)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* LASSO AREA COLOR FILL PANEL */}
            <div className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4 animate-fade-in">
              <div className="flex items-center justify-between text-[10px] text-amber-400 font-black uppercase tracking-wider font-black border-b border-neutral-800/40 pb-2.5">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  Lasso Area Color Fill
                </span>
                {lassoPoints.length > 0 && (
                  <span className="bg-amber-500/10 text-amber-400 text-[8px] font-black px-1.5 py-0.5 rounded-full">
                    {lassoPoints.length} PTS
                  </span>
                )}
              </div>

              <div className="space-y-3.5 text-xs">
                <p className="text-[11px] text-neutral-400 leading-relaxed font-medium">
                  Draw an area around your drawings with the <strong className="text-amber-400">Lasso Fill tool (Sparkles)</strong>, select a color, and tap Fill to color only that section.
                </p>

                {/* Selection Mode Toggle */}
                <div className="flex bg-neutral-900/60 p-1 rounded-xl border border-neutral-800/60 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLassoMode('freehand');
                      setPenLassoPoints([]);
                    }}
                    className={`flex-1 py-1.5 px-2 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      lassoMode === 'freehand'
                        ? 'bg-amber-500 text-neutral-950 font-black shadow shadow-amber-500/20'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Freehand Lasso
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLassoMode('pen');
                    }}
                    className={`flex-1 py-1.5 px-2 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      lassoMode === 'pen'
                        ? 'bg-amber-500 text-neutral-950 font-black shadow shadow-amber-500/20'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Feather className="w-3.5 h-3.5" />
                    Vector Pen
                  </button>
                </div>

                {/* Lasso Active Tool Button & Area Clears */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTool('LSO')}
                    className={`flex-1 py-2 px-3 text-xs font-black uppercase rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      activeTool === 'LSO'
                        ? 'bg-amber-500 text-neutral-950 border-amber-400 font-black shadow-md shadow-amber-500/20'
                        : 'bg-neutral-900 text-neutral-300 hover:text-white border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Lasso Tool
                  </button>

                  {lassoPoints.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRemoveLassoArea}
                      className="p-2 bg-neutral-900 border border-neutral-800 hover:border-rose-900 text-neutral-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                      title="Remove lasso area outline"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Color Selector & Swatches */}
                <div className="space-y-2 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400 font-black uppercase tracking-wider">Fill Color</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-neutral-400 font-bold uppercase">{lassoColor}</span>
                      <input
                        type="color"
                        value={lassoColor}
                        onChange={(e) => setLassoColor(e.target.value)}
                        className="w-5 h-5 bg-transparent border-0 rounded cursor-pointer shrink-0"
                      />
                    </div>
                  </div>

                  {/* Swatches preset list */}
                  <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-neutral-800/20">
                    {['#E53935', '#D81B60', '#8E24AA', '#5E35B1', '#3949AB', '#1E88E5', '#00ACC1', '#00897B', '#43A047', '#7CB342', '#FDD835', '#FB8C00', '#F4511E', '#FFFFFF', '#000000'].map(swColor => (
                      <button
                        key={swColor}
                        type="button"
                        onClick={() => setLassoColor(swColor)}
                        className={`w-4 h-4 rounded-full border cursor-pointer transition-all ${
                          lassoColor === swColor ? 'scale-125 border-white ring-1 ring-amber-500' : 'border-neutral-950 hover:scale-110'
                        }`}
                        style={{ backgroundColor: swColor }}
                      />
                    ))}
                  </div>
                </div>

                {/* Fill / Clear Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleApplyLassoFill}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    FILL LASSO REGION
                  </button>

                  <button
                    type="button"
                    onClick={handleClearLassoFills}
                    className="py-2 px-3 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-rose-400 font-bold rounded-xl text-[10px] uppercase tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1"
                    title="Remove all lasso fills from drawing"
                  >
                    Reset Fills
                  </button>
                </div>
              </div>
            </div>

            {/* PERMANENT DRAWING ATTACHMENTS PANEL */}
            <div className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4 animate-fade-in">
              <div className="flex items-center justify-between text-[10px] text-amber-400 font-black uppercase tracking-wider font-black border-b border-neutral-800/40 pb-2.5">
                <span className="flex items-center gap-1.5">
                  <Link className="w-3.5 h-3.5 text-amber-500" />
                  Permanent Group Attachments
                </span>
                {selectedObject?.attachedGroupId && (
                  <span className="bg-emerald-500/10 text-emerald-400 text-[8px] font-black px-1.5 py-0.5 rounded-full">
                    ATTACHED
                  </span>
                )}
              </div>

              <div className="space-y-3 text-xs">
                <p className="text-[11px] text-neutral-400 leading-relaxed font-medium">
                  Connect multiple separate drawings permanently so they <strong className="text-amber-400">always move together</strong> as a rigid group while keeping individual rotation, scales, colors, and layering.
                </p>

                {/* Dropdown to add drawings */}
                <div className="space-y-2">
                  <label className="text-[10px] text-neutral-400 font-black uppercase block tracking-wide">
                    Select drawings to attach:
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      value={attachSelectedId}
                      onChange={(e) => handleAddAttachmentPiece(e.target.value)}
                      className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500 font-bold"
                    >
                      <option value="">-- Add Drawing to Group --</option>
                      {Object.values(objects)
                        .filter(o => !attachmentPieces.includes(o.id) && o.id !== selectedObject?.id)
                        .map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))
                      }
                    </select>
                  </div>
                </div>

                {/* List of attachment pieces added so far */}
                {(attachmentPieces.length > 0 || selectedObject) && (
                  <div className="space-y-1.5 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/40">
                    <span className="text-[9px] text-neutral-400 uppercase font-black block pb-1 border-b border-neutral-800/20">
                      Attachments in draft group:
                    </span>
                    <div className="space-y-1 max-h-32 overflow-y-auto pt-1 flex flex-col gap-1">
                      {selectedObject && (
                        <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg text-[11px]">
                          <span className="text-amber-400 font-black truncate">{selectedObject.name} (Selected)</span>
                          <span className="text-[9px] text-amber-500/80 uppercase font-black">Anchor</span>
                        </div>
                      )}

                      {attachmentPieces.map(pieceId => {
                        const piece = objects[pieceId];
                        if (!piece) return null;
                        return (
                          <div key={pieceId} className="flex items-center justify-between bg-neutral-950/60 border border-neutral-800/40 px-2.5 py-1 rounded-lg text-[11px]">
                            <span className="text-neutral-300 font-medium truncate">{piece.name}</span>
                            <button
                              type="button"
                              onClick={() => setAttachmentPieces(attachmentPieces.filter(id => id !== pieceId))}
                              className="text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Attach Button */}
                <button
                  type="button"
                  onClick={handleExecuteAttach}
                  disabled={attachmentPieces.length === 0 && !selectedObject}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-black uppercase text-xs rounded-xl tracking-wider shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Link className="w-3.5 h-3.5" />
                  ATTACH DRAWINGS NOW
                </button>

                {/* Active Group Info, Z-Index Ordering and Detach */}
                {selectedObject && selectedObject.attachedGroupId && (
                  <div className="mt-3 pt-3 border-t border-neutral-800/40 space-y-3">
                    <div className="text-[10px] text-neutral-400 font-black uppercase tracking-wider block">
                      Active Group Layering & Order
                    </div>
                    
                    {/* Z-Index Controls */}
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[10px] text-neutral-400 font-bold">Individual Depth:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const curZ = selectedObject.zIndex ?? 0;
                            updateObject(selectedObject.id, { zIndex: curZ - 1 });
                          }}
                          className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 rounded-lg text-[10px] text-neutral-300 font-black cursor-pointer active:scale-95 transition-all"
                          title="Move Backwards"
                        >
                          Send Back
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const curZ = selectedObject.zIndex ?? 0;
                            updateObject(selectedObject.id, { zIndex: curZ + 1 });
                          }}
                          className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500 text-amber-400 rounded-lg text-[10px] text-neutral-300 font-black cursor-pointer active:scale-95 transition-all"
                          title="Bring Forwards"
                        >
                          Bring Front
                        </button>
                      </div>
                    </div>

                    {/* Detach Selected button */}
                    <button
                      type="button"
                      onClick={handleDetachObject}
                      className="w-full py-2 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-900/40 hover:border-rose-900 text-rose-300 font-black uppercase text-xs rounded-xl tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                      DETACH FROM GROUP
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* BRUSH CRAFTING STUDIO */}
            {brushSettings && setBrushSettings && (
              <div id="brush-crafting-studio" className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4 animate-fade-in text-xs">
                <div className="flex items-center justify-between text-[10px] text-emerald-400 font-black uppercase tracking-wider border-b border-neutral-800/40 pb-2.5">
                  <span className="flex items-center gap-1.5">
                    <Feather className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                    Brush Crafting Studio
                  </span>
                  <span className="bg-emerald-500/15 text-emerald-400 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase">
                    Vector Brush
                  </span>
                </div>

                <div className="bg-neutral-900/45 p-2.5 rounded-xl border border-neutral-850 text-[10px] text-neutral-400 leading-relaxed italic text-center">
                  🎨 Adjust the sliders below to configure the brush opacity, blur, and shadow effects.
                </div>

                {/* STYLE & EFFECTS CONTROLS */}
                <div className="space-y-3 bg-neutral-900/55 p-3 rounded-xl border border-neutral-850">
                  {/* Size / Thickness */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide">Stroke Thickness / Width</span>
                      <span className="text-emerald-400 font-black text-[10px]">{brushSettings.strokeWidth}px</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="120"
                      step="0.5"
                      value={brushSettings.strokeWidth}
                      onChange={(e) => setBrushSettings(prev => ({ ...prev, strokeWidth: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  {/* Option: Color Opacity */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide">Brush Opacity</span>
                      <span className="text-[10px] text-emerald-400 font-black">{Math.round(brushSettings.strokeOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="1"
                      step="0.01"
                      value={brushSettings.strokeOpacity}
                      onChange={(e) => setBrushSettings(prev => ({ ...prev, strokeOpacity: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  {/* Blur */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-400 font-bold uppercase">Blur Effect</span>
                      <span className="text-emerald-400 font-black text-[10px]">{brushSettings.blur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="30"
                      step="0.5"
                      value={brushSettings.blur}
                      onChange={(e) => setBrushSettings(prev => ({ ...prev, blur: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                </div>

                {/* Shadow Engine */}
                <div className="space-y-3 bg-neutral-900/55 p-3 rounded-xl border border-neutral-850">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-300 font-black uppercase tracking-wider">
                      👥 Stroke Drop Shadow
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={brushSettings.shadowEnabled}
                        onChange={(e) => setBrushSettings(prev => ({ ...prev, shadowEnabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white" />
                    </label>
                  </div>

                  {brushSettings.shadowEnabled && (
                    <div className="space-y-2.5 pt-1.5 border-t border-neutral-800/40 animate-fade-in">
                      {/* Shadow Color */}
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-neutral-400 uppercase">Shadow Color</span>
                        <input
                          type="color"
                          value={brushSettings.shadowColor}
                          onChange={(e) => setBrushSettings(prev => ({ ...prev, shadowColor: e.target.value }))}
                          className="w-6 h-6 rounded border border-neutral-800 cursor-pointer bg-neutral-950"
                        />
                      </div>

                      {/* Shadow Blur */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-neutral-400 uppercase">Shadow Blur</span>
                          <span className="text-emerald-400 font-bold">{brushSettings.shadowBlur}px</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="40"
                          value={brushSettings.shadowBlur}
                          onChange={(e) => setBrushSettings(prev => ({ ...prev, shadowBlur: parseInt(e.target.value) }))}
                          className="w-full h-1 bg-neutral-950 rounded accent-emerald-500 appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Shadow Offset X */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-neutral-400 uppercase">Offset X</span>
                          <span className="text-emerald-400 font-bold">{brushSettings.shadowOffsetX}px</span>
                        </div>
                        <input
                          type="range"
                          min="-30"
                          max="30"
                          value={brushSettings.shadowOffsetX}
                          onChange={(e) => setBrushSettings(prev => ({ ...prev, shadowOffsetX: parseInt(e.target.value) }))}
                          className="w-full h-1 bg-neutral-950 rounded accent-emerald-500 appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Shadow Offset Y */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] text-neutral-400 uppercase">Offset Y</span>
                          <span className="text-emerald-400 font-bold">{brushSettings.shadowOffsetY}px</span>
                        </div>
                        <input
                          type="range"
                          min="-30"
                          max="30"
                          value={brushSettings.shadowOffsetY}
                          onChange={(e) => setBrushSettings(prev => ({ ...prev, shadowOffsetY: parseInt(e.target.value) }))}
                          className="w-full h-1 bg-neutral-950 rounded accent-emerald-500 appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}



            {/* AI SMOOTH MOTION & LOOP GENERATOR PANEL */}
            <div id="ai-smooth-motion-panel" className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4 animate-fade-in">
              <div className="flex items-center justify-between text-[10px] text-amber-400 font-black uppercase tracking-wider font-black border-b border-neutral-800/40 pb-2.5">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  AI Smooth Motion Generator
                </span>
                <span className="bg-amber-500/15 text-amber-400 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase">
                  Advanced Tweening
                </span>
              </div>

              <div className="space-y-3.5 text-xs">
                <p className="text-[11px] text-neutral-400 leading-relaxed font-medium">
                  Convert a few reference frames into a completed high-framerate animation. Works for rigged limbs, shape morphing, colors, and opacities!
                </p>

                {/* Segmented Mode Selector */}
                <div id="gen-mode-selector" className="grid grid-cols-2 gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800/60">
                  <button
                    id="btn-mode-single"
                    type="button"
                    onClick={() => setAnimationMode('single')}
                    className={`py-1.5 px-2 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${
                      animationMode === 'single'
                        ? 'bg-amber-500 text-neutral-950 font-black shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Single-Step Tween
                  </button>
                  <button
                    id="btn-mode-multi"
                    type="button"
                    onClick={() => setAnimationMode('multi')}
                    className={`py-1.5 px-2 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer ${
                      animationMode === 'multi'
                        ? 'bg-amber-500 text-neutral-950 font-black shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Walk Cycle & Loop
                  </button>
                </div>

                {/* Mode-specific Fields */}
                {animationMode === 'single' ? (
                  <div id="single-mode-fields" className="space-y-2.5 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/40">
                    <span className="text-[9px] text-amber-400 font-black uppercase block pb-1 border-b border-neutral-800/20">
                      Single-Step Tween References
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-400 block font-bold">Start Frame:</label>
                        <select
                          id="select-single-start"
                          value={singleStartFrame}
                          onChange={(e) => setSingleStartFrame(Number(e.target.value))}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white outline-none font-bold"
                        >
                          {frames.map(f => (
                            <option key={f.index} value={f.index}>Frame {f.index + 1}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-400 block font-bold">End Frame:</label>
                        <select
                          id="select-single-end"
                          value={singleEndFrame}
                          onChange={(e) => setSingleEndFrame(Number(e.target.value))}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white outline-none font-bold"
                        >
                          {frames.map(f => (
                            <option key={f.index} value={f.index}>Frame {f.index + 1}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div id="multi-mode-fields" className="space-y-3 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800/40">
                    <span className="text-[9px] text-amber-400 font-black uppercase block pb-1 border-b border-neutral-800/20">
                      Loop & Walk Cycle Reference Configuration
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-400 block font-bold">Ref Start (Pose):</label>
                        <select
                          id="select-multi-ref-start"
                          value={multiRefStartFrame}
                          onChange={(e) => setMultiRefStartFrame(Number(e.target.value))}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white outline-none font-bold"
                        >
                          {frames.map(f => (
                            <option key={f.index} value={f.index}>Frame {f.index + 1}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-neutral-400 block font-bold">Ref End (Pose):</label>
                        <select
                          id="select-multi-ref-end"
                          value={multiRefEndFrame}
                          onChange={(e) => setMultiRefEndFrame(Number(e.target.value))}
                          className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white outline-none font-bold"
                        >
                          {frames.map(f => (
                            <option key={f.index} value={f.index}>Frame {f.index + 1}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1 pt-1.5 border-t border-neutral-800/20">
                      <label className="text-[10px] text-neutral-400 block font-bold">Journey Target End-Position Frame:</label>
                      <select
                        id="select-multi-end-pos"
                        value={multiEndPosFrame}
                        onChange={(e) => setMultiEndPosFrame(Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none font-bold"
                      >
                        {frames.map(f => (
                          <option key={f.index} value={f.index}>Frame {f.index + 1} (Location Marker)</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-neutral-500 pt-0.5 leading-normal">
                        Character glides from initial pos in Ref Start Frame to target pos in End-Position Frame while repeating the cycle.
                      </p>
                    </div>
                  </div>
                )}

                {/* Configuration Controls */}
                <div id="generator-shared-configs" className="space-y-3 bg-neutral-900/35 p-3 rounded-xl border border-neutral-800/30">
                  <span className="text-[9px] text-neutral-400 font-black uppercase block pb-1 border-b border-neutral-800/20">
                    Timing & Easing Curve Settings
                  </span>

                  {/* Duration Slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-neutral-400 font-bold">Animation Duration:</span>
                      <span className="text-amber-400 font-black">{durationSeconds} Seconds</span>
                    </div>
                    <input
                      id="input-duration-seconds"
                      type="range"
                      min="1"
                      max="30"
                      step="1"
                      value={durationSeconds}
                      onChange={(e) => setDurationSeconds(Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[9px] text-neutral-500">
                      <span>1s</span>
                      <span>Total: {durationSeconds * fps} frames</span>
                      <span>30s</span>
                    </div>
                  </div>

                  {/* FPS selection dropdown */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-400 block font-bold">Framerate (FPS):</label>
                      <select
                        id="select-generator-fps"
                        value={fps}
                        onChange={(e) => setFps(Number(e.target.value))}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white outline-none font-bold cursor-pointer"
                      >
                        <option value="12">12 FPS</option>
                        <option value="24">24 FPS</option>
                        <option value="30">30 FPS (Standard)</option>
                        <option value="60">60 FPS (Ultra Smooth)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-neutral-400 block font-bold">Easing Curve:</label>
                      <select
                        id="select-generator-easing"
                        value={easeType}
                        onChange={(e) => setEaseType(e.target.value as any)}
                        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-white outline-none font-bold cursor-pointer"
                      >
                        <option value="linear">Linear (Uniform)</option>
                        <option value="easeIn">Ease In (Accelerate)</option>
                        <option value="easeOut">Ease Out (Decelerate)</option>
                        <option value="easeInOut">Ease In Out (Smooth)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Generate / Action Buttons */}
                <div id="generator-action-container" className="space-y-2 pt-1.5">
                  <button
                    id="btn-trigger-generate"
                    type="button"
                    onClick={animationMode === 'single' ? handleGenerateSingleStep : handleGenerateMultiStep}
                    className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-black uppercase text-xs rounded-xl tracking-wider shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                  >
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    ⚡ Generate Completed Animation
                  </button>

                  {hasBackup && (
                    <button
                      id="btn-trigger-restore"
                      type="button"
                      onClick={handleRestoreBackup}
                      className="w-full py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-400 hover:text-amber-400 font-bold rounded-xl text-[10px] uppercase tracking-wide transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      ↩ Restore Original Frames
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Child-Parent System Tree Panel */}
            <div className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4">
              <div className="flex items-center justify-between text-[10px] text-amber-400 font-black uppercase tracking-wider font-black border-b border-neutral-800/40 pb-2.5">
                <span className="flex items-center gap-1.5">
                  <Workflow className="w-3.5 h-3.5 text-amber-500" />
                  Child-Parent System
                </span>
                
                {/* Add Root Parent Drawing Button */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenuObjectId('root_add');
                    setActiveMenuType('options');
                  }}
                  className="p-1 rounded bg-amber-500/10 hover:bg-amber-500 hover:text-neutral-950 text-amber-400 transition-all flex items-center justify-center cursor-pointer"
                  title="Add Parent/Root Drawing"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Add Root Selector Dropdown */}
              {activeMenuObjectId === 'root_add' && (
                <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl space-y-2 text-xs">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-neutral-400 block font-bold uppercase tracking-wide">Select Root Parent Drawing:</label>
                    <div className="flex gap-1.5">
                      <select
                        onChange={(e) => {
                          if (e.target.value) {
                            updateObject(e.target.value, { parentId: null });
                            setActiveMenuObjectId(null);
                            setActiveMenuType(null);
                          }
                        }}
                        className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500 font-bold"
                        defaultValue=""
                      >
                        <option value="" disabled>-- Select Drawing --</option>
                        {Object.values(objects)
                          .filter(o => o.parentId !== null)
                          .map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))
                        }
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMenuObjectId(null);
                          setActiveMenuType(null);
                        }}
                        className="px-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 font-bold rounded-lg transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Collapsible VS Code Nestable Tree */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {Object.values(objects).filter(o => o.parentId === null).length === 0 ? (
                  <div className="text-center py-6 text-[10px] text-neutral-600 font-bold italic">
                    No parent drawings configured yet. Click '+' to start.
                  </div>
                ) : (
                  Object.values(objects)
                    .filter(o => o.parentId === null)
                    .map(rootObj => renderTreeNode(rootObj, 0))
                )}
              </div>
            </div>

            {/* Direct Rigging & Connection Creator Section */}
            <div className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4">
              <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center gap-1 font-black">
                <GitMerge className="w-3.5 h-3.5 text-amber-500" />
                Direct Rigging Creator
              </div>

              <div className="space-y-3">
                {/* Drawing A Selection */}
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400 font-bold block">First Drawing (A)</label>
                  <select
                    value={connDrawingA}
                    onChange={(e) => setConnDrawingA(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-2 text-xs text-white outline-none focus:border-amber-500 font-bold"
                  >
                    <option value="">-- Select Drawing A --</option>
                    {Object.values(objects).map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>

                {/* Drawing B Selection */}
                <div className="space-y-1">
                  <label className="text-[11px] text-neutral-400 font-bold block">Second Drawing (B)</label>
                  <select
                    value={connDrawingB}
                    onChange={(e) => setConnDrawingB(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-2.5 py-2 text-xs text-white outline-none focus:border-amber-500 font-bold"
                  >
                    <option value="">-- Select Drawing B --</option>
                    {Object.values(objects).map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>

                {/* Hierarchy Direction */}
                <div className="space-y-1 pt-1">
                  <label className="text-[11px] text-neutral-400 font-bold block">Hierarchy Parenting</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setParentSelection('A_is_parent')}
                      className={`text-[10px] font-bold py-1.5 px-2 rounded-lg border transition-all ${
                        parentSelection === 'A_is_parent'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-neutral-950 text-neutral-500 border-neutral-800'
                      }`}
                    >
                      A is Parent of B
                    </button>
                    <button
                      type="button"
                      onClick={() => setParentSelection('B_is_parent')}
                      className={`text-[10px] font-bold py-1.5 px-2 rounded-lg border transition-all ${
                        parentSelection === 'B_is_parent'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-neutral-950 text-neutral-500 border-neutral-800'
                      }`}
                    >
                      B is Parent of A
                    </button>
                  </div>
                </div>

                {/* Connect Button */}
                <button
                  type="button"
                  onClick={handleCreateDirectConnection}
                  disabled={!connDrawingA || !connDrawingB || connDrawingA === connDrawingB}
                  className="w-full py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-black uppercase text-xs rounded-xl tracking-wider shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  Connect Drawings
                </button>
              </div>
            </div>

            {/* Active Connections List Section */}
            <div className="space-y-3 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4">
              <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center justify-between font-black">
                <span className="flex items-center gap-1">
                  <Workflow className="w-3.5 h-3.5 text-amber-500" />
                  All Active Connections ({bones.length})
                </span>
              </div>
              
              {bones.length === 0 ? (
                <div className="text-center py-4 text-[10px] text-neutral-600 font-bold italic">
                  No active rig connections found.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {bones.map(bone => {
                    const startObj = objects[bone.startObjectId];
                    const endObj = objects[bone.endObjectId];
                    if (!startObj || !endObj) return null;
                    return (
                      <div key={bone.id} className="bg-neutral-900/80 border border-neutral-800/60 p-2 rounded-xl flex items-center justify-between text-[11px]">
                        <div className="flex flex-col gap-0.5 truncate">
                          <span className="font-bold text-neutral-300 truncate">
                            {startObj.name} <span className="text-amber-500 text-[9px] font-black mx-1">➔ Parent</span>
                          </span>
                          <span className="text-neutral-500 truncate">
                            {endObj.name} <span className="text-neutral-400 text-[9px] font-bold mx-1">➔ Child</span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleBreakConnection(bone.id)}
                          className="p-1 rounded text-neutral-500 hover:text-rose-400 transition-colors shrink-0 font-bold text-xs"
                          title="Break Connection"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

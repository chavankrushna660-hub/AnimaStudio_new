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
  GitMerge,
  Maximize2,
  Folder,
  FolderPlus,
  Link,
  Unlink
} from 'lucide-react';
import { VectorObject, Bone, Layer, Pivot, Transform, Point, Frame, RealismSettings } from '../types';
import { distance, localToWorld, worldToLocal, calculateBoundingBox, isPointInPolygon } from '../utils/math';

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
  frames: Frame[];
  setFrames: React.Dispatch<React.SetStateAction<Frame[]>>;
  currentFrameIndex: number;
  setCurrentFrameIndex: React.Dispatch<React.SetStateAction<number>>;
  setObjects: React.Dispatch<React.SetStateAction<{ [id: string]: VectorObject }>>;
  fps: number;
  setFps: (fps: number) => void;
  realismSettings?: RealismSettings;
  setRealismSettings?: React.Dispatch<React.SetStateAction<RealismSettings>>;
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
  frames,
  setFrames,
  currentFrameIndex,
  setCurrentFrameIndex,
  setObjects,
  fps,
  setFps,
  realismSettings,
  setRealismSettings,
}: RightPanelProps) {
  // Batch/Smart Controls check state
  const [smartCheckedIds, setSmartCheckedIds] = useState<{ [id: string]: boolean }>({});

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
            {obj.parentId && (
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
      className={`relative h-full transition-all duration-200 shrink-0 z-30 ${
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

      <div className={`w-full h-full bg-neutral-900/90 border-l border-neutral-800 flex flex-col overflow-hidden ${
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
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
            {!selectedObject ? (
              <div className="text-center py-12 text-xs text-neutral-600 font-bold border border-dashed border-neutral-800/80 rounded-2xl p-4">
                Select a drawing from the canvas or left hierarchy tree to inspect and transform.
              </div>
            ) : (
              <>
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
                          <span className="text-neutral-400">Smooth Translate X</span>
                          <span className="text-white font-bold">{selectedObject.transform.x.toFixed(1)}px</span>
                        </div>
                        <input
                          type="range"
                          min="-500"
                          max="1500"
                          step="0.5"
                          disabled={!isSmoothMoveEnabled}
                          value={selectedObject.transform.x}
                          onChange={(e) => handleSliderChange('x', Number(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                        <div className="flex items-center justify-between gap-1.5 pt-0.5">
                          <button
                            disabled={!isSmoothMoveEnabled}
                            onClick={() => handleNudge('x', -10)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -10px
                          </button>
                          <button
                            disabled={!isSmoothMoveEnabled}
                            onClick={() => handleNudge('x', -1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -1px
                          </button>
                          <button
                            disabled={!isSmoothMoveEnabled}
                            onClick={() => handleNudge('x', 1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            +1px
                          </button>
                          <button
                            disabled={!isSmoothMoveEnabled}
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
                          <span className="text-neutral-400">Smooth Translate Y</span>
                          <span className="text-white font-bold">{selectedObject.transform.y.toFixed(1)}px</span>
                        </div>
                        <input
                          type="range"
                          min="-500"
                          max="1500"
                          step="0.5"
                          disabled={!isSmoothMoveEnabled}
                          value={selectedObject.transform.y}
                          onChange={(e) => handleSliderChange('y', Number(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                        <div className="flex items-center justify-between gap-1.5 pt-0.5">
                          <button
                            disabled={!isSmoothMoveEnabled}
                            onClick={() => handleNudge('y', -10)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -10px
                          </button>
                          <button
                            disabled={!isSmoothMoveEnabled}
                            onClick={() => handleNudge('y', -1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            -1px
                          </button>
                          <button
                            disabled={!isSmoothMoveEnabled}
                            onClick={() => handleNudge('y', 1)}
                            className="flex-1 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
                          >
                            +1px
                          </button>
                          <button
                            disabled={!isSmoothMoveEnabled}
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
                    TRANSFORMS (PRECISION)
                  </div>

                  {/* Slider: Rotate */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Rotation</span>
                      <span className="text-white font-bold">{selectedObject.transform.rotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="-360"
                      max="360"
                      value={selectedObject.transform.rotation}
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
                      <span className="text-white font-bold">{selectedObject.transform.scaleX.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="4"
                      step="0.05"
                      value={selectedObject.transform.scaleX}
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
                      <span className="text-white font-bold">{(selectedObject.transform.scaleY ?? 1).toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="4"
                      step="0.05"
                      value={selectedObject.transform.scaleY ?? 1}
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
                      <span className="text-white font-bold">{selectedObject.transform.skewX ?? 0}°</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="60"
                      step="1"
                      value={selectedObject.transform.skewX ?? 0}
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
                      <span className="text-white font-bold">{selectedObject.transform.skewY ?? 0}°</span>
                    </div>
                    <input
                      type="range"
                      min="-60"
                      max="60"
                      step="1"
                      value={selectedObject.transform.skewY ?? 0}
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

                  {/* Slider: Rotate X (3D Flip X) */}
                  <div className="space-y-1 pt-1 border-t border-neutral-800/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Rotate X (3D Flip X)</span>
                      <span className="text-white font-bold">{selectedObject.transform.rotateX ?? 0}°</span>
                    </div>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      step="1"
                      value={selectedObject.transform.rotateX ?? 0}
                      onChange={(e) => handleSliderChange('rotateX', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('rotateX', -5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -5°
                      </button>
                      <button
                        onClick={() => handleNudge('rotateX', 5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +5°
                      </button>
                    </div>
                  </div>

                  {/* Slider: Rotate Y (3D Flip Y) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Rotate Y (3D Flip Y)</span>
                      <span className="text-white font-bold">{selectedObject.transform.rotateY ?? 0}°</span>
                    </div>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      step="1"
                      value={selectedObject.transform.rotateY ?? 0}
                      onChange={(e) => handleSliderChange('rotateY', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <button
                        onClick={() => handleNudge('rotateY', -5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        -5°
                      </button>
                      <button
                        onClick={() => handleNudge('rotateY', 5)}
                        className="flex-1 py-1 rounded bg-neutral-800 text-neutral-300 text-[10px] font-bold hover:bg-neutral-700 active:scale-95 transition-transform"
                      >
                        +5°
                      </button>
                    </div>
                  </div>

                  {/* Slider: Perspective */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-400">Perspective Depth</span>
                      <span className="text-white font-bold">{selectedObject.transform.perspective ?? 0}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="800"
                      step="10"
                      value={selectedObject.transform.perspective ?? 0}
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
                            <button
                              onClick={() => updateBone(bone.id, { allowDetach: !bone.allowDetach })}
                              className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                                bone.allowDetach ? 'bg-amber-500/20 text-amber-400' : 'bg-neutral-800 text-neutral-500'
                              }`}
                            >
                              {bone.allowDetach ? 'ON (STRETCHY)' : 'OFF (RIGID)'}
                            </button>
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

            {/* THE REALISM MAKER & ORGANIC MEDIA ENGINE */}
            {realismSettings && setRealismSettings && (
              <div id="realism-maker-panel" className="space-y-4 bg-neutral-950/40 p-4 rounded-2xl border border-neutral-800/50 mt-4 animate-fade-in text-xs">
                <div className="flex items-center justify-between text-[10px] text-amber-400 font-black uppercase tracking-wider border-b border-neutral-800/40 pb-2.5">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    The Realism Maker
                  </span>
                  <span className="bg-amber-500/15 text-amber-400 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase">
                    Organic Brush v2.0
                  </span>
                </div>

                {/* CALLIGRAPHY / AUTOMATIC TAPER */}
                <div className="space-y-2.5 bg-neutral-900/55 p-3 rounded-xl border border-neutral-850">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-300 font-black uppercase tracking-wider">
                      ✒️ Calligraphy Auto-Taper
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={realismSettings.autoTaperEnabled}
                        onChange={(e) => setRealismSettings(prev => ({ ...prev, autoTaperEnabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-neutral-950"></div>
                    </label>
                  </div>
                  <p className="text-[10px] text-neutral-400 font-medium leading-relaxed">
                    Tapers line-ends automatically, and dynamically thins stroke thickness in response to stylus velocity.
                  </p>

                  {realismSettings.autoTaperEnabled && (
                    <div className="space-y-2 pt-1">
                      {/* Max Thickness */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-neutral-400 font-bold">Max Brush Thickness:</span>
                          <span className="text-amber-400 font-black">{realismSettings.maxThickness}px</span>
                        </div>
                        <input
                          type="range"
                          min="3"
                          max="25"
                          step="0.5"
                          value={realismSettings.maxThickness}
                          onChange={(e) => setRealismSettings(prev => ({ ...prev, maxThickness: parseFloat(e.target.value) }))}
                          className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>

                      {/* Min Thickness */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-neutral-400 font-bold">Min Taper Thickness:</span>
                          <span className="text-amber-400 font-black">{realismSettings.minThickness}px</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="5"
                          step="0.1"
                          value={realismSettings.minThickness}
                          onChange={(e) => setRealismSettings(prev => ({ ...prev, minThickness: parseFloat(e.target.value) }))}
                          className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>

                      {/* Thinning Factor */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-neutral-400 font-bold">Speed Thinning Sensitivity:</span>
                          <span className="text-amber-400 font-black">{realismSettings.thinningFactor}x</span>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="1.0"
                          step="0.05"
                          value={realismSettings.thinningFactor}
                          onChange={(e) => setRealismSettings(prev => ({ ...prev, thinningFactor: parseFloat(e.target.value) }))}
                          className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* PROCEDURAL 2.5D SHADING */}
                <div className="space-y-2.5 bg-neutral-900/55 p-3 rounded-xl border border-neutral-850">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-300 font-black uppercase tracking-wider">
                      ⛰️ Cylinder Auto-Shading
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={realismSettings.autoShadingEnabled}
                        onChange={(e) => setRealismSettings(prev => ({ ...prev, autoShadingEnabled: e.target.checked }))}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-neutral-950"></div>
                    </label>
                  </div>
                  <p className="text-[10px] text-neutral-400 font-medium leading-relaxed">
                    Instantly generates light highlights and shadow boundaries perpendicular to stroke direction for 3D realism.
                  </p>

                  {realismSettings.autoShadingEnabled && (
                    <div className="space-y-2 pt-1">
                      {/* Light Angle */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-neutral-400 font-bold">Virtual Light Source Angle:</span>
                          <span className="text-amber-400 font-black">{realismSettings.shadingLightAngle}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          step="5"
                          value={realismSettings.shadingLightAngle}
                          onChange={(e) => setRealismSettings(prev => ({ ...prev, shadingLightAngle: parseInt(e.target.value) }))}
                          className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>

                      {/* Highlight Opacity */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-neutral-400 font-bold">Highlight Volume (White):</span>
                          <span className="text-amber-400 font-black">{Math.round(realismSettings.shadingHighlightOpacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="0.8"
                          step="0.05"
                          value={realismSettings.shadingHighlightOpacity}
                          onChange={(e) => setRealismSettings(prev => ({ ...prev, shadingHighlightOpacity: parseFloat(e.target.value) }))}
                          className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>

                      {/* Shadow Opacity */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-neutral-400 font-bold">Shadow Depth (Black):</span>
                          <span className="text-amber-400 font-black">{Math.round(realismSettings.shadingShadowOpacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="0.8"
                          step="0.05"
                          value={realismSettings.shadingShadowOpacity}
                          onChange={(e) => setRealismSettings(prev => ({ ...prev, shadingShadowOpacity: parseFloat(e.target.value) }))}
                          className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* ORGANIC ENGINE: JITTER & TEXTURE & WET BLEED */}
                <div className="space-y-2.5 bg-neutral-900/55 p-3 rounded-xl border border-neutral-850">
                  <span className="text-[10px] text-neutral-300 font-black uppercase tracking-wider block mb-1">
                    🎨 Organic Media Engine
                  </span>

                  {/* Micro-Jitter */}
                  <div className="space-y-1.5 border-b border-neutral-850 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-400 font-bold">Human Hand Simulator (Jitter)</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={realismSettings.microJitterEnabled}
                          onChange={(e) => setRealismSettings(prev => ({ ...prev, microJitterEnabled: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-neutral-950"></div>
                      </label>
                    </div>
                    {realismSettings.microJitterEnabled && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px]">
                          <span className="text-neutral-500">Tremor Amplitude:</span>
                          <span className="text-amber-400 font-bold">{realismSettings.microJitterAmount}px</span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="5.0"
                          step="0.1"
                          value={realismSettings.microJitterAmount}
                          onChange={(e) => setRealismSettings(prev => ({ ...prev, microJitterAmount: parseFloat(e.target.value) }))}
                          className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Paper Grain */}
                  <div className="space-y-1.5 border-b border-neutral-850 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-400 font-bold">Procedural Paper Grain</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={realismSettings.paperGrainEnabled}
                          onChange={(e) => setRealismSettings(prev => ({ ...prev, paperGrainEnabled: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-neutral-950"></div>
                      </label>
                    </div>
                    {realismSettings.paperGrainEnabled && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px]">
                          <span className="text-neutral-500">Texture Contrast/Intensity:</span>
                          <span className="text-amber-400 font-bold">{Math.round(realismSettings.paperGrainIntensity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="0.8"
                          step="0.05"
                          value={realismSettings.paperGrainIntensity}
                          onChange={(e) => setRealismSettings(prev => ({ ...prev, paperGrainIntensity: parseFloat(e.target.value) }))}
                          className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Ink Bleed */}
                  <div className="space-y-1.5 pb-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-400 font-bold">Wet Smart Ink Bleed</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={realismSettings.inkBleedEnabled}
                          onChange={(e) => setRealismSettings(prev => ({ ...prev, inkBleedEnabled: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-neutral-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-neutral-400 after:border-neutral-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500 peer-checked:after:bg-neutral-950"></div>
                      </label>
                    </div>
                    {realismSettings.inkBleedEnabled && (
                      <div className="space-y-2 pt-1">
                        {/* Blur Radius */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px]">
                            <span className="text-neutral-500">Wet Spread (Blur):</span>
                            <span className="text-amber-400 font-bold">{realismSettings.inkBleedBlur}px</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="8"
                            step="1"
                            value={realismSettings.inkBleedBlur}
                            onChange={(e) => setRealismSettings(prev => ({ ...prev, inkBleedBlur: parseInt(e.target.value) }))}
                            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          />
                        </div>

                        {/* Opacity */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px]">
                            <span className="text-neutral-500">Halo Transparency:</span>
                            <span className="text-amber-400 font-bold">{Math.round(realismSettings.inkBleedOpacity * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="0.8"
                            step="0.05"
                            value={realismSettings.inkBleedOpacity}
                            onChange={(e) => setRealismSettings(prev => ({ ...prev, inkBleedOpacity: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          />
                        </div>

                        {/* Width Offset */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[9px]">
                            <span className="text-neutral-500">Bleed Offset Width:</span>
                            <span className="text-amber-400 font-bold">+{realismSettings.inkBleedWidthOffset}px</span>
                          </div>
                          <input
                            type="range"
                            min="2"
                            max="15"
                            step="1"
                            value={realismSettings.inkBleedWidthOffset}
                            onChange={(e) => setRealismSettings(prev => ({ ...prev, inkBleedWidthOffset: parseInt(e.target.value) }))}
                            className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
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

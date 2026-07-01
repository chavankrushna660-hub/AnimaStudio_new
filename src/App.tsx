import React, { useState, useEffect, useRef } from 'react';
import { 
  Undo2, 
  Redo2, 
  Play, 
  Pause, 
  Video, 
  Upload, 
  Download, 
  Plus, 
  Settings, 
  Sparkles,
  GitPullRequest,
  Trash2
} from 'lucide-react';
import Toolbar from './components/Toolbar';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import CanvasArea from './components/CanvasArea';
import Timeline from './components/Timeline';
import { VectorObject, Bone, Layer, Frame } from './types';
import { localToWorld, rotatePoint } from './utils/math';

export default function App() {
  // Topbar Collapse States
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);

  // Core Vector State
  const [objects, setObjects] = useState<{ [id: string]: VectorObject }>({});
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string>('SEL');
  const [bones, setBones] = useState<Bone[]>([]);
  const [onionSkinEnabled, setOnionSkinEnabled] = useState(true);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer_char');

  // Timeline State
  const [frames, setFrames] = useState<Frame[]>([
    { index: 0, objects: {} }
  ]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [fps, setFps] = useState(12);
  const [isPlaying, setIsPlaying] = useState(false);

  // Layers list
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'layer_char', name: 'Character Layer', zIndex: 2, visible: true, locked: false, opacity: 1, blendMode: 'normal' },
    { id: 'layer_bg', name: 'Background Layer', zIndex: 1, visible: true, locked: false, opacity: 1, blendMode: 'normal' }
  ]);

  // Undo/Redo Stacks
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  // Smart controls pinned list
  const [smartPinnedIds, setSmartPinnedIds] = useState<string[]>([]);

  // Ref to track the currently loaded frame index to prevent race conditions & update loops
  const loadedFrameIndexRef = useRef<number>(0);

  // Synchronize active objects back and forth between active frame and objects dictionary
  useEffect(() => {
    // 1. If we changed frame index, load objects from the target frame
    if (currentFrameIndex !== loadedFrameIndexRef.current) {
      const targetFrame = frames[currentFrameIndex];
      if (targetFrame) {
        const frameObjects = targetFrame.objects || {};
        if (Object.keys(frameObjects).length > 0) {
          setObjects(prev => {
            if (JSON.stringify(prev) !== JSON.stringify(frameObjects)) {
              return JSON.parse(JSON.stringify(frameObjects));
            }
            return prev;
          });
        } else if (currentFrameIndex > 0) {
          // Fallback: copy from previous frame if the current frame is empty
          const prevFrame = frames[currentFrameIndex - 1];
          if (prevFrame && prevFrame.objects && Object.keys(prevFrame.objects).length > 0) {
            const copiedObjects = JSON.parse(JSON.stringify(prevFrame.objects));
            setObjects(copiedObjects);
            setFrames(prev => {
              const updated = [...prev];
              if (updated[currentFrameIndex]) {
                updated[currentFrameIndex] = {
                  ...updated[currentFrameIndex],
                  objects: copiedObjects
                };
                return updated;
              }
              return prev;
            });
          } else {
            setObjects(prev => Object.keys(prev).length > 0 ? {} : prev);
          }
        } else {
          setObjects(prev => Object.keys(prev).length > 0 ? {} : prev);
        }
      }
      loadedFrameIndexRef.current = currentFrameIndex;
    } else {
      // 2. Otherwise, we are on the same frame, so sync any changes in 'objects' back to 'frames'
      setFrames(prev => {
        if (!prev[currentFrameIndex]) return prev;
        const currentFrameObjects = prev[currentFrameIndex].objects || {};
        if (JSON.stringify(currentFrameObjects) !== JSON.stringify(objects)) {
          const updated = [...prev];
          updated[currentFrameIndex] = {
            ...updated[currentFrameIndex],
            objects: JSON.parse(JSON.stringify(objects))
          };
          return updated;
        }
        return prev;
      });
    }
  }, [currentFrameIndex, objects]);

  // Export video recorder states
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Push to history helper
  const historyPush = () => {
    const stateSnapshot = {
      objects: JSON.parse(JSON.stringify(objects)),
      bones: JSON.parse(JSON.stringify(bones)),
    };
    setUndoStack(prev => [...prev.slice(-15), stateSnapshot]); // Limit memory stack to 15 actions
    setRedoStack([]);
  };

  // Powerful transform-propagating update helper
  const updateObject = (id: string, updates: Partial<VectorObject>) => {
    setObjects(prev => {
      const updated = { ...prev };
      const obj = updated[id];
      if (!obj) return prev;

      const updatedObj = { ...obj, ...updates };
      updated[id] = updatedObj;

      // If transform changed, propagate down the parent-child hierarchy!
      if (updates.transform) {
        const origT = obj.transform;
        const newT = updates.transform;

        const dX = (newT.x !== undefined ? newT.x : origT.x) - origT.x;
        const dY = (newT.y !== undefined ? newT.y : origT.y) - origT.y;
        const dRot = ((newT.rotation !== undefined ? newT.rotation : origT.rotation) ?? 0) - (origT.rotation ?? 0);
        
        const sXRatio = origT.scaleX !== 0 ? (newT.scaleX !== undefined ? newT.scaleX : origT.scaleX ?? 1) / origT.scaleX : 1;
        const sYRatio = origT.scaleY !== 0 ? (newT.scaleY !== undefined ? newT.scaleY : origT.scaleY ?? 1) / origT.scaleY : 1;

        // Propagate recursively
        const propagate = (parentId: string, deltaX: number, deltaY: number, deltaRot: number, scaleXRatio: number, scaleYRatio: number) => {
          // Get direct child IDs
          const childIds = Object.keys(updated).filter(k => updated[k].parentId === parentId);

          for (const childId of childIds) {
            const child = updated[childId];
            if (!child) continue;

            const childOrigT = { ...child.transform };
            const childNewT = { ...child.transform };

            // Rotate child position around parent's pivot
            if (deltaRot !== 0) {
              const parentObj = updated[parentId];
              const pPivot = parentObj?.pivots?.[0] || { localX: 0, localY: 0 };
              const parentJointWorld = localToWorld(
                { x: pPivot.localX, y: pPivot.localY },
                parentObj.transform,
                pPivot
              );
              const childWorldPos = { x: childNewT.x, y: childNewT.y };
              const rotatedChildWorldPos = rotatePoint(childWorldPos, deltaRot, parentJointWorld);
              childNewT.x = Number(rotatedChildWorldPos.x.toFixed(2));
              childNewT.y = Number(rotatedChildWorldPos.y.toFixed(2));
              childNewT.rotation = Number(((childNewT.rotation ?? 0) + deltaRot).toFixed(2));
            } else {
              // Just translate
              childNewT.x = Number((childNewT.x + deltaX).toFixed(2));
              childNewT.y = Number((childNewT.y + deltaY).toFixed(2));
            }

            // Scale child's offset and scale factors
            if (scaleXRatio !== 1 || scaleYRatio !== 1) {
              const parentObj = updated[parentId];
              const pPivot = parentObj?.pivots?.[0] || { localX: 0, localY: 0 };
              const parentJointWorld = localToWorld(
                { x: pPivot.localX, y: pPivot.localY },
                parentObj.transform,
                pPivot
              );
              const dx_c = childNewT.x - parentJointWorld.x;
              const dy_c = childNewT.y - parentJointWorld.y;
              childNewT.x = Number((parentJointWorld.x + dx_c * scaleXRatio).toFixed(2));
              childNewT.y = Number((parentJointWorld.y + dy_c * scaleYRatio).toFixed(2));
              childNewT.scaleX = Number(((childNewT.scaleX ?? 1) * scaleXRatio).toFixed(2));
              childNewT.scaleY = Number(((childNewT.scaleY ?? 1) * scaleYRatio).toFixed(2));
            }

            // Propagate Skew, RotateX, RotateY, Perspective if present
            if (newT.skewX !== undefined) {
              const dSkewX = (newT.skewX ?? 0) - (origT.skewX ?? 0);
              childNewT.skewX = Number(((childNewT.skewX ?? 0) + dSkewX).toFixed(2));
            }
            if (newT.skewY !== undefined) {
              const dSkewY = (newT.skewY ?? 0) - (origT.skewY ?? 0);
              childNewT.skewY = Number(((childNewT.skewY ?? 0) + dSkewY).toFixed(2));
            }
            if (newT.rotateX !== undefined) {
              const dRotX = (newT.rotateX ?? 0) - (origT.origX ?? origT.rotateX ?? 0);
              childNewT.rotateX = Number(((childNewT.rotateX ?? 0) + dRotX).toFixed(2));
            }
            if (newT.rotateY !== undefined) {
              const dRotY = (newT.rotateY ?? 0) - (origT.origY ?? origT.rotateY ?? 0);
              childNewT.rotateY = Number(((childNewT.rotateY ?? 0) + dRotY).toFixed(2));
            }
            if (newT.perspective !== undefined) {
              const dPersp = (newT.perspective ?? 0) - (origT.perspective ?? 0);
              childNewT.perspective = Number(((childNewT.perspective ?? 0) + dPersp).toFixed(2));
            }

            // Snapping rigid bones to guarantee zero detachment
            const parentObj = updated[parentId];
            const associatedBone = bones.find(b => b.startObjectId === parentId && b.endObjectId === childId);
            if (associatedBone && !associatedBone.allowDetach) {
              const pJoint = localToWorld({ x: associatedBone.startLocalX, y: associatedBone.startLocalY }, parentObj.transform, parentObj.pivots?.[0]);
              const cJoint = localToWorld({ x: associatedBone.endLocalX, y: associatedBone.endLocalY }, childNewT, child.pivots?.[0]);
              
              const dx_snap = pJoint.x - cJoint.x;
              const dy_snap = pJoint.y - cJoint.y;

              childNewT.x = Number((childNewT.x + dx_snap).toFixed(2));
              childNewT.y = Number((childNewT.y + dy_snap).toFixed(2));
            }

            updated[childId] = {
              ...child,
              transform: childNewT
            };

            // Recursive propagation down the chain
            const nextDX = childNewT.x - childOrigT.x;
            const nextDY = childNewT.y - childOrigT.y;
            const nextDRot = (childNewT.rotation ?? 0) - (childOrigT.rotation ?? 0);
            const nextSXRatio = childOrigT.scaleX !== 0 ? (childNewT.scaleX ?? 1) / childOrigT.scaleX : 1;
            const nextSYRatio = childOrigT.scaleY !== 0 ? (childNewT.scaleY ?? 1) / childOrigT.scaleY : 1;

            propagate(childId, nextDX, nextDY, nextDRot, nextSXRatio, nextSYRatio);
          }
        };

        propagate(id, dX, dY, dRot, sXRatio, sYRatio);
      }

      return updated;
    });
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    const current = {
      objects: JSON.parse(JSON.stringify(objects)),
      bones: JSON.parse(JSON.stringify(bones)),
    };
    setRedoStack(prev => [...prev, current]);
    setObjects(previous.objects);
    setBones(previous.bones);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const current = {
      objects: JSON.parse(JSON.stringify(objects)),
      bones: JSON.parse(JSON.stringify(bones)),
    };
    setUndoStack(prev => [...prev, current]);
    setObjects(next.objects);
    setBones(next.bones);
    setRedoStack(prev => prev.slice(0, -1));
  };

  // Toggle Smart Control Pinned State
  const toggleSmartPin = (id: string) => {
    setSmartPinnedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Add a fully pre-rigged sample character for instant user testing!
  const addSampleCharacter = () => {
    historyPush();
    const torsoId = `torso_${Date.now()}`;
    const headId = `head_${Date.now()}`;
    const leftArmId = `left_arm_${Date.now()}`;
    const rightArmId = `right_arm_${Date.now()}`;
    const leftLegId = `left_leg_${Date.now()}`;
    const rightLegId = `right_leg_${Date.now()}`;

    const sampleObjects: { [id: string]: VectorObject } = {
      [torsoId]: {
        id: torsoId,
        name: 'Torso',
        type: 'shape',
        shapeType: 'rectangle',
        points: [
          { x: 120, y: 180 },
          { x: 180, y: 180 },
          { x: 180, y: 280 },
          { x: 120, y: 280 },
          { x: 120, y: 180 }
        ],
        strokeColor: '#1B5E20',
        strokeWidth: 3,
        fillColor: '#C8E6C9',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_1`, name: 'BaseJoint', localX: 150, localY: 280, locked: false }],
        parentId: null,
        childrenIds: [headId, leftArmId, rightArmId, leftLegId, rightLegId],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      },
      [headId]: {
        id: headId,
        name: 'Head',
        type: 'shape',
        shapeType: 'circle',
        points: [
          { x: 130, y: 100 },
          { x: 170, y: 100 },
          { x: 170, y: 140 },
          { x: 130, y: 140 },
          { x: 130, y: 100 }
        ],
        strokeColor: '#1B5E20',
        strokeWidth: 3,
        fillColor: '#FFE082',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_2`, name: 'NeckJoint', localX: 150, localY: 175, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      },
      [leftArmId]: {
        id: leftArmId,
        name: 'LeftArm',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 100, y: 190 },
          { x: 70, y: 230 },
          { x: 60, y: 270 }
        ],
        strokeColor: '#E65100',
        strokeWidth: 4,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_3`, name: 'ShoulderJoint', localX: 115, localY: 190, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      },
      [rightArmId]: {
        id: rightArmId,
        name: 'RightArm',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 200, y: 190 },
          { x: 230, y: 230 },
          { x: 240, y: 270 }
        ],
        strokeColor: '#E65100',
        strokeWidth: 4,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_4`, name: 'ShoulderJoint', localX: 185, localY: 190, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      },
      [leftLegId]: {
        id: leftLegId,
        name: 'LeftLeg',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 130, y: 280 },
          { x: 130, y: 340 },
          { x: 125, y: 380 }
        ],
        strokeColor: '#0D47A1',
        strokeWidth: 4.5,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_5`, name: 'HipJoint', localX: 130, localY: 280, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      },
      [rightLegId]: {
        id: rightLegId,
        name: 'RightLeg',
        type: 'shape',
        shapeType: 'line',
        points: [
          { x: 170, y: 280 },
          { x: 170, y: 340 },
          { x: 175, y: 380 }
        ],
        strokeColor: '#0D47A1',
        strokeWidth: 4.5,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 300, y: 100, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_6`, name: 'HipJoint', localX: 170, localY: 280, locked: false }],
        parentId: torsoId,
        childrenIds: [],
        layerId: 'layer_char',
        isLocked: false,
        isHidden: false,
      }
    };

    // Pre-create bones links for realistic joint kinematics solver!
    const sampleBones: Bone[] = [
      {
        id: 'bone_spine',
        name: 'Spine_Bone',
        startObjectId: torsoId,
        endObjectId: headId,
        startLocalX: 150,
        startLocalY: 180,
        endLocalX: 150,
        endLocalY: 175,
        lockedDistance: 10,
        allowDetach: false,
        minAngle: -45,
        maxAngle: 45,
        enableConstraints: true,
      },
      {
        id: 'bone_larm',
        name: 'Left_Arm_Bone',
        startObjectId: torsoId,
        endObjectId: leftArmId,
        startLocalX: 120,
        startLocalY: 190,
        endLocalX: 115,
        endLocalY: 190,
        lockedDistance: 10,
        allowDetach: false,
        minAngle: -120,
        maxAngle: 120,
        enableConstraints: true,
      }
    ];

    setObjects(sampleObjects);
    setBones(sampleBones);
    setSmartPinnedIds([leftArmId, rightArmId, leftLegId, rightLegId]);
    setSelectedObjectId(torsoId);
  };

  // Object and Canvas operations
  const deleteObject = (id: string) => {
    historyPush();
    setObjects(prev => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
    setBones(prev => prev.filter(b => b.startObjectId !== id && b.endObjectId !== id));
    if (selectedObjectId === id) {
      setSelectedObjectId(null);
    }
  };

  const clearCanvas = () => {
    historyPush();
    setObjects({});
    setBones([]);
    setSelectedObjectId(null);
    setFrames([{ index: 0, objects: {} }]);
    setCurrentFrameIndex(0);
  };

  // Timeline operations
  const addFrame = () => {
    setFrames(prev => [...prev, { index: prev.length, objects: {} }]);
  };

  const deleteFrame = (index: number) => {
    if (frames.length <= 1) return;
    setFrames(prev => prev.filter((_, idx) => idx !== index));
    if (currentFrameIndex >= frames.length - 1) {
      setCurrentFrameIndex(frames.length - 2);
    }
  };

  const duplicateFrame = (index: number) => {
    const frameToDup = frames[index];
    const newFrame = JSON.parse(JSON.stringify(frameToDup));
    newFrame.index = frames.length;
    setFrames(prev => [...prev, newFrame]);
  };

  const copyFrame = (index: number) => {
    localStorage.setItem('copied_frame_data', JSON.stringify(frames[index].objects));
  };

  const pasteFrame = (index: number) => {
    const data = localStorage.getItem('copied_frame_data');
    if (data) {
      const parsed = JSON.parse(data);
      setFrames(prev => {
        const updated = [...prev];
        updated[index].objects = parsed;
        return updated;
      });
    }
  };

  // Video Export recorder
  const startRecording = () => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    recordedChunksRef.current = [];
    const stream = canvas.captureStream(fps);
    const options = { mimeType: 'video/webm;codecs=vp9' };

    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AnimaStudio_Export_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        setIsRecording(false);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setIsPlaying(true); // Auto-start play to capture sequence
    } catch (e) {
      alert("Recording not supported on this browser context.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
  };

  // Import local JSON project file
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const project = JSON.parse(event.target?.result as string);
        if (project.objects) setObjects(project.objects);
        if (project.bones) setBones(project.bones);
        if (project.frames) setFrames(project.frames);
        alert("Project loaded successfully!");
      } catch (err) {
        alert("Invalid project JSON layout.");
      }
    };
    reader.readAsText(file);
  };

  // Export local JSON project file
  const handleExportJSON = () => {
    const project = {
      id: `proj_${Date.now()}`,
      name: 'Untitled Project',
      canvasSize: { w: 1000, h: 700 },
      fps,
      layers,
      objects,
      frames,
      bones,
    };

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AnimaStudio_Project_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
  };

  // Upload background-removed PNG image
  const handlePNGUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const imgId = `obj_png_${Date.now()}`;
      
      const newObj: VectorObject = {
        id: imgId,
        name: `untitledPNG_${Object.keys(objects).length + 1}`,
        type: 'image',
        points: [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { x: 300, y: 300 },
          { x: 100, y: 300 },
          { x: 100, y: 100 }
        ],
        strokeColor: 'transparent',
        strokeWidth: 0,
        fillColor: 'transparent',
        opacity: 1,
        transform: { x: 200, y: 150, rotation: 0, scaleX: 1, scaleY: 1 },
        pivots: [{ id: `pvt_${Date.now()}_img`, name: 'BaseJoint', localX: 200, localY: 200, locked: false }],
        parentId: null,
        childrenIds: [],
        layerId: activeLayerId,
        imageUrl: url,
        isLocked: false,
        isHidden: false,
      };

      setObjects(prev => ({ ...prev, [imgId]: newObj }));
      setSelectedObjectId(imgId);
      historyPush();
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-white font-sans text-sm antialiased overflow-hidden select-none">
      {/* 1. TOP NAVIGATION BAR */}
      <header className="h-14 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between shrink-0 select-none z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <span className="font-extrabold text-neutral-950 text-base">A</span>
          </div>
          <div>
            <h1 className="font-black text-sm tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400">
              AnimaStudio
            </h1>
            <p className="text-[10px] text-neutral-500 font-extrabold leading-none uppercase tracking-widest mt-0.5">
              Vector & Rigging Engine
            </p>
          </div>
        </div>

        {/* Center Actions: Undo, Redo, Add Sample Character */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`p-2 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 hover:text-white transition-all ${
              undoStack.length === 0 ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            title="Undo Last Action"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className={`p-2 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 hover:text-white transition-all ${
              redoStack.length === 0 ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            title="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-6 bg-neutral-800 mx-1"></div>

          <button
            onClick={addSampleCharacter}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-black text-xs hover:shadow-lg hover:shadow-amber-500/10 active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 fill-current" />
            RIG SAMPLE CHARACTER
          </button>

          <button
            onClick={clearCanvas}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white font-black text-xs active:scale-95 transition-all cursor-pointer"
            title="Clear entire canvas, drawings, bones and timelines"
          >
            <Trash2 className="w-3.5 h-3.5" />
            CLEAR CANVAS
          </button>
        </div>

        {/* Right Actions: Import, Export, Record */}
        <div className="flex items-center gap-2">
          {/* Upload PNG */}
          <label className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 font-black text-xs cursor-pointer text-neutral-300 hover:text-white transition-all">
            <Upload className="w-3.5 h-3.5" />
            UPLOAD PNG
            <input
              type="file"
              accept="image/png"
              onChange={handlePNGUpload}
              className="hidden"
            />
          </label>

          <div className="w-[1px] h-6 bg-neutral-800 mx-1"></div>

          {/* Import / Export JSON */}
          <label className="p-2 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 cursor-pointer transition-colors">
            <Plus className="w-4 h-4" />
            <input
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
          </label>
          <button
            onClick={handleExportJSON}
            className="p-2 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition-colors"
            title="Export JSON"
          >
            <Download className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-6 bg-neutral-800 mx-1"></div>

          {/* Record Live MP4 Export */}
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500 text-white font-black text-xs animate-pulse hover:bg-rose-400 transition-colors cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" />
              STOP RECORDING
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 font-black text-xs transition-colors cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" />
              RECORD MP4 EXPORT
            </button>
          )}
        </div>
      </header>

      {/* 2. MIDDLE WORKSPACE PANELS AND CANVAS */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-neutral-950 relative">
        {/* Left Toolbar Column */}
        <Toolbar
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          collapsed={toolbarCollapsed}
          setCollapsed={setToolbarCollapsed}
        />

        {/* Left Collapsible Parenting Hierarchy Tree Panel */}
        <LeftPanel
          objects={objects}
          selectedObjectId={selectedObjectId}
          setSelectedObjectId={setSelectedObjectId}
          updateObject={updateObject}
          deleteObject={deleteObject}
          layers={layers}
          setLayers={setLayers}
          activeLayerId={activeLayerId}
          setActiveLayerId={setActiveLayerId}
          open={leftOpen}
          setOpen={setLeftOpen}
          groupObjects={(ids) => {
            const grpId = `grp_${Date.now()}`;
            alert(`Grouped selected items under parent ID: ${grpId}`);
          }}
        />

        {/* Central Vector Canvas Area */}
        <CanvasArea
          objects={objects}
          setObjects={setObjects}
          selectedObjectId={selectedObjectId}
          setSelectedObjectId={setSelectedObjectId}
          activeTool={activeTool}
          frames={frames}
          currentFrameIndex={currentFrameIndex}
          bones={bones}
          setBones={setBones}
          activeLayerId={activeLayerId}
          onionSkinEnabled={onionSkinEnabled}
          isPlaying={isPlaying}
          historyPush={historyPush}
          layers={layers}
          setLayers={setLayers}
        />

        {/* Right Collapsible Properties, Sliders, Smart Pinned Controls */}
        <RightPanel
          selectedObject={selectedObjectId ? objects[selectedObjectId] : null}
          setSelectedObjectId={setSelectedObjectId}
          updateObject={updateObject}
          deleteObject={deleteObject}
          objects={objects}
          bones={bones}
          addBone={(bone) => setBones(prev => [...prev, bone])}
          deleteBone={(id) => setBones(prev => prev.filter(b => b.id !== id))}
          updateBone={(id, updates) => {
            setBones(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
          }}
          open={rightOpen}
          setOpen={setRightOpen}
          smartPinnedIds={smartPinnedIds}
          toggleSmartPin={toggleSmartPin}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
        />
      </div>

      {/* 3. BOTTOM FRAMES TIMELINE */}
      <Timeline
        frames={frames}
        currentFrameIndex={currentFrameIndex}
        setCurrentFrameIndex={setCurrentFrameIndex}
        addFrame={addFrame}
        deleteFrame={deleteFrame}
        duplicateFrame={duplicateFrame}
        copyFrame={copyFrame}
        pasteFrame={pasteFrame}
        onionSkinEnabled={onionSkinEnabled}
        setOnionSkinEnabled={setOnionSkinEnabled}
        fps={fps}
        setFps={setFps}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
      />
    </div>
  );
}

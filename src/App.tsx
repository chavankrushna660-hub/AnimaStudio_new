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
  Trash2,
  User,
  UserCheck,
  LogOut,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Lock,
  Mail
} from 'lucide-react';
import Toolbar from './components/Toolbar';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import CanvasArea from './components/CanvasArea';
import Timeline from './components/Timeline';
import { VectorObject, Bone, Layer, Frame, Point, RealismSettings, View360 } from './types';
import { localToWorld, rotatePoint, calculateBoundingBox } from './utils/math';
import { 
  validateSimpleAuth, 
  saveUserAnimation, 
  getUserAnimation, 
  deleteUserAnimation, 
  SavedAnimationRecord 
} from './utils/database';
import { 
  generate3DGeometry, 
  getDailyLimitStatus, 
  incrementDailyLimit,
  extrude2DTo3D
} from './utils/engine3D';
import { parse3DModelFile } from './utils/custom3DLoader';
import { BottomAdBar, AdTheaterModal, TopAdBar } from './components/AdSystem';

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
  const [showBones, setShowBones] = useState(true);
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

  // 360 Studio Interactive Drawing Wizard State
  const [is360WizardActive, setIs360WizardActive] = useState(false);
  const [draft360Views, setDraft360Views] = useState<View360[]>([]);
  const [draftAnchorId, setDraftAnchorId] = useState<string | null>(null);
  const [onionSkinEnabled360, setOnionSkinEnabled360] = useState(true);

  // Smart controls pinned list
  const [smartPinnedIds, setSmartPinnedIds] = useState<string[]>([]);

  // Lasso selection area points state
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [lassoMode, setLassoMode] = useState<'freehand' | 'pen'>('freehand');
  const [penLassoPoints, setPenLassoPoints] = useState<Point[]>([]);

  // Realism Maker Settings
  const [realismSettings, setRealismSettings] = useState<RealismSettings>({
    autoTaperEnabled: false,
    minThickness: 1.5,
    maxThickness: 8.0,
    thinningFactor: 0.3,
    autoShadingEnabled: false,
    shadingLightAngle: 45,
    shadingHighlightOpacity: 0.2,
    shadingShadowOpacity: 0.3,
    microJitterEnabled: false,
    microJitterAmount: 1.5,
    paperGrainEnabled: false,
    paperGrainIntensity: 0.4,
    inkBleedEnabled: false,
    inkBleedBlur: 3,
    inkBleedOpacity: 0.3,
    inkBleedWidthOffset: 6,
  });

  // Simple Authentication & Animation Database states
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    return localStorage.getItem('animastudio_current_user');
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [savedRecord, setSavedRecord] = useState<SavedAnimationRecord | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [dbNotification, setDbNotification] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);
  const [limitNotification, setLimitNotification] = useState<string | null>(null);
  const limitTimeoutRef = useRef<any>(null);

  const triggerLimitNotification = () => {
    if (limitTimeoutRef.current) {
      clearTimeout(limitTimeoutRef.current);
    }
    setLimitNotification("you have reached daily limit for 3D mesh please wait for refresh");
    limitTimeoutRef.current = setTimeout(() => {
      setLimitNotification(null);
    }, 2000);
  };

  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isAdTheaterOpen, setIsAdTheaterOpen] = useState(false);

  // Canvas Size States
  const [artboardW, setArtboardW] = useState<number>(1400);
  const [artboardH, setArtboardH] = useState<number>(900);
  const [showCanvasSizePanel, setShowCanvasSizePanel] = useState<boolean>(false);

  // Adaptive subdivision control
  const [adaptiveSubdivisionEnabled, setAdaptiveSubdivisionEnabled] = useState<boolean>(true);
  const [adaptiveSubdivisionPoints, setAdaptiveSubdivisionPoints] = useState<number>(3);

  // Window size state for mobile responsive zoom-out container
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  });

  // Responsive default setups & exclusive sidebar triggers
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        if (window.innerWidth < 1024) {
          setLeftOpen(false);
          setRightOpen(false);
          setToolbarCollapsed(true);
        } else {
          setLeftOpen(true);
          setRightOpen(true);
          setToolbarCollapsed(false);
        }
      };
      // Run once on load
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, []);

  const handleSetLeftOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    setLeftOpen(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (next && typeof window !== 'undefined' && window.innerWidth < 1024) {
        setRightOpen(false);
      }
      return next;
    });
  };

  const handleSetRightOpen = (val: boolean | ((prev: boolean) => boolean)) => {
    setRightOpen(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (next && typeof window !== 'undefined' && window.innerWidth < 1024) {
        setLeftOpen(false);
      }
      return next;
    });
  };

  // Check user saved records on login or on initial render
  useEffect(() => {
    if (currentUser) {
      const { record, wasDeleted } = getUserAnimation(currentUser);
      if (wasDeleted) {
        setSavedRecord(null);
        setDbNotification({
          type: 'info',
          message: 'Notice: Your previously saved animation was deleted automatically because it was more than 1 day old.'
        });
        setTimeout(() => setDbNotification(null), 8000);
      } else if (record) {
        setSavedRecord(record);
      } else {
        setSavedRecord(null);
      }
    } else {
      setSavedRecord(null);
    }
  }, [currentUser]);

  // Periodic age-check (runs every 10 seconds to auto-expire if the page stays open)
  useEffect(() => {
    const interval = setInterval(() => {
      if (currentUser && savedRecord) {
        const { record, wasDeleted } = getUserAnimation(currentUser);
        if (wasDeleted) {
          setSavedRecord(null);
          setDbNotification({
            type: 'info',
            message: 'Your saved animation has just reached the 1-day threshold and was deleted.'
          });
          setTimeout(() => setDbNotification(null), 6000);
        }
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [currentUser, savedRecord]);

  const handleSaveToDatabase = () => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    try {
      const record = saveUserAnimation(currentUser, {
        fps,
        layers,
        objects,
        frames,
        bones,
      });
      setSavedRecord(record);
      setDbNotification({
        type: 'success',
        message: 'Successfully saved current workspace animation to database!'
      });
      setTimeout(() => setDbNotification(null), 4000);
    } catch (e) {
      setDbNotification({
        type: 'error',
        message: 'Failed to save to database.'
      });
      setTimeout(() => setDbNotification(null), 4000);
    }
  };

  const handleLoadFromDatabase = () => {
    if (!currentUser || !savedRecord) return;

    // Run age check first
    const { record, wasDeleted } = getUserAnimation(currentUser);
    if (wasDeleted) {
      setSavedRecord(null);
      setDbNotification({
        type: 'error',
        message: 'Unable to load: Your saved animation expired (older than 1 day) and was deleted.'
      });
      setTimeout(() => setDbNotification(null), 6000);
      return;
    }

    if (record) {
      historyPush();
      if (record.objects) setObjects(JSON.parse(JSON.stringify(record.objects)));
      if (record.bones) setBones(JSON.parse(JSON.stringify(record.bones)));
      if (record.frames) setFrames(JSON.parse(JSON.stringify(record.frames)));
      if (record.layers) setLayers(JSON.parse(JSON.stringify(record.layers)));
      if (record.fps) setFps(record.fps);
      
      setCurrentFrameIndex(0);
      setSelectedObjectId(null);

      setDbNotification({
        type: 'success',
        message: 'Successfully restored saved animation from the database!'
      });
      setTimeout(() => setDbNotification(null), 4000);
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const res = validateSimpleAuth(authEmail, authPassword);
    if (res.success) {
      const normalizedEmail = authEmail.trim().toLowerCase();
      localStorage.setItem('animastudio_current_user', normalizedEmail);
      setCurrentUser(normalizedEmail);
      setIsAuthModalOpen(false);
      setAuthPassword('');
      
      const { record, wasDeleted } = getUserAnimation(normalizedEmail);
      if (record) {
        setSavedRecord(record);
        setDbNotification({
          type: 'success',
          message: `Logged in as ${normalizedEmail}. Found your saved animation!`
        });
      } else if (wasDeleted) {
        setDbNotification({
          type: 'info',
          message: `Logged in as ${normalizedEmail}. Your previous animation had expired and was auto-deleted.`
        });
      } else {
        setDbNotification({
          type: 'success',
          message: `Logged in as ${normalizedEmail}!`
        });
      }
      setTimeout(() => setDbNotification(null), 5000);
    } else {
      setAuthError(res.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('animastudio_current_user');
    setCurrentUser(null);
    setSavedRecord(null);
    setIsProfileDropdownOpen(false);
    setDbNotification({
      type: 'info',
      message: 'Logged out successfully.'
    });
    setTimeout(() => setDbNotification(null), 3000);
  };

  const handleDeleteSavedAnimation = () => {
    if (currentUser) {
      deleteUserAnimation(currentUser);
      setSavedRecord(null);
      setDbNotification({
        type: 'info',
        message: 'Deleted saved animation from database.'
      });
      setTimeout(() => setDbNotification(null), 3000);
    }
  };

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
          loadedFrameIndexRef.current = currentFrameIndex;
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
            loadedFrameIndexRef.current = currentFrameIndex;
            
            setObjects(prev => {
              if (JSON.stringify(prev) !== JSON.stringify(copiedObjects)) {
                return copiedObjects;
              }
              return prev;
            });
            
            setFrames(prev => {
              if (!prev[currentFrameIndex]) return prev;
              const currentFrameObjectsInState = prev[currentFrameIndex].objects || {};
              if (JSON.stringify(currentFrameObjectsInState) !== JSON.stringify(copiedObjects)) {
                const updated = [...prev];
                updated[currentFrameIndex] = {
                  ...updated[currentFrameIndex],
                  objects: copiedObjects
                };
                return updated;
              }
              return prev;
            });
          } else {
            loadedFrameIndexRef.current = currentFrameIndex;
            setObjects(prev => Object.keys(prev).length > 0 ? {} : prev);
          }
        } else {
          loadedFrameIndexRef.current = currentFrameIndex;
          setObjects(prev => Object.keys(prev).length > 0 ? {} : prev);
        }
      } else {
        loadedFrameIndexRef.current = currentFrameIndex;
      }
    } else {
      // 2. Otherwise, we are on the same frame, so sync any changes in 'objects' back to 'frames'
      setFrames(prev => {
        if (!prev[currentFrameIndex]) return prev;
        const currentFrameObjectsInState = prev[currentFrameIndex].objects || {};
        if (Object.keys(currentFrameObjectsInState).length !== Object.keys(objects).length || 
            JSON.stringify(currentFrameObjectsInState) !== JSON.stringify(objects)) {
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

        // 1. Instantly propagate translation for permanently attached sibling group
        if (obj.attachedGroupId && (dX !== 0 || dY !== 0)) {
          Object.keys(updated).forEach(k => {
            if (k !== id && updated[k].attachedGroupId === obj.attachedGroupId) {
              const sibling = updated[k];
              const siblingOrigT = { ...sibling.transform };
              const siblingNewT = {
                ...sibling.transform,
                x: Number((sibling.transform.x + dX).toFixed(2)),
                y: Number((sibling.transform.y + dY).toFixed(2))
              };
              updated[k] = {
                ...sibling,
                transform: siblingNewT
              };

              // Propagate hierarchical transformations down from each sibling
              propagate(k, dX, dY, 0, 1, 1);
            }
          });
        }

        // 2. Propagate parent-child hierarchies from the modified object
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

  // Add 3D Proxy Model into the animation canvas with strict limits
  const add3DModel = (type: 'car' | 'character' | 'chair' | 'sphere' | 'box' | 'sword') => {
    // 1. Scene Limit: Max 3 active 3D models to guarantee 60 FPS performance and avoid lagging
    const existing3D = (Object.values(objects) as VectorObject[]).filter(obj => obj.type === '3d');
    if (existing3D.length >= 3) {
      alert("App Safety Safeguard: Maximum of 3 active 3D models allowed per project to ensure optimal 60 FPS rendering and completely prevent browser crash conditions.");
      return;
    }

    // 2. Daily Limit: Max 10 3D models added per day per user/guest
    const email = currentUser || 'guest';
    const limitStatus = getDailyLimitStatus(email);
    if (!limitStatus.allowed) {
      triggerLimitNotification();
      return;
    }

    historyPush();
    incrementDailyLimit(email);

    // Generate local mesh data from library
    const geom = generate3DGeometry(type);

    const modelId = `obj_3d_${Date.now()}`;
    const new3DObj: VectorObject = {
      id: modelId,
      name: `3D_${type.toUpperCase()}_Proxy`,
      type: '3d',
      shape3DType: type,
      points: [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        { x: -50, y: 50 },
        { x: -50, y: -50 }
      ], // 2D proxy projection footprint
      strokeColor: '#F59E0B',
      strokeWidth: 2.5,
      fillColor: '#F59E0B',
      opacity: 1,
      transform: { x: 300, y: 250, rotation: 0, scaleX: 1, scaleY: 1 },
      transform3D: {
        x: 0,
        y: 0,
        z: 0,
        rx: 15, // default pitch
        ry: 45, // default yaw
        rz: 0,  // default roll
        sx: 1.5,
        sy: 1.5,
        sz: 1.5,
      },
      vertices3D: geom.vertices,
      faces3D: geom.faces,
      bones3D: geom.bones,
      pivots: [{ id: `pvt_${Date.now()}_3d`, name: 'CenterJoint', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };

    setObjects(prev => ({ ...prev, [modelId]: new3DObj }));
    setSelectedObjectId(modelId);
  };

  const add360Object = (selectedIds: string[]) => {
    if (selectedIds.length === 0) {
      alert("Please select one or more drawings to convert into a Master 360 Object.");
      return;
    }
    
    // Check if some are already 360 containers to avoid nested containers
    const validIds = selectedIds.filter(id => objects[id] && objects[id].type !== '360_container');
    if (validIds.length === 0) {
      alert("Please select valid non-container drawings to combine into a Master 360 Object.");
      return;
    }

    const views: View360[] = [];
    validIds.forEach((id, idx) => {
      const angle = Math.round((idx * 360) / validIds.length) % 360;
      views.push({
        id: `view_${Date.now()}_${idx}`,
        angle,
        drawingId: id,
        name: idx === 0 ? 'Front' : idx === 1 && validIds.length === 2 ? 'Back' : `Angle ${angle}°`,
        drawingName: objects[id]?.name || `Drawing ${idx + 1}`
      });
      // Hide the individual drawings on the canvas so they only render inside the master container
      updateObject(id, { isHidden: true });
    });
    
    const containerId = `360_container_${Date.now()}`;
    // Find average position
    let sumX = 0, sumY = 0;
    validIds.forEach(id => {
      sumX += objects[id]?.transform.x ?? 300;
      sumY += objects[id]?.transform.y ?? 250;
    });
    const avgX = sumX / validIds.length;
    const avgY = sumY / validIds.length;
    
    const new360Obj: VectorObject = {
      id: containerId,
      name: `Master_360_Object`,
      type: '360_container',
      views360: views,
      currentAngle360: 0,
      activeViewId360: views[0]?.id || '',
      lockAngle360: false,
      points: [
        { x: -60, y: -60 },
        { x: 60, y: -60 },
        { x: 60, y: 60 },
        { x: -60, y: 60 },
        { x: -60, y: -60 }
      ],
      strokeColor: '#F59E0B',
      strokeWidth: 2,
      fillColor: 'transparent',
      opacity: 1,
      transform: { x: avgX, y: avgY, rotation: 0, scaleX: 1, scaleY: 1 },
      pivots: [{ id: `pvt_${Date.now()}_360`, name: 'RootPivot', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };
    
    historyPush();
    setObjects(prev => ({
      ...prev,
      [containerId]: new360Obj
    }));
    setSelectedObjectId(containerId);
  };

  const start360Wizard = () => {
    setIs360WizardActive(true);
    setDraft360Views([]);
    setDraftAnchorId(null);
  };

  const addDraft360View = (drawingId: string, name: string, angle: number) => {
    if (!objects[drawingId]) return;
    const viewId = `view_${Date.now()}`;
    const newView: View360 = {
      id: viewId,
      name,
      angle: angle % 360,
      drawingId,
      drawingName: objects[drawingId].name
    };
    
    // Hide drawing temporarily so they can draw the next one at the exact same spot without clutter
    setObjects(prev => ({
      ...prev,
      [drawingId]: { ...prev[drawingId], isHidden: true }
    }));
    
    setDraft360Views(prev => [...prev, newView]);
    if (!draftAnchorId) {
      setDraftAnchorId(drawingId);
    }
  };

  const cancel360Wizard = () => {
    setObjects(prev => {
      const next = { ...prev };
      draft360Views.forEach(v => {
        if (next[v.drawingId]) {
          next[v.drawingId] = { ...next[v.drawingId], isHidden: false };
        }
      });
      return next;
    });
    setIs360WizardActive(false);
    setDraft360Views([]);
    setDraftAnchorId(null);
  };

  const compile360Wizard = (containerName: string) => {
    if (draft360Views.length === 0) {
      alert("Please add at least one view before compiling.");
      return;
    }
    const anchorId = draftAnchorId || draft360Views[0].drawingId;
    const anchorDrawing = objects[anchorId];
    if (!anchorDrawing) return;

    // Center of anchor
    const boundsAnchor = calculateBoundingBox(anchorDrawing.points);
    const txAnchor = anchorDrawing.transform.x;
    const tyAnchor = anchorDrawing.transform.y;
    const avgX = (boundsAnchor.x + boundsAnchor.width / 2) + txAnchor;
    const avgY = (boundsAnchor.y + boundsAnchor.height / 2) + tyAnchor;

    const containerId = `360_container_${Date.now()}`;
    
    const new360Obj: VectorObject = {
      id: containerId,
      name: containerName || `Master_360_Object`,
      type: '360_container',
      views360: [...draft360Views],
      currentAngle360: 0,
      activeViewId360: draft360Views[0].id,
      lockAngle360: false,
      points: [
        { x: -60, y: -60 },
        { x: 60, y: -60 },
        { x: 60, y: 60 },
        { x: -60, y: 60 },
        { x: -60, y: -60 }
      ],
      strokeColor: '#F59E0B',
      strokeWidth: 2,
      fillColor: 'transparent',
      opacity: 1,
      transform: { x: avgX, y: avgY, rotation: 0, scaleX: 1, scaleY: 1 },
      pivots: [{ id: `pvt_${Date.now()}_360`, name: 'RootPivot', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };

    historyPush();
    setObjects(prev => {
      const next = { ...prev };
      draft360Views.forEach(v => {
        if (next[v.drawingId]) {
          next[v.drawingId] = { ...next[v.drawingId], isHidden: true };
        }
      });
      next[containerId] = new360Obj;
      return next;
    });
    setSelectedObjectId(containerId);

    setIs360WizardActive(false);
    setDraft360Views([]);
    setDraftAnchorId(null);
  };

  const addCustom3DModel = (mesh: any, filename: string) => {
    const existing3D = (Object.values(objects) as VectorObject[]).filter(obj => obj.type === '3d');
    if (existing3D.length >= 3) {
      alert("App Safety Safeguard: Maximum of 3 active 3D models allowed per project to ensure optimal 60 FPS rendering and completely prevent browser crash conditions.");
      return;
    }

    const email = currentUser || 'guest';
    const limitStatus = getDailyLimitStatus(email);
    if (!limitStatus.allowed) {
      triggerLimitNotification();
      return;
    }

    historyPush();
    incrementDailyLimit(email);

    const modelId = `obj_3d_${Date.now()}`;
    const new3DObj: VectorObject = {
      id: modelId,
      name: filename.replace(/\.[^/.]+$/, "") + "_Mesh",
      type: '3d',
      shape3DType: 'box',
      points: [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        { x: -50, y: 50 },
        { x: -50, y: -50 }
      ],
      strokeColor: '#F59E0B',
      strokeWidth: 2.0,
      fillColor: '#F59E0B',
      opacity: 1,
      transform: { x: 300, y: 250, rotation: 0, scaleX: 1, scaleY: 1 },
      transform3D: {
        x: 0,
        y: 0,
        z: 0,
        rx: 15,
        ry: 45,
        rz: 0,
        sx: 1.8,
        sy: 1.8,
        sz: 1.8,
      },
      vertices3D: mesh.vertices,
      faces3D: mesh.faces,
      bones3D: mesh.bones || [],
      pivots: [{ id: `pvt_${Date.now()}_3d`, name: 'CenterJoint', localX: 0, localY: 0, locked: false }],
      parentId: null,
      childrenIds: [],
      layerId: activeLayerId,
      isLocked: false,
      isHidden: false,
    };

    setObjects(prev => ({ ...prev, [modelId]: new3DObj }));
    setSelectedObjectId(modelId);
  };

  // Convert 2D Vector Drawing instantly into a real 3D solid wireframe geometry prism
  const convertTo3D = (id: string) => {
    const obj = objects[id];
    if (!obj) return;

    if (obj.type !== 'stroke' && obj.type !== 'shape') {
      alert("Please select a 2D drawing or shape to convert.");
      return;
    }

    const email = currentUser || 'guest';
    const limitStatus = getDailyLimitStatus(email);
    if (!limitStatus.allowed) {
      triggerLimitNotification();
      return;
    }

    historyPush();
    incrementDailyLimit(email);

    // Run extrusion algorithm
    const result = extrude2DTo3D(obj.points, obj.fillColor, obj.strokeColor);

    const updatedObj: VectorObject = {
      ...obj,
      type: '3d',
      shape3DType: 'box', // Extrusion uses box shading logic
      points: [
        { x: -50, y: -50 },
        { x: 50, y: -50 },
        { x: 50, y: 50 },
        { x: -50, y: 50 },
        { x: -50, y: -50 }
      ], // 2D projection footprint box
      strokeColor: obj.strokeColor !== 'transparent' ? obj.strokeColor : '#F59E0B',
      strokeWidth: 2.0,
      fillColor: obj.fillColor !== 'transparent' ? obj.fillColor : '#F59E0B',
      transform: {
        ...obj.transform,
        x: obj.transform.x + result.center.x,
        y: obj.transform.y + result.center.y,
      },
      transform3D: {
        x: 0,
        y: 0,
        z: 0,
        rx: 15,
        ry: 45,
        rz: 0,
        sx: 1.0,
        sy: 1.0,
        sz: 1.0,
      },
      vertices3D: result.vertices,
      faces3D: result.faces,
      bones3D: [],
      originalPointsBackup: obj.points,
      hollowEnabled: false,
      innerSpace3D: 10,
      depth3D: 40,
      pivots: [{ id: `pvt_${Date.now()}_3d`, name: 'CenterJoint', localX: 0, localY: 0, locked: false }],
    };

    setObjects(prev => ({
      ...prev,
      [id]: updatedObj
    }));
    setSelectedObjectId(id);
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

  const batchAddFrames = (count: number) => {
    historyPush();
    setFrames(prev => {
      const updated = [...prev];
      const lastFrame = prev[prev.length - 1];
      const lastFrameObjects = lastFrame ? lastFrame.objects || {} : {};
      
      for (let i = 0; i < count; i++) {
        updated.push({
          index: updated.length,
          objects: JSON.parse(JSON.stringify(lastFrameObjects))
        });
      }
      return updated;
    });
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
      if (index === currentFrameIndex) {
        setObjects(parsed);
      }
    }
  };

  // Video Export recorder
  const startRecording = () => {
    const canvas = (document.getElementById('front-vector-canvas') as HTMLCanvasElement) || (document.querySelector('canvas') as HTMLCanvasElement);
    if (!canvas) return;

    recordedChunksRef.current = [];
    const stream = canvas.captureStream(fps);
    
    // Check supported types for mp4 vs webm
    let options: MediaRecorderOptions = { mimeType: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' };
    let extension = 'mp4';
    
    if (typeof MediaRecorder !== 'undefined') {
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/mp4' };
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=h264' };
        extension = 'webm';
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm;codecs=vp9' };
        extension = 'webm';
      }
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
        extension = 'webm';
      }
    } else {
      extension = 'webm';
    }

    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: options.mimeType || 'video/mp4' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AnimaStudio_Export_${Date.now()}.${extension}`;
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

  const isMobile = windowSize.width < 1200;
  const targetWidth = 1280;
  const scale = isMobile ? windowSize.width / targetWidth : 1;

  if (typeof window !== 'undefined') {
    (window as any).__appScale = scale;
  }

  const containerStyle: React.CSSProperties = isMobile ? {
    width: `${targetWidth}px`,
    height: `${windowSize.height / scale}px`,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    position: 'absolute',
    left: 0,
    top: 0,
  } : {};

  return (
    <div className="w-screen h-screen overflow-hidden bg-neutral-950 relative">
      <div 
        style={containerStyle}
        className="flex flex-col h-full w-full bg-neutral-950 text-white font-sans text-sm antialiased overflow-hidden select-none"
      >
        {/* SYSTEM AD BANNER BAR TOP (Solid Black bar completely separate from tools/canvas) */}
        <TopAdBar />

      {/* 1. TOP NAVIGATION BAR */}
      <header className="h-14 bg-neutral-900 border-b border-neutral-800 px-2 sm:px-4 flex items-center justify-between shrink-0 select-none z-10 overflow-x-auto scrollbar-none flex-nowrap">
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0 flex-nowrap">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
            <span className="font-extrabold text-neutral-950 text-xs sm:text-base">A</span>
          </div>
          <div className="block shrink-0">
            <h1 className="font-black text-[9px] sm:text-xs tracking-wider uppercase bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400 leading-none">
              ANIMASTUDIO
            </h1>
            <p className="text-[7.5px] sm:text-[9px] text-neutral-500 font-extrabold leading-none uppercase tracking-widest mt-0.5">
              VECTOR & RIGGING
            </p>
          </div>
        </div>

        {/* Center Actions: Undo, Redo, Add Sample Character */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 flex-nowrap mx-2">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className={`p-1.5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 hover:text-white transition-all shrink-0 ${
              undoStack.length === 0 ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            title="Undo Last Action"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className={`p-1.5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 hover:text-white transition-all shrink-0 ${
              redoStack.length === 0 ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            title="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 sm:mx-1 shrink-0"></div>

          <button
            onClick={addSampleCharacter}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-black text-[9px] sm:text-xs hover:shadow-lg hover:shadow-amber-500/10 active:scale-95 transition-all cursor-pointer shrink-0"
            title="Rig Sample Character"
          >
            <Sparkles className="w-3 h-3 fill-current shrink-0" />
            <span className="inline">RIG SAMPLE CHARACTER</span>
          </button>

          <button
            onClick={clearCanvas}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white font-black text-[9px] sm:text-xs active:scale-95 transition-all cursor-pointer shrink-0"
            title="Clear entire canvas, drawings, bones and timelines"
          >
            <Trash2 className="w-3 h-3 shrink-0" />
            <span className="inline">CLEAR CANVAS</span>
          </button>
        </div>

        {/* Right Actions: Import, Export, Record, Database */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 flex-nowrap">
          {/* Upload PNG */}
          <label className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 font-black text-[9px] sm:text-xs cursor-pointer text-neutral-300 hover:text-white transition-all shrink-0">
            <Upload className="w-3 h-3 shrink-0" />
            <span className="inline">UPLOAD</span>
            <input
              type="file"
              accept="image/png"
              onChange={handlePNGUpload}
              className="hidden"
            />
          </label>

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* Import / Export JSON */}
          <label className="p-1.5 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 cursor-pointer transition-colors shrink-0" title="Import JSON">
            <Plus className="w-3.5 h-3.5" />
            <input
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
          </label>
          <button
            onClick={handleExportJSON}
            className="p-1.5 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition-colors shrink-0"
            title="Export JSON"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* Record Live MP4 Export */}
          {isRecording ? (
            <button
              onClick={stopRecording}
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-rose-500 text-white font-black text-[9px] sm:text-xs animate-pulse hover:bg-rose-400 transition-colors cursor-pointer shrink-0"
            >
              <Video className="w-3 h-3 shrink-0" />
              <span className="inline">STOP</span>
            </button>
          ) : (
            <button
              onClick={startRecording}
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 font-black text-[9px] sm:text-xs transition-colors cursor-pointer shrink-0"
              title="Record MP4 Animation"
            >
              <Video className="w-3 h-3 shrink-0" />
              <span className="inline">REC</span>
            </button>
          )}

          <div className="w-[1px] h-6 bg-neutral-800 mx-0.5 shrink-0"></div>

          {/* User Icon Auth Trigger */}
          <div className="relative shrink-0" id="user-profile-menu-container">
            {currentUser ? (
              <button
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 font-bold text-[9px] sm:text-xs transition-colors cursor-pointer select-none shrink-0"
                title={`Logged in as ${currentUser}. Click to open database manager.`}
              >
                <UserCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="max-w-[60px] truncate inline">{currentUser.split('@')[0]}</span>
              </button>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-neutral-300 hover:text-white font-bold text-[9px] sm:text-xs transition-colors cursor-pointer select-none shrink-0"
                title="Guest Mode. Click here to login to save animations."
              >
                <User className="w-3 h-3 text-neutral-400 shrink-0" />
                <span className="inline">LOGIN</span>
              </button>
            )}

            {/* Profile Dropdown / Saved Animation manager popup */}
            {currentUser && isProfileDropdownOpen && (
              <div className="absolute right-0 mt-2.5 w-72 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-4 z-50 text-xs space-y-3.5 animate-fade-in text-neutral-200">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <span className="font-extrabold text-neutral-400 uppercase tracking-wider text-[10px]">Your Account</span>
                  <button 
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 text-rose-400 hover:text-rose-300 font-extrabold uppercase text-[9px] bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 rounded-lg transition-all border border-rose-500/15"
                  >
                    <LogOut className="w-3 h-3 text-rose-400" />
                    Logout
                  </button>
                </div>

                <div className="space-y-1">
                  <span className="text-neutral-500 block font-bold text-[9px] uppercase">Logged in as</span>
                  <span className="text-neutral-200 font-extrabold truncate block text-xs">{currentUser}</span>
                </div>

                {/* Database Animation Section */}
                <div className="bg-neutral-950/60 rounded-xl p-3 border border-neutral-800/60 space-y-2.5">
                  <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider block">💾 Database Storage</span>
                  
                  {savedRecord ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 text-[11px] text-neutral-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-neutral-200">Saved Animation exists</p>
                          <div className="flex items-center gap-1 text-[9px] text-neutral-500 font-medium mt-0.5">
                            <Clock className="w-3 h-3 text-neutral-500" />
                            <span>Saved: {new Date(savedRecord.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="text-[9px] text-amber-500 font-black mt-1">
                            ⚠️ Auto-expires in {Math.max(0, Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - savedRecord.savedAt)) / (60 * 60 * 1000)))} hours
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-neutral-900">
                        <button
                          onClick={handleLoadFromDatabase}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-black text-[10px] text-center transition-all uppercase cursor-pointer"
                        >
                          LOAD SAVE
                        </button>
                        <button
                          onClick={handleDeleteSavedAnimation}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-850 hover:bg-neutral-800 border border-neutral-800 hover:border-rose-500/30 text-neutral-400 hover:text-rose-400 font-bold text-[10px] text-center transition-all uppercase cursor-pointer"
                        >
                          DELETE
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-[10px] text-neutral-500 leading-relaxed">
                        No animation currently saved in your database slot. Saving stores your objects, layers, and timelines for exactly 1 day.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleSaveToDatabase}
                    className="w-full py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 font-black text-xs text-center hover:shadow-lg hover:shadow-amber-500/10 transition-all uppercase block cursor-pointer"
                  >
                    SAVE CURRENT WORK
                  </button>
                </div>
              </div>
            )}
          </div>
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
          setOpen={handleSetLeftOpen}
          groupObjects={(ids) => {
            const grpId = `grp_${Date.now()}`;
            alert(`Grouped selected items under parent ID: ${grpId}`);
          }}
          activeTool={activeTool}
          add3DModel={add3DModel}
          addCustom3DModel={addCustom3DModel}
          add360Object={add360Object}
          currentUser={currentUser}
          is360WizardActive={is360WizardActive}
          draft360Views={draft360Views}
          draftAnchorId={draftAnchorId}
          onionSkinEnabled360={onionSkinEnabled360}
          setOnionSkinEnabled360={setOnionSkinEnabled360}
          start360Wizard={start360Wizard}
          addDraft360View={addDraft360View}
          cancel360Wizard={cancel360Wizard}
          compile360Wizard={compile360Wizard}
          adaptiveSubdivisionEnabled={adaptiveSubdivisionEnabled}
          setAdaptiveSubdivisionEnabled={setAdaptiveSubdivisionEnabled}
          adaptiveSubdivisionPoints={adaptiveSubdivisionPoints}
          setAdaptiveSubdivisionPoints={setAdaptiveSubdivisionPoints}
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
          showBones={showBones}
          isPlaying={isPlaying}
          historyPush={historyPush}
          layers={layers}
          setLayers={setLayers}
          lassoPoints={lassoPoints}
          setLassoPoints={setLassoPoints}
          lassoMode={lassoMode}
          setLassoMode={setLassoMode}
          penLassoPoints={penLassoPoints}
          setPenLassoPoints={setPenLassoPoints}
          realismSettings={realismSettings}
          is360WizardActive={is360WizardActive}
          draft360Views={draft360Views}
          onionSkinEnabled360={onionSkinEnabled360}
          artboardW={artboardW}
          setArtboardW={setArtboardW}
          artboardH={artboardH}
          setArtboardH={setArtboardH}
          showCanvasSizePanel={showCanvasSizePanel}
          setShowCanvasSizePanel={setShowCanvasSizePanel}
          adaptiveSubdivisionEnabled={adaptiveSubdivisionEnabled}
          adaptiveSubdivisionPoints={adaptiveSubdivisionPoints}
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
          deleteBone={(id) => {
            const targetBone = bones.find(b => b.id === id);
            if (targetBone) {
              const startObj = objects[targetBone.startObjectId];
              const endObj = objects[targetBone.endObjectId];
              if ((startObj && startObj.type === '3d') || (endObj && endObj.type === '3d')) {
                alert("Rigged 3D bone structures are permanently unified for structural integrity to prevent skeleton decoupling.");
                return;
              }
            }
            setBones(prev => prev.filter(b => b.id !== id));
          }}
          updateBone={(id, updates) => {
            setBones(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
          }}
          open={rightOpen}
          setOpen={handleSetRightOpen}
          smartPinnedIds={smartPinnedIds}
          toggleSmartPin={toggleSmartPin}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          lassoPoints={lassoPoints}
          setLassoPoints={setLassoPoints}
          lassoMode={lassoMode}
          setLassoMode={setLassoMode}
          penLassoPoints={penLassoPoints}
          setPenLassoPoints={setPenLassoPoints}
          frames={frames}
          setFrames={setFrames}
          currentFrameIndex={currentFrameIndex}
          setCurrentFrameIndex={setCurrentFrameIndex}
          setObjects={setObjects}
          fps={fps}
          setFps={setFps}
          realismSettings={realismSettings}
          setRealismSettings={setRealismSettings}
          convertTo3D={convertTo3D}
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
        showBones={showBones}
        setShowBones={setShowBones}
        batchAddFrames={batchAddFrames}
        fps={fps}
        setFps={setFps}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        showCanvasSizePanel={showCanvasSizePanel}
        setShowCanvasSizePanel={setShowCanvasSizePanel}
      />

      {/* 3.1 SYSTEM AD BANNER BAR (Solid Black bar separate from tools/canvas) */}
      <BottomAdBar onOpenTheater={() => setIsAdTheaterOpen(true)} />

      {/* 4. NOTIFICATION & TOAST OVERLAYS */}
      {dbNotification && (
        <div 
          id="db-toast-notification"
          className={`fixed bottom-24 right-6 z-50 flex items-start gap-3 p-4 rounded-2xl shadow-2xl border text-xs max-w-sm animate-fade-in ${
            dbNotification.type === 'success' 
              ? 'bg-emerald-950/95 border-emerald-500/30 text-emerald-300' 
              : dbNotification.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/30 text-rose-300'
              : 'bg-amber-950/95 border-amber-500/30 text-amber-300'
          }`}
        >
          {dbNotification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
          {dbNotification.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
          {dbNotification.type === 'info' && <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />}
          <div className="space-y-1">
            <p className="font-extrabold uppercase text-[10px] tracking-wider text-neutral-200">
              {dbNotification.type === 'success' ? 'Database Success' : dbNotification.type === 'error' ? 'Database Alert' : 'System Notice'}
            </p>
            <p className="text-neutral-300 font-medium leading-relaxed">{dbNotification.message}</p>
          </div>
        </div>
      )}

      {/* Daily limit alert toast */}
      {limitNotification && (
        <div 
          id="limit-toast-notification"
          className="fixed bottom-24 right-6 z-50 flex items-start justify-between gap-3 p-4 rounded-2xl shadow-2xl border text-xs max-w-sm animate-fade-in bg-rose-950/95 border-rose-500/30 text-rose-300"
        >
          <div className="flex gap-2.5 items-start">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 pr-2">
              <p className="font-extrabold uppercase text-[10px] tracking-wider text-rose-200">
                LIMIT REACHED
              </p>
              <p className="text-neutral-200 font-medium leading-relaxed">{limitNotification}</p>
            </div>
          </div>
          <button
            onClick={() => setLimitNotification(null)}
            className="text-rose-400 hover:text-white font-bold p-1 hover:bg-rose-900/40 rounded transition-all shrink-0 cursor-pointer text-[11px]"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* 5. AUTH MODAL OVERLAY */}
      {isAuthModalOpen && (
        <div 
          id="auth-modal-overlay" 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden text-neutral-200">
            {/* Header */}
            <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-amber-500" />
                <h3 className="font-black uppercase tracking-wider text-sm text-neutral-100">Simple Authentication</h3>
              </div>
              <button
                onClick={() => {
                  setIsAuthModalOpen(false);
                  setAuthError('');
                }}
                className="text-neutral-500 hover:text-neutral-300 font-black text-sm p-1.5 hover:bg-neutral-800 rounded-lg transition-all"
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleAuthSubmit} className="p-5 space-y-4">
              <p className="text-xs text-neutral-400 leading-relaxed">
                Log in with your Gmail address to access your private storage slot. Your saved work will be retained securely for exactly <strong className="text-amber-400">1 day (24 hours)</strong> and then auto-deleted.
              </p>

              {/* Alert info banner */}
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-3 text-[10.5px] text-amber-400/90 leading-relaxed space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-amber-400 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  Simple Credentials Rule:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-neutral-400">
                  <li>Email must end with <code className="text-amber-400 text-[10px] bg-amber-500/10 px-1 py-0.5 rounded font-mono">@gmail.com</code></li>
                  <li>Password: <code className="text-amber-400 text-[10px] bg-amber-500/10 px-1 py-0.5 rounded font-mono">123456</code> or <code className="text-amber-400 text-[10px] bg-amber-500/10 px-1 py-0.5 rounded font-mono">password</code></li>
                </ul>
              </div>

              {authError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl p-3 text-xs font-semibold">
                  ⚠️ {authError}
                </div>
              )}

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-400 font-black uppercase tracking-wider block">Gmail Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-neutral-500" />
                  <input
                    type="email"
                    required
                    placeholder="yourname@gmail.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl py-2 pl-9 pr-4 text-xs font-medium text-white placeholder-neutral-600 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-400 font-black uppercase tracking-wider block">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-neutral-500" />
                  <input
                    type="password"
                    required
                    placeholder="••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-amber-500 rounded-xl py-2 pl-9 pr-4 text-xs font-medium text-white placeholder-neutral-600 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="w-full py-2.5 mt-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-neutral-950 font-black text-xs text-center transition-all uppercase cursor-pointer"
              >
                Log In & Sync
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. AD THEATER INTERACTIVE MODAL OVERLAY */}
      <AdTheaterModal isOpen={isAdTheaterOpen} onClose={() => setIsAdTheaterOpen(false)} />
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronLeft,
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
  Maximize2
} from 'lucide-react';
import { VectorObject, Bone, Layer, Pivot } from '../types';
import { distance, localToWorld, calculateBoundingBox } from '../utils/math';

interface RightPanelProps {
  selectedObject: VectorObject | null;
  updateObject: (id: string, updates: Partial<VectorObject>) => void;
  objects: { [id: string]: VectorObject };
  bones: Bone[];
  addBone: (bone: Bone) => void;
  deleteBone: (id: string) => void;
  updateBone: (id: string, updates: Partial<Bone>) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  smartPinnedIds: string[]; // List of object IDs pinned to Smart Controls
  toggleSmartPin: (id: string) => void;
}

export default function RightPanel({
  selectedObject,
  updateObject,
  objects,
  bones,
  addBone,
  deleteBone,
  updateBone,
  open,
  setOpen,
  smartPinnedIds,
  toggleSmartPin,
}: RightPanelProps) {
  // Batch/Smart Controls check state
  const [smartCheckedIds, setSmartCheckedIds] = useState<{ [id: string]: boolean }>({});
  
  // Opposite Controls State
  const [oppositeSection1, setOppositeSection1] = useState<string[]>([]);
  const [oppositeSection2, setOppositeSection2] = useState<string[]>([]);
  const [oppositeMode, setOppositeMode] = useState<'rotation' | 'moveX' | 'moveY'>('rotation');

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
    const transformUpdate = { ...selectedObject.transform, [property]: nextVal };
    updateObject(selectedObject.id, { transform: transformUpdate });

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

    const transformUpdate = { ...selectedObject.transform, [property]: value };
    updateObject(selectedObject.id, { transform: transformUpdate });

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
                {/* Object Metadata & Style */}
                <div className="space-y-3 bg-neutral-950/40 p-3.5 rounded-2xl border border-neutral-800/50">
                  <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider block font-black">
                    Style & Metadata
                  </div>
                  <div className="flex items-center justify-between gap-3">
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

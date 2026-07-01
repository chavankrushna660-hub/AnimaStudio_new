import React, { useState } from 'react';
import { 
  Folder, 
  ChevronRight, 
  ChevronDown, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  FolderPlus, 
  Link, 
  Unlink, 
  Trash2, 
  Maximize2,
  ChevronLeft,
  Image as ImageIcon,
  Type as TextIcon,
  Sparkles,
  Layers as LayerIcon
} from 'lucide-react';
import { VectorObject, Layer } from '../types';

interface LeftPanelProps {
  objects: { [id: string]: VectorObject };
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
  updateObject: (id: string, updates: Partial<VectorObject>) => void;
  deleteObject: (id: string) => void;
  layers: Layer[];
  activeLayerId: string;
  setActiveLayerId: (id: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  groupObjects: (ids: string[]) => void;
}

export default function LeftPanel({
  objects,
  selectedObjectId,
  setSelectedObjectId,
  updateObject,
  deleteObject,
  layers,
  activeLayerId,
  setActiveLayerId,
  open,
  setOpen,
  groupObjects,
}: LeftPanelProps) {
  const [expandedNodes, setExpandedNodes] = useState<{ [id: string]: boolean }>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenamingText] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Toggle node expansion
  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Start inline renaming
  const startRename = (obj: VectorObject, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(obj.id);
    setRenamingText(obj.name);
  };

  const handleRenameSave = (id: string) => {
    if (renameText.trim()) {
      updateObject(id, { name: renameText.trim() });
    }
    setRenamingId(null);
  };

  // Visibility toggle
  const toggleVisibility = (obj: VectorObject, e: React.MouseEvent) => {
    e.stopPropagation();
    updateObject(obj.id, { isHidden: !obj.isHidden });
  };

  // Lock toggle
  const toggleLock = (obj: VectorObject, e: React.MouseEvent) => {
    e.stopPropagation();
    updateObject(obj.id, { isLocked: !obj.isLocked });
  };

  // Drag and Drop Parenting
  const handleDragStart = (id: string, e: React.DragEvent) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetParentId: string | null, e: React.DragEvent) => {
    e.preventDefault();
    const childId = e.dataTransfer.getData('text/plain') || draggedId;
    if (!childId || childId === targetParentId) return;

    // Detect Circular reference
    if (targetParentId) {
      let current = objects[targetParentId];
      while (current && current.parentId) {
        if (current.parentId === childId) {
          alert("Circular parent relationship not allowed!");
          return;
        }
        current = objects[current.parentId];
      }
    }

    // Set new parent
    const child = objects[childId];
    const oldParentId = child.parentId;

    // Remove child from old parent's children list
    if (oldParentId) {
      const oldParent = objects[oldParentId];
      updateObject(oldParentId, {
        childrenIds: oldParent.childrenIds.filter(id => id !== childId)
      });
    }

    // Add child to new parent's children list
    if (targetParentId) {
      const targetParent = objects[targetParentId];
      updateObject(targetParentId, {
        childrenIds: [...targetParent.childrenIds, childId]
      });
    }

    // Update child's parent pointer
    updateObject(childId, { parentId: targetParentId });
    setDraggedId(null);
  };

  // Group all selected objects
  const handleGroupSelected = () => {
    if (selectedObjectId) {
      groupObjects([selectedObjectId]);
    }
  };

  // Render object item recursively for hierarchy representation
  const renderTreeItem = (obj: VectorObject, depth: number) => {
    const hasChildren = obj.childrenIds.length > 0;
    const isExpanded = !!expandedNodes[obj.id];
    const isSelected = selectedObjectId === obj.id;

    return (
      <div key={obj.id} className="flex flex-col">
        <div
          draggable
          onDragStart={(e) => handleDragStart(obj.id, e)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(obj.id, e)}
          onClick={() => setSelectedObjectId(obj.id)}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`flex items-center justify-between py-1.5 px-2 rounded-xl group/item transition-colors select-none cursor-pointer ${
            isSelected 
              ? 'bg-amber-500/15 border border-amber-400/30 text-amber-300' 
              : 'border border-transparent hover:bg-neutral-800/50 text-neutral-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Collapse Arrow */}
            {hasChildren ? (
              <button
                onClick={(e) => toggleExpand(obj.id, e)}
                className="p-0.5 rounded hover:bg-neutral-700 text-neutral-400"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <div className="w-4.5"></div>
            )}

            {/* Type Icon */}
            {obj.type === 'image' ? (
              <ImageIcon className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            ) : obj.type === 'text' ? (
              <TextIcon className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            )}

            {/* Editable Name */}
            {renamingId === obj.id ? (
              <input
                type="text"
                value={renameText}
                onChange={(e) => setRenamingText(e.target.value)}
                onBlur={() => handleRenameSave(obj.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleRenameSave(obj.id)}
                autoFocus
                className="bg-neutral-950 text-white border border-amber-500 text-xs px-1 py-0.5 rounded outline-none w-28 font-bold"
              />
            ) : (
              <span 
                onDoubleClick={(e) => startRename(obj, e)}
                className="text-xs truncate font-bold group-hover/item:text-white transition-colors"
                title="Double click to rename"
              >
                {obj.name}
              </span>
            )}
          </div>

          {/* Quick Item Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
            <button
              onClick={(e) => toggleVisibility(obj, e)}
              className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white"
              title="Show/Hide drawing"
            >
              {obj.isHidden ? <EyeOff className="w-3.5 h-3.5 text-rose-400" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={(e) => toggleLock(obj, e)}
              className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-white"
              title="Lock/Unlock positions"
            >
              {obj.isLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteObject(obj.id);
              }}
              className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-rose-400"
              title="Delete node"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Render child elements if expanded */}
        {hasChildren && isExpanded && (
          <div className="flex flex-col">
            {obj.childrenIds.map(childId => objects[childId] && renderTreeItem(objects[childId], depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Find root-level elements for initial rendering tree pass
  const rootObjects = Object.values(objects).filter(o => !o.parentId);

  return (
    <div
      className={`relative h-full transition-all duration-200 shrink-0 z-30 ${
        open ? 'w-64' : 'w-0'
      }`}
    >
      {/* Slider Open Close Handle Button */}
      <button
        onClick={() => setOpen(!open)}
        className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-16 bg-neutral-800 hover:bg-amber-500 border-y border-r border-neutral-700 hover:border-amber-400 rounded-r-lg flex items-center justify-center text-neutral-400 hover:text-neutral-950 transition-all cursor-pointer z-50 shadow-lg shadow-black/20"
      >
        {open ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      <div className={`w-full h-full bg-neutral-900/90 border-r border-neutral-800 flex flex-col overflow-hidden ${
        open ? 'w-64' : 'w-0 border-r-0'
      }`}>
        {open && (
        <>
          {/* Header */}
          <div className="h-14 border-b border-neutral-800 flex items-center justify-between px-3 shrink-0 select-none">
            <span className="text-xs uppercase tracking-widest font-black text-neutral-400 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-amber-400" />
              HIERARCHY TREE
            </span>
            <button
              onClick={handleGroupSelected}
              disabled={!selectedObjectId}
              className={`p-1.5 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all ${
                !selectedObjectId ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              title="Add Selected to Group"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          {/* Root-Level Drag-Drop Landing Box */}
          <div 
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(null, e)}
            className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin select-none"
          >
            {/* Tree Section */}
            <div className="space-y-1">
              <div className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider mb-2">
                Drawings and Groups
              </div>
              {rootObjects.length === 0 ? (
                <div className="text-center py-8 text-xs text-neutral-600 font-bold border border-dashed border-neutral-800/80 rounded-2xl p-4">
                  Draw or upload PNG to begin. Drag items to parent them recursively!
                </div>
              ) : (
                rootObjects.map(obj => renderTreeItem(obj, 0))
              )}
            </div>

            {/* Layer Panel Section */}
            <div className="border-t border-neutral-800/60 pt-4 mt-4 space-y-2">
              <div className="text-[10px] text-neutral-500 font-extrabold uppercase tracking-wider flex items-center gap-1">
                <LayerIcon className="w-3.5 h-3.5 text-amber-500" />
                Active Layers
              </div>
              <div className="space-y-1.5">
                {layers.map((layer) => {
                  const isActive = activeLayerId === layer.id;
                  return (
                    <div
                      key={layer.id}
                      onClick={() => setActiveLayerId(layer.id)}
                      className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                        isActive
                          ? 'bg-amber-500/10 border-amber-400 text-amber-300 font-black'
                          : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/60 text-neutral-400'
                      }`}
                    >
                      <span className="truncate">{layer.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-600 font-black">Z:{layer.zIndex}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}

import React from 'react';
import { 
  Pointer, 
  Paintbrush, 
  Trash2, 
  Scissors, 
  PenTool, 
  MapPin, 
  CircleDot, 
  GitFork, 
  Layers, 
  Maximize2, 
  Minimize2, 
  Crop, 
  Compass, 
  Pipette, 
  Palette, 
  Zap, 
  GitCommit,
  LayoutGrid,
  Sparkles
} from 'lucide-react';

interface ToolbarProps {
  activeTool: string;
  setActiveTool: (tool: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export default function Toolbar({
  activeTool,
  setActiveTool,
  collapsed,
  setCollapsed,
}: ToolbarProps) {
  const tools = [
    { id: 'SEL', label: 'Select (SEL)', icon: PointerIcon, desc: 'Select / transform drawings' },
    { id: 'PEN', label: 'Vector Pen (PEN)', icon: FeatherIcon, desc: 'Draw precise bezier curve paths' },
    { id: 'BRS', name: 'Brush', label: 'Brush Tool (BRS)', icon: PaintbrushIcon },
    { id: 'ERS', name: 'Eraser', label: 'Eraser Tool (ERS)', icon: EraserIcon },
    { id: 'PVT', name: 'Pivot', label: 'Pivot Tool (PVT)', icon: AnchorIcon },
    { id: 'BON', name: 'Bone', label: 'Bone Tool (BON)', icon: BoneIcon },
    { id: "KNF", name: "Knife", label: "Knife Tool (KNF)", icon: ScissorsIcon },
    { id: "PIN", name: "Puppet Pin", label: "Puppet Pin (PIN)", icon: PinIcon },
    { id: 'FIL', name: 'Fill', label: 'Fill Bucket (FIL)', icon: PaintBucketIcon },
    { id: 'LSO', name: 'Lasso Fill', label: 'Lasso Color Fill (LSO)', icon: SparklesIcon, desc: 'Draw a lasso region to color/fill specific sub-areas' },
    { id: 'SHP', name: 'Shape', label: 'Shapes Tool (SHP)', icon: ShapesIcon },
    { id: 'MSH', name: 'Mesh Wrap', label: 'Geometry Deform (MSH)', icon: CropIcon, desc: 'Deform drawing geometry by dragging individual vertices deeply' },
    { id: 'CON', name: 'Constraint', label: 'Constraints (CON)', icon: AlignCenterIcon },
    { id: 'MOT', name: 'Motion Path', label: 'Motion Path (MOT)', icon: TrendingUpIcon },
    { id: 'EYE', name: 'Eyedropper', label: 'Eyedropper (EYE)', icon: EyedropperIcon },
  ];

  return (
    <div
      className={`bg-neutral-900 border-r border-neutral-800 flex flex-col h-full transition-all duration-200 ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Brand Header */}
      <div className="h-14 border-b border-neutral-800 flex items-center justify-between px-3 shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors ml-auto"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Tools List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin select-none">
        {tools.map((t) => {
          const isActive = activeTool === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTool(t.id)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all relative group text-left ${
                isActive
                  ? 'bg-amber-500/20 border border-amber-400/40 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.15)] font-black'
                  : 'border border-transparent text-neutral-400 hover:text-white hover:bg-neutral-800/60 font-semibold'
              }`}
              title={t.label}
            >
              <div className={`shrink-0 ${isActive ? 'scale-110' : ''} transition-transform`}>
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-neutral-400 group-hover:text-white'}`} />
              </div>
              {!collapsed && (
                <div className="overflow-hidden truncate">
                  <span className="text-xs uppercase tracking-wider block font-bold leading-tight">
                    {t.id}
                  </span>
                  <span className="text-[10px] text-neutral-500 font-semibold block leading-none truncate group-hover:text-neutral-400 transition-colors">
                    {t.name || t.label.split('(')[0].trim()}
                  </span>
                </div>
              )}

              {/* Collapsed Tooltip Overlay */}
              {collapsed && (
                <div className="absolute left-16 bg-neutral-950 border border-neutral-800 text-white text-[11px] font-bold px-3 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl shadow-black/50">
                  <div className="text-amber-400 font-black">{t.label}</div>
                  <div className="text-neutral-400 text-[10px] font-medium mt-0.5">{t.desc}</div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Wrapper local components with correct typing for simpler implementation
function PointerIcon(props: any) { return <Pointer {...props} /> }
function PaintbrushIcon(props: any) { return <Paintbrush {...props} /> }
function ScissorsIcon(props: any) { return <Scissors {...props} /> }
function FeatherIcon(props: any) { return <PenTool {...props} /> }
function PinIcon(props: any) { return <MapPin {...props} /> }
function AnchorIcon(props: any) { return <CircleDot {...props} /> }
function BoneIcon(props: any) { return <GitFork {...props} /> }
function PaintBucketIcon(props: any) { return <Palette {...props} /> }
function ShapesIcon(props: any) { return <LayoutGrid {...props} /> }
function CropIcon(props: any) { return <Crop {...props} /> }
function AlignCenterIcon(props: any) { return <GitCommit {...props} /> }
function TrendingUpIcon(props: any) { return <Compass {...props} /> }
function EyedropperIcon(props: any) { return <Pipette {...props} /> }
function EraserIcon(props: any) { return <Trash2 {...props} /> }
function SparklesIcon(props: any) { return <Sparkles {...props} /> }

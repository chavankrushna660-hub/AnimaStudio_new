export interface Point {
  x: number;
  y: number;
}

export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width?: number;
  height?: number;
  opacity?: number;
  skewX?: number;
  skewY?: number;
  rotateX?: number;
  rotateY?: number;
  perspective?: number;
}

export interface Pivot {
  id: string;
  name: string;
  localX: number;
  localY: number;
  locked: boolean;
  isActive?: boolean;
  currentLocalX?: number;
  currentLocalY?: number;
}

export interface Bone {
  id: string;
  name: string;
  startObjectId: string;
  endObjectId: string;
  startLocalX: number;
  startLocalY: number;
  endLocalX: number;
  endLocalY: number;
  lockedDistance: number;
  allowDetach: boolean;
  minAngle: number;
  maxAngle: number;
  enableConstraints: boolean;
  currentAngle?: number;
  color?: string;
  thickness?: number;
}

export interface MeshPoint {
  id: string;
  originalX: number;
  originalY: number;
  currentX: number;
  currentY: number;
  pinned: boolean;
  pinType: 'fixed' | 'semi-fixed' | 'free' | null;
}

export interface MeshState {
  active: boolean;
  densityX: number;
  densityY: number;
  points: MeshPoint[];
  originalPoints: MeshPoint[];
  pointSize: number;
  showGrid: boolean;
  showPoints: boolean;
  previewMode: boolean;
}

export interface ObjectShadow {
  enabled: boolean;
  blur: number;
  offsetX: number;
  offsetY: number;
  color: string;
  opacity: number;
}

export interface ObjectInnerShadow {
  enabled: boolean;
  angle: number;
  distance: number;
  size: number;
  opacity: number;
  color?: string;
  blur?: number;
}

export interface ObjectRimLight {
  enabled: boolean;
  color: string;
  thickness: number;
  softness: number;
  position: 'inner' | 'outer';
}

export interface ObjectOverlay {
  enabled: boolean;
  color: string;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
}

export interface VectorObject {
  id: string;
  name: string;
  type: 'stroke' | 'shape' | 'image' | 'text';
  points: Point[]; // Boundary points or stroke path
  shapeType?: 'circle' | 'rectangle' | 'triangle' | 'star' | 'line';
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  opacity: number;
  transform: Transform;
  pivots: Pivot[];
  pins?: Pivot[]; // Puppet pins for deformation
  subPaths?: Point[][]; // Sub-paths for multi-step detailed drawings
  parentId: string | null;
  childrenIds: string[];
  layerId: string;
  imageUrl?: string; // If image type
  text?: string; // If text type
  fontSize?: number;
  fontFamily?: string;
  isLocked: boolean;
  isHidden: boolean;
  keepAttachedTo?: string | null; // Drawing ID to keep permanently attached
  attachedGroupId?: string; // Group ID for permanent relative move linking
  lassoFills?: { localLassoPoints: Point[], color: string }[]; // Sub-areas colored via lasso tool
  zIndex?: number; // Sorting order within the layer
  shadow?: ObjectShadow;
  innerShadow?: ObjectInnerShadow;
  rimLight?: ObjectRimLight;
  overlay?: ObjectOverlay;
  meshState?: MeshState;
}

export interface Layer {
  id: string;
  name: string;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay';
}

export interface FrameObjectState {
  transform: Transform;
  fillColor?: string;
  strokeColor?: string;
  opacity?: number;
  pivots?: Pivot[];
  pins?: Pivot[];
}

export interface Frame {
  index: number;
  objects: { [objectId: string]: FrameObjectState };
  boneAngles?: { [boneId: string]: number };
}

export interface LoopRule {
  id: string;
  name: string;
  targetVariable: string;
  action: 'add' | 'multiply';
  amountPerStep: number;
  direction: 'clockwise' | 'counter-clockwise' | 'positive' | 'negative';
  stopCondition: {
    type: 'after_n_steps' | 'when_loop_completes';
    steps?: number;
    triggerLoopId?: string;
    triggerCount?: number;
  };
  framesPerStep: number;
  oscillate?: boolean;
  minValue?: number;
  maxValue?: number;
}

export interface Variable {
  id: string;
  name: string;
  linkedObjectId: string;
  property: 'rotation' | 'x' | 'y' | 'scaleX' | 'scaleY' | 'opacity';
  currentValue: number;
}

export interface Project {
  id: string;
  name: string;
  canvasSize: { w: number; h: number };
  fps: number;
  layers: Layer[];
  objects: { [id: string]: VectorObject };
  frames: Frame[];
  bones: Bone[];
}

export interface Point {
  x: number;
  y: number;
  t?: number;
  w?: number;
  angle?: number;
  jitterX?: number;
  jitterY?: number;
  grainOpacity?: number;
}

export interface RealismSettings {
  autoTaperEnabled: boolean;
  minThickness: number;
  maxThickness: number;
  thinningFactor: number;
  autoShadingEnabled: boolean;
  shadingLightAngle: number; // degrees (e.g. 45 from top-left)
  shadingHighlightOpacity: number; // e.g. 0.2
  shadingShadowOpacity: number; // e.g. 0.3
  
  microJitterEnabled: boolean;
  microJitterAmount: number; // max jitter pixels
  paperGrainEnabled: boolean;
  paperGrainIntensity: number; // e.g. 0.4
  inkBleedEnabled: boolean;
  inkBleedBlur: number; // e.g. 3
  inkBleedOpacity: number; // e.g. 0.3
  inkBleedWidthOffset: number; // e.g. 6
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
  cameraAngleX?: number;
  cameraAngleY?: number;
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

export interface View360 {
  id: string;
  name: string;
  angle: number; // 0 to 360
  drawingId: string; // The original drawing object ID
  drawingName?: string; // The original drawing name
  pivots?: Pivot[];
  bones?: Bone[];
}

export interface LassoDeformState {
  active: boolean; // Is lasso deformation active?
  lassoPoints: Point[]; // Lasso points in LOCAL coordinates of the object
  transform: Transform; // Transform applied exclusively to the vertices inside the lasso
}

export interface VectorObject {
  id: string;
  name: string;
  type: 'stroke' | 'shape' | 'image' | 'text' | '3d' | '360_container';
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
  shape3DType?: 'car' | 'character' | 'chair' | 'sphere' | 'box' | 'sword';
  transform3D?: {
    x: number; // 3D Translation X
    y: number; // 3D Translation Y
    z: number; // 3D Translation Z (Depth)
    rx: number; // Euler Rotation X (Pitch)
    ry: number; // Euler Rotation Y (Yaw)
    rz: number; // Euler Rotation Z (Roll)
    sx: number; // Scale X
    sy: number; // Scale Y
    sz: number; // Scale Z
  };
  vertices3D?: { x: number; y: number; z: number }[]; // Raw local 3D vertices
  faces3D?: { indices: number[]; fillColor: string; baseColor: string }[]; // Indexed polygonal faces
  bones3D?: { id: string; name: string; parentId?: string; rx: number; ry: number; rz: number; startVertexIdx: number; endVertexIdx: number }[]; // 3D Kinematics bones
  views360?: View360[];
  currentAngle360?: number;
  activeViewId360?: string;
  lockAngle360?: boolean;
  lassoDeformState?: LassoDeformState;
  lassoControlPoints?: LassoControlPoint[];
  originalPointsBackup?: Point[];
  originalSubPathsBackup?: Point[][];
}

export interface LassoControlPoint {
  id: string;
  originalX: number;
  originalY: number;
  currentX: number;
  currentY: number;
  pointIndex: number;
  subPathIndex?: number; // if it belongs to subPaths
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
  points?: Point[];
  subPaths?: Point[][];
  [key: string]: any;
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

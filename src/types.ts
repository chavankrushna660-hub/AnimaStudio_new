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

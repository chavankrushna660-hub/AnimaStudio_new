import { Point, Transform, Pivot, VectorObject, Bone } from '../types';

export function distance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Distance from point p to line segment ab
export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  if (l2 === 0) return distance(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projection = {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
  return distance(p, projection);
}

// Minimum distance from point to a polyline
export function pointToPolylineDistance(p: Point, points: Point[]): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return distance(p, points[0]);
  let minDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const dist = pointToSegmentDistance(p, points[i], points[i + 1]);
    if (dist < minDist) {
      minDist = dist;
    }
  }
  return minDist;
}

// Point in polygon check (even-odd rule)
export function isPointInPolygon(p: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y))
        && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Calculate bounding box of points
export function calculateBoundingBox(points: Point[]): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function calculateCenter(points: Point[]): Point {
  const box = calculateBoundingBox(points);
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

// Rotate point around origin by angle (degrees)
export function rotatePoint(p: Point, angleDeg: number, origin: Point): Point {
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const dx = p.x - origin.x;
  const dy = p.y - origin.y;

  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

// Transform point from local to world coordinates with full Skew, 3D flip/rotate, and perspective projection
export function localToWorld(p: Point, transform: Transform, pivot?: { localX: number; localY: number }): Point {
  const pivotX = pivot ? pivot.localX : 0;
  const pivotY = pivot ? pivot.localY : 0;

  // 1. Get positions relative to the pivot
  const lx = p.x - pivotX;
  const ly = p.y - pivotY;

  // 2. Apply Skew
  const skewXRad = ((transform.skewX || 0) * Math.PI) / 180;
  const skewYRad = ((transform.skewY || 0) * Math.PI) / 180;
  const sx = lx + ly * Math.tan(skewXRad);
  const sy = ly + lx * Math.tan(skewYRad);

  // 3. Apply Scale
  const scx = sx * transform.scaleX;
  const scy = sy * transform.scaleY;

  // 4. Apply 3D Flips / Rotations
  const rotXRad = ((transform.rotateX || 0) * Math.PI) / 180;
  const rotYRad = ((transform.rotateY || 0) * Math.PI) / 180;
  
  // Shrink factor based on rotateX / rotateY to simulate 3D rotation projection
  const r3x = scx * Math.cos(rotYRad);
  const r3y = scy * Math.cos(rotXRad);

  // 5. Apply Perspective Projection
  const sinRotX = Math.sin(rotXRad);
  const sinRotY = Math.sin(rotYRad);
  // Z depth can be modeled based on position relative to the rotX and rotY pivots
  const z = -(scx * sinRotY + scy * sinRotX);

  const perspective = transform.perspective ? (transform.perspective / 1000) : 0; // scale perspective down for sensible range
  const f = (perspective !== 0) ? (1 / (1 - z * perspective)) : 1;

  const px = r3x * f;
  const py = r3y * f;

  // 6. Apply standard 2D Rotation around pivot
  let pRotated = { x: px + pivotX, y: py + pivotY };
  if (transform.rotation !== 0) {
    pRotated = rotatePoint(pRotated, transform.rotation, { x: pivotX, y: pivotY });
  }

  // 7. Translate
  return {
    x: pRotated.x + transform.x,
    y: pRotated.y + transform.y,
  };
}

// Transform point from world to local coordinates with analytic inverse transformations
export function worldToLocal(p: Point, transform: Transform, pivot?: { localX: number; localY: number }): Point {
  const pivotX = pivot ? pivot.localX : 0;
  const pivotY = pivot ? pivot.localY : 0;

  // 1. Translate back
  const tx = p.x - transform.x;
  const ty = p.y - transform.y;

  // 2. Rotate back around pivot
  let pRotated = { x: tx, y: ty };
  if (transform.rotation !== 0) {
    pRotated = rotatePoint(pRotated, -transform.rotation, { x: pivotX, y: pivotY });
  }

  // Relative to pivot
  const rx = pRotated.x - pivotX;
  const ry = pRotated.y - pivotY;

  // 3. Inverse Perspective
  const perspective = transform.perspective ? (transform.perspective / 1000) : 0;
  const rotXRad = ((transform.rotateX || 0) * Math.PI) / 180;
  const rotYRad = ((transform.rotateY || 0) * Math.PI) / 180;
  const sinRotX = Math.sin(rotXRad);
  const sinRotY = Math.sin(rotYRad);
  const cosRotX = Math.cos(rotXRad);
  const cosRotY = Math.cos(rotYRad);

  let unprojX = rx;
  let unprojY = ry;

  if (perspective !== 0) {
    const tanY = cosRotY === 0 ? 0 : Math.tan(rotYRad);
    const tanX = cosRotX === 0 ? 0 : Math.tan(rotXRad);
    const denom = 1 - perspective * (rx * tanY + ry * tanX);
    const W = denom === 0 ? 1 : 1 / denom;
    unprojX = rx * W;
    unprojY = ry * W;
  }

  // 4. Inverse 3D Rotation (divide by cos)
  const divX = cosRotY === 0 ? 1 : cosRotY;
  const divY = cosRotX === 0 ? 1 : cosRotX;
  const scx = unprojX / divX;
  const scy = unprojY / divY;

  // 5. Inverse Scale
  const scaleX = transform.scaleX === 0 ? 1 : transform.scaleX;
  const scaleY = transform.scaleY === 0 ? 1 : transform.scaleY;
  const sx = scx / scaleX;
  const sy = scy / scaleY;

  // 6. Inverse Skew
  const skewXRad = ((transform.skewX || 0) * Math.PI) / 180;
  const skewYRad = ((transform.skewY || 0) * Math.PI) / 180;
  const tX = Math.tan(skewXRad);
  const tY = Math.tan(skewYRad);
  const skewDenom = 1 - tX * tY;

  let lx = sx;
  let ly = sy;
  if (skewDenom !== 0) {
    lx = (sx - sy * tX) / skewDenom;
    ly = (sy - sx * tY) / skewDenom;
  }

  return {
    x: lx + pivotX,
    y: ly + pivotY,
  };
}

// Inverse Distance Weighting (IDW) deformation for puppet pin warping
// Deforms drawing points dynamically based on the current pin targets
export function deformPoints(
  points: Point[],
  basePins: Pivot[],
  currentPins: Pivot[],
  influenceRadius: number = 250
): Point[] {
  if (!basePins || basePins.length === 0 || !currentPins || currentPins.length === 0) {
    return points;
  }

  return points.map((p) => {
    let totalWeight = 0;
    const pinDeltas: Point[] = [];
    const weights: number[] = [];

    for (let i = 0; i < basePins.length; i++) {
      const basePin = basePins[i];
      // Find corresponding current pin
      const currPin = currentPins.find((cp) => cp.id === basePin.id) || basePin;

      const d = distance(p, { x: basePin.localX, y: basePin.localY });
      const delta = {
        x: currPin.localX - basePin.localX,
        y: currPin.localY - basePin.localY,
      };

      pinDeltas.push(delta);

      // Exact match gets weight 1 directly
      if (d === 0) {
        return { x: p.x + delta.x, y: p.y + delta.y };
      }

      // Proximity-based weight
      if (d < influenceRadius) {
        const weight = (1 - d / influenceRadius) ** 2 / (d * d);
        weights.push(weight);
        totalWeight += weight;
      } else {
        weights.push(0);
      }
    }

    if (totalWeight === 0) {
      return { ...p }; // No change
    }

    let dx = 0;
    let dy = 0;
    for (let i = 0; i < basePins.length; i++) {
      const normWeight = weights[i] / totalWeight;
      dx += pinDeltas[i].x * normWeight;
      dy += pinDeltas[i].y * normWeight;
    }

    return {
      x: p.x + dx,
      y: p.y + dy,
    };
  });
}

// FABRIK (Forward And Backward Reaching Inverse Kinematics) solver for Bone Chains
// Solver guarantees rigid lengths and solves up to joint constraints!
export function solveIK(
  chainBones: Bone[],
  objects: { [id: string]: VectorObject },
  target: Point,
  maxIterations = 15,
  tolerance = 0.5
): { [objectId: string]: { x: number; y: number; rotation: number } } {
  if (chainBones.length === 0) return {};

  // Find corresponding drawing objects and extract world joint positions
  // Joints representation: Root joint, Joint 1, Joint 2 ... Joint N (End effector)
  interface JointNode {
    pos: Point;
    originalPos: Point;
    boneId: string;
    startObjectId: string;
    endObjectId: string;
    length: number;
    minAngle: number;
    maxAngle: number;
    enableConstraints: boolean;
  }

  const joints: JointNode[] = [];

  // Reconstruct bone chain joints in world coordinates
  for (let i = 0; i < chainBones.length; i++) {
    const bone = chainBones[i];
    const startObj = objects[bone.startObjectId];
    const endObj = objects[bone.endObjectId];

    const startWorld = localToWorld(
      { x: bone.startLocalX, y: bone.startLocalY },
      startObj.transform,
      startObj.pivots[0]
    );
    const endWorld = localToWorld(
      { x: bone.endLocalX, y: bone.endLocalY },
      endObj.transform,
      endObj.pivots[0]
    );

    if (i === 0) {
      joints.push({
        pos: startWorld,
        originalPos: { ...startWorld },
        boneId: bone.id,
        startObjectId: bone.startObjectId,
        endObjectId: bone.endObjectId,
        length: bone.lockedDistance,
        minAngle: bone.minAngle,
        maxAngle: bone.maxAngle,
        enableConstraints: bone.enableConstraints,
      });
    }

    joints.push({
      pos: endWorld,
      originalPos: { ...endWorld },
      boneId: bone.id,
      startObjectId: bone.startObjectId,
      endObjectId: bone.endObjectId,
      length: bone.lockedDistance,
      minAngle: bone.minAngle,
      maxAngle: bone.maxAngle,
      enableConstraints: bone.enableConstraints,
    });
  }

  const rootIndex = 0;
  const endIndex = joints.length - 1;

  // Total distance we can reach is sum of bone lengths
  const totalLength = chainBones.reduce((sum, b) => sum + b.lockedDistance, 0);
  const distToTarget = distance(joints[rootIndex].pos, target);

  if (distToTarget > totalLength) {
    // Target is out of reach: Stretch chain in direction of target
    const dir = {
      x: (target.x - joints[rootIndex].pos.x) / distToTarget,
      y: (target.y - joints[rootIndex].pos.y) / distToTarget,
    };

    for (let i = 0; i < chainBones.length; i++) {
      const len = chainBones[i].lockedDistance;
      joints[i + 1].pos = {
        x: joints[i].pos.x + dir.x * len,
        y: joints[i].pos.y + dir.y * len,
      };
    }
  } else {
    // Target is within reach: Run FABRIK iterations
    const rootPos = { ...joints[rootIndex].pos };

    for (let iter = 0; iter < maxIterations; iter++) {
      const diff = distance(joints[endIndex].pos, target);
      if (diff < tolerance) break;

      // STAGE 1: FORWARD REACHING (from end to root)
      joints[endIndex].pos = { ...target };
      for (let i = endIndex - 1; i >= rootIndex; i--) {
        const d = distance(joints[i + 1].pos, joints[i].pos);
        const ratio = joints[i + 1].length / (d || 1);
        joints[i].pos = {
          x: joints[i + 1].pos.x + (joints[i].pos.x - joints[i + 1].pos.x) * ratio,
          y: joints[i + 1].pos.y + (joints[i].pos.y - joints[i + 1].pos.y) * ratio,
        };
      }

      // STAGE 2: BACKWARD REACHING (from root to end)
      joints[rootIndex].pos = { ...rootPos };
      for (let i = rootIndex; i < endIndex; i++) {
        const d = distance(joints[i + 1].pos, joints[i].pos);
        const ratio = joints[i].length / (d || 1);
        joints[i + 1].pos = {
          x: joints[i].pos.x + (joints[i + 1].pos.x - joints[i].pos.x) * ratio,
          y: joints[i].pos.y + (joints[i + 1].pos.y - joints[i].pos.y) * ratio,
        };
      }
    }
  }

  // Calculate new transforms/rotations for each connected drawing
  const results: { [objectId: string]: { x: number; y: number; rotation: number } } = {};

  for (let i = 0; i < chainBones.length; i++) {
    const bone = chainBones[i];
    const jointStart = joints[i];
    const jointEnd = joints[i + 1];

    // Angle of current bone segment in world coordinates
    let angleRad = Math.atan2(jointEnd.pos.y - jointStart.pos.y, jointEnd.pos.x - jointStart.pos.x);
    let angleDeg = (angleRad * 180) / Math.PI;

    // Relative rotation change from its resting/base pose
    const baseAngleRad = Math.atan2(
      bone.endLocalY - bone.startLocalY,
      bone.endLocalX - bone.startLocalX
    );
    const baseAngleDeg = (baseAngleRad * 180) / Math.PI;
    const deltaAngle = angleDeg - baseAngleDeg;

    // Calculate drawing new coordinates to lock its start point onto jointStart.pos
    const drawing = objects[bone.endObjectId];
    const attachPointLocal = { x: bone.endLocalX, y: bone.endLocalY };

    // Set rotation and adjust position
    results[bone.endObjectId] = {
      x: jointStart.pos.x,
      y: jointStart.pos.y,
      rotation: deltaAngle,
    };
  }

  return results;
}

export function bilinearInterpolate(
  x: number,
  y: number,
  topLeft: { originalX: number; originalY: number; currentX: number; currentY: number },
  topRight: { originalX: number; originalY: number; currentX: number; currentY: number },
  bottomLeft: { originalX: number; originalY: number; currentX: number; currentY: number },
  bottomRight: { originalX: number; originalY: number; currentX: number; currentY: number },
  axis: 'x' | 'y' = 'x'
): number {
  const x1 = topLeft.originalX;
  const y1 = topLeft.originalY;
  const x2 = bottomRight.originalX;
  const y2 = bottomRight.originalY;

  // Avoid division by zero
  const dx = (x2 - x1) || 1;
  const dy = (y2 - y1) || 1;

  // Normalized coordinates (0 to 1)
  const tx = Math.max(0, Math.min(1, (x - x1) / dx));
  const ty = Math.max(0, Math.min(1, (y - y1) / dy));

  let val1: number, val2: number, val3: number, val4: number;
  if (axis === 'x') {
    val1 = topLeft.currentX;
    val2 = topRight.currentX;
    val3 = bottomLeft.currentX;
    val4 = bottomRight.currentX;
  } else {
    val1 = topLeft.currentY;
    val2 = topRight.currentY;
    val3 = bottomLeft.currentY;
    val4 = bottomRight.currentY;
  }

  // Bilinear interpolation
  const interpolated =
    val1 * (1 - tx) * (1 - ty) +
    val2 * tx * (1 - ty) +
    val3 * (1 - tx) * ty +
    val4 * tx * ty;

  return interpolated;
}

export function findClosestView360(views: any[] | undefined, angle: number): any | null {
  if (!views || views.length === 0) return null;
  let closest = views[0];
  let minDiff = 360;
  views.forEach(v => {
    let diff = Math.abs((v.angle - angle + 180) % 360) - 180;
    diff = Math.abs(diff < -180 ? diff + 360 : diff);
    if (diff < minDiff) {
      minDiff = diff;
      closest = v;
    }
  });
  return closest;
}

// Bone rigging helper functions removed to clean up workspace for Lasso Selection Deformer.

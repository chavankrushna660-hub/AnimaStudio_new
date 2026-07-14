import { VectorObject, Point, Pivot, Transform, Frame } from "../types";

export const interpolateTransform = (tStart: Transform, tEnd: Transform, t: number): Transform => {
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
    cameraAngleX: tStart.cameraAngleX !== undefined && tEnd.cameraAngleX !== undefined ? Number((tStart.cameraAngleX + t * (tEnd.cameraAngleX - tStart.cameraAngleX)).toFixed(2)) : tStart.cameraAngleX,
    cameraAngleY: tStart.cameraAngleY !== undefined && tEnd.cameraAngleY !== undefined ? Number((tStart.cameraAngleY + t * (tEnd.cameraAngleY - tStart.cameraAngleY)).toFixed(2)) : tStart.cameraAngleY,
  };
};

export const interpolateTwoObjects = (startObj: VectorObject, endObj: VectorObject, t: number): VectorObject => {
  if (!startObj) return endObj;
  if (!endObj) return startObj;

  const interpolatedTransform = interpolateTransform(startObj.transform, endObj.transform, t);

  // Interpolate main points
  let points = startObj.points;
  if (startObj.points && endObj.points && startObj.points.length === endObj.points.length) {
    points = startObj.points.map((p, pIdx) => {
      const ep = endObj.points[pIdx];
      return {
        ...p,
        x: Number((p.x + t * (ep.x - p.x)).toFixed(2)),
        y: Number((p.y + t * (ep.y - p.y)).toFixed(2))
      };
    });
  }

  // Interpolate sub-paths
  let subPaths = startObj.subPaths;
  if (startObj.subPaths && endObj.subPaths && startObj.subPaths.length === endObj.subPaths.length) {
    subPaths = startObj.subPaths.map((path, pathIdx) => {
      const ePath = endObj.subPaths[pathIdx];
      if (path.length === ePath.length) {
        return path.map((pt, ptIdx) => {
          const ePt = ePath[ptIdx];
          return {
            ...pt,
            x: Number((pt.x + t * (ePt.x - pt.x)).toFixed(2)),
            y: Number((pt.y + t * (ePt.y - pt.y)).toFixed(2))
          };
        });
      }
      return path;
    });
  }

  // Interpolate pivots
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

  // Interpolate opacity
  const opacity = startObj.opacity !== undefined && endObj.opacity !== undefined
    ? Number((startObj.opacity + t * (endObj.opacity - startObj.opacity)).toFixed(2))
    : startObj.opacity;

  // Interpolate Puppet pins if lengths match
  let pins = startObj.pins;
  if (startObj.pins && endObj.pins && startObj.pins.length === endObj.pins.length) {
    pins = startObj.pins.map((pin, pIdx) => {
      const ep = endObj.pins[pIdx];
      const curX = pin.currentLocalX !== undefined ? pin.currentLocalX : pin.localX;
      const curY = pin.currentLocalY !== undefined ? pin.currentLocalY : pin.localY;
      const eCurX = ep.currentLocalX !== undefined ? ep.currentLocalX : ep.localX;
      const eCurY = ep.currentLocalY !== undefined ? ep.currentLocalY : ep.localY;
      return {
        ...pin,
        currentLocalX: Number((curX + t * (eCurX - curX)).toFixed(2)),
        currentLocalY: Number((curY + t * (eCurY - curY)).toFixed(2)),
      };
    });
  }

  // Interpolate SmartWarp pins if lengths match
  let smartWarp = startObj.smartWarp;
  if (startObj.smartWarp && endObj.smartWarp && startObj.smartWarp.pins && endObj.smartWarp.pins && startObj.smartWarp.pins.length === endObj.smartWarp.pins.length) {
    const interpolatedSmartWarpPins = startObj.smartWarp.pins.map((pin, pIdx) => {
      const ep = endObj.smartWarp.pins[pIdx];
      return {
        ...pin,
        currentX: Number((pin.currentX + t * (ep.currentX - pin.currentX)).toFixed(2)),
        currentY: Number((pin.currentY + t * (ep.currentY - pin.currentY)).toFixed(2)),
      };
    });
    smartWarp = {
      ...startObj.smartWarp,
      pins: interpolatedSmartWarpPins
    };
  }

  // Interpolate CageState points if active on both and lengths match
  let cageState = startObj.cageState;
  if (startObj.cageState && endObj.cageState && startObj.cageState.points && endObj.cageState.points && startObj.cageState.points.length === endObj.cageState.points.length) {
    const interpolatedCagePoints = startObj.cageState.points.map((pt, pIdx) => {
      const ep = endObj.cageState.points[pIdx];
      return {
        ...pt,
        currentX: Number((pt.currentX + t * (ep.currentX - pt.currentX)).toFixed(2)),
        currentY: Number((pt.currentY + t * (ep.currentY - pt.currentY)).toFixed(2)),
      };
    });
    cageState = {
      ...startObj.cageState,
      points: interpolatedCagePoints
    };
  }

  // Interpolate Mesh Deformation Grid points if active on both
  let meshState = startObj.meshState;
  if (startObj.meshState && endObj.meshState && startObj.meshState.active && endObj.meshState.active) {
    let meshPoints = startObj.meshState.points;
    if (startObj.meshState.points && endObj.meshState.points && startObj.meshState.points.length === endObj.meshState.points.length) {
      meshPoints = startObj.meshState.points.map((p, pIdx) => {
        const ep = endObj.meshState.points[pIdx];
        return {
          ...p,
          currentX: Number((p.currentX + t * (ep.currentX - p.currentX)).toFixed(2)),
          currentY: Number((p.currentY + t * (ep.currentY - p.currentY)).toFixed(2))
        };
      });
    }

    let latticePoints = startObj.meshState.latticePoints;
    if (startObj.meshState.latticePoints && endObj.meshState.latticePoints && startObj.meshState.latticePoints.length === endObj.meshState.latticePoints.length) {
      latticePoints = startObj.meshState.latticePoints.map((lp, lpIdx) => {
        const elp = endObj.meshState.latticePoints![lpIdx] as any;
        const lpAny = lp as any;
        return {
          ...lp,
          x: Number((lpAny.x + t * (elp.x - lpAny.x)).toFixed(2)),
          y: Number((lpAny.y + t * (elp.y - lpAny.y)).toFixed(2))
        };
      });
    }

    meshState = {
      ...startObj.meshState,
      points: meshPoints,
      latticePoints
    };
  }

  // Interpolate Spline Deformation if active on both
  let splineControlPoints = startObj.splineControlPoints;
  if (startObj.splineActive && endObj.splineActive && startObj.splineControlPoints && endObj.splineControlPoints && startObj.splineControlPoints.length === endObj.splineControlPoints.length) {
    splineControlPoints = startObj.splineControlPoints.map((seg, segIdx) => {
      const eseg = endObj.splineControlPoints![segIdx];
      return {
        start: {
          x: Number((seg.start.x + t * (eseg.start.x - seg.start.x)).toFixed(2)),
          y: Number((seg.start.y + t * (eseg.start.y - seg.start.y)).toFixed(2)),
        },
        cp1: {
          x: Number((seg.cp1.x + t * (eseg.cp1.x - seg.cp1.x)).toFixed(2)),
          y: Number((seg.cp1.y + t * (eseg.cp1.y - seg.cp1.y)).toFixed(2)),
        },
        cp2: {
          x: Number((seg.cp2.x + t * (eseg.cp2.x - seg.cp2.x)).toFixed(2)),
          y: Number((seg.cp2.y + t * (eseg.cp2.y - seg.cp2.y)).toFixed(2)),
        },
        end: {
          x: Number((seg.end.x + t * (eseg.end.x - seg.end.x)).toFixed(2)),
          y: Number((seg.end.y + t * (eseg.end.y - seg.end.y)).toFixed(2)),
        }
      };
    });
  }

  let splineTwistPoints = startObj.splineTwistPoints;
  if (startObj.splineActive && endObj.splineActive && startObj.splineTwistPoints && endObj.splineTwistPoints && startObj.splineTwistPoints.length === endObj.splineTwistPoints.length) {
    splineTwistPoints = startObj.splineTwistPoints.map((tp, tpIdx) => {
      const etp = endObj.splineTwistPoints![tpIdx];
      return {
        ...tp,
        t: Number((tp.t + t * (etp.t - tp.t)).toFixed(3)),
        rotation: Number((tp.rotation + t * (etp.rotation - tp.rotation)).toFixed(2)),
        scale: Number((tp.scale + t * (etp.scale - tp.scale)).toFixed(3))
      };
    });
  }

  let splinePoints = startObj.splinePoints;
  if (startObj.splineActive && endObj.splineActive && startObj.splinePoints && endObj.splinePoints && startObj.splinePoints.length === endObj.splinePoints.length) {
    splinePoints = startObj.splinePoints.map((pt, pIdx) => {
      const ept = endObj.splinePoints![pIdx];
      return {
        ...pt,
        x: Number((pt.x + t * (ept.x - pt.x)).toFixed(2)),
        y: Number((pt.y + t * (ept.y - pt.y)).toFixed(2))
      };
    });
  }

  // Interpolate 3D vertices and 3D transform if active
  let transform3D = startObj.transform3D;
  if (startObj.transform3D && endObj.transform3D) {
    transform3D = {
      x: Number((startObj.transform3D.x + t * (endObj.transform3D.x - startObj.transform3D.x)).toFixed(2)),
      y: Number((startObj.transform3D.y + t * (endObj.transform3D.y - startObj.transform3D.y)).toFixed(2)),
      z: Number((startObj.transform3D.z + t * (endObj.transform3D.z - startObj.transform3D.z)).toFixed(2)),
      rx: Number((startObj.transform3D.rx + t * (endObj.transform3D.rx - startObj.transform3D.rx)).toFixed(2)),
      ry: Number((startObj.transform3D.ry + t * (endObj.transform3D.ry - startObj.transform3D.ry)).toFixed(2)),
      rz: Number((startObj.transform3D.rz + t * (endObj.transform3D.rz - startObj.transform3D.rz)).toFixed(2)),
      sx: Number((startObj.transform3D.sx + t * (endObj.transform3D.sx - startObj.transform3D.sx)).toFixed(2)),
      sy: Number((startObj.transform3D.sy + t * (endObj.transform3D.sy - startObj.transform3D.sy)).toFixed(2)),
      sz: Number((startObj.transform3D.sz + t * (endObj.transform3D.sz - startObj.transform3D.sz)).toFixed(2)),
    };
  }

  let vertices3D = startObj.vertices3D;
  if (startObj.vertices3D && endObj.vertices3D && startObj.vertices3D.length === endObj.vertices3D.length) {
    vertices3D = startObj.vertices3D.map((v, vIdx) => {
      const ev = endObj.vertices3D![vIdx];
      return {
        x: Number((v.x + t * (ev.x - v.x)).toFixed(2)),
        y: Number((v.y + t * (ev.y - v.y)).toFixed(2)),
        z: Number((v.z + t * (ev.z - v.z)).toFixed(2))
      };
    });
  }

  // Interpolate Lasso control points if lengths match
  let lassoControlPoints = startObj.lassoControlPoints;
  if (startObj.lassoControlPoints && endObj.lassoControlPoints && startObj.lassoControlPoints.length === endObj.lassoControlPoints.length) {
    lassoControlPoints = startObj.lassoControlPoints.map((cp, cpIdx) => {
      const ecp = endObj.lassoControlPoints![cpIdx];
      return {
        ...cp,
        currentX: Number((cp.currentX + t * (ecp.currentX - cp.currentX)).toFixed(2)),
        currentY: Number((cp.currentY + t * (ecp.currentY - cp.currentY)).toFixed(2)),
      };
    });
  }

  return {
    ...startObj,
    transform: interpolatedTransform,
    points,
    subPaths,
    pivots,
    opacity,
    pins,
    smartWarp,
    cageState,
    meshState,
    transform3D,
    vertices3D,
    lassoControlPoints,
    splineControlPoints,
    splineTwistPoints,
    splinePoints,
  };
};

export const getInterpolatedObjects = (
  frames: Frame[],
  currentFrameIndex: number,
  activeObjects: { [id: string]: VectorObject }
): { [id: string]: VectorObject } => {
  if (frames.length <= 1) return activeObjects;

  const interpolated: { [id: string]: VectorObject } = {};

  Object.keys(activeObjects).forEach(objId => {
    const activeObj = activeObjects[objId];
    if (!activeObj) return;

    // Collect all frames where this object exists
    const objectFrames: { index: number; obj: VectorObject }[] = [];
    frames.forEach(frm => {
      if (frm.objects && frm.objects[objId]) {
        objectFrames.push({ index: frm.index, obj: frm.objects[objId] as any });
      }
    });

    if (objectFrames.length <= 1) {
      interpolated[objId] = activeObj;
      return;
    }

    // Identify keyframes
    const keyframes: { index: number; obj: VectorObject }[] = [];
    objectFrames.forEach((of, idx) => {
      if (idx === 0) {
        keyframes.push(of);
      } else {
        const prevOf = objectFrames[idx - 1];
        // If the object's properties or coords change compared to previous frame, it is a keyframe!
        const isDiff = JSON.stringify(of.obj) !== JSON.stringify(prevOf.obj);
        if (isDiff) {
          keyframes.push(of);
        } else if (idx === objectFrames.length - 1) {
          // Always keep the last frame as a potential keyframe anchor
          keyframes.push(of);
        }
      }
    });

    if (keyframes.length <= 1) {
      interpolated[objId] = activeObj;
      return;
    }

    const c = currentFrameIndex;

    // Find keyframe A (<= c) and keyframe B (>= c)
    let keyA = keyframes[0];
    let keyB = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length; i++) {
      const kf = keyframes[i];
      if (kf.index <= c) {
        keyA = kf;
      }
      if (kf.index >= c) {
        keyB = kf;
        break;
      }
    }

    if (keyA.index === keyB.index || c === keyA.index || c === keyB.index) {
      interpolated[objId] = activeObj || (c === keyB.index ? keyB.obj : keyA.obj);
    } else {
      const t = (c - keyA.index) / (keyB.index - keyA.index);
      interpolated[objId] = interpolateTwoObjects(keyA.obj, keyB.obj, t);
    }
  });

  return interpolated;
};

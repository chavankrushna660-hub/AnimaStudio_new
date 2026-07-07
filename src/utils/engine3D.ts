// PURE OBJECT-BASED 2.5D PROXY SYSTEM & 3D PROJECTION ENGINE
import { Point } from '../types';

export interface Vertex3D {
  x: number;
  y: number;
  z: number;
}

export interface Face3D {
  indices: number[];
  fillColor: string;
  baseColor: string;
}

export interface Bone3D {
  id: string;
  name: string;
  rx: number;
  ry: number;
  rz: number;
  startVertexIdx: number;
  endVertexIdx: number;
}

/**
 * 3D Geometry Models Definition (Ultra-Smooth Low Poly Assets)
 */
export function generate3DGeometry(type: 'car' | 'character' | 'chair' | 'sphere' | 'box' | 'sword'): {
  vertices: Vertex3D[];
  faces: Face3D[];
  bones: Bone3D[];
} {
  const vertices: Vertex3D[] = [];
  const faces: Face3D[] = [];
  const bones: Bone3D[] = [];

  switch (type) {
    case 'box': {
      // 3D Wooden Crate / Cube (8 vertices, 6 faces)
      const size = 60;
      const h = size / 2;
      const rawVerts = [
        { x: -h, y: -h, z: -h }, // 0
        { x: h, y: -h, z: -h },  // 1
        { x: h, y: h, z: -h },   // 2
        { x: -h, y: h, z: -h },  // 3
        { x: -h, y: -h, z: h },  // 4
        { x: h, y: -h, z: h },   // 5
        { x: h, y: h, z: h },    // 6
        { x: -h, y: h, z: h },   // 7
      ];
      vertices.push(...rawVerts);

      const faceColors = [
        '#A1887F', // Back
        '#8D6E63', // Front
        '#795548', // Left
        '#6D4C41', // Right
        '#5D4037', // Bottom
        '#4E342E', // Top
      ];

      const rawFaces = [
        [0, 1, 2, 3], // Back
        [5, 4, 7, 6], // Front
        [4, 0, 3, 7], // Left
        [1, 5, 6, 2], // Right
        [4, 5, 1, 0], // Bottom
        [3, 2, 6, 7], // Top
      ];

      rawFaces.forEach((indices, i) => {
        faces.push({
          indices,
          fillColor: faceColors[i],
          baseColor: faceColors[i],
        });
      });
      break;
    }

    case 'chair': {
      // 3D Wooden Chair (Seat, backrest, and 4 legs)
      // Seat
      vertices.push(
        { x: -30, y: 10, z: -30 }, // 0
        { x: 30, y: 10, z: -30 },  // 1
        { x: 30, y: 10, z: 30 },   // 2
        { x: -30, y: 10, z: 30 },  // 3
        { x: -30, y: 0, z: -30 },  // 4
        { x: 30, y: 0, z: -30 },   // 5
        { x: 30, y: 0, z: 30 },    // 6
        { x: -30, y: 0, z: 30 }    // 7
      );
      // Backrest
      vertices.push(
        { x: -28, y: -45, z: -28 }, // 8
        { x: -28, y: -45, z: -20 }, // 9
        { x: 28, y: -45, z: -20 },  // 10
        { x: 28, y: -45, z: -28 },  // 11
        { x: -28, y: 0, z: -28 },   // 12
        { x: -28, y: 0, z: -20 },   // 13
        { x: 28, y: 0, z: -20 },    // 14
        { x: 28, y: 0, z: -28 }     // 15
      );
      // Legs (4 corners: BL, BR, FR, FL)
      // BL leg (vertex 16-19)
      vertices.push(
        { x: -26, y: 10, z: -26 }, { x: -20, y: 10, z: -26 }, { x: -20, y: 45, z: -26 }, { x: -26, y: 45, z: -26 },
        { x: 20, y: 10, z: -26 }, { x: 26, y: 10, z: -26 }, { x: 26, y: 45, z: -26 }, { x: 20, y: 45, z: -26 },
        { x: 20, y: 10, z: 20 }, { x: 26, y: 10, z: 20 }, { x: 26, y: 45, z: 20 }, { x: 20, y: 45, z: 20 },
        { x: -26, y: 10, z: 20 }, { x: -20, y: 10, z: 20 }, { x: -20, y: 45, z: 20 }, { x: -26, y: 45, z: 20 }
      );

      // Seat Faces
      faces.push(
        { indices: [0, 1, 2, 3], fillColor: '#B18A5E', baseColor: '#B18A5E' },
        { indices: [7, 6, 5, 4], fillColor: '#8F663C', baseColor: '#8F663C' },
        { indices: [4, 5, 1, 0], fillColor: '#A0784D', baseColor: '#A0784D' },
        { indices: [5, 6, 2, 1], fillColor: '#835B32', baseColor: '#835B32' },
        { indices: [6, 7, 3, 2], fillColor: '#A0784D', baseColor: '#A0784D' },
        { indices: [7, 4, 0, 3], fillColor: '#835B32', baseColor: '#835B32' }
      );
      // Backrest Faces
      faces.push(
        { indices: [8, 9, 13, 12], fillColor: '#A87D50', baseColor: '#A87D50' },
        { indices: [11, 8, 12, 15], fillColor: '#8D6236', baseColor: '#8D6236' },
        { indices: [10, 11, 15, 14], fillColor: '#A87D50', baseColor: '#A87D50' },
        { indices: [9, 10, 14, 13], fillColor: '#7B5127', baseColor: '#7B5127' }
      );
      // Legs Faces
      faces.push(
        { indices: [16, 17, 18, 19], fillColor: '#5C3A1A', baseColor: '#5C3A1A' },
        { indices: [20, 21, 22, 23], fillColor: '#5C3A1A', baseColor: '#5C3A1A' },
        { indices: [24, 25, 26, 27], fillColor: '#5C3A1A', baseColor: '#5C3A1A' },
        { indices: [28, 29, 30, 31], fillColor: '#5C3A1A', baseColor: '#5C3A1A' }
      );
      break;
    }

    case 'sword': {
      // 3D Medieval Sword (Blade, hilt, pommel, guard)
      // Tip (0)
      vertices.push({ x: 0, y: -70, z: 0 });
      // Blade edges (1 - 6)
      vertices.push(
        { x: -5, y: -45, z: 1.5 }, { x: 5, y: -45, z: 1.5 }, { x: 0, y: -45, z: 3.5 }, // 1, 2, 3
        { x: -6, y: 15, z: 1.5 }, { x: 6, y: 15, z: 1.5 }, { x: 0, y: 15, z: 3.5 },   // 4, 5, 6
        { x: -5, y: -45, z: -1.5 }, { x: 5, y: -45, z: -1.5 }, { x: 0, y: -45, z: -3.5 }, // 7, 8, 9
        { x: -6, y: 15, z: -1.5 }, { x: 6, y: 15, z: -1.5 }, { x: 0, y: 15, z: -3.5 }   // 10, 11, 12
      );
      // Guard (13 - 16)
      vertices.push(
        { x: -18, y: 15, z: 4 }, { x: 18, y: 15, z: 4 },
        { x: 18, y: 22, z: -4 }, { x: -18, y: 22, z: -4 }
      );
      // Hilt (17 - 20)
      vertices.push(
        { x: -3, y: 22, z: 3 }, { x: 3, y: 22, z: 3 },
        { x: 3, y: 48, z: -3 }, { x: -3, y: 48, z: -3 }
      );
      // Pommel (21)
      vertices.push({ x: 0, y: 55, z: 0 });

      // Blade faces (Polished silver/chrome steel)
      faces.push(
        { indices: [0, 1, 3], fillColor: '#CFD8DC', baseColor: '#CFD8DC' },
        { indices: [0, 3, 2], fillColor: '#ECEFF1', baseColor: '#ECEFF1' },
        { indices: [1, 4, 6, 3], fillColor: '#B0BEC5', baseColor: '#B0BEC5' },
        { indices: [3, 6, 5, 2], fillColor: '#ECEFF1', baseColor: '#ECEFF1' },
        { indices: [0, 7, 9], fillColor: '#90A4AE', baseColor: '#90A4AE' },
        { indices: [0, 9, 8], fillColor: '#B0BEC5', baseColor: '#B0BEC5' }
      );
      // Guard (Bright Gold / Brass)
      faces.push(
        { indices: [13, 14, 15, 16], fillColor: '#FFD54F', baseColor: '#FFD54F' }
      );
      // Grip (Leather bound brown)
      faces.push(
        { indices: [17, 18, 19, 20], fillColor: '#5D4037', baseColor: '#5D4037' }
      );
      break;
    }

    case 'sphere': {
      // Low Poly Geodesic Sphere / Planet (3D Icosahedron/UVSphere style)
      const r = 40;
      const rings = 5;
      const sectors = 8;

      for (let rG = 0; rG <= rings; rG++) {
        const phi = (Math.PI * rG) / rings;
        for (let sG = 0; sG < sectors; sG++) {
          const theta = (2 * Math.PI * sG) / sectors;
          const x = r * Math.sin(phi) * Math.cos(theta);
          const y = r * Math.cos(phi);
          const z = r * Math.sin(phi) * Math.sin(theta);
          vertices.push({ x, y, z });
        }
      }

      // Add faces between rings
      for (let rG = 0; rG < rings; rG++) {
        for (let sG = 0; sG < sectors; sG++) {
          const nextS = (sG + 1) % sectors;
          const i1 = rG * sectors + sG;
          const i2 = rG * sectors + nextS;
          const i3 = (rG + 1) * sectors + sG;
          const i4 = (rG + 1) * sectors + nextS;

          const color = rG % 2 === 0 ? '#42A5F5' : '#26A69A';
          faces.push(
            { indices: [i1, i2, i4], fillColor: color, baseColor: color },
            { indices: [i1, i4, i3], fillColor: color, baseColor: color }
          );
        }
      }
      break;
    }

    case 'character': {
      // 3D Humanoid Proxy (Head, Torso, Arms, Legs with proper pivot weighting)
      // Torso Center
      vertices.push(
        { x: -15, y: -25, z: -10 }, // 0
        { x: 15, y: -25, z: -10 },  // 1
        { x: 15, y: 15, z: -10 },   // 2
        { x: -15, y: 15, z: -10 },  // 3
        { x: -15, y: -25, z: 10 },  // 4
        { x: 15, y: -25, z: 10 },   // 5
        { x: 15, y: 15, z: 10 },    // 6
        { x: -15, y: 15, z: 10 }    // 7
      );
      // Head
      vertices.push(
        { x: -10, y: -45, z: -10 }, // 8
        { x: 10, y: -45, z: -10 },  // 9
        { x: 10, y: -25, z: -10 },  // 10
        { x: -10, y: -25, z: -10 }, // 11
        { x: -10, y: -45, z: 10 },  // 12
        { x: 10, y: -45, z: 10 },   // 13
        { x: 10, y: -25, z: 10 },   // 14
        { x: -10, y: -25, z: 10 }   // 15
      );
      // Left Arm (16 - 19)
      vertices.push(
        { x: -28, y: -20, z: -5 }, { x: -18, y: -20, z: -5 },
        { x: -18, y: 5, z: 5 }, { x: -28, y: 5, z: 5 }
      );
      // Right Arm (20 - 23)
      vertices.push(
        { x: 18, y: -20, z: -5 }, { x: 28, y: -20, z: -5 },
        { x: 28, y: 5, z: 5 }, { x: 18, y: 5, z: 5 }
      );
      // Left Leg (24 - 27)
      vertices.push(
        { x: -13, y: 15, z: -5 }, { x: -3, y: 15, z: -5 },
        { x: -3, y: 45, z: 5 }, { x: -13, y: 45, z: 5 }
      );
      // Right Leg (28 - 31)
      vertices.push(
        { x: 3, y: 15, z: -5 }, { x: 13, y: 15, z: -5 },
        { x: 13, y: 45, z: 5 }, { x: 3, y: 45, z: 5 }
      );

      // Torso Faces (Slate Navy)
      faces.push({ indices: [0, 1, 2, 3], fillColor: '#3F51B5', baseColor: '#3F51B5' });
      faces.push({ indices: [5, 4, 7, 6], fillColor: '#303F9F', baseColor: '#303F9F' });
      faces.push({ indices: [4, 0, 3, 7], fillColor: '#1A237E', baseColor: '#1A237E' });
      faces.push({ indices: [1, 5, 6, 2], fillColor: '#283593', baseColor: '#283593' });
      faces.push({ indices: [3, 2, 6, 7], fillColor: '#3949AB', baseColor: '#3949AB' });
      
      // Head Faces (Warm Skin Tone)
      faces.push({ indices: [8, 9, 10, 11], fillColor: '#FFCC80', baseColor: '#FFCC80' });
      faces.push({ indices: [13, 12, 15, 14], fillColor: '#FFA726', baseColor: '#FFA726' });
      faces.push({ indices: [12, 8, 11, 15], fillColor: '#FB8C00', baseColor: '#FB8C00' });
      faces.push({ indices: [9, 13, 14, 10], fillColor: '#F57C00', baseColor: '#F57C00' });

      // Arms & Legs Faces
      faces.push({ indices: [16, 17, 18, 19], fillColor: '#5C6BC0', baseColor: '#5C6BC0' });
      faces.push({ indices: [20, 21, 22, 23], fillColor: '#5C6BC0', baseColor: '#5C6BC0' });
      faces.push({ indices: [24, 25, 26, 27], fillColor: '#1565C0', baseColor: '#1565C0' });
      faces.push({ indices: [28, 29, 30, 31], fillColor: '#1565C0', baseColor: '#1565C0' });

      // Define 3D joint bones
      bones.push(
        { id: '3dbone_head', name: 'Neck_Joint', rx: 0, ry: 0, rz: 0, startVertexIdx: 3, endVertexIdx: 10 },
        { id: '3dbone_larm', name: 'LeftShoulder_Joint', rx: 0, ry: 0, rz: 0, startVertexIdx: 0, endVertexIdx: 18 },
        { id: '3dbone_rarm', name: 'RightShoulder_Joint', rx: 0, ry: 0, rz: 0, startVertexIdx: 1, endVertexIdx: 22 },
        { id: '3dbone_lleg', name: 'LeftHip_Joint', rx: 0, ry: 0, rz: 0, startVertexIdx: 3, endVertexIdx: 26 },
        { id: '3dbone_rleg', name: 'RightHip_Joint', rx: 0, ry: 0, rz: 0, startVertexIdx: 2, endVertexIdx: 30 }
      );
      break;
    }

    case 'car': {
      // 3D Sports Car Chassis and Wheels
      // Body hood, cab, trunk (0 - 11)
      vertices.push(
        { x: -35, y: 10, z: -15 }, { x: 35, y: 10, z: -15 }, // Front bumper lower (0, 1)
        { x: -35, y: 0, z: -10 },  { x: 35, y: 0, z: -10 },  // Front hood upper (2, 3)
        { x: -35, y: -8, z: 15 },  { x: 35, y: -8, z: 15 },  // Windshield roof peak (4, 5)
        { x: -35, y: 10, z: 25 },  { x: 35, y: 10, z: 25 },  // Rear bumper lower (6, 7)
        { x: -35, y: -2, z: 22 },  { x: 35, y: -2, z: 22 },  // Rear deck lid (8, 9)
        { x: -35, y: 5, z: 3 },    { x: 35, y: 5, z: 3 }     // Mid-door line (10, 11)
      );
      // Wheel BL (12 - 15)
      vertices.push(
        { x: -37, y: 10, z: -8 }, { x: -37, y: 16, z: -8 }, { x: -37, y: 16, z: -2 }, { x: -37, y: 10, z: -2 }
      );
      // Wheel BR (16 - 19)
      vertices.push(
        { x: 37, y: 10, z: -8 }, { x: 37, y: 16, z: -8 }, { x: 37, y: 16, z: -2 }, { x: 37, y: 10, z: -2 }
      );
      // Wheel FL (20 - 23)
      vertices.push(
        { x: -37, y: 10, z: 12 }, { x: -37, y: 16, z: 12 }, { x: -37, y: 16, z: 18 }, { x: -37, y: 10, z: 18 }
      );
      // Wheel FR (24 - 27)
      vertices.push(
        { x: 37, y: 10, z: 12 }, { x: 37, y: 16, z: 12 }, { x: 37, y: 16, z: 18 }, { x: 37, y: 10, z: 18 }
      );

      // Car Body Panels (Sporty Red)
      faces.push(
        { indices: [0, 1, 3, 2], fillColor: '#D32F2F', baseColor: '#D32F2F' }, // Hood
        { indices: [2, 3, 5, 4], fillColor: '#B71C1C', baseColor: '#B71C1C' }, // Windshield Glass
        { indices: [4, 5, 9, 8], fillColor: '#D32F2F', baseColor: '#D32F2F' }, // Roof
        { indices: [8, 9, 7, 6], fillColor: '#B71C1C', baseColor: '#B71C1C' }, // Rear Trunk
        { indices: [0, 2, 4, 10], fillColor: '#E53935', baseColor: '#E53935' }, // Left Side Front
        { indices: [1, 3, 5, 11], fillColor: '#C62828', baseColor: '#C62828' }  // Right Side Front
      );
      // Wheels (Dark grey)
      faces.push(
        { indices: [12, 13, 14, 15], fillColor: '#212121', baseColor: '#212121' },
        { indices: [16, 17, 18, 19], fillColor: '#212121', baseColor: '#212121' },
        { indices: [20, 21, 22, 23], fillColor: '#212121', baseColor: '#212121' },
        { indices: [24, 25, 26, 27], fillColor: '#212121', baseColor: '#212121' }
      );
      break;
    }
  }

  return { vertices, faces, bones };
}

/**
 * Applies 3D Euler Angles, translation, and scale rotations to a 3D vertex
 */
export function transform3DVertex(
  v: Vertex3D,
  tx: number, ty: number, tz: number,
  rx: number, ry: number, rz: number,
  sx: number, sy: number, sz: number
): Vertex3D {
  // Scale
  let x = v.x * sx;
  let y = v.y * sy;
  let z = v.z * sz;

  const radX = (rx * Math.PI) / 180;
  const radY = (ry * Math.PI) / 180;
  const radZ = (rz * Math.PI) / 180;

  // Rotation X (Pitch)
  if (rx !== 0) {
    const cosX = Math.cos(radX);
    const sinX = Math.sin(radX);
    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;
    y = y1;
    z = z1;
  }

  // Rotation Y (Yaw)
  if (ry !== 0) {
    const cosY = Math.cos(radY);
    const sinY = Math.sin(radY);
    const x2 = x * cosY + z * sinY;
    const z2 = -x * sinY + z * cosY;
    x = x2;
    z = z2;
  }

  // Rotation Z (Roll)
  if (rz !== 0) {
    const cosZ = Math.cos(radZ);
    const sinZ = Math.sin(radZ);
    const x3 = x * cosZ - y * sinZ;
    const y3 = x * sinZ + y * cosZ;
    x = x3;
    y = y3;
  }

  // Translate
  return {
    x: x + tx,
    y: y + ty,
    z: z + tz,
  };
}

/**
 * Calculates 3D distance from a point to a line segment
 */
export function distanceToSegment3D(p: Vertex3D, a: Vertex3D, b: Vertex3D): number {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abZ = b.z - a.z;
  
  const apX = p.x - a.x;
  const apY = p.y - a.y;
  const apZ = p.z - a.z;
  
  const ab2 = abX*abX + abY*abY + abZ*abZ;
  if (ab2 === 0) return Math.hypot(apX, apY, apZ);
  
  let t = (apX*abX + apY*abY + apZ*abZ) / ab2;
  t = Math.max(0, Math.min(1, t));
  
  const projX = a.x + t * abX;
  const projY = a.y + t * abY;
  const projZ = a.z + t * abZ;
  
  return Math.hypot(p.x - projX, p.y - projY, p.z - projZ);
}

/**
 * Rotates a 3D vertex around a specified joint origin
 */
export function rotateVertexAroundJoint(p: Vertex3D, joint: Vertex3D, rx: number, ry: number, rz: number): Vertex3D {
  let x = p.x - joint.x;
  let y = p.y - joint.y;
  let z = p.z - joint.z;
  
  const radX = (rx * Math.PI) / 180;
  const radY = (ry * Math.PI) / 180;
  const radZ = (rz * Math.PI) / 180;
  
  if (rx !== 0) {
    const cosX = Math.cos(radX);
    const sinX = Math.sin(radX);
    const y1 = y * cosX - z * sinX;
    const z1 = y * sinX + z * cosX;
    y = y1;
    z = z1;
  }
  
  if (ry !== 0) {
    const cosY = Math.cos(radY);
    const sinY = Math.sin(radY);
    const x2 = x * cosY + z * sinY;
    const z2 = -x * sinY + z * cosY;
    x = x2;
    z = z2;
  }
  
  if (rz !== 0) {
    const cosZ = Math.cos(radZ);
    const sinZ = Math.sin(radZ);
    const x3 = x * cosZ - y * sinZ;
    const y3 = x * sinZ + y * cosZ;
    x = x3;
    y = y3;
  }
  
  return {
    x: x + joint.x,
    y: y + joint.y,
    z: z + joint.z
  };
}

/**
 * Applies linear blend skinning skeletal deformation to a 3D model
 */
export function deformVertices3D(vertices: Vertex3D[], bones: Bone3D[]): Vertex3D[] {
  if (!bones || bones.length === 0) return vertices;
  
  return vertices.map((v, vIdx) => {
    const weights = bones.map((bone, bIdx) => {
      const a = vertices[bone.startVertexIdx];
      const b = vertices[bone.endVertexIdx];
      if (!a || !b) return { index: bIdx, weight: 0 };
      
      const dist = distanceToSegment3D(v, a, b);
      const w = 1.0 / (Math.pow(dist / 30.0, 3) + 1.0);
      return { index: bIdx, weight: w };
    });
    
    const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight === 0) return v;
    
    let finalX = 0;
    let finalY = 0;
    let finalZ = 0;
    
    weights.forEach(item => {
      const normW = item.weight / totalWeight;
      if (normW === 0) return;
      
      const bone = bones[item.index];
      const joint = vertices[bone.startVertexIdx];
      if (!joint) {
        finalX += v.x * normW;
        finalY += v.y * normW;
        finalZ += v.z * normW;
        return;
      }
      
      const rotated = rotateVertexAroundJoint(v, joint, bone.rx, bone.ry, bone.rz);
      finalX += rotated.x * normW;
      finalY += rotated.y * normW;
      finalZ += rotated.z * normW;
    });
    
    return { x: finalX, y: finalY, z: finalZ };
  });
}

/**
 * Projects a transformed 3D vertex onto 2D screen coordinate (Perspective Projection)
 */
export function project3DVertex(v: Vertex3D, cameraDistance: number = 400): Point {
  // Perspective formula: ScreenCoord = coord * (d / (d + Z))
  // We center the canvas around origin
  const fov = cameraDistance;
  const scale = fov / Math.max(1, fov + v.z);
  return {
    x: v.x * scale,
    y: v.y * scale,
  };
}

/**
 * Calculates a flat normal vectors and performs simple Lambertian diffuse shading
 */
export function getFaceLightColor(
  v0: Vertex3D, v1: Vertex3D, v2: Vertex3D,
  baseHexColor: string,
  lightAngleDeg: number = 45
): string {
  // Vector A = v1 - v0, Vector B = v2 - v0
  const ax = v1.x - v0.x;
  const ay = v1.y - v0.y;
  const az = v1.z - v0.z;

  const bx = v2.x - v0.x;
  const by = v2.y - v0.y;
  const bz = v2.z - v0.z;

  // Cross product
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;

  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;

  // Direction of key light source
  const rad = (lightAngleDeg * Math.PI) / 180;
  const lx = Math.cos(rad);
  const ly = -Math.sin(rad);
  const lz = -0.5; // Slightly from front

  const dot = nx * lx + ny * ly + nz * lz;
  // Ambient light factor
  const intensity = Math.max(0.2, Math.min(1.0, (dot + 1.0) / 2.0));

  // Convert hex color to rgb intensity
  const hex = baseHexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const finalR = Math.floor(r * intensity);
  const finalG = Math.floor(g * intensity);
  const finalB = Math.floor(b * intensity);

  return `rgb(${finalR}, ${finalG}, ${finalB})`;
}

/**
 * Check if a 2D point is inside a polygon of projected points
 */
export function isPointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;

    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 3D Model limitations to avoid over-rendering and memory exhaustion.
 */
export function getDailyLimitStatus(email: string): { count: number; allowed: boolean } {
  try {
    const dateStr = new Date().toDateString();
    const storageKey = `animastudio_3d_lim_${email.trim().toLowerCase()}_${dateStr}`;
    const current = Number(localStorage.getItem(storageKey) || '0');
    return {
      count: current,
      allowed: current < 5, // Strict rule: Max 5 3D models per day
    };
  } catch {
    return { count: 0, allowed: true };
  }
}

export function incrementDailyLimit(email: string) {
  try {
    const dateStr = new Date().toDateString();
    const storageKey = `animastudio_3d_lim_${email.trim().toLowerCase()}_${dateStr}`;
    const current = Number(localStorage.getItem(storageKey) || '0');
    localStorage.setItem(storageKey, String(current + 1));
  } catch (e) {
    console.error('Failed to update daily 3D counter', e);
  }
}

/**
 * Extrudes 2D vector drawing points to generate a real 3D solid wireframe geometry prism
 */
export function extrude2DTo3D(
  points: Point[],
  fillColor: string,
  strokeColor: string,
  depth: number = 40
): { vertices: Vertex3D[]; faces: Face3D[]; center: { x: number; y: number } } {
  const vertices: Vertex3D[] = [];
  const faces: Face3D[] = [];

  if (!points || points.length < 2) {
    // Fallback cube if no valid points
    return {
      vertices: [
        { x: -20, y: -20, z: -20 }, { x: 20, y: -20, z: -20 }, { x: 20, y: 20, z: -20 }, { x: -20, y: 20, z: -20 },
        { x: -20, y: -20, z: 20 }, { x: 20, y: -20, z: 20 }, { x: 20, y: 20, z: 20 }, { x: -20, y: 20, z: 20 }
      ],
      faces: [
        { indices: [0, 1, 2, 3], fillColor: '#F59E0B', baseColor: '#F59E0B' },
        { indices: [5, 4, 7, 6], fillColor: '#F59E0B', baseColor: '#F59E0B' },
        { indices: [0, 3, 7, 4], fillColor: '#D97706', baseColor: '#D97706' },
        { indices: [1, 5, 6, 2], fillColor: '#D97706', baseColor: '#D97706' },
        { indices: [3, 2, 6, 7], fillColor: '#B45309', baseColor: '#B45309' },
        { indices: [4, 5, 1, 0], fillColor: '#B45309', baseColor: '#B45309' }
      ],
      center: { x: 0, y: 0 }
    };
  }

  // Filter duplicate consecutive points to prevent degenerate geometry
  let cleanPts = points.filter((p, i) => {
    if (i === 0) return true;
    const prev = points[i - 1];
    return Math.hypot(p.x - prev.x, p.y - prev.y) > 0.5;
  });

  if (cleanPts.length < 2) {
    cleanPts = [{ x: -20, y: 0 }, { x: 20, y: 0 }];
  }

  // For 2 points, expand to a thin 2D rectangle to extrude as a solid slab
  if (cleanPts.length === 2) {
    const p1 = cleanPts[0];
    const p2 = cleanPts[1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * 10; // normal offset of 10px
    const ny = dx / len * 10;
    cleanPts = [
      { x: p1.x - nx, y: p1.y - ny },
      { x: p2.x - nx, y: p2.y - ny },
      { x: p2.x + nx, y: p2.y + ny },
      { x: p1.x + nx, y: p1.y + ny }
    ];
  }

  // Compute Centroid
  let sumX = 0;
  let sumY = 0;
  cleanPts.forEach(p => {
    sumX += p.x;
    sumY += p.y;
  });
  const cx = sumX / cleanPts.length;
  const cy = sumY / cleanPts.length;

  // Check if path is closed, if not close it
  const first = cleanPts[0];
  const last = cleanPts[cleanPts.length - 1];
  const isClosed = Math.hypot(last.x - first.x, last.y - first.y) < 5;
  if (!isClosed && cleanPts.length > 2) {
    cleanPts.push({ ...first });
  }

  const N = cleanPts.length;

  // Create 3D vertices
  // Front ring (at z = -depth / 2)
  for (let i = 0; i < N; i++) {
    vertices.push({
      x: cleanPts[i].x - cx,
      y: cleanPts[i].y - cy,
      z: -depth / 2
    });
  }

  // Back ring (at z = depth / 2)
  for (let i = 0; i < N; i++) {
    vertices.push({
      x: cleanPts[i].x - cx,
      y: cleanPts[i].y - cy,
      z: depth / 2
    });
  }

  // Define Colors (Aesthetic shading colors)
  const baseCol = fillColor && fillColor !== 'transparent' ? fillColor : (strokeColor && strokeColor !== 'transparent' ? strokeColor : '#F59E0B');
  const sideCol = baseCol; 
  
  // Front face
  const frontIndices = Array.from({ length: N }, (_, i) => i);
  faces.push({
    indices: frontIndices,
    fillColor: baseCol,
    baseColor: baseCol
  });

  // Back face (reverse orientation to face out)
  const backIndices = Array.from({ length: N }, (_, i) => (N - 1 - i) + N);
  faces.push({
    indices: backIndices,
    fillColor: baseCol,
    baseColor: baseCol
  });

  // Side quad faces connecting front and back loops
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    // quad connecting front_i, front_next, back_next, back_i
    faces.push({
      indices: [i, next, next + N, i + N],
      fillColor: sideCol,
      baseColor: sideCol
    });
  }

  return { vertices, faces, center: { x: cx, y: cy } };
}

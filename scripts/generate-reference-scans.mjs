/**
 * Generates realistic metric (meters, Y-up) textured binary .glb apartment scans:
 *   - public/models/apartment-move-in.glb           (clean room + pre-existing desk scratch)
 *   - public/models/apartment-move-out.glb          (same room in a different scan frame + carpet stain + wall scuffs)
 *   - public/models/apartment-move-in-tampered.glb  (exact copy of move-in with 1 byte flipped for /verify red check)
 *
 * Replace these with real Scaniverse/Polycam iPhone Pro LiDAR exports whenever ready.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// ---- Minimal pure-Node PNG encoder (RGBA, 8-bit) -----------------------------
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: None
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeTexture(width, height, pixelFn) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = pixelFn(x / width, y / height, x, y);
      const i = (y * width + x) * 4;
      rgba[i] = Math.max(0, Math.min(255, Math.round(r)));
      rgba[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      rgba[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
      rgba[i + 3] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }
  return encodePng(width, height, rgba);
}

// Deterministic pseudo-noise
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

// ---- Geometry builder (subdivided boxes & quads in metric coordinates) -------
function makeSubdividedPlane(origin, uVec, vVec, normal, segU, segV) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV;
    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU;
      positions.push(
        origin[0] + uVec[0] * u + vVec[0] * v,
        origin[1] + uVec[1] * u + vVec[1] * v,
        origin[2] + uVec[2] * u + vVec[2] * v,
      );
      normals.push(normal[0], normal[1], normal[2]);
      uvs.push(u, v);
    }
  }

  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  return { positions, normals, uvs, indices };
}

function makeBox(cx, cy, cz, sx, sy, sz, segs = 6) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const faces = [
    // +Y top
    makeSubdividedPlane([cx - hx, cy + hy, cz + hz], [sx, 0, 0], [0, 0, -sz], [0, 1, 0], segs, segs),
    // -Y bottom
    makeSubdividedPlane([cx - hx, cy - hy, cz - hz], [sx, 0, 0], [0, 0, sz], [0, -1, 0], 2, 2),
    // +Z front
    makeSubdividedPlane([cx - hx, cy - hy, cz + hz], [sx, 0, 0], [0, sy, 0], [0, 0, 1], segs, Math.max(2, Math.floor(segs / 2))),
    // -Z back
    makeSubdividedPlane([cx + hx, cy - hy, cz - hz], [-sx, 0, 0], [0, sy, 0], [0, 0, -1], segs, Math.max(2, Math.floor(segs / 2))),
    // +X right
    makeSubdividedPlane([cx + hx, cy - hy, cz + hz], [0, 0, -sz], [0, sy, 0], [1, 0, 0], Math.max(2, Math.floor(segs / 2)), Math.max(2, Math.floor(segs / 2))),
    // -X left
    makeSubdividedPlane([cx - hx, cy - hy, cz - hz], [0, 0, sz], [0, sy, 0], [-1, 0, 0], Math.max(2, Math.floor(segs / 2)), Math.max(2, Math.floor(segs / 2))),
  ];
  return mergeParts(faces);
}

function mergeParts(parts) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  let vOffset = 0;
  for (const p of parts) {
    for (let i = 0; i < p.positions.length; i++) positions.push(p.positions[i]);
    for (let i = 0; i < p.normals.length; i++) normals.push(p.normals[i]);
    for (let i = 0; i < p.uvs.length; i++) uvs.push(p.uvs[i]);
    for (let i = 0; i < p.indices.length; i++) indices.push(p.indices[i] + vOffset);
    vOffset += p.positions.length / 3;
  }
  return { positions, normals, uvs, indices };
}

function transformPart(part, mat4) {
  const m = mat4;
  // Normal transform: upper-left 3x3 inverse transpose (for uniform scale + rotation, normalized R)
  const positions = new Array(part.positions.length);
  const normals = new Array(part.normals.length);
  for (let i = 0; i < part.positions.length; i += 3) {
    const x = part.positions[i];
    const y = part.positions[i + 1];
    const z = part.positions[i + 2];
    positions[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    positions[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    positions[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];

    const nx = part.normals[i];
    const ny = part.normals[i + 1];
    const nz = part.normals[i + 2];
    const rnx = m[0] * nx + m[4] * ny + m[8] * nz;
    const rny = m[1] * nx + m[5] * ny + m[9] * nz;
    const rnz = m[2] * nx + m[6] * ny + m[10] * nz;
    const len = Math.hypot(rnx, rny, rnz) || 1;
    normals[i] = rnx / len;
    normals[i + 1] = rny / len;
    normals[i + 2] = rnz / len;
  }
  return { positions, normals, uvs: [...part.uvs], indices: [...part.indices] };
}

function makeRigidMatrix({ scale = 1, yawRad = 0, tx = 0, ty = 0, tz = 0 }) {
  const c = Math.cos(yawRad) * scale;
  const s = Math.sin(yawRad) * scale;
  // Column-major 4x4 (matches Three.js Matrix4)
  return [
    c, 0, -s, 0,
    0, scale, 0, 0,
    s, 0, c, 0,
    tx, ty, tz, 1,
  ];
}

// ---- Build textured GLB 2.0 binary ------------------------------------------
function buildGlb(meshes) {
  // meshes: [{ name, part, png, roughness, metallic }]
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const images = [];
  const textures = [];
  const materials = [];
  const gltfMeshes = [];
  const nodes = [];
  let byteOffset = 0;

  function pushBuffer(buf, target) {
    const pad = (4 - (byteOffset % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      byteOffset += pad;
    }
    const bvIndex = bufferViews.length;
    const bv = { buffer: 0, byteOffset, byteLength: buf.length };
    if (target) bv.target = target;
    bufferViews.push(bv);
    chunks.push(buf);
    byteOffset += buf.length;
    return bvIndex;
  }

  for (let i = 0; i < meshes.length; i++) {
    const { name, part, png, roughness = 0.85, metallic = 0.0 } = meshes[i];

    // Image + Texture + Material
    const imgBv = pushBuffer(png);
    const imgIdx = images.length;
    images.push({ bufferView: imgBv, mimeType: "image/png" });
    const texIdx = textures.length;
    textures.push({ sampler: 0, source: imgIdx });
    const matIdx = materials.length;
    materials.push({
      name: `${name}_mat`,
      pbrMetallicRoughness: {
        baseColorTexture: { index: texIdx },
        metallicFactor: metallic,
        roughnessFactor: roughness,
      },
      doubleSided: false,
    });

    // Positions + bounds
    const posArr = new Float32Array(part.positions);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < posArr.length; k += 3) {
      for (let a = 0; a < 3; a++) {
        if (posArr[k + a] < min[a]) min[a] = posArr[k + a];
        if (posArr[k + a] > max[a]) max[a] = posArr[k + a];
      }
    }
    const posBv = pushBuffer(Buffer.from(posArr.buffer), 34962);
    const posAcc = accessors.length;
    accessors.push({
      bufferView: posBv,
      componentType: 5126,
      count: posArr.length / 3,
      type: "VEC3",
      min,
      max,
    });

    const normArr = new Float32Array(part.normals);
    const normBv = pushBuffer(Buffer.from(normArr.buffer), 34962);
    const normAcc = accessors.length;
    accessors.push({
      bufferView: normBv,
      componentType: 5126,
      count: normArr.length / 3,
      type: "VEC3",
    });

    const uvArr = new Float32Array(part.uvs);
    const uvBv = pushBuffer(Buffer.from(uvArr.buffer), 34962);
    const uvAcc = accessors.length;
    accessors.push({
      bufferView: uvBv,
      componentType: 5126,
      count: uvArr.length / 2,
      type: "VEC2",
    });

    const idxArr = new Uint32Array(part.indices);
    const idxBv = pushBuffer(Buffer.from(idxArr.buffer), 34963);
    const idxAcc = accessors.length;
    accessors.push({
      bufferView: idxBv,
      componentType: 5125,
      count: idxArr.length,
      type: "SCALAR",
    });

    const meshIdx = gltfMeshes.length;
    gltfMeshes.push({
      name,
      primitives: [
        {
          attributes: { POSITION: posAcc, NORMAL: normAcc, TEXCOORD_0: uvAcc },
          indices: idxAcc,
          material: matIdx,
        },
      ],
    });
    nodes.push({ name, mesh: meshIdx });
  }

  const padBin = (4 - (byteOffset % 4)) % 4;
  if (padBin) {
    chunks.push(Buffer.alloc(padBin));
    byteOffset += padBin;
  }
  const binBuf = Buffer.concat(chunks);

  const gltf = {
    asset: { version: "2.0", generator: "Keyprint Reference Scan Builder" },
    scene: 0,
    scenes: [{ name: "ApartmentRoom", nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes: gltfMeshes,
    materials,
    textures,
    images,
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuf.length }],
  };

  let jsonBuf = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);

  const totalLen = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonBuf.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // "JSON"

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binBuf.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // "BIN\0"

  return Buffer.concat([header, jsonHeader, jsonBuf, binHeader, binBuf]);
}

function buildApartmentScene({ isMoveOut }) {
  // Room interior coordinates (meters, Y-up):
  //   X: 0 .. 4.0 (width), Y: 0 .. 2.6 (height), Z: 0 .. 3.4 (depth)
  //   Back wall at Z = 0, Left wall at X = 0, Right wall at X = 4.0, Floor at Y = 0
  const floorTex = makeTexture(256, 256, (u, v) => {
    const plank = Math.floor(v * 14);
    const seam = Math.abs((v * 14) % 1 - 0.5) > 0.47 ? -18 : 0;
    const grain = Math.sin((u * 40 + plank * 3.1) * Math.PI) * 6 + (hash2(u * 200, v * 200) - 0.5) * 10;
    return [186 + grain + seam, 152 + grain + seam, 118 + grain + seam];
  });

  const backWallTex = makeTexture(256, 256, (u, v) => {
    const n = (hash2(u * 180, v * 180) - 0.5) * 7;
    return [240 + n, 236 + n, 228 + n];
  });

  const leftWallTex = makeTexture(256, 256, (u, v) => {
    const n = (hash2(u * 180, v * 180) - 0.5) * 7;
    let r = 236 + n;
    let g = 232 + n;
    let b = 224 + n;
    // Shin-height scuffs on move-out along u in [0.45..0.72], v in [0.10..0.24]
    if (isMoveOut && u > 0.46 && u < 0.72 && v > 0.10 && v < 0.23) {
      const s1 = Math.exp(-Math.pow((v - (0.14 + (u - 0.46) * 0.12)) * 45, 2));
      const s2 = Math.exp(-Math.pow((v - (0.19 - (u - 0.52) * 0.08)) * 50, 2));
      const scuff = Math.min(1, (s1 * 0.7 + s2 * 0.6) * (0.7 + 0.3 * hash2(u * 90, v * 90)));
      r -= scuff * 95;
      g -= scuff * 98;
      b -= scuff * 102;
    }
    return [r, g, b];
  });

  const rugTex = makeTexture(256, 256, (u, v) => {
    const weave = ((Math.floor(u * 96) + Math.floor(v * 96)) % 2 === 0 ? 5 : -5) + (hash2(u * 120, v * 120) - 0.5) * 8;
    let r = 224 + weave;
    let g = 216 + weave;
    let b = 202 + weave;
    // Border stripe
    if (u < 0.06 || u > 0.94 || v < 0.06 || v > 0.94) {
      r -= 24;
      g -= 26;
      b -= 30;
    }
    // Move-out dark coffee/wine stain (~30 cm across) centered near (0.58, 0.55)
    if (isMoveOut) {
      const dx = (u - 0.58) * 1.15;
      const dy = (v - 0.55) * 1.0;
      const dist = Math.hypot(dx, dy);
      const lobe = Math.hypot((u - 0.65) * 1.6, (v - 0.49) * 1.6);
      const mask = Math.max(
        Math.exp(-Math.pow(dist / 0.13, 3.0)),
        0.85 * Math.exp(-Math.pow(lobe / 0.09, 2.6)),
      );
      if (mask > 0.04) {
        r = r * (1 - mask) + 64 * mask;
        g = g * (1 - mask) + 38 * mask;
        b = b * (1 - mask) + 28 * mask;
      }
    }
    return [r, g, b];
  });

  const deskTex = makeTexture(256, 256, (u, v) => {
    const grain = Math.sin(u * 55) * 7 + (hash2(u * 160, v * 160) - 0.5) * 8;
    let r = 132 + grain;
    let g = 88 + grain * 0.7;
    let b = 56 + grain * 0.5;
    // Pre-existing desk scratch (present at BOTH move-in and move-out!)
    if (u > 0.34 && u < 0.66) {
      const lineY = 0.46 + (u - 0.34) * 0.25;
      const d = Math.abs(v - lineY);
      if (d < 0.016) {
        const k = 1 - d / 0.016;
        r = r * (1 - k) + 225 * k;
        g = g * (1 - k) + 206 * k;
        b = b * (1 - k) + 178 * k;
      }
    }
    return [r, g, b];
  });

  const trimTex = makeTexture(64, 64, () => [246, 245, 242]);
  const windowTex = makeTexture(128, 128, (u, v) => {
    const frame = u < 0.07 || u > 0.93 || v < 0.07 || v > 0.93 || Math.abs(u - 0.5) < 0.03 || Math.abs(v - 0.5) < 0.03;
    if (frame) return [242, 242, 240];
    return [184 + v * 28, 212 + v * 20, 236];
  });
  const doorTex = makeTexture(128, 256, (u, v) => {
    const panel = (u > 0.18 && u < 0.82 && ((v > 0.12 && v < 0.45) || (v > 0.55 && v < 0.88)));
    const shade = panel ? -12 : 0;
    return [225 + shade, 218 + shade, 206 + shade];
  });
  const outletTex = makeTexture(64, 64, (u, v) => {
    const hole = (Math.hypot(u - 0.38, v - 0.36) < 0.07 || Math.hypot(u - 0.62, v - 0.36) < 0.07 || Math.hypot(u - 0.5, v - 0.68) < 0.07);
    return hole ? [36, 36, 36] : [248, 248, 246];
  });

  const rawMeshes = [
    {
      name: "Floor",
      part: makeSubdividedPlane([0, 0, 3.4], [4.0, 0, 0], [0, 0, -3.4], [0, 1, 0], 24, 20),
      png: floorTex,
      roughness: 0.72,
    },
    {
      name: "BackWall",
      part: makeSubdividedPlane([0, 0, 0], [4.0, 0, 0], [0, 2.6, 0], [0, 0, 1], 24, 16),
      png: backWallTex,
      roughness: 0.92,
    },
    {
      name: "LeftWall",
      part: makeSubdividedPlane([0, 0, 3.4], [0, 0, -3.4], [0, 2.6, 0], [1, 0, 0], 22, 16),
      png: leftWallTex,
      roughness: 0.92,
    },
    {
      name: "RightWall",
      part: makeSubdividedPlane([4.0, 0, 0], [0, 0, 3.4], [0, 2.6, 0], [-1, 0, 0], 20, 14),
      png: backWallTex,
      roughness: 0.92,
    },
    {
      name: "Baseboards",
      part: mergeParts([
        makeBox(2.0, 0.06, 0.015, 4.0, 0.12, 0.03, 4),
        makeBox(0.015, 0.06, 1.7, 0.03, 0.12, 3.4, 4),
        makeBox(3.985, 0.06, 1.7, 0.03, 0.12, 3.4, 4),
      ]),
      png: trimTex,
      roughness: 0.55,
    },
    {
      name: "WindowFrame",
      part: makeBox(2.6, 1.55, 0.03, 1.25, 1.1, 0.06, 6),
      png: windowTex,
      roughness: 0.35,
    },
    {
      name: "DoorFrame",
      part: makeBox(0.03, 1.05, 0.75, 0.06, 2.1, 0.88, 6),
      png: doorTex,
      roughness: 0.65,
    },
    {
      name: "WallOutlet",
      part: makeBox(1.55, 0.38, 0.02, 0.10, 0.14, 0.03, 2),
      png: outletTex,
      roughness: 0.4,
    },
    {
      name: "CarpetRug",
      part: makeBox(2.25, 0.012, 2.05, 1.9, 0.024, 1.45, 16),
      png: rugTex,
      roughness: 0.98,
    },
    {
      name: "Desk",
      part: mergeParts([
        // Tabletop at y = 0.76m (scratch centered around [1.1, 0.78, 0.45])
        makeBox(1.1, 0.76, 0.45, 1.35, 0.04, 0.68, 12),
        // Four legs
        makeBox(0.48, 0.37, 0.16, 0.06, 0.74, 0.06, 3),
        makeBox(1.72, 0.37, 0.16, 0.06, 0.74, 0.06, 3),
        makeBox(0.48, 0.37, 0.74, 0.06, 0.74, 0.06, 3),
        makeBox(1.72, 0.37, 0.74, 0.06, 0.74, 0.06, 3),
      ]),
      png: deskTex,
      roughness: 0.58,
    },
  ];

  // Apply a known scan-frame offset to move-out (simulating a second phone scan taken later)
  if (isMoveOut) {
    const moveOutOffset = makeRigidMatrix({
      scale: 1.004,
      yawRad: (14 * Math.PI) / 180,
      tx: 0.42,
      ty: 0.06,
      tz: -0.34,
    });
    return buildGlb(
      rawMeshes.map((m) => ({
        ...m,
        part: transformPart(m.part, moveOutOffset),
      })),
    );
  }

  return buildGlb(rawMeshes);
}

const outDir = path.join(process.cwd(), "public", "models");
fs.mkdirSync(outDir, { recursive: true });

const moveInGlb = buildApartmentScene({ isMoveOut: false });
const moveOutGlb = buildApartmentScene({ isMoveOut: true });
const tamperedGlb = Buffer.from(moveInGlb);
// Flip one single byte near the end of the binary chunk (keeps valid container, changes SHA-256)
tamperedGlb[tamperedGlb.length - 17] ^= 0x01;

fs.writeFileSync(path.join(outDir, "apartment-move-in.glb"), moveInGlb);
fs.writeFileSync(path.join(outDir, "apartment-move-out.glb"), moveOutGlb);
fs.writeFileSync(path.join(outDir, "apartment-move-in-tampered.glb"), tamperedGlb);

console.log("Generated reference GLB scans:");
console.log("  apartment-move-in.glb:          ", moveInGlb.length, "bytes");
console.log("  apartment-move-out.glb:         ", moveOutGlb.length, "bytes");
console.log("  apartment-move-in-tampered.glb: ", tamperedGlb.length, "bytes");

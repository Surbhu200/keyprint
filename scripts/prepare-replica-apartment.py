"""
Converts Meta AI's real-world Replica Dataset 3D apartment scan
(`tmp_replica/apartment_1.glb`) into lightweight metric Y-up GLB scans:
  - public/models/apartment-move-in.glb          (real scanned apartment room, ~5 MB)
  - public/models/apartment-move-out.glb         (same real scan + 12 deg/shift/scale
                                                  scan-frame offset + staged floor stain)
  - public/models/apartment-move-in-tampered.glb (1 byte flipped for /verify red check)
"""
import io
import json
import math
import pathlib
import struct
import numpy as np
from PIL import Image, ImageEnhance


def pack_glb(gltf_dict, bin_bytes):
    json_bytes = json.dumps(gltf_dict, separators=(",", ":")).encode("utf-8")
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    if json_pad:
        json_bytes += b" " * json_pad
    bin_pad = (4 - (len(bin_bytes) % 4)) % 4
    if bin_pad:
        bin_bytes = bin_bytes + b"\x00" * bin_pad
    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    return (
        struct.pack("<III", 0x46546C67, 2, total_len)
        + struct.pack("<II", len(json_bytes), 0x4E4F534A)
        + json_bytes
        + struct.pack("<II", len(bin_bytes), 0x004E4942)
        + bin_bytes
    )


def make_organic_stain_png(size=256):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = im.load()
    for y in range(size):
        v = y / size
        for x in range(size):
            u = x / size
            dx = (u - 0.5) * 2.0
            dy = (v - 0.5) * 2.0
            ang = math.atan2(dy, dx)
            ripple = 1.0 + 0.16 * math.sin(ang * 5.0 + 0.4) + 0.09 * math.cos(ang * 9.0)
            r1 = math.hypot(dx, dy * 1.08) / (0.72 * ripple)
            r2 = math.hypot(dx - 0.34, dy + 0.24) / 0.38
            r3 = math.hypot(dx + 0.28, dy - 0.30) / 0.32
            m = max(
                math.exp(-(r1 ** 3.2)),
                0.85 * math.exp(-(r2 ** 2.8)),
                0.75 * math.exp(-(r3 ** 2.6)),
            )
            if m > 0.02:
                # Visible pale-cream / bleach-ring spill on the dark hardwood/rug
                ring = 1.0 - 0.22 * math.exp(-((r1 - 0.80) / 0.14) ** 2)
                alpha = int(min(220, m * 225))
                px[x, y] = (int(215 * ring), int(192 * ring), int(156 * ring), alpha)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def main():
    src = pathlib.Path("tmp_replica/apartment_1.glb").read_bytes()
    jlen = struct.unpack_from("<I", src, 12)[0]
    gltf = json.loads(src[20 : 20 + jlen])
    bin_data = src[20 + jlen + 8 :]

    prim = gltf["meshes"][0]["primitives"][0]
    pa = gltf["accessors"][prim["attributes"]["POSITION"]]
    na = gltf["accessors"][prim["attributes"]["NORMAL"]]
    ua = gltf["accessors"][prim["attributes"]["TEXCOORD_0"]]
    ia = gltf["accessors"][prim["indices"]]

    def read_arr(acc, dtype, cols=1):
        bv = gltf["bufferViews"][acc["bufferView"]]
        off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        count = acc["count"]
        arr = np.frombuffer(bin_data, dtype=dtype, count=count * cols, offset=off)
        return arr.reshape((count, cols)) if cols > 1 else arr

    pos_raw = read_arr(pa, np.float32, 3)
    norm_raw = read_arr(na, np.float32, 3)
    uv_raw = read_arr(ua, np.float32, 2)
    idx_dtype = np.uint32 if ia["componentType"] == 5125 else np.uint16
    indices = read_arr(ia, idx_dtype, 1).reshape((-1, 3))

    # Proper right-handed rotation to upright Y-up meters (floor at y = 0):
    #   wx = raw_y, wy = raw_x + 1.68, wz = -raw_z   (det = +1)
    pos = np.empty_like(pos_raw)
    pos[:, 0] = pos_raw[:, 1]
    pos[:, 1] = pos_raw[:, 0] + 1.68
    pos[:, 2] = -pos_raw[:, 2]

    norm = np.empty_like(norm_raw)
    norm[:, 0] = norm_raw[:, 1]
    norm[:, 1] = norm_raw[:, 0]
    norm[:, 2] = -norm_raw[:, 2]

    # Keep the complete furnished living room with all enclosing walls intact
    x_min, x_max = -4.2, 3.2
    z_min, z_max = -1.2, 6.2
    tri_centers = (pos[indices[:, 0]] + pos[indices[:, 1]] + pos[indices[:, 2]]) / 3.0
    mask = (
        (tri_centers[:, 0] >= x_min)
        & (tri_centers[:, 0] <= x_max)
        & (tri_centers[:, 2] >= z_min)
        & (tri_centers[:, 2] <= z_max)
    )
    kept_tris = indices[mask]
    print(f"Kept {len(kept_tris):,} / {len(indices):,} triangles in cropped living room")

    # Compact referenced vertices only
    used_verts, inv = np.unique(kept_tris.reshape(-1), return_inverse=True)
    new_pos = pos[used_verts].astype(np.float32)
    new_norm = norm[used_verts].astype(np.float32)
    new_uv = uv_raw[used_verts].astype(np.float32)
    new_idx = inv.astype(np.uint32)

    # Shift room horizontally so center sits near (0, y, 0) cleanly in meters
    cx = float((new_pos[:, 0].min() + new_pos[:, 0].max()) / 2.0)
    cz = float((new_pos[:, 2].min() + new_pos[:, 2].max()) / 2.0)
    new_pos[:, 0] -= cx
    new_pos[:, 2] -= cz

    # Compute exact floor height (5th percentile of Y) and align floor to y = 0
    floor_y = float(np.percentile(new_pos[:, 1], 4))
    new_pos[:, 1] -= floor_y

    pmin = new_pos.min(axis=0).tolist()
    pmax = new_pos.max(axis=0).tolist()
    print(
        f"Cropped room verts={len(new_pos):,}, tris={len(new_idx)//3:,}, "
        f"min={[round(v,3) for v in pmin]}, max={[round(v,3) for v in pmax]}"
    )

    # Find an open floor spot right in front of the TV console / coffee table
    floor_mask = (new_pos[:, 1] > -0.03) & (new_pos[:, 1] < 0.05) & (new_norm[:, 1] > 0.85)
    floor_pts = new_pos[floor_mask]
    if len(floor_pts) > 0:
        dists = (floor_pts[:, 0] - (-0.45)) ** 2 + (floor_pts[:, 2] - 0.35) ** 2
        stain_pt = floor_pts[int(np.argmin(dists))]
    else:
        stain_pt = np.array([-0.45, 0.01, 0.35], dtype=np.float32)
    print("Floor stain anchor (meters):", [round(float(v), 4) for v in stain_pt])

    # Convert 4096x4096 PNG texture to bright, crisp 2048x2048 JPEG (Replica apartment_1 is naturally dim)
    img_bv = gltf["bufferViews"][gltf["images"][0]["bufferView"]]
    orig_img_bytes = bin_data[img_bv["byteOffset"] : img_bv["byteOffset"] + img_bv["byteLength"]]
    im = Image.open(io.BytesIO(orig_img_bytes)).convert("RGB")
    im = im.resize((2048, 2048), Image.Resampling.LANCZOS)
    im = ImageEnhance.Brightness(im).enhance(1.65)
    im = ImageEnhance.Contrast(im).enhance(1.06)
    jpg_buf = io.BytesIO()
    im.save(jpg_buf, format="JPEG", quality=84, optimize=True)
    jpg_bytes = jpg_buf.getvalue()
    print(f"Compressed Replica room atlas JPEG: {len(jpg_bytes):,} bytes")

    def build_room_glb(with_move_out_changes: bool):
        chunks = []
        bvs = []
        accs = []
        imgs = []
        texs = []
        mats = []
        meshes = []
        nodes = []
        offset = 0

        def push(buf_bytes, target=None):
            nonlocal offset
            pad = (4 - (offset % 4)) % 4
            if pad:
                chunks.append(b"\x00" * pad)
                offset += pad
            idx = len(bvs)
            bv = {"buffer": 0, "byteOffset": offset, "byteLength": len(buf_bytes)}
            if target:
                bv["target"] = target
            bvs.append(bv)
            chunks.append(buf_bytes)
            offset += len(buf_bytes)
            return idx

        # Main Replica room texture + material (unlit-friendly roughness so real scan lighting looks natural)
        img_bv_idx = push(jpg_bytes)
        imgs.append({"bufferView": img_bv_idx, "mimeType": "image/jpeg"})
        texs.append({"sampler": 0, "source": 0})
        mats.append(
            {
                "name": "ReplicaApartmentScan",
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 0},
                    "metallicFactor": 0.0,
                    "roughnessFactor": 0.92,
                },
                "doubleSided": True,
            }
        )

        # Main room geometry
        pos_bv = push(new_pos.tobytes(), 34962)
        accs.append(
            {
                "bufferView": pos_bv,
                "componentType": 5126,
                "count": len(new_pos),
                "type": "VEC3",
                "min": [float(v) for v in pmin],
                "max": [float(v) for v in pmax],
            }
        )
        norm_bv = push(new_norm.tobytes(), 34962)
        accs.append(
            {
                "bufferView": norm_bv,
                "componentType": 5126,
                "count": len(new_norm),
                "type": "VEC3",
            }
        )
        uv_bv = push(new_uv.tobytes(), 34962)
        accs.append(
            {
                "bufferView": uv_bv,
                "componentType": 5126,
                "count": len(new_uv),
                "type": "VEC2",
            }
        )
        idx_bv = push(new_idx.tobytes(), 34963)
        accs.append(
            {
                "bufferView": idx_bv,
                "componentType": 5125,
                "count": len(new_idx),
                "type": "SCALAR",
            }
        )

        meshes.append(
            {
                "name": "ReplicaApartmentRoom",
                "primitives": [
                    {
                        "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
                        "indices": 3,
                        "material": 0,
                    }
                ],
            }
        )
        nodes.append({"name": "ReplicaApartmentRoom", "mesh": 0})
        root_children = [0]

        if with_move_out_changes:
            # Add realistic alpha-feathered coffee/wine spill sitting 4 mm above floor at stain_pt
            stain_png = make_organic_stain_png(256)
            s_img_bv = push(stain_png)
            imgs.append({"bufferView": s_img_bv, "mimeType": "image/png"})
            texs.append({"sampler": 0, "source": 1})
            mats.append(
                {
                    "name": "MoveOutStain",
                    "pbrMetallicRoughness": {
                        "baseColorTexture": {"index": 1},
                        "metallicFactor": 0.0,
                        "roughnessFactor": 0.85,
                    },
                    "alphaMode": "BLEND",
                    "doubleSided": True,
                }
            )
            sx, sy, sz = float(stain_pt[0]), float(stain_pt[1]) + 0.006, float(stain_pt[2])
            r = 0.24  # ~48 cm diameter organic spill (clearly visible on real scan)
            s_pos = np.array(
                [
                    [sx - r, sy, sz + r],
                    [sx + r, sy, sz + r],
                    [sx + r, sy, sz - r],
                    [sx - r, sy, sz - r],
                ],
                dtype=np.float32,
            )
            s_norm = np.array([[0, 1, 0]] * 4, dtype=np.float32)
            s_uv = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=np.float32)
            s_idx = np.array([0, 1, 2, 0, 2, 3], dtype=np.uint16)

            sp_bv = push(s_pos.tobytes(), 34962)
            accs.append(
                {
                    "bufferView": sp_bv,
                    "componentType": 5126,
                    "count": 4,
                    "type": "VEC3",
                    "min": s_pos.min(axis=0).tolist(),
                    "max": s_pos.max(axis=0).tolist(),
                }
            )
            sn_bv = push(s_norm.tobytes(), 34962)
            accs.append({"bufferView": sn_bv, "componentType": 5126, "count": 4, "type": "VEC3"})
            su_bv = push(s_uv.tobytes(), 34962)
            accs.append({"bufferView": su_bv, "componentType": 5126, "count": 4, "type": "VEC2"})
            si_bv = push(s_idx.tobytes(), 34963)
            accs.append({"bufferView": si_bv, "componentType": 5123, "count": 6, "type": "SCALAR"})

            meshes.append(
                {
                    "name": "MoveOutCarpetStain",
                    "primitives": [
                        {
                            "attributes": {"POSITION": 4, "NORMAL": 5, "TEXCOORD_0": 6},
                            "indices": 7,
                            "material": 1,
                        }
                    ],
                }
            )
            nodes.append({"name": "MoveOutCarpetStain", "mesh": 1})
            root_children.append(1)

            # Apply realistic scan-frame offset (12 deg yaw + shift + 0.4% scale)
            yaw_rad = math.radians(12.0)
            nodes.append(
                {
                    "name": "MoveOutScanFrame",
                    "translation": [0.38, 0.05, -0.29],
                    "rotation": [0.0, math.sin(yaw_rad / 2.0), 0.0, math.cos(yaw_rad / 2.0)],
                    "scale": [1.004, 1.004, 1.004],
                    "children": root_children,
                }
            )
            scene_nodes = [len(nodes) - 1]
        else:
            scene_nodes = root_children

        bin_out = b"".join(chunks)
        doc = {
            "asset": {
                "version": "2.0",
                "generator": "Keyprint Replica Real-Scan Builder (Meta Replica apartment_1)",
            },
            "scene": 0,
            "scenes": [{"name": "ReplicaApartment", "nodes": scene_nodes}],
            "nodes": nodes,
            "meshes": meshes,
            "materials": mats,
            "textures": texs,
            "images": imgs,
            "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
            "accessors": accs,
            "bufferViews": bvs,
            "buffers": [{"byteLength": len(bin_out)}],
        }
        return pack_glb(doc, bin_out)

    move_in_glb = build_room_glb(False)
    move_out_glb = build_room_glb(True)
    tampered = bytearray(move_in_glb)
    tampered[-23] ^= 0x01

    out_dir = pathlib.Path("public/models")
    (out_dir / "apartment-move-in.glb").write_bytes(move_in_glb)
    (out_dir / "apartment-move-out.glb").write_bytes(move_out_glb)
    (out_dir / "apartment-move-in-tampered.glb").write_bytes(bytes(tampered))

    print("Wrote real Meta Replica apartment scan GLBs:")
    print(f"  apartment-move-in.glb:          {len(move_in_glb):,} bytes ({len(move_in_glb)/1e6:.2f} MB)")
    print(f"  apartment-move-out.glb:         {len(move_out_glb):,} bytes ({len(move_out_glb)/1e6:.2f} MB)")
    print(f"  apartment-move-in-tampered.glb: {len(tampered):,} bytes")


if __name__ == "__main__":
    main()

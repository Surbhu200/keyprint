"""
Prepares real metric apartment GLB scans from Three.js's official
`minimalistic_modern_bedroom.glb` (decoded from Draco into standard glTF 2.0):
  - public/models/apartment-move-in.glb
  - public/models/apartment-move-out.glb  (realistic carpet stain painted into the
    real Carpet texture + real 12 deg / translation / 0.4% scale scan-frame offset)
  - public/models/apartment-move-in-tampered.glb (1 byte flipped for /verify red check)
"""
import io
import json
import math
import pathlib
import struct
from PIL import Image


def quat_mul(q1, q2):
    x1, y1, z1, w1 = q1
    x2, y2, z2, w2 = q2
    return [
        w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
        w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
        w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
        w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    ]


def quat_rotate(q, v):
    qx, qy, qz, qw = q
    vx, vy, vz = v
    # t = 2 * cross(q.xyz, v)
    tx = 2.0 * (qy * vz - qz * vy)
    ty = 2.0 * (qz * vx - qx * vz)
    tz = 2.0 * (qx * vy - qy * vx)
    return [
        vx + qw * tx + (qy * tz - qz * ty),
        vy + qw * ty + (qz * tx - qx * tz),
        vz + qw * tz + (qx * ty - qy * tx),
    ]


def apply_trs(v, t, q, s):
    vs = [v[0] * s[0], v[1] * s[1], v[2] * s[2]]
    vr = quat_rotate(q, vs)
    return [vr[0] + t[0], vr[1] + t[1], vr[2] + t[2]]


def read_accessor_vec(gltf, bin_data, acc_idx, stride_floats):
    acc = gltf["accessors"][acc_idx]
    bv = gltf["bufferViews"][acc["bufferView"]]
    offset = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    byte_stride = bv.get("byteStride", stride_floats * 4)
    count = acc["count"]
    out = []
    fmt = "<" + "f" * stride_floats
    for i in range(count):
        out.append(list(struct.unpack_from(fmt, bin_data, offset + i * byte_stride)))
    return out


def pack_glb(gltf_dict, bin_bytes):
    # Pad JSON with spaces to 4-byte alignment
    json_bytes = json.dumps(gltf_dict, separators=(",", ":")).encode("utf-8")
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    if json_pad:
        json_bytes += b" " * json_pad

    bin_pad = (4 - (len(bin_bytes) % 4)) % 4
    if bin_pad:
        bin_bytes = bin_bytes + b"\x00" * bin_pad

    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    header = struct.pack("<III", 0x46546C67, 2, total_len)
    json_hdr = struct.pack("<II", len(json_bytes), 0x4E4F534A)
    bin_hdr = struct.pack("<II", len(bin_bytes), 0x004E4942)
    return header + json_hdr + json_bytes + bin_hdr + bin_bytes


def paint_carpet_stain(png_bytes, target_u=0.52, target_v=0.46):
    im = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    w, h = im.size
    px = im.load()

    # Sample background brightness around target so stain contrasts unmistakably
    sample_r, sample_g, sample_b, _ = px[int(target_u * w) % w, int(target_v * h) % h]
    luma = 0.299 * sample_r + 0.587 * sample_g + 0.114 * sample_b
    is_dark_rug = luma < 110

    # Organic spill stain centered at (target_u, target_v) in UV space
    for y in range(h):
        v = y / h
        for x in range(w):
            u = x / w
            d1 = math.hypot((u - target_u) * 1.05, (v - target_v) * 1.0)
            d2 = math.hypot((u - (target_u + 0.065)) * 1.4, (v - (target_v - 0.05)) * 1.4)
            d3 = math.hypot((u - (target_u - 0.055)) * 1.5, (v - (target_v + 0.055)) * 1.5)
            angle = math.atan2(v - target_v, u - target_u)
            ripple = 1.0 + 0.16 * math.sin(angle * 5.0) + 0.09 * math.cos(angle * 9.0)
            m1 = math.exp(-((d1 / (0.135 * ripple)) ** 3.0))
            m2 = 0.88 * math.exp(-((d2 / 0.08) ** 2.6))
            m3 = 0.72 * math.exp(-((d3 / 0.07) ** 2.6))
            mask = max(m1, m2, m3)
            if mask > 0.03:
                r, g, b, a = px[x, y]
                if is_dark_rug:
                    # Realistic pale-tan / bleach-ring spill on charcoal rug (unmistakable contrast)
                    ring = 1.0 - 0.25 * math.exp(-((d1 / 0.06) ** 2))
                    tr, tg, tb = 205 * ring, 186 * ring, 152 * ring
                    blend = mask * 0.82
                else:
                    # Dark espresso/wine stain on light rug
                    tr, tg, tb = 38, 22, 16
                    blend = mask * 0.82
                px[x, y] = (
                    int(r * (1.0 - blend) + tr * blend),
                    int(g * (1.0 - blend) + tg * blend),
                    int(b * (1.0 - blend) + tb * blend),
                    a,
                )

    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def main():
    src = pathlib.Path("tmp_models/modern_bedroom_raw.glb").read_bytes()
    json_len = struct.unpack_from("<I", src, 12)[0]
    gltf = json.loads(src[20 : 20 + json_len])
    bin_data = src[20 + json_len + 8 :]

    # Inspect original carpet bounds in world space
    carpet_node = gltf["nodes"][2]
    carpet_mesh = gltf["meshes"][carpet_node["mesh"]]
    carpet_pos_local = read_accessor_vec(
        gltf, bin_data, carpet_mesh["primitives"][0]["attributes"]["POSITION"], 3
    )
    carpet_uv = read_accessor_vec(
        gltf, bin_data, carpet_mesh["primitives"][0]["attributes"]["TEXCOORD_0"], 2
    )

    c_t = carpet_node.get("translation", [0, 0, 0])
    c_q = carpet_node.get("rotation", [0, 0, 0, 1])
    c_s = carpet_node.get("scale", [1, 1, 1])

    # Scale whole scene to realistic metric apartment dimensions (~4.8m wide x 2.8m tall)
    METRIC_SCALE = 0.45
    carpet_world_raw = [apply_trs(v, c_t, c_q, c_s) for v in carpet_pos_local]
    carpet_min_y_raw = min(v[1] for v in carpet_world_raw)
    FLOOR_LIFT_Y = -carpet_min_y_raw * METRIC_SCALE  # places carpet bottom at y = 0.0m

    def to_move_in_world(node_idx, local_v):
        n = gltf["nodes"][node_idx]
        p = apply_trs(
            local_v,
            n.get("translation", [0, 0, 0]),
            n.get("rotation", [0, 0, 0, 1]),
            n.get("scale", [1, 1, 1]),
        )
        return [
            p[0] * METRIC_SCALE,
            p[1] * METRIC_SCALE + FLOOR_LIFT_Y,
            p[2] * METRIC_SCALE,
        ]

    # Print exact metric bounding box per mesh
    print(f"METRIC_SCALE={METRIC_SCALE}, FLOOR_LIFT_Y={FLOOR_LIFT_Y:.4f}")
    for idx, node in enumerate(gltf["nodes"]):
        mesh = gltf["meshes"][node["mesh"]]
        pts = read_accessor_vec(
            gltf, bin_data, mesh["primitives"][0]["attributes"]["POSITION"], 3
        )
        wpts = [to_move_in_world(idx, v) for v in pts]
        mn = [min(p[a] for p in wpts) for a in range(3)]
        mx = [max(p[a] for p in wpts) for a in range(3)]
        print(f"Node {idx} ({node['name']}): min={[round(x,3) for x in mn]}, max={[round(x,3) for x in mx]}")

    # Find the carpet top-surface vertex closest to the horizontal center of the rug
    carpet_world_metric = [to_move_in_world(2, v) for v in carpet_pos_local]
    cx = (min(p[0] for p in carpet_world_metric) + max(p[0] for p in carpet_world_metric)) / 2.0
    cz = (min(p[2] for p in carpet_world_metric) + max(p[2] for p in carpet_world_metric)) / 2.0
    max_y = max(p[1] for p in carpet_world_metric)
    top_indices = [i for i, p in enumerate(carpet_world_metric) if p[1] >= max_y - 0.008]
    best_i = min(
        top_indices or range(len(carpet_world_metric)),
        key=lambda i: (carpet_world_metric[i][0] - (cx + 0.08)) ** 2
        + (carpet_world_metric[i][2] - (cz + 0.05)) ** 2,
    )
    target_u = carpet_uv[best_i][0] % 1.0
    target_v = carpet_uv[best_i][1] % 1.0
    stain_world = carpet_world_metric[best_i]
    print(
        "Carpet center stain world pos (meters):",
        [round(x, 4) for x in stain_world],
        "at UV:",
        [round(target_u, 4), round(target_v, 4)],
    )

    # Identify Carpet material image index
    carpet_mat = gltf["materials"][2]
    carpet_tex_idx = carpet_mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    carpet_img_idx = gltf["textures"][carpet_tex_idx]["source"]
    print("Carpet baseColor image index:", carpet_img_idx)

    # 1. Build Move-In GLB: wrap original 4 nodes under a clean metric root node
    move_in_gltf = json.loads(json.dumps(gltf))
    root_idx = len(move_in_gltf["nodes"])
    move_in_gltf["nodes"].append(
        {
            "name": "KeyprintApartmentRoot",
            "translation": [0.0, FLOOR_LIFT_Y, 0.0],
            "scale": [METRIC_SCALE, METRIC_SCALE, METRIC_SCALE],
            "children": [0, 1, 2, 3],
        }
    )
    move_in_gltf["scenes"][0]["nodes"] = [root_idx]
    move_in_bytes = pack_glb(move_in_gltf, bin_data)

    # 2. Build Move-Out GLB:
    #    - Replace carpet PNG image with stained carpet PNG (appending new bufferView cleanly)
    #    - Wrap move-in root inside a scan-frame offset parent node (12 deg yaw + translation + 0.4% scale)
    move_out_gltf = json.loads(json.dumps(move_in_gltf))
    old_bv = move_out_gltf["bufferViews"][move_out_gltf["images"][carpet_img_idx]["bufferView"]]
    orig_png = bin_data[old_bv["byteOffset"] : old_bv["byteOffset"] + old_bv["byteLength"]]
    stained_png = paint_carpet_stain(orig_png, target_u=target_u, target_v=target_v)

    pad = (4 - (len(bin_data) % 4)) % 4
    new_offset = len(bin_data) + pad
    new_bin = bin_data + (b"\x00" * pad) + stained_png
    new_bv_idx = len(move_out_gltf["bufferViews"])
    move_out_gltf["bufferViews"].append(
        {"buffer": 0, "byteOffset": new_offset, "byteLength": len(stained_png)}
    )
    move_out_gltf["images"][carpet_img_idx]["bufferView"] = new_bv_idx
    move_out_gltf["buffers"][0]["byteLength"] = len(new_bin)

    # Rigid scan-frame offset applied on move-out scan (same room scanned later from a new phone pose)
    yaw_deg = 12.0
    yaw_rad = math.radians(yaw_deg)
    scan_scale = 1.004
    scan_tx, scan_ty, scan_tz = 0.38, 0.05, -0.29
    offset_root_idx = len(move_out_gltf["nodes"])
    move_out_gltf["nodes"].append(
        {
            "name": "MoveOutScanFrame",
            "translation": [scan_tx, scan_ty, scan_tz],
            "rotation": [0.0, math.sin(yaw_rad / 2.0), 0.0, math.cos(yaw_rad / 2.0)],
            "scale": [scan_scale, scan_scale, scan_scale],
            "children": [root_idx],
        }
    )
    move_out_gltf["scenes"][0]["nodes"] = [offset_root_idx]
    move_out_bytes = pack_glb(move_out_gltf, new_bin)

    # 3. Build 1-byte-tampered copy of Move-In GLB for /verify red demo
    tampered = bytearray(move_in_bytes)
    tampered[-23] ^= 0x01

    out_dir = pathlib.Path("public/models")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "apartment-move-in.glb").write_bytes(move_in_bytes)
    (out_dir / "apartment-move-out.glb").write_bytes(move_out_bytes)
    (out_dir / "apartment-move-in-tampered.glb").write_bytes(bytes(tampered))

    print("Wrote real bedroom GLBs:")
    print("  apartment-move-in.glb:         ", len(move_in_bytes), "bytes")
    print("  apartment-move-out.glb:        ", len(move_out_bytes), "bytes")
    print("  apartment-move-in-tampered.glb:", len(tampered), "bytes")


if __name__ == "__main__":
    main()

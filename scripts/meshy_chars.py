"""Personaggi da Meshy (OBJ + texture): riduzione dei poligoni, scala, articolazioni misurate sulla geometria,
rig Rigify (humans.rig_from_joints) e clip di animazione.

I modelli Meshy non hanno face set: le articolazioni si ricavano da sezioni del corpo in A-pose
(colonna e gambe a quote proporzionali all'altezza, braccio lungo la linea spalla -> punta delle dita,
dita distribuite lungo la mano). Fronte verso -Y, Z in alto, piedi a quota 0.
"""
import bpy, math, os, glob
import numpy as np
from mathutils import Vector, Quaternion

import humans

MESHY = "/Users/simonesanna/Desktop/circolo-sardegna-assets/asset-meshy/"
CHARACTERS = {
    "cronico": dict(glob="cronico_full/*/*.obj", height=1.80, faces=16000, name="NPC_Cronico"),
}


def _centroid(P, mask):
    return Vector(P[mask].mean(0).tolist()) if mask.any() else None


def measure_joints(P, H):
    """Articolazioni (chiavi come humans._rig_joints) da un corpo in A-pose alto H con i piedi a z = 0."""
    J = {}
    band = lambda z, w=0.012: np.abs(P[:, 2] - z * H) < w * H
    mid = lambda z: _centroid(P, band(z) & (np.abs(P[:, 0]) < 0.06 * H))
    for key, z in (("pelvis", 0.53), ("waist", 0.60), ("chest", 0.71), ("neck", 0.835), ("headbase", 0.875)):
        c = mid(z)
        J[key] = Vector((0.0, c.y, z * H))
    J["headtop"] = Vector((0.0, J["headbase"].y, float(P[:, 2].max())))
    shoulder_z = 0.815 * H
    sl = P[band(0.815)]
    for s, sx in (("R", -1), ("L", 1)):
        side = sl[sl[:, 0] * sx > 0]
        sxv = float(np.abs(side[:, 0]).max()) * 0.8
        S = Vector((sx * sxv, float(side[:, 1].mean()), shoulder_z))
        J["shoulder." + s] = S
        # punta delle dita: in A-pose le mani sono i punti più larghi del corpo; tra questi si prende il più basso
        wmax = float((P[:, 0] * sx).max())
        arm = P[(P[:, 0] * sx > 0.85 * wmax) & (P[:, 2] < shoulder_z)]
        F = Vector(arm[np.argmin(arm[:, 2])].tolist())
        J["handtip." + s] = F
        d = F - S
        def snap(k, r=0.045):
            q = S + d * k
            near = np.linalg.norm(P - np.array(q[:]), axis=1) < r
            c = _centroid(P, near & (P[:, 0] * sx > 0.08 * H))
            return c if c is not None else q
        J["elbow." + s] = snap(0.43)
        J["wrist." + s] = snap(0.76, 0.03)
        # gambe: centro della sezione della gamba di quel lato
        for key, z in (("hip", 0.52), ("knee", 0.28), ("ankle", 0.05)):
            m = band(z) & (P[:, 0] * sx > 0.01 * H) & (np.abs(P[:, 0]) < 0.14 * H)
            c = _centroid(P, m)
            J[f"{key}.{s}"] = Vector((c.x, c.y, z * H))
        foot = P[(P[:, 2] < 0.06 * H) & (P[:, 0] * sx > 0.0)]
        J["toe." + s] = Vector((J["ankle." + s].x, float(foot[:, 1].min()) + 0.03, 0.02 * H))
    return J


def hand_joints(J, s):
    """Dita distribuite lungo la mano in A-pose (palmo verso la coscia, pollice in avanti = -Y)."""
    W, F = J["wrist." + s], J["handtip." + s]
    L = (F - W).length
    d = (F - W).normalized()
    fwd = Vector((0, -1, 0))
    fwd = (fwd - d * fwd.dot(d)).normalized()                 # verso il pollice, perpendicolare alla mano
    K = W + d * (0.45 * L)
    H = {}
    for name, off, ln in (("index", 0.028, 0.50), ("middle", 0.009, 0.55), ("ring", -0.009, 0.51), ("pinky", -0.026, 0.42)):
        a = K + fwd * off * (L / 0.19)
        fl = ln * L
        H[name] = [a, a + d * fl * 0.45, a + d * fl * 0.75, a + d * fl]
    tb = W + d * (0.12 * L) + fwd * 0.022
    tt = W + d * (0.48 * L) + fwd * 0.05
    H["thumb"] = [tb, tb.lerp(tt, 0.4), tb.lerp(tt, 0.72), tt]
    return H


def import_character(key):
    spec = CHARACTERS[key]
    f = glob.glob(MESHY + spec["glob"])[0]
    before = set(bpy.data.objects)
    bpy.ops.wm.obj_import(filepath=f)
    body = next(o for o in bpy.data.objects if o not in before and o.type == "MESH")
    body.name = spec["name"] + "_Body"
    me = body.data
    me.name = spec["name"] + "_Mesh"
    # l'importer OBJ mette la conversione Y-up -> Z-up nella rotazione dell'oggetto: la si porta nei vertici
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # riduzione: collapse mantiene le UV della texture
    md = body.modifiers.new("dec", "DECIMATE")
    md.ratio = min(1.0, spec["faces"] / max(1, len(me.polygons)))
    md.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=md.name)
    # scala e piedi a terra
    bpy.context.view_layer.update()
    co = np.array([v.co[:] for v in me.vertices])
    h = co[:, 2].max() - co[:, 2].min()
    k = spec["height"] / h
    for v in me.vertices:
        v.co = Vector(((v.co.x - co[:, 0].mean()) * k, (v.co.y - co[:, 1].mean()) * k, (v.co.z - co[:, 2].min()) * k))
    for p in me.polygons:
        p.use_smooth = True
    for m in me.materials:
        if m:
            m.name = spec["name"] + "_MAT"
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    n.image.name = spec["name"] + "_Tex"
                    if max(n.image.size) > 2048:
                        n.image.scale(2048, 2048)                # la compressione del gioco scende comunque a 1024
                    n.image.pack()
    P = np.array([v.co[:] for v in me.vertices])
    J = measure_joints(P, spec["height"])
    Hj = {s: hand_joints(J, s) for s in "RL"}
    arm, _, unweighted = humans.rig_from_joints(body, me, J, Hj)
    arm.name = spec["name"]
    return arm, body, J, unweighted


def build_cronico():
    """Cronico, il padrone di casa: Idle (respiro, sguardo) e Talk (gesti con le mani mentre parla)."""
    arm, body, J, unweighted = import_character("cronico")

    def pose(p):
        t = {}
        talk = p.get("talk", 0.0)
        for sd, sx in (("R", -1), ("L", 1)):
            g = talk * (p.get("gR", 1.0) if sd == "R" else p.get("gL", 0.6))
            t["upperarm." + sd] = humans._dir_rot(arm, "upperarm." + sd, (sx * (0.16 + 0.1 * g), -0.05 - 0.25 * g, -1.0 + 0.35 * g))
            t["forearm." + sd] = humans._dir_rot(arm, "forearm." + sd, (sx * (0.1 - 0.15 * g), -0.22 - 0.75 * g, -1.0 + 1.1 * g))
            t["hand." + sd] = humans._dir_rot(arm, "hand." + sd, (sx * (0.06 - 0.1 * g), -0.18 - 0.8 * g, -1.0 + 1.0 * g))
            t["curl." + sd] = humans._curl(0.35 - 0.2 * g)
            t["spread." + sd] = 0.5
        t["chest"] = Quaternion((1, 0, 0), math.radians(-p.get("breathe", 0)))
        t["head"] = Quaternion((0, 0, 1), math.radians(p.get("yaw", 0))) @ Quaternion((1, 0, 0), math.radians(p.get("pitch", 4)))
        return t

    humans._make_action(arm, "NPC_Cronico_Idle", [(1, {}), (40, {"breathe": 1.5, "yaw": 10}), (90, {"yaw": -12}),
                                                  (130, {"breathe": 1.5, "yaw": 3}), (169, {})], pose)
    humans._make_action(arm, "NPC_Cronico_Talk", [(1, {"talk": 0.3}), (18, {"talk": 0.9, "yaw": 6, "gL": 0.2}),
                                                  (36, {"talk": 0.5, "yaw": -4, "gL": 0.8}), (54, {"talk": 1.0, "gR": 0.6, "gL": 0.4, "pitch": 8}),
                                                  (72, {"talk": 0.4, "yaw": 5}), (97, {"talk": 0.3})], pose)
    arm.animation_data.action = bpy.data.actions["NPC_Cronico_Idle"]
    bpy.context.scene.frame_set(1)
    info = {"clip": "NPC_Cronico_Idle", "talk_clip": "NPC_Cronico_Talk", "verts": len(body.data.vertices),
            "unweighted_verts": unweighted, "joints": {k: [round(x, 3) for x in v] for k, v in J.items() if "." in k}}
    return arm, body, info


# ------------------------------------------------------------------ Cronico con il rig e le animazioni di Meshy

MESHY_CLIPS = {"Idle_3": "Idle", "Walking": "Walk", "Running": "Run", "Talk_with_Hands_Open": "Talk", "Agree_Gesture": "Agree",
               "Half_Squat_with_Thumb_Up": "ThumbUp", "Personalized_Gesture": "Gesture"}


# correzioni in gradi, nello spazio del personaggio (fronte -Y, sinistra +X, alto +Z):
#   (osso, asse, angolo). Asse X: positivo porta verso dietro ciò che pende; asse Y: gira nel piano frontale.
IDLE_FIX = [
    ("mixamorig:LeftShoulder", "Y", 6), ("mixamorig:RightShoulder", "Y", -6),       # spalle più basse
    ("mixamorig:LeftArm", "X", -12), ("mixamorig:RightArm", "X", -12),             # mani ai lati delle cosce, non dietro
    ("mixamorig:LeftArm", "Y", -3), ("mixamorig:RightArm", "Y", 3),                # e non strette davanti all'inguine
]


def correct_clip(arm, action, fixes):
    """Aggiunge a ogni chiave di rotazione dell'osso una rotazione data nello spazio del personaggio (mondo a riposo),
    convertita nello spazio locale dell'osso: q' = M^-1 R M * q."""
    from mathutils import Matrix
    W = arm.matrix_world.to_3x3().normalized()
    for bone_name, axis, deg in fixes:
        b = arm.data.bones.get(bone_name)
        if not b:
            continue
        M = (W @ b.matrix_local.to_3x3()).normalized()
        R = Matrix.Rotation(math.radians(deg), 3, axis)
        delta = (M.inverted() @ R @ M).to_quaternion()
        path = f'pose.bones["{bone_name}"].rotation_quaternion'
        fcs = [fc for fc in _fcurves(action) if fc.data_path == path]
        if len(fcs) != 4:
            continue
        fcs.sort(key=lambda fc: fc.array_index)
        for i in range(len(fcs[0].keyframe_points)):
            q = Quaternion([fc.keyframe_points[i].co[1] for fc in fcs])
            q2 = delta @ q
            for k, fc in enumerate(fcs):
                kp = fc.keyframe_points[i]
                d = q2[k] - kp.co[1]
                kp.co[1] = q2[k]; kp.handle_left[1] += d; kp.handle_right[1] += d
        for fc in fcs:
            fc.update()


def _fcurves(action):
    """F-curve di un'azione (Blender 5 le tiene negli strati/slot, le versioni precedenti in action.fcurves)."""
    if hasattr(action, "fcurves") and len(action.fcurves):
        return list(action.fcurves)
    out = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                out += list(bag.fcurves)
    return out


def build_cronico_meshy(name="NPC_Cronico"):
    """Cronico dal pacchetto 'Rigged biped' di Meshy: una mesh, lo scheletro Mixamo e le sette animazioni (una per file,
    stessi nomi di osso) raccolte come clip NPC_Cronico_<Nome>. Lo scheletro è in centimetri (scala 0.01): lo si mette
    dentro un nodo radice a scala 1, che è il personaggio per il gioco. La camminata è sul posto: lo spostamento lo fa il
    gioco. Ritorna (radice, armatura, corpo, info) oppure None se i file mancano."""
    files = sorted(glob.glob(MESHY + "cronico_rig/*/*_withSkin.glb"))
    if not files:
        return None
    before_data = (set(bpy.data.materials), set(bpy.data.images))
    keep = None
    clips = []
    for f in files:
        tag = next((k for k in MESHY_CLIPS if f"_Animation_{k}_withSkin" in f), None)
        if not tag:
            continue
        before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=f)
        new_o = [o for o in bpy.data.objects if o not in before_o]
        new_a = [a for a in bpy.data.actions if a not in before_a]
        clip = f"{name}_{MESHY_CLIPS[tag]}"
        for a in new_a:
            a.name = clip
            a.use_fake_user = True
            clips.append(clip)
        if keep is None:
            keep = new_o
        else:
            for o in new_o:
                bpy.data.objects.remove(o, do_unlink=True)
    arm = next(o for o in keep if o.type == "ARMATURE")
    for o in [o for o in keep if o.type == "MESH" and len(o.data.vertices) < 100]:   # sfera di servizio dell'esportazione Meshy
        keep.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    body = next(o for o in bpy.data.objects if o.type == "MESH" and o.parent == arm)
    _drop_unused_images(before_data)
    body.name = name + "_Body"
    body.data.name = name + "_Mesh"
    for m in body.data.materials:
        if m:
            m.name = name + "_MAT"
    for img in _own_images(body):                            # solo le sue: nella scena ci sono anche quelle degli anziani
        img.name = name + "_Tex"
        img.pack()
    arm.name = name + "_Rig"
    arm.data.name = name + "_RigData"
    # radice del personaggio a scala 1 (l'armatura sotto mantiene la sua scala in centimetri)
    root = bpy.data.objects.new(name, None)
    arm.users_collection[0].objects.link(root)
    top = arm
    while top.parent:
        top = top.parent
    top.parent = root
    # la clip Idle di Meshy ha spalle alzate, braccia larghe e mani dietro i fianchi: correzione su ogni fotogramma
    idle = bpy.data.actions.get(f"{name}_Idle")
    if idle:
        correct_clip(arm, idle, IDLE_FIX)
    # una traccia NLA per clip: l'esportatore glTF (modalità ACTIONS) le esporta tutte
    arm.animation_data_create()
    arm.animation_data.action = None
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)
    for c in sorted(set(clips)):
        tr = arm.animation_data.nla_tracks.new(); tr.name = c
        tr.strips.new(c, int(bpy.data.actions[c].frame_range[0]), bpy.data.actions[c])
    arm.animation_data.action = bpy.data.actions.get(f"{name}_Idle")
    bpy.context.scene.frame_set(1)
    info = {"clips": sorted(set(clips)), "verts": len(body.data.vertices), "bones": len(arm.data.bones)}
    return root, arm, body, info


# ---------------------------------------------------------------------------------------------------------------
# Anziani: un solo modello Meshy ("Elderly Man", Rigged biped) per tutti i vecchi del circolo.
# Clip del pacchetto: seduto (Chair_Sit_Idle), camminata sul posto, "discute camminando" (con spostamento).
# Manca un'attesa in piedi: Stand è la prima posa di "discute" con il respiro, Talk ne prende busto e braccia
# (gesti) con le gambe ferme di Stand. Le clip sono esportate una volta sola (sul primo anziano): il gioco le
# riaggancia alle ossa di ciascuno per nome.
ELDER_FILES = {"Chair_Sit_Idle_M": "Sit", "Walking": "Walk", "Discuss_While_Moving": "_Discuss"}
ELDER_UPPER = ("Spine1", "Spine2", "Neck", "Head", "HeadTop_End", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
               "RightShoulder", "RightArm", "RightForeArm", "RightHand")
MX = "mixamorig:"
# seduto: cosce più strette (i piedi non toccano quelli dei vicini al tavolo) e un po' più basse (piedi a terra)
SIT_FIX = [(MX + "LeftUpLeg", "Z", -15), (MX + "RightUpLeg", "Z", 15), (MX + "LeftUpLeg", "X", 8), (MX + "RightUpLeg", "X", 8)]


SIT_DAMP = 0.25


def damp_clip(action, bones, k):
    """Riduce i movimenti delle ossa indicate: ogni rotazione va verso quella del primo fotogramma (slerp di fattore k)."""
    ch = _channels(action)
    for bone in bones:
        for fc in ch.get(bone, {}).get("location") or []:
            if fc is None or not len(fc.keyframe_points):
                continue
            v0 = fc.keyframe_points[0].co[1]
            for kp in fc.keyframe_points:
                d = v0 + k * (kp.co[1] - v0) - kp.co[1]
                kp.co[1] += d; kp.handle_left[1] += d; kp.handle_right[1] += d
            fc.update()
        fcs = ch.get(bone, {}).get("rotation_quaternion")
        if not fcs or None in fcs:
            continue
        n = len(fcs[0].keyframe_points)
        if any(len(fc.keyframe_points) != n for fc in fcs):
            continue
        q0 = Quaternion([fc.keyframe_points[0].co[1] for fc in fcs])
        for i in range(n):
            q = Quaternion([fc.keyframe_points[i].co[1] for fc in fcs])
            if q0.dot(q) < 0:
                q.negate()
            q2 = q0.slerp(q, k)
            for j, fc in enumerate(fcs):
                kp = fc.keyframe_points[i]
                d = q2[j] - kp.co[1]
                kp.co[1] = q2[j]; kp.handle_left[1] += d; kp.handle_right[1] += d
        for fc in fcs:
            fc.update()


def _own_images(body):
    return {n.image for m in body.data.materials if m and m.node_tree for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image}


def _drop_unused_images(before):
    """Via materiali e immagini importati con i file delle sole animazioni (una copia della texture per file)."""
    mats, imgs = before
    for m in [m for m in bpy.data.materials if m not in mats and m.users == 0]:
        bpy.data.materials.remove(m)
    for img in [i for i in bpy.data.images if i not in imgs and i.users == 0]:
        bpy.data.images.remove(img)


def _channels(action):
    """{osso: {"location": [fc x, y, z], "rotation_quaternion": [fc w, x, y, z]}}"""
    out = {}
    for fc in _fcurves(action):
        if not fc.data_path.startswith('pose.bones["'):
            continue
        bone = fc.data_path.split('"')[1]
        prop = fc.data_path.rsplit(".", 1)[1]
        out.setdefault(bone, {}).setdefault(prop, [None] * (4 if prop == "rotation_quaternion" else 3))[fc.array_index] = fc
    return out


def _sample(ch, bone, prop, f, default):
    fcs = ch.get(bone, {}).get(prop)
    if not fcs or None in fcs:
        return default
    return [fc.evaluate(f) for fc in fcs]


def _use(arm, action):
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = action
    if getattr(ad, "action_slot", 1) is None and len(action.slots):
        ad.action_slot = action.slots[0]


def _bake(arm, name, frames, pose_at):
    """Nuova azione da pose calcolate: pose_at(f) -> {osso: {"location": (...), "rotation_quaternion": (...)}}."""
    act = bpy.data.actions.new(name)
    _use(arm, act)
    for f in frames:
        for bone, props in pose_at(f).items():
            pb = arm.pose.bones.get(bone)
            if not pb:
                continue
            for prop, val in props.items():
                setattr(pb, prop, val)
                pb.keyframe_insert(prop, frame=f, group=bone)
    return act


def _shift_hips(arm, action, delta_world):
    """Sposta l'anca (e quindi tutto il corpo) di delta_world su ogni chiave della clip."""
    b = arm.data.bones[MX + "Hips"]
    M = arm.matrix_world.to_3x3() @ b.matrix_local.to_3x3()
    d = M.inverted() @ Vector(delta_world)
    fcs = _channels(action).get(MX + "Hips", {}).get("location")
    if not fcs or None in fcs:
        return
    for k, fc in enumerate(fcs):
        for kp in fc.keyframe_points:
            kp.co[1] += d[k]; kp.handle_left[1] += d[k]; kp.handle_right[1] += d[k]
        fc.update()


def _eval_world(body):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    co = co.reshape(-1, 3)
    M = np.array(body.matrix_world)
    return co @ M[:3, :3].T + M[:3, 3]


def build_elders_meshy(specs, prefix="NPC_Elder"):
    """specs: [{"name": "NPC_Elder_01", "scale": 1.0}, ...]. Il primo tiene le clip (tracce NLA), gli altri
    condividono mesh, materiale, armatura e azioni. Ritorna (lista di (radice, armatura, corpo), misure) oppure None.
    Misure a scala 1, radice nell'origine, fronte -Y: seduto (sedere, schiena, piedi), in piedi (piedi), passo."""
    files = sorted(glob.glob(MESHY + "elder_rig/*/*_withSkin.glb"))
    if not files:
        return None
    before_data = (set(bpy.data.materials), set(bpy.data.images))
    for a in [a for a in bpy.data.actions if a.name.startswith(prefix + "_")]:
        bpy.data.actions.remove(a)
    keep, acts = None, {}
    for f in files:
        tag = next((k for k in ELDER_FILES if f"_Animation_{k}_withSkin" in f), None)
        before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=f)
        new_o = [o for o in bpy.data.objects if o not in before_o]
        for a in [a for a in bpy.data.actions if a not in before_a]:
            if tag:
                a.name = f"{prefix}_{ELDER_FILES[tag]}"
                acts[ELDER_FILES[tag]] = a
            else:
                bpy.data.actions.remove(a)                      # corsa: non serve
        if keep is None and tag:
            keep = new_o
        else:
            for o in new_o:
                bpy.data.objects.remove(o, do_unlink=True)
    arm = next(o for o in keep if o.type == "ARMATURE")
    for o in [o for o in keep if o.type == "MESH" and len(o.data.vertices) < 100]:
        keep.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    body = next(o for o in bpy.data.objects if o.type == "MESH" and o.parent == arm)
    _drop_unused_images(before_data)
    body.data.name = prefix + "_Mesh"
    for m in body.data.materials:
        if m:
            m.name = prefix + "_MAT"
    for img in _own_images(body):
        img.name = prefix + "_Tex"
        if img.size[0] > 2048:
            img.scale(2048, 2048)
        img.pack()
    top = arm
    while top.parent:
        top = top.parent
    bpy.context.view_layer.update()
    sc = bpy.context.scene
    hips = arm.pose.bones[MX + "Hips"]

    # seduto: anca sull'origine (la clip di Meshy siede spostata di ~0.3 m e 0.5 m)
    sit = acts["Sit"]
    _use(arm, sit); sc.frame_set(int(sit.frame_range[0]))
    h = arm.matrix_world @ hips.head
    _shift_hips(arm, sit, (-h.x, -h.y, 0))
    correct_clip(arm, sit, SIT_FIX)
    # la clip a metà scivola in avanti sulla sedia e si sporge (al tavolo entrerebbe nel piano): tutto il corpo resta
    # vicino alla posa iniziale, con un quarto del movimento
    damp_clip(sit, [pb.name for pb in arm.pose.bones], SIT_DAMP)
    damp_clip(sit, [MX + s + b for s in ("Left", "Right") for b in ("Shoulder", "Arm", "ForeArm", "Hand")], 0.4)  # mani sulle cosce
    # in piedi e parla: dalla prima posa di "discute", anca sopra l'origine
    disc = acts["_Discuss"]
    dch = _channels(disc)
    f0 = disc.frame_range[0]
    rest = {}
    for pb in arm.pose.bones:
        rest[pb.name] = {"location": _sample(dch, pb.name, "location", f0, list(pb.location)),
                         "rotation_quaternion": _sample(dch, pb.name, "rotation_quaternion", f0, list(pb.rotation_quaternion))}
    breathe = lambda f: math.sin(2 * math.pi * f / 96)

    def stand(f):
        pose = {b: {k: list(v) for k, v in p.items()} for b, p in rest.items()}
        for b, ax, amp in ((MX + "Spine2", "X", 1.4), (MX + "Spine1", "X", 0.6), (MX + "Head", "Y", 2.5)):
            q = Quaternion(pose[b]["rotation_quaternion"]) @ Quaternion(Vector((1, 0, 0) if ax == "X" else (0, 1, 0)),
                                                                      math.radians(amp) * (breathe(f) if ax == "X" else math.sin(2 * math.pi * f / 192)))
            pose[b]["rotation_quaternion"] = list(q)
        return pose
    stand_act = _bake(arm, f"{prefix}_Stand", range(0, 193, 8), stand)

    def talk(f):
        pose = stand(f)
        for b in ELDER_UPPER:
            q = _sample(dch, MX + b, "rotation_quaternion", f, None)
            if q:
                pose[MX + b]["rotation_quaternion"] = q
        return pose
    talk_act = _bake(arm, f"{prefix}_Talk", range(int(f0), int(disc.frame_range[1]) + 1, 2), talk)
    # anca in piedi sopra l'origine (Stand e Talk hanno la stessa anca)
    _use(arm, stand_act); sc.frame_set(0)
    h = arm.matrix_world @ hips.head
    for a in (stand_act, talk_act):
        _shift_hips(arm, a, (-h.x, -h.y, 0))
    bpy.data.actions.remove(disc)
    acts = {"Sit": sit, "Walk": acts["Walk"], "Stand": stand_act, "Talk": talk_act}

    # misure
    meas = {}
    _use(arm, stand_act); sc.frame_set(0)
    meas["stand_min_z"] = float(_eval_world(body)[:, 2].min())
    _use(arm, sit); sc.frame_set(int(sit.frame_range[0]))
    co = _eval_world(body)
    h = arm.matrix_world @ hips.head
    near = np.hypot(co[:, 0] - h.x, co[:, 1] - h.y) < 0.13
    butt = float(co[near & (co[:, 2] < h.z), 2].min())
    band = (np.abs(co[:, 0] - h.x) < 0.2) & (co[:, 2] > butt + 0.15) & (co[:, 2] < butt + 0.5)
    meas.update(sit_butt_z=butt, sit_back_y=float(co[band, 1].max()), sit_feet_z=float(co[:, 2].min()),
                sit_hips=[round(v, 4) for v in h])
    # passo: velocità del piede d'appoggio nella camminata sul posto
    walk = acts["Walk"]
    _use(arm, walk)
    fr = range(int(walk.frame_range[0]), int(walk.frame_range[1]) + 1)
    feet = []
    for f in fr:
        sc.frame_set(f)
        feet.append([tuple(arm.matrix_world @ arm.pose.bones[MX + s + "ToeBase"].head) for s in ("Left", "Right")])
    v = []
    for i in range(1, len(feet)):
        k = 0 if feet[i][0][2] < feet[i][1][2] else 1
        k0 = 0 if feet[i - 1][0][2] < feet[i - 1][1][2] else 1
        if k == k0:
            v.append(abs(feet[i][k][1] - feet[i - 1][k][1]) * sc.render.fps)
    meas["walk_speed"] = round(float(np.median(v)), 3) if v else 1.0
    meas["clips"] = {k: [round(a.frame_range[0]), round(a.frame_range[1])] for k, a in acts.items()}

    # personaggi: il primo è il modello importato, gli altri copie che condividono i dati
    out = []
    for n, spec in enumerate(specs):
        name = spec["name"]
        if n == 0:
            a, b, t = arm, body, top
        else:
            a = arm.copy(); b = body.copy()
            bpy.context.scene.collection.objects.link(a); bpy.context.scene.collection.objects.link(b)
            b.parent = a
            for md in b.modifiers:
                if md.type == "ARMATURE":
                    md.object = a
            t = a
        a.name = name + "_Rig"
        b.name = name + "_Body"
        root = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(root)
        t.parent = root
        root.scale = (spec.get("scale", 1.0),) * 3
        if n == 0:
            arm.data.name = prefix + "_RigData"
            a.animation_data.action = None
            for tr in list(a.animation_data.nla_tracks):
                a.animation_data.nla_tracks.remove(tr)
            for k in sorted(acts):
                tr = a.animation_data.nla_tracks.new(); tr.name = acts[k].name
                tr.strips.new(acts[k].name, int(acts[k].frame_range[0]), acts[k])
        else:
            a.animation_data_create()
            for tr in list(a.animation_data.nla_tracks):
                a.animation_data.nla_tracks.remove(tr)
            a["anim_shared"] = True                           # le clip sono sul primo: via l'azione prima di esportare
        out.append((root, a, b))
    return out, meas


# ---------------------------------------------------------------------------------------------------------------
# Personaggio Meshy "Rigged biped" generico (Nicola il barista, Rafka): una clip per file, scheletro Mixamo.
# files: {"Stand_and_Drink": "Drink", "Walking": "Walk", ...} (parte del nome file dopo "_Animation_" -> nome clip).
# Se manca un'attesa in piedi, "Idle" è la prima posa di stand_from con il respiro; "Talk" (se chiesto) prende busto e
# braccia di talk_from con le gambe ferme dell'Idle.
def build_meshy_char(folder, name, files, stand_from, talk_from=None, max_tex=2048, idle_fix=None):
    paths = sorted(glob.glob(MESHY + folder + "/*/*_withSkin.glb"))
    if not paths:
        return None
    for a in [a for a in bpy.data.actions if a.name.startswith(name + "_")]:
        bpy.data.actions.remove(a)
    before_data = (set(bpy.data.materials), set(bpy.data.images))
    keep, acts = None, {}
    for f in paths:
        tag = next((k for k in files if f"_Animation_{k}_withSkin" in f), None)
        before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=f)
        new_o = [o for o in bpy.data.objects if o not in before_o]
        for a in [a for a in bpy.data.actions if a not in before_a]:
            if tag:
                a.name = f"{name}_{files[tag]}"
                acts[files[tag]] = a
            else:
                bpy.data.actions.remove(a)
        if keep is None and tag:
            keep = new_o
        else:
            for o in new_o:
                bpy.data.objects.remove(o, do_unlink=True)
    arm = next(o for o in keep if o.type == "ARMATURE")
    for o in [o for o in keep if o.type == "MESH" and len(o.data.vertices) < 100]:
        keep.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    body = next(o for o in bpy.data.objects if o.type == "MESH" and o.parent == arm)
    _drop_unused_images(before_data)
    body.name, body.data.name = name + "_Body", name + "_Mesh"
    for m in body.data.materials:
        if m:
            m.name = name + "_MAT"
    for img in _own_images(body):
        img.name = name + "_Tex"
        if img.size[0] > max_tex:
            img.scale(max_tex, max_tex)
        img.pack()
    arm.name, arm.data.name = name + "_Rig", name + "_RigData"
    sc = bpy.context.scene
    hips = arm.pose.bones[MX + "Hips"]
    src = acts[stand_from]
    sch = _channels(src)
    f0 = src.frame_range[0]
    rest = {pb.name: {"location": _sample(sch, pb.name, "location", f0, list(pb.location)),
                      "rotation_quaternion": _sample(sch, pb.name, "rotation_quaternion", f0, list(pb.rotation_quaternion))}
            for pb in arm.pose.bones}

    def stand(f):
        pose = {b: {k: list(v) for k, v in p.items()} for b, p in rest.items()}
        for b, ax, amp, per in ((MX + "Spine2", (1, 0, 0), 1.4, 96), (MX + "Spine1", (1, 0, 0), 0.6, 96), (MX + "Head", (0, 1, 0), 2.5, 192)):
            q = Quaternion(pose[b]["rotation_quaternion"]) @ Quaternion(Vector(ax), math.radians(amp) * math.sin(2 * math.pi * f / per))
            pose[b]["rotation_quaternion"] = list(q)
        return pose
    if "Idle" not in acts:
        acts["Idle"] = _bake(arm, f"{name}_Idle", range(0, 193, 8), stand)
        if idle_fix:
            correct_clip(arm, acts["Idle"], idle_fix)
    if talk_from and "Talk" not in acts:
        tch = _channels(acts[talk_from])
        t0, t1 = acts[talk_from].frame_range

        def talk(f):
            pose = stand(f)
            for b in ELDER_UPPER:
                q = _sample(tch, MX + b, "rotation_quaternion", f, None)
                if q:
                    pose[MX + b]["rotation_quaternion"] = q
            return pose
        acts["Talk"] = _bake(arm, f"{name}_Talk", range(int(t0), int(t1) + 1, 2), talk)
    # anca sopra l'origine nelle clip ricavate e in quelle sul posto
    _use(arm, acts["Idle"]); sc.frame_set(0)
    h = arm.matrix_world @ hips.head
    for k in ("Idle", "Talk"):
        if k in acts:
            _shift_hips(arm, acts[k], (-h.x, -h.y, 0))
    for k, a in list(acts.items()):
        if k.startswith("_"):
            bpy.data.actions.remove(a)
            del acts[k]
    meas = {}
    _use(arm, acts["Idle"]); sc.frame_set(0)
    meas["stand_min_z"] = float(_eval_world(body)[:, 2].min())
    if "Walk" in acts:
        walk = acts["Walk"]; _use(arm, walk)
        feet = []
        for f in range(int(walk.frame_range[0]), int(walk.frame_range[1]) + 1):
            sc.frame_set(f)
            feet.append([tuple(arm.matrix_world @ arm.pose.bones[MX + s + "ToeBase"].head) for s in ("Left", "Right")])
        v = []
        for i in range(1, len(feet)):
            k = 0 if feet[i][0][2] < feet[i][1][2] else 1
            if k == (0 if feet[i - 1][0][2] < feet[i - 1][1][2] else 1):
                v.append(abs(feet[i][k][1] - feet[i - 1][k][1]) * sc.render.fps)
        meas["walk_speed"] = round(float(np.median(v)), 3) if v else 1.0
    top = arm
    while top.parent:
        top = top.parent
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    top.parent = root
    arm.animation_data.action = None
    for tr in list(arm.animation_data.nla_tracks):
        arm.animation_data.nla_tracks.remove(tr)
    for k in sorted(acts):
        tr = arm.animation_data.nla_tracks.new(); tr.name = acts[k].name
        tr.strips.new(acts[k].name, int(acts[k].frame_range[0]), acts[k])
    _use(arm, acts["Idle"]); sc.frame_set(1)
    meas["clips"] = {k: [round(a.frame_range[0]), round(a.frame_range[1])] for k, a in acts.items()}
    return root, arm, body, meas

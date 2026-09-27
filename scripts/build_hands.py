"""Mani in prima persona dal bundle CC0 Human Base Meshes (mano destra realistica + avambraccio con manica).

Uso: Blender -b --factory-startup --python scripts/build_hands.py
Esce build/hands.glb con tre pose statiche già orientate per la camera:
  Hand_Relaxed, Hand_Glass (presa del bicchiere), Hand_Cigarette (sigaretta tra indice e medio)
e i punti di aggancio Socket_Glass / Socket_Cigarette (empty figli delle mani).
Spazio della mano (Blender): dita verso +Y, palmo verso -X, pollice verso +Z, origine al centro del palmo.
"""
import bpy, bmesh, math, os, sys, json
import numpy as np
from mathutils import Vector, Matrix, Quaternion

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import humans

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "build")
PALM, FOREARM = 10, 11                    # face set della mano e dell'avambraccio destri (x < 0) nel bundle v1.4.1
CHAINS = {"thumb": [84, 85, 86, 87], "index": [88, 89, 90, 91], "middle": [92, 93, 94, 95],
          "ring": [96, 97, 98, 99], "pinky": [100, 101, 102, 103]}
POSES = {   # gradi di flessione per falange (prossimale, media, distale)
    "Hand_Relaxed": {"thumb": (8, 10, 6), "index": (12, 18, 10), "middle": (14, 20, 12), "ring": (16, 22, 12), "pinky": (18, 24, 12)},
    "Hand_Glass": {"thumb": (20, 18, 10), "index": (22, 30, 18), "middle": (24, 32, 18), "ring": (26, 34, 20), "pinky": (28, 36, 20)},
    "Hand_Cigarette": {"thumb": (30, 30, 20), "index": (6, 10, 6), "middle": (8, 12, 8), "ring": (62, 80, 50), "pinky": (66, 85, 50)},
    "Hand_Point": {"thumb": (35, 40, 25), "index": (2, 4, 2), "middle": (70, 88, 55), "ring": (74, 90, 55), "pinky": (78, 92, 55)},
}
SLEEVE_LEN = 0.24                         # lunghezza dell'avambraccio visibile dal polso


def mat(name, color, rough):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*color, 1)
    return m


def ring(me, fs, a, b):
    va, vb = set(), set()
    for p, f in zip(me.polygons, fs):
        if f == a:
            va.update(p.vertices)
        elif f == b:
            vb.update(p.vertices)
    sh = va & vb
    return Vector(np.array([me.vertices[i].co[:] for i in sh]).mean(0).tolist())


SPREAD = {"Hand_Relaxed": 0.45, "Hand_Glass": 0.85, "Hand_Cigarette": 0.5, "Hand_Point": 0.7}   # dita unite (Rigify)


def main():
    """Mano in prima persona dal corpo intero rigato con Rigify: le dita si piegano con pesi automatici morbidi
    (niente pieghe nette alle nocche), si cuoce la mesh in posa e si tengono solo mano e avambraccio."""
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    tpl = humans._load_template()
    body = tpl.copy(); body.data = tpl.data.copy(); body.name = "_hand_src"
    bpy.context.scene.collection.objects.link(body)
    me = body.data
    fs = np.array([d.value for d in me.attributes[".sculpt_face_set"].data])
    fs_r, pc_r, _, _ = humans._regions(me)
    arm, JB, _ = humans._rig_rigify(body, me, fs_r, pc_r)
    keep_sets = {PALM, FOREARM} | {s for c in CHAINS.values() for s in c}
    wrist = ring(me, fs, FOREARM, PALM)
    H = humans._hand_joints(me, fs, "R")
    J = {k: v for k, v in H.items()}
    knuckles = sum((J[n][0] for n in ("index", "middle", "ring", "pinky")), Vector()) / 4
    d_index = (J["index"][1] - J["index"][0]).normalized()
    across = (J["pinky"][0] - J["index"][0]).normalized()
    n = d_index.cross(across).normalized()          # in A-pose il palmo destro guarda la coscia
    skin = mat("MAT_Player_Skin", humans.SKIN_RGB, 0.55)
    sleeve = mat("MAT_Player_Sleeve", (0.05, 0.06, 0.10), 0.85)
    vl = bpy.context.view_layer

    def bake(pose_name, curls):
        """Mesh della mano nella posa: corpo valutato, poi via tutto tranne mano, dita e ultimo tratto d'avambraccio."""
        humans._set_pose(arm, {"curl.R": curls, "spread.R": SPREAD.get(pose_name, 0.5)})
        dg = bpy.context.evaluated_depsgraph_get()
        baked = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
        bm = bmesh.new(); bm.from_mesh(baked)
        bm.faces.ensure_lookup_table()
        kill = [f for f in bm.faces if fs[f.index] not in keep_sets or (fs[f.index] == FOREARM and
                (Vector(me.polygons[f.index].center) - wrist).length > SLEEVE_LEN)]
        mats = {f.index: (1 if fs[f.index] == FOREARM else 0) for f in bm.faces}
        for f in bm.faces:
            f.material_index = mats[f.index]
            f.smooth = True
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        bm.normal_update()
        for v in bm.verts:                                  # manica: spessore sull'avambraccio
            if v.link_faces and all(f.material_index == 1 for f in v.link_faces):
                v.co += v.normal * 0.014
        # prima gli slot dei materiali, poi la geometria: in Blender 5 materials.clear() azzera gli indici delle facce
        baked.materials.clear(); baked.materials.append(skin); baked.materials.append(sleeve)
        bm.to_mesh(baked); bm.free()
        return baked

    out_objs = []
    out = bpy.data.collections.new("HANDS"); bpy.context.scene.collection.children.link(out)
    for pose_name, curls in POSES.items():
        baked = bake(pose_name, curls)
        baked.name = pose_name + "_Mesh"
        pbn = lambda name: humans._pb(arm, name + ".R")      # dita per nome logico (es. 'index.3') sul rig Rigify
        # riferimento della mano: dita verso +Y, palmo verso -X, pollice verso +Z
        palm_c = (wrist + knuckles) / 2
        Y = (knuckles - wrist).normalized()
        X = (-n - Y * (-n).dot(Y)).normalized()
        Z = X.cross(Y)
        R = Matrix((X, Y, Z))                           # righe: mondo -> mano
        xf = R.to_4x4() @ Matrix.Translation(-palm_c)
        baked.transform(xf)
        o = bpy.data.objects.new(pose_name, baked); out.objects.link(o)
        out_objs.append(o)
        if pose_name == "Hand_Glass":
            s = bpy.data.objects.new("Socket_Glass", None); out.objects.link(s); s.parent = o
            # centro del bicchiere dalla presa reale: a metà tra palmo e polpastrelli piegati, all'altezza delle nocche medie
            fingers = ("index", "middle", "ring", "pinky")
            tips = sum((xf @ pbn(f"{f}.3").tail for f in fingers), Vector()) / 4
            mids = sum((xf @ pbn(f"{f}.2").head for f in fingers), Vector()) / 4
            palm_l = xf @ palm_c
            ctr = Vector((palm_l.x - (0.041 + 0.022), palm_l.y + 0.03, mids.z))     # raggio del bicchiere + spessore del palmo
            s.location = (ctr.x, ctr.y, ctr.z - 0.046)
            print("GLASS_SOCKET", [round(v, 3) for v in s.location], "tips", [round(v, 3) for v in tips], "palm", [round(v, 3) for v in palm_l])
        if pose_name == "Hand_Point":                        # polpastrello dell'indice: preme pulsanti, spinge i gettoni
            s = bpy.data.objects.new("Socket_Fingertip", None); out.objects.link(s); s.parent = o
            s.location = xf @ pbn("index.3").tail
        if pose_name == "Hand_Cigarette":
            pi = pbn("index.1"); pm = pbn("middle.1")
            mid = ((pi.head + pi.tail) / 2 + (pm.head + pm.tail) / 2) / 2
            s = bpy.data.objects.new("Socket_Cigarette", None); out.objects.link(s); s.parent = o
            s.location = xf @ mid
            # asse +X della sigaretta (verso la brace) sul dorso della mano, appena verso le dita
            axis = (R @ (-n)).normalized() * 0.85 + Vector((0, 0.15, 0))
            s.rotation_euler = Vector((1, 0, 0)).rotation_difference(axis.normalized()).to_euler()
    for o in list(bpy.data.objects):
        if not o.users_collection or o.users_collection[0].name != "HANDS":
            bpy.data.objects.remove(o)
    for c in [c for c in bpy.data.collections if c.name != "HANDS"]:
        bpy.data.collections.remove(c)
    for o in bpy.data.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "hands.glb"), export_format="GLB", use_selection=True, export_yup=True,
                              export_extras=True, export_cameras=False, export_lights=False, export_animations=False)
    info = {o.name: {"verts": len(o.data.vertices), "dims": [round(v, 3) for v in o.dimensions]} for o in out_objs}
    print("HANDS", json.dumps(info))


main()

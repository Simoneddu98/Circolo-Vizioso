"""Anziani del circolo ricavati dal bundle CC0 "Human Base Meshes" di Blender Studio.

Dal corpo maschile realistico (A-pose, senza rig):
  1. regioni anatomiche dai face set del bundle -> materiali (pelle, capelli, cardigan, camicia, pantaloni, scarpe)
     e spessore dei vestiti spingendo i vertici lungo le normali;
  2. scheletro semplice con le articolazioni nei punti di contatto tra regioni, pesi automatici (heat);
  3. posa seduta cercata numericamente: glutei sul piano della sedia, suole a terra, avambracci sul tavolo;
  4. coppola, baffi, bottoni e carte in mano costruiti sulla testa, sul petto e sulla mano in posa;
  5. mesh finale statica (posa applicata) nello spazio della sedia: fronte -Y, sedile a SEAT_H.
Riferimento visivo: 15-personaggio-turnaround.png.
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion

BUNDLE = "/Users/simonesanna/Downloads/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend"
if not __import__("os").path.exists(BUNDLE):             # copia nel pacchetto per lo sviluppatore
    BUNDLE = ("/Users/simonesanna/Desktop/circolo-sardegna-assets/consegna/sviluppatore-circolo/asset-esterni/"
              "human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend")
BODY = "GEO-body_male_realistic"
STATURE_SCALE = 1.04        # 1.68 m -> 1.75 m: ginocchio abbastanza alto per una seduta standard da 45 cm

# face set del corpo maschile realistico (letti dal bundle v1.4.1)
FS = {"torso": 1, "eyes": (2, 3), "ears": (4, 5), "nose": 7, "lips": 8, "hand": (9, 10), "farm": (11, 12),
      "foot": (13, 14), "shin": (15, 16), "head": 17, "pelvis": 18, "waist": 19, "uarm": (20, 21), "mouth": 22,
      "thigh": (23, 24)}

VARIANTS = [  # cardigan, pantaloni, coppola, inclinazione testa (gradi), rotazione testa
    ((0.20, 0.19, 0.18), (0.20, 0.12, 0.065), (0.17, 0.12, 0.08), 16, 0),
    ((0.24, 0.15, 0.09), (0.09, 0.09, 0.10), (0.11, 0.10, 0.09), 12, 10),
    ((0.10, 0.14, 0.10), (0.17, 0.13, 0.09), (0.20, 0.15, 0.10), 18, -8),
    ((0.08, 0.09, 0.15), (0.13, 0.10, 0.07), (0.09, 0.08, 0.07), 10, 6),
]

_MATS = {}
EYE_Y = [0.0, 0.0]          # (y, z) degli occhi a riposo, per le sopracciglia

def available():
    import os
    return os.path.exists(BUNDLE)

# ------------------------------------------------------------------ materiali

def _mat(name, color, rough=0.8, img=None, scale=1.0, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if img:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
        tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (scale, scale, 1)
        nt.links.new(tc.outputs["UV"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    m.diffuse_color = (*color, 1)
    return m

def _head_mat():
    """Testa: pelle e capelli grigi sfumati con il colore per vertice (attaccatura morbida)."""
    m = _mat("MAT_Elder_Head", (1, 1, 1), 0.6)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    ca = nt.nodes.new("ShaderNodeVertexColor"); ca.layer_name = "Col"
    nt.links.new(ca.outputs["Color"], b.inputs["Base Color"])
    m.diffuse_color = (*SKIN_RGB, 1)
    return m

def _check_image():
    """Quadretti beige e marroni della camicia (tartan semplice), 64x64."""
    name = "TEX_Shirt_Check"
    img = bpy.data.images.get(name)
    if img:
        return img
    n = 64
    a = np.ones((n, n, 4), np.float32)
    base = np.array([0.80, 0.70, 0.52]); line = np.array([0.45, 0.30, 0.18]); thin = np.array([0.62, 0.50, 0.36])
    a[..., :3] = base
    idx = np.arange(n)
    for k, c, w in ((0, line, 6), (32, thin, 3)):
        m = ((idx - k) % 64) < w
        a[m, :, :3] = a[m, :, :3] * 0.5 + c * 0.5
        a[:, m, :3] = a[:, m, :3] * 0.5 + c * 0.5
    img = bpy.data.images.new(name, n, n)
    img.pixels.foreach_set(a.ravel())
    img.pack()
    return img

def _skin_for(style):
    return _mat("MAT_Barista_Skin" if style is BARISTA_STYLE else "MAT_Elder_Skin", style["skin"], 0.55)

def materials(i):
    cardigan, trousers, cap, _, _ = VARIANTS[(i - 1) % len(VARIANTS)]
    base = {
        "skin": _mat("MAT_Elder_Skin", SKIN_RGB, 0.55),
        "hair": _mat("MAT_Elder_Hair_Grey", (0.27, 0.26, 0.25), 0.75),
        "eyes": _mat("MAT_Elder_Eyes", (0.05, 0.035, 0.03), 0.15),
        "shirt": _mat("MAT_Elder_Shirt_Check", (1, 1, 1), 0.8, img=_check_image(), scale=28),
        "shoes": _mat("MAT_Elder_Shoes", (0.10, 0.05, 0.025), 0.35),
        "button": _mat("MAT_Elder_Button", (0.18, 0.10, 0.05), 0.4),
        "card": _mat("MAT_Card", (0.95, 0.93, 0.86), 0.6),
        "head": _head_mat(),
        "apron": _mat("MAT_Apron", (0.20, 0.12, 0.07), 0.8),
    }
    base["cardigan"] = _mat(f"MAT_Elder_Cardigan_{i:02d}", cardigan, 0.95)
    base["trousers"] = _mat(f"MAT_Elder_Trousers_{i:02d}", trousers, 0.9)
    base["cap"] = _mat(f"MAT_Elder_Cap_{i:02d}", cap, 0.9)
    return base

ORDER = ["skin", "hair", "eyes", "cardigan", "shirt", "trousers", "shoes", "cap", "button", "card", "head", "apron"]
SKIN_RGB = (0.56, 0.33, 0.22)           # lineare (sRGB circa 0.77, 0.61, 0.51): pelle chiara abbronzata
HAIR_RGB = (0.30, 0.29, 0.28)
ELDER_STYLE = dict(skin=SKIN_RGB, hair_rgb=HAIR_RGB, hair="elder", beard=False, apron=False, collar=True,
                   moustache=(0.033, 0.012, 0.010, 8.0))
BARISTA_STYLE = dict(skin=(0.50, 0.28, 0.17), hair_rgb=(0.05, 0.035, 0.025), hair="short", beard=True, apron=True, collar=False,
                     moustache=(0.022, 0.008, 0.006, 4.0), beard_weight=0.62)

# ------------------------------------------------------------------ caricamento e regioni

def _load_template():
    tpl = bpy.data.objects.get("_ELDER_TEMPLATE")
    if tpl:
        return tpl
    with bpy.data.libraries.load(BUNDLE, link=False) as (src, dst):
        dst.objects = [BODY]
    o = dst.objects[0]
    o.name = "_ELDER_TEMPLATE"
    o.modifiers.clear()                                   # multires: si usa il livello base (~10.6k vertici)
    c = o.matrix_world.translation.copy()
    o.data.transform(Matrix.Scale(STATURE_SCALE, 4) @ Matrix.Translation((-c.x, -c.y, 0)))
    o.matrix_world = Matrix.Identity(4)
    return o

def _regions(me):
    fs = np.array([d.value for d in me.attributes[".sculpt_face_set"].data], np.int32)
    pc = np.array([p.center[:] for p in me.polygons], np.float32)
    pn = np.array([p.normal[:] for p in me.polygons], np.float32)
    known = {v for k, v in FS.items() for v in (v if isinstance(v, tuple) else (v,))}
    reg = np.full(len(fs), "", object)
    def isin(key):
        v = FS[key]; return np.isin(fs, v if isinstance(v, tuple) else (v,))
    for k in FS:
        reg[isin(k)] = k
    small = ~np.isin(fs, list(known))                      # dita di mani e piedi
    reg[small & (pc[:, 2] < _z(0.12))] = "foot"
    reg[small & (pc[:, 2] >= _z(0.12))] = "hand"
    return fs, pc, pn, reg

def _side_sets(fs, pc, pair):
    a, b = pair
    xa = pc[fs == a, 0].mean()
    return (a, b) if xa < 0 else (b, a)                   # (destra x<0, sinistra x>0)

def _ring(me, fs, set_a, set_b):
    """Centro dell'anello di vertici condivisi tra due face set: la posizione dell'articolazione."""
    va, vb = set(), set()
    for p, f in zip(me.polygons, fs):
        if f in set_a:
            va.update(p.vertices)
        elif f in set_b:
            vb.update(p.vertices)
    shared = va & vb
    if not shared:
        raise RuntimeError(f"face set non adiacenti: {set_a} / {set_b}")
    return Vector([float(c) for c in np.array([me.vertices[i].co[:] for i in shared]).mean(0)])

# ------------------------------------------------------------------ vestiti

def _z(v):
    return v * STATURE_SCALE

def _eyes(pc, reg):
    e = pc[reg == "eyes"]
    EYE_Y[0], EYE_Y[1] = float(e[:, 1].min()), float(e[:, 2].mean())

def _age_body(me, fs, pc):
    """Da atleta ad anziano: braccia più sottili, pettorali appiattiti, spalle più strette e cadenti, pancetta."""
    R_ua, L_ua = _side_sets(fs, pc, FS["uarm"]); R_fa, L_fa = _side_sets(fs, pc, FS["farm"]); R_hd, L_hd = _side_sets(fs, pc, FS["hand"])
    axes = {}
    for ua, fa, hd in ((R_ua, R_fa, R_hd), (L_ua, L_fa, L_hd)):
        sh = _ring(me, fs, {ua}, {FS["torso"]}); el = _ring(me, fs, {ua}, {fa}); wr = _ring(me, fs, {fa}, {hd})
        axes[ua] = (sh, el); axes[fa] = (el, wr)
    vset = {}
    for p, f in zip(me.polygons, fs):
        if f in axes:
            for v in p.vertices:
                vset[v] = f
    for v, f in vset.items():
        a, b = axes[f]
        co = me.vertices[v].co
        d = (b - a); t = max(0.0, min(1.0, (co - a).dot(d) / d.length_squared))
        proj = a + d * t
        me.vertices[v].co = proj + (co - proj) * 0.86
    for v in me.vertices:
        c = v.co
        if _z(1.15) < c.z < _z(1.46) and c.y < -0.05 and abs(c.x) < 0.2:          # pettorali
            c.y = -0.05 + (c.y + 0.05) * 0.55
        if c.z > _z(1.28) and 0.12 < abs(c.x) < 0.30 and c.z < _z(1.50):            # spalle più strette e cadenti
            k = min(1.0, (abs(c.x) - 0.12) / 0.12)
            c.x *= 1 - 0.05 * k
            c.z -= 0.025 * k
        if c.y < 0.02 and _z(0.82) < c.z < _z(1.30) and abs(c.x) < 0.22:           # pancetta
            c.y -= 0.045 * math.exp(-((c.z - _z(1.0)) / 0.12) ** 2) * math.exp(-(c.x / 0.17) ** 2)

def _dress(me, reg, pc, pn, style=ELDER_STYLE):
    """Assegna i materiali per regione e dà spessore ai vestiti."""
    idx = {k: i for i, k in enumerate(ORDER)}
    mat = np.full(len(reg), idx["skin"], np.int32)
    thick = np.zeros(len(reg), np.float32)
    z, x, y = pc[:, 2], pc[:, 0], pc[:, 1]
    # cardigan: busto, addome, braccia, bacino sopra l'orlo
    card = np.isin(reg, ["torso", "waist", "uarm", "farm"])
    mat[card] = idx["cardigan"]; thick[card] = 0.020
    # colletto della camicia a quadretti: la base del collo (il collo fa parte del face set della testa)
    neck_z = z[(reg == "head")].min()
    if style.get("collar", True):
        collar = (reg == "head") & (z < neck_z + 0.045)
        mat[collar] = idx["shirt"]; thick[collar] = 0.018
    # pantaloni a gamba dritta: più larghi verso la caviglia
    tr = np.isin(reg, ["thigh", "shin", "pelvis"])
    mat[tr] = idx["trousers"]
    thick[tr] = 0.018 + np.clip((_z(0.45) - z[tr]) / 0.35, 0, 1) * 0.010
    # scarpe
    sh = reg == "foot"
    mat[sh] = idx["shoes"]; thick[sh] = 0.016
    # capelli grigi: nuca e tempie (la sommità resta sotto la coppola)
    face = np.isin(reg, ["head", "ears", "nose", "lips", "mouth"]) & (mat == idx["skin"])
    mat[face] = idx["head"]
    mat[np.isin(reg, ["eyes"])] = idx["eyes"]
    if style.get("apron"):                        # grembiule davanti, dalla vita al ginocchio
        ap = np.isin(reg, ["waist", "pelvis", "thigh"]) & (y < -0.005) & (z > _z(0.50)) & (z < _z(1.02))
        mat[ap] = idx["apron"]; thick[ap] = np.maximum(thick[ap], 0.024)
    for p, m in zip(me.polygons, mat):
        p.material_index = int(m)
        p.use_smooth = True
    # via la muscolatura sotto i vestiti: smoothing laplaciano a volume costante (bordi con la pelle esclusi)
    cloth = {idx["cardigan"], idx["shirt"], idx["trousers"], idx["apron"]}
    bm = bmesh.new(); bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    top = max(v.co.z for v in bm.verts if v.link_faces and all(f.material_index in cloth for f in v.link_faces))
    vs = [v for v in bm.verts if v.link_faces and all(f.material_index in cloth for f in v.link_faces) and v.co.z < top - 0.07]
    # media semplice: cancella pettorali, addominali e deltoidi e asciuga i volumi (corpo da anziano)
    for _ in range(30):
        bmesh.ops.smooth_vert(bm, verts=vs, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    shoe = [v for v in bm.verts if v.link_faces and all(f.material_index == idx["shoes"] for f in v.link_faces)]
    for _ in range(20):
        bmesh.ops.smooth_laplacian_vert(bm, verts=shoe, lambda_factor=1.0, lambda_border=0.0,
                                        use_x=True, use_y=True, use_z=True, preserve_volume=True)
    bm.normal_update(); bm.to_mesh(me); bm.free()
    # spessore: ogni vertice prende lo spessore massimo delle facce vicine
    vt = np.zeros(len(me.vertices), np.float32)
    for p, t in zip(me.polygons, thick):
        for v in p.vertices:
            if t > vt[v]:
                vt[v] = t
    nb = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices; nb[a].append(b); nb[b].append(a)
    skin_only = np.ones(len(me.vertices), bool)                # vertici toccati solo da facce di pelle/testa/occhi
    bare = {idx["skin"], idx["head"], idx["eyes"]}
    for p, m in zip(me.polygons, mat):
        if m not in bare:
            skin_only[list(p.vertices)] = False
    for _ in range(6):
        vt = np.array([max(vt[i], 0.5 * vt[i] + 0.5 * (sum(vt[j] for j in nb[i]) / max(1, len(nb[i])))) for i in range(len(vt))], np.float32)
        vt[skin_only] = 0.0                                     # il bordo del vestito resta netto (polsini, colletto)
    # capelli grigi su nuca e tempie (sotto la coppola): peso per vertice sfumato sui vicini -> colore per vertice
    hw = np.zeros(len(me.vertices), np.float32)
    head_v = np.zeros(len(me.vertices), bool)
    for p, m in zip(me.polygons, mat):
        if m == idx["head"]:
            head_v[list(p.vertices)] = True
    lips_v = np.zeros(len(me.vertices), bool)
    for p, r in zip(me.polygons, reg):
        if r == "lips":
            lips_v[list(p.vertices)] = True
    hco = np.array([me.vertices[i].co[:] for i in np.nonzero(head_v)[0]])
    h_front, h_back = hco[:, 1].min(), hco[:, 1].max()
    h_cy = (h_front + h_back) / 2
    eye_z = EYE_Y[1] if EYE_Y[1] else _z(1.585)
    for i, v in enumerate(me.vertices):
        if head_v[i]:
            c = v.co
            if style["hair"] == "elder":
                back = c.z > _z(1.535) and c.y > 0.005
                side = abs(c.x) > 0.068 and c.z > _z(1.565) and c.y > -0.035
                hair = back or side or c.z > _z(1.64)
            else:
                # capelli corti riferiti alla testa: tutto sopra la fronte, tempie sopra l'orecchio, nuca fino alla base del cranio
                face = c.y < h_front + 0.055 and abs(c.x) < 0.07
                hair = (c.z > eye_z + 0.045 and not (face and c.z < eye_z + 0.06)) or \
                       (c.z > eye_z - 0.005 and abs(c.x) > 0.072 and c.y > h_cy - 0.01) or \
                       (c.z > eye_z - 0.09 and c.y > h_cy + 0.035)
            beard = bool(style.get("beard")) and c.z < eye_z - 0.04 and c.z > neck_z + 0.035 and c.y < h_cy + 0.025 and not lips_v[i]
            if hair:
                hw[i] = 1.0
            elif beard:
                hw[i] = style.get("beard_weight", 1.0)      # barba corta: tono scuro sulla pelle, non nero pieno
    for _ in range(3):
        hw = np.array([0.5 * hw[i] + 0.5 * (sum(hw[j] for j in nb[i]) / max(1, len(nb[i]))) if head_v[i] else 0.0
                       for i in range(len(hw))], np.float32)
    col = me.color_attributes.get("Col") or me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    sk, hr = np.array(style["skin"]), np.array(style["hair_rgb"])
    rgba = np.ones((len(me.vertices), 4), np.float32)
    rgba[head_v, :3] = sk * (1 - hw[head_v, None]) + hr * hw[head_v, None]
    col.data.foreach_set("color", rgba.ravel())
    me.color_attributes.active_color = col
    for v, t, w in zip(me.vertices, vt, hw):
        t = float(t) + 0.004 * float(w)                     # i capelli sporgono appena dalla pelle
        if t:
            v.co += v.normal * t

# ------------------------------------------------------------------ scheletro e pesi

def _rig(body, me, fs, pc):
    if USE_RIGIFY:
        return _rig_rigify(body, me, fs, pc)
    _, J, _ = _rig_joints(me, fs, pc)
    return _rig_custom(body, me, J)


def _rig_joints(me, fs, pc):
    R_th, L_th = _side_sets(fs, pc, FS["thigh"]); R_sh, L_sh = _side_sets(fs, pc, FS["shin"])
    R_ft, L_ft = _side_sets(fs, pc, FS["foot"]); R_ua, L_ua = _side_sets(fs, pc, FS["uarm"])
    R_fa, L_fa = _side_sets(fs, pc, FS["farm"]); R_hd, L_hd = _side_sets(fs, pc, FS["hand"])
    J = {}
    for side, th, sh, ft, ua, fa, hd in (("R", R_th, R_sh, R_ft, R_ua, R_fa, R_hd), ("L", L_th, L_sh, L_ft, L_ua, L_fa, L_hd)):
        J["hip." + side] = _ring(me, fs, {th}, {FS["pelvis"]})
        J["knee." + side] = _ring(me, fs, {th}, {sh})
        J["ankle." + side] = _ring(me, fs, {sh}, {ft})
        J["shoulder." + side] = _ring(me, fs, {ua}, {FS["torso"]})
        J["elbow." + side] = _ring(me, fs, {ua}, {fa})
        J["wrist." + side] = _ring(me, fs, {fa}, {hd})
        foot_pts = np.array([me.vertices[v].co[:] for p, f in zip(me.polygons, fs) if f == ft for v in p.vertices])
        J["toe." + side] = Vector((J["ankle." + side].x, float(foot_pts[:, 1].min()), _z(0.03)))
        hand_pts = np.array([me.vertices[v].co[:] for p, f in zip(me.polygons, fs) if f == hd for v in p.vertices])
        w = np.array(J["wrist." + side][:])
        J["handtip." + side] = Vector([float(c) for c in hand_pts[np.argmax(((hand_pts - w) ** 2).sum(1))]])
    J["waist"] = _ring(me, fs, {FS["pelvis"]}, {FS["waist"]})
    J["chest"] = _ring(me, fs, {FS["waist"]}, {FS["torso"]})
    J["neck"] = _ring(me, fs, {FS["torso"]}, {FS["head"]})     # nel bundle il collo appartiene al face set della testa
    J["headbase"] = J["neck"] + Vector((0, 0.01, _z(0.09)))
    head_pts = np.array([me.vertices[v].co[:] for p, f in zip(me.polygons, fs) if f == FS["head"] for v in p.vertices])
    J["headtop"] = Vector((0, J["headbase"].y, float(head_pts[:, 2].max())))
    J["pelvis"] = Vector((0, J["waist"].y, (J["hip.R"].z + J["hip.L"].z) / 2))
    return None, J, 0


def _rig_custom(body, me, J):
    ad = bpy.data.armatures.new(body.name + "_Rig")
    arm = bpy.data.objects.new(body.name + "_Rig", ad)
    body.users_collection[0].objects.link(arm)
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    vl.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = ad.edit_bones

    def bone(name, h, t, parent=None, connect=False):
        b = eb.new(name); b.head = h; b.tail = t
        if parent:
            b.parent = eb[parent]; b.use_connect = connect
        return b

    bone("pelvis", J["pelvis"], J["waist"])
    bone("spine", J["waist"], J["chest"], "pelvis", True)
    bone("chest", J["chest"], J["neck"], "spine", True)
    bone("neck", J["neck"], J["headbase"], "chest", True)
    bone("head", J["headbase"], J["headtop"], "neck", True)
    for s in ("R", "L"):
        bone("thigh." + s, J["hip." + s], J["knee." + s], "pelvis")
        bone("shin." + s, J["knee." + s], J["ankle." + s], "thigh." + s, True)
        bone("foot." + s, J["ankle." + s], J["toe." + s], "shin." + s, True)
        bone("upperarm." + s, J["shoulder." + s], J["elbow." + s], "chest")
        bone("forearm." + s, J["elbow." + s], J["wrist." + s], "upperarm." + s, True)
        bone("hand." + s, J["wrist." + s], J["handtip." + s], "forearm." + s, True)
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in vl.objects:
        o.select_set(False)
    body.select_set(True); arm.select_set(True); vl.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    # controllo: ogni vertice deve avere almeno un peso, altrimenti pesi di ripiego dai face set
    unweighted = sum(1 for v in me.vertices if not any(g.weight > 1e-4 for g in v.groups))
    return arm, J, unweighted

# ------------------------------------------------------------------ Rigify

USE_RIGIFY = True
# nomi logici usati dal codice delle pose -> controlli FK del rig generato da Rigify
RIGIFY_CTRL = {"pelvis": "torso", "spine": "spine_fk.001", "chest": "spine_fk.002", "neck": "neck", "head": "head"}
for _s in "RL":
    RIGIFY_CTRL.update({f"thigh.{_s}": f"thigh_fk.{_s}", f"shin.{_s}": f"shin_fk.{_s}", f"foot.{_s}": f"foot_fk.{_s}",
                        f"upperarm.{_s}": f"upper_arm_fk.{_s}", f"forearm.{_s}": f"forearm_fk.{_s}", f"hand.{_s}": f"hand_fk.{_s}"})
# ossa di deformazione (esportate nel glb) per accessori e oggetti tenuti in mano
RIGIFY_DEF = {"head": "DEF-spine.006", "chest": "DEF-spine.003", "hand.R": "DEF-hand.R", "hand.L": "DEF-hand.L"}
FINGER_RIGIFY = {"thumb": "thumb", "index": "f_index", "middle": "f_middle", "ring": "f_ring", "pinky": "f_pinky"}


def _is_rigify(arm):
    return bool(arm.get("rigify"))


def _bname(arm, name):
    """Nome logico -> osso reale (controllo FK in Rigify). Dita: 'index.2.R' -> 'f_index.02.R'."""
    if not _is_rigify(arm):
        return name
    if name in RIGIFY_CTRL:
        return RIGIFY_CTRL[name]
    parts = name.split(".")
    if len(parts) == 3 and parts[0] in FINGER_RIGIFY:
        return f"{FINGER_RIGIFY[parts[0]]}.{int(parts[1]):02d}.{parts[2]}"
    return name


def _pb(arm, name):
    return arm.pose.bones[_bname(arm, name)]


def _bone(arm, name):
    return arm.data.bones[_bname(arm, name)]


def _defname(arm, name):
    return RIGIFY_DEF.get(name, name) if _is_rigify(arm) else name


def _face_set_mirror(me, fs, ids):
    """Per ogni face set del lato destro (x < 0) l'id del face set simmetrico sul lato sinistro."""
    cent = {}
    for p, f in zip(me.polygons, fs):
        cent.setdefault(int(f), []).append(p.center[:])
    cent = {k: np.array(v).mean(0) for k, v in cent.items()}
    out = {}
    for i in ids:
        if i not in cent:
            continue
        m = cent[i] * np.array([-1, 1, 1])
        out[i] = min((k for k in cent if cent[k][0] > 0), key=lambda k: float(((cent[k] - m) ** 2).sum()))
    return out


def _hand_joints(me, fs, side):
    """Articolazioni delle dita dai face set: {dito: [base, nocca media, nocca distale, punta]}, e il centro del palmo."""
    mirror = {} if side == "R" else _face_set_mirror(me, fs, [PALM_R] + [x for c in FINGERS_R.values() for x in c])
    sid = lambda x: mirror.get(x, x)
    def vset(x):
        return {i for p, f in zip(me.polygons, fs) if f == sid(x) for i in p.vertices}
    def mean(ids):
        return Vector(np.array([me.vertices[i].co[:] for i in ids]).mean(0).tolist())
    palm = vset(PALM_R)
    J = {}
    for name, sets in FINGERS_R.items():
        vs = [vset(x) for x in sets]
        a, b, c = palm & vs[0], vs[0] & vs[1], vs[1] & vs[2]
        if not (a and b and c):
            return None
        pc_ = mean(c)
        arr = np.array([me.vertices[i].co[:] for i in vs[2] | vs[3]])
        tip = Vector(arr[np.argmax(((arr - np.array(pc_[:])) ** 2).sum(1))].tolist())
        J[name] = [mean(a), mean(b), pc_, tip]
    return J


def _rig_rigify(body, me, fs, pc):
    """Scheletro Rigify: metarig umano adattato alle articolazioni del corpo (colonna, braccia, gambe e le quattro
    articolazioni di ogni dito di entrambe le mani, misurate sui face set), rig generato, pesi automatici sulle ossa DEF.
    Le pose si danno ai controlli FK (IK_FK = 1)."""
    _, J, _ = _rig_joints(me, fs, pc)
    H = {s: _hand_joints(me, fs, s) for s in "RL"}
    return rig_from_joints(body, me, J, H)


def rig_from_joints(body, me, J, H):
    """Rig Rigify da articolazioni date (spazio del corpo, Z in alto, fronte -Y). J: chiavi come _rig_joints;
    H: {'R'|'L': {dito: [base, nocca, nocca distale, punta]}} oppure None. Usato anche per i modelli Meshy."""
    import addon_utils
    addon_utils.enable("rigify", default_set=True)
    vl = bpy.context.view_layer
    for o in vl.objects:
        o.select_set(False)
    bpy.ops.object.armature_human_metarig_add()
    meta = bpy.context.object
    meta.location = (0, 0, 0)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = meta.data.edit_bones
    # niente volto, seni e ossa del bacino: non servono e appesantiscono il glb
    drop = {"breast.L", "breast.R", "pelvis.L", "pelvis.R"}
    face = eb.get("face")
    if face:
        drop |= {b.name for b in face.children_recursive} | {"face"}
    for n in list(drop):
        if n in eb:
            eb.remove(eb[n])
    connected = {b.name: b.use_connect for b in eb}          # collegamenti originali del metarig (Rigify li richiede così)
    for b in eb:
        b.use_connect = False
    def put(n, h, t):
        b = eb[n]; b.head = h; b.tail = t
    lerp = lambda a, b, k: a + (b - a) * k
    p3 = lerp(J["chest"], J["neck"], 0.55)
    nk = lerp(J["neck"], J["headbase"], 0.5)
    for n, h, t in (("spine", J["pelvis"], J["waist"]), ("spine.001", J["waist"], J["chest"]), ("spine.002", J["chest"], p3),
                    ("spine.003", p3, J["neck"]), ("spine.004", J["neck"], nk), ("spine.005", nk, J["headbase"]),
                    ("spine.006", J["headbase"], J["headtop"])):
        put(n, h, t)
    for s, sx in (("R", -1), ("L", 1)):
        sh = J["shoulder." + s]
        put(f"shoulder.{s}", Vector((sx * 0.02, sh.y + 0.01, sh.z + 0.01)), sh)
        put(f"upper_arm.{s}", sh, J["elbow." + s])
        put(f"forearm.{s}", J["elbow." + s], J["wrist." + s])
        hj = H[s]
        w = J["wrist." + s]
        knuckles = sum((hj[f][0] for f in ("index", "middle", "ring", "pinky")), Vector()) / 4 if hj else J["handtip." + s]
        put(f"hand.{s}", w, knuckles)
        if hj:
            for k, f in enumerate(("index", "middle", "ring", "pinky"), 1):
                put(f"palm.0{k}.{s}", lerp(w, hj[f][0], 0.18), hj[f][0])
            for f, pre in FINGER_RIGIFY.items():
                a, b, c, d = hj[f]
                put(f"{pre}.01.{s}", a, b); put(f"{pre}.02.{s}", b, c); put(f"{pre}.03.{s}", c, d)
            # rollio delle dita: asse Z verso il dorso della mano (la flessione è attorno a X)
            d_index = (hj["index"][1] - hj["index"][0]).normalized()
            across = (hj["pinky"][0] - hj["index"][0]).normalized()
            n_palm = d_index.cross(across).normalized() * (1 if s == "R" else -1)
            for f, pre in FINGER_RIGIFY.items():
                for k in (1, 2, 3):
                    eb[f"{pre}.0{k}.{s}"].align_roll(-n_palm)
        put(f"thigh.{s}", J["hip." + s], J["knee." + s])
        put(f"shin.{s}", J["knee." + s], J["ankle." + s])
        put(f"foot.{s}", J["ankle." + s], J["toe." + s])
        put(f"toe.{s}", J["toe." + s], J["toe." + s] + Vector((0, -0.05, 0)))
        a = J["ankle." + s]
        put(f"heel.02.{s}", Vector((a.x - sx * 0.035, a.y + 0.04, 0.0)), Vector((a.x + sx * 0.035, a.y + 0.04, 0.0)))
    # si ripristinano i collegamenti del metarig: le posizioni scelte sopra li rispettano (testa del figlio = coda del padre)
    for b in eb:
        if connected.get(b.name) and b.parent:
            b.use_connect = True
    bpy.ops.object.mode_set(mode="OBJECT")
    before = set(bpy.data.objects)
    bpy.ops.pose.rigify_generate()
    rig = getattr(meta.data, "rigify_target_rig", None) or next(o for o in bpy.data.objects if o not in before and o.type == "ARMATURE")
    meta.data.rigify_target_rig = None if hasattr(meta.data, "rigify_target_rig") else None   # il prossimo personaggio genera un rig nuovo
    rig.name = body.name + "_Rig"; rig.data.name = body.name + "_RigData"
    # via metarig e widget (non vanno nel glb)
    for coll in [c for c in bpy.data.collections if c.name.startswith("WGTS")]:
        for o in list(coll.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.collections.remove(coll)
    bpy.data.objects.remove(meta, do_unlink=True)
    if rig.users_collection[0] != body.users_collection[0]:
        for c in list(rig.users_collection):
            c.objects.unlink(rig)
        body.users_collection[0].objects.link(rig)
    rig["rigify"] = True
    for s in "RL":                                          # braccia e gambe in FK: le pose sono rotazioni dirette
        for n in (f"upper_arm_parent.{s}", f"thigh_parent.{s}"):
            if n in rig.pose.bones and "IK_FK" in rig.pose.bones[n].keys():
                rig.pose.bones[n]["IK_FK"] = 1.0
        hj = H[s]
        if hj:
            d_index = (hj["index"][1] - hj["index"][0]).normalized()
            across = (hj["pinky"][0] - hj["index"][0]).normalized()
            rig[f"palm_n_{s}"] = list(d_index.cross(across).normalized() * (1 if s == "R" else -1))
            rig[f"palm_across_{s}"] = list(across)
    vl.update()
    for o in bpy.context.scene.objects:
        if o:
            o.select_set(False)
    body.select_set(True); rig.select_set(True); vl.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    unweighted = sum(1 for v in me.vertices if not any(g.weight > 1e-4 for g in v.groups))
    return rig, J, unweighted


# ------------------------------------------------------------------ posa

def _set_pose(arm, targets):
    """targets: bone -> Quaternion assoluta (spazio armatura) rispetto al riposo, applicata alla testa dell'osso."""
    vl = bpy.context.view_layer
    for pb in arm.pose.bones:
        if pb.name.startswith(("MCH-", "ORG-", "DEF-")):
            continue
        pb.rotation_mode = "QUATERNION"; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    vl.update()
    order = ["pelvis", "spine", "chest", "neck", "head"] + [f"{b}.{s}" for s in "RL" for b in ("thigh", "shin", "foot", "upperarm", "forearm", "hand")]
    for name in order:
        pb = _pb(arm, name)
        q = targets.get(name, Quaternion())
        rest = pb.bone.matrix_local
        head_now = pb.head.copy()                           # testa già spostata dalla posa del genitore
        pb.matrix = Matrix.Translation(head_now) @ q.to_matrix().to_4x4() @ Matrix.Translation(-rest.translation) @ rest
        vl.update()
    for s in "RL":
        if targets.get("curl." + s) and f"palm_n_{s}" in arm.keys():
            _apply_curl(arm, targets["curl." + s], targets.get("spread." + s, 0.0), s)

FINGERS_R = {"thumb": (84, 85, 86, 87), "index": (88, 89, 90, 91), "middle": (92, 93, 94, 95),
             "ring": (96, 97, 98, 99), "pinky": (100, 101, 102, 103)}      # face set delle dita della mano destra (bundle v1.4.1)
PALM_R = 10
GRIP = {"thumb": (30, 30, 20), "index": (50, 65, 45), "middle": (52, 68, 45), "ring": (55, 70, 45), "pinky": (58, 72, 45)}


def _curl(k, grip=GRIP):
    """Flessione delle dita (gradi per falange) scalata da 0 (aperta) a 1 (pugno sulla presa)."""
    return {f: tuple(a * k for a in angs) for f, angs in grip.items()}


def _add_fingers(arm, body, me):
    """Tre ossa per dito della mano destra, figlie di hand.R, con pesi rigidi presi dai face set.
    Senza dita il personaggio non può stringere nulla: la mano è un blocco unico con le dita aperte.
    Con Rigify le dita di entrambe le mani sono già nel rig (con pesi automatici morbidi)."""
    if _is_rigify(arm):
        return "palm_n_R" in arm.keys()
    fs = np.array([d.value for d in me.attributes[".sculpt_face_set"].data])
    def vset(sid):
        return {i for p, f in zip(me.polygons, fs) if f == sid for i in p.vertices}
    def mean(ids):
        return Vector(np.array([me.vertices[i].co[:] for i in ids]).mean(0).tolist())
    palm = vset(PALM_R)
    J, members = {}, {}
    for name, sets in FINGERS_R.items():
        vs = [vset(x) for x in sets]
        a, b, c = palm & vs[0], vs[0] & vs[1], vs[1] & vs[2]
        if not (a and b and c):
            return False
        pc_ = mean(c)
        arr = np.array([me.vertices[i].co[:] for i in vs[2] | vs[3]])
        tip = Vector(arr[np.argmax(((arr - np.array(pc_[:])) ** 2).sum(1))].tolist())
        J[name] = [mean(a), mean(b), pc_, tip]
        members[name] = vs
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    for name, (a, b, c, d) in J.items():
        prev = "hand.R"
        for k, (h, t) in enumerate(((a, b), (b, c), (c, d)), 1):
            bn = eb.new(f"{name}.{k}.R"); bn.head = h; bn.tail = t; bn.parent = eb[prev]
            prev = bn.name
    bpy.ops.object.mode_set(mode="OBJECT")
    owner = {}
    for name, vs in members.items():
        for k, sv in enumerate(vs):
            for i in sv:
                owner.setdefault(i, set()).add(f"{name}.{min(k, 2) + 1}.R")
    for i in owner:
        if i in palm:
            owner[i].add("hand.R")                         # giunzione con il palmo: metà e metà
    ids = list(owner)
    for g in body.vertex_groups:
        g.remove(ids)
    groups = {g.name: g for g in body.vertex_groups}
    for i, bs in owner.items():
        for b in bs:
            g = groups.get(b) or body.vertex_groups.new(name=b)
            groups[b] = g
            g.add([i], 1.0 / len(bs), "REPLACE")
    d_index = (J["index"][1] - J["index"][0]).normalized()
    across = (J["pinky"][0] - J["index"][0]).normalized()
    arm["palm_n_R"] = list(d_index.cross(across).normalized())
    arm["palm_across_R"] = list(across)
    return True


def _apply_curl(arm, curl, spread=0.0, side="R"):
    """curl: gradi per falange; spread (0..1): chiude le dita verso il medio nel piano del palmo (le dita del modello
    a riposo sono divaricate)."""
    n = Vector(arm[f"palm_n_{side}"]); across = Vector(arm[f"palm_across_{side}"])
    mid = arm.pose.bones.get(_bname(arm, f"middle.1.{side}"))
    md = (mid.bone.tail_local - mid.bone.head_local).normalized() if mid else None
    for name, angs in curl.items():
        for k, a in enumerate(angs, 1):
            pb = arm.pose.bones.get(_bname(arm, f"{name}.{k}.{side}"))
            if pb is None:
                continue
            b = pb.bone
            d = (b.tail_local - b.head_local).normalized()
            ax = d.cross(n if name != "thumb" else (n + across * 0.6).normalized()).normalized()
            q = Quaternion(ax, math.radians(a))
            if (q @ d).dot(n) < d.dot(n):                  # la flessione porta il dito verso il palmo
                q = Quaternion(ax, -math.radians(a))
            if spread and k == 1 and md is not None and name in ("index", "ring", "pinky"):
                dp = (d - n * d.dot(n)).normalized(); mp = (md - n * md.dot(n)).normalized()
                ang = math.atan2(n.dot(dp.cross(mp)), dp.dot(mp))
                q = Quaternion(n, ang * spread) @ q
            M3 = b.matrix_local.to_3x3()
            pb.rotation_quaternion = (M3.inverted() @ q.to_matrix() @ M3).to_quaternion()
    bpy.context.view_layer.update()


def _dir_rot(arm, bone, target_dir):
    b = _bone(arm, bone)
    d = (b.tail_local - b.head_local).normalized()
    return d.rotation_difference(Vector(target_dir).normalized())

def _seated_targets(arm, thigh_down, shin_fwd, lean, head_pitch, head_yaw, table_reach):
    t = {}
    th = math.radians(thigh_down); sh = math.radians(shin_fwd)
    for s, sx in (("R", -1), ("L", 1)):
        t["thigh." + s] = _dir_rot(arm, "thigh." + s, (sx * 0.04, -math.cos(th), -math.sin(th)))
        t["shin." + s] = _dir_rot(arm, "shin." + s, (sx * 0.01, -math.sin(sh), -math.cos(sh)))
        t["foot." + s] = _dir_rot(arm, "foot." + s, (-sx * 0.03, -1.0, -0.25))
        t["upperarm." + s] = _dir_rot(arm, "upperarm." + s, (sx * 0.12, -0.34, -0.93))
        t["forearm." + s] = _dir_rot(arm, "forearm." + s, (-sx * 0.28, -0.96, table_reach))
        t["hand." + s] = _dir_rot(arm, "hand." + s, (-sx * 0.22, -0.95, table_reach - 0.12))
    lean_q = Quaternion((1, 0, 0), math.radians(lean))
    t["spine"] = Quaternion((1, 0, 0), math.radians(lean * 0.5))
    t["chest"] = lean_q
    t["neck"] = lean_q
    t["head"] = Quaternion((0, 0, 1), math.radians(head_yaw)) @ Quaternion((1, 0, 0), math.radians(lean + head_pitch))
    return t

def _eval_mesh(body):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    return co.reshape(-1, 3)

# ------------------------------------------------------------------ accessori

def _ellipsoid_cap(bm, center, rx, ry, rz, m_idx, seg=32, rings=8):
    """Calotta superiore di un ellissoide (coppola) con bordo chiuso."""
    verts = []
    for r in range(rings + 1):
        phi = (math.pi / 2) * r / rings
        ring = []
        for s in range(seg):
            a = 2 * math.pi * s / seg
            ring.append(bm.verts.new((center.x + rx * math.cos(phi) * math.cos(a), center.y + ry * math.cos(phi) * math.sin(a),
                                      center.z + rz * math.sin(phi))))
        verts.append(ring)
    faces = []
    for r in range(rings):
        for s in range(seg):
            a, b = verts[r][s], verts[r][(s + 1) % seg]
            c, d = verts[r + 1][(s + 1) % seg], verts[r + 1][s]
            faces.append(bm.faces.new((a, b, c, d) if r < rings else (a, b, c)))
    faces.append(bm.faces.new(list(reversed(verts[0]))))
    for f in faces:
        f.material_index = m_idx; f.smooth = True
    return faces

def _accessories(J, D, mats_idx, head_pts, card_hand, cap=True, buttons=True, moustache=(0.033, 0.012, 0.010, 8.0)):
    """Coppola, visiera, baffi, bottoni e carte, costruiti a riposo e portati nella posa con le matrici D degli ossi."""
    bm = bmesh.new()
    hp = head_pts
    cx = 0.0; cy = float(hp[:, 1].mean()) + 0.004
    top = float(hp[:, 2].max())
    upper = hp[hp[:, 2] > top - 0.09]
    rx = float(upper[:, 0].max() - upper[:, 0].min()) / 2 + 0.010
    ry = float(upper[:, 1].max() - upper[:, 1].min()) / 2 + 0.012
    cy = float(upper[:, 1].mean())
    # coppola: calotta bassa e allungata in avanti, leggermente schiacciata sulla fronte
    cap_c = Vector((cx, cy - 0.004, top - 0.068))
    if not cap:
        bm_cap = bmesh.new()                       # niente coppola: costruita e scartata per non cambiare il resto
        faces = _ellipsoid_cap(bm_cap, cap_c, rx + 0.004, ry + 0.004, 0.08, mats_idx["cap"])
    else:
        faces = _ellipsoid_cap(bm, cap_c, rx + 0.004, ry + 0.004, 0.08, mats_idx["cap"])
    fv = {v for f in faces for v in f.verts}
    for v in fv:                                             # la parte anteriore scende verso la visiera
        fwd = max(0.0, (cap_c.y - v.co.y) / ry)
        v.co.z -= 0.022 * fwd * max(0.0, (v.co.z - cap_c.z) / 0.078)
    # visiera
    vis = bmesh.ops.create_cone(bm if cap else bm_cap, cap_ends=True, cap_tris=False, segments=24, radius1=rx * 0.85, radius2=rx * 0.85, depth=0.006,
                                matrix=Matrix.Translation((cx, cy - ry * 0.62, cap_c.z - 0.002)) @ Matrix.Rotation(math.radians(-10), 4, "X"))
    by = cy - ry * 0.62
    for v in vis["verts"]:
        d = v.co.y - by
        v.co.y = by + (d * 0.12 if d > 0 else d * 0.55)       # mezzaluna corta davanti, niente dietro
    for f in {f for v in vis["verts"] for f in v.link_faces}:
        f.material_index = mats_idx["cap"]; f.smooth = True
    head_geo = [v for v in bm.verts]
    if not cap:
        bm_cap.free()
    # baffi: due gocce sotto il naso
    nose_y = float(hp[(hp[:, 2] > _z(1.52)) & (hp[:, 2] < _z(1.57)), 1].min())
    # baffi a manubrio spiovente: un solo ellissoide piegato verso il basso alle estremità
    lip = hp[(hp[:, 2] > _z(1.500)) & (hp[:, 2] < _z(1.525)) & (np.abs(hp[:, 0]) < 0.02)]
    lip_y = float(lip[:, 1].min()) if len(lip) else nose_y + 0.02
    mc = Vector((0, lip_y - 0.004, _z(1.523)))
    r = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=10, radius=1.0,
                                  matrix=Matrix.Translation(mc) @ Matrix.Diagonal((moustache[0], moustache[1], moustache[2], 1)))
    for v in r["verts"]:
        dx = v.co.x - mc.x
        v.co.z -= moustache[3] * dx * dx             # punte che scendono
        v.co.y += 9.0 * dx * dx                      # le punte seguono la curva del labbro
    for f in {f for v in r["verts"] for f in v.link_faces}:
        f.material_index = mats_idx["hair"]; f.smooth = True
    head_geo += r["verts"]
    for sx in (-1, 1):                                        # sopracciglia
        r = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0,
                                      matrix=Matrix.Translation((sx * 0.036, EYE_Y[0] - 0.002, EYE_Y[1] + 0.006)) @ Matrix.Rotation(math.radians(-sx * 8), 4, "Y")
                                      @ Matrix.Diagonal((0.022, 0.007, 0.006, 1)))
        for f in {f for v in r["verts"] for f in v.link_faces}:
            f.material_index = mats_idx["hair"]; f.smooth = True
        head_geo += r["verts"]
    bmesh.ops.transform(bm, matrix=D["head"], verts=head_geo)
    # bottoni del cardigan sul petto (posizione a riposo, portati con l'osso "chest")
    btn = []
    for k, zz in enumerate(np.linspace(_z(0.97), _z(1.24), 5) if buttons else []):
        r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=10, radius1=0.008, radius2=0.008, depth=0.004,
                                  matrix=Matrix.Translation((0, J["front_y"](zz) - 0.002, zz)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
        for f in {f for v in r["verts"] for f in v.link_faces}:
            f.material_index = mats_idx["button"]
        btn += r["verts"]
    bmesh.ops.transform(bm, matrix=D["chest"], verts=btn)
    # carte a ventaglio nella mano destra (già in posa)
    if card_hand is None:
        return bm
    hc, fwd = card_hand
    for k in range(5):
        a = math.radians(-24 + 12 * k)
        r = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation(hc + Vector((0, 0, 0.045))) @ Matrix.Rotation(math.atan2(fwd.x, -fwd.y), 4, "Z")
                                  @ Matrix.Rotation(math.radians(-60), 4, "X") @ Matrix.Rotation(a, 4, "Y")
                                  @ Matrix.Translation((0, 0.001 * k, 0.03)) @ Matrix.Diagonal((0.052, 0.0012, 0.085, 1)))
        for f in {f for v in r["verts"] for f in v.link_faces}:
            f.material_index = mats_idx["card"]
    return bm

# ------------------------------------------------------------------ costruzione

def _inside(co, boxes, margin=0.003):
    n = 0
    for mn, mx in boxes:
        m = np.all((co > np.array(mn) - margin) & (co < np.array(mx) + margin), axis=1)
        n += int(m.sum())
    return n

def build_elder(i, seat_h, back_y, table_top, name=None, chair_boxes=(), table_dist=None, table_edge=0.27):
    """Mesh dell'anziano i seduto, nello spazio della sedia (fronte -Y, seduta a seat_h, schienale a back_y).
    Ritorna (mesh, info)."""
    name = name or f"NPC_Elder_{i:02d}_Mesh"
    _, _, _, head_pitch, head_yaw = VARIANTS[(i - 1) % len(VARIANTS)]
    tpl = _load_template()
    coll = bpy.data.collections.get("_TMP") or bpy.data.collections.new("_TMP")
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    body = tpl.copy(); body.data = tpl.data.copy(); body.name = f"_elder_{i}"
    coll.objects.link(body)
    me = body.data
    me.materials.clear()
    mats = materials(i)
    for k in ORDER:
        me.materials.append(mats[k])
    idx = {k: n for n, k in enumerate(ORDER)}
    fs, pc, pn, reg = _regions(me)
    _age_body(me, fs, pc)
    _dress(me, reg, pc, pn)
    _eyes(pc, reg)
    arm, J, unweighted = _rig(body, me, fs, pc)
    rest = np.array([v.co[:] for v in me.vertices], np.float32)
    head_mask = np.zeros(len(me.vertices), bool)
    for p, f in zip(me.polygons, fs):
        if f == FS["head"]:
            head_mask[list(p.vertices)] = True
    torso_front = rest[np.abs(rest[:, 0]) < 0.02]
    J["front_y"] = lambda z: float(torso_front[np.abs(torso_front[:, 2] - z) < 0.02, 1].min())
    seat_mask = np.zeros(len(me.vertices), bool)
    back_mask = np.zeros(len(me.vertices), bool)
    for p, r in zip(me.polygons, reg):
        if r in ("pelvis", "thigh"):
            seat_mask[list(p.vertices)] = True
        if r in ("pelvis", "waist", "torso"):
            back_mask[list(p.vertices)] = True
    legs_mask = np.zeros(len(me.vertices), bool)
    for p, r in zip(me.polygons, reg):
        if r in ("thigh", "shin", "foot"):
            legs_mask[list(p.vertices)] = True
    sole_mask = np.zeros(len(me.vertices), bool)
    for p, r in zip(me.polygons, reg):
        if r == "foot":
            sole_mask[list(p.vertices)] = True

    # ricerca della posa: glutei sul sedile, suole a terra
    best = None
    for thigh_down in np.arange(0, 19.5, 1.5):
        for shin_fwd in (-4, -2, 0, 2, 4):
            tg = _seated_targets(arm, thigh_down, shin_fwd, 8, head_pitch, head_yaw, 0.12)
            _set_pose(arm, tg)
            co = _eval_mesh(body)
            dy = back_y - co[back_mask & (co[:, 2] < _z(1.05)), 1].max()
            dz = -co[sole_mask, 2].min()
            c2 = co + np.array([0, dy, dz])
            over_seat = seat_mask & (c2[:, 1] > -0.24) & (c2[:, 1] < back_y)
            seat_contact = c2[over_seat, 2].min() if over_seat.any() else 9
            gap = seat_contact - (seat_h + 0.003)
            err = abs(gap) + (0.05 if gap < -0.004 else 0.0)        # meglio 3 mm sopra che dentro il sedile
            err += 0.004 * _inside(c2[legs_mask & ~over_seat], chair_boxes)  # polpacci contro il bordo o le gambe della sedia
            if table_dist:                                                  # piedi nel proprio quarto sotto il tavolo
                f = c2[sole_mask]
                err += 0.004 * int((np.abs(f[:, 0]) > f[:, 1] + table_dist - 0.03).sum())
            if best is None or err < best[0]:
                best = (err, thigh_down, shin_fwd, dy, dz, seat_contact)
    _, thigh_down, shin_fwd, dy, dz, seat_contact = best
    # avambracci sopra il tavolo: alzo la punta finché le mani stanno sopra il piano
    for reach in (-0.2, -0.14, -0.08, -0.03, 0.02, 0.07, 0.12, 0.2, 0.3):
        tg = _seated_targets(arm, thigh_down, shin_fwd, 8, head_pitch, head_yaw, reach)
        _set_pose(arm, tg)
        co = _eval_mesh(body) + np.array([0, dy, dz])
        arms = np.zeros(len(me.vertices), bool)
        for p, r in zip(me.polygons, reg):
            if r in ("farm", "hand"):
                arms[list(p.vertices)] = True
        over_table = arms & (co[:, 1] < -table_edge)
        if not over_table.any() or co[over_table, 2].min() > table_top + 0.012:
            break
    D = {b.name: arm.pose.bones[b.name].matrix @ b.matrix_local.inverted() for b in arm.data.bones}
    # mano destra in posa: centro e direzione dell'avambraccio
    pr = _pb(arm, "hand.R")
    hand_c = (pr.head + pr.tail) / 2
    fwd = (pr.tail - pr.head).normalized()
    # mesh finale: corpo in posa + accessori, spostati nello spazio della sedia
    dg = bpy.context.evaluated_depsgraph_get()
    posed = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
    bm = _accessories(J, D, idx, rest[head_mask], (hand_c, fwd))
    acc = bpy.data.meshes.new("_acc")
    bm.to_mesh(acc); bm.free()
    out = bmesh.new()
    out.from_mesh(posed)
    out.from_mesh(acc)
    bmesh.ops.translate(out, vec=(0, dy, dz), verts=out.verts[:])
    final = bpy.data.meshes.new(name)
    out.to_mesh(final); out.free()
    for k in ORDER:
        final.materials.append(mats[k])
    for p in final.polygons:
        p.use_smooth = p.material_index not in (idx["card"], idx["button"])
    for d in (posed, acc):
        bpy.data.meshes.remove(d)
    ad = arm.data
    bpy.data.objects.remove(arm); bpy.data.armatures.remove(ad)
    bm_data = body.data
    bpy.data.objects.remove(body); bpy.data.meshes.remove(bm_data)
    info = {"thigh_down_deg": float(thigh_down), "shin_fwd_deg": float(shin_fwd), "seat_contact_z": round(float(seat_contact), 4),
            "unweighted_verts": unweighted, "verts": len(final.vertices), "tris": sum(len(p.vertices) - 2 for p in final.polygons),
            "reach": reach}
    return final, info

def build_standing(i):
    """Anziano vestito in A-pose (senza posa), per confrontarlo con il turnaround."""
    tpl = _load_template()
    body_me = tpl.data.copy()
    body_me.materials.clear()
    mats = materials(i)
    for k in ORDER:
        body_me.materials.append(mats[k])
    idx = {k: n for n, k in enumerate(ORDER)}
    fs, pc, pn, reg = _regions(body_me)
    _age_body(body_me, fs, pc)
    _dress(body_me, reg, pc, pn)
    _eyes(pc, reg)
    rest = np.array([v.co[:] for v in body_me.vertices], np.float32)
    head = np.zeros(len(rest), bool)
    for p, f in zip(body_me.polygons, fs):
        if f == FS["head"]:
            head[list(p.vertices)] = True
    front = rest[np.abs(rest[:, 0]) < 0.02]
    J = {"front_y": lambda z: float(front[np.abs(front[:, 2] - z) < 0.02, 1].min())}
    I = Matrix.Identity(4)
    bm = _accessories(J, {"head": I, "chest": I}, idx, rest[head], None)
    bm.from_mesh(body_me)
    out = bpy.data.meshes.new(f"Elder_{i:02d}_Standing")
    bm.to_mesh(out); bm.free()
    for k in ORDER:
        out.materials.append(mats[k])
    bpy.data.meshes.remove(body_me)
    return out

def materials_barista():
    m = materials(1)
    m = dict(m)
    m["cardigan"] = _mat("MAT_Barista_Shirt", (0.86, 0.85, 0.82), 0.7)
    m["shirt"] = m["cardigan"]
    m["trousers"] = _mat("MAT_Barista_Trousers", (0.04, 0.04, 0.045), 0.8)
    m["shoes"] = _mat("MAT_Barista_Shoes", (0.02, 0.02, 0.02), 0.35)
    m["hair"] = _mat("MAT_Barista_Hair", (0.05, 0.035, 0.025), 0.7)
    m["skin"] = _skin_for(BARISTA_STYLE)
    return m

def _standing_targets(arm, reach, fwd):
    t = {}
    for s, sx in (("R", -1), ("L", 1)):
        t["upperarm." + s] = _dir_rot(arm, "upperarm." + s, (sx * 0.14, -fwd, -1.0))
        t["forearm." + s] = _dir_rot(arm, "forearm." + s, (-sx * 0.18, -0.95, reach))
        t["hand." + s] = _dir_rot(arm, "hand." + s, (-sx * 0.12, -0.9, reach - 0.25))
    t["spine"] = Quaternion((1, 0, 0), math.radians(3))
    t["head"] = Quaternion((0, 0, 1), math.radians(-8)) @ Quaternion((1, 0, 0), math.radians(6))
    return t

def build_barista(counter_dist, counter_top, name="NPC_Barista_Mesh"):
    """Barista in piedi, fronte -Y; il bordo posteriore del bancone è a counter_dist davanti ai piedi, piano a counter_top.
    Le mani poggiano sul bancone. Ritorna (mesh, info)."""
    tpl = _load_template()
    coll = bpy.data.collections.get("_TMP") or bpy.data.collections.new("_TMP")
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    body = tpl.copy(); body.data = tpl.data.copy(); body.name = "_barista"
    coll.objects.link(body)
    me = body.data
    me.materials.clear()
    mats = materials_barista()
    for k in ORDER:
        me.materials.append(mats[k])
    idx = {k: n for n, k in enumerate(ORDER)}
    fs, pc, pn, reg = _regions(me)
    _eyes(pc, reg)
    _dress(me, reg, pc, pn, BARISTA_STYLE)
    arm, J, unweighted = _rig(body, me, fs, pc)
    rest = np.array([v.co[:] for v in me.vertices], np.float32)
    head_mask = np.zeros(len(me.vertices), bool)
    arms = np.zeros(len(me.vertices), bool)
    body_front = np.zeros(len(me.vertices), bool)
    for p, f, r in zip(me.polygons, fs, reg):
        if f == FS["head"]:
            head_mask[list(p.vertices)] = True
        if r in ("farm", "hand"):
            arms[list(p.vertices)] = True
        if r in ("torso", "waist", "pelvis", "thigh"):
            body_front[list(p.vertices)] = True
    # braccia rilassate lungo il corpo, gomiti appena piegati: mani sotto il piano, nascoste dal bancone
    fwd, reach = 0.08, -0.93
    tg = _standing_targets(arm, reach, fwd)
    for s, sx in (("R", -1), ("L", 1)):
        tg["upperarm." + s] = _dir_rot(arm, "upperarm." + s, (sx * 0.16, -0.06, -1.0))
        tg["forearm." + s] = _dir_rot(arm, "forearm." + s, (sx * 0.05, -0.38, -0.92))
        tg["hand." + s] = _dir_rot(arm, "hand." + s, (sx * 0.02, -0.25, -0.97))
    _set_pose(arm, tg)
    co = _eval_mesh(body)
    front = co[body_front | arms, 1].min()
    dy = -counter_dist - front + 0.05                   # 5 cm di aria tra grembiule/mani e bancone
    D = {b.name: arm.pose.bones[b.name].matrix @ b.matrix_local.inverted() for b in arm.data.bones}
    dg = bpy.context.evaluated_depsgraph_get()
    posed = bpy.data.meshes.new_from_object(body.evaluated_get(dg))
    J["front_y"] = lambda z: 0.0
    bm = _accessories(J, D, idx, rest[head_mask], None, cap=False, buttons=False, moustache=BARISTA_STYLE["moustache"])
    acc = bpy.data.meshes.new("_acc"); bm.to_mesh(acc); bm.free()
    out = bmesh.new(); out.from_mesh(posed); out.from_mesh(acc)
    sole = min(v.co.z for v in out.verts)                  # le suole (scarpe con spessore) a filo del pavimento
    bmesh.ops.translate(out, vec=(0, dy, -sole), verts=out.verts[:])
    final = bpy.data.meshes.new(name)
    out.to_mesh(final); out.free()
    for k in ORDER:
        final.materials.append(mats[k])
    for p in final.polygons:
        p.use_smooth = True
    for d in (posed, acc):
        bpy.data.meshes.remove(d)
    ad = arm.data
    bpy.data.objects.remove(arm); bpy.data.armatures.remove(ad)
    bd = body.data
    bpy.data.objects.remove(body); bpy.data.meshes.remove(bd)
    info = {"upperarm_fwd": fwd, "reach": reach, "shift_y": round(float(dy), 3), "unweighted_verts": unweighted,
            "tris": sum(len(p.vertices) - 2 for p in final.polygons)}
    return final, info

def cleanup():
    tpl = bpy.data.objects.get("_ELDER_TEMPLATE")
    if tpl:
        d = tpl.data
        bpy.data.objects.remove(tpl)
        if d.users == 0:
            bpy.data.meshes.remove(d)
    for lib in list(bpy.data.libraries):
        if "human_base_meshes" in lib.filepath:
            bpy.data.libraries.remove(lib)


# ================================================================== personaggi animati (scheletro esportato nel glb)

FPS = 24


def _new_body(name, mats):
    tpl = _load_template()
    coll = bpy.data.collections.get("_TMP") or bpy.data.collections.new("_TMP")
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    body = tpl.copy(); body.data = tpl.data.copy(); body.name = name
    coll.objects.link(body)
    me = body.data
    me.materials.clear()
    for k in ORDER:
        me.materials.append(mats[k])
    return body, me


def _masks(me, reg, fs):
    m = {k: np.zeros(len(me.vertices), bool) for k in ("head", "seat", "back", "legs", "sole", "arms", "front", "hand")}
    for p, r, f in zip(me.polygons, reg, fs):
        vs = list(p.vertices)
        if f == FS["head"]:
            m["head"][vs] = True
        if r in ("pelvis", "thigh"):
            m["seat"][vs] = True
        if r in ("pelvis", "waist", "torso"):
            m["back"][vs] = True
        if r in ("thigh", "shin", "foot"):
            m["legs"][vs] = True
        if r == "foot":
            m["sole"][vs] = True
        if r in ("farm", "hand"):
            m["arms"][vs] = True
        if r == "hand":
            m["hand"][vs] = True
        if r in ("torso", "waist", "pelvis", "thigh"):
            m["front"][vs] = True
    return m


def _attach_accessories(body, arm, bm_acc):
    """Aggiunge gli accessori (costruiti a riposo) alla mesh del corpo, pesati sull'osso più vicino."""
    me = body.data
    acc = bpy.data.meshes.new("_acc")
    bm_acc.to_mesh(acc); bm_acc.free()
    n0 = len(me.vertices)
    bm = bmesh.new(); bm.from_mesh(me); bm.from_mesh(acc); bm.to_mesh(me); bm.free()
    bones = {n: (arm.data.bones[_defname(arm, n)].head_local.copy(), arm.data.bones[_defname(arm, n)].tail_local.copy())
             for n in ("head", "chest", "hand.R", "hand.L") if _defname(arm, n) in arm.data.bones}
    cand = list(bones)
    groups = {n: (body.vertex_groups.get(_defname(arm, n)) or body.vertex_groups.new(name=_defname(arm, n))) for n in cand}
    buckets = {n: [] for n in cand}
    for v in me.vertices[n0:]:
        best, bd = None, 9
        for n in cand:
            a, b = bones[n]
            d = b - a
            t = max(0.0, min(1.0, (v.co - a).dot(d) / max(d.length_squared, 1e-9)))
            dist = (v.co - (a + d * t)).length
            if dist < bd:
                best, bd = n, dist
        buckets[best].append(v.index)
    for n, idxs in buckets.items():
        if idxs:
            groups[n].add(idxs, 1.0, "REPLACE")
    bpy.data.meshes.remove(acc)
    return {n: len(v) for n, v in buckets.items()}


def _key_pose(arm, frame):
    for pb in arm.pose.bones:
        if pb.name.startswith(("MCH-", "ORG-", "DEF-", "VIS")):
            continue
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        pb.keyframe_insert("location", frame=frame)


def _make_action(arm, name, keys, pose_fn):
    """keys: [(frame, parametri)]; pose_fn(parametri) -> target per _set_pose."""
    act = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = act
    for f, params in keys:
        _set_pose(arm, pose_fn(params))
        _key_pose(arm, f)
    arm.animation_data.action = None
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    tr.strips.new(name, int(keys[0][0]), act)
    return act


def _seated_targets2(arm, base, p):
    """Posa seduta con variazioni per l'animazione: respiro, sguardo, mano sinistra che cala una carta."""
    t = _seated_targets(arm, base["thigh"], base["shin"], base["lean"] + p.get("lean", 0), base["pitch"] + p.get("pitch", 0),
                        base["yaw"] + p.get("yaw", 0), base["reach"])
    play = p.get("play", 0.0)
    if play:
        t["upperarm.L"] = _dir_rot(arm, "upperarm.L", (0.10, -0.34 - 0.35 * play, -0.93 + 0.25 * play))
        t["forearm.L"] = _dir_rot(arm, "forearm.L", (-0.28 + 0.15 * play, -0.96, base["reach"] + 0.05 * play))
        t["hand.L"] = _dir_rot(arm, "hand.L", (-0.22, -0.95, base["reach"] - 0.12 - 0.1 * play))
    br = p.get("breathe", 0.0)
    if br:
        t["chest"] = Quaternion((1, 0, 0), math.radians(-br)) @ t["chest"]
    if "hand_roll" in base:                                 # mano delle carte alzata, palmo verso il viso
        hdir = Vector(CARD_HAND["hand"]).normalized()
        t["upperarm.R"] = _dir_rot(arm, "upperarm.R", CARD_HAND["upperarm"])
        t["forearm.R"] = _dir_rot(arm, "forearm.R", CARD_HAND["forearm"])
        t["hand.R"] = Quaternion(hdir, base["hand_roll"]) @ _dir_rot(arm, "hand.R", CARD_HAND["hand"])
    if "hand_roll" in base:                                 # dita unite dietro il ventaglio, pollice che lo preme davanti
        k = p.get("curl", 0.2)
        t["curl.R"] = {**_curl(k), "thumb": (35, 28, 18)}
        t["spread.R"] = 1.0
    else:
        t["curl.R"] = _curl(p.get("curl", 0.3))
    t["curl.L"] = _curl(0.35 + 0.15 * play)                 # mano sinistra rilassata sul tavolo, si chiude giocando
    t["spread.L"] = 0.6
    return t


CARD_HAND = {"upperarm": (-0.10, -0.30, -0.95), "forearm": (0.30, -0.70, 0.55), "hand": (0.15, -0.35, 0.92)}   # a petto


def _palm_side(arm, body, pose_fn, handmask, nb):
    """Direzione (in spazio armatura) verso cui si piegano le dita della mano destra nella posa data."""
    _set_pose(arm, pose_fn({"curl": 0.0})); a = _eval_mesh(body)[:nb][handmask]
    _set_pose(arm, pose_fn({"curl": 0.8})); b = _eval_mesh(body)[:nb][handmask]
    mv = b - a
    nrm = np.linalg.norm(mv, axis=1)
    return Vector(mv[nrm > np.percentile(nrm, 80)].mean(0).tolist()).normalized()


def _cards_hand(bm, idx, center, P, up):
    """Ventaglio di 5 carte nel piano del palmo: altezza lungo le dita (up), spessore lungo P, perno in basso."""
    X = P.cross(up).normalized()
    B = Matrix((X, P, up)).transposed().to_4x4()           # colonne: X, Y = P, Z = up
    verts, frames = [], []
    for k in range(5):
        a = math.radians(-32 + 16 * k)                      # ventaglio aperto, perno sull'angolo basso delle carte
        F = Matrix.Translation(center) @ B @ Matrix.Rotation(a, 4, "Y") @ Matrix.Translation((0, 0.0013 * k, 0.1))
        r = bmesh.ops.create_cube(bm, size=1.0, matrix=F @ Matrix.Diagonal((0.052, 0.0012, 0.085, 1)))
        for f in {f for v in r["verts"] for f in v.link_faces}:
            f.material_index = idx["card"]
        verts += r["verts"]
        frames.append(F)
    return verts, frames


def build_elder_rigged(i, seat_h, back_y, table_top, chair_boxes=(), table_dist=None, table_edge=0.27):
    """Anziano i con scheletro: posa seduta cercata come in build_elder e animazione 'Idle' di 8 s in loop.
    Ritorna (armatura, corpo, info) nello spazio della sedia (fronte -Y)."""
    _, _, _, head_pitch, head_yaw = VARIANTS[(i - 1) % len(VARIANTS)]
    mats = materials(i)
    body, me = _new_body(f"NPC_Elder_{i:02d}_Body", mats)
    idx = {k: n for n, k in enumerate(ORDER)}
    fs, pc, pn, reg = _regions(me)
    _age_body(me, fs, pc)
    _dress(me, reg, pc, pn)
    _eyes(pc, reg)
    arm, J, unweighted = _rig(body, me, fs, pc)
    fingers = _add_fingers(arm, body, me)
    arm.name = f"NPC_Elder_{i:02d}"
    arm.data.name = f"NPC_Elder_{i:02d}_Rig"
    rest = np.array([v.co[:] for v in me.vertices], np.float32)
    M = _masks(me, reg, fs)
    torso_front = rest[np.abs(rest[:, 0]) < 0.02]
    J["front_y"] = lambda z: float(torso_front[np.abs(torso_front[:, 2] - z) < 0.02, 1].min())
    best = None
    for thigh_down in np.arange(0, 19.5, 1.5):
        for shin_fwd in (-4, -2, 0, 2, 4):
            _set_pose(arm, _seated_targets(arm, thigh_down, shin_fwd, 8, head_pitch, head_yaw, 0.12))
            co = _eval_mesh(body)
            dy = back_y - co[M["back"] & (co[:, 2] < _z(1.05)), 1].max()
            dz = -co[M["sole"], 2].min()
            c2 = co + np.array([0, dy, dz])
            over_seat = M["seat"] & (c2[:, 1] > -0.24) & (c2[:, 1] < back_y)
            seat_contact = c2[over_seat, 2].min() if over_seat.any() else 9
            gap = seat_contact - (seat_h + 0.003)
            err = abs(gap) + (0.05 if gap < -0.004 else 0.0)
            err += 0.004 * _inside(c2[M["legs"] & ~over_seat], chair_boxes)
            if table_dist:
                f = c2[M["sole"]]
                err += 0.004 * int((np.abs(f[:, 0]) > f[:, 1] + table_dist - 0.03).sum())
            if best is None or err < best[0]:
                best = (err, thigh_down, shin_fwd, dy, dz, seat_contact)
    _, thigh_down, shin_fwd, dy, dz, seat_contact = best
    reach = 0.3
    for r in (-0.2, -0.14, -0.08, -0.03, 0.02, 0.07, 0.12, 0.2, 0.3):
        _set_pose(arm, _seated_targets(arm, thigh_down, shin_fwd, 8, head_pitch, head_yaw, r))
        co = _eval_mesh(body) + np.array([0, dy, dz])
        over = M["arms"] & (co[:, 1] < -table_edge)
        if not over.any() or co[over, 2].min() > table_top + 0.012:
            reach = r
            break
    base = dict(thigh=thigh_down, shin=shin_fwd, lean=8, pitch=head_pitch, yaw=head_yaw, reach=reach)
    if fingers:
        # rotazione della mano attorno al proprio asse: il palmo (lato verso cui si piegano le dita) guarda gli occhi
        nb = len(rest)
        rmask = M["hand"] & (rest[:, 0] < 0)
        base["hand_roll"] = 0.0
        P = _palm_side(arm, body, lambda p: _seated_targets2(arm, base, p), rmask, nb)
        pr = _pb(arm, "hand.R")
        hdir = Vector(CARD_HAND["hand"]).normalized()
        eyes = _pb(arm, "head").head + Vector((0, 0.02, 0.06))
        D = eyes - (pr.head + pr.tail) / 2
        Pp = (P - hdir * P.dot(hdir)).normalized(); Dp = (D - hdir * D.dot(hdir)).normalized()
        base["hand_roll"] = math.atan2(hdir.dot(Pp.cross(Dp)), Pp.dot(Dp))
    # accessori a riposo (coppola, baffi, sopracciglia, bottoni) + carte nella mano destra a riposo
    I = Matrix.Identity(4)
    _set_pose(arm, _seated_targets2(arm, base, {}))
    pr = _pb(arm, "hand.R")
    hand_c = (pr.head + pr.tail) / 2
    fwd = (pr.tail - pr.head).normalized()
    D_hand = pr.matrix @ pr.bone.matrix_local.inverted()
    bm = _accessories(J, {"head": I, "chest": I}, idx, rest[M["head"]], None)
    before = set(bm.verts)
    if fingers:                                            # ventaglio sul palmo, tenuto tra pollice e dita
        Ppalm = _palm_side(arm, body, lambda p: _seated_targets2(arm, base, p), M["hand"] & (rest[:, 0] < 0), len(rest))
        _set_pose(arm, _seated_targets2(arm, base, {}))
        up = (pr.tail - pr.head).normalized()
        Ppalm = (Ppalm - up * Ppalm.dot(up)).normalized()
        center = pr.head + (pr.tail - pr.head) * 0.55 + Ppalm * 0.014   # perno alla base delle dita: le carte sporgono sopra
        card_verts, frames = _cards_hand(bm, idx, center, Ppalm, up)
    else:
        card_verts, frames = _cards_rest(bm, idx, hand_c, fwd)   # carte costruite nella mano in posa...
    # le dita non devono entrare nelle carte: mano destra (che le tiene) nella posa base e mano sinistra quando gioca
    right = M["hand"] & (rest[:, 0] < 0)
    left = M["hand"] & (rest[:, 0] > 0)
    if fingers:                                            # il pollice preme le carte: non conta come compenetrazione
        fsv = np.array([d.value for d in me.attributes[".sculpt_face_set"].data])
        thumb = np.zeros(len(rest), bool)
        for poly, f in zip(me.polygons, fsv):
            if f in FINGERS_R["thumb"]:
                thumb[list(poly.vertices)] = True
        right = right & ~thumb
    pts = [_eval_mesh(body)[right]]
    for p in ({"play": 1.0, "pitch": 5}, {"breathe": 1.5, "yaw": 9}):
        _set_pose(arm, _seated_targets2(arm, base, p))
        pts.append(_eval_mesh(body)[left])
    _set_pose(arm, _seated_targets2(arm, base, {}))
    pts = np.concatenate(pts)
    before_n = _points_in_boxes(pts, frames, CARD_HALF)
    if fingers:                                            # le carte restano dal lato del palmo: si spostano solo verso il viso o in alto
        dirs = [Ppalm, (Ppalm + up * 0.5).normalized(), (Ppalm + up).normalized(), up]
    else:
        dirs = [(0, 0, 1), (0, 0, -1)] + [(math.cos(a), math.sin(a), z) for a in np.linspace(0, 2 * math.pi, 12, endpoint=False) for z in (0, 0.5)]
    shift = _clear_shift(lambda t: _points_in_boxes(pts - np.array(t[:]), frames, CARD_HALF), dirs) or Vector()
    for v in card_verts:
        v.co += shift
    bmesh.ops.transform(bm, matrix=D_hand.inverted(), verts=[v for v in bm.verts if v not in before])   # ...riportate a riposo
    acc_counts = _attach_accessories(body, arm, bm)
    # animazione: fasi diverse per ogni anziano
    ph = [0, 11, -9, 6][(i - 1) % 4]
    keys = [(1, {}), (48, {"breathe": 1.5, "yaw": 9 + ph}), (96, {"yaw": -8 + ph, "pitch": -6}),
            (120, {"play": 1.0, "pitch": 5}), (144, {"play": 0.0}), (168, {"breathe": 1.5, "yaw": ph * 0.5}), (193, {})]
    _make_action(arm, f"NPC_Elder_{i:02d}_Idle", keys, lambda p: _seated_targets2(arm, base, p))
    # in piedi (avversario a biliardo/freccette, spettatore della scopa): braccia lungo i fianchi, respiro, sguardo
    def stand_targets(p):
        t = {}
        for sd, sx in (("R", -1), ("L", 1)):
            t["upperarm." + sd] = _dir_rot(arm, "upperarm." + sd, (sx * 0.16, -0.04, -1.0))
            t["forearm." + sd] = _dir_rot(arm, "forearm." + sd, (sx * 0.10, -0.22, -1.0))
            t["hand." + sd] = _dir_rot(arm, "hand." + sd, (sx * 0.06, -0.18, -1.0))
        t["chest"] = Quaternion((1, 0, 0), math.radians(-p.get("breathe", 0)))
        t["head"] = Quaternion((0, 0, 1), math.radians(p.get("yaw", 0))) @ Quaternion((1, 0, 0), math.radians(8))
        t["curl.R"] = _curl(0.3); t["curl.L"] = _curl(0.3); t["spread.R"] = t["spread.L"] = 0.6
        return t
    _set_pose(arm, stand_targets({}))
    stand_lift = float(-_eval_mesh(body)[:len(M["sole"])][M["sole"], 2].min())   # accessori in coda ai vertici
    _make_action(arm, f"NPC_Elder_{i:02d}_Stand", [(1, {}), (40, {"breathe": 1.5, "yaw": 12}), (90, {"yaw": -14}),
                                                 (130, {"breathe": 1.5, "yaw": 4}), (169, {})], stand_targets)
    arm.animation_data.action = bpy.data.actions[f"NPC_Elder_{i:02d}_Idle"]
    bpy.context.scene.frame_set(1)
    arm.location = (0, dy, dz)
    body.name = f"NPC_Elder_{i:02d}_Body"
    info = {"thigh_down_deg": float(thigh_down), "shin_fwd_deg": float(shin_fwd), "seat_contact_z": round(float(seat_contact), 4),
            "unweighted_verts": unweighted, "reach": reach, "accessories": acc_counts, "clip": f"NPC_Elder_{i:02d}_Idle",
            "cards_fingers_inside_before": before_n, "cards_shift_m": round(shift.length, 4),
            "stand_clip": f"NPC_Elder_{i:02d}_Stand", "stand_lift": round(stand_lift, 4),
            "tris": sum(len(p.vertices) - 2 for p in me.polygons)}
    return arm, body, info


CARD_HALF = np.array([0.026, 0.0006, 0.0425])


def _cards_rest(bm, idx, hand_c, fwd):
    """Ventaglio di 5 carte vicino alla mano; ritorna (vertici creati, matrici senza scala delle carte)."""
    verts, frames = [], []
    for k in range(5):
        a = math.radians(-24 + 12 * k)
        F = (Matrix.Translation(hand_c + Vector((0, 0, 0.045))) @ Matrix.Rotation(math.atan2(fwd.x, -fwd.y), 4, "Z")
             @ Matrix.Rotation(math.radians(-60), 4, "X") @ Matrix.Rotation(a, 4, "Y") @ Matrix.Translation((0, 0.001 * k, 0.03)))
        r = bmesh.ops.create_cube(bm, size=1.0, matrix=F @ Matrix.Diagonal((0.052, 0.0012, 0.085, 1)))
        for f in {f for v in r["verts"] for f in v.link_faces}:
            f.material_index = idx["card"]
        verts += r["verts"]
        frames.append(F)
    return verts, frames


def _points_in_boxes(pts, frames, half, margin=0.003):
    """Quanti punti cadono dentro almeno una delle scatole (frame senza scala, semi-dimensioni half + margine)."""
    n = 0
    for F in frames:
        Fi = np.array(F.inverted())
        loc = pts @ Fi[:3, :3].T + Fi[:3, 3]
        n += int((np.abs(loc) < half + margin).all(1).sum())
    return n


def _clear_shift(count_fn, dirs, step=0.003, max_d=0.12):
    """Spostamento minimo (fra le direzioni date) per cui count_fn(t) == 0; None se non esiste."""
    best = None
    for d in dirs:
        d = Vector(d).normalized()
        k = 0.0
        while k <= max_d and (best is None or k < best.length):
            if count_fn(d * k) == 0:
                best = d * k
                break
            k += step
    return best


def _hand_tip(arm):
    return _pb(arm, "hand.R").tail.copy()


def _ik_pose(arm, base_t, target, side="R", pole=(0.0, 0.25, -1.0)):
    """IK analitico a due ossa: porta il centro della mano su target (spazio armatura). Gomito verso 'pole'."""
    sx = -1 if side == "R" else 1
    t = dict(base_t)
    _set_pose(arm, t)
    bu = _bone(arm, "upperarm." + side); bf = _bone(arm, "forearm." + side); bh = _bone(arm, "hand." + side)
    L1 = (bu.tail_local - bu.head_local).length
    L2 = (bf.tail_local - bf.head_local).length + (bh.tail_local - bh.head_local).length / 2
    S = _pb(arm, "upperarm." + side).head.copy()
    T = Vector(target)
    d_vec = T - S
    d = min(d_vec.length, (L1 + L2) * 0.999)
    u = d_vec.normalized()
    p = Vector((sx * abs(pole[0]) + sx * 0.35, pole[1], pole[2]))
    v = (p - u * p.dot(u)).normalized()
    ca = max(-1.0, min(1.0, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))
    E = S + L1 * (ca * u + math.sqrt(1 - ca * ca) * v)
    Tc = S + u * d
    t["upperarm." + side] = _dir_rot(arm, "upperarm." + side, E - S)
    t["forearm." + side] = _dir_rot(arm, "forearm." + side, Tc - E)
    t["hand." + side] = _dir_rot(arm, "hand." + side, Tc - E)
    _set_pose(arm, t)
    pb = _pb(arm, "hand." + side)
    return t, ((pb.head + pb.tail) / 2 - T).length

def _reach_pose(arm, base_t, target, side="R"):
    """Cerca le direzioni di braccio e avambraccio che portano la mano vicino a target (spazio armatura)."""
    sx = -1 if side == "R" else 1
    best = None
    for ux in (0.0, 0.1, 0.2):
        for uy in (-0.2, -0.45, -0.7, -0.95):
            for uz in (-0.9, -0.6, -0.35, -0.1):
                for fz in (-0.4, -0.15, 0.1, 0.35):
                    t = dict(base_t)
                    t["upperarm." + side] = _dir_rot(arm, "upperarm." + side, (sx * ux, uy, uz))
                    t["forearm." + side] = _dir_rot(arm, "forearm." + side, (-sx * 0.15, -0.95, fz))
                    t["hand." + side] = _dir_rot(arm, "hand." + side, (-sx * 0.1, -0.95, fz - 0.1))
                    _set_pose(arm, t)
                    pb = _pb(arm, "hand." + side)
                    c = (pb.head + pb.tail) / 2
                    d = (c - target).length
                    if best is None or d < best[0]:
                        best = (d, t)
    return best[1], best[0]


def build_barista_rigged(counter_dist, counter_top, glass_local, bottle_mesh=None):
    """Barista con scheletro, animazioni 'Idle' e 'Pour'. glass_local: posizione del bicchiere nello spazio del barista
    (fronte -Y). La bottiglia (se data) è figlia dell'osso della mano destra. Ritorna (armatura, corpo, bottiglia, info)."""
    mats = materials_barista()
    body, me = _new_body("NPC_Barista_Body", mats)
    idx = {k: n for n, k in enumerate(ORDER)}
    fs, pc, pn, reg = _regions(me)
    _eyes(pc, reg)
    _dress(me, reg, pc, pn, BARISTA_STYLE)
    arm, J, unweighted = _rig(body, me, fs, pc)
    fingers = _add_fingers(arm, body, me)
    arm.name = "NPC_Barista"; arm.data.name = "NPC_Barista_Rig"
    rest = np.array([v.co[:] for v in me.vertices], np.float32)
    M = _masks(me, reg, fs)

    def relaxed(p):
        t = {}
        for s, sx in (("R", -1), ("L", 1)):
            t["upperarm." + s] = _dir_rot(arm, "upperarm." + s, (sx * 0.16, -0.06, -1.0))
            t["forearm." + s] = _dir_rot(arm, "forearm." + s, (sx * 0.05, -0.38, -0.92))
            t["hand." + s] = _dir_rot(arm, "hand." + s, (sx * 0.02, -0.25, -0.97))
        t["spine"] = Quaternion((1, 0, 0), math.radians(3))
        t["chest"] = Quaternion((1, 0, 0), math.radians(-p.get("breathe", 0)))
        t["head"] = Quaternion((0, 0, 1), math.radians(p.get("yaw", -8))) @ Quaternion((1, 0, 0), math.radians(p.get("pitch", 6)))
        t["curl.R"] = _curl(0.2)                            # mano rilassata, dita appena piegate
        t["curl.L"] = _curl(0.3); t["spread.L"] = t["spread.R"] = 0.6
        return t

    _set_pose(arm, relaxed({}))
    co = _eval_mesh(body)
    front = co[M["front"] | M["arms"], 1].min()
    dy = -counter_dist - front + 0.05
    sole = co[:, 2].min()
    # la posizione del bicchiere nello spazio dell'armatura (prima della traslazione dy)
    g_arm = Vector(glass_local) - Vector((0, dy, -sole))
    hold, d_hold = _ik_pose(arm, relaxed({"yaw": 0, "pitch": 18}), g_arm + Vector((-0.10, 0.02, 0.20)))
    low, _ = _ik_pose(arm, relaxed({"yaw": -10, "pitch": 20}), Vector((-0.24, -0.12, _z(0.78))))
    # il bancone nello spazio dell'armatura: bordo posteriore e piano. La mano passa dal bicchiere al vano sotto il
    # piano ritraendosi prima sopra il bancone (senza attraversarlo)
    y_edge = -counter_dist - dy
    z_top = counter_top + sole
    retract, _ = _ik_pose(arm, relaxed({"yaw": -6, "pitch": 16}), Vector((g_arm.x - 0.04, y_edge + 0.10, z_top + 0.10)))

    def with_roll(t, deg):
        t = dict(t)
        pb = _pb(arm, "forearm.R")
        _set_pose(arm, t)
        axis = (pb.tail - pb.head).normalized()
        t["hand.R"] = Quaternion(axis, math.radians(deg)) @ t["hand.R"]
        return t

    poses = {"relaxed": relaxed({}), "low": low, "retract": retract, "hold": hold, "pour": with_roll(hold, -95)}
    # bottiglia nella mano destra: dritta nella posa 'hold', agganciata all'osso
    bottle = None
    neck_local = None
    bottle_info = None
    if bottle_mesh is not None:
        _set_pose(arm, hold)
        bpy.context.view_layer.update()
        pb = _pb(arm, "hand.R")
        palm = pb.head + (pb.tail - pb.head) * 0.45
        bottle = bpy.data.objects.new("Barista_Bottle", bottle_mesh)
        body.users_collection[0].objects.link(bottle)
        bb = np.array([v.co[:] for v in bottle_mesh.vertices])
        h = float(bb[:, 2].max())
        bottle.parent = arm
        bottle.parent_type = "BONE"
        bottle.parent_bone = _defname(arm, "hand.R")        # con Rigify: l'osso di deformazione, esportato
        bpy.context.view_layer.update()
        # presa: la bottiglia si avvicina al palmo finché il palmo non la tocca, poi le dita si chiudono
        # quanto più possibile senza entrare nel vetro (ricerca su distanza e flessione)
        rb = float(np.sqrt((bb[:, 0] ** 2 + bb[:, 1] ** 2)).max())
        nb = len(rest)
        handmask = M["hand"] & (rest[:, 0] < 0)
        cache = {}

        def co_k(k):
            if k not in cache:
                t = dict(hold); t["curl.R"] = _curl(k)
                _set_pose(arm, t)
                cache[k] = _eval_mesh(body)[:nb][handmask]
            return cache[k]
        _set_pose(arm, hold)
        # presa di forza: l'asse della bottiglia corre lungo le nocche (indice -> mignolo), il centro sta dal lato
        # del palmo (dove vanno i polpastrelli quando le dita si piegano)
        Rh = pb.matrix.to_3x3() @ pb.bone.matrix_local.to_3x3().inverted()
        U = (Rh @ Vector(arm["palm_across_R"])).normalized() if fingers else Vector((0, 0, 1))
        if U.z < 0:
            U = -U                                          # collo verso l'alto
        mv = co_k(0.8) - co_k(0.0)
        nrm = np.linalg.norm(mv, axis=1)
        tipmove = Vector(mv[nrm > np.percentile(nrm, 80)].mean(0).tolist()) if fingers else Vector((1, 0, 0))
        P = (Rh @ Vector(arm["palm_n_R"])).normalized() if fingers else tipmove.normalized()
        if P.dot(tipmove) < 0:
            P = -P                                          # normale verso il lato del palmo
        P = (P - U * P.dot(U)).normalized()
        palm = pb.head + (pb.tail - pb.head) * 0.6          # centro del palmo (con Rigify la mano va dal polso alle nocche)
        u_np = np.array(U[:])

        def inside(c, hand):
            w = hand - np.array(c[:])
            al = w @ u_np
            rad = np.linalg.norm(w - np.outer(al, u_np), axis=1)
            return int(((rad < rb + 0.0015) & (al > -0.45 * h) & (al < 0.55 * h)).sum())
        # 1) la bottiglia si appoggia al palmo: distanza minima dall'asse della mano senza che il palmo entri nel vetro
        fsv = np.array([d.value for d in me.attributes[".sculpt_face_set"].data])
        fmask = {f: np.zeros(nb, bool) for f in FINGERS_R}
        for poly, fv in zip(me.polygons, fsv):
            for f, sets in FINGERS_R.items():
                if fv in sets:
                    fmask[f][list(poly.vertices)] = True
        finger_any = np.any(np.stack(list(fmask.values())), 0)
        palm_only = handmask & ~finger_any
        _set_pose(arm, dict(hold))
        co0 = _eval_mesh(body)[:nb]
        dd = next((float(x) for x in np.arange(rb * 0.8, rb + 0.1, 0.002) if inside(palm + P * float(x), co0[palm_only]) == 0), rb + 0.03)
        C = palm + P * dd
        # 2) ogni dito si chiude finché tocca il vetro, senza attraversarlo (con Rigify le dita sono indipendenti)
        per = {}
        for f in FINGERS_R:
            best = 0.0
            for k in (1.0, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1):
                t = dict(hold); t["curl.R"] = {f: tuple(a * k for a in GRIP[f])}
                _set_pose(arm, t)
                if inside(C, _eval_mesh(body)[:nb][fmask[f] & handmask]) == 0:
                    best = k
                    break
            per[f] = best
        grip_curl = {f: tuple(a * per[f] for a in GRIP[f]) for f in FINGERS_R}
        grip = (dd, per)
        shift = P * dd
        bottle_info = {"palm_to_axis_m": round(dd, 4), "finger_curl": {f: round(v, 2) for f, v in per.items()},
                       "fingers_rigged": bool(fingers)}
        rot = U.to_track_quat("Z", "Y").to_matrix().to_4x4()
        bottle.matrix_world = arm.matrix_world @ Matrix.Translation(palm + shift) @ rot @ Matrix.Translation((0, 0, -h * 0.45))
        bottle_info["axis_tilt_deg"] = round(math.degrees(U.angle(Vector((0, 0, 1)))), 1)
        for key in ("hold", "pour", "low", "retract"):
            poses[key] = dict(poses[key]); poses[key]["curl.R"] = grip_curl
        neck_local = [0.0, 0.0, h]
    keys_idle = [(1, {}), (36, {"breathe": 1.2, "yaw": 6}), (72, {"yaw": -18, "pitch": 4}), (108, {"breathe": 1.2, "yaw": -4}), (145, {})]
    _make_action(arm, "NPC_Barista_Idle", keys_idle, relaxed)
    pour_keys = [(1, "relaxed"), (14, "low"), (26, "retract"), (40, "hold"), (58, "pour"), (100, "pour"), (116, "hold"),
                 (126, "retract"), (138, "low"), (150, "relaxed")]
    _make_action(arm, "NPC_Barista_Pour", pour_keys, lambda name: poses[name])
    # controllo: nessun vertice di mano e avambraccio destri dentro il volume del bancone in tutta la versata
    armmask = (M["hand"] | M["arms"]) & (rest[:, 0] < 0)
    for tr in arm.animation_data.nla_tracks:
        tr.mute = True
    arm.animation_data.action = bpy.data.actions["NPC_Barista_Pour"]
    worst = (0, 0)
    for f in range(1, 151, 3):
        bpy.context.scene.frame_set(f)
        co = _eval_mesh(body)[:len(rest)][armmask]
        n = int(((co[:, 1] < y_edge - 0.004) & (co[:, 1] > y_edge - 0.65) & (co[:, 2] < z_top - 0.004)).sum())
        if n > worst[0]:
            worst = (n, f)
    for tr in arm.animation_data.nla_tracks:
        tr.mute = False
    arm.animation_data.action = None
    counter_check = {"max_verts_inside_counter": worst[0], "frame": worst[1]}
    arm.animation_data.action = bpy.data.actions["NPC_Barista_Idle"]
    bpy.context.scene.frame_set(1)
    bm = _accessories(J, {"head": Matrix.Identity(4), "chest": Matrix.Identity(4)}, idx, rest[M["head"]], None, cap=False, buttons=False,
                      moustache=BARISTA_STYLE["moustache"])
    acc_counts = _attach_accessories(body, arm, bm)
    arm.location = (0, dy, -sole)
    info = {"unweighted_verts": unweighted, "hold_error_m": round(float(d_hold), 3), "accessories": acc_counts,
            "clips": ["NPC_Barista_Idle", "NPC_Barista_Pour"], "pour_fill_s": [58 / FPS, 100 / FPS], "pour_len_s": 150 / FPS,
            "bottle_in_s": 14 / FPS, "bottle_out_s": 138 / FPS, "neck_local": neck_local, "tris": sum(len(p.vertices) - 2 for p in me.polygons),
            "bottle_clearance": bottle_info, "counter_check": counter_check}
    return arm, body, bottle, info


def build_player_rigged(i, name):
    """Giocatore in piedi al biliardino: clip 'Idle' (chino sul tavolo, mani avanti) e 'Stand' (braccia lungo i fianchi).
    Le braccia vengono portate sulle impugnature a runtime (IK nel gioco). Ritorna (armatura, corpo, info)."""
    mats = materials(i)
    body, me = _new_body(f"NPC_Player_{i:02d}_Body", mats)
    idx = {k: n for n, k in enumerate(ORDER)}
    fs, pc, pn, reg = _regions(me)
    _age_body(me, fs, pc)
    _dress(me, reg, pc, pn)
    _eyes(pc, reg)
    arm, J, unweighted = _rig(body, me, fs, pc)
    fingers = _add_fingers(arm, body, me)
    arm.name = f"NPC_Player_{i:02d}"
    arm.data.name = f"NPC_Player_{i:02d}_Rig"
    rest = np.array([v.co[:] for v in me.vertices], np.float32)
    M = _masks(me, reg, fs)
    torso_front = rest[np.abs(rest[:, 0]) < 0.02]
    J["front_y"] = lambda z: float(torso_front[np.abs(torso_front[:, 2] - z) < 0.02, 1].min())
    I = Matrix.Identity(4)
    bm = _accessories(J, {"head": I, "chest": I}, idx, rest[M["head"]], None)
    acc = _attach_accessories(body, arm, bm)

    def play(p):
        t = {}
        for sd, sx in (("R", -1), ("L", 1)):
            t["upperarm." + sd] = _dir_rot(arm, "upperarm." + sd, (sx * 0.22, -0.62, -0.75))
            t["forearm." + sd] = _dir_rot(arm, "forearm." + sd, (-sx * 0.08, -0.97, -0.12))
            t["hand." + sd] = _dir_rot(arm, "hand." + sd, (-sx * 0.05, -0.95, -0.3))
        t["spine"] = Quaternion((1, 0, 0), math.radians(6))
        t["chest"] = Quaternion((1, 0, 0), math.radians(8 - p.get("breathe", 0)))
        t["head"] = Quaternion((0, 0, 1), math.radians(p.get("yaw", 0))) @ Quaternion((1, 0, 0), math.radians(22))
        t["curl.R"] = _curl(0.85); t["curl.L"] = _curl(0.85)   # impugnature strette
        t["spread.R"] = t["spread.L"] = 1.0
        return t

    def stand(p):
        t = {}
        for sd, sx in (("R", -1), ("L", 1)):
            t["upperarm." + sd] = _dir_rot(arm, "upperarm." + sd, (sx * 0.16, -0.04, -1.0))
            t["forearm." + sd] = _dir_rot(arm, "forearm." + sd, (sx * 0.10, -0.22, -1.0))
            t["hand." + sd] = _dir_rot(arm, "hand." + sd, (sx * 0.06, -0.18, -1.0))
        t["chest"] = Quaternion((1, 0, 0), math.radians(-p.get("breathe", 0)))
        t["head"] = Quaternion((0, 0, 1), math.radians(p.get("yaw", 0))) @ Quaternion((1, 0, 0), math.radians(10))
        t["curl.R"] = _curl(0.3); t["curl.L"] = _curl(0.3); t["spread.R"] = t["spread.L"] = 0.6
        return t

    _set_pose(arm, stand({}))
    sole = float(_eval_mesh(body)[:len(rest)][M["sole"], 2].min())
    _make_action(arm, f"NPC_Player_{i:02d}_Idle", [(1, {}), (30, {"breathe": 1.5, "yaw": 8}), (60, {"yaw": -10}),
                                                  (90, {"breathe": 1.5, "yaw": 4}), (121, {})], play)
    _make_action(arm, f"NPC_Player_{i:02d}_Stand", [(1, {}), (45, {"breathe": 1.5, "yaw": 14}), (95, {"yaw": -12}),
                                                   (145, {"breathe": 1.5}), (181, {})], stand)
    arm.animation_data.action = bpy.data.actions[f"NPC_Player_{i:02d}_Idle"]
    bpy.context.scene.frame_set(1)
    arm.location = (0, 0, -sole)
    body.name = f"NPC_Player_{i:02d}_Body"
    info = {"name": name, "clip": f"NPC_Player_{i:02d}_Idle", "stand_clip": f"NPC_Player_{i:02d}_Stand", "stand_lift": round(-sole, 4),
            "fingers": bool(fingers), "accessories": acc, "unweighted_verts": unweighted}
    return arm, body, info

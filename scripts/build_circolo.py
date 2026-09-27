"""Circolo ricreativo - build dell'ambiente giocabile (Blender 5.2).

Uso (headless):
  Blender -b --factory-startup --python scripts/build_circolo.py            # build da zero
  Blender -b build/circolo.blend --python scripts/build_circolo.py          # rerun idempotente

Ogni blocco build_* azzera SOLO la propria collection e la ricrea: rilanciare non duplica nulla.
Se in models/ (o nella cartella radice) compaiono file .glb/.gltf/.fbx/.obj il cui nome contiene una
delle keyword di ASSETS, vengono importati e normalizzati al posto del proxy.
"""
import bpy, bmesh, math, json, os, sys
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import types
import minigames_prep as MG
try:
    import importlib, humans
    importlib.reload(humans)
except Exception as _e:              # il resto della scena non dipende dal modulo dei personaggi
    print("humans.py non disponibile:", _e)
    humans = None
try:
    import scene_assets as RA, assets_lib as AL
    importlib.reload(AL); importlib.reload(RA)
except Exception as _e:
    print("scene_assets.py non disponibile:", _e)
    RA = None
LAYOUT = {}          # quote e posizioni ricavate dai modelli reali (usate da verifiche e gioco)
SUPPORT = {}         # oggetto -> quota attesa della base (appoggiato su un piano)
WALLMOUNT = {}       # oggetto -> (asse, valore, lato) a contatto con un muro

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIRS = [os.path.join(ROOT, "models"), ROOT]
OUT = os.path.join(ROOT, "build")
TEX = os.path.join(OUT, "textures")
os.makedirs(TEX, exist_ok=True)

RW, RD, H, T, GAP = 6.0, 4.0, 3.2, 0.2, 0.02   # mezza larghezza X, mezza profondita' Y, altezza, spessore muri, distacco dai muri
SEAT_H = 0.45                                   # quota piano seduta (cuscino): altezza standard, adatta agli anziani del bundle
SIDE_TOP = 0.72                                 # piano del tavolino
COUNTER_TOP = 1.10
EPS_REST = 0.001                                # i pickup poggiano con 1 mm di aria: niente z-fighting / contatto iniziale in fisica
COLLS = ["ARCHITECTURE", "PROPS", "INTERACTABLES", "NPC", "LIGHTS", "COLLISION", "QA_CAMERAS"]
REPORT = {"assets": {}, "layout_changes": [], "checks": {}}
M = {}

# ----------------------------------------------------------------------------- utilita'

def get_coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c

def purge():
    for coll in (bpy.data.meshes, bpy.data.lights, bpy.data.cameras):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)

def reset_coll(name):
    c = get_coll(name)
    for o in list(c.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    purge()
    return c

def make_obj(name, data, coll, loc=(0, 0, 0), rz=0.0, props=None, parent=None):
    o = bpy.data.objects.new(name, data)
    coll.objects.link(o)
    if parent is not None:
        o.parent = parent
    o.location = loc
    o.rotation_euler = (0, 0, math.radians(rz))
    for k, v in (props or {}).items():
        o[k] = v
    return o

class MB:
    """Mesh builder su bmesh: primitive con indice materiale, poi finalize()."""
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.mats = []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _tag(self, verts, m, smooth=None):
        i = self._mi(m)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = i
            f.smooth = smooth(f) if smooth else False

    def box(self, mn, mx, m):
        c = [(a + b) / 2 for a, b in zip(mn, mx)]
        s = [b - a for a, b in zip(mn, mx)]
        mat = Matrix.Translation(c) @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=mat, calc_uvs=True)
        self._tag(r["verts"], m)

    def cyl(self, center, r1, r2, length, m, axis="Z", seg=16):
        rot = {"Z": Matrix.Identity(4), "X": Matrix.Rotation(math.pi / 2, 4, "Y"),
               "Y": Matrix.Rotation(math.pi / 2, 4, "X")}[axis]
        if axis == "Y":   # Rx(+90) manda +Z in -Y: scambio i raggi per tenere r1 verso -Y
            r1, r2 = r2, r1
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg,
                                  radius1=r1, radius2=r2, depth=length,
                                  matrix=Matrix.Translation(center) @ rot, calc_uvs=True)
        self._tag(r["verts"], m, smooth=lambda f: len(f.verts) == 4)

    def sphere(self, center, r, m, u=16, v=10):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=u, v_segments=v, radius=r,
                                        matrix=Matrix.Translation(center), calc_uvs=True)
        self._tag(res["verts"], m, smooth=lambda f: True)

    def plane_front(self, x0, x1, z0, z1, y, m):
        """Quad rivolto verso -Y con UV 0..1 pulite (per texture video / immagini)."""
        mat = (Matrix.Translation(((x0 + x1) / 2, y, (z0 + z1) / 2)) @ Matrix.Rotation(math.pi / 2, 4, "X")
               @ Matrix.Diagonal((x1 - x0, z1 - z0, 1, 1)))
        r = bmesh.ops.create_grid(self.bm, x_segments=1, y_segments=1, size=0.5, matrix=mat, calc_uvs=True)
        self._tag(r["verts"], m)

    def lathe(self, profile, m, seg=24):
        before = set(self.bm.faces)
        vs = [self.bm.verts.new((r, 0, z)) for r, z in profile]
        es = [self.bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
        bmesh.ops.spin(self.bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1),
                       angle=2 * math.pi, steps=seg, use_merge=True)
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts[:], dist=1e-6)
        new = [f for f in self.bm.faces if f not in before]
        bmesh.ops.recalc_face_normals(self.bm, faces=new)
        i = self._mi(m)
        for f in new:
            f.material_index = i
            f.smooth = True

def box_uv(bm, uvl, scale, skip):
    bm.normal_update()
    for f in bm.faces:
        if f.material_index in skip:
            continue
        ax = max(range(3), key=lambda k: abs(f.normal[k]))
        for l in f.loops:
            co = l.vert.co
            u, v = ((co.y, co.z), (co.x, co.z), (co.x, co.y))[ax]
            l[uvl].uv = (u / scale, v / scale)

def finalize(mb, mesh_name, normalize=True, uv_scale=1.0, uv_keep=()):
    """Origine al centro della base del bounding box; ritorna (mesh, offset rispetto al sistema di costruzione)."""
    bm = mb.bm
    off = Vector((0, 0, 0))
    if normalize:
        xs, ys, zs = zip(*[v.co[:] for v in bm.verts])
        off = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)))
        bmesh.ops.translate(bm, vec=-off, verts=bm.verts[:])
    box_uv(bm, mb.uv, uv_scale, {mb.mats.index(m) for m in uv_keep if m in mb.mats})
    me = bpy.data.meshes.new(mesh_name)
    bm.to_mesh(me)
    bm.free()
    for m in mb.mats:
        me.materials.append(m)
    return me, off

# ----------------------------------------------------------------------------- materiali e texture

def save_tex(name, arr):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = os.path.join(TEX, name + ".png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img

def tex_cotto():
    N, t, g = 512, 256, 5
    rng = np.random.default_rng(3)
    a = np.ones((N, N, 4), np.float32)
    base = np.array([0.63, 0.33, 0.20])
    for i in range(2):
        for j in range(2):
            a[i * t:(i + 1) * t, j * t:(j + 1) * t, :3] = base * (1 + rng.uniform(-0.09, 0.09)) + rng.uniform(-0.025, 0.025, 3)
    a[..., :3] *= 1 + rng.normal(0, 0.03, (N, N, 1))
    for k in (0, t):
        a[k:k + g, :, :3] = (0.47, 0.41, 0.35)
        a[:, k:k + g, :3] = (0.47, 0.41, 0.35)
    return a

def tex_pitch():
    Wd, Ht = 512, 288
    a = np.ones((Ht, Wd, 4), np.float32)
    x = np.arange(Wd)[None, :]
    stripe = ((x // 40) % 2)[..., None]
    a[..., :3] = np.where(stripe, (0.16, 0.50, 0.18), (0.20, 0.58, 0.22))
    wht = (0.95, 0.95, 0.95)
    a[20:23, 24:488, :3] = wht; a[265:268, 24:488, :3] = wht
    a[20:268, 24:27, :3] = wht; a[20:268, 485:488, :3] = wht; a[20:268, 255:258, :3] = wht
    yy, xx = np.mgrid[0:Ht, 0:Wd]
    d = np.sqrt((xx - 256) ** 2 + (yy - 144) ** 2)
    a[(d > 38) & (d < 41), :3] = wht
    a[240:262, 36:150, :3] = (0.05, 0.05, 0.12)          # sovrimpressione punteggio
    return a

def tex_flag():
    Wd, Ht = 360, 240
    a = np.ones((Ht, Wd, 4), np.float32)
    a[108:132, :, :3] = (0.80, 0.08, 0.10)
    a[:, 168:192, :3] = (0.80, 0.08, 0.10)
    yy, xx = np.mgrid[0:Ht, 0:Wd]
    for cx, cy in ((84, 54), (276, 54), (84, 186), (276, 186)):
        head = (xx - cx) ** 2 + ((yy - cy) * 1.1) ** 2 < 30 ** 2
        a[head, :3] = 0.03
        band = head & (yy > cy + 2) & (yy < cy + 11)          # benda bianca (riga 0 = basso)
        a[band, :3] = 1.0
    return a

def mat(name, color, rough=0.5, metal=0.0, emit=None, estr=0.0, alpha=1.0, img=None, img_emit=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = estr
    if img:
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = img
        nt.links.new(tn.outputs["Color"], b.inputs["Base Color"])
        if img_emit:
            nt.links.new(tn.outputs["Color"], b.inputs["Emission Color"])
            b.inputs["Emission Strength"].default_value = estr
    if alpha < 1:
        b.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
        try:
            m.blend_method = "BLEND"
        except Exception:
            pass
    m.diffuse_color = (*color, alpha)
    return m

def build_materials():
    cotto = save_tex("TEX_Cotto", tex_cotto())
    pitch = save_tex("TEX_Screen_Placeholder", tex_pitch())
    flag = save_tex("TEX_Flag_Sardinia", tex_flag())
    M.update(
        wall=mat("MAT_Wall_Tobacco", (0.60, 0.43, 0.17), 0.85),
        ceiling=mat("MAT_Ceiling_Cream", (0.78, 0.72, 0.55), 0.9),
        cotto=mat("MAT_Floor_Cotto", (0.63, 0.33, 0.20), 0.65, img=cotto),
        walnut=mat("MAT_Walnut", (0.14, 0.065, 0.03), 0.45),
        walnut_dark=mat("MAT_Walnut_Dark", (0.07, 0.035, 0.018), 0.5),
        counter_top=mat("MAT_Counter_Top", (0.42, 0.22, 0.10), 0.25, 0.35),
        formica=mat("MAT_Formica_Cream", (0.80, 0.74, 0.58), 0.3),
        chrome=mat("MAT_Chrome", (0.9, 0.9, 0.9), 0.12, 1.0),
        brass=mat("MAT_Brass", (0.75, 0.55, 0.22), 0.3, 1.0),
        felt=mat("MAT_Felt_Green", (0.03, 0.28, 0.12), 0.95),
        leather=mat("MAT_Leather_Green", (0.06, 0.13, 0.08), 0.55),
        black=mat("MAT_Plastic_Black", (0.02, 0.02, 0.02), 0.4),
        metal_dark=mat("MAT_Metal_Dark", (0.05, 0.05, 0.06), 0.35, 0.8),
        screen=mat("MAT_Screen", (0.2, 0.5, 0.2), 0.2, emit=(1, 1, 1), estr=2.5, img=pitch, img_emit=True),
        screen_mini=mat("MAT_Screen_Mini", (0.2, 0.5, 0.2), 0.2, emit=(1, 1, 1), estr=2.5, img=pitch, img_emit=True),
        screen_side=mat("MAT_Screen_Side", (0.2, 0.5, 0.2), 0.2, emit=(1, 1, 1), estr=2.5, img=pitch, img_emit=True),
        slot_screen=mat("MAT_Slot_Screen", (0.9, 0.7, 0.2), 0.2, emit=(1.0, 0.75, 0.25), estr=3.0),
        slot_top=mat("MAT_Slot_Topper", (0.1, 0.3, 1.0), 0.2, emit=(0.1, 0.35, 1.0), estr=6.0),
        neon=mat("MAT_Neon_Tube", (0.95, 0.97, 1.0), 0.2, emit=(0.92, 0.96, 1.0), estr=12.0),
        shade_warm=mat("MAT_Lampshade_Warm", (1.0, 0.85, 0.6), 0.4, emit=(1.0, 0.72, 0.42), estr=6.0),
        shade_green=mat("MAT_Lampshade_Green", (0.05, 0.25, 0.10), 0.3, 0.2),
        glass=mat("MAT_Glass", (0.85, 0.92, 0.95), 0.05, alpha=0.25),
        window_glass=mat("MAT_Window_Glass", (0.10, 0.14, 0.22), 0.05, alpha=0.45),
        wine=mat("MAT_Wine", (0.30, 0.01, 0.03), 0.1, alpha=0.9),
        bottle_green=mat("MAT_Bottle_Green", (0.03, 0.16, 0.05), 0.1),
        bottle_amber=mat("MAT_Bottle_Amber", (0.35, 0.15, 0.03), 0.1),
        pack_white=mat("MAT_Pack_White", (0.92, 0.92, 0.9), 0.4),
        pack_red=mat("MAT_Pack_Red", (0.70, 0.05, 0.06), 0.4),
        card=mat("MAT_Card", (0.95, 0.93, 0.86), 0.6),
        ball_white=mat("MAT_Ball_White", (0.95, 0.95, 0.92), 0.15),
        ball_red=mat("MAT_Ball_Red", (0.7, 0.05, 0.05), 0.15),
        ball_yellow=mat("MAT_Ball_Yellow", (0.9, 0.7, 0.05), 0.15),
        team_red=mat("MAT_Team_Red", (0.7, 0.06, 0.05), 0.4),
        team_blue=mat("MAT_Team_Blue", (0.06, 0.15, 0.6), 0.4),
        skin=mat("MAT_Skin", (0.72, 0.50, 0.40), 0.6),
        trousers=mat("MAT_Trousers", (0.10, 0.10, 0.11), 0.8),
        shoes=mat("MAT_Shoes", (0.03, 0.02, 0.015), 0.4),
        flag=mat("MAT_Flag_Sardinia", (1, 1, 1), 0.8, img=flag),
    )
    for i, (sw, cp) in enumerate([((0.10, 0.18, 0.10), (0.25, 0.20, 0.15)), ((0.28, 0.16, 0.08), (0.20, 0.19, 0.17)),
                                  ((0.07, 0.09, 0.18), (0.30, 0.24, 0.17)), ((0.30, 0.30, 0.28), (0.15, 0.13, 0.11))], 1):
        M[f"sweater{i}"] = mat(f"MAT_Sweater_{i:02d}", sw, 0.9)
        M[f"cap{i}"] = mat(f"MAT_Cap_{i:02d}", cp, 0.9)

# ----------------------------------------------------------------------------- proxy degli asset (front = -Y, origine al centro base)

def build_chair():
    mb, W = MB(), M["walnut"]
    for sx in (-1, 1):
        x = sx * 0.195
        mb.box((x - 0.0175, -0.2325, 0), (x + 0.0175, -0.1975, SEAT_H - 0.06), W)
        mb.box((x - 0.0175, 0.1975, 0), (x + 0.0175, 0.2325, 0.86), W)
        mb.box((x - 0.01, -0.2, 0.12), (x + 0.01, 0.2, 0.15), W)
    mb.box((-0.225, -0.25, SEAT_H - 0.06), (0.225, 0.25, SEAT_H - 0.02), W)
    mb.box((-0.20, -0.23, SEAT_H - 0.02), (0.20, 0.20, SEAT_H), M["leather"])
    mb.box((-0.18, 0.20, 0.60), (0.18, 0.225, 0.84), W)
    mb.box((-0.225, 0.19, 0.84), (0.225, 0.24, 0.90), W)
    mb.box((-0.18, -0.21, 0.15), (0.18, -0.19, 0.18), W)
    return finalize(mb, "Chair_Mesh")[0]

def build_tv():
    mb = MB()
    mb.box((-0.725, -0.038, 0), (0.725, 0.04, 0.85), M["black"])
    mb.plane_front(-0.70, 0.70, 0.025, 0.825, -0.04, M["screen"])
    return finalize(mb, "TV_Screen_Mesh", uv_keep=(M["screen"],))[0]

def build_side_table():
    mb, W = MB(), M["walnut"]
    mb.box((-0.30, -0.30, SIDE_TOP - 0.03), (0.30, 0.30, SIDE_TOP), W)
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.box((sx * 0.26 - 0.02, sy * 0.26 - 0.02, 0), (sx * 0.26 + 0.02, sy * 0.26 + 0.02, SIDE_TOP - 0.03), W)
    mb.box((-0.24, -0.24, 0.20), (0.24, 0.24, 0.22), W)
    mb.cyl((0.12, 0.10, SIDE_TOP + 0.014), 0.055, 0.06, 0.028, M["chrome"], seg=20)
    mb.cyl((0.12, 0.10, SIDE_TOP + 0.0265), 0.045, 0.045, 0.003, M["metal_dark"], seg=20)
    return finalize(mb, "Side_Table_Mesh")[0]

def build_cig_pack():
    mb = MB()
    mb.box((-0.0275, -0.011, 0), (0.0275, 0.011, 0.06), M["pack_white"])
    mb.box((-0.0275, -0.011, 0.06), (0.0275, 0.011, 0.088), M["pack_red"])
    return finalize(mb, "Cigarette_Pack_Mesh")[0]

def build_counter():
    mb, W = MB(), M["walnut"]
    mb.box((-1.97, -0.28, 0), (1.97, 0.33, 0.10), M["walnut_dark"])
    mb.box((-1.97, -0.30, 0.10), (1.97, 0.33, 1.04), W)
    for i in range(5):
        x0 = -1.85 + i * 0.75
        mb.box((x0, -0.31, 0.22), (x0 + 0.65, -0.30, 0.95), M["walnut_dark"])
    mb.box((-2.0, -0.35, 1.04), (2.0, 0.35, COUNTER_TOP), M["counter_top"])
    mb.cyl((0, -0.33, 0.20), 0.02, 0.02, 3.8, M["chrome"], axis="X")
    for x in (-1.8, -0.6, 0.6, 1.8):
        mb.box((x - 0.01, -0.33, 0.19), (x + 0.01, -0.30, 0.21), M["chrome"])
    return finalize(mb, "Bar_Counter_Mesh")[0]

def build_shelf(bottles=True):
    mb, W = MB(), M["walnut"]
    mb.box((-1.8, 0.13, 0), (1.8, 0.15, 2.2), W)
    mb.box((-1.8, -0.15, 0), (1.8, 0.13, 0.90), W)
    mb.box((-1.8, -0.15, 0.90), (1.8, 0.13, 0.94), M["formica"])
    for sx in (-1, 1):
        mb.box((sx * 1.79 - 0.01, -0.02, 0.94), (sx * 1.79 + 0.01, 0.15, 2.2), W)
    for z in (1.36, 1.78):
        mb.box((-1.78, -0.02, z), (1.78, 0.13, z + 0.03), W)
    mb.box((-1.8, -0.02, 2.17), (1.8, 0.15, 2.2), W)
    rng = np.random.default_rng(7)
    for zb in ((0.94, 1.39, 1.81) if bottles else ()):
        x = -1.68
        while x < 1.70:
            m = M["bottle_green"] if rng.random() < 0.6 else M["bottle_amber"]
            hb = float(rng.uniform(0.18, 0.24))
            y = 0.02 if zb == 0.94 else 0.055
            mb.cyl((x, y, zb + hb / 2), 0.035, 0.035, hb, m, seg=10)
            mb.cyl((x, y, zb + hb + 0.04), 0.03, 0.012, 0.08, m, seg=10)
            x += float(rng.uniform(0.10, 0.16))
    return finalize(mb, "Bottle_Shelf_Mesh")[0]

def build_glass():
    mb = MB()
    mb.lathe([(0, 0), (0.032, 0), (0.0375, 0.09), (0.035, 0.09), (0.0298, 0.006), (0, 0.006)], M["glass"])
    return finalize(mb, "Glass_Mesh")[0]

def build_liquid():
    mb = MB()
    mb.lathe([(0, 0), (0.0293, 0), (0.0326, 0.054), (0, 0.054)], M["wine"])
    return finalize(mb, "Glass_Liquid_Mesh")[0]

def build_pool_table():
    mb, W, F = MB(), M["walnut"], M["felt"]
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.box((sx * 1.0 - 0.07, sy * 0.5 - 0.07, 0), (sx * 1.0 + 0.07, sy * 0.5 + 0.07, 0.55), W)
    mb.box((-1.22, -0.66, 0.55), (1.22, 0.66, 0.74), W)
    mb.box((-1.14, -0.58, 0.72), (1.14, 0.58, 0.76), F)
    mb.box((-1.27, 0.58, 0.74), (1.27, 0.71, 0.80), W)
    mb.box((-1.27, -0.71, 0.74), (1.27, -0.58, 0.80), W)
    mb.box((1.14, -0.58, 0.74), (1.27, 0.58, 0.80), W)
    mb.box((-1.27, -0.58, 0.74), (-1.14, 0.58, 0.80), W)
    mb.box((-1.14, 0.55, 0.76), (1.14, 0.58, 0.785), F)
    mb.box((-1.14, -0.58, 0.76), (1.14, -0.55, 0.785), F)
    mb.box((1.11, -0.55, 0.76), (1.14, 0.55, 0.785), F)
    mb.box((-1.14, -0.55, 0.76), (-1.11, 0.55, 0.785), F)
    for x, y in ((-1.18, -0.62), (-1.18, 0.62), (1.18, -0.62), (1.18, 0.62), (0, -0.635), (0, 0.635)):
        mb.cyl((x, y, 0.7975), 0.05, 0.05, 0.005, M["black"], seg=16)
    balls = [((-0.6, 0.0), "ball_white")] + [((0.55 + 0.05 * i, 0.03 * (j - i / 2) * 2), c)
                                             for i, c in ((0, "ball_red"), (1, "ball_yellow"), (2, "ball_red"))
                                             for j in range(i + 1)]
    for (x, y), c in balls:
        mb.sphere((x, y, 0.76 + 0.0286), 0.0286, M[c], u=12, v=8)
    return finalize(mb, "Pool_Table_Mesh")[0]

def build_foosball():
    mb, W = MB(), M["walnut"]
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.box((sx * 0.6 - 0.035, sy * 0.21 - 0.035, 0), (sx * 0.6 + 0.035, sy * 0.21 + 0.035, 0.62), W)
    mb.box((-0.70, -0.28, 0.62), (0.70, 0.28, 0.68), W)
    mb.box((-0.70, 0.24, 0.68), (0.70, 0.28, 0.92), W)
    mb.box((-0.70, -0.28, 0.68), (0.70, -0.24, 0.92), W)
    mb.box((0.66, -0.24, 0.68), (0.70, 0.24, 0.92), W)
    mb.box((-0.70, -0.24, 0.68), (-0.66, 0.24, 0.92), W)
    mb.box((-0.66, -0.24, 0.68), (0.66, 0.24, 0.69), M["felt"])
    for i, x in enumerate([-0.56, -0.40, -0.24, -0.08, 0.08, 0.24, 0.40, 0.56]):
        mb.cyl((x, 0, 0.86), 0.008, 0.008, 0.75, M["chrome"], axis="Y", seg=8)
        side = -1 if i % 2 == 0 else 1
        mb.cyl((x, side * 0.34, 0.86), 0.018, 0.018, 0.07, M["black"], axis="Y", seg=10)
        team = M["team_red"] if i in (0, 1, 3, 5) else M["team_blue"]
        for y in (-0.12, 0.0, 0.12):
            mb.box((x - 0.012, y - 0.01, 0.705), (x + 0.012, y + 0.01, 0.865), team)
    return finalize(mb, "Foosball_Table_Mesh")[0]

def build_slot():
    mb, K = MB(), M["metal_dark"]
    mb.box((-0.30, -0.20, 0), (0.30, 0.275, 0.90), K)
    mb.box((-0.30, -0.275, 0.85), (0.30, -0.20, 0.95), K)
    mb.box((-0.30, -0.15, 0.90), (0.30, 0.275, 1.65), K)
    mb.plane_front(-0.24, 0.24, 1.0, 1.52, -0.151, M["slot_screen"])
    mb.box((-0.30, -0.10, 1.65), (0.30, 0.275, 1.80), M["slot_top"])
    mb.box((-0.25, -0.21, 0.35), (0.25, -0.20, 0.45), M["chrome"])
    mb.box((-0.305, -0.16, 0.90), (-0.29, 0.275, 1.65), M["chrome"])
    mb.box((0.29, -0.16, 0.90), (0.305, 0.275, 1.65), M["chrome"])
    for x in (-0.18, -0.06, 0.06, 0.18):
        mb.cyl((x, -0.24, 0.955), 0.018, 0.018, 0.01, M["slot_top"], seg=12)
    return finalize(mb, "Slot_Machine_Mesh")[0]

def build_card_table():
    mb, W = MB(), M["walnut"]
    mb.box((-0.45, -0.45, 0.71), (0.45, 0.45, 0.75), W)
    mb.box((-0.40, -0.40, 0.64), (0.40, 0.40, 0.71), W)
    for sx in (-1, 1):
        for sy in (-1, 1):
            mb.box((sx * 0.39 - 0.025, sy * 0.39 - 0.025, 0), (sx * 0.39 + 0.025, sy * 0.39 + 0.025, 0.64), W)
    for (x, y, a) in ((0.0, 0.0, 0.2), (0.07, -0.05, -0.4), (-0.12, 0.08, 0.9), (0.15, 0.12, 0.3), (-0.05, -0.15, 1.3)):
        c, s = math.cos(a), math.sin(a)
        pts = [(x + c * dx - s * dy, y + s * dx + c * dy) for dx, dy in ((-0.028, -0.045), (0.028, 0.045))]
        mb.box((min(p[0] for p in pts), min(p[1] for p in pts), 0.75), (max(p[0] for p in pts), max(p[1] for p in pts), 0.752), M["card"])
    return finalize(mb, "Card_Table_Mesh")[0]

def build_flag():
    mb = MB()
    mb.box((-0.46, 0.0, -0.31), (0.46, 0.012, 0.31), M["walnut"])
    mb.plane_front(-0.43, 0.43, -0.28, 0.28, -0.001, M["flag"])
    return finalize(mb, "Flag_Sardinia_Mesh", uv_keep=(M["flag"],))[0]

def build_npc(i):
    """Anziano seduto, costruito nello spazio locale della sedia (front -Y). Ritorna (mesh, offset in spazio sedia)."""
    mb = MB()
    sw, cp, tr, sk = M[f"sweater{i}"], M[f"cap{i}"], M["trousers"], M["skin"]
    S = SEAT_H + 0.002
    mb.box((-0.19, -0.12, S), (0.19, 0.17, S + 0.16), tr)
    for sx in (-1, 1):
        x = sx * 0.1
        mb.box((x - 0.075, -0.44, S + 0.005), (x + 0.075, -0.12, S + 0.15), tr)
        mb.box((x - 0.06, -0.47, 0.07), (x + 0.06, -0.36, S + 0.03), tr)
        mb.box((x - 0.055, -0.56, 0.0), (x + 0.055, -0.36, 0.07), M["shoes"])
    mb.box((-0.20, -0.10, S + 0.14), (0.20, 0.16, S + 0.60), sw)
    mb.cyl((0, 0.03, S + 0.60), 0.085, 0.085, 0.40, sw, axis="X")
    mb.cyl((0, 0.03, S + 0.67), 0.05, 0.05, 0.08, sk)
    mb.sphere((0, 0.02, S + 0.80), 0.105, sk)
    mb.box((-0.015, -0.105, S + 0.77), (0.015, -0.08, S + 0.81), sk)
    mb.cyl((0, 0.025, S + 0.87), 0.118, 0.112, 0.06, cp)
    mb.box((-0.09, -0.16, S + 0.845), (0.09, -0.06, S + 0.86), cp)
    for sx in (-1, 1):
        mb.box((sx * 0.245 - 0.05, -0.06, S + 0.30), (sx * 0.245 + 0.05, 0.10, S + 0.62), sw)
        mb.box((sx * 0.15 - 0.045, -0.44, S + 0.30), (sx * 0.15 + 0.045, -0.04, S + 0.38), sw)
        mb.box((sx * 0.11 - 0.04, -0.52, S + 0.30), (sx * 0.11 + 0.04, -0.44, S + 0.37), sk)
    mb.box((0.05, -0.535, S + 0.36), (0.13, -0.53, S + 0.46), M["card"])
    return finalize(mb, f"NPC_Elder_{i:02d}_Mesh")

# ----------------------------------------------------------------------------- import reale + normalizzazione

ASSETS = {
    "chair":       dict(kw=["sedia", "chair"], dims=(0.45, 0.50, 0.90), build=build_chair),
    "tv":          dict(kw=["televisore", "maxischermo", "tv", "screen"], dims=(1.45, 0.08, 0.85), build=build_tv),
    "side_table":  dict(kw=["tavolino", "posacenere", "side"], dims=(0.60, 0.60, 0.75), build=build_side_table),
    "cig_pack":    dict(kw=["sigarette", "cigarette"], dims=(0.055, 0.022, 0.088), build=build_cig_pack),
    "counter":     dict(kw=["bancone", "counter", "bar-"], dims=(4.0, 0.70, 1.10), build=build_counter),
    "glass":       dict(kw=["bicchiere", "glass"], dims=(0.075, 0.075, 0.09), build=build_glass),
    "pool":        dict(kw=["biliardo", "pool", "billiard"], dims=(2.54, 1.42, 0.80), build=build_pool_table),
    "foosball":    dict(kw=["biliardino", "balilla", "foosball"], dims=(1.40, 0.75, 0.92), build=build_foosball),
    "slot":        dict(kw=["slot"], dims=(0.60, 0.55, 1.80), build=build_slot),
    "card_table":  dict(kw=["carte", "card"], dims=(0.90, 0.90, 0.75), build=build_card_table),
    "elder":       dict(kw=["anziano", "personaggio", "elder", "character"], dims=None, height=1.70, build=None),
}
_ASSET_CACHE = {}

def find_asset_file(kws):
    for d in ASSET_DIRS:
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            fl = f.lower()
            if fl.endswith((".glb", ".gltf", ".fbx", ".obj")) and any(k in fl for k in kws):
                # "tavolo da carte" non deve diventare il biliardino ecc.: keyword piu' lunga vince
                return os.path.join(d, f)
    return None

def import_normalized(path, dims, mesh_name, height=None):
    """Importa in una collection di prova, bake delle trasformazioni, origine al centro base, fronte -Y, scala uniforme."""
    tmp = get_coll("_IMPORT_TEST")
    vl = bpy.context.view_layer
    vl.active_layer_collection = vl.layer_collection.children[tmp.name]
    before, acts = set(bpy.data.objects), set(bpy.data.actions)
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    else:
        bpy.ops.wm.obj_import(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    info = {"file": os.path.basename(path), "rig": any(o.type == "ARMATURE" for o in new),
            "animations": len(set(bpy.data.actions) - acts)}
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("nessuna mesh nel file")
    dg = bpy.context.evaluated_depsgraph_get()
    bm, mats = bmesh.new(), []
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.transform(o.matrix_world)                       # applica rotazione e scala (anche Y-up -> Z-up)
        remap = []
        for s in o.material_slots:
            if s.material not in mats:
                mats.append(s.material)
            remap.append(mats.index(s.material))
        for p in me.polygons:
            p.material_index = remap[p.material_index] if remap else 0
        bm.from_mesh(me)
        ev.to_mesh_clear()
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    xs, ys, zs = zip(*[v.co[:] for v in bm.verts])
    raw = Vector((max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)))
    info["raw_dims"] = [round(v, 4) for v in raw]
    info["tris_raw"] = sum(len(f.verts) - 2 for f in bm.faces)
    if dims and ((dims[0] > dims[1] * 1.15 and raw.y > raw.x * 1.15) or (dims[1] > dims[0] * 1.15 and raw.x > raw.y * 1.15)):
        bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Z"))
        info["auto_rot_z"] = 90
        raw = Vector((raw.y, raw.x, raw.z))
    s = (height / raw.z) if height else ((dims[0] / raw.x) * (dims[1] / raw.y) * (dims[2] / raw.z)) ** (1 / 3)
    bmesh.ops.scale(bm, vec=(s, s, s), verts=bm.verts[:])
    info["scale"] = round(s, 5)
    mb = MB.__new__(MB)
    mb.bm, mb.mats = bm, mats
    mb.uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new("UVMap")
    me, _ = finalize_keep_uv(mb, mesh_name)
    info["dims"] = [round(v, 4) for v in me_dims(me)]
    info["fronte"] = "da verificare a vista (euristica: -Y)"
    return me, info

def finalize_keep_uv(mb, name):
    bm = mb.bm
    xs, ys, zs = zip(*[v.co[:] for v in bm.verts])
    off = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)))
    bmesh.ops.translate(bm, vec=-off, verts=bm.verts[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mb.mats:
        me.materials.append(m)
    return me, off

def me_dims(me):
    cs = [v.co for v in me.vertices]
    return [max(c[k] for c in cs) - min(c[k] for c in cs) for k in range(3)]

def asset_mesh(key, mesh_name):
    if key in _ASSET_CACHE and _ASSET_CACHE[key].name in bpy.data.meshes:
        return _ASSET_CACHE[key]
    spec = ASSETS[key]
    path = find_asset_file(spec["kw"])
    me = None
    if path:
        try:
            me, info = import_normalized(path, spec["dims"], mesh_name, spec.get("height"))
            REPORT["assets"][key] = dict(status="imported", **info)
        except Exception as e:
            REPORT["assets"][key] = {"status": "import_failed->proxy", "file": os.path.basename(path), "error": str(e)}
    if me is None:
        me = spec["build"]()
        me.name = mesh_name
        REPORT["assets"].setdefault(key, {"status": "proxy (file 3D assente)"})
        REPORT["assets"][key]["dims"] = [round(v, 4) for v in me_dims(me)]
    _ASSET_CACHE[key] = me
    return me

# ----------------------------------------------------------------------------- layout

SCREEN_CHAIRS = [((x, y), 180) for y in (2.0, 1.0) for x in (-3.0, -2.0, -1.0, 0.0)]
CARD_TABLE = (4.2, -2.6)
CARD_R = 0.78                                   # 0.72 -> 0.78: spazio per le gambe dei quattro anziani sotto il tavolo
CARD_CHAIRS = [((CARD_TABLE[0], CARD_TABLE[1] + CARD_R), 0), ((CARD_TABLE[0] + CARD_R, CARD_TABLE[1]), -90),
               ((CARD_TABLE[0], CARD_TABLE[1] - CARD_R), 180), ((CARD_TABLE[0] - CARD_R, CARD_TABLE[1]), 90)]
SLOT_X = RW - GAP - 0.275
SHELF_X = -RW + GAP + 0.15
TV_Y = RD - 0.04
TV_Z = 2.0 - 0.425
GLASS_POS = (-5.0, -1.2)
SIDE_TABLE = (5.4, -0.8)
PACK_POS = (5.28, -0.92)
POOL = (0.8, -1.2)
FOOSBALL = (3.6, 1.2)
DOOR_X = (-4.0, -3.0)
WINDOWS = [(-0.1, 1.1), (2.9, 4.1)]
WIN_Z = (0.9, 2.2)
DOOR_H = 2.2
REPORT["layout_changes"] = [
    "Maxischermo: Y 3.95 -> 3.96 (retro a filo del muro a Y=4.0, centro a Z=2.0)",
    f"Slot machine: X 5.6 -> {SLOT_X:.3f} (retro a 2 cm dal muro est, oltre il battiscopa)",
    f"Scaffale bottiglie: centro X {SHELF_X:.2f}, 2 cm dal muro ovest; resta 13 cm di spazio dietro il bancone",
    "Sedie tavolo carte: a 0.78 m dal centro del tavolo (era 0.72), rivolte al tavolo: spazio per le gambe degli anziani",
    "Sedie a 45 cm di seduta (erano 48): altezza standard, adatta ai personaggi del bundle Human Base Meshes",
    f"Bicchiere: {GLASS_POS} sul bancone, 0.3 m dall'estremita' sud (lato ingresso)",
    f"Pacchetto sigarette: {PACK_POS} sul tavolino, accanto al posacenere",
]

# ----------------------------------------------------------------------------- blocchi

def build_architecture():
    c = reset_coll("ARCHITECTURE")
    W = M["wall"]

    def slab(name, boxes, m, uv=1.0):
        mb = MB()
        for mn, mx in boxes:
            mb.box(mn, mx, m)
        me, off = finalize(mb, name + "_Mesh", uv_scale=uv)
        return make_obj(name, me, c, loc=off)

    slab("Floor", [((-RW - T, -RD - T, -0.1), (RW + T, RD + T, 0.0))], M["cotto"], uv=0.66)
    slab("Ceiling", [((-RW - T, -RD - T, H), (RW + T, RD + T, H + 0.1))], M["ceiling"])
    slab("Wall_North", [((-RW - T, RD, 0), (RW + T, RD + T, H))], W)
    slab("Wall_West", [((-RW - T, -RD, 0), (-RW, RD, H))], W)
    slab("Wall_East", [((RW, -RD, 0), (RW + T, RD, H))], W)
    ys = (-RD - T, -RD)
    xs = [-RW - T, DOOR_X[0], DOOR_X[1], WINDOWS[0][0], WINDOWS[0][1], WINDOWS[1][0], WINDOWS[1][1], RW + T]
    south = [((xs[0], ys[0], 0), (xs[1], ys[1], H)),
             ((xs[1], ys[0], DOOR_H), (xs[2], ys[1], H)),
             ((xs[2], ys[0], 0), (xs[3], ys[1], H)),
             ((xs[4], ys[0], 0), (xs[5], ys[1], H)),
             ((xs[6], ys[0], 0), (xs[7], ys[1], H))]
    for x0, x1 in WINDOWS:
        south += [((x0, ys[0], 0), (x1, ys[1], WIN_Z[0])), ((x0, ys[0], WIN_Z[1]), (x1, ys[1], H))]
    slab("Wall_South", south, W)
    k = 0.015
    slab("Skirting", [((-RW, RD - k, 0), (RW, RD, 0.1)), ((-RW, -RD, 0), (-RW + k, RD, 0.1)),
                      ((RW - k, -RD, 0), (RW, RD, 0.1)), ((-RW, -RD, 0), (DOOR_X[0], -RD + k, 0.1)),
                      ((DOOR_X[1], -RD, 0), (RW, -RD + k, 0.1))], M["walnut_dark"], uv=0.5)
    # porta chiusa nel vano
    mb = MB()
    mb.box((DOOR_X[0] + 0.02, -RD - 0.15, 0), (DOOR_X[1] - 0.02, -RD - 0.05, DOOR_H - 0.02), M["walnut"])
    mb.box((DOOR_X[0] + 0.12, -RD - 0.051, 0.25), (DOOR_X[1] - 0.12, -RD - 0.05, 1.0), M["walnut_dark"])
    mb.box((DOOR_X[0] + 0.12, -RD - 0.051, 1.15), (DOOR_X[1] - 0.12, -RD - 0.05, 2.0), M["walnut_dark"])
    mb.cyl((DOOR_X[1] - 0.1, -RD - 0.025, 1.0), 0.015, 0.015, 0.05, M["brass"], axis="Y")
    me, off = finalize(mb, "Door_Main_Mesh")
    make_obj("Door_Main", me, c, loc=off)
    # finestre: telaio + vetro + davanzale interno
    for i, (x0, x1) in enumerate(WINDOWS, 1):
        mb, z0, z1, f, y0, y1 = MB(), WIN_Z[0], WIN_Z[1], 0.06, -RD - 0.14, -RD - 0.06
        for bx in ((x0, x0 + f), (x1 - f, x1), ((x0 + x1) / 2 - 0.02, (x0 + x1) / 2 + 0.02)):
            mb.box((bx[0], y0, z0), (bx[1], y1, z1), M["walnut"])
        for bz in ((z0, z0 + f), (z1 - f, z1), (1.8, 1.84)):
            mb.box((x0, y0, bz[0]), (x1, y1, bz[1]), M["walnut"])
        mb.box((x0 + f, -RD - 0.105, z0 + f), (x1 - f, -RD - 0.095, z1 - f), M["window_glass"])
        mb.box((x0 - 0.05, -RD, z0 - 0.04), (x1 + 0.05, -RD + 0.04, z0), M["formica"])
        me, off = finalize(mb, f"Window_{i:02d}_Mesh")
        make_obj(f"Window_{i:02d}", me, c, loc=off)

def use_real():
    keys = ("chair", "bar", "glass", "tv65", "pack", "side_table", "pool", "foosball", "slot", "card_table")
    return RA is not None and all(RA.available(k) for k in keys)

def build_props():
    if use_real():
        return build_props_real()
    c = reset_coll("PROPS")
    _ASSET_CACHE.clear()
    chair = asset_mesh("chair", "Chair_Mesh")
    for i, ((x, y), rz) in enumerate(SCREEN_CHAIRS, 1):
        make_obj(f"Chair_Screen_{i:02d}", chair, c, (x, y, 0), rz)
    for i, ((x, y), rz) in enumerate(CARD_CHAIRS, 1):
        make_obj(f"Chair_Cards_{i:02d}", chair, c, (x, y, 0), rz)
    make_obj("Bar_Counter", asset_mesh("counter", "Bar_Counter_Mesh"), c, (-5.2, 0.5, 0), 90)
    make_obj("Bottle_Shelf", build_shelf(), c, (SHELF_X, 0.5, 0), 90)
    REPORT["assets"]["bottle_shelf"] = {"status": "proxy (non previsto tra gli asset)"}
    make_obj("Pool_Table", asset_mesh("pool", "Pool_Table_Mesh"), c, (*POOL, 0), 0)
    make_obj("Foosball_Table", asset_mesh("foosball", "Foosball_Table_Mesh"), c, (*FOOSBALL, 0), 0)
    slot = asset_mesh("slot", "Slot_Machine_Mesh")
    make_obj("Slot_Machine_01", slot, c, (SLOT_X, 2.4, 0), -90)
    make_obj("Slot_Machine_02", slot, c, (SLOT_X, 3.2, 0), -90)
    make_obj("Card_Table", asset_mesh("card_table", "Card_Table_Mesh"), c, (*CARD_TABLE, 0), 0)
    make_obj("Side_Table", asset_mesh("side_table", "Side_Table_Mesh"), c, (*SIDE_TABLE, 0), 0)
    fl = build_flag()
    make_obj("Flag_Sardinia", fl, c, (-4.3, RD - max(v.co.y for v in fl.vertices), 1.8), 0)

def build_interactables():
    if use_real():
        return build_interactables_real()
    c = reset_coll("INTERACTABLES")
    make_obj("TV_Screen", asset_mesh("tv", "TV_Screen_Mesh"), c, (-1.5, TV_Y, TV_Z), 0,
             {"interactable": "look", "screen_material": "MAT_Screen"})
    make_obj("Cigarette_Pack", asset_mesh("cig_pack", "Cigarette_Pack_Mesh"), c,
             (*PACK_POS, SIDE_TOP + EPS_REST), 15, {"interactable": "pickup", "item_id": "cigarettes"})
    g = make_obj("Glass", asset_mesh("glass", "Glass_Mesh"), c, (*GLASS_POS, COUNTER_TOP + EPS_REST), 0,
                 {"interactable": "pickup_drink", "item_id": "glass"})
    make_obj("Glass_Liquid", build_liquid(), c, (0, 0, 0.0062), 0, {"fill": 1.0}, parent=g)

def build_elder_mesh(i):
    """Anziano dal bundle Human Base Meshes (rig automatico e posa seduta); se il bundle manca, proxy a primitive."""
    if humans is not None and humans.available():
        chair_boxes = [((-0.225, -0.25, SEAT_H - 0.06), (0.225, 0.25, SEAT_H)),               # sedile
                       ((-0.2125, -0.2325, 0.0), (-0.1775, -0.1975, SEAT_H - 0.06)),          # gambe anteriori
                       ((0.1775, -0.2325, 0.0), (0.2125, -0.1975, SEAT_H - 0.06)),
                       ((-0.18, -0.21, 0.15), (0.18, -0.19, 0.18))]                          # traversa
        # schiena a 3.5 cm dallo schienale: seduti un po' in avanti, il polpaccio libera il bordo del sedile
        me, info = humans.build_elder(i, SEAT_H, 0.15, 0.75, chair_boxes=chair_boxes, table_dist=CARD_R)
        co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
        off = Vector(((co[:, 0].min() + co[:, 0].max()) / 2, (co[:, 1].min() + co[:, 1].max()) / 2, co[:, 2].min()))
        me.transform(Matrix.Translation(-off))
        REPORT["assets"].setdefault("elder", {"status": "Human Base Meshes (CC0) + rig automatico + posa seduta", "file": humans.BUNDLE, "per_npc": {}})
        REPORT["assets"]["elder"]["per_npc"][i] = info
        return me, off
    REPORT["assets"]["elder"] = {"status": "proxy seduto (bundle Human Base Meshes assente)"}
    return build_npc(i)

def build_npcs():
    if use_real() and humans is not None and humans.available():
        return build_npcs_real()
    c = reset_coll("NPC")
    for i, ((x, y), rz) in enumerate(CARD_CHAIRS, 1):
        me, off = build_elder_mesh(i)
        cm = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(rz), 4, "Z")
        o = make_obj(f"NPC_Elder_{i:02d}", me, c, props={"npc": True, "npc_action": "play_cards",
                                                           "seat": f"Chair_Cards_{i:02d}", "standing_height": 1.70})
        o.matrix_world = cm @ Matrix.Translation(off)
    if humans is not None:
        humans.cleanup()
    tmp = bpy.data.collections.get("_TMP")
    if tmp:
        for ob in list(tmp.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.collections.remove(tmp)

def build_lights():
    c = reset_coll("LIGHTS")

    def light(name, kind, energy, color, parent, loc=(0, 0, 0), **kw):
        ld = bpy.data.lights.new(name, kind)
        ld.energy, ld.color = energy, color
        for k, v in kw.items():
            setattr(ld, k, v)
        return make_obj(name, ld, c, loc, parent=parent)

    for i, (x, y) in enumerate([(-2.6, -1.9), (-2.6, 1.9), (2.6, -1.9), (2.6, 1.9)], 1):
        mb = MB()
        mb.box((-0.625, -0.07, H - 0.05), (0.625, 0.07, H), M["formica"])
        mb.cyl((0, -0.03, H - 0.07), 0.018, 0.018, 1.2, M["neon"], axis="X", seg=10)
        mb.cyl((0, 0.03, H - 0.07), 0.018, 0.018, 1.2, M["neon"], axis="X", seg=10)
        me, off = finalize(mb, f"Neon_Fixture_{i:02d}_Mesh")
        f = make_obj(f"Neon_Fixture_{i:02d}", me, c, (x, y, off.z))
        light(f"LGT_Neon_{i:02d}", "POINT", 140, (0.90, 0.95, 1.0), f, (0, 0, -0.05), shadow_soft_size=0.4)

    def pendant(name, pos, bottom, r_bot, r_top, h, shell, inner):
        mb = MB()
        mb.cyl((0, 0, bottom + h / 2), r_bot, r_top, h, shell, seg=24)
        mb.cyl((0, 0, bottom + 0.002), r_bot - 0.01, r_bot - 0.01, 0.004, inner, seg=24)
        mb.cyl((0, 0, (bottom + h + H) / 2), 0.006, 0.006, H - bottom - h, M["black"], seg=6)
        me, off = finalize(mb, name + "_Mesh")
        return make_obj(name, me, c, (pos[0], pos[1], off.z))

    lb = pendant("Lamp_Billiard", POOL, 1.75, 0.30, 0.09, 0.20, M["shade_green"], M["shade_warm"])
    light("LGT_Billiard", "SPOT", 260, (1.0, 0.80, 0.55), lb, (0, 0, 0.05), spot_size=math.radians(110),
          spot_blend=0.4, shadow_soft_size=0.15)
    for i, y in enumerate((-0.3, 1.3), 1):
        lp = pendant(f"Lamp_Bar_{i:02d}", (LAYOUT.get("bar_mid_x", -5.2), y), 2.05, 0.18, 0.06, 0.20, M["shade_warm"], M["shade_warm"])
        light(f"LGT_Bar_{i:02d}", "POINT", 70, (1.0, 0.72, 0.45), lp, (0, 0, 0.05), shadow_soft_size=0.1)

SPAWN_XY = (-3.5, -3.3)                      # punto d'ingresso del giocatore (anche Cronico lo usa per accoglierlo)

def build_spawn():
    old = bpy.data.objects.get("SPAWN_Player")
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    e = bpy.data.objects.new("SPAWN_Player", None)
    bpy.context.scene.collection.objects.link(e)
    e.empty_display_type, e.empty_display_size = "SINGLE_ARROW", 0.5
    e.location = (*SPAWN_XY, 0)
    e.rotation_euler = (0, 0, math.pi)       # local -Y (front di tutti gli asset) -> nord; in Unity transform.forward -> nord
    e["eye_height"] = 1.65
    e["forward_axis"] = "-Y Blender / +Z glTF-Unity"

NO_COL = {"Skirting", "Flag_Sardinia", "Glass", "Glass_Liquid", "Cigarette_Pack"}
NO_COL_PREFIX = ("Bottle_", "Pool_Balls", "Card_Table_Cards", "FOOSBALL_", "DARTS_", "Beer_Taps", "Ashtray_", "Mini_Screen", "TV_Side", "Dart_Board", "Cigarette_Lit",
                 "TV_Screen_Display", "Flag_", "Skirting", "Wall_Photos")

def no_col(name):
    return name in NO_COL or name.startswith(NO_COL_PREFIX)
PICKUPS = {"Glass", "Cigarette_Pack"}

def _npc_body(arm):
    return next((ch for ch in arm.children if ch.type == "MESH" and ch.name.endswith("_Body")), None)

def _npc_world_box(arm):
    body = _npc_body(arm)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg); me = ev.to_mesh()
    pts = np.array([(body.matrix_world @ v.co)[:] for v in me.vertices])
    ev.to_mesh_clear()
    return Vector(pts.min(0)), Vector(pts.max(0))

def build_collisions():
    c = reset_coll("COLLISION")
    bpy.context.view_layer.update()          # matrix_world dei sorgenti appena creati non e' ancora calcolata
    bpy.context.scene.frame_set(1)
    for arm in [o for o in bpy.data.collections["NPC"].objects if o.type == "ARMATURE"]:
        mn, mx = _npc_world_box(arm)
        mb = MB(); mb.box(mn, mx, None)
        me, _ = finalize(mb, "COL_" + arm.name + "_Mesh", normalize=False)
        me.materials.clear()
        col = bpy.data.objects.new("COL_" + arm.name, me); c.objects.link(col)
        col["collider"], col["source"] = "box", arm.name
        col.hide_render = True; col.display_type = "WIRE"
    for cname in ("ARCHITECTURE", "PROPS", "INTERACTABLES", "NPC"):
        for o in bpy.data.collections[cname].objects:
            if o.type != "MESH" or no_col(o.name) or o.parent is not None:
                continue
            multi = o.name.startswith("Wall_South")
            if multi:     # pochi convessi: copia dei box del muro
                me = o.data.copy()
                me.materials.clear()
            else:
                bb = [Vector(v) for v in o.bound_box]
                mn = Vector([min(v[k] for v in bb) for k in range(3)])
                mx = Vector([max(v[k] for v in bb) for k in range(3)])
                mb = MB()
                mb.box(mn, mx, None)
                me, _ = finalize(mb, "COL_" + o.name + "_Mesh", normalize=False)
                me.materials.clear()
            me.name = "COL_" + o.name + "_Mesh"
            col = make_obj("COL_" + o.name, me, c, props={"collider": "mesh" if multi else "box", "source": o.name})
            col.matrix_world = o.matrix_world.copy()
            col.hide_render = True
            col.display_type = "WIRE"

def build_qa_cameras():
    c = reset_coll("QA_CAMERAS")
    def cam(name, loc, target=None, ortho=None, lens=20):
        cd = bpy.data.cameras.new(name)
        cd.lens = lens
        cd.clip_start, cd.clip_end = 0.05, 60
        o = make_obj(name, cd, c, loc)
        if ortho:
            cd.type, cd.ortho_scale = "ORTHO", ortho
            cd.clip_start = loc[2] - 3.0          # taglio sotto il soffitto
            o.rotation_euler = (0, 0, 0)
        else:
            d = Vector(target) - Vector(loc)
            o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return o
    cam("QA_Cam_Spawn", (-3.5, -3.3, 1.65), (-3.5, 4.0, 1.5))
    cam("QA_Cam_Top", (0, 0, 12), ortho=13.2)
    cam("QA_Cam_Bar", (-4.35, -1.2, 1.65), (-1.5, TV_Y, 1.9), lens=24)
    cam("QA_Cam_Cards", (2.75, -1.35, 1.6), (4.25, -2.75, 0.8), lens=26)
    cam("QA_Cam_Cards_Side", (4.2, -0.9, 1.25), (4.2, -2.9, 0.75), lens=30)
    ob = bpy.data.objects
    if "NPC_Barista" in ob:
        b = ob["NPC_Barista"].matrix_world.translation
        cam("QA_Cam_Barista", (b.x + 1.9, b.y - 0.9, 1.6), (b.x, b.y, 1.3), lens=35)
    if "Dart_Board" in ob:
        d = ob["Dart_Board"].matrix_world.translation
        cam("QA_Cam_Darts", (d.x + 0.4, d.y - 1.6, 1.7), (d.x, RD, 1.73), lens=40)
    if "Slot_Machine_01" in ob:
        cam("QA_Cam_Games", (1.9, 0.9, 1.65), (5.0, 2.6, 0.9), lens=26)

# ----------------------------------------------------------------------------- verifiche

# ----------------------------------------------------------------------------- modelli reali (asset-blender-completi + BlendSwap)

def _bb(me):
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    return co, Vector(co.min(0)), Vector(co.max(0))

def _world(loc, rz_deg, local):
    """Punto locale (x, y) di un oggetto posizionato in loc con rotazione rz -> coordinate mondo."""
    a = math.radians(rz_deg)
    return (loc[0] + local[0] * math.cos(a) - local[1] * math.sin(a), loc[1] + local[0] * math.sin(a) + local[1] * math.cos(a))

def _record(name, key, note=None):
    rep = RA.REPORT.get(key, {})
    REPORT["assets"][name] = {"status": "modello reale", "file": rep.get("file"), "scale": rep.get("scale"),
                              "tris": rep.get("tris"), **({"note": note} if note else {}), **({"decimate": rep["decimate"]} if "decimate" in rep else {})}

def build_wine_bottle():
    mb = MB()
    prof = [(0, 0), (0.036, 0), (0.037, 0.004), (0.037, 0.20), (0.030, 0.225), (0.016, 0.245), (0.014, 0.29), (0.016, 0.292),
            (0.016, 0.30), (0, 0.30)]
    mb.lathe(prof, M["bottle_green"], seg=20)
    mb.lathe([(0.0375, 0.07), (0.0375, 0.15)], M["formica"], seg=20)          # etichetta
    return finalize(mb, "Bottle_Wine_Mesh")[0]

def screen_child(parent, display_me, mat, name, coll):
    q = RA.screen_quad(display_me, mat, name + "_Mesh")
    d = make_obj(name, q, coll, parent=parent)
    return d

def build_props_real():
    c = reset_coll("PROPS")
    RA.reset()
    # sedie: stessa mesh per le 12 istanze (8 davanti allo schermo, 4 al tavolo)
    chair = RA.build("chair")["main"]; chair.name = "Chair_Mesh"
    for i, ((x, y), rz) in enumerate(SCREEN_CHAIRS, 1):
        make_obj(f"Chair_Screen_{i:02d}", chair, c, (x, y, 0), rz)
    for i, ((x, y), rz) in enumerate(CARD_CHAIRS, 1):
        make_obj(f"Chair_Cards_{i:02d}", chair, c, (x, y, 0), rz)
    _record("Chair (x12)", "chair")
    # scaffale (senza bottiglie procedurali) e bancone con 58 cm di spazio per il barista
    make_obj("Bottle_Shelf", build_shelf(bottles=False), c, (SHELF_X, 0.5, 0), 90)
    shelf_front = SHELF_X + 0.15
    bar = RA.build("bar")["main"]; bar.name = "Bar_Counter_Mesh"
    _, bmn, bmx = _bb(bar)
    bar_cx = shelf_front + 0.58 + bmx.y
    make_obj("Bar_Counter", bar, c, (bar_cx, 0.5, 0), 90)
    _record("Bar_Counter", "bar")
    LAYOUT.update(bar_cx=bar_cx, bar_top=bmx.z, bar_front_x=bar_cx - bmn.y, bar_back_x=bar_cx - bmx.y,
                  bar_mid_x=bar_cx - (bmn.y + bmx.y) / 2, bar_y=(0.5 + bmn.x, 0.5 + bmx.x), shelf_front=shelf_front)
    # barista rivolto alla sala (+X); il bicchiere da riempire sta sul bancone davanti a lui, alla sua sinistra
    LAYOUT["barista_dist"] = 0.30
    LAYOUT["barista_ref"] = (LAYOUT["bar_back_x"] - LAYOUT["barista_dist"], 0.2)
    LAYOUT["glass_local"] = (0.12, -(LAYOUT["barista_dist"] + 0.20), LAYOUT["bar_top"] + EPS_REST)
    LAYOUT["glass"] = (LAYOUT["barista_ref"][0] - LAYOUT["glass_local"][1], LAYOUT["barista_ref"][1] + LAYOUT["glass_local"][0])
    REPORT["layout_changes"].append(f"Bancone: centro X -5.20 -> {bar_cx:.2f} (58 cm dietro per il barista; passaggio davanti "
                                    f"alle sedie {(-3.225) - LAYOUT['bar_front_x']:.2f} m)")
    # bottiglie: tre modelli come istanze collegate, alternati senza schema, rotazione variabile, distanza regolare
    kinds = []
    if RA.available("grappa"):
        kinds.append(("Grappa", RA.build("grappa")["main"]))
        _record("Bottle_Grappa (istanze)", "grappa")
    if RA.available("mirto"):
        kinds.append(("Mirto", RA.build("mirto")["main"]))
        _record("Bottle_Mirto (istanze)", "mirto")
    kinds.append(("Wine", build_wine_bottle()))
    widths = {k: (_bb(me)[2].x - _bb(me)[1].x) for k, me in kinds}
    rng = np.random.default_rng(21)
    count = {k: 0 for k, _ in kinds}
    last = []
    for zb, ly in ((0.94, -0.01), (1.39, 0.055), (1.81, 0.055)):
        lx = -1.72
        while True:
            options = [k for k, _ in kinds if not (len(last) >= 2 and last[-1] == last[-2] == k)]
            k = options[int(rng.integers(len(options)))]
            w = widths[k]
            if lx + w > 1.72:
                break
            me = dict(kinds)[k]
            count[k] += 1
            wx, wy = _world((SHELF_X, 0.5), 90, (lx + w / 2, ly))
            name = f"Bottle_{k}_{count[k]:02d}"
            make_obj(name, me, c, (wx, wy, zb + EPS_REST), 90 + float(rng.uniform(-25, 25)))
            SUPPORT[name] = zb + EPS_REST
            last.append(k)
            lx += w + 0.05
    REPORT["assets"]["bottles"] = {"status": "istanze collegate", "count": count}
    # spine della birra sul bancone (rivolte al barista) e posacenere
    if RA.available("beer_taps"):
        bt = RA.build("beer_taps")["main"]; bt.name = "Beer_Taps_Mesh"
        make_obj("Beer_Taps", bt, c, (LAYOUT["bar_mid_x"], 0.9, LAYOUT["bar_top"] + EPS_REST), -90)
        SUPPORT["Beer_Taps"] = LAYOUT["bar_top"] + EPS_REST
        _record("Beer_Taps", "beer_taps", "marchi di birra sostituiti da etichette neutre")
    if RA.available("ashtray"):
        at = RA.build("ashtray")["main"]; at.name = "Ashtray_Mesh"
        make_obj("Ashtray_Bar", at, c, (LAYOUT["bar_mid_x"] + 0.12, 2.05, LAYOUT["bar_top"] + EPS_REST), 0)
        SUPPORT["Ashtray_Bar"] = LAYOUT["bar_top"] + EPS_REST
        _record("Ashtray_Bar", "ashtray")
    # biliardo: tavolo vuoto + palle, triangolo e stecca separati (per il futuro biliardo giocabile)
    pool = RA.build("pool")
    make_obj("Pool_Table", pool["main"], c, (*POOL, 0), 0)
    # palle, triangolo e stecca del modello non entrano in scena: il biliardo giocabile crea le sue
    _record("Pool_Table", "pool", "palle, triangolo e stecca del modello rimossi (li genera il minigioco)")
    make_obj("Foosball_Table", RA.build("foosball")["main"], c, (*FOOSBALL, 0), 90)
    _record("Foosball_Table", "foosball")
    slotb = RA.build("slot")
    slot = slotb["main"]; slot.name = "Slot_Machine_Mesh"
    _, smn, smx = _bb(slot)
    sx = RW - GAP - smx.y
    for i, sy in ((1, 2.4), (2, 3.2)):
        o = make_obj(f"Slot_Machine_{i:02d}", slot, c, (sx, sy, 0), -90)
        for part, nm in (("reels", "Reels"), ("buttons", "Buttons"), ("coinplate", "CoinPlate"), ("tray", "Tray")):
            if part in slotb:
                make_obj(f"Slot_Machine_{i:02d}_{nm}", slotb[part], c, (0, 0, 0), 0, parent=o)
    _record("Slot_Machine (x2)", "slot")
    ctb = RA.build("card_table")
    ct = ctb["main"]
    make_obj("Card_Table", ct, c, (*CARD_TABLE, 0), 0)
    if "cards" in ctb:
        make_obj("Card_Table_Cards", ctb["cards"], c, (*CARD_TABLE, 0), 0)
        SUPPORT["Card_Table_Cards"] = None
    # piano del tavolo = la faccia rivolta in alto più grande (il bordo è smussato, le carte stanno sopra)
    up = max((p for p in ct.polygons if p.normal.z > 0.9), key=lambda p: p.area)
    pv = np.array([ct.vertices[v].co[:] for v in up.vertices])
    LAYOUT["card_top"] = float(up.center.z)
    LAYOUT["card_half"] = float(max(np.abs(pv[:, 0]).max(), np.abs(pv[:, 1]).max()))
    _record("Card_Table", "card_table", "tavolo, carte, bicchiere e posacenere del file 11; sedie dal file 01")
    st = RA.build("side_table")
    make_obj("Side_Table", st["main"], c, (*SIDE_TABLE, 0), 0)
    _, tmn, tmx = _bb(st["main"])
    LAYOUT["side_top"] = tmx.z
    if "ashtray" in st:
        make_obj("Ashtray_Side", st["ashtray"], c, (*SIDE_TABLE, 0), 0)
        _, amn, amx = _bb(st["ashtray"])
        LAYOUT["side_ashtray"] = ((SIDE_TABLE[0] + (amn.x + amx.x) / 2, SIDE_TABLE[1] + (amn.y + amx.y) / 2), (amx.x - amn.x) / 2, amx.z)
        SUPPORT["Ashtray_Side"] = None
    _record("Side_Table", "side_table")
    fl = build_flag()
    make_obj("Flag_Sardinia", fl, c, (-4.3, RD - max(v.co.y for v in fl.vertices), 1.8), 0)
    # mini schermo con staffa sopra l'estremità del bancone vicina all'ingresso
    if RA.available("tv32"):
        tv = RA.build("tv32")
        _, vmn, vmx = _bb(tv["main"])
        _, dmn, dmx = _bb(tv["display"])
        z0 = 2.15 - (dmn.z + dmx.z) / 2
        y0 = LAYOUT["bar_y"][0] - 0.55
        o = make_obj("Mini_Screen", tv["main"], c, (-RW + vmx.y, y0, z0), 90, {"screen_material": "MAT_Screen_Mini"})
        screen_child(o, tv["display"], M["screen_mini"], "Mini_Screen_Display", c)
        WALLMOUNT["Mini_Screen"] = ("x", -RW, "min")
        _record("Mini_Screen", "tv32")
    # TV LED sulla parete est, sopra l'angolo del tavolo da carte
    if RA.available("led_tv"):
        tv = RA.build("led_tv")
        _, vmn, vmx = _bb(tv["main"])
        _, dmn, dmx = _bb(tv["display"])
        z0 = 2.0 - (dmn.z + dmx.z) / 2
        o = make_obj("TV_Side", tv["main"], c, (RW - vmx.y, -1.75, z0), -90, {"screen_material": "MAT_Screen_Side"})
        screen_child(o, tv["display"], M["screen_side"], "TV_Side_Display", c)
        WALLMOUNT["TV_Side"] = ("x", RW, "max")
        _record("TV_Side", "led_tv", RA.CREDITS["led_tv"])
    # bersaglio delle freccette sul muro nord, centro a 1.73 m
    if False:          # bersaglio regolamentare costruito da minigames_prep.py
        db = RA.build("dartboard")["main"]
        _, bmn2, bmx2 = _bb(db)
        make_obj("Dart_Board", db, c, (2.8, RD - bmx2.y, 1.73 - (bmx2.z - bmn2.z) / 2), 0)
        WALLMOUNT["Dart_Board"] = ("y", RD, "max")
        _record("Dart_Board", "dartboard", RA.CREDITS["dartboard"])

def build_interactables_real():
    c = reset_coll("INTERACTABLES")
    tv = RA.build("tv65")
    _, vmn, vmx = _bb(tv["main"])
    o = make_obj("TV_Screen", tv["main"], c, (-1.5, RD - vmx.y, 2.0 - (vmx.z - vmn.z) / 2), 0,
                 {"interactable": "look", "screen_material": "MAT_Screen"})
    screen_child(o, tv["display"], M["screen"], "TV_Screen_Display", c)
    WALLMOUNT["TV_Screen"] = ("y", RD, "max")
    _record("TV_Screen", "tv65", "superficie dello schermo rifatta come quad con MAT_Screen e UV 0..1")
    # pacchetto sul tavolino, lontano dal posacenere
    pk = RA.build("pack")["main"]
    top = LAYOUT["side_top"]
    make_obj("Cigarette_Pack", pk, c, (SIDE_TABLE[0] - 0.11, SIDE_TABLE[1] - 0.10, top + EPS_REST), 15,
             {"interactable": "smoke", "item_id": "cigarettes", "cigarettes_left": 5})
    SUPPORT["Cigarette_Pack"] = top + EPS_REST
    _record("Cigarette_Pack", "pack")
    # bicchiere sul bancone verso l'ingresso, liquido figlio con origine alla base
    gl = RA.build("glass")
    gx, gy = LAYOUT["glass"]
    # il bicchiere parte vuoto: lo riempie il barista (serve_drink), poi si prende e si beve
    g = make_obj("Glass", gl["main"], c, (gx, gy, LAYOUT["bar_top"] + EPS_REST), 0,
                 {"interactable": "pickup_drink", "item_id": "glass", "starts_empty": True, "served_by": "NPC_Barista"})
    SUPPORT["Glass"] = LAYOUT["bar_top"] + EPS_REST
    if "liquid" in gl:
        lq = gl["liquid"]
        _, lmn, _ = _bb(lq)
        lq.transform(Matrix.Translation((0, 0, -lmn.z)))
        make_obj("Glass_Liquid", lq, c, (0, 0, lmn.z), 0, {"fill": 0.0}, parent=g)
    _record("Glass", "glass", "vino separato come Glass_Liquid")
    # sigaretta accesa appoggiata sul posacenere del tavolino, con emettitore di fumo sulla brace
    if RA.available("cigarette") and "side_ashtray" in LAYOUT:
        cg = RA.build("cigarette")["main"]
        RA.cigarette_materials(cg)
        _, cmn, cmx = _bb(cg)
        (ax, ay), ar, atop = LAYOUT["side_ashtray"]
        L = cmx.x - cmn.x
        cx = ax + ar * 0.95 - L / 2 + 0.035           # filtro fuori dal bordo, brace sopra la vaschetta
        pc = bpy.data.collections["PROPS"]
        cig = make_obj("Cigarette_Lit", cg, pc, (cx, ay, atop + EPS_REST), 180)
        SUPPORT["Cigarette_Lit"] = None
        e = bpy.data.objects.new("Cigarette_Lit_Smoke", None)
        pc.objects.link(e); e.parent = cig
        e.location = (cmx.x - 0.002, 0, (cmx.z - cmn.z) / 2)
        e.empty_display_size = 0.02
        e["smoke_emitter"] = True
        _record("Cigarette_Lit", "cigarette", RA.CREDITS["cigarette"])

# anziani Meshy: quattro al tavolo da carte (seduti) e i due del biliardino, che girano per il circolo.
# (nome, scala, dove): sedia i del tavolo, oppure un punto ELDER_Spot_* in piedi. "routine" in CONFIG.routines.
ELDER_CAST = [("NPC_Elder_01", 1.00, 1, "efisio"), ("NPC_Elder_02", 0.97, 2, "tonino"), ("NPC_Elder_03", 1.02, 3, "peppino"),
              ("NPC_Elder_04", 0.98, 4, "gavino")]
# punti delle routine degli anziani: (x, y, verso cui guardano) - corridoi liberi tra bancone, sedie TV, biliardo, tavolo
# al bancone ci si ferma a 36 cm dal banco (x -4.0): chi passa usa la corsia R1-R2 a x -3.45, a mezzo metro
ELDER_SPOTS = {"Bar1": (-4.0, 1.6, (-1, 0)), "Bar2": (-4.0, -0.75, (-1, 0)), "Bar3": (-4.0, 2.2, (-1, 0)),
               "Bar4": (-4.0, -1.35, (-1, 0)),
               "CardsPhoto": (2.75, -3.3, (1.45, 0.7)), "Door": (-2.3, -3.2, (0.35, 1)), "Slots": (4.75, 2.8, (1, 0)),
               "Cards2": (5.3, -1.45, (-1.1, -1.15)), "DartsSide": (1.55, 2.0, (-0.6, -1.0)),
               "TV1": (0.85, 1.4, None), "TV2": (0.95, 2.5, None), "TV3": (-3.7, 3.0, None),
               "Darts": (1.6, 2.9, None), "Foos": (4.5, 0.2, None), "Pool": (2.65, -2.05, None)}
# corsia centrale a y = -0.05: tra il biliardo (fino a -0.51) e chi guarda la TV dietro le sedie (0.5)
ELDER_WAYS = {"P": (2.6, -0.2), "Q": (-2.9, -0.05), "R": (-3.55, -0.05), "S": (0.6, -0.05), "K1": (3.55, -1.3), "K2": (5.0, -1.3),
              "E": (2.6, -3.0), "D": (-2.3, -2.4), "R1": (-3.45, 0.9), "R2": (-3.45, 1.95)}
# dove si alza chi lascia la sedia, nello spazio della sedia (fronte -Y): il lato verso il corridoio libero
SEAT_SIDES = {1: (-0.6, 0.2), 2: (-0.6, 0.2), 3: (0.6, 0.2), 4: (0.6, 0.2)}

def _meshy_elders(c, seat_top, back_front):
    """Anziani dal modello Meshy (asset-meshy/elder_rig). None se il pacchetto manca (restano quelli Rigify)."""
    try:
        import meshy_chars
        built = meshy_chars.build_elders_meshy([{"name": n, "scale": sc} for n, sc, _, _ in ELDER_CAST])
    except Exception as e:                                    # noqa: BLE001
        print("ELDERS_MESHY_FAIL", e)
        return None
    if not built:
        return None
    chars, meas = built
    look_at = {"TV": Vector((-1.5, RD)), "Darts": Vector((2.8, RD)), "Foos": Vector(FOOSBALL), "Pool": Vector(POOL)}
    def marker(nm, x, y, fx, fy):
        e = bpy.data.objects.new(nm, None); c.objects.link(e)
        e.location = (x, y, 0); e.rotation_euler = (0, 0, math.atan2(fx, -fy))
        e.empty_display_type = "SINGLE_ARROW"; e.empty_display_size = 0.3
        e["route_marker"] = True
        return e
    spots = {}
    for k, (x, y, f) in ELDER_SPOTS.items():
        if f is None:
            t = look_at[next(p for p in look_at if k.startswith(p))]
            f = (t.x - x, t.y - y)
        spots[k] = marker(f"ELDER_Spot_{k}", x, y, *f)
    for k, (x, y) in ELDER_WAYS.items():
        marker(f"ELDER_Way_{k}", x, y, 0, 1)
    for i, ((x, y), rz) in enumerate(CARD_CHAIRS, 1):
        R = Matrix.Rotation(math.radians(rz), 3, "Z")
        p = Vector((x, y, 0)) + R @ Vector((*SEAT_SIDES[i], 0))
        f = R @ Vector((0, -1, 0))
        marker(f"ELDER_Spot_Seat{i}", p.x, p.y, f.x, f.y)
    sit, stand, walk = "NPC_Elder_Sit", "NPC_Elder_Stand", "NPC_Elder_Walk"
    info = {"model": "Meshy Elderly Man (Rigged biped)", "measures": meas, "per_npc": {}}
    for n, ((root, arm, body), (name, scale, where, routine)) in enumerate(zip(chars, ELDER_CAST), 1):
        _to_coll([root, arm, body], c)
        lift = -scale * meas["stand_min_z"]
        if isinstance(where, int):                          # seduto sulla sedia: schiena allo schienale, sedere sul sedile
            (x, y), rz = CARD_CHAIRS[where - 1]
            dy = back_front - 0.015 - scale * meas["sit_back_y"]
            dz = seat_top + 0.004 - scale * meas["sit_butt_z"]
            root.matrix_world = (Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(rz), 4, "Z")
                                 @ Matrix.Translation((0, dy, dz)) @ Matrix.Diagonal((scale, scale, scale, 1)))
            idle, seated = sit, True
            info["per_npc"][name] = {"seat": where, "dy": round(dy, 3), "dz": round(dz, 3),
                                     "feet_z": round(dz + scale * meas["sit_feet_z"], 3)}
        else:
            sp = spots[where]
            root.matrix_world = (Matrix.Translation((sp.location.x, sp.location.y, lift)) @ sp.matrix_world.to_quaternion().to_matrix().to_4x4()
                                 @ Matrix.Diagonal((scale, scale, scale, 1)))
            idle, seated = stand, False
        meshy_chars._use(arm, bpy.data.actions[idle])
        props = {"npc": True, "npc_action": "play_cards", "standing_height": round(1.76 * scale, 3),
                 "idle_clip": idle, "stand_clip": stand, "sit_clip": sit, "walk_clip": walk, "clip_prefix": "NPC_Elder",
                 "stand_lift": round(lift, 4), "walk_speed": round(meas["walk_speed"] * scale, 3), "seated": seated}
        if seated:
            props["seat"] = f"Chair_Cards_{where:02d}"
        if routine:
            props["routine"] = routine
        for k, v in props.items():
            root[k] = v
    bpy.context.view_layer.update()
    REPORT["assets"]["elder"] = info
    return chars

BARISTA_FIX = [("mixamorig:LeftArm", "Y", 18), ("mixamorig:RightArm", "Y", -18),      # braccia lungo i fianchi
               ("mixamorig:LeftArm", "X", -20), ("mixamorig:RightArm", "X", -4)]     # (la posa di partenza è ad A)

def _meshy_barista(c):
    """Nicola dal modello Meshy (asset-meshy/barista_rig): in piedi, parla, cammina e beve (Stand_and_Drink).
    La versata al bancone la fa il gioco (src/bar.js) con il braccio destro."""
    try:
        import meshy_chars
        built = meshy_chars.build_meshy_char("barista_rig", "NPC_Barista", {"Stand_and_Drink": "Drink", "Walking": "Walk",
                                             "Discuss_While_Moving": "_Discuss"}, "_Discuss", "_Discuss", idle_fix=BARISTA_FIX)
    except Exception as e:                                    # noqa: BLE001
        print("BARISTA_MESHY_FAIL", e)
        return False
    if not built:
        return False
    root, arm, body, meas = built
    _to_coll([root, arm, body], c)
    lift = -meas["stand_min_z"]
    root.matrix_world = Matrix.Translation((*LAYOUT["barista_ref"], lift)) @ Matrix.Rotation(math.radians(90), 4, "Z")
    for k, v in {"npc": True, "npc_action": "serve", "standing_height": 1.70, "interactable": "serve_drink",
                 "idle_clip": "NPC_Barista_Idle", "talk_clip": "NPC_Barista_Talk", "drink_clip": "NPC_Barista_Drink",
                 "walk_clip": "NPC_Barista_Walk", "stand_lift": round(lift, 4), "glass": "Glass", "meshy": True}.items():
        root[k] = v
    REPORT["assets"]["barista"] = {"model": "Meshy Barista (Rigged biped)", "measures": meas}
    return True

# Persone Meshy in piedi (Rafka, Kappa, Zucco): (cartella, file -> clip, clip di partenza per l'attesa, clip per "Talk",
# nome, azione, routine, dove si parte (x, y, verso), proprietà in più)
PEOPLE = [
    ("rafka_rig", {"Stand_and_Chat": "Talk", "Walking": "Walk", "Wave_One_Hand": "Wave"}, "Talk", None,
     "Rafka", "friend", "rafka", (-4.0, -1.35, (0.45, -1.0)), {}),
    ("kappa_rig", {"Idle_3": "Idle", "Walking": "Walk", "Big_Wave_Hello": "Wave"}, "Idle", None,
     "Kappa", "photographer", "kappa", (2.75, -3.3, (1.45, 0.7)), {"camera_role": "photo", "foos_spectator": True}),
    ("zucco_rig", {"Idle_15": "Idle", "Walking": "Walk", "Talk_with_Hands_Open": "Talk"}, "Idle", None,
     "Zucco", "videomaker", "zucco", (0.95, 2.5, (-2.45, 1.5)), {"camera_role": "video", "foos_spectator": True}),
    ("lyuce_rig", {"Walking": "Walk", "Red_Carpet_Walk": "_Carpet"}, "Walk", "_Carpet",
     "Lyuce", "stylist", "lyuce", (-3.7, 3.0, (1.0, -0.6)), {}),
]

def _meshy_people(c):
    import meshy_chars
    for folder, files, stand_from, talk_from, name, action, routine, (x, y, (fx, fy)), extra in PEOPLE:
        key = "NPC_" + name
        try:
            built = meshy_chars.build_meshy_char(folder, key, files, stand_from, talk_from)
        except Exception as e:                                # noqa: BLE001
            print("PERSON_MESHY_FAIL", name, e)
            continue
        if not built:
            continue
        root, arm, body, meas = built
        _to_coll([root, arm, body], c)
        lift = -meas["stand_min_z"]
        root.matrix_world = Matrix.Translation((x, y, lift)) @ Matrix.Rotation(math.atan2(fx, -fy), 4, "Z")
        clips = meas["clips"]
        props = {"npc": True, "npc_action": action, "npc_name": name, "interactable": "talk", "standing_height": 1.72,
                 "idle_clip": key + "_Idle", "walk_clip": key + "_Walk", "stand_clip": key + "_Idle", "clip_prefix": key,
                 "routine": routine, "stand_lift": round(lift, 4), "walk_speed": meas.get("walk_speed", 1.0)}
        props["talk_clip"] = key + ("_Talk" if "Talk" in clips else "_Idle")
        props.update(extra)
        for k, v in props.items():
            root[k] = v
        REPORT["assets"][name.lower()] = {"model": folder, "measures": meas}

def build_camera_prop(c):
    """Reflex (Nikon D7100 + 50 mm, Blend Swap #77959, CC0) per Kappa e Zucco: ridotta, materiali semplici, obiettivo
    verso -Y locale (il fronte, come i personaggi), origine al centro del corpo. Nascosta: il gioco ne fa le copie."""
    src = "/Users/simonesanna/Desktop/circolo-sardegna-assets/asset-props/nikon/NikonD7100.blend"
    if not os.path.exists(src):
        return None
    with bpy.data.libraries.load(src, link=False) as (df, dt):
        dt.objects = [n for n in df.objects if n in ("D7100", "Nikkor50mm1.8D")]
    objs = [o for o in dt.objects if o]
    for o in objs:
        c.objects.link(o)
    bpy.context.view_layer.update()
    body = next(o for o in objs if o.name.startswith("D7100"))
    lens = next(o for o in objs if o.name.startswith("Nikkor"))
    bc = sum((body.matrix_world @ Vector(v) for v in body.bound_box), Vector()) / 8
    lc = sum((lens.matrix_world @ Vector(v) for v in lens.bound_box), Vector()) / 8
    fwd = (lc - bc); fwd.z = 0; fwd.normalize()                # verso dell'obiettivo (orizzontale)
    mats = {"body": _flat_mat("MAT_Camera_Body", (0.018, 0.018, 0.02), 0.55), "grip": _flat_mat("MAT_Camera_Grip", (0.03, 0.03, 0.032), 0.8),
            "chrome": _flat_mat("MAT_Camera_Chrome", (0.6, 0.6, 0.62), 0.25, 1.0), "glass": _flat_mat("MAT_Camera_Glass", (0.02, 0.03, 0.05), 0.05, 0.2)}
    for o in objs:
        me = o.data = o.data.copy()
        for i, m in enumerate(me.materials):
            n = (m.name if m else "").lower()
            me.materials[i] = mats["glass"] if "glass" in n else mats["chrome"] if "chrome" in n else mats["grip"] if "leather" in n else mats["body"]
        o.parent = None
        o.matrix_world = o.matrix_world                        # (già in coordinate mondo dopo il distacco)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    cam = bpy.context.view_layer.objects.active
    cam.name = cam.data.name = "Prop_Camera"
    md = cam.modifiers.new("dec", "DECIMATE"); md.ratio = 3200 / max(1, sum(len(p.vertices) - 2 for p in cam.data.polygons))
    bpy.ops.object.modifier_apply(modifier=md.name)
    # geometria in coordinate mondo, poi origine al centro del corpo e obiettivo ruotato su -Y
    cam.data.transform(cam.matrix_world)
    cam.matrix_world = Matrix.Identity(4)
    ang = math.atan2(fwd.x, -fwd.y)
    cam.data.transform(Matrix.Rotation(-ang, 4, "Z") @ Matrix.Translation(-bc))
    cam.location = (0, 0, -2)                                  # sotto il pavimento: il gioco la nasconde e la copia
    cam["start_hidden"] = True
    cam["prop"] = "camera"
    return cam

def _flat_mat(name, color, rough, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def build_npcs_rigged():
    """Anziani e barista con scheletro e animazioni (Idle, Pour) esportati nel glb."""
    c = reset_coll("NPC")
    for a in list(bpy.data.actions):
        if a.name.startswith(("NPC_Elder_", "NPC_Barista_")):
            bpy.data.actions.remove(a)
    seat_top, back_front, boxes = _chair_geometry()
    edge = CARD_R - LAYOUT.get("card_half", 0.45)
    REPORT["assets"]["elder"] = {"status": "Human Base Meshes (CC0) + scheletro + animazione Idle", "per_npc": {},
                                 "chair": {"seat_top": round(seat_top, 3), "back_front": round(back_front, 3)}}
    meshy_elders = _meshy_elders(c, seat_top, back_front)
    for i, ((x, y), rz) in enumerate(CARD_CHAIRS if not meshy_elders else [], 1):
        arm, body, info = humans.build_elder_rigged(i, seat_top, back_front - 0.035, LAYOUT.get("card_top", 0.75), chair_boxes=boxes,
                                                    table_dist=CARD_R, table_edge=edge)
        _to_coll([arm, body], c)
        off = arm.location.copy()
        arm.matrix_world = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(rz), 4, "Z") @ Matrix.Translation(off)
        for k, v in {"npc": True, "npc_action": "play_cards", "seat": f"Chair_Cards_{i:02d}", "standing_height": 1.75,
                     "idle_clip": info["clip"], "stand_clip": info["stand_clip"], "stand_lift": info["stand_lift"]}.items():
            arm[k] = v
        REPORT["assets"]["elder"]["per_npc"][i] = info
    if not _meshy_barista(c):                              # ripiego: barista Rigify con la versata
        bottle = build_wine_bottle()
        bottle.name = "Barista_Bottle_Mesh"
        arm, body, bot, info = humans.build_barista_rigged(LAYOUT["barista_dist"], LAYOUT["bar_top"], LAYOUT["glass_local"], bottle)
        _to_coll([arm, body, bot], c)
        off = arm.location.copy()
        arm.matrix_world = Matrix.Translation((*LAYOUT["barista_ref"], 0)) @ Matrix.Rotation(math.radians(90), 4, "Z") @ Matrix.Translation(off)
        for k, v in {"npc": True, "npc_action": "serve", "standing_height": 1.75, "interactable": "serve_drink",
                     "idle_clip": "NPC_Barista_Idle", "pour_clip": "NPC_Barista_Pour", "pour_len": info["pour_len_s"],
                     "pour_fill_start": info["pour_fill_s"][0], "pour_fill_end": info["pour_fill_s"][1],
                     "bottle_in": info["bottle_in_s"], "bottle_out": info["bottle_out_s"], "bottle": "Barista_Bottle",
                     "glass": "Glass"}.items():
            arm[k] = v
        if bot is not None:
            bot["neck_local"] = info["neck_local"]
    _meshy_people(c)
    build_camera_prop(get_coll("HIDDEN_PROPS"))
    # due giocatori al biliardino, sui lati lunghi (le impugnature della squadra A sono sul lato +X del mondo)
    REPORT["assets"]["foosball_players"] = {}
    for k, (name, team, side) in enumerate((("Bachisio", "A", 1), ("Salvatore", "B", -1)) if not meshy_elders else (), 1):
        parm, pbody, pinfo = humans.build_player_rigged(4 + k, name)
        _to_coll([parm, pbody], c)
        off = parm.location.copy()
        x = FOOSBALL[0] + side * 1.12
        rz = math.atan2(-side, 0)                           # fronte (-Y locale) verso il tavolo
        parm.matrix_world = Matrix.Translation((x, FOOSBALL[1], 0)) @ Matrix.Rotation(rz, 4, "Z") @ Matrix.Translation(off)
        for kk, v in {"npc": True, "npc_action": "play_foosball", "npc_name": name, "foos_team": team, "standing_height": 1.75,
                      "idle_clip": pinfo["clip"], "stand_clip": pinfo["stand_clip"], "stand_lift": pinfo["stand_lift"]}.items():
            parm[kk] = v
        REPORT["assets"]["foosball_players"][name] = pinfo
    # Cronico (modello Meshy): il padrone di casa. Con il pacchetto "Rigged biped" usa scheletro e animazioni di Meshy
    # (Idle, Walk, Talk, Agree, ThumbUp...), altrimenti il modello con texture rigato con Rigify.
    try:
        import meshy_chars
        built = meshy_chars.build_cronico_meshy()
        if built:
            croot, carm, cbody, cinfo = built
            objs = [croot] + list(croot.children_recursive)
        else:
            carm, cbody, cinfo = meshy_chars.build_cronico()
            croot, objs = carm, [carm, cbody]
            cinfo["clips"] = [cinfo["clip"], cinfo["talk_clip"]]
        _to_coll(objs, c)
        # accoglienza: ~2,2 m davanti a chi entra, rivolto verso il punto d'ingresso (SPAWN_XY)
        entry = Vector((*SPAWN_XY, 0))
        pos = Vector((entry.x + 0.6, entry.y + 2.1, 0))
        look = Vector((entry.x, entry.y, 0)) - pos
        croot.matrix_world = Matrix.Translation(pos) @ Matrix.Rotation(math.atan2(look.x, -look.y), 4, "Z")
        bpy.context.view_layer.update()
        if built:                                             # suole a terra (misura sulla mesh deformata)
            mn, _ = _npc_world_box(carm)
            croot.location.z -= mn.z
        props = {"npc": True, "npc_action": "host", "npc_name": "Cronico", "interactable": "talk", "standing_height": 1.8,
                 "idle_clip": "NPC_Cronico_Idle", "talk_clip": "NPC_Cronico_Talk", "routine": "cronico"}
        if "NPC_Cronico_Walk" in cinfo["clips"]:
            props["walk_clip"] = "NPC_Cronico_Walk"
        for kk, v in props.items():
            croot[kk] = v
        # punti della routine (fronte -Y locale verso dove guarda) e passaggi nei corridoi liberi
        def spot(nm, x, y, fx, fy):
            e = bpy.data.objects.new(nm, None); c.objects.link(e)
            e.location = (x, y, 0); e.rotation_euler = (0, 0, math.atan2(fx, -fy))
            e.empty_display_type = "SINGLE_ARROW"; e.empty_display_size = 0.3
            e["route_marker"] = True
        ct = Vector(CARD_TABLE)
        cards = Vector((2.85, -1.45))                        # a vedere la partita a carte, lontano da dove si alza Gavino
        spot("CRONICO_Spot_Entrance", pos.x, pos.y, look.x, look.y)
        spot("CRONICO_Spot_Bar", LAYOUT["bar_front_x"] + 0.36, 0.95, -1, 0)    # accanto a chi ordina (bicchiere a y 0.32)
        spot("CRONICO_Spot_TV", -1.3, 0.5, 0, 1)                             # dietro le sedie, fuori dalla corsia (y -0.05)
        spot("CRONICO_Spot_Cards", cards.x, cards.y, ct.x - cards.x, ct.y - cards.y)
        for nm, x, y in (("A", -2.8, -1.0), ("B", -2.9, 0.3), ("C", 2.55, 0.2), ("D", 2.7, -1.4), ("E", 2.6, -3.1), ("F", -2.2, -3.1)):
            spot(f"CRONICO_Way_{nm}", x, y, 0, 1)
        REPORT["assets"]["cronico"] = cinfo
    except Exception as err:                                  # senza il modello Meshy la scena si costruisce lo stesso
        import traceback; traceback.print_exc()
        REPORT["assets"]["cronico"] = {"status": f"non caricato: {err}"}
    if "barista" not in REPORT["assets"]:                 # barista Rigify di ripiego
        REPORT["assets"]["barista"] = {"status": "Human Base Meshes (CC0) + scheletro + animazioni Idle/Pour", **info}
    humans.cleanup()
    tmp = bpy.data.collections.get("_TMP")
    if tmp:
        for ob in list(tmp.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.collections.remove(tmp)
    bpy.context.scene.frame_set(1)

def _chair_geometry():
    """Sedile, schienale e gambe anteriori della sedia reale, nello spazio locale (fronte -Y)."""
    co, mn, mx = _bb(bpy.data.meshes["Chair_Mesh"])
    mid = co[(np.abs(co[:, 0]) < 0.12) & (np.abs(co[:, 1]) < 0.12)]
    seat_top = float(mid[:, 2].max())
    seat_bot = float(mid[mid[:, 2] > seat_top - 0.12][:, 2].min())
    back = co[co[:, 2] > seat_top + 0.15]
    back_front = float(back[:, 1].min())
    front = co[(co[:, 1] < -0.12) & (co[:, 2] < seat_bot - 0.005)]
    boxes = [((float(mn.x), float(mn.y), seat_bot), (float(mx.x), back_front, seat_top))]
    if len(front):
        boxes.append(((float(front[:, 0].min()), float(front[:, 1].min()), 0.0), (float(front[:, 0].max()), float(front[:, 1].max()), seat_bot)))
    return seat_top, back_front, boxes

def _to_coll(objs, coll):
    for o in objs:
        if o is None:
            continue
        for cc in list(o.users_collection):
            cc.objects.unlink(o)
        coll.objects.link(o)

def build_npcs_real():
    if hasattr(humans, "build_elder_rigged"):
        return build_npcs_rigged()
    c = reset_coll("NPC")
    seat_top, back_front, boxes = _chair_geometry()
    edge = CARD_R - LAYOUT.get("card_half", 0.45)
    for i, ((x, y), rz) in enumerate(CARD_CHAIRS, 1):
        me, info = humans.build_elder(i, seat_top, back_front - 0.035, LAYOUT.get("card_top", 0.75), chair_boxes=boxes,
                                      table_dist=CARD_R, table_edge=edge)
        co, mn, mx = _bb(me)
        off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
        me.transform(Matrix.Translation(-off))
        o = make_obj(f"NPC_Elder_{i:02d}", me, c, props={"npc": True, "npc_action": "play_cards",
                                                           "seat": f"Chair_Cards_{i:02d}", "standing_height": 1.75})
        o.matrix_world = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(rz), 4, "Z") @ Matrix.Translation(off)
        REPORT["assets"].setdefault("elder", {"status": "Human Base Meshes (CC0) + rig automatico + posa seduta", "per_npc": {}})
        REPORT["assets"]["elder"]["per_npc"][i] = info
    REPORT["assets"]["elder"]["chair"] = {"seat_top": round(seat_top, 3), "back_front": round(back_front, 3)}
    # barista dietro il bancone, rivolto verso la sala
    dist = 0.30
    me, info = humans.build_barista(dist, LAYOUT["bar_top"])
    co, mn, mx = _bb(me)
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    me.transform(Matrix.Translation(-off))
    ref = (LAYOUT["bar_back_x"] - dist, 0.2)
    o = make_obj("NPC_Barista", me, c, props={"npc": True, "npc_action": "serve", "standing_height": 1.75})
    o.matrix_world = Matrix.Translation((*ref, 0)) @ Matrix.Rotation(math.radians(90), 4, "Z") @ Matrix.Translation(off)
    REPORT["assets"]["barista"] = {"status": "Human Base Meshes (CC0) + rig automatico + posa in piedi", **info}
    humans.cleanup()
    tmp = bpy.data.collections.get("_TMP")
    if tmp:
        for ob in list(tmp.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        bpy.data.collections.remove(tmp)

def world_aabb(o):
    bb = [o.matrix_world @ Vector(v) for v in o.bound_box]
    return (Vector([min(v[k] for v in bb) for k in range(3)]), Vector([max(v[k] for v in bb) for k in range(3)]))

def bvh(o):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    vs = [o.matrix_world @ v.co for v in me.vertices]
    ps = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    return BVHTree.FromPolygons(vs, ps)

MULTIBOX = {"Wall_South", "Skirting"}

def boxes_of(o):
    """AABB mondo; per le mesh fatte di piu' box (muro sud, battiscopa) un AABB per isola da 8 vertici."""
    if o.name.replace("COL_", "") not in MULTIBOX:
        return [world_aabb(o)]
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return [(Vector([min(v[j] for v in vs[k:k + 8]) for j in range(3)]), Vector([max(v[j] for v in vs[k:k + 8]) for j in range(3)]))
            for k in range(0, len(vs), 8)]

def check_intersections():
    furn = [o for cn in ("PROPS", "INTERACTABLES") for o in bpy.data.collections[cn].objects
            if o.type == "MESH" and o.parent is None and o.name != "Flag_Sardinia"]
    arch = [o for o in bpy.data.collections["ARCHITECTURE"].objects if o.type == "MESH"]
    npcs = [o for o in bpy.data.collections["NPC"].objects if o.type == "MESH"]     # corpi e oggetti, non le armature
    pairs = [(a, b) for i, a in enumerate(furn) for b in furn[i + 1:]] + [(a, b) for a in furn for b in arch] \
        + [(n, b) for n in npcs for b in arch]
    aabb_hits, real = [], []
    for a, b in pairs:
        ov = max((min(min(a1[k], b1[k]) - max(a0[k], b0[k]) for k in range(3))
                  for a0, a1 in boxes_of(a) for b0, b1 in boxes_of(b)))
        ov = [ov]
        if min(ov) > 0.01:
            hit = bool(bvh(a).overlap(bvh(b)))
            aabb_hits.append({"a": a.name, "b": b.name, "overlap_m": round(min(ov), 3), "mesh_intersect": hit})
            if hit:
                real.append((a.name, b.name))
    # NPC contro sedia e tavolo: solo test mesh (bbox necessariamente sovrapposti)
    npc_mesh = []
    near_bar = [bpy.data.objects[k] for k in ("Bar_Counter", "Bottle_Shelf", "Beer_Taps", "Glass") if k in bpy.data.objects]
    def owner(n):
        return n.parent if (n.parent and n.parent.type == "ARMATURE") else n
    bodies = [n for n in npcs if n.type == "MESH" and n.name.endswith("_Body")]
    for f in (1, 48, 96, 120, 60, 100):                     # posa di base, respiro, sguardo, carta calata, versata
        bpy.context.scene.frame_set(f)
        for n in bodies:
            o = owner(n)
            seat = o.get("seat") or (o.parent.get("seat") if o.parent else None)     # anziani Meshy: sulla radice
            others = ([bpy.data.objects[seat], bpy.data.objects["Card_Table"]] if seat else near_bar) + \
                     [m for m in bodies if m != n]
            for other in others:
                if bvh(n).overlap(bvh(other)):
                    pair = (o.name, owner(other).name if other in bodies else other.name, f)
                    if pair[:2] not in [p[:2] for p in npc_mesh]:
                        npc_mesh.append(pair)
    bpy.context.scene.frame_set(1)
    REPORT["checks"]["intersections"] = {"aabb_over_1cm": aabb_hits, "mesh_intersections": real,
                                         "npc_mesh_intersections": npc_mesh,
                                         "ok": not real and not npc_mesh}

EXPECT_BASE = {"Cigarette_Pack": SIDE_TOP + EPS_REST, "Glass": COUNTER_TOP + EPS_REST, "TV_Screen": TV_Z,
               "Flag_Sardinia": 1.8}

def check_grounding_and_cols():
    bad, missing, wrong = [], [], []
    bpy.context.scene.frame_set(1)
    for arm in [o for o in bpy.data.collections["NPC"].objects if o.type == "ARMATURE"]:
        mn, mx = _npc_world_box(arm)
        if arm.parent is not None and arm.parent.get("seated"):
            continue                                        # seduti (Meshy): piedi della clip, riportati in REPORT elder
        if abs(mn.z) > 0.004:
            bad.append({"obj": arm.name, "zmin": round(mn.z, 4), "expected": 0.0})
    wall = dict(WALLMOUNT)
    wall.setdefault("Flag_Sardinia", ("y", RD, "max"))
    if not use_real():
        wall.setdefault("TV_Screen", ("y", RD, "max"))
    for cn in ("PROPS", "INTERACTABLES", "NPC"):
        for o in bpy.data.collections[cn].objects:
            if o.type != "MESH" or o.parent is not None:
                continue
            mn, mx = world_aabb(o)
            if o.name in wall:
                ax, v, side = wall[o.name]
                k = "xyz".index(ax)
                got = mx[k] if side == "max" else mn[k]
                if abs(got - v) > 0.003:
                    bad.append({"obj": o.name, "wall": ax, "got": round(got, 4), "expected": v})
                continue
            exp = SUPPORT.get(o.name, EXPECT_BASE.get(o.name, 0.0) if not use_real() else 0.0)
            if exp is None:
                continue                                    # appoggiato su una superficie non piana (posacenere, feltro)
            if abs(mn.z - exp) > 0.002:
                bad.append({"obj": o.name, "zmin": round(mn.z, 4), "expected": round(exp, 4)})
    for cn in ("ARCHITECTURE", "PROPS", "INTERACTABLES", "NPC"):
        for o in bpy.data.collections[cn].objects:
            if o.type != "MESH":
                continue
            has = ("COL_" + o.name) in bpy.data.objects
            if o.name in PICKUPS or o.name == "Glass_Liquid":
                if has:
                    wrong.append(o.name)
            elif not no_col(o.name) and o.parent is None and not has:
                missing.append(o.name)
    REPORT["checks"]["grounding"] = {"bad": bad, "ok": not bad}
    REPORT["checks"]["collisions"] = {"missing": missing, "pickups_with_static_col": wrong,
                                      "exempt": "decorazioni appese o appoggiate: " + ", ".join(NO_COL_PREFIX),
                                      "ok": not missing and not wrong}

def check_walkability():
    res, rad = 0.05, 0.45                                   # disco da 0.9 m di diametro
    xs = np.arange(-RW + res / 2, RW, res)
    ys = np.arange(-RD + res / 2, RD, res)
    X, Y = np.meshgrid(xs, ys, indexing="ij")
    free = np.ones(X.shape, bool)
    rects = {}
    for o in bpy.data.collections["COLLISION"].objects:
        src = o["source"]
        if src in ("Floor", "Ceiling"):
            continue
        for mn, mx in boxes_of(o):
            if mx.z < 0.05 or mn.z > 1.9:
                continue                                    # sotto i piedi o sopra la testa
            dx = np.maximum(np.maximum(mn.x - X, X - mx.x), 0)
            dy = np.maximum(np.maximum(mn.y - Y, Y - mx.y), 0)
            free &= (dx * dx + dy * dy) >= rad * rad
            rects.setdefault(src, []).append((mn.x, mn.y, mx.x, mx.y))
    def cell(p):
        return int((p[0] + RW) / res), int((p[1] + RD) / res)
    start = cell((-3.5, -3.3))
    seen = np.zeros_like(free)
    stack = [start] if free[start] else []
    seen[start] = True
    while stack:
        i, j = stack.pop()
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = i + di, j + dj
            if 0 <= a < free.shape[0] and 0 <= b < free.shape[1] and free[a, b] and not seen[a, b]:
                seen[a, b] = True
                stack.append((a, b))
    gl = LAYOUT.get("glass")
    glass_pt = (LAYOUT["bar_front_x"] + 0.5, gl[1]) if gl else (-4.35, -1.2)
    targets = {"Glass (bancone)": glass_pt, "TV_Screen (vista)": (-1.5, 0.2), "Cigarette_Pack (tavolino)": (4.55, -0.8)}
    reach = {k: bool(seen[cell(p)]) for k, p in targets.items()}
    # 1 m sui lati lunghi del biliardo
    pmn, pmx = world_aabb(bpy.data.objects["Pool_Table"])
    gaps = {}
    for src, rs in rects.items():
        if src == "Pool_Table":
            continue
        for x0, y0, x1, y1 in rs:
            if min(x1, pmx.x) - max(x0, pmn.x) > 0:
                g = y0 - pmx.y if y0 >= pmx.y else (pmn.y - y1 if y1 <= pmn.y else -1)
                gaps[src] = round(min(g, gaps.get(src, 99)), 3)
    min_gap = min(gaps.values())
    REPORT["checks"]["walkability"] = {"spawn_free": bool(free[start]), "reachable_with_0.9m": reach,
                                       "pool_long_side_min_gap": min_gap,
                                       "pool_gaps": dict(sorted(gaps.items(), key=lambda kv: kv[1])[:4]),
                                       "ok": all(reach.values()) and min_gap >= 1.0 and bool(free[start])}
    return free, seen

def count_tris():
    per, uniq = {}, {}
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.users_collection[0].name == "COLLISION":
            continue
        o.data.calc_loop_triangles()
        per[o.name] = len(o.data.loop_triangles)
        uniq[o.data.name] = per[o.name]
    REPORT["checks"]["triangles"] = {"total_rendered": sum(per.values()), "unique_meshes": sum(uniq.values()),
                                     "over_50k": [k for k, v in per.items() if v > 50000],
                                     "top5": dict(sorted(per.items(), key=lambda kv: -kv[1])[:5])}

# ----------------------------------------------------------------------------- render, salvataggio, export

def setup_render():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = 32
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    bg = w.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.012, 0.015, 0.025, 1)
        bg.inputs["Strength"].default_value = 1.0
    sc.view_settings.exposure = 0.0

def render(cam, path, res):
    sc = bpy.context.scene
    sc.camera = bpy.data.objects[cam]
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)

def export_all():
    sc = bpy.context.scene
    if RA is not None:
        AL.dedupe_images()
    main = [o for o in sc.objects if o.users_collection[0].name not in ("COLLISION", "QA_CAMERAS", "_IMPORT_TEST")]
    cols = list(bpy.data.collections["COLLISION"].objects)
    common = dict(export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
                  export_extras=True, export_cameras=False)
    deform_only = dict(export_def_bones=True)               # rig Rigify: solo le ossa DEF (le animazioni vengono campionate)
    for o in sc.objects:
        o.select_set(o in main)
    for o in sc.objects:                                  # clip condivise: esportate una volta (sul primo anziano)
        if o.get("anim_shared") and o.animation_data:
            o.animation_data.action = None
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "circolo.glb"), export_lights=True, export_skins=True, export_animations=True,
                              export_animation_mode="ACTIONS", **deform_only, **common)
    for o in sc.objects:
        o.select_set(o in cols)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "circolo_collision.glb"), export_lights=False,
                              export_materials="NONE", **common)
    for o in sc.objects:
        o.select_set(False)
    manifest = {}
    for o in main:
        mn, mx = world_aabb(o) if o.type == "MESH" else (o.matrix_world.translation, o.matrix_world.translation)
        manifest[o.name] = {"type": o.type, "parent": o.parent.name if o.parent else None,
                            "props": {k: (v if isinstance(v, (int, float, str, bool)) else str(v)) for k, v in o.items()},
                            "dims": [round(mx[k] - mn[k], 4) for k in range(3)],
                            "loc": [round(v, 4) for v in o.matrix_world.translation]}
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    REPORT["export"] = {"main_objects": len(main), "collision_objects": len(cols)}

# ----------------------------------------------------------------------------- main

def main():
    sc = bpy.context.scene
    sc.unit_settings.system, sc.unit_settings.scale_length, sc.unit_settings.length_unit = "METRIC", 1.0, "METERS"
    for n in ("Cube", "Light", "Camera"):
        o = bpy.data.objects.get(n)
        if o and not o.users_collection[0].name in COLLS:
            bpy.data.objects.remove(o, do_unlink=True)
    dc = bpy.data.collections.get("Collection")
    if dc and not dc.objects:
        bpy.data.collections.remove(dc)
    for cn in COLLS:
        get_coll(cn)
    build_materials()
    MG.B = types.SimpleNamespace(**globals())            # il modulo dei minigiochi usa helper e misure di questo script
    for step in (build_architecture, build_props, build_interactables, build_npcs, MG.build, build_lights,
                 build_spawn, build_collisions, build_qa_cameras):
        step()
        print("OK", step.__name__)
    tmp = bpy.data.collections.get("_IMPORT_TEST")
    if tmp:
        bpy.data.collections.remove(tmp)
    bpy.data.collections["COLLISION"].hide_render = True
    bpy.context.view_layer.update()
    check_intersections()
    check_grounding_and_cols()
    check_walkability()
    REPORT["checks"]["darts_corridor_blockers"] = MG.check_corridor()
    count_tris()
    setup_render()
    if "--no-render" not in sys.argv:
        for cam, fn, res in (("QA_Cam_Spawn", "qa_spawn.png", (1280, 720)), ("QA_Cam_Top", "qa_top.png", (1320, 880)),
                             ("QA_Cam_Bar", "qa_bar_to_screen.png", (1280, 720)), ("QA_Cam_Cards", "qa_cards.png", (1280, 720)),
                             ("QA_Cam_Cards_Side", "qa_cards_side.png", (1280, 720)), ("QA_Cam_Barista", "qa_barista.png", (1280, 720)),
                             ("QA_Cam_Darts", "qa_darts.png", (1280, 720)), ("QA_Cam_Games", "qa_games.png", (1280, 720))):
            if cam not in bpy.data.objects:
                continue
            render(cam, os.path.join(OUT, fn), res)
    if "--no-render" not in sys.argv:
        # viste dei minigiochi dai marcatori CAM_*: stessa convenzione di una camera Blender
        for mk in [o for o in sc.objects if o.name.startswith("CAM_")]:
            cd = bpy.data.cameras.new("_qa_mg"); cd.lens_unit = "FOV"; cd.angle = math.radians(mk.get("fov", 55)) * 1.4
            co = bpy.data.objects.new("_qa_mg", cd); sc.collection.objects.link(co)
            co.matrix_world = mk.matrix_world.copy()
            render("_qa_mg", os.path.join(OUT, f"qa_mg_{mk.name[4:].lower()}.png"), (960, 540))
            bpy.data.objects.remove(co); bpy.data.cameras.remove(cd)
    sc.camera = bpy.data.objects["QA_Cam_Spawn"]
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "circolo.blend"), compress=True)
    export_all()
    REPORT["object_count"] = len(sc.objects)
    REPORT["names_with_suffix"] = [o.name for o in bpy.data.objects if "." in o.name[-4:]]
    with open(os.path.join(OUT, "report.json"), "w") as f:
        json.dump(REPORT, f, indent=1, default=str)
    print("REPORT_JSON", json.dumps(REPORT["checks"], default=str))

main()

"""Marcatori e parti mobili dei minigiochi (biliardo, biliardino, freccette, scopa).

Chiamato da build_circolo.py dopo props e NPC. Rieseguibile: la collezione MINIGAMES viene svuotata e ricreata,
le aste del biliardino e il bersaglio sono ricostruiti ogni volta.

Convenzioni (arrivano nel glb come extras):
- interactable = "minigame", minigame_id = pool | foosball | darts | scopa sugli oggetti che avviano il gioco;
- CAM_<gioco>_<vista>: empty orientati come una camera Blender (guardano lungo -Z locale, alto = +Y locale);
- piani di gioco: mesh sottili con marker_plane = True (il gioco li nasconde), origine al centro, X locale sul lato lungo;
- spot degli NPC: empty con il fronte lungo -Y locale, come le armature dei personaggi.
Tutte le misure dei tavoli sono ricavate con raycast sui modelli, non scritte a mano.
"""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix

B = None                         # namespace di build_circolo.py, assegnato da lì prima di build()

DART_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
DART_R = {"bull": 0.00635, "outer_bull": 0.0159, "treble_in": 0.099, "treble_out": 0.107,
          "double_in": 0.162, "double_out": 0.170, "board": 0.2255}
DART_X = 2.8                     # stessa posizione del vecchio bersaglio sul muro nord: corsia libera fino alla linea di tiro
THROW_DIST = 2.37
POCKET_R = {"corner": 0.060, "side": 0.065}
POCKET_OFFSET = 0.035            # centro buca oltre lo spigolo interno delle sponde (Buca_* del modello 07)
FOOS_BALL_R = 0.0175
NAMES = {1: "Efisio", 2: "Tonino", 3: "Peppino", 4: "Gavino"}       # per sedia del tavolo da carte
BARISTA_NAME = "Nicola"
REPORT = {}


# ----------------------------------------------------------------------------- utilità

def _coll():
    return B.reset_coll("MINIGAMES")


def empty(name, coll, loc, rot=(0, 0, 0), props=None, size=0.12, kind="PLAIN_AXES"):
    o = bpy.data.objects.new(name, None)
    coll.objects.link(o)
    o.empty_display_type = kind
    o.empty_display_size = size
    o.location = loc
    o.rotation_euler = rot
    for k, v in (props or {}).items():
        o[k] = v
    return o


def cam_rot(eye, target, up_hint=(0, 0, 1)):
    """Rotazione di una camera Blender in eye che guarda target."""
    d = (Vector(target) - Vector(eye)).normalized()
    if abs(d.dot(Vector(up_hint))) > 0.999:
        up_hint = (0, 1, 0)
    return d.to_track_quat("-Z", "Y").to_euler()


def cam(name, coll, eye, target, props=None):
    return empty(name, coll, eye, cam_rot(eye, target), {"camera_marker": True, **(props or {})}, kind="ARROWS")


def cam_down(name, coll, eye, up_dir, props=None):
    """Camera che guarda dritta in basso, con l'alto dello schermo lungo up_dir (orizzontale)."""
    ang = math.atan2(-up_dir[0], up_dir[1])
    return empty(name, coll, eye, (0, 0, ang), {"camera_marker": True, **(props or {})}, kind="ARROWS")


def facing(fx, fy):
    """rotation_euler di un NPC (fronte -Y locale) che guarda nella direzione (fx, fy)."""
    return (0, 0, math.atan2(fx, -fy))


def plane(name, coll, center, sx, sy, rz=0.0, props=None):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, matrix=Matrix.Diagonal((sx, sy, 1, 1)))
    me = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    o.location = center
    o.rotation_euler = (0, 0, rz)
    o["marker_plane"] = True
    o["size"] = [round(sx, 5), round(sy, 5)]
    for k, v in (props or {}).items():
        o[k] = v
    o.hide_render = True
    o.display_type = "WIRE"
    return o


def ray(obj, origin_local, dir_local):
    ok, loc, nor, idx = obj.ray_cast(Vector(origin_local), Vector(dir_local).normalized())
    return (loc, (loc - Vector(origin_local)).length) if ok else (None, None)


def _mat(name, color, rough=0.5, metal=0.0, emit=None, estr=0.0):
    return B.mat(name, color, rough, metal, emit, estr)


# ----------------------------------------------------------------------------- biliardo

def build_pool(c):
    pt = bpy.data.objects["Pool_Table"]
    W = pt.matrix_world
    cz = ray(pt, (0.3, 0.2, 3.0), (0, 0, -1))[0].z                   # altezza del panno
    zc = cz + 0.015                                                  # a metà altezza della palla: colpisce le sponde
    hx = min(ray(pt, (0, 0.2, zc), (1, 0, 0))[1], ray(pt, (0, 0.2, zc), (-1, 0, 0))[1])
    hy = min(ray(pt, (0.4, 0, zc), (0, 1, 0))[1], ray(pt, (0.4, 0, zc), (0, -1, 0))[1])
    surf = plane("POOL_Surface", c, W @ Vector((0, 0, cz)), 2 * hx, 2 * hy, pt.rotation_euler.z,
                 {"cloth_height": round(cz, 4), "ball_radius": 0.028575})
    k = 1
    for sx, sy, kind in ((-1, -1, "corner"), (0, -1, "side"), (1, -1, "corner"), (1, 1, "corner"), (0, 1, "side"), (-1, 1, "corner")):
        p = Vector((sx * (hx + POCKET_OFFSET), sy * (hy + POCKET_OFFSET), cz))
        empty(f"POOL_Pocket_{k}", c, W @ p, props={"radius": POCKET_R[kind], "kind": kind}, size=0.06)
        k += 1
    empty("POOL_HeadSpot", c, W @ Vector((-hx / 2, 0, cz)), size=0.04)
    empty("POOL_FootSpot", c, W @ Vector((hx / 2, 0, cz)), size=0.04)
    ctr = W @ Vector((0, 0, cz))
    cam_down("CAM_Pool_Top", c, ctr + Vector((0, 0, 2.35)), (0, 1, 0), {"fov": 55})
    cam("CAM_Pool_Spectate", c, W @ Vector((0.2, -(hy + 1.35), 1.62)), ctr, {"fov": 60})
    spot = W @ Vector((-hx - 0.05, -(hy + 0.95), 0))
    empty("POOL_OpponentSpot", c, spot, facing(ctr.x - spot.x, ctr.y - spot.y), {"npc_name": NAMES[2]}, size=0.3, kind="SINGLE_ARROW")
    pt["interactable"], pt["minigame_id"] = "minigame", "pool"
    REPORT["pool"] = {"cloth_z": round(cz, 4), "inner": [round(2 * hx, 4), round(2 * hy, 4)]}


# ----------------------------------------------------------------------------- biliardino

def _figure(mb, y, team_m, skin_m, leg):
    """Omino appeso all'asta (asse lungo Y), piedi verso -Z; leg = distanza asse - base del piede."""
    mb.sphere((0, y, 0.036), 0.015, skin_m, u=12, v=8)
    mb.box((-0.014, y - 0.02, -0.045), (0.014, y + 0.02, 0.02), team_m)
    mb.box((-0.011, y - 0.016, -leg + 0.012), (0.011, y + 0.016, -0.045), team_m)
    mb.box((-0.016, y - 0.017, -leg), (0.015, y + 0.017, -leg + 0.012), team_m)


def build_foosball(c):
    ft = bpy.data.objects["Foosball_Table"]
    W = ft.matrix_world
    fz = ray(ft, (0.2, 0.1, 3.0), (0, 0, -1))[0].z
    zc = fz + 0.02
    hx = min(ray(ft, (0, 0.25, zc), (1, 0, 0))[1], ray(ft, (0, 0.25, zc), (-1, 0, 0))[1])
    hy = min(ray(ft, (0.3, 0, zc), (0, 1, 0))[1], ray(ft, (0.3, 0, zc), (0, -1, 0))[1])
    # apertura delle porte: scansione lungo la parete di fondo
    open_y = 0.0
    for y in np.arange(0.0, hy, 0.005):
        _, d = ray(ft, (0, float(y), fz + 0.012), (1, 0, 0))
        if d is None or d > hx + 0.01:
            open_y = float(y)
        else:
            break
    goal_w = 2 * open_y if open_y > 0.04 else 0.20
    REPORT["foosball"] = {"field_z": round(fz, 4), "field": [round(2 * hx, 4), round(2 * hy, 4)],
                          "goal_width": round(goal_w, 3), "goal_from_model": open_y > 0.04}
    plane("FOOSBALL_Field", c, W @ Vector((0, 0, fz)), 2 * hx, 2 * hy, ft.rotation_euler.z, {"ball_radius": FOOS_BALL_R})
    for team, sx in (("A", -1), ("B", 1)):
        empty(f"FOOSBALL_Goal_{team}", c, W @ Vector((sx * hx, 0, fz)), (0, 0, ft.rotation_euler.z),
              {"width": round(goal_w, 4), "team": team}, size=0.08)
    red = _mat("MAT_Foos_Red", (0.55, 0.03, 0.03), 0.4)
    blue = _mat("MAT_Foos_Blue", (0.03, 0.08, 0.5), 0.4)
    skin = _mat("MAT_Foos_Skin", (0.8, 0.62, 0.45), 0.5)
    grip = _mat("MAT_Foos_Grip", (0.05, 0.05, 0.05), 0.7)
    chrome = B.M["chrome"]
    spacing = 2 * hx / 8
    rod_z = 0.115                                     # asse delle aste sopra il campo (modello 09)
    leg = rod_z - 0.003                               # piede a 3 mm dal campo
    layout = [("A", "GK", 1), ("A", "DEF", 2), ("B", "ATT", 3), ("A", "MID", 5),
              ("B", "MID", 5), ("A", "ATT", 3), ("B", "DEF", 2), ("B", "GK", 1)]
    gaps = {1: 0.0, 2: 0.24, 3: 0.20, 5: 0.12}
    half_len = hy + 0.35
    rods = []
    for i, (team, role, n) in enumerate(layout):
        x = -hx + spacing * (i + 0.5)
        offs = [(k - (n - 1) / 2) * gaps[n] for k in range(n)]
        travel = hy - 0.02 - max(abs(o) for o in offs)
        if role == "GK":
            travel = min(travel, goal_w / 2 + 0.04)
        mb = B.MB()
        mb.cyl((0, 0, 0), 0.008, 0.008, 2 * half_len, chrome, axis="Y", seg=12)
        side = -1 if team == "A" else 1                              # impugnature della squadra A sul lato -Y
        mb.cyl((0, side * (half_len + 0.06), 0), 0.017, 0.017, 0.12, grip, axis="Y", seg=14)
        for yb in (-hy + 0.004, hy - 0.004):
            mb.cyl((0, yb, 0), 0.013, 0.013, 0.008, grip, axis="Y", seg=12)
        for o in offs:
            _figure(mb, o, red if team == "A" else blue, skin, leg)
        me, _ = B.finalize(mb, f"FOOSBALL_Rod_{team}_{role}_Mesh", normalize=False)
        rod = bpy.data.objects.new(f"FOOSBALL_Rod_{team}_{role}", me)
        B.get_coll("PROPS").objects.link(rod)
        rod.parent = ft
        rod.location = (x, 0, fz - ft.location.z + rod_z)
        rod.update_tag()
        for k, v in {"team": team, "role": role, "figures": n, "figure_offsets": [round(o, 4) for o in offs],
                     "travel": round(travel, 4), "leg": round(leg, 4), "axis": "Y", "foot_half": [0.0155, 0.017],
                     "index": i}.items():
            rod[k] = v
        # asse dell'asta in coordinate glTF (x, z, -y): la compressione meshopt sposta l'origine dei nodi mesh,
        # quindi il gioco costruisce il perno di rotazione da qui e non dalla posizione del nodo
        aw = W @ rod.location
        rod["axis_gltf"] = [round(aw.x, 5), round(aw.z, 5), round(-aw.y, 5)]
        rods.append(rod)
    ctr = W @ Vector((0, 0, fz))
    fwd_b = (W.to_3x3() @ Vector((1, 0, 0))).normalized()
    eye = W @ Vector((-hx - 0.42, 0, fz + 0.78))
    cam("CAM_Foosball_Player", c, eye, W @ Vector((0.12, 0, fz)), {"fov": 55})
    cam_down("CAM_Foosball_Top", c, ctr + Vector((0, 0, 1.25)), (fwd_b.x, fwd_b.y), {"fov": 55})
    spot = W @ Vector((hx + 0.62, 0, 0))
    empty("FOOSBALL_OpponentSpot", c, (spot.x, spot.y, 0), facing(-fwd_b.x, -fwd_b.y), {"npc_name": BARISTA_NAME},
          size=0.3, kind="SINGLE_ARROW")
    ft["interactable"], ft["minigame_id"] = "minigame", "foosball"
    B.SUPPORT.pop("Foosball_Table", None)


# ----------------------------------------------------------------------------- freccette

def _annulus(bm, r0, r1, a0, a1, y, steps, mi):
    vs0 = [bm.verts.new((r0 * math.cos(a), y, r0 * math.sin(a))) for a in np.linspace(a0, a1, steps + 1)]
    vs1 = [bm.verts.new((r1 * math.cos(a), y, r1 * math.sin(a))) for a in np.linspace(a0, a1, steps + 1)]
    for k in range(steps):
        f = bm.faces.new((vs0[k], vs0[k + 1], vs1[k + 1], vs1[k]) if r0 > 0 else (vs0[k], vs1[k + 1], vs1[k]))
        f.material_index = mi
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()


def build_dartboard():
    """Bersaglio regolamentare: centro all'origine, faccia verso -Y, settore 20 in alto (+Z)."""
    mats = [_mat("MAT_Dart_Black", (0.02, 0.02, 0.02), 0.85), _mat("MAT_Dart_Cream", (0.78, 0.68, 0.48), 0.85),
            _mat("MAT_Dart_Red", (0.55, 0.03, 0.03), 0.7), _mat("MAT_Dart_Green", (0.02, 0.28, 0.08), 0.7),
            _mat("MAT_Dart_Wire", (0.8, 0.8, 0.8), 0.25, 1.0), _mat("MAT_Dart_Number", (0.92, 0.92, 0.9), 0.4),
            _mat("MAT_Dart_Rim", (0.03, 0.03, 0.03), 0.6)]
    BLACK, CREAM, RED, GREEN, WIRE, NUM, RIM = range(7)
    bm = bmesh.new()
    R = DART_R
    y0 = 0.0
    for i in range(20):
        ac = math.radians(90 - 18 * i)
        a0, a1 = ac - math.radians(9), ac + math.radians(9)
        single = BLACK if i % 2 == 0 else CREAM
        ring = RED if i % 2 == 0 else GREEN
        for r0, r1, m in ((R["outer_bull"], R["treble_in"], single), (R["treble_in"], R["treble_out"], ring),
                          (R["treble_out"], R["double_in"], single), (R["double_in"], R["double_out"], ring),
                          (R["double_out"], R["board"], RIM)):
            _annulus(bm, r0, r1, a0, a1, y0, 4, m)
    _annulus(bm, 0.0, R["bull"], 0, 2 * math.pi, y0, 24, RED)
    _annulus(bm, R["bull"], R["outer_bull"], 0, 2 * math.pi, y0, 32, GREEN)
    # fili: anelli e raggi appena sporgenti
    yw = y0 - 0.0012
    for r in (R["bull"], R["outer_bull"], R["treble_in"], R["treble_out"], R["double_in"], R["double_out"]):
        _annulus(bm, r - 0.0006, r + 0.0006, 0, 2 * math.pi, yw, 96, WIRE)
    for i in range(20):
        a = math.radians(90 - 18 * i + 9)
        d = Vector((math.cos(a), 0, math.sin(a)))
        n = Vector((-d.z, 0, d.x)) * 0.0005
        p0, p1 = d * R["outer_bull"], d * R["double_out"]
        vs = [bm.verts.new(p + Vector((0, yw, 0))) for p in (p0 - n, p1 - n, p1 + n, p0 + n)]
        f = bm.faces.new(vs); f.material_index = WIRE; f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    # corpo del bersaglio (sisal): cilindro nero dietro la faccia
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=R["board"], radius2=R["board"], depth=0.038,
                              matrix=Matrix.Translation((0, 0.0191, 0)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
    for f in {f for v in r["verts"] for f in v.link_faces}:
        f.material_index = RIM
    # numeri sulla corona
    for i, num in enumerate(DART_ORDER):
        cu = bpy.data.curves.new(f"_num{num}", "FONT")
        cu.body = str(num); cu.size = 0.026; cu.align_x = "CENTER"; cu.align_y = "CENTER"; cu.extrude = 0.0008
        ob = bpy.data.objects.new("_num", cu); bpy.context.scene.collection.objects.link(ob)
        bpy.context.view_layer.update()
        tmp = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        a = math.radians(90 - 18 * i)
        rad = (R["double_out"] + R["board"]) / 2
        tmp.transform(Matrix.Translation((rad * math.cos(a), y0 - 0.0015, rad * math.sin(a))) @ Matrix.Rotation(math.pi / 2, 4, "X"))
        before = set(bm.faces)
        bm.from_mesh(tmp)
        for f in bm.faces:
            if f not in before:
                f.material_index = NUM
        bpy.data.objects.remove(ob); bpy.data.curves.remove(cu); bpy.data.meshes.remove(tmp)
    uv = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = (l.vert.co.x * 2 + 0.5, l.vert.co.z * 2 + 0.5)
    me = bpy.data.meshes.new("Dart_Board_Mesh")
    bm.to_mesh(me); bm.free()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = False
    return me


def build_cabinet(face_y_off):
    W, D = B.M["walnut"], B.M["walnut_dark"]
    chalk = _mat("MAT_Chalkboard", (0.035, 0.05, 0.04), 0.95)
    mb = B.MB()
    s, dep, t = 0.33, 0.10, 0.018
    mb.box((-s, -0.012, -s), (s, 0.0, s), D)                                 # fondo contro il muro (Y = 0)
    for sx in (-1, 1):
        mb.box((sx * s - (t if sx > 0 else 0), -dep, -s), (sx * s + (0 if sx > 0 else t), -0.012, s), W)
    for sz in (-1, 1):
        mb.box((-s, -dep, sz * s - (t if sz > 0 else 0)), (s, -0.012, sz * s + (0 if sz > 0 else t)), W)
    for sx in (-1, 1):                                                       # ante aperte a filo del muro
        x0, x1 = sorted((sx * (s + 0.004), sx * (2 * s + 0.004)))
        mb.box((x0, -dep, -s), (x1, -dep + t, s), W)
        mb.box((x0 + 0.03, -dep - 0.001, -s + 0.05), (x1 - 0.03, -dep, s - 0.05), chalk)
    me, _ = B.finalize(mb, "Dart_Board_Cabinet_Mesh", normalize=False)
    return me


def build_dart_mesh():
    """Freccetta con la punta all'origine, corpo lungo +Y (punta verso -Y locale)."""
    steel = _mat("MAT_Dart_Steel", (0.75, 0.75, 0.76), 0.2, 1.0)
    brass = _mat("MAT_Dart_Barrel", (0.45, 0.35, 0.12), 0.3, 1.0)
    shaft = _mat("MAT_Dart_Shaft", (0.03, 0.03, 0.03), 0.5)
    flight = _mat("MAT_Dart_Flight", (0.7, 0.05, 0.04), 0.6)
    mb = B.MB()
    mb.cyl((0, 0.015, 0), 0.0002, 0.0012, 0.03, steel, axis="Y", seg=8)
    mb.cyl((0, 0.0525, 0), 0.0035, 0.0035, 0.045, brass, axis="Y", seg=12)
    mb.cyl((0, 0.0925, 0), 0.0019, 0.0019, 0.035, shaft, axis="Y", seg=8)
    mb.box((-0.015, 0.098, -0.0003), (0.015, 0.135, 0.0003), flight)
    mb.box((-0.0003, 0.098, -0.015), (0.0003, 0.135, 0.015), flight)
    me, _ = B.finalize(mb, "DARTS_Dart_Mesh", normalize=False)
    return me


def build_darts(c):
    props = B.get_coll("PROPS")
    for n in ("Dart_Board", "Dart_Board_Cabinet"):
        o = bpy.data.objects.get(n)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    cz = 1.73
    back = 0.012
    face_y = B.RD - back - 0.038 - 0.001                                     # faccia del bersaglio (1 mm dal fondo del cabinet)
    cab = bpy.data.objects.new("Dart_Board_Cabinet", build_cabinet(face_y))
    props.objects.link(cab)
    cab.location = (DART_X, B.RD, cz)
    board = bpy.data.objects.new("Dart_Board", build_dartboard())
    props.objects.link(board)
    board.location = (DART_X, face_y, cz)
    board["interactable"], board["minigame_id"] = "minigame", "darts"
    B.WALLMOUNT.pop("Dart_Board", None)
    B.SUPPORT["Dart_Board"] = None                                          # appeso nel cabinet, non poggia a terra
    B.WALLMOUNT["Dart_Board_Cabinet"] = ("y", B.RD, "max")
    empty("DARTS_Board", c, (DART_X, face_y, cz), (math.pi / 2, 0, 0),
          {**{k: v for k, v in DART_R.items()}, "order": DART_ORDER,
           "frame": "Blender: Z uscente dal bersaglio, Y verso il 20"}, size=0.25, kind="ARROWS")
    line_y = face_y - THROW_DIST
    plane("DARTS_ThrowLine", c, (DART_X, line_y, 0.001), 0.9, 0.04, 0.0, {"distance": THROW_DIST})
    mb = B.MB()
    mb.box((-0.45, -0.02, 0), (0.45, 0.02, 0.003), _mat("MAT_Oche", (0.55, 0.42, 0.12), 0.35, 0.9))
    me, _ = B.finalize(mb, "Darts_Oche_Mesh", normalize=False)
    B.make_obj("Darts_Oche", me, c, (DART_X, line_y, 0))
    dm = build_dart_mesh()
    for k in range(3):
        d = bpy.data.objects.new(f"DARTS_Dart_{k + 1}", dm)
        c.objects.link(d)
        d.location = (DART_X - 0.25 + 0.03 * k, B.RD - 0.07, cz - 0.30)       # sul bordo basso del cabinet
        d.rotation_euler = (-math.pi / 2, 0, 0)
        d["start_hidden"] = True
        d["tip"] = "origine; corpo lungo +Y locale (glTF: punta verso +Z)"
    cam("CAM_Darts_Throw", c, (DART_X, line_y - 0.12, 1.62), (DART_X, face_y, cz), {"fov": 50})
    spot = (DART_X + 1.0, line_y - 0.55, 0)
    empty("DARTS_OpponentSpot", c, spot, facing(DART_X - spot[0], face_y - spot[1]), {"npc_name": NAMES[4]},
          size=0.3, kind="SINGLE_ARROW")
    REPORT["darts"] = {"face_y": round(face_y, 4), "center_z": cz, "throw_line_y": round(line_y, 4)}


# ----------------------------------------------------------------------------- scopa

def build_scopa(c):
    ct = bpy.data.objects["Card_Table"]
    top = B.LAYOUT["card_top"]
    half = B.LAYOUT["card_half"]
    tx, ty = B.CARD_TABLE
    (px, py), _ = B.CARD_CHAIRS[0]                     # sedia del giocatore (lato nord)
    (ox, oy), _ = B.CARD_CHAIRS[2]                     # di fronte: Peppino
    # sistema del tavolo visto dal giocatore: u = destra del giocatore, v = verso l'avversario
    v = Vector((ox - px, oy - py, 0)).normalized()
    u = v.cross(Vector((0, 0, 1)))                     # destra = avanti x alto
    rz = math.atan2(u.y, u.x)

    def at(uu, vv, dz=0.0):
        return (tx + u.x * uu + v.x * vv, ty + u.y * uu + v.y * vv, top + 0.001 + dz)
    plane("SCOPA_Table", c, at(0, 0), 2 * half, 2 * half, rz, {"card_size": [0.058, 0.09]})
    empty("SCOPA_Seat_Player", c, (px, py, 0), facing(v.x, v.y), {"chair": "Chair_Cards_01"}, size=0.3, kind="SINGLE_ARROW")
    empty("SCOPA_Seat_Opponent", c, (ox, oy, 0), facing(-v.x, -v.y), {"chair": "Chair_Cards_03", "npc_name": NAMES[3]},
          size=0.3, kind="SINGLE_ARROW")
    eye = Vector((px, py, 1.15)) - v * 0.04
    cam("CAM_Scopa_Seat", c, eye, Vector(at(0, -0.12)), {"fov": 58})
    for name, uu, vv, extra in (("SCOPA_Deck", 0.30, 0.22, {}), ("SCOPA_Pile_Player", 0.33, -0.05, {}),
                                ("SCOPA_Pile_Opponent", -0.30, 0.26, {}), ("SCOPA_Hand_Opponent", 0.0, 0.31, {}),
                                ("SCOPA_TableArea", -0.02, 0.02, {"size": [0.40, 0.22]})):
        empty(name, c, at(uu, vv), (0, 0, rz), extra, size=0.05)
    ctr = Vector((tx, ty, 0))
    spot = ctr + (u - v).normalized() * 1.25       # in diagonale dietro il tavolo, lontano dalle sedie
    empty("SCOPA_Spectator_1", c, spot, facing(ctr.x - spot.x, ctr.y - spot.y), {"npc_name": NAMES[1]},
          size=0.3, kind="SINGLE_ARROW")
    ct["interactable"], ct["minigame_id"] = "minigame", "scopa"
    cards = bpy.data.objects.get("Card_Table_Cards")
    if cards:
        cards["hide_during"] = "scopa"


# ----------------------------------------------------------------------------- slot machine

def build_slots(c):
    """Per ogni slot: piano SLOTS_Reels_N sulla finestra dei rulli (dal bounding box dei rulli del modello), rivolto verso
    chi gioca, e camera CAM_Slots_N davanti alla macchina all'altezza degli occhi."""
    for i in (1, 2):
        m = bpy.data.objects.get(f"Slot_Machine_{i:02d}")
        reels = bpy.data.objects.get(f"Slot_Machine_{i:02d}_Reels")
        if not m:
            continue
        m["interactable"], m["minigame_id"], m["machine"] = "minigame", "slots", i
        fwd = (m.matrix_world.to_3x3() @ Vector((0, -1, 0))).normalized()        # fronte degli asset: -Y locale
        if reels:
            bb = [reels.matrix_world @ Vector(v) for v in reels.bound_box]
            mn = Vector([min(v[k] for v in bb) for k in range(3)]); mx = Vector([max(v[k] for v in bb) for k in range(3)])
            ctr = (mn + mx) / 2
            front = max(bb, key=lambda v: v.dot(fwd))
            ctr += fwd * ((front - ctr).dot(fwd) + 0.004)
            side = Vector((-fwd.y, fwd.x, 0))
            w = abs((mx - mn).dot(side)); h = mx.z - mn.z
        else:
            ctr = m.matrix_world.translation + fwd * 0.3 + Vector((0, 0, 1.2)); w, h = 0.36, 0.16
        # piano verticale: normale (Z locale) verso il giocatore, X locale orizzontale
        rot = fwd.to_track_quat("Z", "Y").to_euler()
        p = plane(f"SLOTS_Reels_{i}", c, ctr, w, h, 0.0, {"machine": i, "reels": 3})
        p.rotation_euler = rot
        eye = ctr + fwd * 0.62
        eye.z = max(eye.z + 0.12, 1.45)
        # la camera guarda un po' più in basso: rulli, pulsanti e gettoniera nella stessa inquadratura
        cam(f"CAM_Slots_{i}", c, eye + fwd * 0.08, ctr - Vector((0, 0, 0.16)), {"fov": 55, "machine": i})
        _slot_parts(c, m, i, fwd)
    REPORT["slots"] = {"machines": [o.name for o in bpy.data.objects if o.name.startswith("SLOTS_Reels_")]}


def _slot_parts(c, m, i, fwd):
    """Pulsanti (verde = gira, rosso = incassa, giallo centrale = puntata), gettoniera modellata al posto della placca
    fotografica, vaschetta delle vincite. Marcatori con il centro della superficie e la normale su Z locale."""
    btn = bpy.data.objects.get(f"Slot_Machine_{i:02d}_Buttons")
    if btn:
        W = btn.matrix_world
        co = np.array([(W @ v.co)[:] for v in btn.data.vertices])
        side = np.array((-fwd.y, fwd.x, 0.0))                  # destra di chi guarda la macchina
        s_ = co @ side
        # un pulsante = una parte connessa della mesh (union-find sugli spigoli), ordinate da sinistra a destra
        par = list(range(len(co)))
        def find(x):
            while par[x] != x:
                par[x] = par[par[x]]; x = par[x]
            return x
        for e in btn.data.edges:
            a_, b_ = find(e.vertices[0]), find(e.vertices[1])
            if a_ != b_:
                par[a_] = b_
        isl = {}
        for vi in range(len(co)):
            isl.setdefault(find(vi), []).append(vi)
        groups = sorted(isl.values(), key=lambda g: float(s_[g].mean()))
        REPORT.setdefault("slot_buttons", []).append([round(float(s_[g].mean()), 3) for g in groups])
        # dal modello: 1 rosso, 2 rosso, 3 giallo, 4 verde, 5 giallo (da sinistra a destra)
        roles = {0: "Cash", 2: "Bet", 3: "Spin"}
        for gi, g in enumerate(groups):
            if gi not in roles:
                continue
            pts = co[g]
            top = pts[pts[:, 2] > pts[:, 2].max() - 0.004].mean(0)
            empty(f"SLOTS_Button_{roles[gi]}_{i}", c, Vector(top.tolist()), fwd.to_track_quat("Z", "Y").to_euler(),
                  {"machine": i, "action": roles[gi].lower()}, size=0.03)
    plate = bpy.data.objects.get(f"Slot_Machine_{i:02d}_CoinPlate")
    if plate:
        W = plate.matrix_world
        vs = [W @ v.co for v in plate.data.vertices]
        ctr = sum(vs, Vector()) / len(vs)
        n = (W.to_3x3() @ plate.data.polygons[0].normal).normalized()
        if n.z < 0:
            n = -n
        u = (vs[1] - vs[0]); u = (u - n * u.dot(n)).normalized()
        v = n.cross(u)
        su = max(abs((p_ - ctr).dot(u)) for p_ in vs); sv = max(abs((p_ - ctr).dot(v)) for p_ in vs)
        Bm = Matrix((u, v, n)).transposed().to_4x4()
        chrome, dark = B.M["chrome"], B.M["metal_dark"]
        mb = B.MB()
        mb.box((-su, -sv, 0.0), (su, sv, 0.004), chrome)                     # placca cromata
        mb.box((-0.016, -0.0022, 0.004), (0.016, 0.0022, 0.0055), dark)       # feritoia per il gettone
        mb.box((-su * 0.6, -sv * 0.75, 0.004), (su * 0.6, -sv * 0.55, 0.0045), dark)   # targhetta
        me, _ = B.finalize(mb, f"Slot_Machine_{i:02d}_CoinSlot_Mesh", normalize=False)
        o = bpy.data.objects.new(f"Slot_Machine_{i:02d}_CoinSlot", me)
        B.get_coll("PROPS").objects.link(o)
        o.matrix_world = Matrix.Translation(ctr + n * 0.001) @ Bm
        o.parent = m                                                        # parte della slot: niente controlli d'appoggio
        o.matrix_parent_inverse = m.matrix_world.inverted()
        empty(f"SLOTS_Coin_{i}", c, ctr + n * 0.006, n.to_track_quat("Z", "Y").to_euler(), {"machine": i}, size=0.03)
        bpy.data.objects.remove(plate, do_unlink=True)                        # la placca fotografica non serve più
    tray = bpy.data.objects.get(f"Slot_Machine_{i:02d}_Tray")
    if tray:
        bb = [tray.matrix_world @ Vector(v) for v in tray.bound_box]
        mn = Vector([min(v[k] for v in bb) for k in range(3)]); mx = Vector([max(v[k] for v in bb) for k in range(3)])
        empty(f"SLOTS_Tray_{i}", c, (mn + mx) / 2 + Vector((0, 0, 0.004)), (0, 0, 0),
              {"machine": i, "size": [round(mx.x - mn.x, 4), round(mx.y - mn.y, 4)]}, size=0.04)


def foosball_spectators(c):
    """I due giocatori del circolo compaiono solo durante il minigioco, come spettatori: in fondo al tavolo, ai lati
    dell'avversario, rivolti verso chi gioca (così sono nell'inquadratura)."""
    opp = bpy.data.objects.get("FOOSBALL_OpponentSpot")
    ft = bpy.data.objects.get("Foosball_Table")
    if not opp or not ft:
        return
    face = opp.matrix_world.to_3x3() @ Vector((0, -1, 0))                    # fronte dello spot (-Y) verso il tavolo
    side = Vector((-face.y, face.x, 0)).normalized()
    # chi guarda la partita al biliardino: Kappa e Zucco (foos_spectator), o i vecchi giocatori del biliardino
    players = sorted([o for o in bpy.data.objects if o.get("foos_spectator") or o.get("npc_action") == "play_foosball"],
                     key=lambda o: o["npc_name"])
    for k, (o, sgn) in enumerate(zip(players, (1, -1)), 1):
        p = opp.matrix_world.translation + side * (0.72 * sgn) + face * 0.12
        look = ft.matrix_world.translation - p
        empty(f"FOOSBALL_Spectator_{k}", c, (p.x, p.y, 0), facing(look.x, look.y), {"npc_name": o["npc_name"]},
              size=0.3, kind="SINGLE_ARROW")


# ----------------------------------------------------------------------------- NPC

def tag_npcs():
    for i in range(1, 5):
        o = bpy.data.objects.get(f"NPC_Elder_{i:02d}")
        if o:
            o["npc_name"] = NAMES[i]
    o = bpy.data.objects.get("NPC_Barista")
    if o:
        o["npc_name"] = BARISTA_NAME


def build_bar(c):
    """Ordinazione al bancone: vista del cliente, poco sopra il bicchiere, con Nicola di fronte."""
    g = bpy.data.objects.get("Glass")
    b = bpy.data.objects.get("NPC_Barista")
    if not g or not b:
        return
    gp, bp = g.matrix_world.translation, b.matrix_world.translation
    eye = (B.LAYOUT["bar_front_x"] + 0.62, gp.y - 0.05, 1.52)
    look = (gp.x - 0.18, (gp.y + bp.y) / 2, 1.08)
    cam("CAM_Bar_Order", c, eye, look, {"fov": 52})
    REPORT["bar"] = {"eye": [round(v, 3) for v in eye], "glass": [round(v, 3) for v in gp]}


def build():
    c = _coll()
    bpy.context.view_layer.update()
    build_bar(c)
    build_pool(c)
    build_foosball(c)
    build_darts(c)
    build_scopa(c)
    build_slots(c)
    foosball_spectators(c)
    tag_npcs()
    bpy.context.view_layer.update()
    B.REPORT["minigames"] = REPORT


def check_corridor():
    """Nessun collider tra la linea di tiro e il bersaglio (a parte il muro che lo regge)."""
    b = bpy.data.objects["DARTS_Board"].matrix_world.translation
    line_y = bpy.data.objects["DARTS_ThrowLine"].matrix_world.translation.y
    lo = Vector((b.x - 0.3, line_y, 0.2)); hi = Vector((b.x + 0.3, b.y - 0.01, 2.2))
    hits = []
    for o in bpy.data.collections["COLLISION"].objects:
        mn, mx = B.world_aabb(o)
        if all(mn[k] < hi[k] and mx[k] > lo[k] for k in range(3)) and not o.name.startswith("COL_Wall_North"):
            hits.append(o.name)
    REPORT["darts_corridor_blockers"] = hits
    return hits

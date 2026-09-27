"""Modelli reali della scena: asset dettagliati del progetto (asset-blender-completi) + modelli BlendSwap.

build(key) restituisce le mesh dell'asset nello spazio locale di gioco:
fronte verso -Y, origine al centro della base del gruppo principale, unità in metri.
Se un file manca, available(key) è False e la scena usa il proxy.
"""
import bpy, math, os
import numpy as np
from mathutils import Vector, Matrix
import assets_lib as AL

A = "/Users/simonesanna/Desktop/circolo-sardegna-assets/asset-blender-completi/"
# modelli di terzi: nella cartella Download, oppure la copia nel pacchetto per lo sviluppatore
_D_LOCAL = "/Users/simonesanna/Desktop/circolo-sardegna-assets/consegna/sviluppatore-circolo/asset-esterni/"
D = "/Users/simonesanna/Downloads/" if os.path.exists("/Users/simonesanna/Downloads/LED TV") else _D_LOCAL

CREDITS = {
    "led_tv": "LED TV di ragstorich (Richard Edwards), CC-BY 3.0 - blendswap.com/blends/view/46293",
    "cigarette": "Cigarette with Smoke, Blend Swap #80373, CC-BY 3.0 - blendswap.com/blends/view/80373",
    "beer_taps": "Drink Bar assets v.5 di b2przemo, CC-BY 3.0 - blendswap.com/blends/view/71639 (marchi rimossi)",
    "dartboard": "Dart board with darts di olesk, CC0 - blendswap.com/blends/view/61365",
}


def _name_in(*prefixes):
    return lambda n: any(n.startswith(p) for p in prefixes)


SPECS = {
    "chair": dict(file=A + "01-sedia-noce-dettagliata.blend"),
    "tv65": dict(file=A + "02-tv-65-dettagliata.blend", split={"display": _name_in("TV_Schermo")}),
    "pack": dict(file=A + "03-pacchetto-sigarette-dettagliato.blend"),
    "side_table": dict(file=A + "04-tavolino-posacenere-dettagliato.blend", split={"ashtray": _name_in("Posacenere")}),
    "bar": dict(file=A + "05-bancone-4m-dettagliato.blend", fit=("x", 4.0)),
    "glass": dict(file=A + "06-bicchiere-vino-dettagliato.blend", split={"liquid": _name_in("Bicchiere_Vino")}),
    "pool": dict(file=A + "07-biliardo-completo-dettagliato.blend", split={"balls": _name_in("Palla", "Triangolo", "Stecca")}),
    # aste, manopole e omini sono ricostruiti come parti mobili da minigames_prep.py
    "foosball": dict(file=A + "09-calcio-balilla-dettagliato.blend", exclude=_name_in("Asta_", "Manopola_", "Omino_", "Pallina")),
    # i rulli nel file sono cilindri interi che escono dal retro del mobile (Y fino a 0.266, mobile a 0.24): li chiudo dentro
    "slot": dict(file=A + "10-slot-machine-dettagliata.blend", clamp=[("SLOT_Rullo", "y", None, 0.215)],
                 # parti che il minigioco deve conoscere: rulli, pulsanti, placca dei gettoni (rifatta), vaschetta
                 split={"reels": _name_in("SLOT_Rullo"), "buttons": _name_in("SLOT_Pulsante"),
                        "coinplate": _name_in("SLOT_Placca_Gettoni"), "tray": _name_in("SLOT_Vaschetta_Fondo")}),
    "card_table": dict(file=A + "11-tavolo-carte-quattro-sedie-dettagliato.blend", exclude=_name_in("Sedia"),
                       split={"cards": _name_in("Carta_")}),
    "ashtray": dict(file=A + "17-posacenere-dettagliato.blend"),
    "grappa": dict(file=A + "13-grappa.blend", decimate=900),
    "mirto": dict(file=A + "14-mirto.blend", decimate=1100),
    "tv32": dict(file=A + "16-tv-32-staffa.blend", split={"display": _name_in("Schermo spento")}),
    "led_tv": dict(file=D + "LED TV/Plasma Television black.blend", split={"display": _name_in("screen")}, fit=("x", 1.10),
                   decimate=9000),
    "cigarette": dict(file=D + "Cigarette with Smoke/Cigarette-01-2.78.blend", include=lambda o: o.name.split(".")[0] == "Cylinder",
                      fit=("x", 0.085)),
    "beer_taps": dict(file=D + "Drink Bar assets v.5/nalewacze.blend", include=lambda o: AL_center_x(o) < 0.25, decimate=14000),
    "dartboard": dict(file=D + "freccette/Dart Board with Darts.blend", fit=("x", 0.51),
                      decimate_parts={"Dart Board - radial spikes": 0.12, "Dart Board - fasteners": 0.15,
                                      "Dart Board - radial rings": 0.2, "Dart body markings": 0.15, "Dart main body": 0.5}),
}

REPORT = {}
_CACHE = {}


def AL_center_x(o):
    bb = [o.matrix_world @ Vector(v) for v in o.bound_box]
    return sum(v.x for v in bb) / 8


def available(key):
    return key in SPECS and os.path.exists(SPECS[key]["file"])


def _neutral_branding():
    """Via i marchi di birra dalle spine (Tyskie, Lech, Książęce): etichette neutre a tinta unita con bordo."""
    tints = [(0.55, 0.08, 0.06), (0.80, 0.55, 0.12), (0.22, 0.12, 0.06)]
    k = 0
    for img in bpy.data.images:
        n = img.name.lower()
        if any(s in n for s in ("tyskie", "lech", "ksiazece", "zegar")):
            w, h = img.size
            if w == 0:
                continue
            a = np.ones((h, w, 4), np.float32)
            yy, xx = np.mgrid[0:h, 0:w]
            border = (xx < w * 0.06) | (xx > w * 0.94) | (yy < h * 0.06) | (yy > h * 0.94)
            a[..., :3] = tints[k % 3]
            a[border, :3] = (0.86, 0.78, 0.58)
            img.pixels.foreach_set(a.ravel())
            img.pack()
            k += 1
    return k


def build(key):
    """Mesh dell'asset: {'main': mesh, <split>: mesh, ...} nello spazio locale di gioco."""
    if key in _CACHE:
        return _CACHE[key]
    spec = SPECS[key]
    keep, rest = AL.load_asset(spec["file"], include=spec.get("include"))
    bpy.context.view_layer.update()
    if spec.get("exclude"):
        ex = [o for o in keep if spec["exclude"](o.name)]
        keep = [o for o in keep if o not in ex]
        rest += ex
    # vertici da contenere entro un limite (coordinate mondo del file sorgente)
    for prefix, ax, lo, hi in spec.get("clamp", []):
        k = "xyz".index(ax)
        for o in keep:
            if o.name.startswith(prefix):
                inv = o.matrix_world.inverted()
                for v in o.data.vertices:
                    w = o.matrix_world @ v.co
                    if hi is not None and w[k] > hi:
                        w[k] = hi
                    if lo is not None and w[k] < lo:
                        w[k] = lo
                    v.co = inv @ w
    # riduzione solo dei pezzi pesanti (modificatore valutato da realize), il resto resta intatto
    for prefix, ratio in spec.get("decimate_parts", {}).items():
        for o in keep:
            if o.name.startswith(prefix):
                md = o.modifiers.new("Decimate_game", "DECIMATE")
                md.ratio = ratio
                md.use_collapse_triangulate = True
    bpy.context.view_layer.update()
    groups = {"main": []}
    for o in keep:
        g = next((k for k, pred in spec.get("split", {}).items() if pred(o.name)), "main")
        groups.setdefault(g, []).append(o)
    objs = {g: AL.realize(v, f"_{key}_{g}") for g, v in groups.items() if v}
    AL.cleanup(keep + rest)
    if key == "beer_taps":
        REPORT.setdefault("branding_neutralized", _neutral_branding())
    # riferimento: bounding box del gruppo principale (o di tutto se il principale è vuoto)
    allpts = np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in objs.values()])
    mainpts = np.array([v.co[:] for v in objs["main"].data.vertices]) if "main" in objs else allpts
    mn, mx = mainpts.min(0), mainpts.max(0)
    s = 1.0
    if spec.get("fit"):
        ax, size = spec["fit"]
        k = "xyz".index(ax)
        s = size / (mx[k] - mn[k])
    off = Vector(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, allpts[:, 2].min()))
    xf = Matrix.Scale(s, 4) @ Matrix.Translation(-off)
    out = {}
    tris = 0
    for g, o in objs.items():
        me = o.data
        me.transform(xf)
        for m in me.materials:
            AL.gltf_safe(m, key)
        AL.box_uv_selected(me, {m.name: AL.OBJCOORD_SCALE[m.name] * s for m in me.materials if m and m.name in AL.OBJCOORD_SCALE})
        if spec.get("decimate") and g == "main":
            before, after = AL.decimate_to(o, spec["decimate"])
            REPORT.setdefault(key, {})["decimate"] = [before, after]
            me = o.data
        me.name = f"{key}_{g}_Mesh"
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        out[g] = me
        bpy.data.objects.remove(o)
    dims = (mx - mn) * s
    REPORT.setdefault(key, {}).update({"file": os.path.basename(spec["file"]), "scale": round(s, 4),
                                       "dims": [round(float(v), 3) for v in dims], "tris": tris, "groups": list(out)})
    _CACHE[key] = out
    return out


def reset():
    _CACHE.clear()
    AL.BAKED.clear()


def bbox(me):
    co = np.array([v.co[:] for v in me.vertices])
    return Vector(co.min(0)), Vector(co.max(0))


def screen_quad(display_me, mat, name, pad=0.0):
    """Superficie dello schermo: quad sul lato frontale (-Y) del pezzo 'display', UV 0..1 dritte (convenzione glTF)."""
    import bmesh
    mn, mx = bbox(display_me)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    y = mn.y - 0.0015
    v = [bm.verts.new((mn.x + pad, y, mn.z + pad)), bm.verts.new((mx.x - pad, y, mn.z + pad)),
         bm.verts.new((mx.x - pad, y, mx.z - pad)), bm.verts.new((mn.x + pad, y, mx.z - pad))]
    f = bm.faces.new(v)
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    for l in f.loops:
        co = l.vert.co
        l[uv].uv = ((co.x - mn.x) / (mx.x - mn.x), (co.z - mn.z) / (mx.z - mn.z))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    return me


def cigarette_materials(me):
    """La sigaretta del file è un tubo bianco: filtro arancio a un capo, brace accesa all'altro (per posizione lungo X)."""
    def m(name, color, emit=None, estr=0.0, rough=0.7):
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree; nt.nodes.clear()
        o = nt.nodes.new("ShaderNodeOutputMaterial"); b = nt.nodes.new("ShaderNodeBsdfPrincipled")
        nt.links.new(b.outputs["BSDF"], o.inputs["Surface"])
        b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
        if emit:
            b.inputs["Emission Color"].default_value = (*emit, 1); b.inputs["Emission Strength"].default_value = estr
        mat.diffuse_color = (*color, 1)
        mat["_gltf_safe"] = True
        return mat
    paper = m("MAT_Cigarette_Paper", (0.92, 0.91, 0.88))
    filt = m("MAT_Cigarette_Filter", (0.78, 0.52, 0.25))
    ember = m("MAT_Cigarette_Ember", (0.25, 0.05, 0.02), emit=(1.0, 0.35, 0.08), estr=4.0)
    ash = m("MAT_Cigarette_Ash", (0.45, 0.44, 0.42), rough=0.95)
    me.materials.clear()
    for x in (paper, filt, ember, ash):
        me.materials.append(x)
    mn, mx = bbox(me)
    L = mx.x - mn.x
    for p in me.polygons:
        t = (p.center.x - mn.x) / L
        p.material_index = 1 if t < 0.28 else (2 if t > 0.965 else (3 if t > 0.93 else 0))
    return me

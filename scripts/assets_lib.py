"""Import dei modelli .blend (asset dettagliati del progetto e modelli BlendSwap) nella scena di gioco.

Funzioni principali
  load_asset(path, include, exclude)  -> copia gli oggetti mesh dell'asset (niente studio, luci, camere, cutter)
  realize(objs, name)                 -> applica i modificatori (bevel, boolean, decimate...) e unisce in coordinate mondo
  gltf_safe_materials(objs)           -> materiali esportabili in glTF: Principled + texture immagine su UV
  dedupe_images()                     -> una sola copia delle texture uguali (es. dark_wood in ogni file)
"""
import bpy, bmesh, math, os, re
import numpy as np
from mathutils import Vector, Matrix

TMP = "_ASSET_TMP"
BAKED = {}                      # (image, parametri) -> immagine corretta, per non ricalcolare
LIB_TEX_SIZE = 1024             # le texture ricalcolate si salvano a questa risoluzione (bastano per il gioco)


def _tmp():
    c = bpy.data.collections.get(TMP) or bpy.data.collections.new(TMP)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c


def load_asset(path, include=None, exclude=("Pavimento", "Floor", "Plane", "Smoke Domain", "Camera", "Light")):
    """Appende tutti gli oggetti del file e restituisce solo le mesh visibili dell'asset."""
    before = set(bpy.data.objects)
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = list(src.objects)
    new = [o for o in dst.objects if o is not None]
    tmp = _tmp()
    for o in new:
        tmp.objects.link(o)
    keep, drop = [], []
    for o in new:
        base = o.name.split(".")[0]
        hidden = o.hide_render or o.hide_viewport or o.hide_get() or o.display_type in ("WIRE", "BOUNDS")
        if o.type != "MESH" or any(base.startswith(e) for e in exclude) or (include and not include(o)):
            drop.append(o)
        elif hidden:
            drop.append(o)          # cutter dei boolean: servono ancora fino a realize()
        else:
            keep.append(o)
    return keep, [o for o in new if o not in keep]


def cleanup(objs):
    for o in objs:
        if o and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)


def realize(objs, name, keep_parts=False):
    """Copia, applica i modificatori e unisce. Il risultato è in coordinate mondo, senza genitori."""
    vl = bpy.context.view_layer
    tmp = _tmp()
    dg = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    mats = []
    parts = []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.transform(o.matrix_world)
        remap = []
        for s in o.material_slots:
            if s.material not in mats:
                mats.append(s.material)
            remap.append(mats.index(s.material))
        for p in me.polygons:
            p.material_index = remap[p.material_index] if p.material_index < len(remap) else (remap[-1] if remap else 0)
        n0 = len(bm.verts)
        # un solo layer UV chiamato "UVMap": i pezzi con nomi diversi finirebbero in un secondo layer (UV a zero)
        act = me.uv_layers.active
        if act is None:
            me.uv_layers.new(name="UVMap")
        else:
            for l in [l for l in me.uv_layers if l.name != act.name]:
                me.uv_layers.remove(l)
            me.uv_layers[0].name = "UVMap"
        bm.from_mesh(me)
        parts.append((o.name, n0, len(bm.verts)))
        ev.to_mesh_clear()
    out = bpy.data.meshes.new(name + "_Mesh")
    bm.to_mesh(out)
    bm.free()
    for m in mats:
        out.materials.append(m)
    o = bpy.data.objects.new(name, out)
    tmp.objects.link(o)
    if keep_parts:
        o["_parts"] = [[n, a, b] for n, a, b in parts]
    return o


# ------------------------------------------------------------------ materiali

def _link_from(sock):
    return sock.links[0].from_node if sock.is_linked else None


def _upstream(node, types, seen=None):
    """Primo nodo a monte di un certo tipo (visita in profondità)."""
    seen = seen or set()
    if node is None or node in seen:
        return None
    seen.add(node)
    if node.type in types:
        return node
    for i in node.inputs:
        for l in i.links:
            r = _upstream(l.from_node, types, seen)
            if r:
                return r
    return None


def _ramp_color(node):
    if node is None:
        return None
    if node.type == "VALTORGB":
        cols = np.array([e.color[:3] for e in node.color_ramp.elements])
        return tuple(cols.mean(0))
    for i in node.inputs:
        if i.type == "RGBA" and not i.is_linked:
            return tuple(i.default_value[:3])
    for i in node.inputs:
        if i.is_linked:
            c = _ramp_color(i.links[0].from_node)
            if c:
                return c
    return None


def _img_pixels(img, size):
    im = img.copy()
    if max(im.size) > size:
        im.scale(size, max(1, int(size * im.size[1] / im.size[0])))
    w, h = im.size
    a = np.array(im.pixels[:], np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    return a


def _rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = np.where(m, (mx - r) / np.where(m, d, 1), 0); gc = np.where(m, (mx - g) / np.where(m, d, 1), 0); bc = np.where(m, (mx - b) / np.where(m, d, 1), 0)
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2 + rc - bc, 4 + gc - rc))
    h = (h / 6.0) % 1.0
    s = np.where(mx > 1e-6, d / np.where(mx > 1e-6, mx, 1), 0)
    return np.stack([np.where(m, h, 0), s, mx], -1)


def _hsv_to_rgb(hsv):
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p = v * (1 - s); q = v * (1 - s * f); t = v * (1 - s * (1 - f))
    out = np.stack([np.choose(i, [v, q, p, p, t, v]), np.choose(i, [t, v, v, q, p, p]), np.choose(i, [p, p, t, v, v, q])], -1)
    return out


def _bake_color_chain(tex_node, chain, mat_name):
    """Applica alla texture le correzioni colore (Hue/Saturation, Mix) che glTF non esporta."""
    img = tex_node.image
    key = (img.name, tuple((n.type, tuple(tuple(i.default_value[:]) if hasattr(i.default_value, "__len__") else (i.default_value,)
                                         for i in n.inputs if hasattr(i, "default_value") and not i.is_linked), getattr(n, "blend_type", "")) for n in chain))
    if key in BAKED:
        return BAKED[key]
    a = _img_pixels(img, LIB_TEX_SIZE)
    rgb = a[..., :3]
    # le immagini sono sRGB: lavoro in lineare come fa Blender
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    for n in chain:
        if n.type == "HUE_SAT":
            hue = n.inputs["Hue"].default_value; sat = n.inputs["Saturation"].default_value
            val = n.inputs["Value"].default_value; fac = n.inputs["Fac"].default_value
            hsv = _rgb_to_hsv(lin)
            hsv[..., 0] = (hsv[..., 0] + hue - 0.5) % 1.0
            hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 1)
            hsv[..., 2] = hsv[..., 2] * val
            lin = lin * (1 - fac) + _hsv_to_rgb(hsv) * fac
        elif n.type in ("MIX", "MIX_RGB"):
            fac_in = n.inputs.get("Factor") or n.inputs.get("Fac")
            fac = fac_in.default_value if not fac_in.is_linked else 1.0
            fac = fac if not hasattr(fac, "__len__") else fac[0]
            other = None
            for i in n.inputs:
                if i.type == "RGBA" and not i.is_linked and i.enabled:
                    other = np.array(i.default_value[:3])
            if other is None:
                continue
            bt = getattr(n, "blend_type", "MIX")
            if bt == "MULTIPLY":
                res = lin * other
            elif bt == "OVERLAY":
                res = np.where(lin < 0.5, 2 * lin * other, 1 - 2 * (1 - lin) * (1 - other))
            elif bt == "SCREEN":
                res = 1 - (1 - lin) * (1 - other)
            else:
                res = other
            lin = lin * (1 - fac) + res * fac
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.clip(lin, 0, None), 1 / 2.4) - 0.055)
    a[..., :3] = np.clip(srgb, 0, 1)
    h, w = a.shape[:2]
    new = bpy.data.images.new(f"TEX_{mat_name}_Color", w, h)
    new.pixels.foreach_set(a.ravel())
    new.file_format = "JPEG"
    new.pack()
    BAKED[key] = new
    return new


OBJCOORD_SCALE = {}             # materiale -> metri per ripetizione (texture proiettate con coordinate Object/Generated)


def _tex_coord_scale(tex_node):
    """Se l'immagine usa coordinate Object/Generated tramite Mapping, restituisce la scala (ripetizioni per metro)."""
    if not tex_node.inputs["Vector"].is_linked:
        return None
    n = tex_node.inputs["Vector"].links[0].from_node
    scale = 1.0
    if n.type == "MAPPING":
        s = n.inputs["Scale"].default_value
        scale = float(s[0])
        if not n.inputs["Vector"].is_linked:
            return None
        link = n.inputs["Vector"].links[0]
        src, out = link.from_node, link.from_socket.name
    else:
        src, out = n, tex_node.inputs["Vector"].links[0].from_socket.name
    if src.type == "TEX_COORD" and out in ("Object", "Generated"):
        return scale
    return None


def _principled_from_legacy(m):
    """Materiali con Diffuse/Glossy/Anisotropic/Mix/Emission (Blender 2.7x): ricostruisce un Principled equivalente."""
    nt = m.node_tree
    out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None) or \
        next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
    color, rough, metal, emit, img = (0.6, 0.6, 0.6), 0.5, 0.0, None, None
    diff = next((n for n in nt.nodes if n.type == "BSDF_DIFFUSE"), None)
    glossy = next((n for n in nt.nodes if n.type in ("BSDF_GLOSSY", "BSDF_ANISOTROPIC")), None)
    em = next((n for n in nt.nodes if n.type == "EMISSION"), None)
    tex = next((n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image), None)
    if diff:
        color = tuple(diff.inputs["Color"].default_value[:3]); rough = 0.6
    elif glossy:
        color = tuple(glossy.inputs["Color"].default_value[:3]); rough = float(glossy.inputs["Roughness"].default_value); metal = 1.0
    if glossy and not diff:
        metal = 1.0
    elif glossy and diff:
        rough = 0.3
    if em:
        emit = tuple(em.inputs["Color"].default_value[:3])
    if tex:
        img = tex.image
    nt.nodes.clear()
    o = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], o.inputs["Surface"])
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if img:
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
        if emit:
            nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
            b.inputs["Emission Strength"].default_value = 1.0
    elif emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 2.0
    m.diffuse_color = (*color, 1)
    return b


def gltf_safe(m, prefix=""):
    """Rende un materiale esportabile: Principled collegato all'uscita, colore da immagine su UV o costante."""
    if m is None or not m.use_nodes or not m.node_tree:
        return
    if m.get("_gltf_safe"):
        return
    nt = m.node_tree
    out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None) or \
        next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
    surf = _link_from(out.inputs["Surface"]) if out else None
    if surf is None or surf.type != "BSDF_PRINCIPLED":
        b = _principled_from_legacy(m)
    else:
        b = surf
    # colore base
    bc = b.inputs["Base Color"]
    if bc.is_linked:
        src = bc.links[0].from_node
        if src.type == "TEX_IMAGE":
            pass
        else:
            tex = _upstream(src, {"TEX_IMAGE"})
            if tex and tex.image:
                chain, n = [], src
                while n is not None and n.type != "TEX_IMAGE":
                    chain.append(n)
                    nxt = None
                    for i in n.inputs:
                        if i.is_linked and _upstream(i.links[0].from_node, {"TEX_IMAGE"}):
                            nxt = i.links[0].from_node
                            break
                    n = nxt
                img = _bake_color_chain(tex, list(reversed(chain)), m.name)
                t2 = nt.nodes.new("ShaderNodeTexImage"); t2.image = img
                if tex.inputs["Vector"].is_linked:
                    nt.links.new(tex.inputs["Vector"].links[0].from_socket, t2.inputs["Vector"])
                nt.links.new(t2.outputs["Color"], bc)
            else:
                c = _ramp_color(src) or tuple(bc.default_value[:3])
                nt.links.remove(bc.links[0])
                bc.default_value = (*c, 1)
    # rugosità, metallo, alpha: via i collegamenti procedurali (restano le immagini)
    for name in ("Roughness", "Metallic", "Alpha", "Coat Weight", "Specular IOR Level"):
        s = b.inputs.get(name)
        if s and s.is_linked and s.links[0].from_node.type != "TEX_IMAGE":
            src = s.links[0].from_node
            if src.type == "SEPARATE_COLOR" or _upstream(src, {"TEX_IMAGE"}):
                continue
            nt.links.remove(s.links[0])
    nrm = b.inputs["Normal"]
    if nrm.is_linked and nrm.links[0].from_node.type != "NORMAL_MAP":
        nt.links.remove(nrm.links[0])
    # immagini con coordinate Object/Generated: in glTF userò UV ricalcolate in proiezione a scala
    for n in nt.nodes:
        if n.type == "TEX_IMAGE" and n.image:
            sc = _tex_coord_scale(n)
            if sc:
                OBJCOORD_SCALE[m.name] = 1.0 / max(sc, 1e-3)
            if n.inputs["Vector"].is_linked:
                nt.links.remove(n.inputs["Vector"].links[0])
    if prefix and not m.name.startswith("MAT_"):
        m.name = f"MAT_{prefix}_{re.sub(r'[^A-Za-z0-9]+', '_', m.name).strip('_')}"
    m["_gltf_safe"] = True


def box_uv_selected(me, scale_of_material):
    """Ricalcola le UV in proiezione a scatola solo per le facce dei materiali indicati (metri per ripetizione)."""
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uvl = me.uv_layers[0].data
    for p in me.polygons:
        m = me.materials[p.material_index] if p.material_index < len(me.materials) else None
        if m is None or m.name not in scale_of_material:
            continue
        s = scale_of_material[m.name]
        n = p.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u, v = ((co.y, co.z), (co.x, co.z), (co.x, co.y))[ax]
            uvl[li].uv = (u / s, v / s)


def dedupe_images():
    """Le texture uguali importate da più file (dark_wood_*.jpg) diventano una sola."""
    groups = {}
    for img in bpy.data.images:
        if img.type != "IMAGE":
            continue
        base = re.sub(r"\.\d{3}$", "", img.name)
        groups.setdefault((base, tuple(img.size)), []).append(img)
    for (base, _), imgs in groups.items():
        keep = imgs[0]
        for other in imgs[1:]:
            other.user_remap(keep)
            bpy.data.images.remove(other)


def purge_orphans():
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras, bpy.data.node_groups):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)


def decimate_to(obj, max_tris):
    me = obj.data
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    if n <= max_tris:
        return n, n
    bm = bmesh.new(); bm.from_mesh(me)
    bm.free()
    mod = obj.modifiers.new("Decimate", "DECIMATE")
    mod.ratio = max_tris / n * 0.98
    mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    new = bpy.data.meshes.new_from_object(ev)
    obj.modifiers.remove(mod)
    old = obj.data
    obj.data = new
    new.name = old.name
    bpy.data.meshes.remove(old)
    new.calc_loop_triangles()
    return n, len(new.loop_triangles)

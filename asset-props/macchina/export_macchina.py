# Dodge Challenger 1970 R/T (~/Downloads/Dodge Challenger 1970 R  T.blend) -> macchina_raw.glb per il gioco.
# Uso: Blender -b "Dodge Challenger 1970 R  T.blend" --python export_macchina.py -- <uscita.glb>
# - via luci, curve, vuoti e i dettagli minuscoli (scritte, stemmi): da soli erano metà dei poligoni
# - materiali semplificati (i nodi procedurali non passano in glTF): vernice verde con le strisce (paint_albedo), cromo,
#   vetri trasparenti, gomme, interni scuri, fari che si accendono (emissive)
# - le quattro ruote, che nel file sono mesh uniche, diventano Ruota_AS / Ruota_AD / Ruota_PS / Ruota_PD con l'origine al
#   centro (così nel gioco girano); la carrozzeria è "Macchina"
# - scala reale (lunghezza 4,9 m) e decimazione dei pezzi più pesanti
import bpy, bmesh, sys
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1]
SCALA = 0.76
DETTAGLI = ('Text', 'challenger_logo', 'challenger_plasti', 'Curve.', 'FUEL', 'Cube.005', 'Cylinder.003', 'HOOD.002')
RUOTE = ('Cube.008', 'Cylinder', 'wheel.001', 'hubcap')

for o in list(bpy.data.objects):
    if o.type != 'MESH' or o.name.startswith(DETTAGLI) and o.name not in RUOTE:
        bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    if o.data.shape_keys:                                    # le shape key bloccano la decimazione: si tiene la forma base
        o.shape_key_clear()
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = bpy.data.objects['body']
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in bpy.data.objects:
    for v in o.data.vertices: v.co *= SCALA
    for m in o.modifiers: o.modifiers.remove(m)

# ---- materiali semplici
def mat(name, color, metal=0.0, rough=0.5, alpha=1.0, emit=None, tex=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if p is None:
        p = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        o = next((n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'), None) or m.node_tree.nodes.new('ShaderNodeOutputMaterial')
        m.node_tree.links.new(p.outputs['BSDF'], o.inputs['Surface'])
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal; p.inputs['Roughness'].default_value = rough
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
        try: m.surface_render_method = 'BLENDED'
        except Exception: m.blend_method = 'BLEND'
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1); p.inputs['Emission Strength'].default_value = 1.0
    if tex:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images[tex]
        m.node_tree.links.new(t.outputs['Color'], p.inputs['Base Color'])
    return m

M = {
    'vernice': mat('Vernice', (0.02, 0.35, 0.02), 0.35, 0.3, tex='paint_albedo.png'),
    'verde': mat('Verde', (0.02, 0.3, 0.02), 0.35, 0.3),
    'cromo': mat('Cromo', (0.85, 0.85, 0.85), 1.0, 0.18),
    'vetro': mat('Vetro', (0.06, 0.08, 0.09), 0.0, 0.05, alpha=0.35),
    'gomma': mat('Gomma', (0.025, 0.025, 0.025), 0.0, 0.85),
    'cerchi': mat('Cerchi', (0.55, 0.55, 0.57), 1.0, 0.35),
    'interni': mat('Interni', (0.03, 0.03, 0.03), 0.0, 0.6),
    'plastica': mat('Plastica', (0.02, 0.02, 0.02), 0.0, 0.4),
    'legno': mat('Legno', (0.25, 0.12, 0.05), 0.0, 0.5),
    'fari': mat('Fari', (0.9, 0.9, 0.85), 0.0, 0.2, emit=(1.0, 0.92, 0.7)),
    'stop': mat('Stop', (0.6, 0.02, 0.02), 0.0, 0.3, emit=(0.5, 0.0, 0.0)),
    'frecce': mat('Frecce', (1.0, 0.45, 0.0), 0.0, 0.3, emit=(0.25, 0.1, 0.0)),
    'targa': mat('Targa', (0.9, 0.9, 0.85), 0.0, 0.5, tex='lisence_plate.png'),
}
def scegli(n):
    if n == 'paint_w_stripes': return M['vernice']
    if n in ('paint',): return M['verde']
    if n in ('windshield', 'glass', 'frontglass_inner', 'frontglass_outher'): return M['vetro']
    if n in ('pattern.003', 'pattern.004', 'markings.002'): return M['gomma']
    if n in ('rims', 'metal.004'): return M['cerchi']
    if n in ('leather_black', 'blackleather', 'fabric', 'interior_fur', 'console'): return M['interni']
    if n in ('wood', 'wood.001'): return M['legno']
    if n in ('head_lights', 'blight_withe', 'reverse_light', 'interiorlight'): return M['fari']
    if n in ('rear_lights', 'b-light', 'deform', 'red_reflect', 'plastic_red'): return M['stop']
    if n in ('yellowglass', 'park_light', 'park_light_glass', 'reflect'): return M['frecce']
    if n == 'lisenceplate': return M['targa']
    if n in ('plastic', 'plastic_black', 'paintedsteel', 'rradiator', 'gauges', 'wire.001'): return M['plastica']
    return M['cromo']
for o in bpy.data.objects:
    for s in o.material_slots:
        if s.material and s.material.name not in [m.name for m in M.values()]: s.material = scegli(s.material.name)

# ---- ruote: pezzi staccati divisi per quadrante (x: sinistra/destra, y: avanti/dietro)
pezzi = {}
for name in RUOTE:
    o = bpy.data.objects[name]
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.mesh.separate(type='LOOSE')
for o in list(bpy.data.objects):
    if not o.name.startswith(RUOTE): continue
    c = sum((v.co for v in o.data.vertices), Vector()) / max(1, len(o.data.vertices))
    if abs(c.x) < 0.5 or abs(c.y) < 1.0: continue          # pezzi centrali (assi, sterzo): restano alla carrozzeria
    k = ('A' if c.y > 0 else 'P') + ('S' if c.x < 0 else 'D')
    pezzi.setdefault(k, []).append(o)
for k, objs in pezzi.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    w = bpy.context.view_layer.objects.active; w.name = 'Ruota_' + k
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')

# ---- decimazione dei pezzi pesanti
for o in bpy.data.objects:
    f = len(o.data.polygons)
    lim = 2400 if o.name.startswith('Ruota_') else 4000
    if f > lim:
        d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = lim / f
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier='dec')

# ---- carrozzeria: tutto il resto in un oggetto solo
bpy.ops.object.select_all(action='DESELECT')
rest = [o for o in bpy.data.objects if not o.name.startswith('Ruota_')]
for o in rest: o.select_set(True)
bpy.context.view_layer.objects.active = bpy.data.objects['body']
bpy.ops.object.join()
car = bpy.context.view_layer.objects.active
car.name = 'Macchina'
if len(car.data.polygons) > 45000:                         # tanti pezzetti sotto la soglia: una passata finale
    d = car.modifiers.new('dec', 'DECIMATE'); d.ratio = 45000 / len(car.data.polygons)
    bpy.ops.object.modifier_apply(modifier='dec')
for im in bpy.data.images:
    if im.name in ('paint_albedo.png', 'lisence_plate.png') and im.size[0] > 1024: im.scale(1024, 1024)
print('FACCE', {o.name: len(o.data.polygons) for o in bpy.data.objects})
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_lights=False,
                          export_cameras=False, export_image_format='WEBP')

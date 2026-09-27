# Cheeseburger ("Low Poly Beach Assets", JosephBennett, Blend Swap #73900): le parti della versione "esplosa"
# (Collection 2) impilate, modificatori applicati, semi di sesamo resi reali, decimato; più il bicchiere con la cannuccia.
import bpy, mathutils, sys, os
out = sys.argv[-1]
sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()

def principled(mat):
    """materiale Diffuse -> Principled con lo stesso colore (il glTF esporta solo il Principled)"""
    col = mat.diffuse_color[:]
    if mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_DIFFUSE' and not n.inputs['Color'].is_linked: col = n.inputs['Color'].default_value[:]
    m = bpy.data.materials.new('Food_' + mat.name.replace('Material.', 'M'))
    if not m.node_tree or not m.node_tree.nodes.get('Principled BSDF'):
        m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if bsdf is None:
        nt.nodes.clear()
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); outn = nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(bsdf.outputs[0], outn.inputs[0])
    bsdf.inputs['Base Color'].default_value = col
    bsdf.inputs['Roughness'].default_value = 0.6
    return m

def bake(names):
    objs = []
    for n in names:
        o = bpy.data.objects[n]
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg); me.transform(o.matrix_world)
        ob = bpy.data.objects.new(n + '_b', me); sc.collection.objects.link(ob); objs.append((n, ob))
    for inst in dg.object_instances:
        if inst.is_instance and inst.parent and inst.parent.original.name in names:
            me = bpy.data.meshes.new_from_object(inst.object.evaluated_get(dg), depsgraph=dg); me.transform(inst.matrix_world)
            ob = bpy.data.objects.new('seed_b', me); sc.collection.objects.link(ob); objs.append((inst.parent.original.name, ob))
    return objs

def zr(ob):
    zs = [v.co.z for v in ob.data.vertices]; return min(zs), max(zs)

def join(obs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active; j.name = name; j.data.name = name
    return j

mats = {}
def fix_mats(ob):
    for i, m in enumerate(ob.data.materials):
        if m and not m.name.startswith('Food_'):
            mats.setdefault(m.name, principled(m)); ob.data.materials[i] = mats[m.name]

# --- burger: pila dal basso: panino sotto, carne+formaggio, pomodoro, panino sopra (con i semi)
parts = bake(['Circle.004', 'Cube.002', 'Cube.003', 'Circle.007', 'Circle.005'])
layers = [['Circle.004'], ['Cube.002', 'Cube.003'], ['Circle.007'], ['Circle.005']]
top = 0.0
for layer in layers:
    obs = [ob for n, ob in parts if n in layer]
    lo = min(zr(ob)[0] for ob in obs if ob.name != 'seed_b' or True)
    hi = max(zr(ob)[1] for ob in obs)
    dz = (top - (0.14 if layer == ['Circle.007'] else 0.04)) - lo if layer != layers[0] else -lo
    for ob in obs: ob.data.transform(mathutils.Matrix.Translation((0, 0, dz)))
    top = hi + dz
b_obs = [ob for n, ob in parts]
for ob in b_obs: fix_mats(ob)
burger = join(b_obs, 'Food_Burger')
# centro in basso al centro, 11 cm di diametro
bb = [burger.matrix_world @ mathutils.Vector(c) for c in burger.bound_box]
cx = sum(p.x for p in bb) / 8; cy = sum(p.y for p in bb) / 8; z0 = min(p.z for p in bb)
burger.data.transform(mathutils.Matrix.Translation((-cx, -cy, -z0)))
w = max(burger.dimensions.x, burger.dimensions.y)
burger.data.transform(mathutils.Matrix.Scale(0.11 / w, 4))
dec = burger.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.035
bpy.context.view_layer.objects.active = burger; bpy.ops.object.modifier_apply(modifier='dec')

# --- bibita: bicchiere di carta e cannuccia, 15 cm
cup_parts = bake(['Circle.006', 'Cylinder.001'])
c_obs = [ob for n, ob in cup_parts]
for ob in c_obs: fix_mats(ob)
cup = join(c_obs, 'Food_Drink')
bb = [cup.matrix_world @ mathutils.Vector(c) for c in cup.bound_box]
cx = sum(p.x for p in bb) / 8; cy = sum(p.y for p in bb) / 8; z0 = min(p.z for p in bb)
cup.data.transform(mathutils.Matrix.Translation((-cx, -cy, -z0)))
cup.data.transform(mathutils.Matrix.Scale(0.15 / cup.dimensions.z, 4))
dec = cup.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.12
bpy.context.view_layer.objects.active = cup; bpy.ops.object.modifier_apply(modifier='dec')
for o in (burger, cup):
    print(o.name, len(o.data.polygons), [round(v, 3) for v in o.dimensions])
    for p in o.data.polygons: p.use_smooth = True

bpy.ops.object.select_all(action='DESELECT')
burger.select_set(True); cup.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_apply=True, export_yup=True)

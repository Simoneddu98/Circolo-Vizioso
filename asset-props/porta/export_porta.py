import bpy, mathutils, sys, math
out = sys.argv[-1]
sc = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()
res = []
for name, newname in (('Door', 'Porta_Anta'), ('Door Frame', 'Porta_Telaio')):
    o = bpy.data.objects[name]
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg); me.transform(o.matrix_world)
    ob = bpy.data.objects.new(newname, me); sc.collection.objects.link(ob); res.append(ob)
anta, telaio = res
# riferimento: centro in basso del telaio a (0,0,0); l'anta col perno sul bordo sinistro
tb = [mathutils.Vector(c) for c in telaio.bound_box]
cx = (min(p.x for p in tb) + max(p.x for p in tb)) / 2; cy = (min(p.y for p in tb) + max(p.y for p in tb)) / 2; z0 = min(p.z for p in tb)
for ob in res: ob.data.transform(mathutils.Matrix.Translation((-cx, -cy, -z0)))
ab = [mathutils.Vector(c) for c in anta.bound_box]
hx = min(p.x for p in ab); hy = (min(p.y for p in ab) + max(p.y for p in ab)) / 2
anta.data.transform(mathutils.Matrix.Translation((-hx, -hy, 0)))
anta.location = (hx, hy, 0)
for ob in res: print('OUT', ob.name, [round(v, 3) for v in ob.dimensions], [round(v, 3) for v in ob.location], len(ob.data.polygons))
for img in bpy.data.images: print('IMG', img.name, img.size[:], img.packed_file is not None, img.filepath)
bpy.ops.object.select_all(action='DESELECT')
for ob in res: ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_yup=True)

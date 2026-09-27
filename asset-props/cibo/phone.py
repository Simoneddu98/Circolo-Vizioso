import bpy, mathutils, sys
out=sys.argv[-1]
o=bpy.data.objects['Cube']
print('mats', [(m.name, [n.type for n in m.node_tree.nodes] if m and m.node_tree else None) for m in o.data.materials])
print('mods', [m.type for m in o.modifiers], 'rot', tuple(o.rotation_euler), 'scale', tuple(o.scale))
dg=bpy.context.evaluated_depsgraph_get()
me=bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg); me.transform(o.matrix_world)
ob=bpy.data.objects.new('Prop_Phone', me); bpy.context.scene.collection.objects.link(ob)
bb=[mathutils.Vector(c) for c in ob.bound_box]
cx=sum(p.x for p in bb)/8; cy=sum(p.y for p in bb)/8; z0=min(p.z for p in bb)
me.transform(mathutils.Matrix.Translation((-cx,-cy,-z0)))
me.transform(mathutils.Matrix.Scale(0.1238/ob.dimensions.y,4))
d=ob.modifiers.new('d','DECIMATE'); d.ratio=0.2
bpy.context.view_layer.objects.active=ob; bpy.ops.object.modifier_apply(modifier='d')
print('phone', len(me.polygons), [round(v,4) for v in ob.dimensions])
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_yup=True)

# City Street.blend -> strada.glb leggero: modificatori applicati, oggetti pesanti decimati, niente luci né testi 3D,
# texture in WebP (poi ridotte con gltf-transform).
import bpy, sys
out = sys.argv[-1]
sc = bpy.context.scene
for o in list(bpy.data.objects):
    if o.type in ('LIGHT', 'CAMERA', 'FONT', 'EMPTY'):
        bpy.data.objects.remove(o, do_unlink=True)
LIMITE = 6000
tot0 = tot1 = 0
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    n = len(o.data.polygons)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    n = len(ev.data.polygons) if hasattr(ev, 'data') and ev.data else n
    tot0 += n
    if n > LIMITE:
        m = o.modifiers.new('dec', 'DECIMATE')
        m.ratio = max(0.004, LIMITE / n)
for o in bpy.data.objects:
    o.select_set(o.type == 'MESH')
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    ev = o.evaluated_get(dg)
    try: tot1 += len(ev.to_mesh().polygons); ev.to_mesh_clear()
    except Exception: pass
print('FACCE', tot0, '->', tot1)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB', export_apply=True, export_yup=True,
                          export_image_format='WEBP', export_lights=False, export_cameras=False)
print('FATTO')

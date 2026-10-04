# Parametric door V1 (Blend Swap #83380, CC0) -> porta_casa.glb: la porta di casa in strada (capitolo 4 della storia).
# Uso: Blender -b ParametricDoor-V1.blend --python export_porta_casa.py -- <uscita.glb>
# Stessi nomi della porta del circolo (Porta_Telaio, Porta_Anta), così src/porta.js la apre allo stesso modo:
# cerniere sul lato con x minima, maniglia dall'altra parte. Materiali nuovi (nel file c'è solo "argilla"): anta e telaio
# verde bottiglia laccato, maniglia d'ottone, cerniere scure.
import bpy, sys
out = sys.argv[sys.argv.index('--') + 1]
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)

def mat(name, color, metal, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(p.outputs['BSDF'], o.inputs['Surface'])
    p.inputs['Base Color'].default_value = (*color, 1); p.inputs['Metallic'].default_value = metal; p.inputs['Roughness'].default_value = rough
    return m

M = {'_Door': mat('Casa_Legno', (0.035, 0.11, 0.06), 0.0, 0.35),
     '_DoorHandle': mat('Casa_Ottone', (0.78, 0.58, 0.25), 1.0, 0.25),
     '_DoorHinges': mat('Casa_Cerniere', (0.08, 0.08, 0.08), 1.0, 0.4)}
for o in bpy.data.objects:
    for s in o.material_slots:
        if s.material and s.material.name in M: s.material = M[s.material.name]
# forma finale (shape key della porta "parametrica" + modificatori) al posto della mesh originale
dg = bpy.context.evaluated_depsgraph_get()
finali = {o.name: (bpy.data.meshes.new_from_object(o.evaluated_get(dg)), o.matrix_world.copy()) for o in bpy.data.objects}
for o in bpy.data.objects:
    me, mw = finali[o.name]
    o.parent = None; o.matrix_world = mw
    o.modifiers.clear()
    if o.data.shape_keys: o.shape_key_clear()
    o.data = me
bpy.data.objects['_doorFrame'].name = 'Porta_Telaio'
bpy.data.objects['_doorLeaf'].name = 'Porta_Anta'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True, use_selection=True)
print('FATTO')

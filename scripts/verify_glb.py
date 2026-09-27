"""Reimporta build/circolo.glb e circolo_collision.glb in una scena vuota e confronta con build/manifest.json.
Uso: Blender -b --factory-startup --python scripts/verify_glb.py
"""
import bpy, json, os
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build")
bpy.ops.wm.read_homefile(use_empty=True)
man = json.load(open(os.path.join(OUT, "manifest.json")))
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "circolo.glb"))
bpy.context.view_layer.update()
objs = {o.name: o for o in bpy.context.scene.objects}

def dims(o):
    if o.type != "MESH":
        return [0, 0, 0]
    bb = [o.matrix_world @ Vector(v) for v in o.bound_box]
    return [max(b[k] for b in bb) - min(b[k] for b in bb) for k in range(3)]

missing = sorted(set(man) - set(objs))
extra = sorted(set(objs) - set(man))
prop_err, dim_err, loc_err = [], [], []
for n, ref in man.items():
    o = objs.get(n)
    if not o:
        continue
    for k, v in ref["props"].items():
        got = o.get(k)
        if got is None or (isinstance(v, float) and abs(float(got) - v) > 1e-4) or (not isinstance(v, float) and got != v and str(got) != str(v)):
            prop_err.append((n, k, v, got))
    d = dims(o)
    if any(abs(d[i] - ref["dims"][i]) > 0.002 for i in range(3)):
        dim_err.append((n, [round(x, 3) for x in d], ref["dims"]))
    if (o.matrix_world.translation - Vector(ref["loc"])).length > 0.002:
        loc_err.append((n, [round(x, 3) for x in o.matrix_world.translation], ref["loc"]))
pool = [round(x, 3) for x in dims(objs["Pool_Table"])]
bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "circolo_collision.glb"))
cols = [o for o in bpy.context.scene.objects]
res = {"source_objects": len(man), "imported_objects": len(objs), "missing": missing, "extra": extra,
       "prop_errors": prop_err, "dim_errors": dim_err, "loc_errors": loc_err, "pool_table_dims": pool,
       "collision_glb_objects": len(cols), "collision_names_ok": all(o.name.startswith("COL_") for o in cols),
       "collision_have_extras": all("collider" in o for o in cols),
       "ok": not (missing or extra or prop_err or dim_err or loc_err)}
json.dump(res, open(os.path.join(OUT, "verify_glb.json"), "w"), indent=1, default=str)
print("VERIFY_JSON", json.dumps(res, default=str))

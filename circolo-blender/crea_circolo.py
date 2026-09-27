import bpy, math, random
from mathutils import Vector
from pathlib import Path
random.seed(7)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name!='Collection': bpy.data.collections.remove(c)
def mat(n,c,metal=0,rough=.55):
 m=bpy.data.materials.new(n); m.diffuse_color=(*c,1); m.use_nodes=True; m.node_tree.nodes.clear()
 p=m.node_tree.nodes.new('ShaderNodeBsdfPrincipled'); out=m.node_tree.nodes.new('ShaderNodeOutputMaterial'); m.node_tree.links.new(p.outputs['BSDF'],out.inputs['Surface']); p.inputs['Base Color'].default_value=(*c,1); p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m
wood=mat('Noce scuro',(.15,.065,.026)); yellow=mat('Intonaco tabacco',(.55,.35,.12)); cream=mat('Formica crema',(.72,.65,.47)); green=mat('Feltro verde',(.045,.22,.105)); black=mat('Nero',(.012,.014,.017)); chrome=mat('Cromo',(.55,.59,.61),.85,.23); red=mat('Rosso',(.65,.025,.015)); blue=mat('Blu',(.02,.10,.65)); white=mat('Bianco',(.9,.88,.79)); glass=mat('Vetro',(.65,.8,.8),0,.15)
p=next(n for n in glass.node_tree.nodes if n.type=='BSDF_PRINCIPLED'); p.inputs['Transmission Weight'].default_value=.85
wine=mat('Vino',(.12,.004,.018)); gold=mat('Ottone',(.5,.3,.08),.7)
# Subtle procedural wood grain
nt=wood.node_tree; p=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'); tex=nt.nodes.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=5;tex.inputs['Detail'].default_value=2
coord=nt.nodes.new('ShaderNodeTexCoord');mapping=nt.nodes.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(3,3,35);nt.links.new(coord.outputs['Generated'],mapping.inputs[0]);nt.links.new(mapping.outputs[0],tex.inputs['Vector']);r=nt.nodes.new('ShaderNodeValToRGB');r.color_ramp.elements[0].color=(.035,.012,.004,1);r.color_ramp.elements[1].color=(.23,.105,.04,1);nt.links.new(tex.outputs['Fac'],r.inputs[0]);nt.links.new(r.outputs[0],p.inputs['Base Color'])
def group(n):
 c=bpy.data.collections.new(n);bpy.context.scene.collection.children.link(c);return c
current=group('01 Architettura')
def reg(o,n,m):
 o.name=n
 for c in list(o.users_collection):c.objects.unlink(o)
 current.objects.link(o)
 if m:o.data.materials.append(m)
 return o
def box(n,loc,size,m,bev=.015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=reg(bpy.context.object,n,m);o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bev: mod=o.modifiers.new('Bordi smussati','BEVEL');mod.width=bev;mod.segments=2;o.modifiers.new('Normali','WEIGHTED_NORMAL')
 return o
def cyl(n,loc,rad,depth,m):
 bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=rad,depth=depth,location=loc);return reg(bpy.context.object,n,m)
def rod(n,a,b,r,m):
 a,b=Vector(a),Vector(b);o=cyl(n,(a+b)/2,r,(b-a).length,m);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def ball(n,loc,r,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=r,location=loc);return reg(bpy.context.object,n,m)
# 8 x 12 m interior, back is +Y
floor=mat('Fughe',(.2,.13,.08));box('Soletta',(0,0,-.13),(8.4,12.4,.25),floor)
tiles=[mat('Cotto '+str(i),(.34+i*.012,.13+i*.007,.06+i*.004)) for i in range(7)]
for ix in range(16):
 for iy in range(24):box('Piastrella',(-3.75+ix*.5,-5.75+iy*.5,.008),(.492,.492,.025),random.choice(tiles),.003)
for x in [-4.1,4.1]:
 box('Parete laterale',(x,0,1.65),(.2,12.2,3.3),yellow)
 box('Boiserie',(x*.978,0,.56),(.05,12,1.1),wood)
 for y in range(-6,7):box('Montante boiserie',(x*.969,y,.55),(.055,.035,1.1),wood)
box('Parete fondo',(0,6.1,1.65),(8.4,.2,3.3),yellow);box('Boiserie fondo',(0,5.97,.55),(8,.05,1.1),wood)
# entrance wall with opening
for x,w in [(-3.1,1.8),(1.5,5)]:box('Parete ingresso',(x,-6.1,1.65),(w,.2,3.3),yellow)
box('Sopraporta',(-1.5,-6.1,2.85),(1.4,.2,.9),yellow)
box('Porta ingresso',(-1.5,-6.04,1.15),(1.2,.07,2.3),wood)
box('Vetro porta',(-1.5,-5.99,1.55),(.85,.02,1.05),glass)
ceiling=box('Soffitto rimovibile',(0,0,3.4),(8.4,12.4,.18),cream);ceiling.hide_render=False;ceiling.hide_set(True)
# windows applied as architectural recess panels
for y in [-3,1.3]:
 box('Cornice finestra',(3.97,y,2.05),(.10,1.45,1.65),wood)
 box('Vetro finestra',(3.90,y,2.05),(.02,1.28,1.48),glass)
 box('Traversa finestra',(3.87,y,2.05),(.045,1.3,.045),wood)
 box('Montante finestra',(3.87,y,2.05),(.045,.045,1.5),wood)
def table(x,y,w=.85,d=.85,h=.75):
 box('Piano tavolo',(x,y,h),(w,d,.07),wood)
 for a in [-1,1]:
  for b in [-1,1]:box('Gamba tavolo',(x+a*(w/2-.07),y+b*(d/2-.07),h/2),(.07,.07,h),wood)
def chair(x,y,ang=0):
 objs=[];start=set(bpy.data.objects)
 box('Seduta',(x,y,.45),(.43,.43,.06),wood)
 for a in [-1,1]:
  for b in [-1,1]:box('Gamba sedia',(x+a*.17,y+b*.17,.23),(.045,.045,.46),wood)
 for a in [-1,1]:box('Supporto schienale',(x+a*.17,y-.18,.67),(.045,.045,.48),wood)
 box('Schienale',(x,y-.18,.86),(.43,.055,.17),wood)
 for o in set(bpy.data.objects)-start:
  v=o.location-Vector((x,y,0)); c,s=math.cos(ang),math.sin(ang);o.location=(x+c*v.x-s*v.y,y+s*v.x+c*v.y,v.z);o.rotation_euler.z+=ang
current=group('02 Bancone e bottiglie')
box('Bancone 4 metri',(-3.05,-1, .52),(.75,4,1.04),wood);box('Formica bancone',(-3.05,-1,1.08),(.88,4.12,.07),cream)
rod('Poggiapiedi',(-2.53,-2.95,.19),(-2.53,.95,.19),.028,chrome)
for y in [-2.7,-1.5,-.3,.8]:
 box('Pannello bancone',(-2.662,y,.56),(.025,.95,.75),wood)
 cyl('Sgabello',(-2.13,y,.71),.2,.09,green);rod('Stelo',(-2.13,y,.1),(-2.13,y,.67),.04,chrome);cyl('Base',(-2.13,y,.065),.24,.04,chrome)
for z in [1.35,1.85,2.35]:
 box('Mensola bar',(-3.75,-1,z),(.38,3.8,.065),wood)
 for j in range(13):
  y=-2.7+j*.28;m=random.choice([green,wine,glass]);cyl('Bottiglia',(-3.74,y,z+.17),.065,.28,m);cyl('Collo',(-3.74,y,z+.35),.028,.13,m)
  box('Etichetta bianca',(-3.67,y,z+.18),(.01,.075,.11),white,.001)
current=group('03 Biliardo')
box('Telaio biliardo',(-.65,-.25,.67),(1.4,2.5,.28),wood);box('Feltro liscio',(-.65,-.25,.825),(1.21,2.3,.035),green)
for x in [-1.35,.05]:box('Sponda lunga',(x,-.25,.85),(.11,2.5,.10),wood)
for y in [-1.5,1]:box('Sponda corta',(-.65,y,.85),(1.4,.12,.10),wood)
for x in [-1.27,-.03]:
 for y in [-1.4,-.25,.9]:cyl('Buca',(x,y,.91),.067,.018,black)
for x in [-1.19,-.11]:
 for y in [-1.23,.73]:box('Gamba biliardo',(x,y,.34),(.16,.16,.68),wood)
current=group('04 TV e platea')
box('TV cornice',(0,5.85,2.12),(1.47,.10,.86),black);box('Schermo spento',(0,5.79,2.12),(1.38,.016,.77),black)
for y in [3.35,4.3]:
 for x in [-1.5,-.9,-.3,.3,.9,1.5]:chair(x,y)
current=group('05 Calcio balilla')
x,y=2.2,.2
box('Mobile calcio balilla',(x,y,.7),(.76,1.4,.30),wood);box('Campo verde',(x,y,.87),(.66,1.25,.03),green)
for a in [-.3,.3]:
 for b in [-.58,.58]:box('Gamba balilla',(x+a,y+b,.36),(.09,.09,.72),wood)
for j in range(8):
 yy=y-.58+j*.165;rod('Asta cromata',(x-.62,yy,.96),(x+.62,yy,.96),.012,chrome)
 team=red if j in [0,1,3,5] else blue
 for k in range([1,2,3,5,5,3,2,1][j]):
  count=[1,2,3,5,5,3,2,1][j];xx=x+(k-(count-1)/2)*.105;box('Giocatore',(xx,yy,.96),(.043,.04,.14),team,.008);ball('Testa',(xx,yy,1.05),.025,team)
current=group('06 Slot machine')
for y in [2,3.15]:
 box('Cabinet slot',(3.52,y,.78),(.62,.7,1.56),wood);box('Frontale nero',(3.19,y,1.07),(.06,.65,.85),black)
 box('Pannello luminoso',(3.145,y,1.22),(.02,.52,.45),blue)
 for j in range(3):ball('Simbolo',(3.12,y-.17+j*.17,1.23),.045,[red,gold,green][j])
 box('Pulsantiera',(3.08,y,.80),(.26,.65,.09),black)
 for j in range(4):cyl('Pulsante',(3.03,y-.22+j*.14,.86),.03,.018,[red,green,gold,blue][j])
current=group('07 Tavolo carte e accessori')
table(2.3,-3.6)
for x,y,a in [(2.3,-4.35,0),(2.3,-2.85,math.pi),(1.55,-3.6,-math.pi/2),(3.05,-3.6,math.pi/2)]:chair(x,y,a)
for i in range(9):
 o=box('Carta napoletana',(2.08+random.random()*.45,-3.85+random.random()*.5,.794),(.055,.09,.002),white,.001);o.rotation_euler.z=random.random()
 cyl('Seme moneta',(o.location.x,o.location.y,.797),.008,.002,gold)
table(3.3,-5,.48,.48,.60);box('Pacchetto sigarette',(3.23,-5,.67),(.055,.09,.12),white);box('Fascia rossa',(3.23,-5.046,.64),(.055,.003,.05),red)
def cup(x,y,z):
 cyl('Bicchiere',(x,y,z+.055),.035,.11,glass);cyl('Vino rosso',(x,y,z+.035),.029,.05,wine)
cup(2.5,-3.4,.80);cup(-3,-1.5,1.12)
for x,y,z in [(3.4,-5,.65),(2.55,-3.8,.81)]:cyl('Posacenere vetro',(x,y,z),.07,.028,glass)
current=group('08 Bandiera e decorazioni')
box('Bandiera Sardegna',( -2.2,5.95,2.3),(1.1,.025,.7),white)
box('Croce verticale',(-2.2,5.929,2.3),(.09,.015,.7),red);box('Croce orizzontale',(-2.2,5.92,2.3),(1.1,.02,.075),red)
# four recognizable silhouette emblems with forehead bands
for x in [-2.47,-1.93]:
 for z in [2.12,2.48]:
  o=ball('Moro',(x,5.90,z),.09,black);o.scale=(.72,.18,1)
  box('Profilo naso',(x+.064,5.90,z+.005),(.047,.025,.045),black,.006)
  box('Fascia bianca',(x,5.878,z+.043),(.135,.015,.022),white,.002)
for x in [-.6,1.8,2.8]:
 box('Cornice foto',(x,5.96,2.8),(.65,.05,.40),wood);box('Foto seppia',(x,5.924,2.8),(.55,.01,.3),cream)
current=group('09 Luci')
def light(n,loc,power,color,size=1):
 d=bpy.data.lights.new(n,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(n,d);current.objects.link(o);o.location=loc;return o
for x in [-2,2]:
 for y in [-3,2]:
  box('Plafoniera',(x,y,3.23),(.20,1.2,.06),white);light('Fluorescente',(x,y,3.15),180,(1,.89,.69),2)
# hanging green shade
bpy.ops.mesh.primitive_cone_add(vertices=48,radius1=.42,radius2=.12,depth=.22,location=(-.65,-.25,2.35));reg(bpy.context.object,'Lampada biliardo',green)
rod('Cavo lampada',(-.65,-.25,2.46),(-.65,-.25,3.3),.012,black);light('Luce biliardo',(-.65,-.25,2.20),90,(1,.83,.5),.6)
for x in [-3.85,3.85]:
 for y in [-4,0,4]:
  ball('Applique',(x,y,2.25),.12,cream);light('Luce parete',(x*.95,y,2.3),45,(1,.65,.3),.5)
current=group('10 Camere')
def camera(n,loc,target,lens):
 bpy.ops.object.camera_add(location=loc);o=reg(bpy.context.object,n,None);o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();o.data.lens=lens;return o
cam=camera('Ingresso - vista principale',(0,-5.65,1.7),(0,1.8,1.2),20)
plan=camera('Vista pianta',(0,0,16),(0,0,0),35);plan.data.type='ORTHO';plan.data.ortho_scale=14
scene=bpy.context.scene;scene.camera=cam;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.world.color=(.15,.15,.15);scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=80
scene.view_settings.view_transform='AgX'
for area in bpy.context.screen.areas:
 if area.type=='VIEW_3D': area.spaces.active.region_3d.view_distance=16
out=Path(bpy.path.abspath('//')) if bpy.data.filepath else Path.cwd(); out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'circolo-sardegna.blend'))
scene.render.filepath=str(out/'anteprima.png');bpy.ops.render.render(write_still=True)

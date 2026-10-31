import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js";
import { VRButton } from "https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/webxr/VRButton.js";

const $ = id => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb3c2);
scene.fog = new THREE.Fog(0x9bb3c2, 8, 30);
const camera = new THREE.PerspectiveCamera(65, innerWidth/innerHeight, .01, 100);
camera.position.set(3,2.2,4);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff,0x52606b,2));
const sun = new THREE.DirectionalLight(0xffffff,2.1); sun.position.set(4,8,5); scene.add(sun);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshStandardMaterial({color:0x657a83,roughness:1}));
floor.rotation.x=-Math.PI/2; floor.position.y=-.03; scene.add(floor);
const grid = new THREE.GridHelper(20,40,0x526a73,0x71858c); grid.position.y=-.015; scene.add(grid);

let nodes = [];
let selected = null;
let nextId = 1;
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const controllers = [];
const rootGroup = new THREE.Group(); scene.add(rootGroup);

function validItemID(id){ return /^item_[a-z0-9_-]+$/i.test(String(id||"").trim()); }
function makeItem(id){
  return {itemID:id,jsonData:"",stashPos:0,children:[],stuckChildren:[],grabPos:[0,0,0],grabRot:[0,0,0,1],
    state:0,ammo:0,isBlueprint:true,scaleModifier:0,colorHue:0,colorSaturation:0,jellyStrength:0,stashRow:0,stashCol:0};
}
function colorFor(id){ let h=0; for(const c of id) h=(h*31+c.charCodeAt(0))|0; return new THREE.Color().setHSL((Math.abs(h)%360)/360,.48,.53); }
function makeVisual(node){
  const geo = new THREE.BoxGeometry(.28,.28,.28);
  const mat = new THREE.MeshStandardMaterial({color:colorFor(node.item.itemID),roughness:.65});
  const mesh = new THREE.Mesh(geo,mat); mesh.userData.node=node; mesh.castShadow=true; mesh.receiveShadow=true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:0x10202b}));
  mesh.add(edges);
  const labelCanvas=document.createElement("canvas"); labelCanvas.width=512; labelCanvas.height=96;
  const ctx=labelCanvas.getContext("2d"); ctx.fillStyle="#101820";ctx.fillRect(0,0,512,96);
  ctx.fillStyle="#ffffff";ctx.font="bold 30px sans-serif";ctx.textAlign="center";ctx.fillText(node.item.itemID.replace(/^item_/,""),256,60);
  const tex=new THREE.CanvasTexture(labelCanvas);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:false}));
  sprite.scale.set(.9,.17,1); sprite.position.y=.25; mesh.add(sprite);
  node.mesh=mesh; nodeGroup(node).add(mesh);
  syncMesh(node);
}
function nodeGroup(node){return node.parent?node.parent.group:rootGroup;}
function syncMesh(node){
  node.group.position.copy(node.position);
  node.group.quaternion.copy(node.quaternion);
  node.mesh.scale.setScalar(1+node.item.scaleModifier/128);
}
function createNode(item,parent=null,position=null){
  const node={uid:nextId++,item,parent,children:[],position:position?new THREE.Vector3(...position):new THREE.Vector3(parent?0.35:0, parent?0.15:.25, parent?0:0),
    quaternion:new THREE.Quaternion(),group:new THREE.Group(),mesh:null};
  node.group.name=item.itemID; (parent?parent.group:rootGroup).add(node.group);
  if(parent) parent.children.push(node); nodes.push(node); makeVisual(node); return node;
}
function descendants(item){
  return item.children.map(c=>structuredClone(c));
}
function serializeNode(node){
  const item=structuredClone(node.item);
  item.children=descendants(node.item);
  item.stuckChildren=node.children.map(child=>{
    const p=child.position, q=child.quaternion;
    const nested=serializeNode(child);
    return {item:nested,subParentID:0,pos:[round(p.x),round(p.y),round(p.z)],
      rot:[round(q.x),round(q.y),round(q.z),round(q.w)],posePos:[0,0,0],poseRot:[0,0,0,1],wasDynamicStuck:false};
  });
  return item;
}
function round(n){return Math.round(n*10000)/10000;}
function clearBuild(){for(const n of nodes){n.mesh?.geometry?.dispose();} rootGroup.clear();nodes=[];selected=null;nextId=1;}
function choose(node){selected=node; renderTree(); fillFields();}
function renderTree(){
  const el=$("tree");el.replaceChildren();
  if(!nodes.length){el.textContent="No build yet.";return;}
  function add(n,depth=0){const b=document.createElement("button");b.className="treeitem"+(n===selected?" active":"");b.style.paddingLeft=(8+depth*15)+"px";b.textContent=(n.parent?"↳ ":"◆ ")+n.item.itemID;b.onclick=()=>choose(n);el.append(b);n.children.forEach(c=>add(c,depth+1));}
  nodes.filter(n=>!n.parent).forEach(n=>add(n));
}
function fillFields(){
  const n=selected;if(!n)return;
  $("itemID").value=n.item.itemID;$("px").value=round(n.position.x);$("py").value=round(n.position.y);$("pz").value=round(n.position.z);$("scale").value=n.item.scaleModifier||0;
}
function status(s){$("status").textContent=s;}
function exportBuild(){
  const root=nodes.find(n=>!n.parent);if(!root){status("Create a root first.");return;}
  const data=serializeNode(root);
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=(root.item.itemID||"goop_build")+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status("JSON exported.");
}
function importBuild(raw){
  const root=raw?.itemID?raw:(Array.isArray(raw?.items)?raw.items[0]:null);
  if(!root?.itemID)throw new Error("JSON needs a root itemID.");
  clearBuild();
  function walk(item,parent=null,edge=null){
    if(!item||!validItemID(item.itemID))return null;
    const n=createNode(structuredClone(item),parent,edge?.pos||(!parent?[0,.25,0]:[.3,.1,0]));
    if(edge?.rot?.length===4)n.quaternion.set(...edge.rot);
    n.item.stuckChildren=[];
    for(const e of (item.stuckChildren||[])){if(e?.item)walk(e.item,n,e);}
    return n;
  }
  walk(root);choose(nodes[0]);status("Imported JSON. Check item IDs and poses before using in-game.");
}
function pickFromRay(controller){
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0,0,-1).applyMatrix4(tempMatrix);
  const hits=raycaster.intersectObjects(nodes.map(n=>n.mesh),false);
  if(hits.length){const node=hits[0].object.userData.node;choose(node);}
}
function setupController(i){
  const c=renderer.xr.getController(i);scene.add(c);
  const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,-4)]),
    new THREE.LineBasicMaterial({color:0x143f52}));c.add(line);
  c.addEventListener("selectstart",()=>pickFromRay(c));controllers.push(c);
}
setupController(0);setupController(1);

$("enterVR").onclick=async()=>{
  if(!navigator.xr){status("WebXR not available. Open this on Quest Browser over HTTPS.");return;}
  try{const ok=await navigator.xr.isSessionSupported("immersive-vr");if(!ok)throw new Error("Immersive VR is not supported here.");
    if(!renderer.xr.getSession()) await renderer.xr.setSession(await navigator.xr.requestSession("immersive-vr",{optionalFeatures:["local-floor","bounded-floor","hand-tracking","dom-overlay"],domOverlay:{root:document.body}}));
    status("VR session active. Point a controller at a block and press trigger.");
  }catch(e){status(e.message||"Could not enter VR.");}
};
$("addRoot").onclick=()=>{
  if(nodes.some(n=>!n.parent)){status("There is already a root. Import or delete the current build first.");return;}
  const id=$("itemID").value.trim();if(!validItemID(id)){status("Use an ID like item_crate.");return;}
  choose(createNode(makeItem(id)));status("Root created.");
};
$("addPart").onclick=()=>{
  if(!selected){status("Select a parent item first.");return;}
  const id=$("itemID").value.trim();if(!validItemID(id)){status("Use an ID like item_crate.");return;}
  const n=createNode(makeItem(id),selected,[.35,.15,0]);choose(n);status("Part attached. Adjust its position on the left.");
};
$("apply").onclick=()=>{
  if(!selected)return;
  const id=$("itemID").value.trim();if(!validItemID(id)){status("Invalid item ID.");return;}
  selected.item.itemID=id;selected.item.scaleModifier=Math.max(-128,Math.min(127,Number($("scale").value)||0));
  selected.position.set(Number($("px").value)||0,Number($("py").value)||0,Number($("pz").value)||0);
  selected.mesh.material.color.copy(colorFor(id));selected.group.name=id;syncMesh(selected);choose(selected);status("Changes applied.");
};
$("deletePart").onclick=()=>{
  if(!selected)return;if(!selected.parent){status("Root cannot be deleted. Start a new build instead.");return;}
  const doomed=[];const collect=n=>{doomed.push(n);n.children.forEach(collect);};collect(selected);
  selected.parent.children=selected.parent.children.filter(n=>n!==selected);
  for(const n of doomed){n.group.remove(n.mesh);n.group.parent?.remove(n.group);nodes=nodes.filter(x=>x!==n);}
  choose(selected.parent);status("Part deleted.");
};
$("export").onclick=exportBuild;
$("import").onclick=()=>$("fileInput").click();
$("fileInput").onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{importBuild(JSON.parse(await f.text()));}catch(err){status(err.message||"Import failed.");}e.target.value="";};
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
function animate(){renderer.setAnimationLoop(()=>{renderer.render(scene,camera);});}
animate();

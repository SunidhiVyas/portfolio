import * as THREE from 'three';

/* ════════════════════════════════════════════════════════════════
   Sunidhi Vyas — cinematic hero
   Structure
     1. helpers + input (mouse / touch / device orientation)
     2. Character  → PortraitCharacter (depth-mesh from the photo)
                     swap for a GLB later: see "GLB SWAP" note
     3. Blue energy rings + particles
     4. Magic cursor (2D overlay)
     5. Loop: springs, scroll choreography, render
   ════════════════════════════════════════════════════════════════ */

const A = window.__ASSETS;
const $ = s => document.querySelector(s);
const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
const lerp = (a,b,t)=>a+(b-a)*t;
const damp = (a,b,l,dt)=>lerp(a,b,1-Math.exp(-l*dt));
const easeOut = t=>1-Math.pow(1-t,3);
const RAD = Math.PI/180;
const coarse = matchMedia('(pointer:coarse)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOTION = reduce ? 0.35 : 1;

{ const yrEl=$('#yr'); if(yrEl) yrEl.textContent = new Date().getFullYear(); }
$('#fallback').src = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 440'><defs><radialGradient id='g' cx='50%' cy='38%' r='60%'><stop offset='0%' stop-color='%232d7bff' stop-opacity='.45'/><stop offset='100%' stop-color='%232d7bff' stop-opacity='0'/></radialGradient></defs><rect width='300' height='440' fill='#02040a'/><circle cx='150' cy='170' r='170' fill='url(%23g)'/><g fill='#eef2fb'><ellipse cx='150' cy='90' rx='52' ry='56'/><rect x='118' y='138' width='64' height='18' rx='8'/><rect x='90' y='150' width='120' height='150' rx='40'/><rect x='40' y='170' width='34' height='110' rx='16'/><rect x='226' y='170' width='34' height='110' rx='16'/><rect x='108' y='290' width='34' height='120' rx='14'/><rect x='158' y='290' width='34' height='120' rx='14'/></g><g fill='#6db0ff'><ellipse cx='132' cy='86' rx='7' ry='9'/><ellipse cx='168' cy='86' rx='7' ry='9'/><circle cx='150' cy='200' r='14' fill-opacity='.85'/></g></svg>`);
if (coarse){ $('#demoA').textContent='Touch & drag'; }

/* ─────────── 1. input ─────────── */
const input = { tx:0, ty:0, x:0, y:0, px:-999, py:-999, vx:0, vy:0, moved:false, speed:0, over:false, hasPointer:false };
function setNorm(cx,cy){
  input.tx = clamp((cx/innerWidth)*2-1,-1,1);
  input.ty = clamp(-((cy/innerHeight)*2-1),-1,1);   // up = +1
}
addEventListener('pointermove',e=>{
  if(!input.moved){ input.moved=true; document.body.classList.add('engaged'); }
  input.hasPointer=true; input.px=e.clientX; input.py=e.clientY; setNorm(e.clientX,e.clientY);
},{passive:true});
addEventListener('pointerdown',e=>{ input.hasPointer=true; input.px=e.clientX; input.py=e.clientY; input.down=true; if(coarse) setNorm(e.clientX,e.clientY); },{passive:true});
addEventListener('pointerup',()=>{ input.down=false; if(coarse) setTimeout(()=>{ if(!input.down){ input.tx*=.0; input.ty*=.0; input.hasPointer=false; } },1200); },{passive:true});
document.addEventListener('mouseout',e=>{ if(!e.relatedTarget && !coarse){ input.tx=0; input.ty=0; } });
// Device tilt (Android works directly; iOS asks permission on first touch)
let tiltOn=false;
function onTilt(e){
  if(e.gamma==null) return; tiltOn=true;
  input.tx = clamp(e.gamma/25,-1,1);
  input.ty = clamp(-(e.beta-50)/22,-1,1);
}
if(coarse && 'DeviceOrientationEvent' in window){
  const enable=()=>addEventListener('deviceorientation',onTilt);
  if(typeof DeviceOrientationEvent.requestPermission==='function'){
    addEventListener('touchend',function once(){
      DeviceOrientationEvent.requestPermission().then(s=>{ if(s==='granted') enable(); }).catch(()=>{});
      removeEventListener('touchend',once);
    },{once:true});
  } else enable();
}
// direction hints light up
const hints={right:$('[data-d=right]'),left:$('[data-d=left]'),up:$('[data-d=up]'),down:$('[data-d=down]')};

/* ─────────── scene ─────────── */
const stage = $('#stage'), canvas = $('#gl');
const FOV=30, CAMZ=6;
const ASPECT = 670/984;                 // portrait texture ratio
let renderer;
try{
  renderer = new THREE.WebGLRenderer({canvas,antialias:!coarse,alpha:true,powerPreference:'high-performance'});
}catch(err){ document.body.classList.add('no-gl'); }
if(!renderer){ document.body.classList.add('ready'); document.body.classList.add('no-gl'); }
else main();

function main(){
window.__glOK=true;
renderer.setClearColor(0x000000,0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV,1,.1,50);
camera.position.set(0,0,CAMZ);

const ADD = { blending:THREE.CustomBlending, blendEquation:THREE.AddEquation, blendSrc:THREE.OneFactor, blendDst:THREE.OneFactor,
              blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor, transparent:true, depthWrite:false };
const BLUE = new THREE.Color(0.10,0.44,1.0), ICE = new THREE.Color(0.62,0.82,1.0);
const uTime = {value:0};

/* ─────────── 2. CHARACTER ───────────
   FUTURISTIC WHITE ROBOT — procedural rig (primitives, not a photo).
   Interface kept identical to the original photo-mesh character so the
   rest of the choreography (springs, layout, scroll transitions) needs
   no changes: { group, mesh, u, applyPose() }.
     group → entrance/scroll transform (position.z/scale/position.xy)
     mesh  → scaled to charH by layout()
     u     → pose/lighting uniforms, same field names as before
     applyPose() → called once per frame to turn u.* into actual
                   Object3D rotations + material colors (no shaders).
*/
function createRobot(){
  const outer = new THREE.Group();
  const mesh  = new THREE.Group();
  outer.add(mesh);

  const u = {
    uBody:{value:0}, uShoulder:{value:0}, uHead:{value:0},
    uPitchBody:{value:0}, uPitchHead:{value:0},
    uBreath:{value:0}, uSway:{value:1},
    uLight:{value:new THREE.Vector3(.4,.3,.8)},
    uBright:{value:1}, uPulse:{value:0}, uIntro:{value:0}, uRim:{value:1}
  };

  /* materials — matte white/silver armor, dark joints, blue glow */
  const bodyMat  = new THREE.MeshStandardMaterial({color:0xeef2fb,metalness:.32,roughness:.42,transparent:true,opacity:1});
  const jointMat = new THREE.MeshStandardMaterial({color:0xaab6cc,metalness:.55,roughness:.30,transparent:true,opacity:1});
  const visorMat = new THREE.MeshStandardMaterial({color:0x060a14,metalness:.2,roughness:.5,transparent:true,opacity:1});
  const glowMat  = new THREE.MeshBasicMaterial({color:0x2d7bff,transparent:true,opacity:1});
  const eyeMat   = new THREE.MeshBasicMaterial({color:0x9fd4ff,transparent:true,opacity:1});
  const mats=[bodyMat,jointMat,visorMat,glowMat,eyeMat];

  /* pivots: body(hips) → shoulders(chest) → head(neck) */
  const bodyPivot     = new THREE.Group(); bodyPivot.position.set(0,-.15,0);
  const shoulderPivot = new THREE.Group(); shoulderPivot.position.set(0,.29,0);
  const headPivot     = new THREE.Group(); headPivot.position.set(0,.16,0);
  mesh.add(bodyPivot); bodyPivot.add(shoulderPivot); shoulderPivot.add(headPivot);

  /* legs + feet — grounded, independent of body lean */
  const legGeo = new THREE.CapsuleGeometry(.044,.30,4,8);
  [-1,1].forEach(s=>{
    const leg = new THREE.Mesh(legGeo,bodyMat); leg.position.set(s*.085,-.32,0); mesh.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.09,.035,.145),jointMat);
    foot.position.set(s*.085,-.487,.02); mesh.add(foot);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(.048,10,8),jointMat);
    knee.position.set(s*.085,-.30,0); mesh.add(knee);
  });

  /* hips */
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(.10,.05,4,8),bodyMat);
  hips.rotation.z=Math.PI/2; hips.scale.set(1,1,.82); bodyPivot.add(hips);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(.108,.0055,6,28),glowMat);
  belt.rotation.x=Math.PI/2; bodyPivot.add(belt);

  /* chest / torso */
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(.135,.20,4,10),bodyMat);
  chest.position.set(0,.03,0); shoulderPivot.add(chest);
  const core = new THREE.Mesh(new THREE.CircleGeometry(.042,24),eyeMat);
  core.position.set(0,.06,.135); shoulderPivot.add(core);
  const coreRing = new THREE.Mesh(new THREE.RingGeometry(.045,.055,24),glowMat);
  coreRing.position.copy(core.position); shoulderPivot.add(coreRing);
  /* thin blue chest seams */
  [[-.06,.02],[.06,.02]].forEach(([x])=>{
    const seam=new THREE.Mesh(new THREE.CylinderGeometry(.003,.003,.19,6),glowMat);
    seam.position.set(x,.03,.128); shoulderPivot.add(seam);
  });

  /* shoulders + arms */
  function makeArm(sign,forward){
    const shGeo=new THREE.SphereGeometry(.074,16,12);
    const sh=new THREE.Mesh(shGeo,jointMat); sh.position.set(sign*.19,.15,forward?.02:0); shoulderPivot.add(sh);
    const armGroup=new THREE.Group(); armGroup.position.copy(sh.position); shoulderPivot.add(armGroup);
    const upper=new THREE.Mesh(new THREE.CapsuleGeometry(.05,.17,4,8),bodyMat);
    upper.position.set(0,-.10,0); upper.rotation.z=sign*.10; armGroup.add(upper);
    const elbow=new THREE.Mesh(new THREE.SphereGeometry(.042,10,8),jointMat);
    elbow.position.set(sign*.012,-.20,0); armGroup.add(elbow);
    const fore=new THREE.Mesh(new THREE.CapsuleGeometry(.040,.155,4,8),bodyMat);
    fore.position.set(sign*.018,-.30,.012); fore.rotation.z=sign*.05; armGroup.add(fore);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.044,12,10),jointMat);
    hand.position.set(sign*.028,-.395,.015); armGroup.add(hand);
    const stripe=new THREE.Mesh(new THREE.CylinderGeometry(.002,.002,.14,6),glowMat);
    stripe.position.set(0,-.10,.052); armGroup.add(stripe);
    return armGroup;
  }
  const armL=makeArm(-1,true), armR=makeArm(1,false);

  /* neck + head */
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.044,.05,.06,12),jointMat);
  neck.position.set(0,.04,0); headPivot.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.100,22,16),bodyMat);
  head.scale.set(1,1.04,.92); head.position.set(0,.09,0); headPivot.add(head);
  const visor=new THREE.Mesh(new THREE.SphereGeometry(.103,22,16,0,Math.PI*2,Math.PI*.30,Math.PI*.30),visorMat);
  visor.position.copy(head.position); visor.rotation.x=.05; headPivot.add(visor);
  const eyeGeo=new THREE.SphereGeometry(.0155,10,8);
  [-1,1].forEach(s=>{
    const eye=new THREE.Mesh(eyeGeo,eyeMat); eye.position.set(s*.037,.095,.093); headPivot.add(eye);
  });
  const crest=new THREE.Mesh(new THREE.CylinderGeometry(.003,.003,.10,6),glowMat);
  crest.position.set(0,.125,.055); crest.rotation.x=Math.PI/2-.25; headPivot.add(crest);

  /* idle-animation + pose application (replaces the old vertex/fragment shader) */
  const baseChestScale = chest.scale.clone();
  function applyPose(){
    bodyPivot.rotation.y = u.uBody.value;
    bodyPivot.rotation.x = u.uPitchBody.value*.6;
    shoulderPivot.rotation.y = u.uShoulder.value;
    shoulderPivot.rotation.x = u.uPitchBody.value*.4;
    headPivot.rotation.y = u.uHead.value;
    headPivot.rotation.x = u.uPitchHead.value;

    const b = u.uBreath.value;
    chest.scale.set(baseChestScale.x*(1+b*.012), baseChestScale.y*(1+b*.018), baseChestScale.z*(1+b*.012));
    shoulderPivot.position.y = .29 + b*.003;

    const k = u.uBright.value, pulse = u.uPulse.value;
    bodyMat.color.setRGB(.86*k,.90*k,.98*k);
    jointMat.color.setRGB(.58*k,.64*k,.80*k);
    const eyeI = .6+pulse*.9;
    eyeMat.color.setRGB(.35+eyeI*.45,.70+eyeI*.24,1.0);
    glowMat.color.setRGB(.10+pulse*.30,.42+pulse*.28,1.0);

    const op = u.uIntro.value;
    for(let i=0;i<mats.length;i++) mats[i].opacity = op;
  }

  return { group:outer, mesh, u, applyPose };
}
const character = createRobot();
scene.add(character.group);

/* lights — the robot is lit for real, cursor nudges the blue key light */
const keyLight = new THREE.DirectionalLight(0xcfe0ff,1.15); keyLight.position.set(.6,.9,1.3); scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x2d7bff,1.5); rimLight.position.set(-.9,.35,-1.0); scene.add(rimLight);
const ambLight = new THREE.AmbientLight(0x3a5580,.6); scene.add(ambLight);

/* ─────────── 3. ENERGY RINGS ─────────── */
const ringVS = `varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const ringFS = `
  precision highp float;
  uniform float uTime,uR,uW,uInt,uRot,uMode,uWaveT,uDash;
  uniform vec3 uCol,uHot;
  varying vec2 vP;
  void main(){
    float len=length(vP), ang=atan(vP.y,vP.x);
    float d=abs(len-uR);
    if(d>uW*70.) discard;
    float core=exp(-pow(d/uW,2.0));
    float glow=exp(-d/(uW*11.0))*0.30 + exp(-d/(uW*45.0))*0.10;
    float a=ang-uRot;
    float comet=pow(0.5+0.5*cos(a),9.0);
    float tail =pow(0.5+0.5*cos(a+0.55),3.0)*0.35;
    float dash = smoothstep(0.30,0.55,sin((ang-uRot*0.6)*uDash)*0.5+0.5);
    float pulse=0.86+0.14*sin(uTime*1.6);
    float body = mix(0.30+0.70*(comet+tail), 0.15+0.85*dash, uMode);
    float I=(core*body*1.05 + glow*(0.35+comet*1.1+dash*uMode*0.5))*pulse*uInt;
    // occasional energy wave rolling outward
    float wr=uR*(1.0+0.30*uWaveT); float wd=abs(len-wr);
    float wave=exp(-pow(wd/(uW*2.6),2.0))*pow(1.0-uWaveT,2.0)*0.55*uInt;
    vec3 c=mix(uCol,uHot,clamp(core*comet*1.2,0.,1.));
    gl_FragColor=vec4(c*(I+wave),1.0);
  }`;
function makeRing(R,mode){
  const S=R*1.6;
  const m=new THREE.ShaderMaterial({ ...ADD, vertexShader:ringVS, fragmentShader:ringFS, depthTest:true,
    uniforms:{ uTime, uR:{value:R}, uW:{value:R*0.0065}, uInt:{value:1}, uRot:{value:0}, uMode:{value:mode}, uWaveT:{value:0.5}, uDash:{value:mode?90:0}, uCol:{value:BLUE}, uHot:{value:ICE} } });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(S*2,S*2),m); mesh.renderOrder=2; mesh.frustumCulled=false;
  return mesh;
}
function makePoints(count,vs,fs,uniforms,seedFn,extraAttr){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));
  const seed=new Float32Array(count*4); for(let i=0;i<count;i++){ const s=seedFn(i); seed.set(s,i*4); }
  g.setAttribute('aSeed',new THREE.BufferAttribute(seed,4));
  if(extraAttr){ const a=new Float32Array(count); for(let i=0;i<count;i++) a[i]=extraAttr(i); g.setAttribute('aSize',new THREE.BufferAttribute(a,1)); }
  const m=new THREE.ShaderMaterial({ ...ADD, vertexShader:vs, fragmentShader:fs, uniforms, depthTest:true });
  const p=new THREE.Points(g,m); p.frustumCulled=false; return p;
}
const dotFS=`precision highp float; varying float vA; uniform vec3 uCol;
  void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard;
    float g=exp(-d*d*22.0); float core=exp(-d*d*120.0);
    gl_FragColor=vec4(uCol*(g*.8+core*1.4)*vA,1.0); }`;
const PX = {value:1};
const orbitVS=`attribute vec4 aSeed; attribute float aSize; uniform float uTime,uR,uSpeed,uPx; varying float vA;
  void main(){
    float ang=aSeed.x*6.2831853 + uTime*uSpeed*(0.55+aSeed.y*0.9);
    float r=uR*(1.0+(aSeed.z-.5)*0.045);
    vec3 p=vec3(cos(ang)*r,sin(ang)*r,(aSeed.w-.5)*0.07);
    vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
    gl_PointSize=aSize*uPx*(${CAMZ.toFixed(1)}/-mv.z);
    vA=(0.55+0.45*sin(uTime*2.0+aSeed.x*40.0))*(0.35+aSeed.y*.65);
  }`;
const sparkVS=`attribute vec4 aSeed; uniform float uTime,uR,uPx; varying float vA;
  void main(){
    float cyc=uTime*(0.35+aSeed.y*0.5)+aSeed.x; float life=fract(cyc); float id=floor(cyc);
    float h=fract(sin((id+aSeed.z*97.0)*12.9898)*43758.5453);
    float ang=h*6.2831853; vec2 dir=vec2(cos(ang),sin(ang)); vec2 j=vec2(cos(h*41.0),sin(h*33.0));
    vec3 p=vec3(dir*uR*(1.0+(fract(h*7.0)-.5)*0.03)+(dir*.3+j*.7)*life*0.10,(fract(h*3.1)-.5)*0.06);
    vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
    float on=step(life,0.22);
    vA=on*pow(1.0-life/0.22,1.5)*(0.6+0.4*sin(life*180.0+aSeed.w*9.0));
    gl_PointSize=mix(7.0,2.0,life/0.22)*uPx*(${CAMZ.toFixed(1)}/-mv.z);
  }`;

const rand=Math.random;
const ringGroup=new THREE.Group(); ringGroup.rotation.order='ZXY';
const floorGroup=new THREE.Group(); floorGroup.rotation.order='ZXY';
scene.add(ringGroup,floorGroup);
const ringA=makeRing(1,0);         // main neon orbit
const ringB=makeRing(1,1);         // faint outer, dashed, counter-rotating
ringB.material.uniforms.uInt.value=.42; ringB.material.uniforms.uW.value=.004;
ringGroup.add(ringA);
floorGroup.add(ringB);
const nOrbit=coarse?70:150, nSpark=coarse?14:30;
const orbitU={uTime,uR:{value:1},uSpeed:{value:.11},uPx:PX,uCol:{value:BLUE}};
const orbit=makePoints(nOrbit,orbitVS,dotFS,orbitU,()=>[rand(),rand(),rand(),rand()],()=>1.4+rand()*3.2); orbit.renderOrder=3;
const sparkU={uTime,uR:{value:1},uPx:PX,uCol:{value:ICE}};
const sparks=makePoints(nSpark,sparkVS,dotFS,sparkU,()=>[rand()*10,rand(),rand(),rand()]); sparks.renderOrder=3;
ringGroup.add(orbit,sparks);
const orbit2U={uTime,uR:{value:1},uSpeed:{value:-.06},uPx:PX,uCol:{value:BLUE}};
const orbit2=makePoints(coarse?24:55,orbitVS,dotFS,orbit2U,()=>[rand(),rand(),rand(),rand()],()=>1.2+rand()*2.2); orbit2.renderOrder=3;
floorGroup.add(orbit2);

/* dust — background / foreground layers (GPU-driven, wraps forever) */
const dustVS=`attribute vec4 aSeed; attribute float aSize; uniform float uTime,uPx,uScroll,uPar,uSpeed; uniform vec2 uBox; uniform float uZ; varying float vA;
  void main(){
    vec3 p;
    p.x=(aSeed.x-.5)*uBox.x + sin(uTime*.12+aSeed.w*30.0)*0.05;
    p.y=mod(aSeed.y*uBox.y + uTime*uSpeed*(0.4+aSeed.w) + uScroll*uPar, uBox.y)-uBox.y*.5;
    p.z=uZ+(aSeed.z-.5)*0.5;
    vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
    gl_PointSize=aSize*uPx*(${CAMZ.toFixed(1)}/-mv.z);
    vA=(0.35+0.65*sin(uTime*(.6+aSeed.w)+aSeed.x*50.0)*.5+.325)*smoothstep(0.,.15,fract(p.y/uBox.y+.5))*smoothstep(1.,.85,fract(p.y/uBox.y+.5));
  }`;
function makeDust(n,z,size,speed,par,alpha){
  const u={uTime,uPx:PX,uScroll:{value:0},uPar:{value:par},uSpeed:{value:speed},uBox:{value:new THREE.Vector2(6,4)},uZ:{value:z},uCol:{value:new THREE.Color(.22,.5,1).multiplyScalar(alpha)}};
  const p=makePoints(n,dustVS,dotFS,u,()=>[rand(),rand(),rand(),rand()],()=>size*(.5+rand())); return p;
}
const dustBack=makeDust(coarse?80:200,-1.4,2.2,.02,.5,.9); dustBack.renderOrder=0;
const dustMid =makeDust(coarse?40:100,-.2,2.8,.03,.9,1.0); dustMid.renderOrder=0;
const dustFront=makeDust(coarse?10:26,1.6,6.5,.05,2.0,.55); dustFront.renderOrder=4;
scene.add(dustBack,dustMid,dustFront);

/* ─────────── layout ─────────── */
const L = { W:1,H:1,viewW:1,viewH:1,mobile:false,charH:1,bottom:0,x:0,ringY:0,floorY:0,baseR:1,head:new THREE.Vector3() };
function layout(){
  const W=stage.clientWidth, H=stage.clientHeight;
  const dpr=Math.min(devicePixelRatio||1, coarse?1.5:2);
  renderer.setPixelRatio(dpr); renderer.setSize(W,H,false);
  PX.value=dpr;
  camera.aspect=W/H; camera.updateProjectionMatrix();
  L.W=W;L.H=H;
  L.viewH=2*CAMZ*Math.tan(FOV*RAD/2); L.viewW=L.viewH*camera.aspect;
  L.mobile = W<=820;
  let charH = L.mobile ? L.viewH*.70 : L.viewH*1.02;
  if(L.mobile) charH=Math.min(charH, L.viewW*1.06/ASPECT);
  L.charH=charH;
  L.bottom = -L.viewH*.5 - (L.mobile? L.viewH*.02 : L.viewH*.09);
  L.x = L.mobile ? 0 : L.viewW*.035;
  L.baseR = L.mobile ? L.viewW*.50 : Math.min(L.viewH*.37, L.viewW*.26);
  const m=character.mesh; m.scale.setScalar(charH); m.position.y=charH/2;
  character.group.position.set(L.x,L.bottom,0);
  L.ringY = L.bottom + charH*.40; L.floorY = L.bottom + charH*.20;
  ringA.scale.setScalar(L.baseR); ringA.material.uniforms.uR.value=1;    // ring built at unit radius, scaled by mesh
  ringB.scale.setScalar(L.baseR*1.24);
  [orbitU,orbit2U,sparkU].forEach(u=>u.uR.value=1);
  orbit.scale.setScalar(L.baseR); sparks.scale.setScalar(L.baseR); orbit2.scale.setScalar(L.baseR*1.24);
  ringA.material.uniforms.uW.value=.0058*(L.mobile?1.3:1);
  ringB.material.uniforms.uW.value=.0048;
  [dustBack,dustMid,dustFront].forEach(d=>d.material.uniforms.uBox.value.set(L.viewW*1.6,L.viewH*1.5));
  // head screen position (for the cursor→character particle flow)
  camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  L.head.set(L.x, L.bottom+charH*.80, 0).project(camera);
}
addEventListener('resize',layout); layout();

/* ─────────── springs ─────────── */
class Spring{ constructor(k,c){this.k=k;this.c=c;this.x=0;this.v=0;this.t=0}
  step(dt){ const n=Math.max(1,Math.ceil(dt/.006)), h=dt/n; for(let i=0;i<n;i++){ this.v+=((this.t-this.x)*this.k-this.v*this.c)*h; this.x+=this.v*h; } return this.x; } }
const sBody=new Spring(13,5.4), sShoulder=new Spring(17,6), sHead=new Spring(24,7.2), sPitchH=new Spring(24,7.2), sPitchB=new Spring(14,5.6);
const sRingX=new Spring(6,3.6), sRingY=new Spring(6,3.6);

/* ─────────── 4. MAGIC CURSOR (2D) — DISABLED: native cursor only per user request ─────────── */
const cv=$('#cursor'), cx=cv.getContext('2d');
if(cv) cv.style.display='none';
let CW=0,CH=0,cdpr=1;
function sizeCursor(){}
addEventListener('resize',sizeCursor);
const aura={x:-200,y:-200,e:0,ring:0,hover:0,init:false,last:{x:0,y:0}};
const parts=[]; const MAXP = coarse?70:170;
document.addEventListener('pointerover',e=>{ aura.hoverT = !!e.target.closest('a,button,.xp,.skc,.skn,.ski,.pj-slot,.pj-arr,.ct-social a,.ct-mail,.ct-send,.ct-cta,.ct-top'); });
function emit(x,y,vx,vy,n){
  for(let i=0;i<n&&parts.length<MAXP;i++){
    const a=Math.random()*6.283, r=Math.random()*10;
    // flow: mostly along the cursor's own motion, with a light pull toward the character
    const hx=(L.head.x*.5+.5)*CW, hy=(-L.head.y*.5+.5)*CH;
    const dx=hx-x, dy=hy-y, dl=Math.hypot(dx,dy)||1;
    parts.push({ x:x+Math.cos(a)*r, y:y+Math.sin(a)*r,
      vx:vx*.035+Math.cos(a)*.35+dx/dl*.12, vy:vy*.035+Math.sin(a)*.35+dy/dl*.12 - .06,
      life:0, max:.8+Math.random()*1.0, s:.5+Math.random()*1.3 });
  }
}
function drawArrow(x,y,a){
  cx.save(); cx.translate(x,y); cx.globalCompositeOperation='source-over';
  cx.shadowColor='rgba(60,140,255,.95)'; cx.shadowBlur=14;
  cx.beginPath(); cx.moveTo(0,0); cx.lineTo(0,17); cx.lineTo(4.4,13); cx.lineTo(7.4,19.6); cx.lineTo(10,18.4); cx.lineTo(7.1,12); cx.lineTo(12.5,11.6); cx.closePath();
  cx.fillStyle=`rgba(190,222,255,${.55+.45*a})`; cx.fill(); cx.shadowBlur=0; cx.lineWidth=1; cx.strokeStyle='rgba(45,123,255,.9)'; cx.stroke(); cx.restore();
}
function arc(x,y,r,a0,a1){ cx.beginPath(); cx.arc(x,y,r,a0,a1); cx.stroke(); }
function drawCursor(t,dt){ return;
  cx.clearRect(0,0,CW,CH);
  if(!input.hasPointer && !parts.length) return;
  if(!aura.init && input.px>-900){ aura.x=input.px; aura.y=input.py; aura.init=true; }
  const dx=input.px-aura.x, dy=input.py-aura.y;
  aura.x+=dx*(1-Math.exp(-dt*16)); aura.y+=dy*(1-Math.exp(-dt*16));
  const sp=Math.hypot(input.px-aura.last.x,input.py-aura.last.y)/Math.max(dt,.001);   // px/s
  const vx=(input.px-aura.last.x)/Math.max(dt,.001), vy=(input.py-aura.last.y)/Math.max(dt,.001);
  aura.last.x=input.px; aura.last.y=input.py;
  const target=clamp(sp/1400,0,1);
  aura.e = target>aura.e ? damp(aura.e,target,18,dt) : damp(aura.e,0,1.5,dt);   // bright on move → slow fade to idle
  aura.hover = damp(aura.hover, aura.hoverT?1:0, 8, dt);
  const e=aura.e, idle=.16+.06*Math.sin(t*1.7);
  const P = clamp(idle+e*.95,0,1.2);
  const gx=aura.x, gy=aura.y;
  const on = coarse ? (input.down?1:0) : 1;
  if(coarse){ aura._c = damp(aura._c||0,on,6,dt); } const K = coarse?(aura._c||0):1;

  cx.globalCompositeOperation='lighter';
  if(K>0.01){
    // soft aura
    const R=(70+e*70+aura.hover*20)*1;
    let g=cx.createRadialGradient(gx,gy,0,gx,gy,R);
    g.addColorStop(0,`rgba(70,140,255,${.34*P*K})`); g.addColorStop(.35,`rgba(30,90,255,${.14*P*K})`); g.addColorStop(1,'rgba(20,60,255,0)');
    cx.fillStyle=g; cx.fillRect(gx-R,gy-R,R*2,R*2);
    // rings
    cx.lineCap='round';
    const r1=13+e*7+aura.hover*8, r2=24+e*12+aura.hover*10, r3=39+e*20+aura.hover*12;
    cx.lineWidth=1.3; cx.strokeStyle=`rgba(90,160,255,${(.55+e*.4)*K})`; cx.shadowColor='rgba(45,123,255,.9)'; cx.shadowBlur=12;
    arc(gx,gy,r1,0,6.283);
    cx.lineWidth=1; cx.strokeStyle=`rgba(90,160,255,${(.22+e*.35)*K})`;
    cx.setLineDash([10,7,3,9]); cx.lineDashOffset=-t*30; arc(gx,gy,r2,0,6.283);
    cx.setLineDash([2,12]); cx.lineDashOffset=t*22; cx.strokeStyle=`rgba(130,190,255,${(.15+e*.4)*K})`; arc(gx,gy,r3,0,6.283); cx.setLineDash([]);
    // energy arcs (only while moving)
    if(e>.12){
      cx.strokeStyle=`rgba(170,215,255,${e*.85*K})`; cx.lineWidth=1;
      for(let k=0;k<3;k++){
        const a0=t*(1.4+k*.7)+k*2.1, span=.5+Math.random()*.5;
        cx.beginPath();
        for(let i=0;i<=8;i++){ const a=a0+span*i/8, rr=r2+ (Math.random()-.5)*10*e + 6*Math.sin(i*1.7+t*9); const px=gx+Math.cos(a)*rr, py=gy+Math.sin(a)*rr; i?cx.lineTo(px,py):cx.moveTo(px,py); }
        cx.stroke();
      }
    }
    cx.shadowBlur=0;
    // core
    g=cx.createRadialGradient(gx,gy,0,gx,gy,10); g.addColorStop(0,`rgba(200,230,255,${.5*P*K})`); g.addColorStop(1,'rgba(45,123,255,0)');
    cx.fillStyle=g; cx.fillRect(gx-10,gy-10,20,20);
    // emit trail
    if(e>.02){ aura._acc=(aura._acc||0)+dt*(10+e*120); const n=Math.floor(aura._acc); aura._acc-=n; if(n) emit(gx,gy,vx,vy,n); }
  }
  // particles
  for(let i=parts.length-1;i>=0;i--){
    const p=parts[i]; p.life+=dt; if(p.life>p.max){ parts.splice(i,1); continue; }
    p.x+=p.vx*dt*60; p.y+=p.vy*dt*60; p.vx*=.985; p.vy*=.985;
    const k=1-p.life/p.max, a=k*k*.6;
    const g=cx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.s*4);
    g.addColorStop(0,`rgba(190,225,255,${a})`); g.addColorStop(.35,`rgba(60,130,255,${a*.6})`); g.addColorStop(1,'rgba(30,80,255,0)');
    cx.fillStyle=g; cx.fillRect(p.x-p.s*4,p.y-p.s*4,p.s*8,p.s*8);
  }
  cx.globalCompositeOperation='source-over';
  if(!coarse) drawArrow(input.px,input.py,clamp(e+.3,0,1));
}

/* ─────────── 5. LOOP ─────────── */
const el={ intro:$('#intro'), explore:$('#explore'), cue:$('#cue'), demo:$('#demo'), halo:$('#halo'), fog:$('#fog') };
let visible=true; new IntersectionObserver(([e])=>visible=e.isIntersecting,{threshold:0}).observe(stage);
let sp=0, intro=0, started=false, last=performance.now(), T=0, waveClock=0, pmx=0, pmy=0;
const Lvec=new THREE.Vector3();

function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min((now-last)/1000,.05); last=now; T+=dt*MOTION;
  uTime.value=T;

  /* pointer → smoothed */
  input.x=damp(input.x,input.tx,9,dt); input.y=damp(input.y,input.ty,9,dt);
  const mx=input.x, my=input.y;

  drawCursor(now/1000,dt);
  if(!visible) return;

  /* intro reveal */
  if(started) intro=Math.min(1,intro+dt/2.8);
  const introE=easeOut(intro);

  /* scroll choreography (0 → 1 over the first ~75% of viewport height) */
  const raw=clamp(scrollY/(innerHeight*.72),0,1);
  sp=damp(sp,raw,5.5,dt);
  const p=easeOut(sp), pulse=Math.sin(Math.PI*clamp(sp,0,1));

  /* character pose — springs (spec: body ≈ 8°·x, 4°·y) */
  const idleY = Math.sin(T*.31)*.6*RAD*MOTION;
  sBody.t     = mx*8*RAD + idleY;
  sShoulder.t = mx*3.2*RAD;
  sHead.t     = mx*9*RAD + Math.sin(T*.23+1)*.8*RAD*MOTION;
  sPitchH.t   = -my*6.5*RAD + Math.sin(T*.4)*.5*RAD*MOTION;   // cursor up → chin rises
  sPitchB.t   = -my*2.2*RAD;
  const u=character.u;
  u.uBody.value=sBody.step(dt); u.uShoulder.value=sShoulder.step(dt); u.uHead.value=sHead.step(dt);
  u.uPitchHead.value=sPitchH.step(dt); u.uPitchBody.value=sPitchB.step(dt);
  u.uBreath.value=Math.sin(T*.95)*(reduce?.5:1);
  u.uSway.value=reduce?.3:1;
  // cursor drives a blue key light on the figure
  Lvec.set(mx*.9,my*.7+.15,.75); u.uLight.value.lerp(Lvec,1-Math.exp(-dt*5));
  u.uBright.value=lerp(.82,1.04,p)*(1+pulse*.04);
  u.uPulse.value=pulse*.8 + (.05+.03*Math.sin(T*1.3));
  u.uIntro.value=introE;
  character.applyPose();
  keyLight.position.set(mx*1.1+.4, my*.8+.9, 1.3);
  rimLight.position.set(mx*-.6-.6, my*.4+.35, -1.0);

  /* character entering the scene: forward, larger, brighter */
  const g=character.group;
  g.position.z = lerp(-.38,.32,p);
  g.scale.setScalar(lerp(.965,1.0,p));
  g.position.y = L.bottom + lerp(-L.viewH*.02,0,p);
  g.position.x = L.x + mx*.02*L.viewW*.5;
  // camera parallax → real depth between layers
  camera.position.x=damp(camera.position.x,mx*.20,4,dt); camera.position.y=damp(camera.position.y,my*.10,4,dt);
  camera.lookAt(0,0,0);

  /* rings: continuous spin + orbit + precession, react to pointer, expand on scroll */
  waveClock=(waveClock+dt/10)%1;
  const rs=lerp(1,1.2,p), ri=lerp(1,1.14,p)+pulse*.35;
  sRingX.t=mx*.10*L.viewW*.5; sRingY.t=my*.05*L.viewH*.5;
  const rx=sRingX.step(dt), ry=sRingY.step(dt);
  ringGroup.position.set(L.x+rx*.6, L.ringY+ry*.6, lerp(-.15,.05,p));
  ringGroup.rotation.set(-1.30+Math.sin(T*.19)*.04, Math.sin(T*.11)*.06, -.16+Math.sin(T*.13)*.035);
  ringGroup.scale.setScalar(rs);
  floorGroup.position.set(L.x+rx*.35, L.floorY+ry*.3, lerp(-.1,.05,p));
  floorGroup.rotation.set(-1.43+Math.sin(T*.17+2)*.03, 0, .05+Math.sin(T*.1)*.02);
  floorGroup.scale.setScalar(lerp(1,1.14,p));
  const TAU=Math.PI*2;
  const uA=ringA.material.uniforms, uB=ringB.material.uniforms;
  uA.uRot.value = (T/22)*TAU;                 // 360° / 22s
  uB.uRot.value = -(T/36)*TAU;                // 360° / 36s reverse
  uA.uInt.value=ri*introE; uB.uInt.value=.42*lerp(1,1.4,p)*introE;
  uA.uWaveT.value=waveClock; uB.uWaveT.value=(waveClock+.5)%1;
  orbitU.uSpeed.value=(TAU/22)*.9; orbit2U.uSpeed.value=-(TAU/36)*.9;
  orbitU.uCol.value.setRGB(.10+pulse*.1,.44+pulse*.1,1);

  /* dust parallax */
  const sy=scrollY/innerHeight;
  dustBack.material.uniforms.uScroll.value=sy*.6; dustMid.material.uniforms.uScroll.value=sy*1.0; dustFront.material.uniforms.uScroll.value=sy*2.2;
  dustBack.position.set(-mx*.10,-my*.05,0); dustMid.position.set(-mx*.20,-my*.10,0); dustFront.position.set(-mx*.55,-my*.30,0);
  [[dustBack,.9],[dustMid,1],[dustFront,.55]].forEach(([d,k])=>d.material.uniforms.uCol.value.setRGB(.22*k*introE*(1+pulse*.5),.5*k*introE*(1+pulse*.5),1*k*introE*(1+pulse*.5)));

  /* DOM layers */
  el.intro.style.opacity = lerp(.72,1,p);   // dim → full (CSS reveal handles first paint)
  el.intro.style.transform = `translate3d(${lerp(L.mobile?-8:-26,0,p)}px,0,0)`;
  el.halo.style.opacity = (.55+.45*p + pulse*.5)*introE;
  el.halo.style.transform = `translate3d(${-mx*14+(L.x/L.viewW)*L.W*.5}px,${my*8}px,0) scale(${lerp(.9,1.12,p)+pulse*.08})`;
  el.fog.style.transform = `translate3d(${-mx*10}px,${-my*6 - scrollY*.08}px,0)`;
  el.explore.style.setProperty('--fade',String(1-p*.55));
  el.cue.style.setProperty('--cue',String((1-clamp(raw*4,0,1)) * (started&&T>3?1:0)));
  // direction hints
  const th=.28;
  hints.right.classList.toggle('active',mx>th); hints.left.classList.toggle('active',mx<-th);
  hints.up.classList.toggle('active',my>th);   hints.down.classList.toggle('active',my<-th);

  renderer.render(scene,camera);
}

/* wait for textures, then begin */
document.body.classList.add('ready'); started=true;
requestAnimationFrame(frame);
}  /* end main() */


/* ═══════════════════════════════════════════════════════════════════
   SCENE 2 — ABOUT + EXPERIENCE : the particle laptop
   • one THREE.Points cloud (ShaderMaterial, all motion on the GPU)
   • formation / dissolve is driven by scroll, smoothed with a spring
   • screen particles are sampled from a 2D canvas → text morphs per experience
   ═══════════════════════════════════════════════════════════════════ */
function initAbout(){
  const sec=$('#about'), vis=$('#aVisual'), cvs=$('#gl2'), glowEl=$('#aGlow'), hint=$('#aHint');
  const tl=$('#tl'), items=[...tl.querySelectorAll('.xp')], pulseEl=$('#tlPulse'), fillEl=$('#tlFill');
  const { experiences:exps, profile } = window.PORTFOLIO;
  let rd;
  try{ rd=new THREE.WebGLRenderer({canvas:cvs,antialias:false,alpha:true,powerPreference:'high-performance'}); }catch(err){ return; }
  rd.setClearColor(0x000000,0);
  const scene=new THREE.Scene(), CAM=8, FOV2=30;
  const camera=new THREE.PerspectiveCamera(FOV2,1,.1,80);
  const R=Math.random, TAU=Math.PI*2;
  const PXU={value:1}, TIME={value:0};
  const ADD2={ blending:THREE.CustomBlending, blendEquation:THREE.AddEquation, blendSrc:THREE.OneFactor, blendDst:THREE.OneFactor,
               blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor, transparent:true, depthWrite:false, depthTest:false };
  const BLUEc=new THREE.Color(.10,.44,1), ICEc=new THREE.Color(.66,.84,1);

  const small = coarse || innerWidth<=820;
  const mult = small ? .42 : 1;

  /* ───────── laptop geometry (local space, centred) ───────── */
  const ANG=10*RAD, cA=Math.cos(ANG), sA=Math.sin(ANG), YO=.85;
  const NT=Math.round(7200*mult);               // screen-text particles
  const L=[];                                    // x,y,z,group,size,bright,phase
  const P=(g,x,y,z,size,br,ph=0)=>L.push(x,y,z,g,size,br,ph);
  const scr=(s,t)=>[s, t*cA-YO, -1-t*sA];
  const perim=(u0,u1,v0,v1,n,cb)=>{ const w=u1-u0,h=v1-v0,Lp=2*(w+h);
    for(let i=0;i<n;i++){ let d=R()*Lp,u,v; if(d<w){u=u0+d;v=v0}else if((d-=w)<h){u=u1;v=v0+d}else if((d-=h)<w){u=u1-d;v=v1}else{d-=w;u=u0;v=v1-d} cb(u+(R()-.5)*.008,v+(R()-.5)*.008); } };
  const n=(x)=>Math.max(1,Math.round(x*mult));

  for(let i=0;i<NT;i++) P(0,0,0,0,1.0,.8);                                  // G0 screen text (filled later)
  for(let i=0;i<n(900);i++){ const [x,y,z]=scr((R()-.5)*2.8,.1+R()*1.7); P(1,x,y,z,1.2,.3); }   // G1 screen fill
  perim(-1.5,1.5,0,1.9,n(1000),(u,v)=>{ const [x,y,z]=scr(u,v); P(2,x,y,z,1.8,1.15); });          // G2 bezel
  perim(-1.42,1.42,.08,1.82,n(480),(u,v)=>{ const [x,y,z]=scr(u,v); P(2,x,y,z,1.4,.6); });
  perim(-1.5,1.5,0,1.9,n(380),(u,v)=>{ const [x,y,z]=scr(u,v); P(2,x,y-.05*cA,z+.05*sA*-1,1.4,.4); });
  for(let i=0;i<n(140);i++){ const [x,y,z]=scr((R()-.5)*3,0); P(2,x,y,z,1.8,.7); }                // hinge
  perim(-1.5,1.5,-1,1,n(900),(u,v)=>P(3,u,-YO,v,1.7,1.05));                                     // G3 base top edge
  perim(-1.5,1.5,-1,1,n(560),(u,v)=>P(3,u,-YO-.09,v,1.4,.65));
  for(let c=0;c<4;c++){ const cx=c&1?1.5:-1.5, cz=c&2?1:-1; for(let i=0;i<n(26);i++) P(3,cx,-YO-R()*.09,cz,1.4,.5); }
  for(let i=0;i<n(300);i++){ const side=R()*4|0; let x,z; if(side<2){x=(R()-.5)*3;z=side?1:-1}else{z=(R()-.5)*2;x=side===2?-1.5:1.5} P(3,x,-YO-R()*.09,z,1.2,.22); }
  for(let i=0;i<n(140);i++) P(3,(R()-.5)*3,-YO,(R()-.5)*2,1.2,.16);                              // deck fill
  const key=(cx,cz,w,h)=>{ const k=n(24); for(let i=0;i<k;i++){ const q=R()*2*(w+h); let x,z; if(q<w){x=-w/2+q;z=-h/2}else if(q<w+h){x=w/2;z=-h/2+q-w}else if(q<2*w+h){x=w/2-(q-w-h);z=h/2}else{x=-w/2;z=h/2-(q-2*w-h)} P(4,cx+x,-YO,cz+z,1.5,1.2,R()); } for(let q2=0;q2<n(3);q2++) P(4,cx+(R()-.5)*w*.4,-YO,cz+(R()-.5)*h*.4,1.2,.6,R()); };
  for(let r=0;r<5;r++){ const z=-.8+r*.2; if(r<4){ for(let c=0;c<14;c++) key(-1.3+c*.2,z,.16,r===0?.11:.16); } else { for(let c=0;c<3;c++) key(-1.3+c*.2,z,.16,.16); for(let c=11;c<14;c++) key(-1.3+c*.2,z,.16,.16); key(.15,z,1.5,.16); key(.15,z,1.5,.16); } }   // G4 keyboard
  perim(-.55,.55,.36,.9,n(300),(u,v)=>P(5,u,-YO,v,1.6,1.05));                                     // G5 trackpad
  for(let i=0;i<n(110);i++) P(5,(R()-.5)*1.06,-YO,.38+R()*.5,1.2,.2);
  for(let i=0;i<n(650);i++){ const ring=R()*3|0, rr=1.95+ring*.55+R()*.28, th=R()*TAU; P(6,Math.cos(th)*rr,(R()-.5)*1.5,Math.sin(th)*rr,1.5,.5,R()); }   // G6 halo
  // G7 holographic code panels (floating, sampled from a canvas)
  const panels=[ {x:-2.05,y:1.0,z:.3,ry:.5,lines:["npm run build","git commit -m ship","deploy → ok"]},
                 {x:2.1,y:.55,z:-.2,ry:-.6,lines:["</>","{ api }","01101 0110"]},
                 {x:.3,y:1.32,z:-1.1,ry:0,lines:["const ui = () =>","  render(scene)","// 60 fps"]} ];
  const PN=n(300);
  const holoStart=L.length/7;
  panels.forEach((pn,pi)=>{
    const c=document.createElement('canvas'); c.width=220; c.height=90; const x=c.getContext('2d');
    x.font='600 17px ui-monospace,Menlo,Consolas,monospace'; x.textBaseline='top'; x.fillStyle='#fff';
    pn.lines.forEach((ln,li)=>{ x.globalAlpha=li===0?1:.6; x.fillText(ln,6,8+li*26); });
    const s=sampleCanvas(c,PN);
    for(let k=0;k<PN;k++){ const px=(s[k*3]/220-.5)*1.9, py=(.5-s[k*3+1]/90)*.78; const cy=Math.cos(pn.ry), sy=Math.sin(pn.ry);
      P(7,pn.x+px*cy,pn.y+py,pn.z-px*sy,1.1,.75*s[k*3+2],pi/3+R()*.02); }
  });
  const N=L.length/7;

  const aTarget=new Float32Array(N*3), aTarget2=new Float32Array(N*3), aScatter=new Float32Array(N*3), aSeed=new Float32Array(N*4), aMeta=new Float32Array(N*4);
  for(let i=0;i<N;i++){
    const o=i*7; aTarget[i*3]=L[o]; aTarget[i*3+1]=L[o+1]; aTarget[i*3+2]=L[o+2];
    const far=R()<.78;
    aScatter[i*3]=-6+R()*15; aScatter[i*3+1]=-5+R()*11; aScatter[i*3+2]=far? -16+R()*11 : 2+R()*4;
    aSeed[i*4]=R(); aSeed[i*4+1]=R(); aSeed[i*4+2]=R(); aSeed[i*4+3]=R();
    aMeta[i*4]=L[o+3]; aMeta[i*4+1]=L[o+4]; aMeta[i*4+2]=L[o+5]; aMeta[i*4+3]=L[o+6];
  }
  aTarget2.set(aTarget);

  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));
  const attT=new THREE.BufferAttribute(aTarget,3), attT2=new THREE.BufferAttribute(aTarget2,3), attM=new THREE.BufferAttribute(aMeta,4);
  geo.setAttribute('aTarget',attT); geo.setAttribute('aTarget2',attT2); geo.setAttribute('aMeta',attM);
  geo.setAttribute('aScatter',new THREE.BufferAttribute(aScatter,3)); geo.setAttribute('aSeed',new THREE.BufferAttribute(aSeed,4));

  const U={
    uTime:TIME, uPx:PXU, uForm:{value:0}, uMix:{value:1}, uReactT:{value:1}, uMagnet:{value:0}, uAmp:{value:reduce?.4:1},
    uAspect:{value:1}, uCam:{value:CAM}, uGlobal:{value:1}, uSizeK:{value:1},
    uStart:{value:[0,.06,.2,.34,.46,.58,.66,.72]},
    uZone:{value:new THREE.Vector3()}, uKb:{value:new THREE.Vector3(0,0,-100)}, uTp:{value:new THREE.Vector3(0,0,-100)}, uMouse:{value:new THREE.Vector2(9,9)},
    uCol:{value:BLUEc}, uHotCol:{value:ICEc}
  };
  const lapMat=new THREE.ShaderMaterial({ ...ADD2, uniforms:U,
    vertexShader:/* glsl */`
      attribute vec3 aTarget,aTarget2,aScatter; attribute vec4 aSeed,aMeta;
      uniform float uTime,uForm,uMix,uPx,uReactT,uMagnet,uAmp,uAspect,uCam,uGlobal,uSizeK; uniform float uStart[8];
      uniform vec3 uZone,uKb,uTp; uniform vec2 uMouse;
      varying float vI,vHot;
      const float PI=3.14159265; const float SA=${sA.toFixed(5)}; const float CA=${cA.toFixed(5)};
      vec3 rotY(vec3 p,float a){ float c=cos(a),s=sin(a); return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z); }
      vec3 rotZ(vec3 p,float a){ float c=cos(a),s=sin(a); return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z); }
      float sq(float x){ return x*x; }
      float easeBack(float x){ float c1=1.15,c3=c1+1.,y=x-1.; return 1.+c3*y*y*y+c1*y*y; }
      void main(){
        int gi=int(aMeta.x+.5); vec4 sd=aSeed;
        bool isScr=gi<=1;
        // ── target (screen text morphs between experiences, staggered per particle)
        float m=clamp(uMix*1.5-sd.x*.5,0.,1.); m=m*m*(3.-2.*m);
        vec3 tgt=mix(aTarget,aTarget2,m);
        if(gi==0) tgt+=vec3(sin(sd.y*40.+uTime*2.),cos(sd.z*40.+uTime*2.),sin(sd.w*40.))*.22*sin(m*PI);
        if(gi==6){ float ring=floor(sd.z*3.); float w=ring<.5?.07:(ring<1.5?-.11:.05); tgt=rotZ(rotY(tgt,uTime*w),(ring-1.)*.3); }
        // ── formation: scattered far away → organic curved flight → target
        float f=uForm*1.28;
        float t=clamp((f-uStart[gi]-sd.x*.16)/.34,0.,1.);
        float e=easeBack(t);
        vec3 sc=aScatter+vec3(sin(uTime*.3+sd.y*20.),cos(uTime*.25+sd.z*20.),sin(uTime*.2+sd.w*20.))*.6*uAmp;
        vec3 pos=mix(sc,tgt,e);
        pos+=vec3(sin(sd.y*61.+t*5.),cos(sd.z*47.+t*4.),sin(sd.w*53.+t*6.))*sin(t*PI)*(.8+sd.x*1.2);
        float live=smoothstep(.8,1.,t);
        // ── always alive: wobble, breathing, escapees, floating panels
        float ph=uTime*(.5+sd.x*.8);
        pos+=vec3(sin(ph+sd.y*30.),cos(ph*1.1+sd.z*30.),sin(ph*.9+sd.w*30.))*(.008+.012*sd.x)*uAmp*live;
        pos*=mix(1.,1.+.012*sin(uTime*1.05)*uAmp,live);
        float esc=step(.965,sd.z); float cyc=fract(uTime*.09+sd.w*3.); float ex=sin(cyc*PI); ex*=ex;
        pos+=normalize(vec3(sin(sd.x*99.),cos(sd.y*77.)*.7+.3,sin(sd.w*55.)+.3))*ex*esc*.6*live*uAmp;
        if(gi==7) pos.y+=sin(uTime*.45+aMeta.w*6.28)*.06*uAmp*live;
        // ── brightness + hover reactions
        float bright=aMeta.z; float sz=aMeta.y;
        vec3 sn=vec3(0.,SA,CA);
        if(isScr){
          float flow=pow(.5+.5*sin(pos.x*2.2-uTime*3.5+sd.x*.6),8.);
          bright*=1.+uZone.x*(.7+flow*1.6);
          pos+=sn*uZone.x*(.02+sd.y*.16)*(.5+.5*sin(uTime*2.4+sd.w*30.))*live;
          float band=exp(-sq(((pos.y+YOFF)/1.9-fract(uTime*.11))*9.)); bright+=band*.8;
          if(gi==0) bright*=1.+uZone.x*.45*sin(uTime*9.+pos.y*35.+sd.z*40.);
        }
        float kt=uTime-uKb.z; float kw=exp(-sq((length(pos.xz-uKb.xy)-kt*2.4)*3.2))*exp(-kt*.7)*step(0.,kt);
        if(gi==4){ bright*=1.+uZone.y*.9+kw*2.6; pos.y+=kw*(.04+sd.y*.22)*live; }
        if(gi==3||gi==5) bright+=kw*.8;
        float tt=uTime-uTp.z; vec2 rel=pos.xz-uTp.xy; float td=length(rel);
        float tw=exp(-sq((td-tt*1.9)*4.))*exp(-tt*.9)*step(0.,tt);
        if(gi>=3&&gi<=5){ pos.xz+=rel/(td+1e-3)*tw*.16*live; bright+=tw*2.2; }
        if(gi==5) bright*=1.+uZone.z*1.1;
        // selection kick: a wave sweeps out from the screen
        float rr=uReactT*4.6; float rw=exp(-sq((length(pos.xy-vec2(0.,.1))-rr)*1.5))*pow(1.-uReactT,1.5);
        bright+=rw*1.7; if(gi<=2) pos+=sn*rw*.05;
        // ambient: holographic pulse, floor-energy wave, sparks
        bright*=.92+.08*sin(uTime*.8+pos.y*1.2);
        bright+=exp(-sq((length(pos.xz)-fract(uTime*.12)*3.6)*2.2))*.35*live;
        float spark=step(.988,sd.w)*pow(max(0.,sin(uTime*(2.+sd.x*3.)+sd.y*90.)),24.);
        bright+=spark*3.; sz*=1.+spark*1.6;
        vec4 mv=modelViewMatrix*vec4(pos,1.);
        vec4 cp=projectionMatrix*mv;
        // ── magnetic field (screen-space, distance based, never overshoots)
        vec2 ndc=cp.xy/cp.w; vec2 dm=(uMouse-ndc)*vec2(uAspect,1.);
        float infl=exp(-dot(dm,dm)/(2.*.14*.14))*uMagnet;
        ndc+=(uMouse-ndc)*infl*(.16+.3*sd.x)*live; cp.xy=ndc*cp.w;
        bright*=1.+infl*1.6;
        gl_Position=cp;
        gl_PointSize=sz*uPx*uSizeK*(uCam/max(-mv.z,2.))*(1.+infl*.7);
        vI=bright*mix(.3,1.,e)*uGlobal*.62; vHot=clamp((bright-1.3)*.55,0.,1.);
      }`.replace(/YOFF/g,YO.toFixed(3)),
    fragmentShader:/* glsl */`
      precision highp float; uniform vec3 uCol,uHotCol; varying float vI,vHot;
      void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard;
        float g=exp(-d*d*13.), core=exp(-d*d*70.);
        gl_FragColor=vec4(mix(uCol,uHotCol,vHot)*(g*.7+core*1.4)*vI,1.); }`
  });
  const cloud=new THREE.Points(geo,lapMat); cloud.frustumCulled=false;
  const laptop=new THREE.Group(); laptop.add(cloud); scene.add(laptop);

  /* ───────── screen text: canvas → particle targets ───────── */
  const SW=320, SH=194, scv=document.createElement('canvas'); scv.width=SW; scv.height=SH; const sx=scv.getContext('2d',{willReadFrequently:true});
  function sampleCanvas(cv,cnt){
    const ctx=cv.getContext('2d'), w=cv.width, h=cv.height, d=ctx.getImageData(0,0,w,h).data, px=[];
    for(let j=0;j<h;j++)for(let i=0;i<w;i++){ const a=d[(j*w+i)*4+3]/255; if(a>.12&&R()<Math.min(1,a*1.5)) px.push(i,j,a); }
    const out=new Float32Array(cnt*3), m=px.length/3; if(!m) return out;
    for(let k=0;k<cnt;k++){ const q=(R()*m|0)*3; out[k*3]=px[q]+R()-.5; out[k*3+1]=px[q+1]+R()-.5; out[k*3+2]=px[q+2]; }
    return out;
  }
  function drawScreen(sel){
    sx.clearRect(0,0,SW,SH); sx.textBaseline='top';
    const mono='ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
    const put=(txt,x,y,size,a,w='700')=>{ sx.font=`${w} ${size}px ${mono}`; sx.fillStyle=`rgba(255,255,255,${a})`; sx.fillText(txt,x,y); };
    // window chrome + gutter (abstract, dim)
    [0,1,2].forEach(i=>{ sx.fillStyle='rgba(255,255,255,.5)'; sx.beginPath(); sx.arc(12+i*10,11,2.4,0,TAU); sx.fill(); });
    const wrap=(txt,ind,max)=>{ const out=[]; let cur=''; txt.split(' ').forEach(w=>{ if((cur+' '+w).trim().length>max&&cur){ out.push(cur); cur=' '.repeat(ind)+w; } else cur=cur?cur+' '+w:w; }); out.push(cur); return out; };
    if(sel<0){
      const size=15, max=Math.floor((SW-20)/(size*.6));
      const lines=['const developer = {',...wrap(` role: "${profile.role}",`,9,max),...wrap(` passion: "${profile.passion}",`,10,max),...wrap(` stack: [${profile.stack.map(x=>`"${x}"`).join(', ')}]`,8,max),'};'];
      lines.slice(0,8).forEach((l,i)=>put(l,10,34+i*size*1.4,size,1));
    } else {
      const e=exps[sel]; let hs=15; sx.font=`700 ${hs}px ${mono}`; const head=`// ${String(sel+1).padStart(2,'0')} — ${e.company}`;
      while(sx.measureText(head).width>SW-20&&hs>9){ hs--; sx.font=`700 ${hs}px ${mono}`; }
      put(head,10,34,hs,.9); put(`role: "${e.role}"`,10,54,11,.6); put(`period: "${e.period}"`,10,68,11,.45);
      const tech=e.technologies.slice(0,8), cols=tech.length>4?2:1, per=Math.ceil(tech.length/cols);
      tech.forEach((t,i)=>{ const c=(i/per)|0, r=i%per; let fs=22; sx.font=`700 ${fs}px ${mono}`; while(sx.measureText('› '+t).width>(SW-20)/cols-8&&fs>10){ fs--; sx.font=`700 ${fs}px ${mono}`; }
        put('› '+t,10+c*((SW-16)/cols),88+r*28,fs,1,'700'); });
    }
  }
  function screenTargets(sel){
    drawScreen(sel); const s=sampleCanvas(scv,NT), tg=new Float32Array(NT*3), br=new Float32Array(NT);
    for(let k=0;k<NT;k++){ const [x,y,z]=scr((s[k*3]/SW-.5)*2.8,.1+(1-s[k*3+1]/SH)*1.7); tg[k*3]=x; tg[k*3+1]=y+sA*0; tg[k*3+2]=z; br[k]=.9+1.2*s[k*3+2]; }
    return {tg,br};
  }
  let mixT=1;
  function setScreen(sel){
    const {tg,br}=screenTargets(sel);
    if(U.uMix.value>.5){ aTarget.set(aTarget2.subarray(0,NT*3)); }       // current becomes "from"
    aTarget2.set(tg);
    for(let k=0;k<NT;k++) aMeta[k*4+2]=br[k];
    attT.needsUpdate=attT2.needsUpdate=attM.needsUpdate=true;
    U.uMix.value=0; mixT=0;
  }
  { const {tg,br}=screenTargets(-1); aTarget.set(tg); aTarget2.set(tg); for(let k=0;k<NT;k++) aMeta[k*4+2]=br[k]; }

  /* ───────── ambient layers ───────── */
  const dotFS=`precision highp float; uniform vec3 uCol; varying float vA;
    void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard; gl_FragColor=vec4(uCol*(exp(-d*d*20.)*.75+exp(-d*d*110.)*1.4)*vA,1.); }`;
  const mkPts=(cnt,vs,uni,seedFn,extra)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cnt*3),3));
    const s=new Float32Array(cnt*4); for(let i=0;i<cnt;i++) s.set(seedFn(i),i*4); g.setAttribute('aSeed',new THREE.BufferAttribute(s,4));
    if(extra){ const k=new Float32Array(cnt); for(let i=0;i<cnt;i++) k[i]=extra(i); g.setAttribute('aK',new THREE.BufferAttribute(k,1)); }
    const p=new THREE.Points(g,new THREE.ShaderMaterial({...ADD2,vertexShader:vs,fragmentShader:dotFS,uniforms:uni})); p.frustumCulled=false; return p; };
  // dust — back / mid / front
  const dustVS=`attribute vec4 aSeed; uniform float uTime,uPx,uScroll,uSpeed,uZ,uSize,uGlobal; uniform vec2 uBox; varying float vA;
    void main(){ vec3 p; p.x=(aSeed.x-.5)*uBox.x+sin(uTime*.12+aSeed.w*30.)*.06;
      float u=fract(aSeed.y+uTime*uSpeed*(.4+aSeed.w)/uBox.y+uScroll); p.y=(u-.5)*uBox.y; p.z=uZ+(aSeed.z-.5)*1.4;
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uSize*(.5+aSeed.w)*uPx*(${CAM.toFixed(1)}/-mv.z);
      vA=(.3+.7*(.5+.5*sin(uTime*(.6+aSeed.w)+aSeed.x*50.)))*smoothstep(0.,.15,u)*smoothstep(1.,.85,u)*uGlobal; }`;
  const mkDust=(cnt,z,size,speed,alpha)=>mkPts(cnt,dustVS,{uTime:TIME,uPx:PXU,uScroll:{value:0},uSpeed:{value:speed},uZ:{value:z},uSize:{value:size},uGlobal:{value:1},uBox:{value:new THREE.Vector2(14,9)},uCol:{value:new THREE.Color(.22,.5,1).multiplyScalar(alpha)}},()=>[R(),R(),R(),R()]);
  const dustB=mkDust(small?70:170,-5,2.2,.1,.85), dustM=mkDust(small?36:90,-1.5,2.8,.14,.9), dustF=mkDust(small?6:14,2.4,5,.2,.4);
  scene.add(dustB,dustM,dustF);
  // comets — occasionally travel toward the laptop, leaving tiny blue trails
  const TR=8, CN=small?14:30, cU={uTime:TIME,uPx:PXU,uC:{value:new THREE.Vector3()},uCol:{value:BLUEc},uGlobal:{value:1}};
  const cometVS=`attribute vec4 aSeed; attribute float aK; uniform float uTime,uPx,uGlobal; uniform vec3 uC; varying float vA;
    void main(){ float sp=.055+aSeed.y*.05; float t=fract(uTime*sp+aSeed.x)-aK*.011;
      vec3 S=vec3(mix(-7.,9.,aSeed.z),mix(-4.,5.,aSeed.w),-9.-aSeed.y*6.); vec3 E=uC+vec3((aSeed.z-.5)*2.6,(aSeed.w-.5)*1.6,(aSeed.x-.5));
      float e=t*t*(3.-2.*t); vec3 p=mix(S,E,e); p+=vec3(sin(e*6.+aSeed.x*30.),cos(e*5.+aSeed.y*30.),0.)*(1.-e)*1.2*sin(e*3.1416);
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; float k=1.-aK/${TR.toFixed(1)};
      gl_PointSize=(3.4-aK*.3)*uPx*(${CAM.toFixed(1)}/-mv.z); vA=step(0.,t)*smoothstep(0.,.15,t)*(1.-smoothstep(.82,1.,t))*k*k*.9*uGlobal; }`;
  const comets=mkPts(CN*TR,cometVS,cU,i=>{ const c=(i/TR)|0; const r=(x)=>{ const v=Math.sin(c*127.1+x*311.7)*43758.5453; return v-Math.floor(v); }; return [r(1),r(2),r(3),r(4)]; },i=>i%TR);
  scene.add(comets);
  // stream — particles flow from the laptop toward the selected experience
  const sU={uTime:TIME,uPx:PXU,uSrc:{value:new THREE.Vector3()},uDst:{value:new THREE.Vector3()},uAmt:{value:0},uCol:{value:ICEc}};
  const streamVS=`attribute vec4 aSeed; uniform float uTime,uPx,uAmt; uniform vec3 uSrc,uDst; varying float vA;
    void main(){ float t=fract(uTime*(.22+aSeed.x*.2)+aSeed.y); vec3 c=mix(uSrc,uDst,.5)+vec3(0.,1.1+aSeed.z*.8,1.)+ (aSeed.wzx-.5)*.9;
      vec3 p=(1.-t)*(1.-t)*uSrc+2.*(1.-t)*t*c+t*t*uDst; p+=(aSeed.zwx-.5)*.12*sin(t*3.1416);
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(2.2+aSeed.w*2.)*uPx*(${CAM.toFixed(1)}/-mv.z);
      vA=uAmt*sin(t*3.1416)*.9; }`;
  const stream=mkPts(small?70:170,streamVS,sU,()=>[R(),R(),R(),R()]); scene.add(stream);
  // floor: soft shadow + holographic polar grid + expanding energy rings
  const floorG=new THREE.PlaneGeometry(11,11); 
  const floorU={uTime:TIME,uForm:{value:0},uCol:{value:BLUEc}};
  const floor=new THREE.Mesh(floorG,new THREE.ShaderMaterial({...ADD2,uniforms:floorU,side:THREE.DoubleSide,
    vertexShader:`varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`precision highp float; uniform float uTime,uForm; uniform vec3 uCol; varying vec2 vP;
      void main(){ float d=length(vP); float fade=smoothstep(5.2,1.2,d);
        float glow=exp(-d*d/2.4)*.07;
        float w=0.; for(int i=0;i<3;i++){ float ph=fract(uTime*.1+float(i)/3.); w+=exp(-((d-ph*4.6)*5.)*((d-ph*4.6)*5.))*(1.-ph)*(1.-ph)*.28; }
        float ang=atan(vP.y,vP.x); float grid=pow(abs(sin(d*5.)),60.)*.05+pow(abs(sin(ang*12.)),90.)*.03*smoothstep(.8,2.,d);
        gl_FragColor=vec4(uCol*(glow+w+grid)*fade*uForm,1.); }`}));
  floor.rotation.x=-Math.PI/2; scene.add(floor);

  /* ───────── layout ───────── */
  const Lo={W:1,H:1,viewW:1,viewH:1,mobile:false,lx:0,ly:0,s:1};
  function layout(){
    const W=vis.clientWidth||innerWidth, H=vis.clientHeight||innerHeight, dpr=Math.min(devicePixelRatio||1,coarse?1.5:2);
    rd.setPixelRatio(dpr); rd.setSize(W,H,false); PXU.value=dpr; U.uAspect.value=W/H;
    camera.aspect=W/H; Lo.W=W;Lo.H=H; Lo.viewH=2*CAM*Math.tan(FOV2*RAD/2); Lo.viewW=Lo.viewH*camera.aspect; Lo.mobile=innerWidth<=820;
    const tablet=innerWidth>820&&innerWidth<=1100;
    const avail=(Lo.mobile?1:(tablet?.58:.55))*Lo.viewW*(Lo.mobile?.96:.92);
    Lo.s=Math.min(avail/3.3, Lo.viewH*(Lo.mobile?.5:.66)/2.5);
    Lo.lx=Lo.mobile?0:Lo.viewW*(tablet?.21:.225); Lo.ly=Lo.mobile?.1:-.05;
    camera.setViewOffset(W,H,-(Lo.lx/Lo.viewW)*W,0,W,H); camera.updateProjectionMatrix();
    U.uSizeK.value=Math.max(Lo.mobile?2.2:1.6,Math.min(3.2,Lo.s*2.6));
    dustB.material.uniforms.uBox.value.set(Lo.viewW*2.6,Lo.viewH*2.6); dustM.material.uniforms.uBox.value.set(Lo.viewW*1.7,Lo.viewH*1.7); dustF.material.uniforms.uBox.value.set(Lo.viewW*1.2,Lo.viewH*1.3);
  }
  addEventListener('resize',layout); layout();

  /* ───────── interaction state ───────── */
  let hoverIdx=-1, scrollIdx=-1, sel=-2, T=0, form=0, last=performance.now();
  items.forEach((el,i)=>{
    el.addEventListener('pointerenter',e=>{ hoverIdx=i; });
    el.addEventListener('pointerleave',e=>{ if(e.pointerType==='mouse'&&hoverIdx===i) hoverIdx=-1; });
    el.addEventListener('focus',()=>{ hoverIdx=i; }); el.addEventListener('blur',()=>{ if(hoverIdx===i) hoverIdx=-1; });
    el.addEventListener('click',()=>{ hoverIdx=(coarse&&hoverIdx===i)?-1:i; });
  });
  let pointerIn=false; addEventListener('pointermove',()=>{ pointerIn=true; },{passive:true});
  document.addEventListener('mouseout',e=>{ if(!e.relatedTarget) pointerIn=false; });
  const mN=new THREE.Vector2(9,9), mT=new THREE.Vector2(9,9);
  let magnet=0, zx=0,zy=0,zz=0, prevZone=0, glowA=0, parx=0, pary=0, reactStart=-10, pulseTimer=0;
  const rc=new THREE.Raycaster(), inv=new THREE.Matrix4(), ro=new THREE.Vector3(), rdv=new THREE.Vector3(), tmp=new THREE.Vector3();
  function hitTest(nx,ny){
    rc.setFromCamera({x:nx,y:ny},camera); laptop.updateMatrixWorld(); inv.copy(laptop.matrixWorld).invert();
    ro.copy(rc.ray.origin).applyMatrix4(inv); rdv.copy(rc.ray.direction).transformDirection(inv);
    let best=null; const dn=rdv.y*sA+rdv.z*cA;
    if(Math.abs(dn)>1e-4){ const t=((-YO-ro.y)*sA+(-1-ro.z)*cA)/dn;
      if(t>0){ const x=ro.x+rdv.x*t,y=ro.y+rdv.y*t,z=ro.z+rdv.z*t, tt=(y+YO)*cA-(z+1)*sA; if(Math.abs(x)<1.55&&tt>-.05&&tt<1.95) best={zone:1,t,x,z}; } }
    if(Math.abs(rdv.y)>1e-4){ const t=(-YO-ro.y)/rdv.y;
      if(t>0&&(!best||t<best.t)){ const x=ro.x+rdv.x*t,z=ro.z+rdv.z*t;
        if(Math.abs(x)<1.55&&z>-1.02&&z<1.05){ const zone=(z>.28&&Math.abs(x)<.66)?3:2; best={zone,t,x,z}; } } }
    return best;
  }
  const project=(el,out)=>{ const r=el.getBoundingClientRect(), c=cvs.getBoundingClientRect();
    const nx=((r.left+r.width/2-c.left)/c.width)*2-1, ny=-(((r.top+r.height/2-c.top)/c.height)*2-1);
    tmp.set(nx,ny,.5).unproject(camera).sub(camera.position).normalize(); const t=-camera.position.z/tmp.z; return out.copy(camera.position).addScaledVector(tmp,t); };
  const smooth=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  const dstSm=new THREE.Vector3(), dstT=new THREE.Vector3();

  function pulseTo(idx){
    if(idx<0){ pulseEl.classList.remove('go'); return; }
    const node=items[idx].querySelector('.node'); const y=node.offsetTop+node.offsetHeight/2;
    pulseEl.classList.add('go'); pulseEl.style.top=y+'px';
    clearTimeout(pulseTimer); pulseTimer=setTimeout(()=>pulseEl.classList.remove('go'),1100);
  }

  /* ───────── frame ───────── */
  function frame(now){
    requestAnimationFrame(frame);
    const dt=Math.min((now-last)/1000,.05); last=now;
    const vh=innerHeight, r=sec.getBoundingClientRect();
    const onScreen=r.bottom>0&&r.top<vh;
    // — scroll-driven state
    let enter,leave,q;
    if(!Lo.mobile){ enter=clamp(1-r.top/vh,0,1); leave=clamp(1-r.bottom/vh,0,1); q=clamp(-r.top/Math.max(1,r.height-vh),0,1); }
    else { const vr=vis.getBoundingClientRect(); enter=clamp((vh-vr.top)/vh,0,1); leave=clamp((.35*vh-vr.bottom)/(.35*vh),0,1); q=0; }
    const target=smooth(.22,.85,enter)*(1-smooth(.15,.85,leave));
    form+=(target-form)*(1-Math.exp(-dt*(target>form?1.7:2.4)));
    U.uForm.value=form; floorU.uForm.value=form;
    if(!onScreen&&form<.002) { return; }
    T+=dt*MOTION; TIME.value=T;

    // — timeline illumination (progressive) + scroll-selected experience
    const tlR=tl.getBoundingClientRect(); const ys=items.map(it=>it.offsetTop+it.querySelector('.node').offsetTop+5);
    let fillY;
    if(!Lo.mobile) fillY=tl.offsetHeight*clamp((q-.10)/.55,0,1); else fillY=clamp(vh*.62-tlR.top,0,tl.offsetHeight);
    fillEl.style.height=Math.max(0,fillY-6)+'px';
    let sIdx=-1; ys.forEach((y,i)=>{ if(fillY>=y-2) sIdx=i; }); scrollIdx=sIdx;
    const want=hoverIdx>=0?hoverIdx:scrollIdx;
    if(want!==sel){
      const prev=sel; sel=want; setScreen(sel); reactStart=T;
      items.forEach((it,i)=>it.classList.toggle('sel',i===sel));
      pulseTo(sel);
    }
    items.forEach((it,i)=>it.classList.toggle('lit',fillY>=ys[i]-2));
    tl.classList.toggle('hov',hoverIdx>=0);
    if(mixT<1){ mixT=Math.min(1,mixT+dt/1.5); U.uMix.value=1-Math.pow(1-mixT,3); }
    U.uReactT.value=clamp((T-reactStart)/1.8,0,1);

    // — pointer → NDC, magnet, zones
    const cr=cvs.getBoundingClientRect();
    const px=input.px, py=input.py;
    const inside=pointerIn&&input.hasPointer&&px>=cr.left&&px<=cr.right&&py>=cr.top&&py<=cr.bottom&&(!coarse||input.down||true);
    if(inside){ mT.set(((px-cr.left)/cr.width)*2-1,-(((py-cr.top)/cr.height)*2-1)); if(mN.x>5) mN.copy(mT); }
    mN.x+= (mT.x-mN.x)*(1-Math.exp(-dt*9)); mN.y+=(mT.y-mN.y)*(1-Math.exp(-dt*9));
    const overLeft=inside&&(!Lo.mobile)&&px<cr.left+cr.width*.42;
    magnet=damp(magnet,(inside&&!overLeft&&form>.5)?1:0,5,dt);
    U.uMouse.value.copy(mN); U.uMagnet.value=magnet;
    let hit=null; if(inside&&!overLeft&&form>.7) hit=hitTest(mT.x,mT.y);
    const zone=hit?hit.zone:0;
    zx=damp(zx,zone===1?1:0,7,dt); zy=damp(zy,zone===2?1:0,7,dt); zz=damp(zz,zone===3?1:0,7,dt);
    U.uZone.value.set(zx,zy,zz);
    if(zone===2&&(zone!==prevZone||T-U.uKb.value.z>1.7)) U.uKb.value.set(hit.x,hit.z,T);
    if(zone===3&&(zone!==prevZone||T-U.uTp.value.z>2.0)) U.uTp.value.set(hit.x,hit.z,T);
    prevZone=zone;
    parx=damp(parx,inside?mT.x:0,3,dt); pary=damp(pary,inside?mT.y:0,3,dt);

    // — laptop float / rotation (kept small: X ±3°, Y ±5°)
    const rotY=(Math.sin(T*.21)*3.2*(reduce?.4:1)+parx*1.2-(sel>=0?.6:0))*RAD, rotX=(Math.sin(T*.27+1)*2.2*(reduce?.4:1)-pary*.8)*RAD;
    laptop.rotation.set(rotX,rotY,0);
    laptop.position.set(Lo.lx,Lo.ly+Math.sin(T*.6)*.05*(reduce?.4:1),0); laptop.scale.setScalar(Lo.s);
    laptop.updateMatrixWorld();
    camera.position.set(Lo.lx+parx*.18,3.2+pary*.1,CAM); camera.lookAt(Lo.lx,-.05,0); camera.updateMatrixWorld();
    floor.position.set(Lo.lx,Lo.ly+(-YO-.14)*Lo.s,0); floor.scale.setScalar(Lo.s*.72);

    // — comets / stream endpoints
    cU.uC.value.set(Lo.lx,Lo.ly,0);
    tmp.set(0,-YO+1.05,-1.15); sU.uSrc.value.copy(laptop.localToWorld(tmp));
    if(sel>=0){ project(items[sel].querySelector('.node'),dstT); if(Lo.mobile){ dstT.y=Math.min(dstT.y,Lo.viewH*.5); } dstSm.lerp(dstT,1-Math.exp(-dt*4)); }
    sU.uDst.value.copy(dstSm);
    sU.uAmt.value=damp(sU.uAmt.value,sel>=0?(hoverIdx>=0?1:.55)*Math.min(1,form*1.4):0,3,dt);
    if(sel<0) dstSm.copy(sU.uSrc.value);

    // — dust parallax + scroll
    const sy=scrollY/innerHeight*.15;
    dustB.material.uniforms.uScroll.value=sy*.3; dustM.material.uniforms.uScroll.value=sy*.6; dustF.material.uniforms.uScroll.value=sy*1.2;
    dustB.position.set(-parx*.15,-pary*.08,0); dustM.position.set(-parx*.35,-pary*.18,0); dustF.position.set(-parx*.8,-pary*.4,0);

    // — DOM: glow follows cursor over the laptop, hint fades
    glowA=damp(glowA,magnet*(.55+.45*Math.max(zx,zy,zz)),5,dt);
    const sr=vis.getBoundingClientRect(); glowEl.style.opacity=glowA.toFixed(3);
    glowEl.style.transform=`translate3d(${(mN.x*.5+.5)*cr.width}px,${(-mN.y*.5+.5)*cr.height}px,0) scale(${1+Math.max(zx,zy,zz)*.35})`;
    hint.style.opacity=(form>.9&&!input.moved?.9:.0)+'';
    if(onScreen) rd.render(scene,camera);
  }
  requestAnimationFrame(frame);
}
initAbout();


/* ═══════════════════════════════════════════════════════════════════
   SCENE 3 — SKILLS : the technology universe
   Map of the requested components/hooks → code sections below:
     SkillsSection / useScrollProgress ........ "scroll + entry/exit"
     SkillCategories / SkillCategory .......... "cards" (rendered from data)
     SkillItem / useMagneticEffect ............ "magnetic chips"
     SkillPopup / useSkillHover ............... "popup + selection"
     TechnologyUniverse / TechnologySphere .... "sphere" (THREE.Points)
     OrbitRing / TechnologyNode ............... "rings + nodes"
     SkillConnections ......................... "connection lines"
     SkillSearch .............................. "search"
     CursorEnergy / useMousePosition .......... shared cursor + `input`
     BackgroundParticles ...................... "dust + comets"
   ═══════════════════════════════════════════════════════════════════ */
function initSkills(){
  const sec=$('#technologies'); if(!sec) return;
  const { skillCategories:CATS, ICONS } = window.SKILLS;
  const EXPS=(window.PORTFOLIO&&window.PORTFOLIO.experiences)||[];
  const stage=$('#skStage'), vis=$('#skVisual'), cvs=$('#gl3'), fxc=$('#skFx'), pop=$('#skPop'), nodesEl=$('#skNodes'), inp=$('#skSearch'), flash=$('#skFlash'), catsEl=$('#skCats'), leftEl=$('#skLeft');
  const cards=[...sec.querySelectorAll('.skc')], chipEls=[...sec.querySelectorAll('.ski')], rv=[...sec.querySelectorAll('.skrv')];
  const NC=CATS.length, R=Math.random, TAU=Math.PI*2;
  const small=coarse||innerWidth<=820;
  const smooth=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const emit=(name,detail)=>document.dispatchEvent(new CustomEvent(name,{detail}));   // sound-ready hooks

  /* ───────── data model (everything derives from skillCategories) ───────── */
  const M=[], byName=new Map();
  CATS.forEach((c,ci)=>{ const anyF=c.skills.some(s=>s.featured);
    c.skills.forEach((s,si)=>{ const it={ s, name:s.name, key:s.name.toLowerCase(), cat:ci, idx:si, n:c.skills.length, gi:M.length,
        featured:anyF?!!s.featured:si<2, chip:null, el:null, rel:[], used:[], dir:new THREE.Vector3(),
        pos:new THREE.Vector3(), b:.3, rev:0, pull:0, sx:0, sy:0, vis:false, app:0 };
      M.push(it); if(!byName.has(it.key)) byName.set(it.key,it); }); });
  M.forEach((it,i)=>{ it.chip=chipEls[i];
    it.rel=(it.s.related||[]).map(n=>byName.get(String(n).toLowerCase())).filter(x=>x&&x!==it).slice(0,6);
    it.used=EXPS.filter(e=>(e.technologies||[]).some(t=>String(t).toLowerCase()===it.key)).map(e=>e.company);
    if(Array.isArray(it.s.usedIn)) it.s.usedIn.forEach(u=>{ if(!it.used.includes(u)) it.used.push(u); }); });
  const fib=(i,n)=>{ const y=1-(i+.5)*2/n, r=Math.sqrt(Math.max(0,1-y*y)), th=i*2.399963; return new THREE.Vector3(Math.cos(th)*r,y,Math.sin(th)*r); };
  const hash=a=>{ const x=Math.sin(a*127.1+311.7)*43758.5453; return x-Math.floor(x); };
  const catDir=CATS.map((c,i)=>fib(i,Math.max(NC,2)).applyAxisAngle(new THREE.Vector3(1,0,0),.35));
  M.forEach((it,i)=>{ it.dir.copy(catDir[it.cat]).add(new THREE.Vector3(hash(i*3+1)-.5,hash(i*3+2)-.5,hash(i*3+3)-.5).multiplyScalar(.9)).normalize(); });
  const glyph=n=>n.replace(/[^A-Za-z0-9]/g,'').slice(0,2);

  /* ───────── state ───────── */
  const S={ hov:null, pin:null, src:'chip', hovCat:-1, actCat:-1, q:'', match:new Set(), relQ:new Set(), last:undefined, T:0 };
  const curSel=()=>S.hov||S.pin;
  let hovLeave=0;
  const setHover=(it,src)=>{ clearTimeout(hovLeave); S.hov=it; S.src=src; };
  const clearHover=()=>{ clearTimeout(hovLeave); hovLeave=setTimeout(()=>{ S.hov=null; },90); };
  function refresh(){
    const sel=curSel(), relSet=new Set(sel?sel.rel:[]), hasQ=S.q.length>0;
    S.match=new Set(); S.relQ=new Set();
    if(hasQ){ M.forEach(it=>{ if(it.key.includes(S.q)) S.match.add(it); }); S.match.forEach(it=>it.rel.forEach(r=>{ if(!S.match.has(r)) S.relQ.add(r); })); }
    M.forEach(it=>{ const c=it.chip; c.classList.toggle('act',it===sel); c.classList.toggle('rel',relSet.has(it)); c.classList.toggle('hit',hasQ&&S.match.has(it)); c.classList.toggle('dim',hasQ&&!S.match.has(it)&&!S.relQ.has(it)); if(it.el) it.el.classList.toggle('on',it===sel); });
    cards.forEach((cd,i)=>{ cd.classList.toggle('hv',i===S.hovCat); cd.classList.toggle('on',i===S.actCat); });
    catsEl.classList.toggle('hov',S.hovCat>=0||S.actCat>=0);
  }
  M.forEach(it=>{
    it.chip.addEventListener('pointerenter',()=>{ setHover(it,'chip'); });
    it.chip.addEventListener('pointerleave',clearHover);
    it.chip.addEventListener('focus',()=>setHover(it,'chip')); it.chip.addEventListener('blur',clearHover);
    it.chip.addEventListener('click',()=>{ if(coarse){ S.pin=(S.pin===it?null:it); S.src='chip'; S.hov=null; S.last=undefined; } });
  });
  cards.forEach((cd,i)=>{
    cd.addEventListener('pointerenter',()=>{ if(S.hovCat!==i){ S.hovCat=i; S.catWave=i; refresh(); emit('skills:category',{category:CATS[i].name,state:'hover'}); } });
    cd.addEventListener('pointerleave',()=>{ if(S.hovCat===i){ S.hovCat=-1; refresh(); } });
    cd.addEventListener('click',e=>{ if(e.target.closest('.ski')&&!coarse) return; const same=S.actCat===i; S.actCat=(same&&!mobileNow())?-1:i; S.catWave=i; refresh(); emit('skills:category',{category:CATS[i].name,state:S.actCat<0?'clear':'select'}); });
    cd.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); cd.click(); } });
  });
  const mobileNow=()=>innerWidth<=820;
  if(mobileNow()){ S.actCat=0; refresh(); }
  inp.addEventListener('input',()=>{ S.q=inp.value.trim().toLowerCase(); refresh(); const f=[...S.match][0]; if(f){ S.pulseDir=f.dir; S.pulseReq=true; } });
  inp.addEventListener('keydown',e=>{ if(e.key==='Escape'){ inp.value=''; S.q=''; refresh(); inp.blur(); } });
  document.addEventListener('pointerdown',e=>{ if(coarse&&S.pin&&!e.target.closest('.ski,.skn')){ S.pin=null; S.last=undefined; } },{passive:true});

  /* ───────── popup ───────── */
  const pp={x:0,y:0,init:false};
  function popHTML(it){
    const s=it.s, cat=CATS[it.cat], ico=ICONS[cat.icon]||ICONS.code;
    const lvl=(typeof s.level==='number'&&isFinite(s.level))?clamp(Math.round(s.level),0,100):null;
    const pj=Array.isArray(s.projects)?s.projects.length:(typeof s.projects==='number'?s.projects:0);
    const rows=[]; if(pj>0) rows.push(`Projects: <b>${pj}</b>`); if(s.since) rows.push(`Used since: <b>${esc(s.since)}</b>`); if(typeof s.years==='number'&&s.years>0) rows.push(`Experience: <b>${s.years} yr${s.years===1?'':'s'}</b>`);
    let h=`<div class="h"><svg viewBox="0 0 24 24">${ico}</svg>${esc(it.name)}</div><div class="c">${esc(cat.name)}</div>`;
    if(s.description) h+=`<p class="d">${esc(s.description)}</p>`;
    if(lvl!==null){ const on=Math.round(lvl/10); h+=`<div class="l">EXPERIENCE</div><div class="bar">${Array.from({length:10},(_,i)=>`<i class="${i<on?'f':''}"></i>`).join('')}<em>${lvl}%</em></div>`; }
    if(rows.length) h+=`<div class="m">${rows.map(r=>`<div>${r}</div>`).join('')}</div>`;
    if(it.used.length) h+=`<div class="u">USED IN EXPERIENCE${it.used.map(c=>`<span>${esc(c)}</span>`).join('')}</div>`;
    return h;
  }
  function popPlace(dt,anchor){
    const w=pop.offsetWidth||248, h=pop.offsetHeight||160; let tx,ty;
    if(!coarse&&input.hasPointer){ tx=input.px+20; ty=input.py+22; if(tx+w>innerWidth-10) tx=input.px-w-16; if(ty+h>innerHeight-10) ty=input.py-h-18; }
    else if(anchor){ tx=anchor.x-w/2; ty=anchor.y-h-16; if(ty<10) ty=anchor.y+24; }
    else return;
    tx=clamp(tx,10,innerWidth-w-10); ty=clamp(ty,10,innerHeight-h-10);
    if(!pp.init){ pp.x=tx; pp.y=ty; pp.init=true; } else { const k=1-Math.exp(-dt*11); pp.x+=(tx-pp.x)*k; pp.y+=(ty-pp.y)*k; }
    pop.style.translate=`${pp.x.toFixed(1)}px ${pp.y.toFixed(1)}px`;
  }

  /* ───────── 2D FX overlay: bursts, card particles, energy line, node rings ───────── */
  const fx=fxc.getContext('2d'); let FW=0,FH=0; const bursts=[], attr=[], nrings=[];
  function sizeFx(){ const d=Math.min(devicePixelRatio||1,2); FW=innerWidth; FH=innerHeight; fxc.width=FW*d; fxc.height=FH*d; fx.setTransform(d,0,0,d,0,0); }
  addEventListener('resize',sizeFx); sizeFx();
  function burst(x,y,n){ n=n||(small?12:22); for(let i=0;i<n;i++){ const a=R()*TAU, sp=45+R()*120; bursts.push({x:x+Math.cos(a)*6,y:y+Math.sin(a)*6,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,l:0,m:.5+R()*.3,s:.8+R()*1.5}); } }
  const cent=NC?Array.from({length:NC},()=>({x:0,y:0,n:0})):[];

  /* ───────── WebGL universe ───────── */
  let rd=null; try{ rd=new THREE.WebGLRenderer({canvas:cvs,antialias:false,alpha:true,powerPreference:'high-performance'}); }catch(e){ rd=null; }
  const CAM=8, FOV3=30, camera=new THREE.PerspectiveCamera(FOV3,1,.1,80), scene=new THREE.Scene();
  const TIME={value:0}, PXU={value:1};
  const universe=new THREE.Group(), sphereG=new THREE.Group(); universe.add(sphereG); scene.add(universe);
  const BLUEc=new THREE.Color(.10,.44,1), CYANc=new THREE.Color(.10,.72,1), ICEc=new THREE.Color(.66,.86,1);
  const ADD={ blending:THREE.CustomBlending, blendEquation:THREE.AddEquation, blendSrc:THREE.OneFactor, blendDst:THREE.OneFactor, blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor, transparent:true, depthWrite:false, depthTest:false };
  const NCAP=8;
  const SU={ uTime:TIME,uPx:PXU,uSizeK:{value:1},uForm:{value:0},uAmp:{value:reduce?.4:1},uMagnet:{value:0},uAspect:{value:1},uCam:{value:CAM},uGlobal:{value:1},uWaveT:{value:1},uWaveDir:{value:new THREE.Vector3(0,1,0)},uMouse:{value:new THREE.Vector2(9,9)},uSpeed:{value:0},
    uCatW:{value:new Array(NCAP).fill(.5)}, uRelDir:{value:Array.from({length:8},()=>new THREE.Vector3(0,1,0))}, uRelW:{value:new Array(8).fill(0)}, uBlue:{value:1}, uCol:{value:BLUEc}, uCyan:{value:CYANc}, uHot:{value:ICEc} };
  const GL_COMMON=`
    attribute vec3 aDir; attribute vec4 aSeed; attribute float aCat;
    uniform float uTime,uPx,uSizeK,uForm,uAmp,uMagnet,uAspect,uCam,uGlobal,uWaveT,uSpeed,uBlue; uniform vec3 uWaveDir; uniform vec2 uMouse;
    uniform float uCatW[${NCAP}]; uniform vec3 uRelDir[8]; uniform float uRelW[8];
    varying float vI,vHot,vMix;
    float sq(float x){ return x*x; }
    vec3 scatterPos(vec3 d,vec4 s){ return d*(4.+s.y*10.)+(s.zwx-.5)*4.; }
    float energy(vec3 d,vec4 s,out float band){
      float ang=acos(clamp(dot(d,uWaveDir),-1.,1.)); band=exp(-sq((ang-uWaveT*3.3)*3.2))*(1.-uWaveT);
      float b=.5+.8*uCatW[int(aCat+.5)];
      for(int i=0;i<8;i++){ b+=uRelW[i]*smoothstep(.86,.99,dot(d,uRelDir[i]))*1.6; }
      return b+band*2.4; }`;
  const sphereMat=new THREE.ShaderMaterial({...ADD,uniforms:SU,
    vertexShader:GL_COMMON+`
      void main(){
        float t=clamp((uForm-aSeed.x*.4)/.6,0.,1.); float e=1.-(1.-t)*(1.-t)*(1.-t);
        float band; float b=energy(aDir,aSeed,band);
        vec3 tg=aDir*(1.+(aSeed.z-.5)*.035+.012*sin(uTime*.6+aSeed.w*30.)*uAmp); tg*=1.+band*.035;
        vec3 pos=mix(scatterPos(aDir,aSeed),tg,e);
        pos+=vec3(sin(aSeed.y*61.+t*5.),cos(aSeed.z*47.+t*4.),sin(aSeed.w*53.+t*6.))*sin(t*3.1416)*(.8+aSeed.x);
        float live=smoothstep(.85,1.,t);
        float spark=step(.99,aSeed.w)*pow(max(0.,sin(uTime*(2.+aSeed.x*3.)+aSeed.y*90.)),20.); b+=spark*3.;
        vec4 mv=modelViewMatrix*vec4(pos,1.); vec4 cp=projectionMatrix*mv;
        vec2 ndc=cp.xy/cp.w; vec2 dm=(uMouse-ndc)*vec2(uAspect,1.);
        float infl=exp(-dot(dm,dm)/(2.*.16*.16))*uMagnet;
        ndc+=(uMouse-ndc)*infl*(.14+.22*aSeed.x)*live; cp.xy=ndc*cp.w; b*=1.+infl*1.4+infl*uSpeed*2.;
        gl_Position=cp; gl_PointSize=(.9+aSeed.z*.9)*uPx*uSizeK*(uCam/max(-mv.z,2.))*(1.+infl*.6+spark);
        vI=b*mix(.25,1.,e)*uGlobal*.5*uBlue; vHot=clamp((b-1.5)*.5,0.,1.); vMix=aSeed.y; }`,
    fragmentShader:`precision highp float; uniform vec3 uCol,uCyan,uHot; varying float vI,vHot,vMix;
      void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard; float g=exp(-d*d*13.), core=exp(-d*d*70.);
        gl_FragColor=vec4(mix(mix(uCol,uCyan,vMix*.5),uHot,vHot)*(g*.7+core*1.4)*vI,1.); }` });
  const NS=small?1800:6200;
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NS*3),3));
  { const d=new Float32Array(NS*3), s=new Float32Array(NS*4), c=new Float32Array(NS);
    for(let i=0;i<NS;i++){ const v=fib(i,NS); v.x+=(R()-.5)*.012; v.y+=(R()-.5)*.012; v.z+=(R()-.5)*.012; v.normalize(); d.set([v.x,v.y,v.z],i*3); s.set([R(),R(),R(),R()],i*4);
      let best=0,bd=-2; catDir.forEach((cd,k)=>{ const dd=cd.dot(v); if(dd>bd){bd=dd;best=k;} }); c[i]=best; }
    sg.setAttribute('aDir',new THREE.BufferAttribute(d,3)); sg.setAttribute('aSeed',new THREE.BufferAttribute(s,4)); sg.setAttribute('aCat',new THREE.BufferAttribute(c,1)); }
  const sphere=new THREE.Points(sg,sphereMat); sphere.frustumCulled=false; sphereG.add(sphere);
  // connecting lines between neighbouring sphere particles
  { const LN=small?150:420, pts=[]; for(let i=0;i<LN;i++){ const v=fib((R()*NS)|0,NS); pts.push(v); }
    const A=[],Sd=[],Cc=[]; pts.forEach((p,i)=>{ const ds=pts.map((q,j)=>({j,d:j===i?-2:p.dot(q)})).sort((a,b)=>b.d-a.d).slice(0,2);
      ds.forEach(o=>{ const q=pts[o.j]; [p,q].forEach(v=>{ A.push(v.x,v.y,v.z); Sd.push(R(),R(),R(),R()); let best=0,bd=-2; catDir.forEach((cd,k)=>{ const dd=cd.dot(v); if(dd>bd){bd=dd;best=k;} }); Cc.push(best); }); }); });
    const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(A.length),3));
    lg.setAttribute('aDir',new THREE.BufferAttribute(new Float32Array(A),3)); lg.setAttribute('aSeed',new THREE.BufferAttribute(new Float32Array(Sd),4)); lg.setAttribute('aCat',new THREE.BufferAttribute(new Float32Array(Cc),1));
    const lm=new THREE.ShaderMaterial({...ADD,uniforms:SU,vertexShader:GL_COMMON+`
      void main(){ float t=clamp((uForm-aSeed.x*.4)/.6,0.,1.); float e=1.-(1.-t)*(1.-t)*(1.-t);
        float band; float b=energy(aDir,aSeed,band);
        vec3 pos=mix(scatterPos(aDir,aSeed),aDir*(1.+band*.035),e);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(pos,1.); vI=b*.16*smoothstep(.7,1.,t)*uGlobal*uBlue; vHot=0.; vMix=0.; }`,
      fragmentShader:`precision highp float; uniform vec3 uCol; varying float vI; void main(){ gl_FragColor=vec4(uCol*vI,1.); }`});
    const ls=new THREE.LineSegments(lg,lm); ls.frustumCulled=false; sphereG.add(ls); }
  // core glow
  const coreU={uTime:TIME,uAmt:{value:0},uPulse:{value:0}};
  const core=new THREE.Mesh(new THREE.PlaneGeometry(4.2,4.2),new THREE.ShaderMaterial({...ADD,uniforms:coreU,vertexShader:`varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`precision highp float; uniform float uTime,uAmt,uPulse; varying vec2 vP; void main(){ float d=length(vP); float g=exp(-d*d*1.1)*.16+exp(-d*d*9.)*.14; g*=1.+.12*sin(uTime*.9)+uPulse; gl_FragColor=vec4(vec3(.10,.42,1.)*g*uAmt,1.); }`}));
  core.position.z=-.3; universe.add(core);

  // rings (one orbit per category) + orbiting particles
  const ringFS=`precision highp float; uniform float uTime,uR,uW,uInt,uRot,uMode; uniform vec3 uCol,uHot; varying vec2 vP;
    void main(){ float len=length(vP), ang=atan(vP.y,vP.x); float d=abs(len-uR); if(d>uW*70.) discard;
      float core=exp(-(d/uW)*(d/uW)); float glow=exp(-d/(uW*11.))*.3+exp(-d/(uW*45.))*.08;
      float comet=pow(.5+.5*cos(ang-uRot),9.); float dash=smoothstep(.3,.55,sin((ang-uRot*.6)*70.)*.5+.5);
      float body=mix(.28+.72*comet,.15+.85*dash,uMode);
      float I=(core*body*1.0+glow*(.35+comet*1.0))*(.88+.12*sin(uTime*1.6))*uInt;
      gl_FragColor=vec4(mix(uCol,uHot,clamp(core*comet*1.2,0.,1.))*I,1.); }`;
  const orbVS=`attribute vec4 aSeed; uniform float uTime,uPx,uSpeed,uInt; varying float vA;
    void main(){ float a=aSeed.x*6.2831853+uTime*uSpeed*(.5+aSeed.y); float r=1.+(aSeed.z-.5)*.04; vec3 p=vec3(cos(a)*r,sin(a)*r,(aSeed.w-.5)*.05);
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(1.4+aSeed.y*2.2)*uPx*(${CAM.toFixed(1)}/-mv.z);
      vA=(.5+.5*sin(uTime*2.+aSeed.x*40.))*(.3+aSeed.y*.7)*uInt; }`;
  const dotFS=`precision highp float; uniform vec3 uCol; varying float vA; void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard; gl_FragColor=vec4(uCol*(exp(-d*d*20.)*.75+exp(-d*d*110.)*1.4)*vA,1.); }`;
  const mkPts=(cnt,vs,uni,seedFn)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cnt*3),3)); const s=new Float32Array(cnt*4); for(let i=0;i<cnt;i++) s.set(seedFn(i),i*4); g.setAttribute('aSeed',new THREE.BufferAttribute(s,4)); const p=new THREE.Points(g,new THREE.ShaderMaterial({...ADD,vertexShader:vs,fragmentShader:dotFS,uniforms:uni})); p.frustumCulled=false; return p; };
  const tilt=[1.12,1.02,1.24,.92,1.30,1.07,1.18,.98], roll=[-.35,.5,-.9,.9,.15,-.6,.7,-.2];
  const rings=CATS.map((c,i)=>{ const g=new THREE.Group(); g.rotation.order='ZXY'; universe.add(g);
    const U={uTime:TIME,uR:{value:1},uW:{value:.0055},uInt:{value:0},uRot:{value:0},uMode:{value:i%2?1:0},uCol:{value:BLUEc},uHot:{value:ICEc}};
    const m=new THREE.Mesh(new THREE.PlaneGeometry(3.2,3.2),new THREE.ShaderMaterial({...ADD,uniforms:U,vertexShader:`varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,fragmentShader:ringFS})); m.frustumCulled=false;
    const oU={uTime:TIME,uPx:PXU,uSpeed:{value:(i%2?-1:1)*(.16+i*.02)},uInt:{value:0},uCol:{value:BLUEc}};
    const op=mkPts(small?12:34,orbVS,oU,()=>[R(),R(),R(),R()]);
    g.add(m,op);
    return { g,m,U,oU,op,R0:1.55+i*.15,R:1.55+i*.15,int:0,phase:R()*TAU,sm:1,dir:(i%2?-1:1),w:(.05+i*.012) }; });

  // nodes (glow points) + trails, updated on the CPU each frame
  const NN=M.length, TRN=5;
  const nodeVS=`attribute float aB; attribute float aS; uniform float uPx; varying float vA;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=aS*uPx*(${CAM.toFixed(1)}/-mv.z); vA=aB; }`;
  const mkDyn=(cnt)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cnt*3),3)); g.setAttribute('aB',new THREE.BufferAttribute(new Float32Array(cnt),1)); g.setAttribute('aS',new THREE.BufferAttribute(new Float32Array(cnt),1));
    const p=new THREE.Points(g,new THREE.ShaderMaterial({...ADD,vertexShader:nodeVS,fragmentShader:dotFS,uniforms:{uPx:PXU,uCol:{value:ICEc}}})); p.frustumCulled=false; universe.add(p); return p; };
  const nodePts=mkDyn(NN), trailPts=mkDyn(NN*TRN);
  // connection lines (selected node → related nodes, + energy into the sphere)
  const NL=7, SEG=26, connU={uTime:TIME,uGrow:{value:new Array(NL).fill(0)},uCol:{value:ICEc}};
  const cg=new THREE.BufferGeometry(); cg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NL*SEG*2*3),3));
  { const t=new Float32Array(NL*SEG*2), l=new Float32Array(NL*SEG*2); for(let i=0;i<NL;i++)for(let k=0;k<SEG;k++){ const o=(i*SEG+k)*2; t[o]=k/SEG; t[o+1]=(k+1)/SEG; l[o]=l[o+1]=i; }
    cg.setAttribute('aT',new THREE.BufferAttribute(t,1)); cg.setAttribute('aL',new THREE.BufferAttribute(l,1)); }
  const connLines=new THREE.LineSegments(cg,new THREE.ShaderMaterial({...ADD,uniforms:connU,vertexShader:`attribute float aT,aL; uniform float uGrow[${NL}]; uniform float uTime; varying float vA;
    void main(){ float g=uGrow[int(aL+.5)]; vA=smoothstep(g,g-.1,aT)*g*(.55+.45*sin(aT*26.-uTime*6.)); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`precision highp float; uniform vec3 uCol; varying float vA; void main(){ gl_FragColor=vec4(uCol*vA*1.3,1.); }`}));
  connLines.frustumCulled=false; universe.add(connLines);
  // ambient: dust (3 depths) + comets flying toward the sphere
  const dustVS=`attribute vec4 aSeed; uniform float uTime,uPx,uScroll,uSpeed,uZ,uSize,uGlobal; uniform vec2 uBox; varying float vA;
    void main(){ vec3 p; p.x=(aSeed.x-.5)*uBox.x+sin(uTime*.12+aSeed.w*30.)*.06; float u=fract(aSeed.y+uTime*uSpeed*(.4+aSeed.w)/uBox.y+uScroll); p.y=(u-.5)*uBox.y; p.z=uZ+(aSeed.z-.5)*1.4;
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uSize*(.5+aSeed.w)*uPx*(${CAM.toFixed(1)}/-mv.z);
      vA=(.3+.7*(.5+.5*sin(uTime*(.6+aSeed.w)+aSeed.x*50.)))*smoothstep(0.,.15,u)*smoothstep(1.,.85,u)*uGlobal; }`;
  const mkDust=(cnt,z,size,speed,alpha)=>mkPts(cnt,dustVS,{uTime:TIME,uPx:PXU,uScroll:{value:0},uSpeed:{value:speed},uZ:{value:z},uSize:{value:size},uGlobal:{value:0},uBox:{value:new THREE.Vector2(14,9)},uCol:{value:new THREE.Color(.22,.5,1).multiplyScalar(alpha)}},()=>[R(),R(),R(),R()]);
  const dustB=mkDust(small?70:190,-5,2.2,.1,.85), dustM=mkDust(small?30:80,-1.5,2.8,.14,.9), dustF=mkDust(small?5:12,2.6,5,.2,.4);
  scene.add(dustB,dustM,dustF);
  const TR=8, CN=small?10:24, cU={uTime:TIME,uPx:PXU,uC:{value:new THREE.Vector3()},uCol:{value:BLUEc},uGlobal:{value:0}};
  const cometVS=`attribute vec4 aSeed; attribute float aK; uniform float uTime,uPx,uGlobal; uniform vec3 uC; varying float vA;
    void main(){ float sp=.05+aSeed.y*.045; float t=fract(uTime*sp+aSeed.x)-aK*.011; vec3 S=vec3(mix(-7.,9.,aSeed.z),mix(-4.,5.,aSeed.w),-9.-aSeed.y*6.); vec3 E=uC+vec3((aSeed.z-.5)*1.6,(aSeed.w-.5)*1.6,(aSeed.x-.5));
      float e=t*t*(3.-2.*t); vec3 p=mix(S,E,e); p+=vec3(sin(e*6.+aSeed.x*30.),cos(e*5.+aSeed.y*30.),0.)*(1.-e)*1.2*sin(e*3.1416);
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; float k=1.-aK/${TR.toFixed(1)}; gl_PointSize=(3.2-aK*.3)*uPx*(${CAM.toFixed(1)}/-mv.z);
      vA=step(0.,t)*smoothstep(0.,.15,t)*(1.-smoothstep(.8,1.,t))*k*k*.85*uGlobal; }`;
  { const g=new THREE.BufferGeometry(), cnt=CN*TR; g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cnt*3),3)); const s=new Float32Array(cnt*4), k=new Float32Array(cnt);
    for(let i=0;i<cnt;i++){ const c=(i/TR)|0; const r=x=>{ const v=Math.sin(c*127.1+x*311.7)*43758.5453; return v-Math.floor(v); }; s.set([r(1),r(2),r(3),r(4)],i*4); k[i]=i%TR; }
    g.setAttribute('aSeed',new THREE.BufferAttribute(s,4)); g.setAttribute('aK',new THREE.BufferAttribute(k,1));
    const comets=new THREE.Points(g,new THREE.ShaderMaterial({...ADD,vertexShader:cometVS,fragmentShader:dotFS,uniforms:cU})); comets.frustumCulled=false; scene.add(comets); }

  /* ───────── node labels (DOM, positioned from 3D each frame) ───────── */
  M.forEach(it=>{ const d=document.createElement('div'); d.className='skn'; d.innerHTML=`<i>${esc(glyph(it.name))}</i><span>${esc(it.name)}</span>`; nodesEl.appendChild(d); it.el=d;
    d.addEventListener('pointerenter',()=>setHover(it,'node')); d.addEventListener('pointerleave',clearHover);
    d.addEventListener('click',()=>{ if(coarse){ S.pin=(S.pin===it?null:it); S.src='node'; S.hov=null; S.last=undefined; } }); });

  /* ───────── layout ───────── */
  const Lo={W:1,H:1,viewW:1,viewH:1,s:1,lx:0,mobile:false};
  function layout(){
    const W=vis.clientWidth||innerWidth, H=vis.clientHeight||innerHeight; Lo.W=W; Lo.H=H; Lo.mobile=innerWidth<=820;
    if(!rd) return;
    const dpr=Math.min(devicePixelRatio||1,coarse?1.5:2); rd.setPixelRatio(dpr); rd.setSize(W,H,false); PXU.value=dpr; SU.uAspect.value=W/H;
    camera.aspect=W/H; Lo.viewH=2*CAM*Math.tan(FOV3*RAD/2); Lo.viewW=Lo.viewH*camera.aspect;
    const tablet=innerWidth>820&&innerWidth<=1100, frac=Lo.mobile?1:(tablet?.52:.55);
    const rMax=Lo.mobile?1.75:1.5+(NC-1)*.15+.1;
    Lo.s=Math.min((frac*Lo.viewW*.5*.9)/rMax, Lo.viewH*(Lo.mobile?.36:.42)/1.0);
    Lo.lx=Lo.mobile?0:Lo.viewW*(tablet?.24:.225);
    camera.setViewOffset(W,H,-(Lo.lx/Lo.viewW)*W,0,W,H); camera.updateProjectionMatrix();
    SU.uSizeK.value=Math.max(Lo.mobile?1.9:1.5,Math.min(3.2,Lo.s*2.2));
    [dustB,dustM,dustF].forEach((d,i)=>d.material.uniforms.uBox.value.set(Lo.viewW*[2.6,1.7,1.2][i],Lo.viewH*[2.6,1.7,1.3][i]));
  }
  addEventListener('resize',layout); layout();

  /* ───────── per-frame ───────── */
  const tmp=new THREE.Vector3(), tmp2=new THREE.Vector3(), tmp3=new THREE.Vector3();
  const mN=new THREE.Vector2(9,9), mT=new THREE.Vector2(9,9);
  let form=0, last=performance.now(), T=0, magnet=0, speedSm=0, pmx=0,pmy=0, pulsed=false, waveStart=-10, parx=0, pary=0, ringT=0, catWaveSeen=-1;
  const catW=new Array(NCAP).fill(.5), relW=new Array(8).fill(0), grow=new Array(NL).fill(0);
  let lineCenter=null, lineRel=[], lineT0=0, pointerIn=false;
  addEventListener('pointermove',()=>{ pointerIn=true; },{passive:true}); document.addEventListener('mouseout',e=>{ if(!e.relatedTarget) pointerIn=false; });
  const mag=chipEls.map(()=>({x:0,y:0,vx:0,vy:0}));
  const rvA=rv.map((_,i)=>i<5?.46+i*.05:.54+(i-5)*.055);
  const attrSpawn={t:0};
  function selChanged(sel){
    refresh();
    if(sel){
      S.waveDir=sel.dir; waveStart=T; lineCenter=sel; lineRel=sel.rel.slice(); lineT0=T;
      pop.innerHTML=popHTML(sel); pop.classList.add('show');
      const r=sel.chip.getBoundingClientRect(); let bx=r.left+r.width/2, by=r.top+r.height/2;
      if(S.src==='node'&&sel.vis){ const cr=cvs.getBoundingClientRect(); bx=cr.left+sel.sx; by=cr.top+sel.sy; }
      burst(bx,by); if(S.src==='node') nrings.push({x:bx,y:by,t:0});
      emit('skills:hover',{skill:sel.name,category:CATS[sel.cat].name});
    } else pop.classList.remove('show');
  }
  function frame(now){
    requestAnimationFrame(frame);
    const dt=Math.min((now-last)/1000,.05); last=now;
    const vh=innerHeight, r=sec.getBoundingClientRect(), onScreen=r.bottom>0&&r.top<vh;
    let enter,leave;
    if(!Lo.mobile){ enter=clamp(1-r.top/vh,0,1); leave=clamp(1-r.bottom/vh,0,1); }
    else { const vr=vis.getBoundingClientRect(); enter=clamp((vh-vr.top)/vh,0,1); leave=clamp((.35*vh-vr.bottom)/(.35*vh),0,1); }
    const target=smooth(.22,.85,enter)*(1-smooth(.15,.85,leave));
    form+=(target-form)*(1-Math.exp(-dt*(target>form?1.6:2.3)));
    if(!onScreen&&form<.002){ if(fxc.style.display!=='none'){ fxc.style.display='none'; pop.classList.remove('show'); } return; }
    fxc.style.display='block';
    T+=dt*MOTION; S.T=T; TIME.value=T;
    const f=form;

    /* DOM entrance / exit (staggered) */
    rv.forEach((el,i)=>{ let k; if(!Lo.mobile) k=smooth(rvA[i],rvA[i]+.2,f); else { const b=el.getBoundingClientRect(); k=smooth(vh*.98,vh*.78,b.top)*(1-smooth(0,-vh*.2,b.bottom)*0)+0; k=clamp((vh*.94-b.top)/(vh*.16),0,1); } el.style.setProperty('--k',k.toFixed(3)); });
    if(f>.95&&!pulsed){ pulsed=true; waveStart=T; S.waveDir=new THREE.Vector3(0,1,0); flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); }
    if(f<.6) pulsed=false;

    /* selection changes */
    const sel=curSel(); if(sel!==S.last){ S.last=sel; selChanged(sel); }
    if(S.catWave>=0&&S.catWave!==catWaveSeen){ catWaveSeen=S.catWave; S.waveDir=catDir[S.catWave]; waveStart=T; }
    if(S.pulseReq){ S.pulseReq=false; S.waveDir=S.pulseDir; waveStart=T; }
    if(S.catWave<0) catWaveSeen=-1;

    /* pointer */
    const cr=cvs.getBoundingClientRect(), px=input.px, py=input.py;
    const inside=pointerIn&&input.hasPointer&&px>=cr.left&&px<=cr.right&&py>=cr.top&&py<=cr.bottom;
    const overLeft=inside&&!Lo.mobile&&px<cr.left+cr.width*.45;
    if(inside){ mT.set(((px-cr.left)/cr.width)*2-1,-(((py-cr.top)/cr.height)*2-1)); if(mN.x>5) mN.copy(mT); }
    const spd=Math.hypot(mT.x-pmx,mT.y-pmy)/Math.max(dt,.001); pmx=mT.x; pmy=mT.y;
    mN.x+=(mT.x-mN.x)*(1-Math.exp(-dt*9)); mN.y+=(mT.y-mN.y)*(1-Math.exp(-dt*9));
    magnet=damp(magnet,(inside&&!overLeft&&f>.5&&(!coarse||input.down))?1:0,5,dt); speedSm=damp(speedSm,clamp(spd*.15,0,1),4,dt);
    parx=damp(parx,inside?mT.x:0,3,dt); pary=damp(pary,inside?mT.y:0,3,dt);

    /* stage progress for each element of the universe */
    const sDust=smooth(0,.15,f), sSphere=smooth(.08,.55,f), sRing=smooth(.45,.68,f);
    /* state → targets */
    const hasQ=S.q.length>0, relSet=new Set(sel?sel.rel:[]);
    for(let c=0;c<NCAP;c++){ let t=.5; if(c<NC){ if(S.actCat>=0) t=c===S.actCat?1.25:.3; if(c===S.hovCat) t+=.45; if(sel&&sel.cat===c) t+=.3; if(hasQ&&[...S.match].some(m=>m.cat===c)) t+=.3; } catW[c]+=(t-catW[c])*(1-Math.exp(-dt*4)); SU.uCatW.value[c]=catW[c]; }
    SU.uBlue.value=damp(SU.uBlue.value,S.actCat>=0?1.3:1,3,dt);
    // spotlight slots on the sphere
    const spots=[]; if(sel){ spots.push([sel.dir,1]); sel.rel.slice(0,7).forEach(x=>spots.push([x.dir,.5])); } else if(hasQ){ [...S.match].slice(0,4).forEach(m=>spots.push([m.dir,1])); [...S.relQ].slice(0,4).forEach(m=>spots.push([m.dir,.4])); }
    for(let i=0;i<8;i++){ const sp=spots[i]; if(sp) SU.uRelDir.value[i].copy(sp[0]); relW[i]+=((sp?sp[1]:0)-relW[i])*(1-Math.exp(-dt*5)); SU.uRelW.value[i]=relW[i]; }
    SU.uWaveDir.value.copy(S.waveDir||catDir[0]||tmp.set(0,1,0));
    const wt=(T-waveStart)/1.1; SU.uWaveT.value=wt>=1?1:Math.max(0,wt);
    SU.uForm.value=sSphere; SU.uGlobal.value=1; SU.uMagnet.value=magnet; SU.uSpeed.value=speedSm; SU.uMouse.value.copy(mN);
    coreU.uAmt.value=sSphere; coreU.uPulse.value=wt<1?Math.sin(Math.PI*clamp(wt,0,1))*.6:0;
    [dustB,dustM,dustF].forEach(d=>d.material.uniforms.uGlobal.value=sDust); cU.uGlobal.value=sDust;

    /* universe transform */
    universe.position.set(Lo.lx,Lo.mobile?.05:0,0); universe.scale.setScalar(Lo.s*lerp(.9,1,sSphere));
    sphereG.rotation.set(.32+Math.sin(T*.1)*.05+pary*.05,T*.05*(reduce?.4:1)+parx*.12,0);
    camera.position.set(Lo.lx+parx*.16,1.3+pary*.08,CAM); camera.lookAt(Lo.lx,0,0); camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    universe.updateMatrixWorld(true);

    /* rings + nodes */
    const selCat=sel?sel.cat:-1;
    rings.forEach((rg,i)=>{
      const act=S.actCat===i, dim=S.actCat>=0&&!act;
      const Rt=rg.R0*(act?.92:(S.actCat>=0?1.07:1)); rg.R+=(Rt-rg.R)*(1-Math.exp(-dt*2.6));
      let it=.30; if(act) it=.95; if(i===S.hovCat) it=Math.max(it,.8); if(i===selCat) it=Math.max(it,.9); if(dim) it=.14;
      rg.int+=(it-rg.int)*(1-Math.exp(-dt*4));
      const sm=(sel&&sel.cat===i)?.12:1; rg.sm+=(sm-rg.sm)*(1-Math.exp(-dt*3));
      rg.phase+=dt*rg.w*rg.dir*rg.sm*MOTION;
      const st=(act?.04:0);
      rg.g.rotation.set(tilt[i%8]+Math.sin(T*.13+i)*.03-st,Math.sin(T*.07+i*2)*.05,roll[i%8]+Math.sin(T*.09+i*2)*.04);
      rg.g.scale.setScalar(rg.R); rg.g.updateMatrix();
      rg.U.uInt.value=rg.int*sRing; rg.U.uRot.value=(T/(20+i*3))*TAU*rg.dir; rg.oU.uInt.value=rg.int*sRing*1.2;
      rg.U.uW.value=.0055/1;
    });
    const nP=nodePts.geometry.attributes, tP=trailPts.geometry.attributes; const cvw=Lo.W, cvh=Lo.H;
    cent.forEach(c=>{ c.x=0;c.y=0;c.n=0; });
    M.forEach(it=>{
      const rg=rings[it.cat]; const app=smooth(.6+it.gi/NN*.25,.75+it.gi/NN*.25,f); it.app=app;
      const ang=rg.phase+it.idx*TAU/it.n; const rf=lerp(1.9,1,app);
      const pos=(a,out)=>{ out.set(Math.cos(a)*rg.R*rf/rg.R,Math.sin(a)*rf,0); return out; };
      // local (unit-ring) → universe frame via ring matrix (includes radius scale)
      pos(ang,tmp).applyMatrix4(rg.g.matrix); it.pos.copy(tmp);
      // hover: node pulls slightly toward the cursor and slows down
      const hv=(S.hov===it&&S.src==='node')||(curSel()===it); it.pull+=((hv?1:0)-it.pull)*(1-Math.exp(-dt*6));
      if(it.pull>.01&&inside){ tmp2.set(mN.x,mN.y,.5).unproject(camera); universe.worldToLocal(tmp2); it.pos.lerp(tmp2.set(tmp2.x,tmp2.y,it.pos.z),it.pull*.14); }
      // brightness / reveal targets
      let bt=it.featured?.62:.3, rt=it.featured?1:0;
      if(S.actCat>=0){ bt=it.cat===S.actCat?1.1:(it.featured?.26:.1); rt=it.cat===S.actCat?1:(it.featured?.35:0); }
      if(S.hovCat===it.cat){ bt=Math.max(bt,1); rt=Math.max(rt,it.featured?1:.85); }
      if(sel){ if(it===sel){bt=1.9;rt=1;} else if(relSet.has(it)){bt=1.15;rt=1;} else bt*=.5; }
      else if(hasQ){ if(S.match.has(it)){bt=1.8;rt=1;} else if(S.relQ.has(it)){bt=.75;rt=.8;} else {bt=.12;rt*=.25;} }
      it.b+=(bt-it.b)*(1-Math.exp(-dt*6)); it.rev+=(rt-it.rev)*(1-Math.exp(-dt*5));
      const vis_=it.b*app*sRing;
      const k=it.gi; nP.position.setXYZ(k,it.pos.x,it.pos.y,it.pos.z); nP.aB.setX(k,vis_*.9); nP.aS.setX(k,(it.featured?7:4.5)*(1+it.pull*.9)*(.7+.3*Math.min(it.b,1.4)));
      for(let j=0;j<TRN;j++){ pos(ang-rg.dir*(j+1)*.075,tmp3).applyMatrix4(rg.g.matrix); const o=k*TRN+j; tP.position.setXYZ(o,tmp3.x,tmp3.y,tmp3.z); tP.aB.setX(o,vis_*.5*(1-j/TRN)*(it.featured||it.b>.5?1:.4)); tP.aS.setX(o,3.2*(1-j/TRN*.6)); }
      // project for the label
      tmp.copy(it.pos); universe.localToWorld(tmp); const vv=tmp2.copy(tmp).applyMatrix4(camera.matrixWorldInverse); const depth=-vv.z;
      tmp.project(camera); it.sx=(tmp.x*.5+.5)*cvw; it.sy=(-tmp.y*.5+.5)*cvh; it.depth=depth; it.vis=it.rev*app*sRing>.05;
    });
    nP.position.needsUpdate=nP.aB.needsUpdate=nP.aS.needsUpdate=true; tP.position.needsUpdate=tP.aB.needsUpdate=tP.aS.needsUpdate=true;

    /* connections: selected → related, plus energy into the sphere */
    const center=sel||(hasQ&&S.match.size===1?[...S.match][0]:null);
    if(center!==lineCenter&&center){ lineCenter=center; lineRel=center.rel.slice(); lineT0=T; }
    const cp=cg.attributes.position;
    const bez=(a,b,c,d,idx)=>{ for(let k=0;k<SEG;k++){ for(let e=0;e<2;e++){ const t=(k+e)/SEG, u=1-t; const o=(idx*SEG+k)*2+e; cp.setXYZ(o,u*u*a.x+2*u*t*c.x+t*t*b.x,u*u*a.y+2*u*t*c.y+t*t*b.y,u*u*a.z+2*u*t*c.z+t*t*b.z); } } };
    for(let i=0;i<NL;i++){
      let tgt=center?1:0, end=null;
      if(lineCenter){ if(i===0){ end=tmp3.copy(lineCenter.dir).applyMatrix4(sphereG.matrix); } else if(lineRel[i-1]) end=lineRel[i-1].pos; else tgt=0; }
      const delay=i*.09; const want=(center&&T-lineT0>delay)?1:0; grow[i]+=(want-grow[i])*(1-Math.exp(-dt*(want?3.2:5))); if(!center&&grow[i]<.01) grow[i]=0; connU.uGrow.value[i]=grow[i]*sSphere;
      if(end&&lineCenter){ const a=lineCenter.pos, b=end; tmp.copy(a).add(b).multiplyScalar(.5); const c=tmp2.copy(tmp); if(c.lengthSq()>1e-4) c.addScaledVector(tmp.clone().normalize(),.45); bez(a,b,c,null,i); }
    }
    cp.needsUpdate=true;

    /* render */
    if(rd) rd.render(scene,camera);

    /* labels */
    M.forEach(it=>{
      const el=it.el, o=it.rev*it.app*sRing; if(o<.04){ if(it.el._v){ el.style.visibility='hidden'; el.style.pointerEvents='none'; it.el._v=false; } return; }
      if(!it.el._v){ el.style.visibility='visible'; it.el._v=true; }
      const df=CAM/Math.max(it.depth,3), sc=clamp(df*df*(.86+it.pull*.35),.6,1.4), dop=clamp(.55+.6*(df-.85),.35,1);
      const op=clamp(o*dop*(.4+Math.min(it.b,1.2)*.6),0,1);
      el.style.opacity=op.toFixed(3); el.style.transform=`translate3d(${it.sx.toFixed(1)}px,${it.sy.toFixed(1)}px,0) translate(-50%,-50%) scale(${sc.toFixed(3)})`;
      el.style.pointerEvents=op>.4?'auto':'none'; el.style.zIndex=String(Math.round(200-it.depth*10));
      if(rd&&it.cat<cent.length&&it.b>.3){ const c=cent[it.cat]; c.x+=it.sx; c.y+=it.sy; c.n++; }
    });

    /* magnetic chips */
    if(!coarse&&f>.5){ const lr=leftEl.getBoundingClientRect(); const near=input.hasPointer&&px>lr.left-40&&px<lr.right+40;
      chipEls.forEach((el,i)=>{ const m=mag[i]; let tx=0,ty=0;
        if(near){ const b=el.getBoundingClientRect(); if(b.width){ const cx=b.left+b.width/2, cy=b.top+b.height/2, dx=px-cx, dy=py-cy, d=Math.hypot(dx,dy); if(d<120){ const fk=1-d/120; tx=clamp(dx/(d+10)*8*fk*1.6,-8,8); ty=clamp(dy/(d+10)*8*fk*1.6,-8,8); } } }
        const n=Math.max(1,Math.ceil(dt/.008)), h=dt/n; for(let s=0;s<n;s++){ m.vx+=((tx-m.x)*150-m.vx*14)*h; m.vy+=((ty-m.y)*150-m.vy*14)*h; m.x+=m.vx*h; m.y+=m.vy*h; }
        if(Math.abs(m.x)>.02||Math.abs(m.y)>.02||tx||ty) el.style.translate=`${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`; else if(el.style.translate) el.style.translate=''; }); }

    /* popup placement */
    if(pop.classList.contains('show')&&sel){ const anchor=(S.src==='node'&&sel.vis)?{x:cr.left+sel.sx,y:cr.top+sel.sy}:(()=>{ const b=sel.chip.getBoundingClientRect(); return {x:b.left+b.width/2,y:b.top}; })(); popPlace(dt,anchor); } else pp.init=pp.init&&pop.classList.contains('show');

    /* fx canvas */
    fx.clearRect(0,0,FW,FH); fx.globalCompositeOperation='lighter';
    // card → universe energy line + attraction particles
    const ci=S.hovCat>=0?S.hovCat:-1;
    if(ci>=0&&cards[ci]&&f>.6){
      const b=cards[ci].getBoundingClientRect(), ce=cent[ci];
      if(!Lo.mobile&&ce&&ce.n){ const ex=cr.left+ce.x/ce.n, ey=cr.top+ce.y/ce.n, sx=b.right, sy=b.top+b.height/2; const mx=(sx+ex)/2, my=Math.min(sy,ey)-60;
        fx.lineCap='round'; fx.strokeStyle='rgba(60,140,255,.18)'; fx.lineWidth=5; fx.beginPath(); fx.moveTo(sx,sy); fx.quadraticCurveTo(mx,my,ex,ey); fx.stroke();
        fx.setLineDash([10,8]); fx.lineDashOffset=-T*60; fx.strokeStyle='rgba(150,205,255,.85)'; fx.lineWidth=1.2; fx.beginPath(); fx.moveTo(sx,sy); fx.quadraticCurveTo(mx,my,ex,ey); fx.stroke(); fx.setLineDash([]);
        for(let k=0;k<3;k++){ const t=((T*.5+k/3)%1), u=1-t, x=u*u*sx+2*u*t*mx+t*t*ex, y=u*u*sy+2*u*t*my+t*t*ey; const g=fx.createRadialGradient(x,y,0,x,y,7); g.addColorStop(0,'rgba(200,230,255,.95)'); g.addColorStop(1,'rgba(45,123,255,0)'); fx.fillStyle=g; fx.fillRect(x-7,y-7,14,14); } }
      attrSpawn.t+=dt*(small?10:22); while(attrSpawn.t>1&&attr.length<70){ attrSpawn.t-=1; const a=R()*TAU, d=90+R()*140; attr.push({sx:b.left+b.width/2+Math.cos(a)*(b.width*.5+d),sy:b.top+b.height/2+Math.sin(a)*(b.height*.5+d*.6),tx:b.left+R()*b.width,ty:b.top+R()*b.height,p:0,m:.9+R()*.6}); }
    }
    for(let i=attr.length-1;i>=0;i--){ const a=attr[i]; a.p+=dt/a.m; if(a.p>=1||ci<0&&a.p>.5){ attr.splice(i,1); continue; } const e=1-Math.pow(1-a.p,3), x=lerp(a.sx,a.tx,e), y=lerp(a.sy,a.ty,e), al=Math.sin(a.p*Math.PI)*.8; const g=fx.createRadialGradient(x,y,0,x,y,5); g.addColorStop(0,`rgba(190,225,255,${al})`); g.addColorStop(1,'rgba(45,123,255,0)'); fx.fillStyle=g; fx.fillRect(x-5,y-5,10,10); }
    // node energy rings while a node is selected
    if(sel&&sel.vis&&S.src==='node'){ ringT+=dt; if(ringT>1.1){ ringT=0; nrings.push({x:cr.left+sel.sx,y:cr.top+sel.sy,t:0}); } } else ringT=1;
    for(let i=nrings.length-1;i>=0;i--){ const q=nrings[i]; q.t+=dt/1.0; if(q.t>=1){ nrings.splice(i,1); continue; } if(sel&&sel.vis&&S.src==='node'&&i===nrings.length-1){ q.x=cr.left+sel.sx; q.y=cr.top+sel.sy; } const e=1-Math.pow(1-q.t,3); fx.strokeStyle=`rgba(120,190,255,${(1-q.t)*.85})`; fx.lineWidth=1.4; fx.shadowColor='rgba(45,123,255,.9)'; fx.shadowBlur=10; fx.beginPath(); fx.arc(q.x,q.y,14+e*34,0,TAU); fx.stroke(); fx.shadowBlur=0; }
    // bursts
    for(let i=bursts.length-1;i>=0;i--){ const p=bursts[i]; p.l+=dt; if(p.l>p.m){ bursts.splice(i,1); continue; } const k=1-p.l/p.m; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=.94; p.vy*=.94; const g=fx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.s*4); g.addColorStop(0,`rgba(200,230,255,${k*.95})`); g.addColorStop(.4,`rgba(70,140,255,${k*.55})`); g.addColorStop(1,'rgba(30,80,255,0)'); fx.fillStyle=g; fx.fillRect(p.x-p.s*4,p.y-p.s*4,p.s*8,p.s*8); }
    fx.globalCompositeOperation='source-over';
    // occasional micro flicker on a random visible label
    if(R()<dt*.25){ const c=M.filter(m=>m.vis&&m.featured); if(c.length){ const el=c[(R()*c.length)|0].el; el.classList.remove('fl'); void el.offsetWidth; el.classList.add('fl'); } }
  }
  refresh(); requestAnimationFrame(frame);
}
initSkills();


/* ═══════════════════════════════════════════════════════════════════
   SCENE 4 — PROJECTS : a gallery inside the same digital universe
   Map of the requested components/hooks → code sections below:
     ProjectsSection / useScrollProgress ... "frame(): entry / exit"
     ProjectsHeader ........................ header (.pjrv)
     ProjectGrid / ProjectCard ............. build() + per-card state
     ProjectImage .......................... mock() + parallax
     ProjectTags / GithubButton ............ template + pj-gh
     ProjectParticles / CursorEnergy ....... 2D fx overlay
     ProjectBackground / ProjectOrb ........ WebGL scene (THREE.Points)
     ProjectNavigation ..................... go() pagination
     useCardTilt / useProjectHover ......... springs in frame()
     useMousePosition ...................... shared `input`
   ═══════════════════════════════════════════════════════════════════ */
function initProjects(){
  const sec=$('#projects'); if(!sec||!window.PJ) return;
  const DATA=window.PJ.projects||[], PER=Math.max(1,window.PJ.perPage||6);
  const grid=$('#pjGrid'), nav=$('#pjNav'), prevB=$('#pjPrev'), nextB=$('#pjNext'), ind=$('#pjInd'), cvs=$('#gl4'), fxc=$('#pjFx'), layerEl=$('#pjLayer');
  const heads=[...sec.querySelectorAll('.pjrv')];
  const R=Math.random, TAU=Math.PI*2, small=coarse||innerWidth<=820;
  const smooth=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  sec.classList.add('js'); if(coarse) sec.classList.add('touch');
  const pages=Math.max(1,Math.ceil(DATA.length/PER)); let page=0;
  nav.hidden=pages<=1;

  /* ───────── generated UI-preview placeholder (used until you set `image`) ───────── */
  function mock(i,p){
    const v=i%3, t=esc(p.title||'Project'), b=['#3d8bff','#28d7ff','#6d7dff'][v];
    let body='';
    if(v===0) body=`<rect x="0" y="34" width="118" height="366" fill="#0a1430"/>${[0,1,2,3,4].map(k=>`<rect x="16" y="${60+k*34}" width="${70-k*6}" height="8" rx="4" fill="${k===1?b:'#22336a'}"/>`).join('')}
      ${[0,1,2].map(k=>`<rect x="${140+k*160}" y="56" width="146" height="70" rx="8" fill="#0d1a3c" stroke="#1d3a86"/><rect x="${154+k*160}" y="72" width="60" height="8" rx="4" fill="#3b5bb0"/><rect x="${154+k*160}" y="92" width="90" height="16" rx="4" fill="${b}" opacity=".85"/>`).join('')}
      <rect x="140" y="146" width="466" height="230" rx="8" fill="#0b1633" stroke="#1d3a86"/><path d="M160 340 L220 300 L280 318 L340 250 L400 270 L460 200 L520 226 L588 170" fill="none" stroke="${b}" stroke-width="3"/><path d="M160 340 L220 300 L280 318 L340 250 L400 270 L460 200 L520 226 L588 170 L588 360 L160 360Z" fill="${b}" opacity=".12"/>`;
    else if(v===1) body=`<circle cx="470" cy="210" r="120" fill="none" stroke="${b}" stroke-width="2" opacity=".5"/><circle cx="470" cy="210" r="78" fill="${b}" opacity=".18"/><circle cx="470" cy="210" r="40" fill="${b}" opacity=".5"/>
      <rect x="48" y="96" width="250" height="18" rx="9" fill="#e4eeff" opacity=".9"/><rect x="48" y="128" width="200" height="18" rx="9" fill="${b}"/><rect x="48" y="176" width="270" height="8" rx="4" fill="#3b5bb0"/><rect x="48" y="194" width="230" height="8" rx="4" fill="#3b5bb0"/><rect x="48" y="212" width="250" height="8" rx="4" fill="#3b5bb0"/>
      <rect x="48" y="256" width="110" height="34" rx="17" fill="${b}"/><rect x="172" y="256" width="110" height="34" rx="17" fill="none" stroke="${b}"/>${[0,1,2,3].map(k=>`<rect x="${48+k*76}" y="332" width="64" height="40" rx="6" fill="#0d1a3c" stroke="#1d3a86"/>`).join('')}`;
    else body=`<rect x="24" y="52" width="300" height="330" rx="8" fill="#0a1430" stroke="#1d3a86"/>${[0,1,2,3,4,5,6,7,8,9].map(k=>`<rect x="44" y="${74+k*30}" width="${[180,120,220,90,160,200,110,240,140,170][k]}" height="8" rx="4" fill="${k%4===0?b:'#3b5bb0'}" opacity="${k%4===0?.95:.6}"/>`).join('')}
      <rect x="344" y="52" width="272" height="150" rx="8" fill="#0b1633" stroke="#1d3a86"/><path d="M362 176 L398 140 L434 158 L470 104 L506 128 L542 90 L598 116" fill="none" stroke="${b}" stroke-width="3"/>
      <rect x="344" y="218" width="272" height="164" rx="8" fill="#060d20" stroke="#1d3a86"/>${[0,1,2,3,4].map(k=>`<rect x="362" y="${240+k*28}" width="${[150,200,110,180,90][k]}" height="7" rx="3.5" fill="${k===4?b:'#3b5bb0'}" opacity=".8"/>`).join('')}`;
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a1736"/><stop offset="1" stop-color="#040a1c"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><rect width="640" height="34" fill="#08122b"/><circle cx="18" cy="17" r="4.5" fill="#2a4a9a"/><circle cx="34" cy="17" r="4.5" fill="#2a4a9a"/><circle cx="50" cy="17" r="4.5" fill="#2a4a9a"/><text x="76" y="21" font-family="ui-monospace,Menlo,monospace" font-size="11" fill="#6f8bd6">${t}</text>${body}</svg>`;
    return 'data:image/svg+xml;utf8,'+encodeURIComponent(svg);
  }

  /* ───────── cards ───────── */
  let cards=[], T=0, entered=false, enterT=0, busy=false, hoverAny=false;
  const nextSlot={t:0}, pm={x:0,y:0};
  const easeO=t=>1-Math.pow(1-t,3);
  const GH='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.42c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>';
  function build(pi,dir){
    grid.innerHTML=''; cards=[];
    DATA.slice(pi*PER,pi*PER+PER).forEach((p,i)=>{
      const gi=pi*PER+i, url=esc(p.github||'#');
      const slot=document.createElement('div'); slot.className='pj-slot';
      slot.innerHTML=`<article class="pj-card" aria-label="${esc(p.title)}">
        <a class="pj-hit" href="${url}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"></a>
        <svg class="pj-edge" aria-hidden="true"><rect class="t" pathLength="100" x="0" y="0" width="100%" height="100%" rx="10" ry="10"/><rect pathLength="100" x="0" y="0" width="100%" height="100%" rx="10" ry="10"/></svg>
        <div class="pj-flash"></div>
        <div class="pj-img"><img alt="${esc(p.title)} preview" decoding="async"><div class="pj-shade"></div></div>
        <div class="pj-info">
          <div class="pj-top"><h3 class="pj-title">${esc(p.title)}</h3><span class="pj-num">${String(gi+1).padStart(2,'0')}</span></div>
          <span class="pj-cat">${esc(p.category)}</span>
          <div class="pj-more"><p class="pj-desc">${esc(p.description)}</p>
            <div class="pj-tags">${(p.technologies||[]).slice(0,4).map(t=>`<span>${esc(t)}</span>`).join('')}</div></div>
          <a class="pj-gh" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="View ${esc(p.title)} on GitHub">${GH}<span>View on GitHub</span><i class="arw">→</i></a>
        </div></article>`;
      grid.appendChild(slot);
      const img=slot.querySelector('img'), st={ slot, card:slot.firstElementChild, img, btn:slot.querySelector('.pj-gh'), hit:slot.querySelector('.pj-hit'), p, gi,
        hover:false, gh:false, active:false, hv:0, vhv:0, rx:0, ry:0, vrx:0, vry:0, px:0, py:0, dim:1, out:0, ox:dir?dir*70:0, vox:0, started:false, startAt:0, k:0, ik:0, pulse:0, accT:0, ghT:0 };
      img.onload=()=>img.classList.add('ld'); img.onerror=()=>{ img.onerror=null; img.src=mock(gi,p); };
      img.src=p.image?p.image:mock(gi,p);
      if(dir){ st.started=true; st.startAt=T+i*.09; }
      // events
      slot.addEventListener('pointerenter',e=>{ if(e.pointerType==='touch') return; st.hover=true; slot.classList.add('hv'); burstCard(st,small?10:24); });
      slot.addEventListener('pointerleave',e=>{ st.hover=false; st.gh=false; slot.classList.remove('hv'); });
      st.btn.addEventListener('pointerenter',e=>{ if(e.pointerType==='touch') return; burstBtn(st,10); st.gh=true; });
      st.btn.addEventListener('pointerleave',()=>{ st.gh=false; });
      [st.hit,st.btn].forEach(a=>a.addEventListener('click',e=>openRepo(e,st)));
      slot.addEventListener('click',e=>{ if(!coarse||e.target.closest('.pj-gh')) return; const on=!st.active; cards.forEach(c=>{ c.active=false; c.card.classList.remove('on'); }); st.active=on; st.card.classList.toggle('on',on); if(on) burstCard(st,10); });
      cards.push(st);
    });
    ind.textContent=`${String(pi+1).padStart(2,'0')} / ${String(pages).padStart(2,'0')}`;
  }
  function openRepo(e,st){
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
    e.preventDefault(); st.pulse=1; pulseRing(st);
    const url=st.p.github; setTimeout(()=>{ window.open(url,'_blank','noopener,noreferrer'); },220);
  }
  build(0,0);

  /* pagination: instant, no animation — requested static */
  function go(dir){
    if(busy||pages<2) return; busy=true;
    page=(page+dir+pages)%pages; build(page,0); busy=false;
  }
  prevB.addEventListener('click',()=>go(-1)); nextB.addEventListener('click',()=>go(1));
  addEventListener('keydown',e=>{ if(!sec.classList.contains('vis')) return; if(e.key==='ArrowRight') go(1); if(e.key==='ArrowLeft') go(-1); });

  /* ───────── 2D FX: card particles, button particles, click pulse ───────── */
  const fx=fxc.getContext('2d'); let FW=0,FH=0; const parts=[], pulses=[];
  function sizeFx(){ const d=Math.min(devicePixelRatio||1,2); FW=innerWidth; FH=innerHeight; fxc.width=FW*d; fxc.height=FH*d; fx.setTransform(d,0,0,d,0,0); }
  addEventListener('resize',sizeFx); sizeFx();
  function edgePoint(r){ const per=2*(r.width+r.height); let d=R()*per, x,y,nx=0,ny=0; if(d<r.width){x=r.left+d;y=r.top;ny=-1;} else if((d-=r.width)<r.height){x=r.right;y=r.top+d;nx=1;} else if((d-=r.height)<r.width){x=r.right-d;y=r.bottom;ny=1;} else {d-=r.width;x=r.left;y=r.bottom-d;nx=-1;} return {x,y,nx,ny}; }
  function burstCard(st,n){ const r=st.slot.getBoundingClientRect(); for(let i=0;i<n&&parts.length<(small?60:140);i++){ const e=edgePoint(r), sp=18+R()*55; parts.push({x:e.x,y:e.y,vx:e.nx*sp+(R()-.5)*22,vy:e.ny*sp+(R()-.5)*22-8,l:0,m:.55+R()*.5,s:.7+R()*1.4}); } }
  function burstBtn(st,n){ const r=st.btn.getBoundingClientRect(); for(let i=0;i<n&&parts.length<160;i++){ const e=edgePoint(r), sp=14+R()*40; parts.push({x:e.x,y:e.y,vx:e.nx*sp+(R()-.5)*16,vy:e.ny*sp+(R()-.5)*16-6,l:0,m:.5+R()*.4,s:.6+R()*1.1}); } }
  function pulseRing(st){ pulses.push({r:st.slot.getBoundingClientRect(),t:0}); }

  /* ───────── background: particles + faint holographic orb (THREE.Points) ───────── */
  let rd=null; try{ rd=new THREE.WebGLRenderer({canvas:cvs,antialias:false,alpha:true,powerPreference:'high-performance'}); }catch(e){ rd=null; }
  const CAM=8, FOV=30, camera=new THREE.PerspectiveCamera(FOV,1,.1,80), scene=new THREE.Scene();
  const TIME={value:0}, PXU={value:1};
  const BLUEc=new THREE.Color(.10,.44,1), CYANc=new THREE.Color(.10,.72,1), ICEc=new THREE.Color(.66,.86,1);
  const ADD={ blending:THREE.CustomBlending, blendEquation:THREE.AddEquation, blendSrc:THREE.OneFactor, blendDst:THREE.OneFactor, blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor, transparent:true, depthWrite:false, depthTest:false };
  const orb=new THREE.Group(), dustG=new THREE.Group(); scene.add(orb,dustG);
  const OU={ uTime:TIME,uPx:PXU,uSizeK:{value:1},uForm:{value:0},uGlobal:{value:0},uCam:{value:CAM},uCol:{value:BLUEc},uCyan:{value:CYANc} };
  const fib=(i,n)=>{ const y=1-(i+.5)*2/n, r=Math.sqrt(Math.max(0,1-y*y)), th=i*2.399963; return new THREE.Vector3(Math.cos(th)*r,y,Math.sin(th)*r); };
  const ORB_COMMON=`attribute vec3 aDir; attribute vec4 aSeed; uniform float uTime,uPx,uSizeK,uForm,uGlobal,uCam; varying float vI,vMix;
    vec3 form(out float e){ float t=clamp((uForm-aSeed.x*.45)/.55,0.,1.); e=1.-(1.-t)*(1.-t)*(1.-t);
      vec3 sc=aDir*(4.+aSeed.y*9.)+(aSeed.zwx-.5)*4.; vec3 tg=aDir*(1.+(aSeed.z-.5)*.03+.01*sin(uTime*.5+aSeed.w*30.));
      vec3 p=mix(sc,tg,e); p+=vec3(sin(aSeed.y*61.+t*5.),cos(aSeed.z*47.+t*4.),sin(aSeed.w*53.+t*6.))*sin(t*3.1416)*(.8+aSeed.x); return p; }`;
  const NS=small?1100:3400;
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NS*3),3));
  { const d=new Float32Array(NS*3), s=new Float32Array(NS*4); for(let i=0;i<NS;i++){ const v=fib(i,NS); d.set([v.x,v.y,v.z],i*3); s.set([R(),R(),R(),R()],i*4); }
    sg.setAttribute('aDir',new THREE.BufferAttribute(d,3)); sg.setAttribute('aSeed',new THREE.BufferAttribute(s,4)); }
  const orbPts=new THREE.Points(sg,new THREE.ShaderMaterial({...ADD,uniforms:OU,vertexShader:ORB_COMMON+`
    void main(){ float e; vec3 p=form(e); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
      float tw=.6+.4*sin(uTime*1.2+aSeed.w*40.); gl_PointSize=(.9+aSeed.z*.9)*uPx*uSizeK*(uCam/max(-mv.z,2.)); vI=(.4+.6*tw)*mix(.2,1.,e)*uGlobal*.55; vMix=aSeed.y; }`,
    fragmentShader:`precision highp float; uniform vec3 uCol,uCyan; varying float vI,vMix; void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard; float g=exp(-d*d*13.), core=exp(-d*d*70.); gl_FragColor=vec4(mix(uCol,uCyan,vMix*.5)*(g*.7+core*1.4)*vI,1.); }`}));
  orbPts.frustumCulled=false; orb.add(orbPts);
  { const LN=small?90:240, pts=[]; for(let i=0;i<LN;i++) pts.push(fib((R()*NS)|0,NS)); const A=[],Sd=[];
    pts.forEach((p,i)=>{ pts.map((q,j)=>({j,d:j===i?-2:p.dot(q)})).sort((a,b)=>b.d-a.d).slice(0,2).forEach(o=>{ [p,pts[o.j]].forEach(v=>{ A.push(v.x,v.y,v.z); Sd.push(R(),R(),R(),R()); }); }); });
    const lg=new THREE.BufferGeometry(); lg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(A.length),3)); lg.setAttribute('aDir',new THREE.BufferAttribute(new Float32Array(A),3)); lg.setAttribute('aSeed',new THREE.BufferAttribute(new Float32Array(Sd),4));
    const ls=new THREE.LineSegments(lg,new THREE.ShaderMaterial({...ADD,uniforms:OU,vertexShader:ORB_COMMON+`void main(){ float e; vec3 p=form(e); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); vI=.2*smoothstep(.6,1.,e)*uGlobal; vMix=0.; }`,
      fragmentShader:`precision highp float; uniform vec3 uCol; varying float vI; void main(){ gl_FragColor=vec4(uCol*vI,1.); }`})); ls.frustumCulled=false; orb.add(ls); }
  const ringFS=`precision highp float; uniform float uTime,uR,uW,uInt,uRot; uniform vec3 uCol,uHot; varying vec2 vP;
    void main(){ float len=length(vP), ang=atan(vP.y,vP.x); float d=abs(len-uR); if(d>uW*70.) discard; float core=exp(-(d/uW)*(d/uW)); float glow=exp(-d/(uW*11.))*.3+exp(-d/(uW*45.))*.08;
      float comet=pow(.5+.5*cos(ang-uRot),9.); float I=(core*(.28+.72*comet)+glow*(.3+comet))*(.9+.1*sin(uTime*1.4))*uInt; gl_FragColor=vec4(mix(uCol,uHot,clamp(core*comet*1.2,0.,1.))*I,1.); }`;
  const rings=[[1.32,1.1,.25,26],[1.62,.86,-.6,38]].map(([Rr,tx,rz,per],i)=>{ const g=new THREE.Group(); g.rotation.order='ZXY'; g.rotation.set(tx,0,rz); g.scale.setScalar(Rr); orb.add(g);
    const U={uTime:TIME,uR:{value:1},uW:{value:.005},uInt:{value:0},uRot:{value:0},uCol:{value:BLUEc},uHot:{value:ICEc}};
    const m=new THREE.Mesh(new THREE.PlaneGeometry(3.2,3.2),new THREE.ShaderMaterial({...ADD,uniforms:U,vertexShader:`varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,fragmentShader:ringFS})); m.frustumCulled=false; g.add(m); return {U,per,dir:i?-1:1}; });
  const dotFS=`precision highp float; uniform vec3 uCol; varying float vA; void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard; gl_FragColor=vec4(uCol*(exp(-d*d*20.)*.75+exp(-d*d*110.)*1.4)*vA,1.); }`;
  const mkPts=(cnt,vs,uni,seedFn,extraK)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cnt*3),3)); const s=new Float32Array(cnt*4); for(let i=0;i<cnt;i++) s.set(seedFn(i),i*4); g.setAttribute('aSeed',new THREE.BufferAttribute(s,4));
    if(extraK){ const k=new Float32Array(cnt); for(let i=0;i<cnt;i++) k[i]=extraK(i); g.setAttribute('aK',new THREE.BufferAttribute(k,1)); }
    const p=new THREE.Points(g,new THREE.ShaderMaterial({...ADD,vertexShader:vs,fragmentShader:dotFS,uniforms:uni})); p.frustumCulled=false; return p; };
  const dustVS=`attribute vec4 aSeed; uniform float uTime,uPx,uSpeed,uZ,uSize,uGlobal,uScroll; uniform vec2 uBox; varying float vA;
    void main(){ vec3 p; p.x=(aSeed.x-.5)*uBox.x; float u=fract(aSeed.y+uTime*uSpeed*(.4+aSeed.w)/uBox.y+uScroll); p.y=(u-.5)*uBox.y; p.z=uZ+(aSeed.z-.5)*1.6;
      float br=1.+.06*sin(uTime*.18+aSeed.w*6.28); p.xy*=br;                      // slow drift toward / away from centre
      p.x+=sin(uTime*.12+aSeed.w*30.)*.08; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uSize*(.5+aSeed.w)*uPx*(${CAM.toFixed(1)}/-mv.z);
      vA=(.3+.7*(.5+.5*sin(uTime*(.6+aSeed.w)+aSeed.x*50.)))*smoothstep(0.,.15,u)*smoothstep(1.,.85,u)*uGlobal; }`;
  const mkDust=(cnt,z,size,speed,alpha)=>{ const p=mkPts(cnt,dustVS,{uTime:TIME,uPx:PXU,uSpeed:{value:speed},uZ:{value:z},uSize:{value:size},uGlobal:{value:0},uScroll:{value:0},uBox:{value:new THREE.Vector2(14,9)},uCol:{value:new THREE.Color(.22,.5,1).multiplyScalar(alpha)}},()=>[R(),R(),R(),R()]); dustG.add(p); return p; };
  const dB=mkDust(small?60:170,-5,2.2,.1,.85), dM=mkDust(small?26:70,-1.5,2.8,.14,.9), dF=mkDust(small?5:12,2.6,5,.2,.4);
  const TR=8, CN=small?8:20, cU={uTime:TIME,uPx:PXU,uCol:{value:BLUEc},uGlobal:{value:0}};
  { const g=new THREE.BufferGeometry(), cnt=CN*TR; g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cnt*3),3)); const s=new Float32Array(cnt*4), k=new Float32Array(cnt);
    for(let i=0;i<cnt;i++){ const c=(i/TR)|0; const r=x=>{ const v=Math.sin(c*127.1+x*311.7)*43758.5453; return v-Math.floor(v); }; s.set([r(1),r(2),r(3),r(4)],i*4); k[i]=i%TR; }
    g.setAttribute('aSeed',new THREE.BufferAttribute(s,4)); g.setAttribute('aK',new THREE.BufferAttribute(k,1));
    const comets=new THREE.Points(g,new THREE.ShaderMaterial({...ADD,uniforms:cU,fragmentShader:dotFS,vertexShader:`attribute vec4 aSeed; attribute float aK; uniform float uTime,uPx,uGlobal; varying float vA;
      void main(){ float sp=.05+aSeed.y*.045; float t=fract(uTime*sp+aSeed.x)-aK*.011; vec3 S=vec3(mix(-8.,8.,aSeed.z),mix(-5.,5.,aSeed.w),-8.-aSeed.y*5.); vec3 E=vec3((aSeed.z-.5)*1.4,(aSeed.w-.5)*1.4,-.5);
        float e=t*t*(3.-2.*t); vec3 p=mix(S,E,e); p+=vec3(sin(e*6.+aSeed.x*30.),cos(e*5.+aSeed.y*30.),0.)*(1.-e)*1.2*sin(e*3.1416);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; float k=1.-aK/${TR.toFixed(1)}; gl_PointSize=(3.*(1.-aK*.09))*uPx*(${CAM.toFixed(1)}/-mv.z);
        vA=step(0.,t)*smoothstep(0.,.15,t)*(1.-smoothstep(.8,1.,t))*k*k*.8*uGlobal; }`})); comets.frustumCulled=false; dustG.add(comets); }

  const Lo={W:1,H:1,viewW:1,viewH:1};
  function layout(){
    if(!rd) return; const W=cvs.clientWidth||innerWidth, H=cvs.clientHeight||innerHeight; Lo.W=W; Lo.H=H;
    const dpr=Math.min(devicePixelRatio||1,coarse?1.5:2); rd.setPixelRatio(dpr); rd.setSize(W,H,false); PXU.value=dpr;
    camera.aspect=W/H; camera.updateProjectionMatrix(); Lo.viewH=2*CAM*Math.tan(FOV*RAD/2); Lo.viewW=Lo.viewH*camera.aspect;
    orb.scale.setScalar(Math.min(Lo.viewH*.46,Lo.viewW*.34)); OU.uSizeK.value=Math.max(1.5,Math.min(3,orb.scale.x*2.1));
    [dB,dM,dF].forEach((d,i)=>d.material.uniforms.uBox.value.set(Lo.viewW*[2.6,1.7,1.2][i],Lo.viewH*[2.6,1.7,1.3][i]));
  }
  addEventListener('resize',layout); layout();

  /* ───────── frame ───────── */
  let last=performance.now(), bgT=0;
  function frame(now){
    requestAnimationFrame(frame);
    const dt=Math.min((now-last)/1000,.05); last=now;
    const vh=innerHeight, W=innerWidth, r=sec.getBoundingClientRect();
    const far=r.bottom<-150||r.top>vh+150;
    sec.classList.toggle('vis',!far);
    if(far){ if(entered){ entered=false; cards.forEach(c=>{ c.started=false; c.k=0; c.ik=0; }); heads.forEach(h=>h.style.setProperty('--k','0')); } if(fxc.style.display!=='none') fxc.style.display='none'; return; }
    fxc.style.display='block'; T+=dt*MOTION; TIME.value=T;
    if(!entered&&r.top<vh*.85&&r.bottom>vh*.15){ entered=true; enterT=T; nextSlot.t=T+.7; cards.forEach(c=>{ if(!c.leaving){ c.started=false; c.k=0; c.ik=0; } }); }
    const since=entered?T-enterT:0;

    /* pointer (smoothed) → parallax layers */
    pm.x+=(input.tx-pm.x)*(1-Math.exp(-dt*4)); pm.y+=(input.ty-pm.y)*(1-Math.exp(-dt*4));
    grid.style.transform=`translate3d(${(pm.x*W*.01).toFixed(2)}px,${(-pm.y*vh*.01).toFixed(2)}px,0)`;            // cards   .01
    layerEl.style.transform=`translate3d(${(pm.x*W*.02).toFixed(2)}px,${(-pm.y*vh*.02).toFixed(2)}px,0)`;         // bg      .02

    /* header (first) */
    heads.forEach((h,i)=>h.style.setProperty('--k',easeO(clamp((since-.25-i*.13)/.9,0,1)).toFixed(3)));

    /* background scene: particles first → orb → (heading, cards) ; orb fades on exit */
    const sDust=smooth(0,.9,since), sOrb=smooth(.3,2.0,since), orbFade=smooth(vh*.05,vh*.75,r.bottom);
    OU.uForm.value=sOrb; OU.uGlobal.value=sOrb*orbFade; cU.uGlobal.value=sDust; [dB,dM,dF].forEach(d=>d.material.uniforms.uGlobal.value=sDust);
    orb.rotation.y+=.06*dt*MOTION; orb.rotation.x=.25+Math.sin(T*.05)*.05;                                      // slow: ≈ +0.001 / frame
    rings.forEach(rg=>{ rg.U.uInt.value=sOrb*orbFade*.55; rg.U.uRot.value=(T/rg.per)*TAU*rg.dir; });
    orb.position.set(pm.x*Lo.viewW*.04,pm.y*Lo.viewH*.04,0);                                                     // orb     .04
    dB.position.set(pm.x*Lo.viewW*.04,pm.y*Lo.viewH*.04,0); dM.position.set(pm.x*Lo.viewW*.06,pm.y*Lo.viewH*.06,0); dF.position.set(pm.x*Lo.viewW*.09,pm.y*Lo.viewH*.09,0); // particles .06
    camera.position.set(0,0,CAM); camera.lookAt(0,0,0);
    if(rd) rd.render(scene,camera);

    /* cards */
    hoverAny=cards.some(c=>c.hover||c.active);
    cards.forEach((st,i)=>{
      const rc=st.slot.getBoundingClientRect(), vis=rc.top<vh*.92&&rc.bottom>0;
      if(entered&&!st.started&&vis&&!st.leaving){ st.startAt=Math.max(T+.05,nextSlot.t); nextSlot.t=st.startAt+.13; st.started=true; }
      st.k=st.started?easeO(clamp((T-st.startAt)/.95,0,1)):0; st.ik=st.started?easeO(clamp((T-st.startAt-.2)/1.3,0,1)):0;
      const hov=(st.hover&&!coarse)||st.active, tgt=hov?1:0;
      // spring: hover amount
      const n=Math.max(1,Math.ceil(dt/.008)), h=dt/n;
      let nx=0,ny=0; if(st.hover&&!coarse){ nx=clamp((input.px-(rc.left+rc.width/2))/(rc.width/2),-1,1); ny=clamp((input.py-(rc.top+rc.height/2))/(rc.height/2),-1,1); }
      const trx=-ny*4, try_=nx*4, tpx=-nx*10, tpy=-ny*8, tox=st.leaving&&T>=st.leaveAt?-st.dirOut*60:0, tout=(st.leaving&&T>=st.leaveAt)?1:0;
      for(let s=0;s<n;s++){
        st.vhv+=((tgt-st.hv)*115-st.vhv*13)*h; st.hv+=st.vhv*h;
        st.vrx+=((trx-st.rx)*130-st.vrx*17)*h; st.rx+=st.vrx*h; st.vry+=((try_-st.ry)*130-st.vry*17)*h; st.ry+=st.vry*h;
        st.vox+=((tox-st.ox)*90-st.vox*15)*h; st.ox+=st.vox*h;
      }
      st.px+=(tpx-st.px)*(1-Math.exp(-dt*9)); st.py+=(tpy-st.py)*(1-Math.exp(-dt*9));
      st.out+=(tout-st.out)*(1-Math.exp(-dt*7));
      st.dim+=(((hoverAny&&!hov)?.65:1)-st.dim)*(1-Math.exp(-dt*6));
      st.pulse=Math.max(0,st.pulse-dt/.28);
      const er=clamp((vh*.2-rc.bottom)/(vh*.25),0,1);                                                                // exit: drift up + fade
      const hvc=clamp(st.hv,-.2,1.2), y=(1-st.k)*50-hvc*8-er*34, sc=(.96+.04*st.k)*(1+.02*clamp(st.hv,0,1.1));
      const op=st.k*st.dim*(1-er*.85)*(1-st.out);
      st.card.style.opacity=op.toFixed(3);
      st.card.style.transform=`perspective(900px) translate3d(${st.ox.toFixed(2)}px,${y.toFixed(2)}px,0) rotateX(${st.rx.toFixed(3)}deg) rotateY(${st.ry.toFixed(3)}deg) scale(${sc.toFixed(4)})`;
      const cs=st.card.style; cs.setProperty('--hv',hvc.toFixed(3)); cs.setProperty('--zm',clamp(st.hv,0,1.1).toFixed(3)); cs.setProperty('--ik',st.ik.toFixed(3)); cs.setProperty('--px',st.px.toFixed(2)+'px'); cs.setProperty('--py',st.py.toFixed(2)+'px'); cs.setProperty('--pulse',(st.pulse).toFixed(3));
      st.card.style.pointerEvents=op>.2?'auto':'none';
      // trickle of particles while hovered
      if(hov&&!coarse){ st.accT+=dt*9; while(st.accT>1){ st.accT-=1; burstCard(st,1); } }
      if(st.gh){ st.ghT+=dt*8; while(st.ghT>1){ st.ghT-=1; burstBtn(st,1); } }
    });

    /* fx canvas */
    fx.clearRect(0,0,FW,FH); fx.globalCompositeOperation='lighter';
    for(let i=parts.length-1;i>=0;i--){ const p=parts[i]; p.l+=dt; if(p.l>p.m){ parts.splice(i,1); continue; } const k=1-p.l/p.m; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=.97; p.vy*=.97;
      const g=fx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.s*4); g.addColorStop(0,`rgba(200,230,255,${k*.9})`); g.addColorStop(.4,`rgba(70,140,255,${k*.5})`); g.addColorStop(1,'rgba(30,80,255,0)'); fx.fillStyle=g; fx.fillRect(p.x-p.s*4,p.y-p.s*4,p.s*8,p.s*8); }
    for(let i=pulses.length-1;i>=0;i--){ const q=pulses[i]; q.t+=dt/.28; if(q.t>=1){ pulses.splice(i,1); continue; } const e=1-Math.pow(1-q.t,2), g=e*22, rr=q.r;
      fx.strokeStyle=`rgba(150,210,255,${(1-q.t)*.95})`; fx.lineWidth=2; fx.shadowColor='rgba(60,150,255,1)'; fx.shadowBlur=16; fx.beginPath(); fx.roundRect(rr.left-g,rr.top-g,rr.width+g*2,rr.height+g*2,10+g*.6); fx.stroke(); fx.shadowBlur=0; }
    fx.globalCompositeOperation='source-over';
  }
  requestAnimationFrame(frame);
}
initProjects();


/* ═══════════════════════════════════════════════════════════════════
   FINAL SCENE — CONTACT : portrait particle universe + form
   Map of the requested components/hooks → code sections below:
     ContactSection / useScrollProgress ... "frame(): entry / exit"
     ContactIntro / ContactEmail / SocialLinks ... DOM wiring below
     ContactForm / ContactInput / SendButton ... form section
     PortraitScene / Portrait / PortraitParticles / EnergyOrbits ... WebGL
     BackgroundParticles ................... dust + comets
     CursorEnergy / useMousePosition ....... shared cursor + `input`
     FinalCTA / Footer ..................... DOM wiring below
   ═══════════════════════════════════════════════════════════════════ */
const CT_ASSETS = { char:"assets/contact-portrait.webp", depth:"assets/contact-portrait-depth.png" };

function initContact(){
  const sec=$('#contact'); if(!sec||!window.CONTACT) return;
  const { contactConfig:CFG, handleSubmit } = window.CONTACT;
  const stage=$('#ctStage'), cvs=$('#gl5'), fxc=$('#ctFx'), flash=$('#ctFlash'), layerEl=$('#ctLayer'), leftEl=$('#ctLeft');
  const mailA=$('#ctMail'), socialWrap=$('#ctSocial'), form=$('#ctForm'), sendBtn=$('#ctSend'), statusEl=$('#ctStatus'), ctaBtn=$('#ctCta'), msgEl=$('#ctMsg');
  const small=coarse||innerWidth<=820;
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const smooth=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };

  /* ───────── fill in personal data ───────── */
  $('#ctYr').textContent=new Date().getFullYear();
  $('#ctFootName').textContent=CFG.name||'';
  $('#ctFallback').src=CT_ASSETS.char;
  const mailTx=mailA.querySelector('.tx'); mailTx.textContent=CFG.email||'';
  mailA.href='mailto:'+(CFG.email||'');
  const ARROWS={GitHub:'→',LinkedIn:'→',Email:'→',Instagram:'→'};
  const links=(CFG.socialLinks||[]).filter(s=>s&&s.url);
  socialWrap.innerHTML=links.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-s="${esc(s.name)}">${esc(s.name)} <i>${esc(ARROWS[s.name]||'→')}</i></a>`).join('');
  if(!links.length) socialWrap.style.display='none';

  /* ───────── scene state shared with WebGL below ───────── */
  const S={ pulseFrom:null, formPull:0, typing:0, mailHover:0, socialHover:0, socialDir:new THREE.Vector2(0,0) };

  /* ───────── email / social → portrait connections (2D fx handles the travelling stream, see below) ───────── */
  mailA.addEventListener('pointerenter',()=>{ S.pulseFrom='mail'; streamFrom(mailA); });
  socialWrap.addEventListener('pointerover',e=>{ const a=e.target.closest('a'); if(a&&a!==S._lastSocial){ S._lastSocial=a; streamFrom(a); } });
  socialWrap.addEventListener('pointerleave',()=>{ S._lastSocial=null; });

  /* ───────── form: focus glow, typing particles, submit ───────── */
  const fields=[...form.querySelectorAll('.ct-field')];
  fields.forEach(f=>{
    const el=f.querySelector('input,textarea');
    el.addEventListener('focus',()=>{ f.classList.add('has'); S.formPull=1; });
    el.addEventListener('blur',()=>{ if(!el.value) f.classList.remove('has'); S.formPull=0; });
    el.addEventListener('input',()=>{ f.classList.toggle('has',!!el.value); S.typing=1; typingBurst(el); });
  });
  ctaBtn.addEventListener('click',()=>{ msgEl.focus({preventScroll:false}); msgEl.scrollIntoView({behavior:'smooth',block:'center'}); });
  $('#ctTop').addEventListener('click',()=>{ $('#home')?.scrollIntoView({behavior:'smooth'}); });

  let sending=false;
  form.addEventListener('submit',async e=>{
    e.preventDefault(); if(sending) return; sending=true;
    sendBtn.classList.add('pop'); if(!sendBtn.querySelector('.pulse')){ const p=document.createElement('i'); p.className='pulse'; sendBtn.appendChild(p); }
    sendBtn.disabled=true; statusEl.textContent=''; statusEl.className='ct-status';
    const data=Object.fromEntries(new FormData(form).entries());
    await new Promise(r=>setTimeout(r,260));
    let res; try{ res=await handleSubmit(form,data); }catch(err){ res={ok:false,reason:'Something went wrong sending your message.'}; }
    sendBtn.classList.remove('pop');
    if(res&&res.ok){
      sendBtn.classList.add('sent'); sendBtn.querySelector('.t1').textContent='✓ MESSAGE SENT'; sendBtn.querySelector('.arw').style.display='none';
      statusEl.textContent="Thanks — I'll get back to you soon."; statusEl.className='ct-status ok';
      burstCenter(sendBtn); form.reset(); fields.forEach(f=>f.classList.remove('has'));
      setTimeout(()=>{ sendBtn.classList.remove('sent'); sendBtn.querySelector('.t1').textContent='SEND MESSAGE'; sendBtn.querySelector('.arw').style.display=''; sendBtn.disabled=false; sending=false; },4200);
    } else {
      statusEl.textContent=(res&&res.reason)||"Couldn't send that just now — please try again.";
      statusEl.className='ct-status err'; sendBtn.disabled=false; sending=false;
    }
  });

  /* ───────── 2D fx overlay: cursor-adjacent particle streams + bursts ───────── */
  const fx=fxc.getContext('2d'); let FW=0,FH=0; const streams=[], bursts=[];
  function sizeFx(){ const d=Math.min(devicePixelRatio||1,2); FW=innerWidth; FH=innerHeight; fxc.width=FW*d; fxc.height=FH*d; fx.setTransform(d,0,0,d,0,0); }
  addEventListener('resize',sizeFx); sizeFx();
  function portraitScreenPos(){ const r=cvs.getBoundingClientRect(); return { x:r.left+r.width*Lo.faceX, y:r.top+r.height*Lo.faceY }; }
  function streamFrom(el){ const r=el.getBoundingClientRect(); const from={x:r.left+r.width/2,y:r.top+r.height/2}; const to=portraitScreenPos();
    for(let i=0;i<(small?7:14);i++) streams.push({x:from.x,y:from.y,t:-i*.035,to,life:0}); pulseAt=T+.75+i*0; }
  function typingBurst(el){ const r=el.getBoundingClientRect(); for(let i=0;i<3;i++){ const a=R()*TAU; bursts.push({x:r.left+R()*r.width,y:r.top+r.height,vx:Math.cos(a)*10,vy:-10-R()*14,l:0,m:.5+R()*.3,s:.6+R()*.6}); } }
  function burstCenter(el){ const r=el.getBoundingClientRect(); for(let i=0;i<28;i++){ const a=R()*TAU, sp=30+R()*90; bursts.push({x:r.left+r.width/2,y:r.top+r.height/2,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,l:0,m:.6+R()*.5,s:.8+R()*1.6}); } }
  const R=Math.random, TAU=Math.PI*2; let pulseAt=-10;

  /* ───────── WebGL: portrait mesh + orbits + dust (mirrors the hero's technique) ───────── */
  let rd=null; try{ rd=new THREE.WebGLRenderer({canvas:cvs,antialias:!small,alpha:true,powerPreference:'high-performance'}); }catch(e){ rd=null; }
  if(!rd){ sec.classList.add('no-gl'); }
  const CAM=6, FOV=30, ASPECT= (700/856);
  const camera=new THREE.PerspectiveCamera(FOV,1,.1,50), scene=new THREE.Scene();
  const TIME={value:0}, PXU={value:1};
  const BLUEc=new THREE.Color(.10,.44,1), ICEc=new THREE.Color(.62,.82,1);
  const ADD={ blending:THREE.CustomBlending, blendEquation:THREE.AddEquation, blendSrc:THREE.OneFactor, blendDst:THREE.OneFactor, blendSrcAlpha:THREE.ZeroFactor, blendDstAlpha:THREE.OneFactor, transparent:true, depthWrite:false };

  function createPortrait(){
    const group=new THREE.Group(); const loader=new THREE.TextureLoader();
    const map=loader.load(CT_ASSETS.char); map.colorSpace=THREE.NoColorSpace; map.anisotropy=8;
    const dep=loader.load(CT_ASSETS.depth); dep.colorSpace=THREE.NoColorSpace; dep.minFilter=dep.magFilter=THREE.LinearFilter; dep.generateMipmaps=false;
    const segX=small?90:150, segY=small?110:180;
    const geo=new THREE.PlaneGeometry(ASPECT,1,segX,segY);
    const u={ uMap:{value:map},uDepth:{value:dep},uTime:TIME,uDepthScale:{value:.20},
      uBreath:{value:0},uSway:{value:1},uFloatY:{value:0},uRotX:{value:0},uRotY:{value:0},
      uLight:{value:new THREE.Vector3(.35,.3,.8)},uBright:{value:0},uPulse:{value:0},uIntro:{value:0},uRim:{value:1},uForm:{value:0} };
    const mat=new THREE.ShaderMaterial({ uniforms:u, transparent:true, depthWrite:true, side:THREE.DoubleSide,
      vertexShader:`
        uniform sampler2D uDepth; uniform float uTime,uDepthScale,uBreath,uSway,uFloatY,uRotX,uRotY,uForm;
        varying vec2 vUv; varying float vEdge;
        void main(){
          vUv=uv; vec3 pk=textureLod(uDepth,uv,0.0).rgb; vec3 p=position; p.z=pk.r*uDepthScale;
          float chest=smoothstep(.78,.55,uv.y)*smoothstep(.02,.26,uv.y);
          p.y+=uBreath*.005*chest; p.z+=uBreath*.018*chest;
          float sw=pk.b*uSway;
          p.x+=sw*(sin(uTime*.8+uv.y*7.)*.6+sin(uTime*1.7+uv.x*11.)*.4)*.006;
          p.y+=sw*sin(uTime*1.1+uv.x*9.)*.0022;
          float ph=uRotX*smoothstep(.05,.7,uv.y);
          float cs=cos(ph),sn=sin(ph); p=vec3(p.x,p.y*cs-p.z*sn,p.y*sn+p.z*cs);
          float th=uRotY; float c=cos(th),s=sin(th); p=vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);
          p.y+=uFloatY;
          vec3 sc=vec3((uv.x-.5)*3.2,(uv.y-.5)*3.4+.3,-2.2-pk.r*1.2);
          vec3 fp=mix(sc,p,uForm);
          vEdge=1.0-smoothstep(0.0,0.05,min(uv.x,min(1.0-uv.x,min(uv.y,1.0-uv.y))));
          gl_Position=projectionMatrix*modelViewMatrix*vec4(fp,1.0);
        }`,
      fragmentShader:`
        precision highp float;
        uniform sampler2D uMap,uDepth; uniform vec3 uLight; uniform float uBright,uPulse,uIntro,uRim,uTime,uForm;
        varying vec2 vUv; varying float vEdge;
        void main(){
          vec4 tex=texture2D(uMap,vUv); if(tex.a<0.3) discard;
          vec3 col=tex.rgb; vec2 t=1.0/vec2(textureSize(uDepth,0));
          float dl=texture2D(uDepth,vUv-vec2(t.x*2.,0.)).r, dr=texture2D(uDepth,vUv+vec2(t.x*2.,0.)).r;
          float dd=texture2D(uDepth,vUv-vec2(0.,t.y*2.)).r, du=texture2D(uDepth,vUv+vec2(0.,t.y*2.)).r;
          vec3 n=normalize(vec3((dl-dr)*4.2,(dd-du)*4.2,1.0));
          float skin=texture2D(uDepth,vUv).g; float lum=dot(col,vec3(.299,.587,.114));
          vec3 blue=vec3(.13,.42,1.0); vec3 L=normalize(uLight);
          float diff=max(dot(n,L),0.0); float spec=pow(max(dot(n,normalize(L+vec3(0.,0.,1.))),0.0),14.0);
          float rim=pow(1.0-clamp(n.z,0.,1.),1.6); float fabric=.30+lum*3.2;
          vec3 add=blue*(rim*.85*uRim+diff*.035*fabric*(1.0-skin*.6)+spec*.22*(1.0-skin)*fabric);
          add+=blue*uPulse*(.05+rim*.6); add+=blue*skin*.03;
          col=col*mix(.55,uBright,uForm)+add; col*=uIntro;
          float a=smoothstep(.3,.85,tex.a)*clamp(uIntro*1.4,0.,1.);
          gl_FragColor=vec4(col,a);
        }` });
    const mesh=new THREE.Mesh(geo,mat); mesh.renderOrder=2; mesh.frustumCulled=false; group.add(mesh);
    return { group,mesh,u };
  }
  const portrait=createPortrait(); scene.add(portrait.group);

  /* orbit rings + orbiting particles (3 layers, non-concentric) */
  const ringVS=`varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const ringFS=`precision highp float; uniform float uTime,uR,uW,uInt,uRot; uniform vec3 uCol,uHot; varying vec2 vP;
    void main(){ float len=length(vP), ang=atan(vP.y,vP.x); float d=abs(len-uR); if(d>uW*70.) discard;
      float core=exp(-(d/uW)*(d/uW)); float glow=exp(-d/(uW*11.))*.3+exp(-d/(uW*45.))*.08; float comet=pow(.5+.5*cos(ang-uRot),9.);
      float I=(core*(.3+.7*comet)+glow*(.35+comet))*(.9+.1*sin(uTime*1.5))*uInt; gl_FragColor=vec4(mix(uCol,uHot,clamp(core*comet*1.2,0.,1.))*I,1.); }`;
  function makeRing(Rr,w,tilt,rollv,speed,bright){
    const g=new THREE.Group(); g.rotation.set(tilt,0,rollv);
    const U={uTime:TIME,uR:{value:1},uW:{value:w},uInt:{value:0},uRot:{value:0},uCol:{value:BLUEc},uHot:{value:ICEc}};
    const m=new THREE.Mesh(new THREE.PlaneGeometry(3.4,3.4),new THREE.ShaderMaterial({...ADD,uniforms:U,vertexShader:ringVS,fragmentShader:ringFS})); m.frustumCulled=false;
    g.add(m); g.scale.setScalar(Rr);
    return {g,U,speed,bright};
  }
  const ringDefs=[ makeRing(1.62,.0032,1.25,-.22,.045,.16), makeRing(1.28,.0044,1.02,.35,-.075,.30), makeRing(.98,.0058,.82,-.5,.12,.5) ];
  const ringGroup=new THREE.Group(); ringDefs.forEach(r=>ringGroup.add(r.g)); scene.add(ringGroup);
  // particles riding the orbit paths
  const dotFS=`precision highp float; uniform vec3 uCol; varying float vA; void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); if(d>.5) discard; gl_FragColor=vec4(uCol*(exp(-d*d*20.)*.75+exp(-d*d*110.)*1.4)*vA,1.); }`;
  const mkPts=(cnt,vs,uni,seedFn)=>{ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cnt*3),3)); const s=new Float32Array(cnt*4); for(let i=0;i<cnt;i++) s.set(seedFn(i),i*4); g.setAttribute('aSeed',new THREE.BufferAttribute(s,4)); const p=new THREE.Points(g,new THREE.ShaderMaterial({...ADD,vertexShader:vs,fragmentShader:dotFS,uniforms:uni})); p.frustumCulled=false; return p; };
  const orbitVS=`attribute vec4 aSeed; uniform float uTime,uSpeed,uPx,uInt,uEsc; varying float vA;
    void main(){ float ang=aSeed.x*6.2831853+uTime*uSpeed*(.6+aSeed.y*.8); float r=1.+(aSeed.z-.5)*.05;
      float esc=step(.965,aSeed.w); float cyc=fract(uTime*.1+aSeed.x*4.); float ex=sin(cyc*3.14159); ex=ex*ex*esc*uEsc;
      vec3 p=vec3(cos(ang)*r,sin(ang)*r,(aSeed.w-.5)*.05); p*=1.0+ex*.35;
      vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
      gl_PointSize=(1.3+aSeed.y*2.4)*uPx*(${CAM.toFixed(1)}/-mv.z);
      vA=(.5+.5*sin(uTime*2.0+aSeed.x*40.))*(.3+aSeed.y*.7)*uInt; }`;
  ringDefs.forEach((r,i)=>{ const n=small?10:(18+i*6); const U={uTime:TIME,uSpeed:{value:r.speed},uPx:PXU,uInt:{value:0},uEsc:{value:1},uCol:{value:i===2?ICEc:BLUEc}};
    const p=mkPts(n,orbitVS,U,()=>[R(),R(),R(),R()]); p.scale.setScalar(r.g.scale.x); r.g.add(p); r.opU=U; });

  /* portrait-adjacent particle field (the requested 1500–3000 particles) */
  const NP=small?1400:2600;
  const fieldVS=`attribute vec4 aSeed; uniform float uTime,uPx,uForm,uMagnet,uAspect,uCx; uniform vec2 uMouse; varying float vA;
    void main(){
      float t=clamp((uForm-aSeed.x*.5)/.5,0.,1.); float e=1.-(1.-t)*(1.-t)*(1.-t);
      vec3 sc=vec3(uCx+(aSeed.y-.5)*6.0,(aSeed.z-.5)*5.0,-2.0-aSeed.w*3.0);
      float rad=.62+aSeed.z*.55; float ang=aSeed.x*6.2831853+uTime*.05*(aSeed.y-.5);
      vec3 tg=vec3(uCx+cos(ang)*rad,sin(ang)*rad*1.05+.05,(aSeed.w-.5)*.5);
      vec3 p=mix(sc,tg,e);
      p+=vec3(sin(uTime*.4+aSeed.y*30.),cos(uTime*.35+aSeed.z*30.),sin(uTime*.3+aSeed.w*30.))*.05*(0.3+aSeed.x);
      vec4 mv=modelViewMatrix*vec4(p,1.0); vec4 cp=projectionMatrix*mv;
      vec2 ndc=cp.xy/cp.w; vec2 dm=(uMouse-ndc)*vec2(uAspect,1.);
      float infl=exp(-dot(dm,dm)/(2.*.15*.15))*uMagnet;
      ndc+=(uMouse-ndc)*infl*.16; cp.xy=ndc*cp.w;
      gl_Position=cp; gl_PointSize=(1.1+aSeed.y*1.6)*uPx*(${CAM.toFixed(1)}/-mv.z)*(1.0+infl*.6);
      vA=(.35+.65*sin(uTime*1.3+aSeed.x*50.)*.5+.325)*mix(.15,1.,e)*(1.0+infl*1.2); }`;
  const fieldU={uTime:TIME,uPx:PXU,uForm:{value:0},uMagnet:{value:0},uAspect:{value:1},uCx:{value:0},uMouse:{value:new THREE.Vector2(9,9)},uCol:{value:BLUEc}};
  const field=mkPts(NP,fieldVS,fieldU,()=>[R(),R(),R(),R()]); scene.add(field);

  /* soft core glow behind portrait */
  const coreU={uAmt:{value:0},uPulse:{value:0}};
  const core=new THREE.Mesh(new THREE.PlaneGeometry(4.6,4.6),new THREE.ShaderMaterial({...ADD,uniforms:coreU,
    vertexShader:`varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`precision highp float; uniform float uAmt,uPulse; varying vec2 vP; void main(){ float d=length(vP); float g=exp(-d*d*1.0)*.18+exp(-d*d*8.)*.14; g*=1.0+uPulse; gl_FragColor=vec4(vec3(.10,.42,1.)*g*uAmt,1.); }`}));
  core.position.z=-.5; scene.add(core);

  /* background dust + comets flying toward the portrait */
  const dustVS=`attribute vec4 aSeed; uniform float uTime,uPx,uSpeed,uZ,uSize,uGlobal,uScroll; uniform vec2 uBox; varying float vA;
    void main(){ vec3 p; p.x=(aSeed.x-.5)*uBox.x; float u=fract(aSeed.y+uTime*uSpeed*(.4+aSeed.w)/uBox.y+uScroll); p.y=(u-.5)*uBox.y; p.z=uZ+(aSeed.z-.5)*1.4;
      p.x+=sin(uTime*.12+aSeed.w*30.)*.06; vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uSize*(.5+aSeed.w)*uPx*(${CAM.toFixed(1)}/-mv.z);
      vA=(.3+.7*(.5+.5*sin(uTime*(.6+aSeed.w)+aSeed.x*50.)))*smoothstep(0.,.15,u)*smoothstep(1.,.85,u)*uGlobal; }`;
  const mkDust=(cnt,z,size,speed,alpha)=>mkPts(cnt,dustVS,{uTime:TIME,uPx:PXU,uSpeed:{value:speed},uZ:{value:z},uSize:{value:size},uGlobal:{value:0},uScroll:{value:0},uBox:{value:new THREE.Vector2(14,9)},uCol:{value:new THREE.Color(.22,.5,1).multiplyScalar(alpha)}},()=>[R(),R(),R(),R()]);
  const dB=mkDust(small?55:150,-5,2.2,.1,.85), dM=mkDust(small?24:60,-1.5,2.8,.14,.9);
  scene.add(dB,dM);

  const Lo={W:1,H:1,viewW:1,viewH:1,mobile:false,cx:0,s:1,faceX:.72,faceY:.38};
  function layout(){
    if(!rd) return; const W=stage.clientWidth||innerWidth, H=stage.clientHeight||innerHeight; Lo.W=W; Lo.H=H; Lo.mobile=innerWidth<=820;
    const dpr=Math.min(devicePixelRatio||1,coarse?1.5:2); rd.setPixelRatio(dpr); rd.setSize(W,H,false); PXU.value=dpr; fieldU.uAspect.value=W/H;
    camera.aspect=W/H; camera.updateProjectionMatrix(); Lo.viewH=2*CAM*Math.tan(FOV*RAD/2); Lo.viewW=Lo.viewH*camera.aspect;
    Lo.cx=Lo.mobile?0:Lo.viewW*.20;                                                                     // shift the whole scene right, clear of the text column
    const s=Math.min(Lo.viewH*(Lo.mobile?.60:.80), (Lo.mobile?Lo.viewW*.66:Lo.viewW*.40)/ASPECT); Lo.s=s;
    portrait.mesh.scale.setScalar(s); portrait.mesh.position.set(Lo.cx,0,0);
    ringGroup.scale.setScalar(s*.62); ringGroup.position.x=Lo.cx; core.position.x=Lo.cx;
    [dB,dM].forEach((d,i)=>d.material.uniforms.uBox.value.set(Lo.viewW*[2.6,1.7][i],Lo.viewH*[2.6,1.7][i]));
    // approximate on-screen face position for the email/social particle stream target
    const tmp=new THREE.Vector3(Lo.cx,s*.30,0); tmp.project(camera);
    Lo.faceX=tmp.x*.5+.5; Lo.faceY=-tmp.y*.5+.5;
  }
  addEventListener('resize',layout); layout();

  /* ───────── frame ───────── */
  let T=0, last=performance.now(), formT=0, entered=false, pulsed=false, magnet=0, parx=0, pary=0;
  const mN=new THREE.Vector2(9,9), mT=new THREE.Vector2(9,9); let pointerIn=false;
  addEventListener('pointermove',()=>{ pointerIn=true; },{passive:true}); document.addEventListener('mouseout',e=>{ if(!e.relatedTarget) pointerIn=false; });
  function frame(now){
    requestAnimationFrame(frame);
    const dt=Math.min((now-last)/1000,.05); last=now;
    const vh=innerHeight, r=sec.getBoundingClientRect(), far=r.bottom<-200||r.top>vh+200;
    if(far){ if(entered){ entered=false; sec.classList.remove('entered'); formT=0; pulsed=false; } fxc.style.display='none'; return; }
    fxc.style.display='block'; T+=dt*MOTION; TIME.value=T;
    if(!entered&&r.top<vh*.82&&r.bottom>vh*.18){ entered=true; sec.classList.add('entered'); }
    const enter=smooth(0,vh*.9,vh-r.top), leave=smooth(0,vh*.6,-r.bottom+vh*1.0);
    const target=clamp(enter,0,1)*(r.top>-1?1:clamp(1-((-r.top)/(r.height-vh+1)),0,1));
    formT+=(target-formT)*(1-Math.exp(-dt*(target>formT?1.4:2.0)));
    if(formT>.94&&!pulsed){ pulsed=true; flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); }
    if(formT<.5) pulsed=false;

    /* pointer smoothing + parallax */
    const cr=cvs.getBoundingClientRect(), px=input.px, py=input.py;
    const inside=pointerIn&&input.hasPointer&&px>=cr.left&&px<=cr.right&&py>=cr.top&&py<=cr.bottom;
    if(inside){ mT.set(((px-cr.left)/cr.width)*2-1,-(((py-cr.top)/cr.height)*2-1)); if(mN.x>5) mN.copy(mT); }
    mN.x+=(mT.x-mN.x)*(1-Math.exp(-dt*9)); mN.y+=(mT.y-mN.y)*(1-Math.exp(-dt*9));
    magnet=damp(magnet,inside&&formT>.5?1:0,5,dt);
    parx=damp(parx,input.tx||0,3,dt); pary=damp(pary,input.ty||0,3,dt);
    layerEl.style.transform=`translate3d(${(parx*20).toFixed(2)}px,${(-pary*14).toFixed(2)}px,0)`;                                 // background .02
    fieldU.uMagnet.value=magnet; fieldU.uMouse.value.copy(mN);

    /* portrait pose: gentle float + tiny rotation, cursor parallax, mail/social pulse */
    const u=portrait.u; u.uForm.value=formT; u.uIntro.value=smooth(0,.4,formT);
    u.uFloatY.value=Math.sin(T*.5)*.018*MOTION;
    u.uRotX.value=Math.sin(T*.4)*.012*MOTION - pary*.012;
    u.uRotY.value=Math.sin(T*.33+1)*.02*MOTION + parx*.02;
    u.uBreath.value=Math.sin(T*.9)*(reduce?.5:1);
    const nearPortrait=inside; const hoverAmt=damp(u._hover||0, nearPortrait?1:0, 6, dt); u._hover=hoverAmt;
    u.uBright.value=lerp(.92,1.08,hoverAmt);
    const sincePulse=T-pulseAt; const pulseWave=sincePulse>=0&&sincePulse<1?Math.sin(Math.PI*clamp(sincePulse,0,1))*.5:0;
    u.uPulse.value=hoverAmt*.12+pulseWave;
    const Lv=new THREE.Vector3(.3+parx*.5,.28+pary*.4,.85); u.uLight.value.lerp(Lv,1-Math.exp(-dt*5));
    portrait.group.position.set(parx*.06,pary*.03,0);                                                                              // portrait .015 (mesh itself already offset to Lo.cx)

    /* orbits: rotate, brighten on hover, speed up slightly */
    ringGroup.position.set(Lo.cx+parx*.10,-pary*.06,-.1);                                                                          // orbit .06(ish)
    ringDefs.forEach((rg,i)=>{ const spd=rg.speed*(1+hoverAmt*.25); rg.g.rotation.z+=spd*dt*MOTION*.6; rg.U.uRot.value=(T*spd*3)%(Math.PI*2);
      rg.U.uInt.value=lerp(rg.bright*.5,rg.bright,formT)*(1+hoverAmt*.3); rg.opU.uInt.value=rg.U.uInt.value*1.1; rg.opU.uSpeed.value=rg.speed*(1+hoverAmt*.3); });
    core.uAmt=coreU.uAmt.value=lerp(.5,1,formT)*(1+hoverAmt*.15); coreU.uPulse.value=pulseWave*.6+hoverAmt*.1;
    core.position.set(Lo.cx+parx*.08,-pary*.05,-.4);

    /* background dust */
    const sy=scrollY/innerHeight*.15; dB.material.uniforms.uScroll.value=sy*.3; dM.material.uniforms.uScroll.value=sy*.6;
    dB.material.uniforms.uGlobal.value=smooth(0,.5,formT); dM.material.uniforms.uGlobal.value=smooth(0,.5,formT);
    dB.position.set(-parx*.4,-pary*.2,0); dM.position.set(-parx*.8,-pary*.4,0);                                                    // particles .04-.06

    camera.position.set(parx*.10,pary*.05,CAM); camera.lookAt(0,0,0); camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    if(rd) rd.render(scene,camera);

    /* fx canvas: cursor-linked streams + bursts (email/social → portrait, typing, send) */
    fx.clearRect(0,0,FW,FH); fx.globalCompositeOperation='lighter';
    for(let i=streams.length-1;i>=0;i--){ const s=streams[i]; s.t+=dt/.8; if(s.t<0) continue; if(s.t>=1){ streams.splice(i,1); continue; }
      const e=s.t, u=1-e; const mx=(s.x+s.to.x)/2, my=Math.min(s.y,s.to.y)-90*Math.sin(Math.PI*e)-40;
      const x=u*u*s.x+2*u*e*mx+e*e*s.to.x, y=u*u*s.y+2*u*e*my+e*e*s.to.y;
      const g=fx.createRadialGradient(x,y,0,x,y,6); g.addColorStop(0,'rgba(200,230,255,.95)'); g.addColorStop(1,'rgba(45,123,255,0)'); fx.fillStyle=g; fx.fillRect(x-6,y-6,12,12);
      if(e>.97){ pulseAt=T; } }
    for(let i=bursts.length-1;i>=0;i--){ const p=bursts[i]; p.l+=dt; if(p.l>p.m){ bursts.splice(i,1); continue; } p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=.94; p.vy*=.9; const k=1-p.l/p.m;
      const g=fx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.s*4); g.addColorStop(0,`rgba(200,230,255,${k*.9})`); g.addColorStop(1,'rgba(30,80,255,0)'); fx.fillStyle=g; fx.fillRect(p.x-p.s*4,p.y-p.s*4,p.s*8,p.s*8); }
    fx.globalCompositeOperation='source-over';
  }
  requestAnimationFrame(frame);
}
initContact();

/* ─────────── nav: active section ─────────── */
const links=[...document.querySelectorAll('.nav li a')];
const secs=['home','about','technologies','projects','contact'].map(id=>document.getElementById(id));
const io=new IntersectionObserver(es=>es.forEach(e=>{ if(e.isIntersecting){ links.forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id)); } }),{rootMargin:'-45% 0px -50% 0px'});
secs.forEach(s=>s&&io.observe(s));

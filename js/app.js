import {
  VIDEO_LEVELS,
  CONTROL_IDS,
  MOTION_QUALITY,
  DEFAULT_VIDEO_LEVEL,
  DEFAULT_PRESET
}
from './config.js';
import {
  clamp,
  readStorageJSON,
  writeStorageJSON
}
from './utils.js';
import {
  getDreamShader
}
from './shaders.js';
import {
  applyDreamPreset
}
from './presets.js';
import {
  updateControlLabels,
  readControlValues,
  restoreControlValues,
  bindControlInputs,
  renderVideoLevelState,
  bindVideoLevelButtons
}
from './ui.js';
import {
  cameraErrorMessage,
  getCameraConstraints,
  countVideoInputs
}
from './camera.js';
import {
  analyzeMotionFrame
}
from './motion.js';
import {
  measureAudioBands
}
from './audio.js';
import {
  drawCanvasLayer
}
from './renderers.js';
(()=>{
  document.body.classList.add('first-frame');
  const $=s=>document.querySelector(s),
  canvas=$('#dream'),
  ctx=canvas.getContext('2d',{
    alpha:false
  }),
  video=$('#camera');
  let w,
  h,
  dpr,
  stream=null,
  micStream=null,
  audioCtx=null,
  analyser=null,
  data=null,
  raf=0,
  last=0,
  energy=0,
  pulses=[],
  panelTimer,
  started=false,
  cameraBusy=false,
  cameraSwitching=false,
  cameraFacingMode='environment',
  cameraRetryCount=0,
  cameraRetryTimer=0,
  cameraSwitchAvailable=false,
  cameraState='off',
  cameraStateDetail='',
  lastAudioLog=0,
  trailCanvas=document.createElement('canvas'),
  trailCtx=trailCanvas.getContext('2d');
  const saved=readStorageJSON('psyco_visao_settings',readStorageJSON('wut-settings'));
  const videoLevels=VIDEO_LEVELS,
  savedVisual=readStorageJSON('psyco_visao_visual',readStorageJSON('weburutao_visual')),
  initialVideoLevel=Object.prototype.hasOwnProperty.call(videoLevels,savedVisual.activeVideoLevel)?savedVisual.activeVideoLevel:DEFAULT_VIDEO_LEVEL;
  let activeVideoLevel=initialVideoLevel,
  videoPresence=videoLevels[initialVideoLevel],
  videoPresenceFrom=videoPresence,
  videoPresenceTarget=videoPresence,
  videoPresenceStart=0;
  let motionWidth=0,
  motionHeight=0,
  motionPixels,
  previousLuma,
  motionActivity=0,
  motionSample=0,
  motionReadStride=2,
  lastMotionVideoTime=-1,
  hasPreviousMotion=false,
  motionTrack=null,
  renderQuality=1,
  renderTier=0,
  perfFrames=0,
  perfStart=0,
  measuredFps=0,
  poorPerfWindows=0,
  goodPerfWindows=0,
  firstDraw=true;
  const motionReadCanvas=document.createElement('canvas'),
  motionReadCtx=motionReadCanvas.getContext('2d',{
    willReadFrequently:true
  }),
  motionMaskCanvas=document.createElement('canvas'),
  motionMaskCtx=motionMaskCanvas.getContext('2d'),
  edgeCanvas=document.createElement('canvas'),
  edgeCtx=edgeCanvas.getContext('2d'),
  smokeCanvas=document.createElement('canvas'),
  smokeCtx=smokeCanvas.getContext('2d'),
  meshCanvas=document.createElement('canvas'),
  meshCtx=meshCanvas.getContext('2d'),
  revealCanvas=document.createElement('canvas'),
  revealCtx=revealCanvas.getContext('2d'),
  revealMaskCanvas=document.createElement('canvas'),
  revealMaskCtx=revealMaskCanvas.getContext('2d'),
  motionQuality=MOTION_QUALITY;
  function setMotionResolution(width,height){
    const ratio=Math.min(1,innerWidth/width,innerHeight/height);
    width=Math.round(width*ratio);
    height=Math.round(height*ratio);
    if(width===motionWidth&&height===motionHeight&&motionPixels)return;
    motionWidth=width;
    motionHeight=height;
    motionReadCanvas.width=motionMaskCanvas.width=edgeCanvas.width=smokeCanvas.width=meshCanvas.width=width;
    motionReadCanvas.height=motionMaskCanvas.height=edgeCanvas.height=smokeCanvas.height=meshCanvas.height=height;
    [motionReadCtx,
    motionMaskCtx,
    edgeCtx,
    smokeCtx,
    meshCtx].forEach(c=>{
      c.imageSmoothingEnabled=true;
      c.imageSmoothingQuality='high'
    });
    motionPixels=motionMaskCtx.createImageData(width,height);
    previousLuma=new Float32Array(width*height);
    motionSample=0;
    hasPreviousMotion=false;
    smokeCtx.clearRect(0,0,width,height);
    edgeCtx.clearRect(0,0,width,height)
  }
  setMotionResolution(480,270);
  function updateRenderPerformance(t){
    if(document.visibilityState==='hidden'){
      perfFrames=0;
      perfStart=0;
      poorPerfWindows=goodPerfWindows=0;
      return
    }
    perfFrames++;
    if(!perfStart){
      perfStart=t;
      return
    }
    const elapsed=t-perfStart;
    if(elapsed<1600)return;
    measuredFps=perfFrames*1000/elapsed;
    perfFrames=0;
    perfStart=t;
    if(measuredFps<25){
      poorPerfWindows++;
      goodPerfWindows=0;
      if(poorPerfWindows<2)return;
      poorPerfWindows=0;
      if(renderQuality>.66){
        renderQuality=Math.max(.66,renderQuality-.17);
        resize();
        return
      }
      if(motionReadStride<4){
        motionReadStride++;
        return
      }
      if(renderTier<motionQuality.length-1){
        renderTier++;
        const quality=motionQuality[renderTier];
        setMotionResolution(quality.width,quality.height)
      }
    }
    else if(measuredFps>32){
      goodPerfWindows++;
      poorPerfWindows=0;
      if(goodPerfWindows>=4){
        if(renderQuality<1){
          renderQuality=Math.min(1,renderQuality+.17);
          resize()
        }
        else if(motionReadStride>2)motionReadStride--;
        else if(renderTier>0){
          renderTier--;
          const quality=motionQuality[renderTier];
          setMotionResolution(quality.width,quality.height)
        }
        goodPerfWindows=0
      }
    }
    else{
      poorPerfWindows=goodPerfWindows=0
    }
  }
  const audioState=new Float64Array(11),
  timeData=new Float32Array(1024),
  freqData=new Float32Array(512);
  let soundRevealSmooth=0,
  micStartedAt=0,
  noiseSum=0,
  noiseFrames=0,
  bassMax=1e-6,
  midMax=1e-6,
  trebleMax=1e-6,
  lastPulseAt=0,
  lastSilenceAt=0,
  originSide=0;
  const controls=CONTROL_IDS;
  restoreControlValues(controls,saved,$);
  const updateLabels=()=>updateControlLabels($);
  const persist=()=>writeStorageJSON('psyco_visao_settings',{
    ...readControlValues(controls,$),preset:activeDreamPreset
  });
  bindControlInputs(controls,$,()=>{
    updateLabels();
    persist()
  });
  updateLabels();
  function updateVideoLevelUI(){
    renderVideoLevelState(document.querySelectorAll('[data-video-level]'),$('#videoLevelValue'),document.body,activeVideoLevel)
  }
  function setVideoPresence(level){
    if(!Object.prototype.hasOwnProperty.call(videoLevels,level))return;
    if(level!==activeVideoLevel)resetMotionShader();
    videoPresenceFrom=videoPresence;
    videoPresenceTarget=videoLevels[level];
    videoPresenceStart=performance.now();
    activeVideoLevel=level;
    writeStorageJSON('psyco_visao_visual',{
      videoPresence:videoPresenceTarget,activeVideoLevel:level
    });
    updateVideoLevelUI()
  }
  bindVideoLevelButtons(document.querySelectorAll('[data-video-level]'),setVideoPresence);
  updateVideoLevelUI();
  function resize(){
    const memoryBudget=Number(navigator.deviceMemory)||8,
    maxDpr=(innerWidth<=900||memoryBudget<=4)?1.25:1.6;
    dpr=Math.min(devicePixelRatio||1,maxDpr)*renderQuality;
    w=innerWidth;
    h=innerHeight;
    canvas.width=Math.round(w*dpr);
    canvas.height=Math.round(h*dpr);
    canvas.style.width=w+'px';
    canvas.style.height=h+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    trailCanvas.width=Math.round(w*dpr);
    trailCanvas.height=Math.round(h*dpr);
    trailCtx.setTransform(dpr,0,0,dpr,0,0);
    trailCtx.imageSmoothingEnabled=true;
    trailCtx.imageSmoothingQuality='high';
    revealCanvas.width=revealMaskCanvas.width=canvas.width;
    revealCanvas.height=revealMaskCanvas.height=canvas.height;
    revealCtx.setTransform(dpr,0,0,dpr,0,0);
    revealMaskCtx.setTransform(dpr,0,0,dpr,0,0);
    revealCtx.imageSmoothingEnabled=revealMaskCtx.imageSmoothingEnabled=true;
    revealCtx.imageSmoothingQuality=revealMaskCtx.imageSmoothingQuality='high';
    setMotionResolution(motionQuality[renderTier].width,motionQuality[renderTier].height)
  }
  addEventListener('resize',resize);
  resize();
  const reducedMotionQuery=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let activeDreamPreset=['bat',
  'deep',
  'delirium',
  'breath'].includes(saved.preset)?saved.preset:DEFAULT_PRESET;
  document.querySelectorAll('#presets .preset').forEach(button=>{
    const active=button.dataset.preset===activeDreamPreset;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active))
  });
  // Heurística geométrica de seleção por movimento; não identifica pessoas nem segmenta a imagem.
  const conservativeHumanMotionHeuristic={
    box:null,
    previousBox:null,
    candidateSince:0,
    activeUntil:0,
    misses:0,
    visible:false,
    activePixels:0,
    edgeRatio:1,
    aspect:0,
    score:0,
    lastScore:0,
    revealAmount:0,
    lastEval:0
  };
  function buildMotionMask(current,previous,output){
    const result=analyzeMotionFrame(current,previous,output,motionWidth,motionHeight,+$('#edge').value/100,activeVideoLevel==='oculto');
    motionActivity=result.activity;
    const h=conservativeHumanMotionHeuristic;
    h.activePixels=result.activePixels;
    h.edgeRatio=result.edgeRatio;
    h.box=result.box;
    h.aspect=result.aspect
  }
  function updateConservativeHumanMotionHeuristic(t,reduced){
    const h=conservativeHumanMotionHeuristic,
    b=h.box;
    let score=0,
    coherent=false;
    if(b){
      const area=h.activePixels/(motionWidth*motionHeight),
      ratio=b.height/Math.max(1,b.width),
      dx=Math.abs(b.cx/motionWidth-.5)*2,
      dy=Math.abs(b.cy/motionHeight-.5)*2,
      centerDistance=Math.sqrt(dx*dx+dy*dy)/Math.sqrt(2),
      areaScore=clamp(area/.0012,0,1),
      aspectScore=clamp(1-Math.abs(Math.log(Math.max(.1,ratio)/2.1))*.34,0,1),
      centerScore=clamp(1-centerDistance*.72,0,1),
      edgeScore=clamp(1-h.edgeRatio,0,1);
      if(h.previousBox){
        const p=h.previousBox,
        ix=Math.max(0,Math.min(b.right,p.right)-Math.max(b.left,p.left)),
        iy=Math.max(0,Math.min(b.bottom,p.bottom)-Math.max(b.top,p.top)),
        intersection=ix*iy,
        union=b.width*b.height+p.width*p.height-intersection,
        iou=union?intersection/union:0,
        cx=b.cx-p.cx,
        cy=b.cy-p.cy,
        distance=Math.sqrt(cx*cx+cy*cy),
        limit=Math.hypot(motionWidth,motionHeight)*.20;
        coherent=iou>=.06||distance<=limit
      }
      const coherenceScore=h.previousBox?(coherent?1:.35):.55;
      score=area>=.0012&&area<=.42&&b.width/motionWidth>=.022&&b.height/motionHeight>=.06&&h.edgeRatio<=.62?(.25*areaScore+.25*aspectScore+.20*centerScore+.15*edgeScore+.15*coherenceScore)*aspectScore:0;
      h.score=score;
      h.aspect=ratio;
      const qualifies=score>=.30;
      if(qualifies){
        if(!coherent)h.candidateSince=t;
        h.previousBox=b;
        h.misses=0;
        const confirmation=reduced?180:120;
        if(t-h.candidateSince>=confirmation){
          h.visible=true;
          h.activeUntil=t+(reduced?600:420);
          h.box=b;
          h.lastScore=score
        }
      }
      else{
        h.previousBox=null;
        h.candidateSince=0;
        h.misses++
      }
    }
    else{
      h.score=0;
      h.previousBox=null;
      h.candidateSince=0;
      h.misses++
    }
    if(h.misses>=3&&t>=h.activeUntil)h.visible=false;
    const target=h.visible?Math.max(h.lastScore,.45):0,
    elapsed=h.lastEval?Math.max(0,t-h.lastEval):0,
    rise=reduced?180:100,
    fall=reduced?1100:750;
    if(target>h.revealAmount)h.revealAmount=Math.min(target,h.revealAmount+elapsed/rise*target);
    else h.revealAmount=Math.max(target,h.revealAmount-elapsed/fall);
    if(h.revealAmount<.005)h.revealAmount=0;
    h.lastEval=t
  }
  function updateLiquidEdges(t,reduced){
    edgeCtx.save();
    edgeCtx.clearRect(0,0,motionWidth,motionHeight);
    edgeCtx.filter='grayscale(1) contrast(1.08)';
    edgeCtx.globalCompositeOperation='source-over';
    edgeCtx.drawImage(motionReadCanvas,0,0);
    edgeCtx.globalCompositeOperation='difference';
    const drift=reduced?0:Math.sin(t*.00024)*.65;
    edgeCtx.drawImage(motionReadCanvas,1+drift,0);
    edgeCtx.drawImage(motionReadCanvas,-1+drift,0);
    edgeCtx.drawImage(motionReadCanvas,drift,1);
    edgeCtx.drawImage(motionReadCanvas,drift,-1);
    edgeCtx.globalCompositeOperation='source-over';
    edgeCtx.filter='none';
    edgeCtx.restore();
  }
  function resetMotionShader(){
    smokeCtx.clearRect(0,0,motionWidth,motionHeight);
    motionMaskCtx.clearRect(0,0,motionWidth,motionHeight);
    edgeCtx.clearRect(0,0,motionWidth,motionHeight);
    previousLuma?.fill(0);
    motionActivity=0;
    hasPreviousMotion=false;
    motionSample=0;
    const h=conservativeHumanMotionHeuristic;
    h.box=h.previousBox=null;
    h.candidateSince=h.activeUntil=h.misses=0;
    h.visible=false;
    h.activePixels=0;
    h.edgeRatio=1;
    h.aspect=0;
    h.score=h.lastScore=h.revealAmount=h.lastEval=0
  }
  function updateMotionShader(dt,hasCam,persistence=1.7,mode='both',t=0,reduced=false){
    const currentTrack=stream?.getVideoTracks()[0]||null;
    if(currentTrack!==motionTrack){
      motionTrack=currentTrack;
      resetMotionShader();
      lastMotionVideoTime=-1
    }
    smokeCtx.globalCompositeOperation='source-over';
    const memory=persistence*(.55+(+$('#smoothing').value/100)*1.65);
    smokeCtx.fillStyle='rgba(0,0,0,'+(1-Math.pow(.5,dt/memory))+')';
    smokeCtx.fillRect(0,0,motionWidth,motionHeight);
    if(!hasCam||++motionSample%motionReadStride)return;
    const videoTime=video.currentTime;
    if(videoTime===lastMotionVideoTime)return;
    lastMotionVideoTime=videoTime;
    motionReadCtx.drawImage(video,0,0,motionWidth,motionHeight);
    const frameData=motionReadCtx.getImageData(0,0,motionWidth,motionHeight).data;
    if(!hasPreviousMotion){
      for(let pixel=0,offset=0;pixel<previousLuma.length;pixel++,offset+=4)previousLuma[pixel]=frameData[offset]*.299+frameData[offset+1]*.587+frameData[offset+2]*.114;
      hasPreviousMotion=true
    }
    else{
      buildMotionMask(frameData,previousLuma,motionPixels.data);
      // Em OCULTO, a heuristica de movimento roda sem depender de microfone; o som amplifica os shaders.
      if(activeVideoLevel==='oculto')updateConservativeHumanMotionHeuristic(t,reduced);
      motionMaskCtx.putImageData(motionPixels,0,0);
      if(activeVideoLevel!=='oculto'||motionActivity>.0001||conservativeHumanMotionHeuristic.visible||conservativeHumanMotionHeuristic.revealAmount>.005){
        smokeCtx.globalCompositeOperation='lighter';
        smokeCtx.globalAlpha=.78;
        smokeCtx.drawImage(motionMaskCanvas,0,0);
        smokeCtx.globalAlpha=1;
        smokeCtx.globalCompositeOperation='source-over'
      }
    }
    if(mode==='silhouette'||mode==='outline'||mode==='both'){
      updateLiquidEdges(t,reduced);
      edgeCtx.globalCompositeOperation='destination-in';
      edgeCtx.drawImage(smokeCanvas,0,0,motionWidth,motionHeight);
      edgeCtx.globalCompositeOperation='source-over'
    }
  }
  function drawFallbackSilhouette(t,w,h,reduced,alpha){
    const phase=reduced?0:Math.sin(t*.00022)*.035,
    cx=w*.5,
    cy=h*.51,
    rx=Math.min(w,h)*(.13+phase),
    ry=Math.min(w,h)*.31;
    ctx.save();
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=alpha;
    ctx.filter='blur(1.2px)';
    const glow=ctx.createRadialGradient(cx,cy-ry*.12,0,cx,cy,ry*1.35);
    glow.addColorStop(0,'rgba(146,205,167,.25)');
    glow.addColorStop(.55,'rgba(74,133,97,.12)');
    glow.addColorStop(1,'rgba(40,92,61,0)');
    ctx.fillStyle=glow;
    ctx.beginPath();
    ctx.moveTo(cx,cy-ry);
    ctx.bezierCurveTo(cx+rx*.62,cy-ry,cx+rx*.62,cy-ry*.46,cx+rx*.48,cy-ry*.34);
    ctx.bezierCurveTo(cx+rx*1.15,cy-ry*.13,cx+rx*1.2,cy+ry*.52,cx+rx*.86,cy+ry*.76);
    ctx.bezierCurveTo(cx+rx*.62,cy+ry,cx-rx*.62,cy+ry,cx-rx*.86,cy+ry*.76);
    ctx.bezierCurveTo(cx-rx*1.2,cy+ry*.52,cx-rx*1.15,cy-ry*.13,cx-rx*.48,cy-ry*.34);
    ctx.bezierCurveTo(cx-rx*.62,cy-ry*.46,cx-rx*.62,cy-ry,cx,cy-ry);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx,cy-ry*.63,rx*.24,ry*.18,0,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
  function drawFallbackContours(t,w,h,reduced,alpha){
    const phase=reduced?0:t*.00016,
    cx=w*.5,
    cy=h*.5,
    r=Math.min(w,h)*.25;
    ctx.save();
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=alpha;
    ctx.strokeStyle='rgba(159,218,178,.72)';
    ctx.lineWidth=Math.max(1,Math.min(2,w/700));
    ctx.filter='blur(.6px)';
    for(let i=0;i<5;i++){
      const k=i/5,
      off=Math.sin(phase+i*.9)*r*.055;
      ctx.beginPath();
      ctx.moveTo(cx-r*.72+off,cy-r*.62+k*r*.30);
      ctx.bezierCurveTo(cx-r*.40-off,cy-r*.72+k*r*.23,cx+r*.18+off,cy-r*.42+k*r*.37,cx+r*.70-off,cy-r*.60+k*r*.31);
      ctx.bezierCurveTo(cx+r*.88+off,cy-r*.05+k*r*.29,cx+r*.36-off,cy+r*.48+k*r*.32,cx+r*.76+off,cy+r*.64-k*r*.24);
      ctx.stroke()
    }
    ctx.restore();
  }
  function drawBreathingMesh(t,w,h,smooth,bass,treble,reduced,alpha,motion){
    const m=motion||{
      amount:0,
      activity:0,
      mask:null,
      box:null
    },
    energy=clamp(m.amount*1.4+m.activity*3.2+bass*.15,0,1);
    let cx=w*.5,
    cy=h*.5;
    if(m.box){
      const bx=m.box.cx/motionWidth*w,
      by=m.box.cy/motionHeight*h;
      cx=cx*.30+bx*.70;
      cy=cy*.30+by*.70
    }
    const r=Math.min(w,h)*(.16+.06*energy+Math.min(.035,smooth*.035)),
    phase=reduced?0:t*.00014,
    warp=reduced?.012:.02+energy*.09+treble*.02,
    breath=1+Math.sin(phase)*.025+bass*.035+energy*.14,
    rot=reduced?0:energy*.22,
    cos=Math.cos(rot),
    sin=Math.sin(rot);
    meshCtx.save();
    meshCtx.setTransform(motionWidth/w,0,0,motionHeight/h,0,0);
    meshCtx.globalCompositeOperation='source-over';
    meshCtx.globalAlpha=1;
    meshCtx.clearRect(0,0,w,h);
    meshCtx.globalCompositeOperation='screen';
    meshCtx.globalAlpha=alpha;
    meshCtx.lineWidth=Math.max(.8,Math.min(1.2,w/900));
    const shade=meshCtx.createRadialGradient(cx,cy,0,cx,cy,r*1.25);
    shade.addColorStop(0,'rgba(168,224,184,.68)');
    shade.addColorStop(.72,'rgba(142,201,162,.38)');
    shade.addColorStop(1,'rgba(142,201,162,0)');
    meshCtx.strokeStyle=shade;
    meshCtx.beginPath();
    for(let meridian=0;meridian<9;meridian++){
      const lon=-Math.PI/2+Math.PI*meridian/8;
      for(let step=0;step<=20;step++){
        const lat=-Math.PI/2+Math.PI*step/20,
        x=cx+r*breath*Math.cos(lat)*Math.sin(lon)+Math.sin(phase+lat*2+lon)*r*warp,
        y=cy+r*Math.sin(lat)+Math.sin(phase+lon*2+lat)*r*warp*.65,
        ox=x-cx,
        oy=y-cy,
        rx=cx+ox*cos-oy*sin,
        ry=cy+ox*sin+oy*cos;
        if(step===0)meshCtx.moveTo(rx,ry);
        else meshCtx.lineTo(rx,ry)
      }
    }
    for(let band=-3;
    band<=3;
    band++){
      const lat=band*Math.PI/8;
      for(let step=0;step<=28;step++){
        const lon=-Math.PI/2+Math.PI*step/28,
        x=cx+r*breath*Math.cos(lat)*Math.sin(lon)+Math.sin(phase+lat*2+lon)*r*warp,
        y=cy+r*Math.sin(lat)+Math.sin(phase+lon*2+lat)*r*warp*.65,
        ox=x-cx,
        oy=y-cy,
        rx=cx+ox*cos-oy*sin,
        ry=cy+ox*sin+oy*cos;
        if(step===0)meshCtx.moveTo(rx,ry);
        else meshCtx.lineTo(rx,ry)
      }
    }
    meshCtx.stroke();
    const hasMotionMask=!!m.mask&&(m.amount>0||m.activity>.0001);
    if(hasMotionMask){
      const maskScale=Math.max(w/motionWidth,h/motionHeight),
      maskWidth=motionWidth*maskScale,
      maskHeight=motionHeight*maskScale,
      maskX=(w-maskWidth)/2,
      maskY=(h-maskHeight)/2;
      meshCtx.globalCompositeOperation='destination-in';
      meshCtx.globalAlpha=clamp(.45+energy*1.6,0,1.8);
      meshCtx.drawImage(m.mask,0,0,motionWidth,motionHeight,maskX,maskY,maskWidth,maskHeight)
    }
    meshCtx.restore();
    ctx.save();
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=1;
    ctx.drawImage(meshCanvas,0,0,w,h);
    if(hasMotionMask){
      const maskScale=Math.max(w/motionWidth,h/motionHeight),
      maskWidth=motionWidth*maskScale,
      maskHeight=motionHeight*maskScale,
      maskX=(w-maskWidth)/2,
      maskY=(h-maskHeight)/2;
      ctx.globalCompositeOperation='screen';
      ctx.globalAlpha=clamp(.42+energy*.48,0,.85);
      ctx.drawImage(m.mask,0,0,motionWidth,motionHeight,maskX,maskY,maskWidth,maskHeight)
    }
    ctx.restore();
  }
  function drawModeImage(mode,shader,t,hasCam,smooth,bass,treble,w,h,activity=1){
    const hidden=activeVideoLevel==='oculto',
    quietScale=activity>.002?(hidden?.35+.65*activity:clamp(activity*1.8,0,1)):0,
    reduced=shader.reduced,
    motion=hasCam?{
      amount:conservativeHumanMotionHeuristic.revealAmount,
      activity:motionActivity,
      mask:smokeCanvas,
      box:conservativeHumanMotionHeuristic.box
    }
    :{
      amount:0,
      activity:0,
      mask:null,
      box:null
    },
    scale=Math.max(w/motionWidth,h/motionHeight),
    dw=motionWidth*scale,
    dh=motionHeight*scale,
    dx=(w-dw)/2,
    dy=(h-dh)/2,
    drift=reduced?0:Math.sin(t*.00018)*Math.min(5,h*.004);
    ctx.save();
    if(hasCam&&(mode==='silhouette'||mode==='both'))drawCanvasLayer(ctx,edgeCanvas,{
      operation:'screen',alpha:shader.smokeAlpha*quietScale,filter:'blur('+shader.smokeBlur+'px) saturate(.8)',x:dx,y:dy+drift,width:dw,height:dh
    })
    if(hasCam&&(mode==='outline'||mode==='both')){
      ctx.globalCompositeOperation='lighter';
      ctx.filter='blur(.55px) saturate(.75)';
      ctx.globalAlpha=shader.contourAlpha*(.25+(+$('#edge').value/100)*1.25)*quietScale;
      ctx.drawImage(edgeCanvas,dx,dy,dw,dh);
      const liquidX=reduced?0:Math.sin(t*.00017)*Math.min(4,w*.003),
      liquidY=reduced?0:Math.cos(t*.00013)*Math.min(3,h*.003);
      ctx.globalAlpha=shader.contourAlpha*.42*quietScale;
      ctx.filter='blur(1.8px) saturate(.65)';
      ctx.drawImage(edgeCanvas,dx+liquidX,dy+liquidY,dw,dh)
    }
    if(!hasCam&&(mode==='silhouette'||mode==='both'))drawFallbackSilhouette(t,w,h,reduced,mode==='both'?.16:.28);
    if(!hasCam&&(mode==='outline'||mode==='both'))drawFallbackContours(t,w,h,reduced,mode==='both'?.18:.32);
    if(mode==='abstract')drawBreathingMesh(t,w,h,smooth,bass,treble,reduced,(hidden?Math.max(shader.meshAlpha,.8)*quietScale:shader.meshAlpha),motion);
    ctx.restore();
  }
  function getSoundReveal(){
    if(!analyser)return 0;
    if(activeVideoLevel==='oculto'){
      const floor=Math.max(.0008,+$('#gate').value/1000*.4,audioState[10]*.5);
      return clamp((audioState[1]-floor)*Math.max(14,+$('#sens').value/2.5),0,.95);
    }
    return clamp((audioState[1]-Math.max(.003,+$('#gate').value/1000,audioState[10]*1.35))*Math.max(8,+$('#sens').value/4),0,.82)
  }
  function drawRevealedImage(t,shader,level,vivid,green,wave,fish,glitch){
    if(!video.videoWidth||!video.videoHeight)return 0;
    const hidden=level==='oculto',
    cap=hidden?.42:level==='sutil'?.20:.55,
    sound=hidden?soundRevealSmooth:getSoundReveal(),
    heuristic=conservativeHumanMotionHeuristic,
    motionReveal=clamp(Math.max(heuristic.revealAmount,motionActivity*16),0,1),
    activity=clamp(Math.max(motionReveal,sound*.65),0,1),
    baseReveal=0;
    if(hidden&&activity<=.002)return 0;
    if(hidden&&shader.mode==='abstract')return Math.max(activity,baseReveal);
    const scale=Math.max(w/video.videoWidth,h/video.videoHeight),
    vw=video.videoWidth*scale,
    vh=video.videoHeight*scale,
    vx=(w-vw)/2,
    vy=(h-vh)/2;
    revealCtx.setTransform(dpr,0,0,dpr,0,0);
    revealCtx.clearRect(0,0,w,h);
    revealCtx.globalCompositeOperation='source-over';
    revealCtx.globalAlpha=1;
    revealCtx.filter=hidden?'grayscale(1) contrast(2.85) sepia(.14) hue-rotate(158deg) saturate(.42) brightness(.82)':shader.filter;
    revealCtx.drawImage(video,vx,vy,vw,vh);
    revealCtx.filter='none';
    revealMaskCtx.setTransform(dpr,0,0,dpr,0,0);
    revealMaskCtx.clearRect(0,0,w,h);
    revealMaskCtx.globalCompositeOperation='source-over';
    revealMaskCtx.globalAlpha=baseReveal;
    revealMaskCtx.fillStyle='#fff';
    revealMaskCtx.fillRect(0,0,w,h);
    revealMaskCtx.globalAlpha=1;
    const mw=motionWidth,
    mh=motionHeight,
    ms=Math.max(w/mw,h/mh),
    mdw=mw*ms,
    mdh=mh*ms,
    mdx=(w-mdw)/2,
    mdy=(h-mdh)/2;
    revealMaskCtx.filter='contrast('+Math.round(1.35+(+$('#edge').value/100)*2.2)+')';
    if(!hidden||motionActivity>.0001||heuristic.revealAmount>.005){
      revealMaskCtx.globalAlpha=hidden?clamp(.35+sound*1.2,0,1.6):1;
      revealMaskCtx.drawImage(smokeCanvas,mdx,mdy,mdw,mdh);
      revealMaskCtx.globalAlpha=1
    }
    revealMaskCtx.filter='none';
    if(sound>.002){
      const pulseWave=hidden?(shader.reduced?0:Math.sin(t*.00035)*.025):(shader.reduced?0:Math.sin(t*.0011)*.08),
      radius=Math.max(w,h)*(hidden?.04+sound*.14:.12+sound*.58+pulseWave),
      glow=revealMaskCtx.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,radius);
      glow.addColorStop(0,'rgba(255,255,255,'+(sound*(hidden?.16:.75))+')');
      glow.addColorStop(.45,'rgba(255,255,255,'+(sound*(hidden?.08:.32))+')');
      glow.addColorStop(1,'rgba(255,255,255,0)');
      revealMaskCtx.globalCompositeOperation='lighter';
      revealMaskCtx.fillStyle=glow;
      revealMaskCtx.fillRect(0,0,w,h);
      revealMaskCtx.globalCompositeOperation='source-over'
    }
    revealCtx.globalCompositeOperation='destination-in';
    revealCtx.globalAlpha=1;
    revealCtx.drawImage(revealMaskCanvas,0,0,w,h);
    revealCtx.globalCompositeOperation='source-over';
    const effective=cap*clamp(.22+vivid*.78,0,1)*shader.imageAlpha*(hidden?Math.max(heuristic.revealAmount,sound*.65,baseReveal):1);
    ctx.save();
    ctx.globalCompositeOperation=shader.imageBlend;
    ctx.globalAlpha=effective;
    ctx.filter=hidden?'contrast('+Math.max(2.25,shader.imageContrast)+') saturate('+Math.min(.36,shader.imageSaturation)+') brightness(.82)':'contrast('+shader.imageContrast+') saturate('+shader.imageSaturation+')';
    const waves=wave/100,
    fishPower=fish/100,
    glitchPower=glitch/100,
    step=5,
    phase=shader.reduced?0:t*.00022;
    if(waves>0||fishPower>0){
      for(let y=0;y<h;y+=step){
        const center=(y+step*.5)/h-.5,
        curve=Math.max(0,1-center*center*3.2),
        waveX=waves*(Math.sin(phase+y*.012)+Math.sin(phase*.63+y*.006))*13,
        scaleX=1+fishPower*curve*.62,
        dw=w*scaleX,
        dx=(w-dw)/2+waveX;
        ctx.drawImage(revealCanvas,0,y*dpr,canvas.width,Math.min(step*dpr,canvas.height-y*dpr),dx,y,dw,step+1)
      }
    }
    else ctx.drawImage(revealCanvas,0,0,w,h);
    ctx.filter='none';
    ctx.globalCompositeOperation='screen';
    if(glitchPower>0){
      const offset=glitchPower*(shader.reduced?1:1+Math.sin(phase*1.4)*.15)*8;
      ctx.globalAlpha=effective*.23*glitchPower;
      ctx.filter='sepia(1) saturate(8) hue-rotate(300deg)';
      ctx.drawImage(revealCanvas,-offset,0,w,h);
      ctx.filter='sepia(1) saturate(8) hue-rotate(145deg)';
      ctx.drawImage(revealCanvas,offset,0,w,h)
    }
    if(green<100){
      ctx.globalCompositeOperation='multiply';
      ctx.globalAlpha=(100-green)/100*.20;
      ctx.fillStyle='#a9c4ad';
      ctx.fillRect(0,0,w,h)
    }
    ctx.restore();
    return Math.max(activity,baseReveal)
  }
  function pulse(power=.25,x=.5,y=.5,bass=0,treble=0,dominant=0){
    const hue=Math.round(clamp(dominant,0,1)*100);
    const color=hue>58?'90,235,255':'90,'+Math.round(150+hue)+',125';
    pulses.push({
      x:x,y:y,r:0,power:clamp(power,0,1),color:color,bass:bass,treble:treble
    });
    if(pulses.length>6)pulses.shift()
  }
  function sampleAudio(now){
    if(!analyser||!audioCtx)return;
    analyser.getFloatTimeDomainData(timeData);
    analyser.getFloatFrequencyData(freqData);
    const measured=measureAudioBands(timeData,freqData,audioCtx.sampleRate),
    {
      rms,
      peak
    }
    =measured,
    prev=audioState[0];
    if(now-micStartedAt<3000){
      noiseSum+=rms;
      noiseFrames++;
      audioState[10]=noiseSum/noiseFrames
    }
    else if(!noiseFrames)audioState[10]=.006;
    const {
      nyquist,
      dominantBin
    }
    =measured;
    let {
      bass,
      mid,
      treble
    }
    =measured;
    const n=freqData.length;
    bassMax=Math.max(bass,bassMax*.998);
    midMax=Math.max(mid,midMax*.998);
    trebleMax=Math.max(treble,trebleMax*.998);
    const b=clamp(bass/(bassMax*.72),0,1),
    m=clamp(mid/(midMax*.72),0,1),
    tr=clamp(treble/(trebleMax*.72),0,1),
    smoothing=+$('#smoothing').value/100,
    smooth=audioState[1]*smoothing+rms*(1-smoothing),
    delta=Math.max(0,rms-prev),
    transient=delta>Math.max(.025,audioState[10]*.85)&&rms>audioState[10]*1.7,
    force=clamp(delta*7+peak*.45,0,1),
    dom=clamp((dominantBin*nyquist/n)/8000,0,1);
    audioState[0]=rms;
    audioState[1]=smooth;
    audioState[2]=peak;
    audioState[3]=b;
    audioState[4]=m;
    audioState[5]=tr;
    audioState[6]=dom;
    audioState[7]=transient?1:0;
    audioState[8]=force;
    audioState[9]=now;
    if(now-lastAudioLog>=500){
      console.debug('[Psyco_Visão][AUDIO] RMS='+rms.toFixed(4)+' Peak='+peak.toFixed(3)+' Bass='+b.toFixed(3)+' Mid='+m.toFixed(3)+' Treble='+tr.toFixed(3)+' Transient='+(transient?'yes':'no'));
      lastAudioLog=now
    }
  }
  function soundlessAudioGlow(value,gateValue){
    return Math.max(0,value-gateValue)*1.4
  }
  function draw(t){
    raf=requestAnimationFrame(draw);
    if(firstDraw){
      firstDraw=false;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.fillStyle='#000';
      ctx.fillRect(0,0,w,h);
      setTimeout(()=>document.body.classList.remove('first-frame'),40);
      return
    }
    updateRenderPerformance(t);
    const dt=Math.min((t-last)/1000||.016,.06);
    last=t;
    sampleAudio(t);
    if(activeVideoLevel==='oculto'){
      const rawSoundReveal=getSoundReveal();
      soundRevealSmooth=analyser?soundRevealSmooth*.7+rawSoundReveal*.3:0
    }
    else soundRevealSmooth=0;
    const rms=audioState[0],
    smooth=audioState[1],
    peak=audioState[2],
    bass=audioState[3],
    mid=audioState[4],
    treble=audioState[5],
    dominant=audioState[6],
    transient=audioState[7],
    transientForce=audioState[8],
    noiseFloor=audioState[10],
    sensitivity=+$('#sens').value/40,
    gate=Math.max(.004,Math.max(+$('#gate').value/1000,noiseFloor*1.5)/Math.max(.25,sensitivity)),
    above=Math.max(0,rms-gate),
    now=audioState[9]||t;
    if(analyser){
      const triggered=(transient>0&&rms>gate)||above>.006/Math.max(.25,sensitivity);
      if(triggered&&now-lastPulseAt>(transient?65:105)){
        const strength=clamp((.10+above*15+transientForce*.75)*sensitivity,0,1);
        let x=.5,
        y=.5;
        if(treble>bass){
          originSide=1-originSide;
          x=originSide?.82:.18;
          y=.42+mid*.16
        }
        pulse(strength,x,y,bass,treble,dominant);
        lastPulseAt=now;
        lastSilenceAt=now
      }
      else if(now-lastSilenceAt>2000){
        pulse(.12,.5,.5,0,0,0);
        lastSilenceAt=now
      }
    }
    else if(started&&motionActivity>.001&&videoPresence>.001&&now-lastSilenceAt>2000){
      pulse(.12,.5,.5,0,0,0);
      lastSilenceAt=now
    }
    if(videoPresence!==videoPresenceTarget){
      const videoProgress=clamp((t-videoPresenceStart)/600,0,1),
      videoEase=1-Math.pow(1-videoProgress,3);
      videoPresence=videoPresenceFrom+(videoPresenceTarget-videoPresenceFrom)*videoEase;
      if(videoProgress===1)videoPresenceFrom=videoPresenceTarget
    }
    energy=smooth;
    const vivid=+$('#vivid').value/100,
    trail=+$('#trail').value/100,
    shader=getDreamShader($('#mode').value,activeDreamPreset,t);
    trailCtx.setTransform(dpr,0,0,dpr,0,0);
    trailCtx.globalCompositeOperation='source-over';
    trailCtx.fillStyle='rgba(0,0,0,'+Math.max(.72,1-trail*.25)+')';
    trailCtx.fillRect(0,0,w,h);
    trailCtx.globalCompositeOperation='lighter';
    const hasCam=video.readyState>=2;
    const motionRate=shader.reduced?.55:1;
    updateMotionShader(dt*motionRate,hasCam,shader.persistence,shader.mode,t,shader.reduced);
    for(let i=pulses.length-1;i>=0;i--){
      const p=pulses[i];
      p.r+=dt*motionRate*(100+220*p.power+90*p.bass);
      p.power*=Math.pow(.18,dt);
      if(p.power<.018){
        pulses.splice(i,1);
        continue
      }
      const x=p.x*w,
      y=p.y*h,
      r=p.r,
      thickness=12+10*p.treble,
      ringAlpha=(analyser?1:.72)*shader.pulseAlpha;
      const grad=trailCtx.createRadialGradient(x,y,Math.max(0,r-thickness),x,y,r+18);
      grad.addColorStop(0,'rgba('+p.color+',0)');
      grad.addColorStop(.72,'rgba('+p.color+','+(p.power*.045*ringAlpha)+')');
      grad.addColorStop(.94,'rgba('+p.color+','+(p.power*.12*ringAlpha)+')');
      grad.addColorStop(1,'rgba('+p.color+',0)');
      trailCtx.fillStyle=grad;
      trailCtx.beginPath();
      trailCtx.arc(x,y,r+18,0,Math.PI*2);
      trailCtx.fill();
      trailCtx.strokeStyle='rgba('+p.color+','+(p.power*.12*ringAlpha)+')';
      trailCtx.lineWidth=.65+1.8*p.power+1.6*p.treble;
      trailCtx.beginPath();
      trailCtx.arc(x,y,r,0,Math.PI*2);
      trailCtx.stroke();
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#000000';
    ctx.fillRect(0,0,w,h);
    let revealActivity=0;
    if(hasCam)revealActivity=drawRevealedImage(t,shader,activeVideoLevel,vivid,+$('#green').value,+$('#wave').value,+$('#fish').value,+$('#glitch').value);
    if(activeVideoLevel==='oculto'&&shader.mode==='abstract')revealActivity=Math.max(revealActivity,soundRevealSmooth,conservativeHumanMotionHeuristic.revealAmount);
    const cameraMotionReveal=clamp(Math.max(conservativeHumanMotionHeuristic.revealAmount,motionActivity*16),0,1),
    activation=clamp(Math.max(revealActivity,cameraMotionReveal,soundRevealSmooth),0,1),
    modeCanDraw=hasCam&&activation>.002;
    if(modeCanDraw)drawModeImage(shader.mode,shader,t,hasCam,smooth,bass,treble,w,h,activation);
    ctx.globalCompositeOperation='screen';
    ctx.globalAlpha=(activeVideoLevel==='oculto'?0:shader.screenAlpha*(analyser?1:.72))*Math.max(.08,trail*.38);
    ctx.drawImage(trailCanvas,0,0,w,h);
    ctx.globalAlpha=1;
    ctx.globalCompositeOperation='source-over';
    const hidden=activeVideoLevel==='oculto',
    breath=hidden ? .0008+Math.sin(t*.00038)*.00028 : analyser ? .0006+smooth*.025+bass*.004 : .00035+Math.sin(t*.00038)*.00018,
    glow=ctx.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,Math.max(w,h)*(.7+smooth*.18));
    glow.addColorStop(0,'rgba(8,35,20,'+clamp(breath,0,.35)+')');
    glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow;
    ctx.globalAlpha=activation>.002?(hidden?.22:1):0;
    ctx.fillRect(0,0,w,h);
    ctx.globalAlpha=1;
    const flash=activeVideoLevel==='oculto'?0:clamp(peak*.04+transientForce*.015,0,.025);
    if(flash>.008){
      ctx.fillStyle='rgba(105,255,175,'+flash+')';
      ctx.fillRect(0,0,w,h)
    }
  }
  draw(0);
  function notify(s){
    const n=$('#notice');
    n.textContent=s;
    n.classList.add('on');
    setTimeout(()=>n.classList.remove('on'),3000)
  }
  function updateCameraState(state,detail=''){
    const changed=cameraState!==state;
    cameraState=state;
    if(detail)cameraStateDetail=detail;
    else if(changed)cameraStateDetail='';
    const name=$('#cameraStateName'),
    note=$('#cameraStateNote'),
    button=$('#cameraStatus'),
    switchButton=$('#switchCamera'),
    busy=state==='loading'||state==='switching'||state==='recovering';
    name.textContent=state==='on'?'● OLHO ATIVO':state==='switching'?'● OLHO TROCANDO':state==='loading'?'○ PERMITA A CÂMERA':state==='recovering'?'○ OLHO CEGO':state==='error'?'○ OLHO FECHADO':'○ OLHO CEGO';
    note.textContent=detail||cameraStateDetail||(state==='on'?'Câmera funcionando':state==='switching'?'Virando a câmera...':state==='loading'?'Toque em Permitir no aviso do navegador':state==='recovering'?'Tentando abrir de novo':state==='denied'?'Toque no cadeado e permita a câmera':'Toque aqui para tentar de novo');
    button.setAttribute('aria-busy',busy?'true':'false');
    button.disabled=busy;
    switchButton.hidden=state!=='on'||!cameraSwitchAvailable;
    switchButton.disabled=busy;
    switchButton.textContent=cameraFacingMode==='environment'?'VIRAR PARA A FRENTE':'VIRAR PARA TRÁS';
    document.body.classList.toggle('dream-awake',state==='on')
  }
  function refreshCameraChoices(){
    if(!navigator.mediaDevices?.enumerateDevices){
      cameraSwitchAvailable=false;
      updateCameraState(cameraState);
      return
    }
    navigator.mediaDevices.enumerateDevices().then(devices=>{
      cameraSwitchAvailable=countVideoInputs(devices)>1;
      updateCameraState(cameraState)
    }).catch(()=>{
      cameraSwitchAvailable=false;
      updateCameraState(cameraState)
    })
  }
  function scheduleCameraRecovery(error){
    if(cameraRetryTimer||cameraBusy)return;
    if(document.visibilityState==='hidden'){
      updateCameraState('recovering','Ao voltar para esta página, tentaremos abrir o olho.');
      return
    }
    if(started&&stream){
      const stale=stream;
      started=false;
      stream=null;
      video.srcObject=null;
      stale.getTracks().forEach(t=>t.stop())
    }
    if(cameraRetryCount>=3){
      updateCameraState('error',cameraErrorMessage(error)+' Toque no olho para tentar de novo.');
      return
    }
    const delay=[500,
    1000,
    2000][cameraRetryCount++];
    updateCameraState('recovering','A câmera parou. Tentaremos abrir de novo.');
    cameraRetryTimer=setTimeout(()=>{
      cameraRetryTimer=0;
      startCamera(cameraFacingMode,{
        recovery:true
      })
    },delay)
  }
  function attachCameraTrack(activeStream){
    const track=activeStream.getVideoTracks()[0];
    if(!track)return;
    track.addEventListener('ended',()=>{
      if(stream!==activeStream||cameraSwitching)return;
      started=false;
      stream=null;
      video.srcObject=null;
      const err={
        name:'NotReadableError'
      };
      notify(cameraErrorMessage(err));
      scheduleCameraRecovery(err)
    });
    track.addEventListener('mute',()=>{
      setTimeout(()=>{
        if(stream===activeStream&&track.muted&&!cameraSwitching){
          const err={
            name:'NotReadableError'
          };
          notify(cameraErrorMessage(err));
          scheduleCameraRecovery(err)
        }
      },1200)
    });
    track.addEventListener('unmute',()=>{
      if(stream===activeStream&&track.readyState==='live'){
        started=true;
        cameraRetryCount=0;
        updateCameraState('on')
      }
    })
  }
  async function startCamera(mode=cameraFacingMode,{
    recovery=false,switching=false
  }
  ={}){
    if(document.visibilityState==='hidden'){
      updateCameraState('recovering','Ao voltar para esta página, pediremos acesso à câmera.');
      return false
    }
    if(cameraRetryTimer){
      clearTimeout(cameraRetryTimer);
      cameraRetryTimer=0
    }
    if(cameraBusy)return false;
    if(started&&stream&&!recovery&&!switching)return true;
    cameraBusy=true;
    if(switching)cameraSwitching=true;
    if(!recovery&&!switching)cameraRetryCount=0;
    updateCameraState(switching?'switching':recovery?'recovering':'loading');
    let nextStream=null;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera-unavailable');
      try{
        nextStream=await navigator.mediaDevices.getUserMedia(getCameraConstraints(mode))
      }
      catch(constraintError){
        if(constraintError?.name!=='OverconstrainedError')throw constraintError;
        nextStream=await navigator.mediaDevices.getUserMedia({
          video:{
            facingMode:{
              ideal:mode
            }
          },audio:false
        })
      }
      const actualMode=nextStream.getVideoTracks()[0]?.getSettings?.().facingMode;
      if(switching&&actualMode&&actualMode!==mode)throw Object.assign(new Error('requested-camera-unavailable'),{
        name:'OverconstrainedError'
      });
      const previousStream=stream;
      video.srcObject=nextStream;
      await video.play();
      stream=nextStream;
      cameraFacingMode=actualMode||mode;
      started=true;
      cameraRetryCount=0;
      cameraBusy=false;
      cameraSwitching=false;
      attachCameraTrack(nextStream);
      if(previousStream&&previousStream!==nextStream)previousStream.getTracks().forEach(t=>t.stop());
      updateCameraState('on');
      refreshCameraChoices();
      if(!recovery&&!switching)notify('O olho está aberto. A imagem fica neste aparelho.');
      return true
    }
    catch(error){
      if(nextStream&&nextStream!==stream)nextStream.getTracks().forEach(t=>t.stop());
      cameraBusy=false;
      cameraSwitching=false;
      started=!!stream&&stream.getVideoTracks().some(t=>t.readyState==='live');
      if(started){
        video.srcObject=stream;
        updateCameraState('on');
        refreshCameraChoices()
      }
      else{
        const denied=['NotAllowedError',
        'PermissionDeniedError'].includes(error?.name);
        const message=error?.message==='camera-unavailable'?'Este navegador não consegue abrir a câmera. Tente usar um navegador atualizado.':cameraErrorMessage(error);
        updateCameraState(denied?'denied':'error',message);
        notify(message);
        if(!switching&&!denied&&error?.message!=='camera-unavailable'&&!['NotFoundError','DevicesNotFoundError','SecurityError'].includes(error?.name))scheduleCameraRecovery(error)
      }
      console.warn('[Psyco_Visão][CAMERA] Falha ao abrir',error);
      return false
    }
  }
  async function switchCamera(){
    if(cameraBusy||cameraSwitching||!started||!cameraSwitchAvailable)return;
    const previous=cameraFacingMode,
    target=previous==='environment'?'user':'environment';
    cameraSwitching=true;
    updateCameraState('switching');
    const oldStream=stream;
    stream=null;
    started=false;
    video.srcObject=null;
    if(oldStream)oldStream.getTracks().forEach(t=>t.stop());
    await new Promise(resolve=>setTimeout(resolve,180));
    const switched=await startCamera(target,{
      switching:true
    });
    if(switched){
      notify('A câmera mudou.');
      return
    }
    const fallback=target==='user'?'environment':previous;
    const returned=await startCamera(fallback,{
      switching:true
    });
    if(returned)notify(target==='user'?'A câmera da frente não respondeu. Voltamos para a traseira.':'A troca não funcionou. Voltamos para a câmera anterior.');
    else updateCameraState('error','As câmeras não responderam. Toque no olho para tentar de novo.')
  }
  function updateMicState(state){
    const name=$('#micStateName'),
    note=$('#micStateNote'),
    button=$('#microphoneStatus'),
    action=$('#listenToggle');
    name.textContent=state==='on'?'● ESCUTA ATIVA':state==='loading'?'○ ESCUTA DESPERTANDO':state==='error'?'○ ESCUTA IMPEDIDA':'○ ESCUTA MUDA';
    note.textContent=state==='on'?'Microfone funcionando':state==='loading'?'Aguarde um instante':state==='error'?'Toque para tentar de novo':'Toque em ESCUTAR para acordar';
    button.setAttribute('aria-busy',state==='loading'?'true':'false');
    button.disabled=state==='loading';
    action.disabled=state==='loading';
    $('#micEnable').disabled=state==='loading';
    action.textContent=state==='on'?'SILENCIAR':'ESCUTAR';
    action.classList.toggle('is-active',state==='on')
  }
  function handleMicInterruption(){
    if(!micStream)return;
    const failedStream=micStream;
    micStream=null;
    analyser=null;
    soundRevealSmooth=0;
    audioCtx?.close();
    audioCtx=null;
    $('#micEnable').checked=false;
    failedStream.getTracks().forEach(track=>{
      track.onended=null;
      track.stop()
    });
    updateMicState('error');
    notify('A escuta foi interrompida. Toque em ESCUTAR para tentar de novo.')
  }
  function reveal(){
    const p=$('#panel');
    p.classList.add('show');
    document.body.classList.remove('sleeping');
    clearTimeout(panelTimer);
    panelTimer=setTimeout(()=>{
      if(!$('#wake').checked){
        p.classList.remove('show');
        document.body.classList.add('sleeping')
      }
    },8000)
  }
  function wakeForMoment(){
    document.body.classList.remove('sleeping');
    clearTimeout(panelTimer);
    panelTimer=setTimeout(()=>{
      if(!$('#panel').classList.contains('show')&&!$('#shareDialog').open&&!$('#wake').checked)document.body.classList.add('sleeping')
    },4200)
  }
  $('#settingsOpen').onclick=reveal;
  $('#panel').addEventListener('pointerdown',()=>reveal());
  $('#panel').addEventListener('keydown',()=>reveal());
  $('#cameraStatus').onclick=()=>{
    wakeForMoment();
    if(!started)startCamera(cameraFacingMode)
  };
  $('#microphoneStatus').onclick=()=>$('#listenToggle').click();
  $('#listenToggle').onclick=()=>{
    wakeForMoment();
    const mic=$('#micEnable');
    mic.checked=!mic.checked;
    mic.dispatchEvent(new Event('change',{
      bubbles:true
    }));
    try{
      navigator.vibrate?.(30)
    }
    catch{}
  };
  $('#shareOpen').onclick=()=>{
    wakeForMoment();
    const d=$('#shareDialog');
    if(d.showModal)d.showModal();
    else d.setAttribute('open','')
  };
  document.querySelectorAll('[data-close-share]').forEach(b=>b.onclick=()=>{
    $('#shareDialog').close?.();
    wakeForMoment()
  });
  $('#close').onclick=()=>{
    $('#panel').classList.remove('show');
    wakeForMoment()
  };
  canvas.addEventListener('pointerdown',()=>reveal());
  $('#switchCamera').onclick=()=>switchCamera();
  document.querySelectorAll('#presets .preset').forEach(button=>button.addEventListener('click',()=>{
    const preset=button.dataset.preset;
    if(!applyDreamPreset(preset,$))return;
    document.querySelectorAll('#presets .preset').forEach(item=>{
      const active=item===button;
      item.classList.toggle('active',active);
      item.setAttribute('aria-pressed',String(active))
    });
    activeDreamPreset=preset;
    updateLabels();
    persist();
    pulse(.6,.5,.5)
  }));
  $('#about').onclick=()=>$('#aboutText').hidden=!$('#aboutText').hidden;
  function refreshDeviceDiagnostics(){
    const report=$('#diagnosticReport'),
    width=innerWidth,
    height=innerHeight,
    form=width<=680?'celular':width<=1024?'tablet':'laptop';
    let storage='indisponível';
    try{
      const key='wut-diagnostic-check';
      localStorage.setItem(key,'ok');
      storage=localStorage.getItem(key)==='ok'?'funcionando':'com problema';
      localStorage.removeItem(key)
    }
    catch{}
    const cameraApi=!!navigator.mediaDevices?.getUserMedia,
    canvasOk=!!ctx&&canvas.width>0&&canvas.height>0;
    report.textContent=['Formato detectado: '+form+' ('+width+' × '+height+')',
    'Ligação segura: '+(isSecureContext?'sim':'não — use HTTPS ou localhost'),
    'Módulos e interface: carregados',
    'Canvas: '+(canvasOk?'funcionando':'não iniciado'),
    'Câmera: '+(cameraApi?cameraState:'API indisponível')+(video.readyState>=2?' · imagem recebida':''),
    'Microfone: '+($('#micEnable').checked?'ativado':'desativado · opcional'),
    'Toque: '+(('ontouchstart' in window||navigator.maxTouchPoints>0)?'disponível':'não detectado'),
    'Movimento reduzido: '+(reducedMotionQuery?.matches?'ativado':'desativado'),
    'Armazenamento local: '+storage,
    'Vídeo selecionado: '+activeVideoLevel.toUpperCase()].join('\n');
    report.hidden=false
  }
  $('#diagnosticRun').onclick=refreshDeviceDiagnostics;
  $('#diagnosticCamera').onclick=async()=>{
    if(!isSecureContext){
      refreshDeviceDiagnostics();
      return
    }
    if(!started)await startCamera(cameraFacingMode);
    refreshDeviceDiagnostics()
  };
  $('#wake').onchange=async e=>{
    if(e.target.checked&&navigator.wakeLock)try{
      await navigator.wakeLock.request('screen')
    }
    catch{}
  };
  setTimeout(()=>{
    if(!$('#panel').classList.contains('show'))document.body.classList.add('sleeping')
  },9000);
  $('#micEnable').onchange=async e=>{
    if(!e.target.checked){
      micStream?.getTracks().forEach(t=>t.stop());
      micStream=null;
      analyser=null;
      soundRevealSmooth=0;
      audioCtx?.close();
      audioCtx=null;
      audioState.fill(0);
      audioState[10]=.006;
      updateMicState('off');
      notify('O sonho ficou em silêncio.');
      return
    }
    soundRevealSmooth=0;
    updateMicState('loading');
    try{
      console.info('[Psyco_Visão][AUDIO] Solicitando acesso ao microfone; contexto seguro='+isSecureContext);
      micStream=await navigator.mediaDevices.getUserMedia({
        audio:{
          echoCancellation:false,noiseSuppression:false,autoGainControl:false
        }
      });
      audioCtx=new(window.AudioContext||window.webkitAudioContext)();
      await audioCtx.resume();
      const src=audioCtx.createMediaStreamSource(micStream);
      analyser=audioCtx.createAnalyser();
      analyser.fftSize=1024;
      analyser.smoothingTimeConstant=.15;
      src.connect(analyser);
      freqData.fill(-120);
      timeData.fill(0);
      micStartedAt=performance.now();
      lastSilenceAt=micStartedAt;
      lastAudioLog=micStartedAt;
      console.info('[Psyco_Visão][AUDIO] Captura ativa; estado='+audioCtx.state+' sampleRate='+audioCtx.sampleRate+' fftSize='+analyser.fftSize+' input='+micStream.getAudioTracks()[0]?.label);
      noiseSum=0;
      noiseFrames=0;
      bassMax=midMax=trebleMax=1e-6;
      audioState.fill(0);
      audioState[10]=.006;
      const activeMicTrack=micStream.getAudioTracks()[0];
      if(activeMicTrack){
        activeMicTrack.onended=handleMicInterruption;
        activeMicTrack.addEventListener('mute',()=>setTimeout(()=>{
          if(micStream&&activeMicTrack.muted)handleMicInterruption()
        },1200))
      }
      updateMicState('on');
      notify('O sonho está escutando.')
    }
    catch(err){
      micStream?.getTracks().forEach(t=>t.stop());
      micStream=null;
      analyser=null;
      soundRevealSmooth=0;
      audioCtx?.close();
      audioCtx=null;
      console.error('[Psyco_Visão][AUDIO] Falha na captura',err);
      e.target.checked=false;
      updateMicState('error');
      notify(err.name==='NotAllowedError'?'Permita o microfone nas configurações do navegador.':err.name==='NotFoundError'?'Não encontramos um microfone neste aparelho.':err.name==='NotReadableError'?'O microfone pode estar sendo usado por outro aplicativo. Feche esse aplicativo e tente de novo.':'Não foi possível ligar o som. Confira a permissão do microfone e tente outra vez.')
    }
  };
  $('#fullscreen').onclick=()=>{
    if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>notify('A tela cheia não está disponível neste aparelho.'));
    else document.exitFullscreen?.()
  };
  $('#copyLink').onclick=async()=>{
    try{
      await navigator.clipboard.writeText(location.href);
      notify('Endereço copiado. Abra no aparelho transmissor.')
    }
    catch{
      notify('Copie o endereço pela barra do navegador.')
    }
  };
  setInterval(()=>{
    const percent=Math.min(1,Math.max(0,audioState[1]*5))*100,word=percent<5?'Silêncio':percent<20?'Sussurro':percent<40?'Fala baixa':percent<60?'Fala':percent<80?'Voz alta':'Grito';
    $('#soundWord').textContent=word;
    $('#soundRule').style.setProperty('--level',percent+'%');
    $('#soundWord').classList.toggle('low',percent<5);
    $('#soundWord').classList.toggle('strong',percent>=60)
  },120);
  updateCameraState('loading');
  updateMicState('off');
  refreshCameraChoices();
  if(isSecureContext&&navigator.mediaDevices?.getUserMedia){
    startCamera('environment')
  }
  else{
    setTimeout(()=>updateCameraState('off','Para abrir o olho, use o endereço seguro do Vercel ou localhost.'),2600);
    notify('Para abrir o olho, use o endereço seguro do Vercel ou localhost.')
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible')return;
    if(audioCtx?.state==='suspended')audioCtx.resume().catch(()=>notify('A escuta precisa ser ligada de novo.'));
    if(!started||!stream||stream.getVideoTracks().some(t=>t.readyState!=='live')){
      if(cameraState!=='denied'&&!cameraBusy)scheduleCameraRecovery({
        name:'NotReadableError'
      });
      return
    }
    const visibleStream=stream;
    Promise.resolve(video.play()).catch(()=>scheduleCameraRecovery({
      name:'NotReadableError'
    }));
    setTimeout(()=>{
      if(document.visibilityState==='visible'&&visibleStream===stream&&(video.readyState<2||visibleStream.getVideoTracks().some(t=>t.muted)))scheduleCameraRecovery({
        name:'NotReadableError'
      })
    },900);
  });
  window.addEventListener('pageshow',()=>{
    if(document.visibilityState==='visible'&&cameraState!=='denied'&&!started&&!cameraBusy)scheduleCameraRecovery({
      name:'NotReadableError'
    })
  });
  window.addEventListener('online',()=>{
    if(cameraState==='error'&&!started)startCamera(cameraFacingMode,{
      recovery:true
    })
  });
  navigator.mediaDevices?.addEventListener?.('devicechange',
  refreshCameraChoices);
  if(navigator.permissions?.query){
    navigator.permissions.query({
      name:'camera'
    }).then(permission=>permission.addEventListener('change',()=>{
      if(permission.state==='granted'&&!started&&!cameraBusy){
        cameraRetryCount=0;
        startCamera(cameraFacingMode,{
          recovery:true
        })
      }
    })).catch(()=>{})
  }
})();

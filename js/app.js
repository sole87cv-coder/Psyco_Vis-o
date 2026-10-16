import {
  VIDEO_LEVELS,
  CONTROL_IDS,
  ANALYSIS_WIDTH,
  ANALYSIS_HEIGHT,
  FIELD_PIXELS,
  DPR_CAP,
  HUD,
  PERF,
  DEFAULT_VIDEO_LEVEL,
  DEFAULT_PRESET
}
from './config.js';
import {
  clamp,
  coverRect,
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
  bindVideoLevelButtons,
  createHud
}
from './ui.js';
import {
  cameraErrorMessage,
  getCameraConstraints,
  detectDeviceContext,
  classifyCameras,
  pickFlipTarget
}
from './camera.js';
import {
  createMotionState,
  analyzeMotionFrame,
  resetMotionState
}
from './motion.js';
import {
  measureAudioBands,
  updateEnvelope,
  syntheticEnvelope
}
from './audio.js';
import {
  createDreamEngine
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
  raf=0,
  last=0,
  started=false,
  cameraBusy=false,
  cameraSwitching=false,
  cameraFacingMode='environment',
  cameraContext=detectDeviceContext(),
  cameraClassification=null,
  cameraActiveId='',
  storedCameraId=readStoredCameraId(),
  storedFacing=readStoredFacing(),
  cameraRetryCount=0,
  cameraRetryTimer=0,
  deviceChangeTimer=0,
  cameraState='off',
  cameraStateDetail='',
  lastAudioLog=0,
  hiddenStopTimer=0,
  adaptiveScale=1,
  measuredFrameMs=8,
  frameWindowTime=0,
  frameWindowFrames=0,
  frameWorkSum=0,
  poorAccumMs=0,
  goodAccumMs=0,
  motionActivity=0,
  firstDraw=true,
  loopActive=false,
  rafErrorLogged=false,
  cameraGestureArmed=false,
  envelope=0,
  lastEnvelope=0;
  const saved=readStorageJSON('psyco_visao_settings',readStorageJSON('wut-settings'));
  const videoLevels=VIDEO_LEVELS,
  savedVisual=readStorageJSON('psyco_visao_visual',readStorageJSON('weburutao_visual')),
  initialVideoLevel=Object.prototype.hasOwnProperty.call(videoLevels,savedVisual.activeVideoLevel)?savedVisual.activeVideoLevel:DEFAULT_VIDEO_LEVEL;
  let activeVideoLevel=initialVideoLevel,
  videoPresence=videoLevels[initialVideoLevel],
  videoPresenceFrom=videoPresence,
  videoPresenceTarget=videoPresence,
  videoPresenceStart=0;
  const motionReadCanvas=document.createElement('canvas');
  motionReadCanvas.width=ANALYSIS_WIDTH;
  motionReadCanvas.height=ANALYSIS_HEIGHT;
  const motionReadCtx=motionReadCanvas.getContext('2d',{
    willReadFrequently:true
  });
  const analysisState=createMotionState(ANALYSIS_WIDTH,ANALYSIS_HEIGHT);
  const dreamField=createDreamEngine();
  const hud=createHud({
    idleMs:HUD.idleMs
  });
  const audioState=new Float64Array(11),
  bandValues=new Float32Array(8),
  bandsSmooth=new Float32Array(8),
  bandsMax=new Float32Array(8).fill(1e-6),
  timeData=new Float32Array(512),
  freqData=new Float32Array(256),
  bandLive={
    bass:0,mid:0,treble:0
  },
  liveParams={
    green:.72,wave:0,fish:0,glitch:0,vivid:.72
  };
  let micStartedAt=0,
  noiseSum=0,
  noiseFrames=0,
  bassMax=1e-6,
  midMax=1e-6,
  trebleMax=1e-6,
  lastPulseAt=0,
  lastSilenceAt=0;
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
    if(level!==activeVideoLevel)dreamField.reset();
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
  function desiredFieldSize(){
    const aspect=clamp(w/Math.max(1,h),.4,2.6),
    small=innerWidth<=720,
    budget=small?FIELD_PIXELS.celular:FIELD_PIXELS.computador,
    limit=small?720:1200;
    const height=clamp(Math.round(Math.sqrt(budget/aspect)),160,limit),
    width=clamp(Math.round(height*aspect),160,limit);
    return{
      width,height
    }
  }
  function resize(){
    const small=innerWidth<=720,
    cap=small?DPR_CAP.celular:DPR_CAP.computador;
    dpr=Math.max(.75,Math.min(devicePixelRatio||1,cap)*adaptiveScale);
    w=innerWidth;
    h=innerHeight;
    canvas.width=Math.round(w*dpr);
    canvas.height=Math.round(h*dpr);
    canvas.style.width=w+'px';
    canvas.style.height=h+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    const field=desiredFieldSize();
    if(!dreamField.width||Math.abs(field.height/dreamField.height-1)>.06){
      dreamField.resize(field.width,field.height);
      resetMotionState(analysisState);
      lastSilenceAt=performance.now()
    }
  }
  addEventListener('resize',resize);
  resize();
  const reducedMotionQuery=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let activeDreamPreset=['bat','deep','delirium','breath'].includes(saved.preset)?saved.preset:DEFAULT_PRESET;
  document.querySelectorAll('#presets .preset').forEach(button=>{
    const active=button.dataset.preset===activeDreamPreset;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active))
  });
  function updateFrameBudget(dt,workMs){
    frameWindowTime+=dt;
    frameWindowFrames++;
    frameWorkSum+=workMs||0;
    if(frameWindowTime<1)return;
    measuredFrameMs=frameWorkSum/Math.max(1,frameWindowFrames);
    frameWindowTime=0;
    frameWindowFrames=0;
    frameWorkSum=0;
    if(document.visibilityState==='hidden'){
      poorAccumMs=0;
      goodAccumMs=0;
      return
    }
    if(measuredFrameMs>PERF.slowMs){
      goodAccumMs=0;
      poorAccumMs+=1000;
      if(poorAccumMs>=PERF.slowWindowMs&&adaptiveScale>PERF.minScale){
        adaptiveScale=Math.max(PERF.minScale,adaptiveScale*PERF.downscale);
        poorAccumMs=0;
        resize()
      }
    }
    else if(measuredFrameMs<PERF.restoreMs){
      poorAccumMs=0;
      goodAccumMs+=1000;
      if(goodAccumMs>=PERF.restoreWindowMs&&adaptiveScale<1){
        adaptiveScale=Math.min(1,adaptiveScale*PERF.upscale);
        goodAccumMs=0;
        resize()
      }
    }
    else{
      poorAccumMs=0;
      goodAccumMs=0
    }
  }
  function sampleAudio(now){
    if(!analyser||!audioCtx)return;
    analyser.getFloatTimeDomainData(timeData);
    analyser.getFloatFrequencyData(freqData);
    const measured=measureAudioBands(timeData,freqData,audioCtx.sampleRate,bandValues),
    {
      rms,peak,bass,mid,treble,nyquist,dominantBin
    }
    =measured,
    previousRms=audioState[0];
    if(now-micStartedAt<3000){
      noiseSum+=rms;
      noiseFrames++;
      audioState[10]=Math.min(noiseSum/noiseFrames,.05)
    }
    else if(!noiseFrames){
      noiseFrames=1;
      audioState[10]=.006
    }
    for(let i=0;i<8;i++){
      const target=clamp(bandValues[i]/(bandsMax[i]*.72),0,1);
      bandsMax[i]=Math.max(bandValues[i],bandsMax[i]*.998);
      bandsSmooth[i]+=(target-bandsSmooth[i])*(target>bandsSmooth[i]?.55:.1)
    }
    bassMax=Math.max(bass,bassMax*.998);
    midMax=Math.max(mid,midMax*.998);
    trebleMax=Math.max(treble,trebleMax*.998);
    const b=clamp(bass/(bassMax*.72),0,1),
    m=clamp(mid/(midMax*.72),0,1),
    tr=clamp(treble/(trebleMax*.72),0,1),
    release=+$('#smoothing').value/100,
    smooth=audioState[1]+(rms-audioState[1])*(rms>audioState[1]?.5:Math.max(.06,(1-release)*.4)),
    delta=Math.max(0,rms-previousRms),
    transient=delta>Math.max(.025,audioState[10]*.85)&&rms>audioState[10]*1.7,
    force=clamp(delta*7+peak*.45,0,1),
    dom=clamp((dominantBin*nyquist/freqData.length)/8000,0,1);
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
      console.debug('[Psyco_Visão][AUDIO] RMS='+rms.toFixed(4)+' Bass='+b.toFixed(3)+' Mid='+m.toFixed(3)+' Treble='+tr.toFixed(3)+' Transient='+(transient?'yes':'no'));
      lastAudioLog=now
    }
  }
  function updateSpawns(t,shader,env){
    const now=t,
    mode=shader.mode;
    if(mode==='abstract'){
      const sensitivity=+$('#sens').value/40,
      gate=Math.max(.004,Math.max(+$('#gate').value/1000,audioState[10]*1.5)/Math.max(.25,sensitivity)),
      rms=audioState[0],
      above=Math.max(0,rms-gate),
      bass=audioState[3],
      mid=audioState[4],
      treble=audioState[5],
      rise=env-lastEnvelope;
      let triggered=false;
      if(analyser){
        triggered=((audioState[7]>0&&rms>gate)||above>.006/Math.max(.25,sensitivity))&&now-lastPulseAt>(audioState[7]?90:140)
      }
      else{
        triggered=rise>.018&&env>.09&&now-lastPulseAt>420
      }
      if(triggered){
        const strength=clamp((.14+(analyser?above*14:env*.8)+audioState[8]*.7)*sensitivity,0,1);
        if(analyser&&treble>bass*1.12&&strength>.2)dreamField.spawnDots(Math.round(3+treble*11),strength,analysisState);
        else if(analyser&&bass<mid)dreamField.spawnRing({
          power:strength*.9,band:'mid'
        });
        else dreamField.spawnRing({
          power:clamp(strength*1.15,0,1),band:'bass'
        });
        lastPulseAt=now;
        lastSilenceAt=now;
        hud.noteActivity()
      }
      else if(now-lastSilenceAt>2000/shader.breathRate){
        dreamField.spawnRing({
          power:.05+shader.breathDepth*.05,band:'bass'
        });
        lastSilenceAt=now
      }
      if(analyser&&(bandsSmooth[6]+bandsSmooth[7])*.5>.42&&Math.random()<.1)dreamField.spawnDots(2,clamp(bandsSmooth[6],0,1),analysisState)
    }
    else if(mode==='both'&&shader.smoke>0){
      dreamField.spawnSmoke(env,audioState[4],audioState[5],liveParams.wave,analysisState)
    }
    lastEnvelope=env
  }
  function maybeStartLoop(){
    if(loopActive||document.visibilityState==='hidden')return;
    loopActive=true;
    last=0;
    raf=requestAnimationFrame(draw)
  }
  function maybeStopLoop(){
    loopActive=false;
    if(raf){
      cancelAnimationFrame(raf);
      raf=0
    }
  }
  function frame(t){
    const workStart=performance.now();
    if(firstDraw){
      firstDraw=false;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.fillStyle='#000';
      ctx.fillRect(0,0,w,h);
      setTimeout(()=>document.body.classList.remove('first-frame'),40);
      last=t;
      return
    }
    const dt=Math.min((t-last)/1000||.016,.06);
    last=t;
    sampleAudio(t);
    const shader=getDreamShader($('#mode').value,activeDreamPreset,t,reducedMotionQuery?.matches);
    const hasCam=video.readyState>=2&&video.videoWidth>0;
    if(hasCam){
      const crop=coverRect(video.videoWidth,video.videoHeight,ANALYSIS_WIDTH,ANALYSIS_HEIGHT);
      motionReadCtx.drawImage(video,crop.sx,crop.sy,crop.sw,crop.sh,0,0,ANALYSIS_WIDTH,ANALYSIS_HEIGHT);
      const frameData=motionReadCtx.getImageData(0,0,ANALYSIS_WIDTH,ANALYSIS_HEIGHT);
      if(analysisState.hasPrevious){
        analyzeMotionFrame(frameData.data,analysisState,+$('#edge').value/100,true);
        motionActivity=analysisState.activity
      }
      else{
        analyzeMotionFrame(frameData.data,analysisState,+$('#edge').value/100,false);
        analysisState.motion.fill(0);
        analysisState.structure.fill(0);
        motionActivity=0
      }
    }
    const sensitivity=+$('#sens').value/40,
    gate=Math.max(.004,Math.max(+$('#gate').value/1000,audioState[10]*1.5)/Math.max(.25,sensitivity)),
    release=+$('#smoothing').value/100;
    let envelopeTarget=analyser?clamp(Math.max(0,audioState[1]-gate)*14+audioState[8]*.6,0,1):syntheticEnvelope(t);
    if(!analyser&&motionActivity>.0015)envelopeTarget=Math.max(envelopeTarget,Math.min(.45,motionActivity*10));
    envelope=updateEnvelope(envelope,envelopeTarget,.5,shader.reduced?.35:Math.max(.08,(1-release)*.3));
    bandLive.bass=clamp(audioState[3]*shader.bandBass,0,1);
    bandLive.mid=clamp(audioState[4]*shader.bandMid,0,1);
    bandLive.treble=clamp(audioState[5]*shader.bandTreble,0,1);
    liveParams.green=+$('#green').value/100;
    liveParams.wave=+$('#wave').value/100;
    liveParams.fish=+$('#fish').value/100;
    liveParams.glitch=+$('#glitch').value/100;
    liveParams.vivid=+$('#vivid').value/100;
    updateSpawns(t,shader,envelope);
    dreamField.step(dt,{
      shader,rmsEnvelope:envelope,motion:analysisState,live:liveParams
    });
    if(videoPresence!==videoPresenceTarget){
      const progress=clamp((t-videoPresenceStart)/600,0,1),
      ease=1-Math.pow(1-progress,3);
      videoPresence=videoPresenceFrom+(videoPresenceTarget-videoPresenceFrom)*ease;
      if(progress===1)videoPresenceFrom=videoPresenceTarget
    }
    const trailValue=+$('#trail').value/100;
    let decay=trailValue<=.84
      ?shader.decayMin+(shader.decay-shader.decayMin)*(trailValue/.84)
      :shader.decay+(shader.decayMax-shader.decay)*((trailValue-.84)/.16);
    if(shader.reduced)decay=Math.min(decay,shader.decayMin+.02);
    const mode=shader.mode,
    level=activeVideoLevel,
    edgeControl=+$('#edge').value/100,
    needsMask=hasCam&&(mode==='abstract'||mode==='silhouette'||mode==='both'||level!=='oculto');
    let underlay=false;
    if(needsMask){
      dreamField.buildReveal(analysisState,mode==='abstract'||level==='oculto'?'visivel':level,edgeControl,shader,liveParams);
      if(level!=='oculto')underlay=dreamField.renderUnderlay(video,shader,level)
    }
    if(mode==='abstract')dreamField.renderEchoEnergy(shader,analysisState,envelope,bandLive,liveParams,level,edgeControl);
    else if(mode==='silhouette')dreamField.renderSilhouette(shader,envelope,bandLive,liveParams);
    else if(mode==='both'){
      dreamField.renderSilhouette(shader,envelope,bandLive,liveParams);
      if(hasCam)dreamField.renderContourThin(shader,analysisState,envelope,liveParams);
      if(shader.smoke>0)dreamField.updateAndDrawSmoke(shader,analysisState,envelope,bandLive,liveParams,dt,t)
    }
    else if(hasCam)dreamField.renderInfrared(shader,analysisState,envelope,bandLive,liveParams,t);
    dreamField.accumulate(decay,mode==='abstract'||mode==='outline');
    dreamField.tear(liveParams.glitch,bandLive.treble);
    const breath=.5+.5*Math.sin(t*.00045*shader.breathRate),
    breathLevel=Math.round(.4+4.6*shader.breathDepth*breath),
    breathColor='rgb('+(breathLevel>0?breathLevel:0)+','+breathLevel+','+(breathLevel>0?breathLevel-1:0)+')',
    videoAlpha=underlay?clamp(videoPresence*(level==='visivel'?shader.videoGainVisivel:shader.videoGainSutil)*envelope,0,.6):0,
    blindSpot=shader.blindSpot?Math.max(24,h*(.05+shader.breathDepth*.012+audioState[1]*.3)):0;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    dreamField.compose(ctx,{
      width:w,height:h,
      underlayReady:underlay,
      videoAlpha,
      breathColor,
      blindSpot,
      fish:liveParams.fish,
      glitch:liveParams.glitch,
      treble:bandLive.treble,
      emitterScreenX:w*.5,
      emitterScreenY:h*.97
    });
    const flash=clamp(audioState[2]*.05+audioState[8]*.012,0,.028);
    if(flash>.008){
      const palette=shader.palette.flash;
      ctx.globalCompositeOperation='lighter';
      ctx.fillStyle='rgba('+palette[0]+','+palette[1]+','+palette[2]+','+flash+')';
      ctx.fillRect(0,0,w,h);
      ctx.globalCompositeOperation='source-over'
    }
    updateFrameBudget(dt,performance.now()-workStart)
  }
  function draw(t){
    raf=requestAnimationFrame(draw);
    try{
      frame(t)
    }
    catch(error){
      if(!rafErrorLogged){
        rafErrorLogged=true;
        console.warn('[Psyco_Visão][LOOP] Uma exceção foi contida e registrada apenas uma vez.',error)
      }
    }
  }

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
    button.setAttribute('aria-label','Câmera: '+name.textContent.replace(/^[●○]\s*/,''));
    button.disabled=busy;
    switchButton.hidden=state!=='on'||cameraContext!=='mobile'||!flipAvailable();
    switchButton.disabled=busy;
    switchButton.setAttribute('aria-label',cameraFacingMode==='environment'?'Virar para a câmera da frente':'Virar para a câmera de trás');
    document.body.classList.toggle('dream-awake',state==='on');
    document.body.dataset.cam=state;
    if(state==='denied'||state==='error')hud.setError('camera');
    else if(state==='on'||state==='off')hud.clearError('camera');
    if(state==='off'||state==='denied'||state==='error')maybeStartLoop()
  }
  function readStoredCameraId(){
    try{
      return localStorage.getItem('psyco.cameraId')||''
    }
    catch(_){
      return ''
    }
  }
  function readStoredFacing(){
    try{
      const value=localStorage.getItem('psyco.facing');
      return value==='user'||value==='environment'?value:''
    }
    catch(_){
      return ''
    }
  }
  function persistCameraChoice(){
    try{
      if(cameraActiveId)localStorage.setItem('psyco.cameraId',cameraActiveId);
      if(cameraFacingMode==='user'||cameraFacingMode==='environment')localStorage.setItem('psyco.facing',cameraFacingMode)
    }
    catch(_){}
  }
  function flipAvailable(){
    return cameraContext==='mobile'&&!!cameraClassification&&cameraClassification.hasRear&&cameraClassification.hasFront
  }
  function activeCameraId(){
    const settings=stream?.getVideoTracks?.()[0]?.getSettings?.();
    return settings?.deviceId||cameraActiveId||''
  }
  function optionForEntry(entry,activeId){
    const option=document.createElement('option');
    option.value=entry.id;
    option.textContent=entry.label;
    if(entry.id===activeId)option.selected=true;
    return option
  }
  function populateCameraSelect(){
    const select=$('#cameraDevice');
    if(!select)return;
    select.textContent='';
    const entries=cameraClassification?.entries||[];
    if(!entries.length){
      const option=document.createElement('option');
      option.value='';
      option.textContent='Câmera padrão do aparelho';
      select.append(option);
      select.disabled=true;
      return
    }
    select.disabled=false;
    const activeId=activeCameraId()||cameraClassification.defaultId,
    groups=cameraClassification.groups;
    if(groups.length>1)groups.forEach(group=>{
      const items=cameraClassification.ordered.filter(entry=>entry.group===group.key);
      if(!items.length)return;
      const optgroup=document.createElement('optgroup');
      optgroup.label=group.title;
      items.forEach(entry=>optgroup.append(optionForEntry(entry,activeId)));
      select.append(optgroup)
    });
    else cameraClassification.ordered.forEach(entry=>select.append(optionForEntry(entry,activeId)));
    if(entries.some(entry=>entry.id===activeId))select.value=activeId
  }
  async function refreshCameraChoices(){
    if(!navigator.mediaDevices?.enumerateDevices||!navigator.mediaDevices?.getUserMedia){
      cameraClassification=null;
      populateCameraSelect();
      updateCameraState(cameraState);
      return
    }
    try{
      const devices=await navigator.mediaDevices.enumerateDevices(),
      liveId=activeCameraId();
      cameraClassification=classifyCameras(devices,cameraContext,{
        deviceId:liveId,facing:cameraFacingMode
      });
      const known=id=>cameraClassification.entries.some(entry=>entry.id===id);
      if(liveId)cameraActiveId=liveId;
      else if(!known(cameraActiveId))cameraActiveId=known(storedCameraId)?storedCameraId:cameraClassification.defaultId;
      populateCameraSelect();
      updateCameraState(cameraState)
    }
    catch(_){
      cameraClassification=null;
      populateCameraSelect();
      updateCameraState(cameraState)
    }
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
      startCamera({
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
  async function requestCameraStream(wanted){
    const attempts=[],
    seen=new Set(),
    addAttempt=options=>{
      const key=options.deviceId?'d:'+options.deviceId:'f:'+(options.facing||'environment');
      if(!seen.has(key)){
        seen.add(key);
        attempts.push(options)
      }
    };
    if(wanted.deviceId)addAttempt({
      deviceId:wanted.deviceId,facing:wanted.facing
    });
    if(wanted.facing)addAttempt({
      facing:wanted.facing
    });
    if(!cameraSwitching)addAttempt({
      facing:'environment'
    });
    let lastError=null;
    for(const options of attempts){
      try{
        const candidate=await navigator.mediaDevices.getUserMedia(getCameraConstraints(options)),
        settings=candidate.getVideoTracks()[0]?.getSettings?.()||{};
        if(cameraSwitching){
          const wrongDevice=options.deviceId&&settings.deviceId&&settings.deviceId!==options.deviceId,
          wrongFacing=!options.deviceId&&(settings.facingMode==='user'||settings.facingMode==='environment')&&settings.facingMode!==(options.facing||'environment');
          if(wrongDevice||wrongFacing){
            candidate.getTracks().forEach(item=>item.stop());
            throw Object.assign(new Error('requested-camera-unavailable'),{
              name:'OverconstrainedError'
            })
          }
        }
        return candidate
      }
      catch(error){
        lastError=error;
        if(['NotAllowedError','PermissionDeniedError','SecurityError'].includes(error?.name))throw error
      }
    }
    throw lastError||Object.assign(new Error('no-camera'),{
      name:'NotFoundError'
    })
  }
  async function startCamera({
    deviceId='',facing='',recovery=false,switching=false
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
    const wanted={
      deviceId:deviceId||(switching?'':storedCameraId||cameraActiveId||''),
      facing:facing||(switching?'environment':storedFacing||cameraFacingMode||'environment')
    };
    cameraBusy=true;
    if(switching)cameraSwitching=true;
    if(!recovery&&!switching)cameraRetryCount=0;
    updateCameraState(switching?'switching':recovery?'recovering':'loading');
    let nextStream=null;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera-unavailable');
      nextStream=await requestCameraStream(wanted);
      const settings=nextStream.getVideoTracks()[0]?.getSettings?.()||{},
      actualId=settings.deviceId||'',
      entry=actualId?cameraClassification?.entries.find(item=>item.id===actualId):null,
      actualFacing=settings.facingMode==='user'||settings.facingMode==='environment'?settings.facingMode:entry&&entry.group==='front'?'user':entry&&entry.group==='rear'?'environment':(wanted.deviceId?cameraFacingMode:wanted.facing);
      const previousStream=stream;
      video.srcObject=nextStream;
      await video.play();
      stream=nextStream;
      if(actualId)cameraActiveId=actualId;
      if(actualFacing==='user'||actualFacing==='environment')cameraFacingMode=actualFacing;
      started=true;
      cameraRetryCount=0;
      cameraBusy=false;
      cameraSwitching=false;
      attachCameraTrack(nextStream);
      if(previousStream&&previousStream!==nextStream)previousStream.getTracks().forEach(item=>item.stop());
      persistCameraChoice();
      updateCameraState('on');
      maybeStartLoop();
      refreshCameraChoices();
      if(!recovery&&!switching)notify('O olho está aberto. A imagem fica neste aparelho.');
      return true
    }
    catch(error){
      if(nextStream&&nextStream!==stream)nextStream.getTracks().forEach(item=>item.stop());
      cameraBusy=false;
      cameraSwitching=false;
      started=!!stream&&stream.getVideoTracks().some(item=>item.readyState==='live');
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
    if(cameraBusy||cameraSwitching||!started)return;
    if(cameraContext!=='mobile'||!flipAvailable())return;
    const previousId=cameraActiveId||activeCameraId(),
    previousFacing=cameraFacingMode,
    targetFacing=previousFacing==='environment'?'user':'environment',
    targetId=pickFlipTarget(cameraClassification,previousFacing);
    const switched=await startCamera({
      deviceId:targetId,facing:targetFacing,switching:true
    });
    if(switched){
      notify('A câmera mudou.');
      return
    }
    const returned=await startCamera({
      deviceId:previousId,facing:previousFacing,switching:true
    });
    if(returned)notify(targetFacing==='user'?'A câmera da frente não respondeu. Voltamos para a traseira.':'A troca não funcionou. Voltamos para a câmera anterior.');
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
    button.setAttribute('aria-label','Microfone: '+name.textContent.replace(/^[●○]\s*/,''));
    button.disabled=state==='loading';
    action.disabled=state==='loading';
    $('#micEnable').disabled=state==='loading';
    const label=action.querySelector('.quick-label');
    if(label)label.textContent=state==='on'?'SILENCIAR':'ESCUTAR';
    else action.textContent=state==='on'?'SILENCIAR':'ESCUTAR';
    action.classList.toggle('is-active',state==='on');
    document.body.dataset.mic=state;
    if(state==='error')hud.setError('mic');
    else hud.clearError('mic')
  }
  function handleMicInterruption(){
    if(!micStream)return;
    const failedStream=micStream;
    micStream=null;
    analyser=null;
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
  let presetCloseTimer=0,
  sheetClosedAt=0;
  const uiMemory=readStorageJSON('psyco_visao_ui',{});
  function openSheet(){
    clearTimeout(presetCloseTimer);
    hud.hold(true);
    hud.show();
    $('#panel').classList.add('show')
  }
  function closeSheet(){
    sheetClosedAt=performance.now();
    $('#panel').classList.remove('show');
    hud.hold(false)
  }
  function activateTab(name){
    document.querySelectorAll('#panel .tab').forEach(tab=>{
      const active=tab.dataset.tab===name;
      tab.classList.toggle('active',active);
      tab.setAttribute('aria-selected',String(active))
    });
    document.querySelectorAll('#panel .page').forEach(page=>page.classList.toggle('active',page.id===name))
  }
  document.querySelectorAll('#panel .tab').forEach(tab=>tab.addEventListener('click',()=>activateTab(tab.dataset.tab)));
  document.querySelectorAll('.hint-toggle').forEach(toggle=>toggle.addEventListener('click',()=>{
    const target=document.getElementById(toggle.dataset.hint);
    if(!target)return;
    target.hidden=!target.hidden;
    toggle.setAttribute('aria-expanded',String(!target.hidden))
  }));
  $('#close').onclick=closeSheet;
  document.addEventListener('pointerdown',e=>{
    if(!$('#panel').classList.contains('show'))return;
    if($('#shareDialog').open)return;
    if(e.target.closest('#panel')||e.target.closest('#settingsOpen'))return;
    closeSheet()
  },true);
  (function sheetDrag(){
    const grab=$('#panel').querySelector('.panel-grab');
    if(!grab)return;
    let dragId=-1,
    startY=0,
    dragging=false;
    grab.addEventListener('pointerdown',e=>{
      dragId=e.pointerId;
      startY=e.clientY;
      dragging=false;
      grab.setPointerCapture?.(e.pointerId)
    });
    grab.addEventListener('pointermove',e=>{
      if(e.pointerId!==dragId)return;
      const dy=e.clientY-startY;
      if(!dragging&&Math.abs(dy)<14)return;
      dragging=true;
      $('#panel').style.transition='none';
      $('#panel').style.transform='translateY('+Math.max(0,dy)+'px)'
    });
    const finish=e=>{
      if(e.pointerId!==dragId)return;
      dragId=-1;
      const dy=e.clientY-startY;
      $('#panel').style.transition='';
      $('#panel').style.transform='';
      if(dragging&&dy>90)closeSheet();
      dragging=false
    };
    grab.addEventListener('pointerup',finish);
    grab.addEventListener('pointercancel',finish)
  })();
  function toggleMic(){
    const mic=$('#micEnable');
    if(mic.disabled)return;
    mic.checked=!mic.checked;
    mic.dispatchEvent(new Event('change',{
      bubbles:true
    }));
    try{
      navigator.vibrate?.(30)
    }
    catch{}
  }
  function toggleFullscreen(){
    if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>notify('A tela cheia não está disponível neste aparelho.'));
    else document.exitFullscreen?.()
  }
  function cycleVideoLevel(){
    const order=['oculto','sutil','visivel'],
    next=order[(order.indexOf(activeVideoLevel)+1)%order.length];
    setVideoPresence(next);
    try{
      navigator.vibrate?.(20)
    }
    catch{}
  }
  function cycleMode(){
    const select=$('#mode'),
    order=['abstract','silhouette','both','outline'];
    select.value=order[(order.indexOf(select.value)+1)%order.length];
    select.dispatchEvent(new Event('change',{
      bubbles:true
    }));
    notify('Modo: '+(select.options[select.selectedIndex]?.textContent||select.value))
  }
  $('#settingsOpen').onclick=openSheet;
  $('#cameraStatus').onclick=()=>{
    if(!started)startCamera({})
  };
  $('#microphoneStatus').onclick=toggleMic;
  $('#listenToggle').onclick=()=>{
    if(hud.hidden){
      hud.show();
      return
    }
    toggleMic()
  };
  $('#shareOpen').onclick=()=>{
    const d=$('#shareDialog');
    if(d.showModal)d.showModal();
    else d.setAttribute('open','')
  };
  document.querySelectorAll('[data-close-share]').forEach(b=>b.onclick=()=>$('#shareDialog').close?.());
  $('#switchCamera').onclick=()=>switchCamera();
  $('#cameraDevice')?.addEventListener('change',e=>{
    const id=e.target.value;
    if(!id)return;
    if(!started){
      cameraActiveId=id;
      persistCameraChoice();
      return
    }
    if(id===activeCameraId()||cameraBusy)return;
    startCamera({
      deviceId:id,switching:true
    })
  });
  $('#fullscreen').onclick=toggleFullscreen;
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
    clearTimeout(presetCloseTimer);
    presetCloseTimer=setTimeout(closeSheet,600)
  }));
  const radial=$('#radialMenu'),
  radialScrim=$('#radialScrim');
  function openRadial(x,y){
    const size=132,
    left=Math.round(clamp(x-size/2,8,Math.max(8,innerWidth-size-8))),
    top=Math.round(clamp(y-size/2,8,Math.max(8,innerHeight-size-8)));
    radial.style.left=left+'px';
    radial.style.top=top+'px';
    radialScrim.hidden=false;
    radial.hidden=false;
    hud.hold(true);
    try{
      navigator.vibrate?.(24)
    }
    catch{}
  }
  function closeRadial(){
    if(radial.hidden)return;
    radial.hidden=true;
    radialScrim.hidden=true;
    hud.hold(false)
  }
  radialScrim.addEventListener('pointerdown',closeRadial);
  $('#radialListen').onclick=()=>{
    closeRadial();
    toggleMic()
  };
  $('#radialMode').onclick=()=>{
    closeRadial();
    cycleMode()
  };
  $('#radialSettings').onclick=()=>{
    closeRadial();
    openSheet()
  };
  $('#radialFullscreen').onclick=()=>{
    closeRadial();
    toggleFullscreen()
  };
  const tapState={
    id:-1,x:0,y:0,moved:false,long:false,timer:0,pending:0
  };
  let lastTapAt=0,
  lastTapX=0,
  lastTapY=0;
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'){
      hud.show();
      return
    }
    if(tapState.id!==-1)clearTimeout(tapState.timer);
    tapState.id=e.pointerId;
    tapState.x=e.clientX;
    tapState.y=e.clientY;
    tapState.moved=false;
    tapState.long=false;
    tapState.timer=setTimeout(()=>{
      tapState.long=true;
      openRadial(tapState.x,tapState.y)
    },HUD.longPressMs)
  });
  canvas.addEventListener('pointermove',e=>{
    if(e.pointerId!==tapState.id)return;
    if(Math.abs(e.clientX-tapState.x)>HUD.tapSlack||Math.abs(e.clientY-tapState.y)>HUD.tapSlack){
      tapState.moved=true;
      clearTimeout(tapState.timer)
    }
  });
  canvas.addEventListener('pointerup',e=>{
    if(e.pointerId!==tapState.id)return;
    clearTimeout(tapState.timer);
    const wasLong=tapState.long,
    moved=tapState.moved,
    now=performance.now();
    tapState.id=-1;
    if(wasLong||moved||now-sheetClosedAt<450)return;
    const isDouble=now-lastTapAt<=HUD.doubleTapMs&&Math.abs(e.clientX-lastTapX)<=48&&Math.abs(e.clientY-lastTapY)<=48;
    lastTapAt=now;
    lastTapX=e.clientX;
    lastTapY=e.clientY;
    if(isDouble){
      clearTimeout(tapState.pending);
      tapState.pending=0;
      lastTapAt=0;
      cycleVideoLevel();
      return
    }
    if(hud.hidden){
      hud.show();
      return
    }
    clearTimeout(tapState.pending);
    tapState.pending=setTimeout(()=>{
      tapState.pending=0;
      hud.toggle()
    },240)
  });
  canvas.addEventListener('pointercancel',e=>{
    if(e.pointerId!==tapState.id)return;
    clearTimeout(tapState.timer);
    tapState.id=-1
  });
  function dismissHint(){
    const hint=$('#centerhint');
    if(!hint||hint.hidden)return;
    hint.hidden=true;
    uiMemory.hintSeen=true;
    writeStorageJSON('psyco_visao_ui',uiMemory)
  }
  if(uiMemory.hintSeen)$('#centerhint').hidden=true;
  let motionWakeAttached=false,
  motionPermissionAsked=false;
  function attachMotionWake(){
    if(motionWakeAttached)return;
    motionWakeAttached=true;
    let lastMagnitude=0;
    window.addEventListener('devicemotion',e=>{
      const acc=e.accelerationIncludingGravity||e.acceleration;
      if(!acc)return;
      const magnitude=Math.sqrt((acc.x||0)*(acc.x||0)+(acc.y||0)*(acc.y||0)+(acc.z||0)*(acc.z||0)),
      delta=Math.abs(magnitude-lastMagnitude);
      lastMagnitude=magnitude;
      if(delta>3.5){
        hud.noteActivity();
        if(hud.hidden)hud.show()
      }
    })
  }
  function requestMotionPermission(){
    const DME=window.DeviceMotionEvent;
    if(!DME)return;
    if(typeof DME.requestPermission!=='function'){
      attachMotionWake();
      return
    }
    if(motionPermissionAsked)return;
    motionPermissionAsked=true;
    try{
      DME.requestPermission().then(state=>{
        if(state==='granted')attachMotionWake()
      }).catch(()=>{})
    }
    catch{}
  }
  window.addEventListener('pointerdown',()=>{
    dismissHint();
    hud.noteActivity();
    requestMotionPermission()
  },true);
  window.addEventListener('pointermove',e=>{
    if(e.pointerType==='mouse')hud.noteActivity()
  },{
    passive:true
  });
  window.addEventListener('keydown',e=>{
    hud.noteActivity();
    if(e.key==='h'||e.key==='H'||e.key==='Tab'){
      hud.show();
      return
    }
    if(e.key==='Escape'){
      if(!radial.hidden)closeRadial();
      else if($('#panel').classList.contains('show'))closeSheet()
    }
  });
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
    'Microfone: '+($('#micEnable').checked?'ativado':'desativado · envelope sintético'),
    'Toque: '+(('ontouchstart' in window||navigator.maxTouchPoints>0)?'disponível':'não detectado'),
    'Animação reduzida pelo sistema: '+(reducedMotionQuery?.matches?'ativado':'desativado'),
    'Análise do movimento: '+ANALYSIS_WIDTH+' × '+ANALYSIS_HEIGHT,
    'Campo do sonho: '+dreamField.width+' × '+dreamField.height,
    'Modo de imagem: '+($('#mode').options[$('#mode').selectedIndex]?.textContent||$('#mode').value),
    'Escala de render: '+dpr.toFixed(2)+' (adaptativa '+adaptiveScale.toFixed(2)+')',
    'Quadro médio: '+measuredFrameMs.toFixed(1)+' ms de trabalho',
    'Armazenamento local: '+storage,
    'Vídeo selecionado: '+activeVideoLevel.toUpperCase(),
    'Dica inicial: '+(uiMemory.hintSeen?'dispensada':'ainda visível')].join('\n');
    report.hidden=false
  }
  $('#diagnosticRun').onclick=()=>{
    openSheet();
    activateTab('system');
    refreshDeviceDiagnostics()
  };
  $('#diagnosticCamera').onclick=async()=>{
    if(!isSecureContext){
      refreshDeviceDiagnostics();
      return
    }
    if(!started)await startCamera({});
    refreshDeviceDiagnostics()
  };
  $('#wake').onchange=async e=>{
    if(e.target.checked&&navigator.wakeLock)try{
      await navigator.wakeLock.request('screen')
    }
    catch{}
  };
  $('#micEnable').onchange=async e=>{
    if(!e.target.checked){
      micStream?.getTracks().forEach(t=>t.stop());
      micStream=null;
      analyser=null;
      audioCtx?.close();
      audioCtx=null;
      audioState.fill(0);
      audioState[10]=.006;
      bandsSmooth.fill(0);
      bandsMax.fill(1e-6);
      updateMicState('off');
      notify('O sonho ficou em silêncio.');
      return
    }
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
      analyser.fftSize=512;
      analyser.smoothingTimeConstant=.7;
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
      bandsMax.fill(1e-6);
      bandsSmooth.fill(0);
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
      audioCtx?.close();
      audioCtx=null;
      console.warn('[Psyco_Visão][AUDIO] Falha na captura (o envelope sintético assume)',err);
      e.target.checked=false;
      updateMicState('error');
      notify(err.name==='NotAllowedError'?'Permita o microfone nas configurações do navegador. O sonho segue respirando sozinho.':err.name==='NotFoundError'?'Não encontramos um microfone neste aparelho. O sonho segue respirando sozinho.':err.name==='NotReadableError'?'O microfone pode estar sendo usado por outro aplicativo. Feche esse aplicativo e tente de novo.':'Não foi possível ligar o som. Confira a permissão do microfone e tente outra vez.')
    }
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
    let percent,word;
    if(analyser){
      percent=Math.min(1,Math.max(0,audioState[1]*5))*100;
      word=percent<5?'Silêncio':percent<20?'Sussurro':percent<40?'Fala baixa':percent<60?'Fala':percent<80?'Voz alta':'Grito'
    }
    else{
      percent=Math.min(1,envelope*1.4)*100;
      word='Respirando'
    }
    $('#soundWord').textContent=word;
    $('#soundRule').style.setProperty('--level',percent+'%');
    $('#soundWord').classList.toggle('low',percent<5);
    $('#soundWord').classList.toggle('strong',percent>=60)
  },120);
  updateCameraState('loading');
  updateMicState('off');
  refreshCameraChoices();
  video.addEventListener('loadeddata',maybeStartLoop);
  function armCameraGesture(message){
    if(cameraGestureArmed)return;
    cameraGestureArmed=true;
    updateCameraState('off',message||'Toque na tela para abrir o olho.');
    maybeStartLoop();
    const once=()=>{
      window.removeEventListener('pointerdown',once,true);
      window.removeEventListener('keydown',once,true);
      cameraGestureArmed=false;
      if(!started&&!cameraBusy&&cameraState!=='denied')startCamera({})
    };
    window.addEventListener('pointerdown',once,true);
    window.addEventListener('keydown',once,true)
  }
  if(isSecureContext&&navigator.mediaDevices?.getUserMedia){
    let cameraPolicySettled=false;
    const settleToGesture=()=>{
      if(cameraPolicySettled)return;
      cameraPolicySettled=true;
      armCameraGesture()
    };
    if(navigator.permissions?.query){
      const watchdog=setTimeout(settleToGesture,1200);
      navigator.permissions.query({
        name:'camera'
      }).then(permission=>{
        clearTimeout(watchdog);
        if(permission.state==='granted'){
          cameraPolicySettled=true;
          startCamera({});
          return
        }
        if(cameraPolicySettled)return;
        cameraPolicySettled=true;
        if(permission.state==='denied'){
          updateCameraState('denied','O acesso à câmera está bloqueado neste navegador.');
          maybeStartLoop()
        }
        else armCameraGesture()
      }).catch(()=>{
        clearTimeout(watchdog);
        settleToGesture()
      })
    }
    else armCameraGesture()
  }
  else{
    setTimeout(()=>updateCameraState('off','Para abrir o olho, use o endereço seguro do Vercel ou localhost.'),2600);
    notify('Para abrir o olho, use o endereço seguro do Vercel ou localhost.');
    maybeStartLoop()
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){
      maybeStopLoop();
      if(audioCtx?.state==='running')audioCtx.suspend().catch(()=>{});
      video.pause?.();
      clearTimeout(hiddenStopTimer);
      hiddenStopTimer=setTimeout(()=>{
        if(document.visibilityState!=='hidden'||!stream)return;
        const stale=stream;
        started=false;
        stream=null;
        video.srcObject=null;
        stale.getTracks().forEach(t=>t.stop());
        updateCameraState('off','A câmera volta quando a página reaparecer.')
      },2000);
      return
    }
    clearTimeout(hiddenStopTimer);
    if(audioCtx?.state==='suspended')audioCtx.resume().catch(()=>notify('A escuta precisa ser ligada de novo.'));
    maybeStartLoop();
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
    if(cameraState==='error'&&!started)startCamera({
      recovery:true
    })
  });
  navigator.mediaDevices?.addEventListener?.('devicechange',()=>{
    clearTimeout(deviceChangeTimer);
    deviceChangeTimer=setTimeout(()=>{
      deviceChangeTimer=0;
      refreshCameraChoices()
    },400)
  });
  if(navigator.permissions?.query){
    navigator.permissions.query({
      name:'camera'
    }).then(permission=>permission.addEventListener('change',()=>{
      if(permission.state==='granted'&&!started&&!cameraBusy){
        cameraRetryCount=0;
        startCamera({
          recovery:true
        })
      }
    })).catch(()=>{})
  }
})();

window.__psycoBoot={ok:true};
document.getElementById("bootGuard")?.setAttribute("hidden","");

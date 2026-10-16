import {
  clamp
}
from './utils.js';
const MAX_RINGS=14,
MAX_DOTS=34,
MAX_SMOKE=56,
RING_FADE=1.1,
ECHO_LEVELS={
  oculto:{
    mat:.5, diffuse:.7, core:1
  },
  sutil:{
    mat:.22, diffuse:.45, core:.85
  },
  visivel:{
    mat:.62, diffuse:1, core:1
  }
},
BAND_PARAMS={
  bass:{
    width:.018,speed:.66,gain:1.05,tone:.12
  },
  mid:{
    width:.011,speed:1,gain:1,tone:.45
  },
  treble:{
    width:.008,speed:1.3,gain:.85,tone:.8
  },
  echo:{
    width:.009,speed:.55,gain:.75,tone:.35
  }
};
function greenScale(value){
  return .72+.4*clamp(typeof value==='number'?value:.72,0,1)
}
function vividFactor(value){
  return .4+.85*clamp(typeof value==='number'?value:.72,0,1)
}
function createBuffer(width,height){
  if(typeof OffscreenCanvas==='function')try{
    const canvas=new OffscreenCanvas(width,height),
    probe=canvas.getContext('2d');
    probe.fillStyle='#fff';
    probe.fillRect(0,0,1,1);
    if(probe.getImageData(0,0,1,1).data[3]===255)return canvas
  }
  catch{}
  const canvas=document.createElement('canvas');
  canvas.width=width;
  canvas.height=height;
  return canvas
}
function makeGlowSprite(r,g,b,size=64){
  const canvas=createBuffer(size,size),
  ctx=canvas.getContext('2d'),
  half=size/2,
  gradient=ctx.createRadialGradient(half,half,0,half,half,half);
  gradient.addColorStop(0,'rgba('+r+','+g+','+b+',1)');
  gradient.addColorStop(.25,'rgba('+r+','+g+','+b+',.55)');
  gradient.addColorStop(.6,'rgba('+r+','+g+','+b+',.14)');
  gradient.addColorStop(1,'rgba('+r+','+g+','+b+',0)');
  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,size,size);
  return canvas
}
function hash2(ix,iy){
  let n=Math.imul(ix,374761393)+Math.imul(iy,668265263)|0;
  n=Math.imul(n^n>>>13,1274126177);
  return((n^n>>>16)>>>0)/4294967296
}
function vnoise(x,y){
  const ix=Math.floor(x),
  iy=Math.floor(y),
  fx=x-ix,
  fy=y-iy,
  u=fx*fx*(3-2*fx),
  v=fy*fy*(3-2*fy),
  a=hash2(ix,iy),
  b=hash2(ix+1,iy),
  c=hash2(ix,iy+1),
  d=hash2(ix+1,iy+1),
  top=a+(b-a)*u,
  bottom=c+(d-c)*u;
  return top+(bottom-top)*v
}
function buildRamp(stops){
  const steps=64,
  out=new Uint8Array(steps*3),
  segments=stops.length-1;
  for(let i=0;i<steps;i++){
    const position=i/(steps-1)*segments,
    index=Math.min(segments-1,Math.floor(position)),
    blend=position-index,
    from=stops[index],
    to=stops[index+1],
    offset=i*3;
    out[offset]=from[0]+(to[0]-from[0])*blend;
    out[offset+1]=from[1]+(to[1]-from[1])*blend;
    out[offset+2]=from[2]+(to[2]-from[2])*blend
  }
  return out
}
export function createDreamEngine(){
  const energyCanvas=createBuffer(4,4),
  accumA=createBuffer(4,4),
  accumB=createBuffer(4,4),
  maskCanvas=createBuffer(4,4),
  maskSource=createBuffer(4,4),
  blurCanvas=createBuffer(4,4),
  underCanvas=createBuffer(4,4),
  contourSource=createBuffer(4,4),
  lensCanvas=createBuffer(4,4),
  chromaA=createBuffer(4,4),
  chromaB=createBuffer(4,4),
  energyCtx=energyCanvas.getContext('2d'),
  accumACtx=accumA.getContext('2d'),
  accumBCtx=accumB.getContext('2d'),
  maskCtx=maskCanvas.getContext('2d'),
  maskSourceCtx=maskSource.getContext('2d'),
  blurCtx=blurCanvas.getContext('2d'),
  underCtx=underCanvas.getContext('2d'),
  contourCtx=contourSource.getContext('2d'),
  lensCtx=lensCanvas.getContext('2d'),
  chromaACtx=chromaA.getContext('2d'),
  chromaBCtx=chromaB.getContext('2d'),
  infraRamp=buildRamp([[196,44,26],[232,140,48],[255,236,205]]),
  glowWarm=makeGlowSprite(255,232,190),
  glowAmber=makeGlowSprite(216,166,88),
  glowSmoke=makeGlowSprite(174,212,184),
  glowSmokeWarm=makeGlowSprite(255,222,168),
  rings=[],
  ringPool=[],
  dots=[],
  dotPool=[],
  smoke=[],
  smokePool=[];
  let fieldWidth=0,
  fieldHeight=0,
  fieldDiagonal=0,
  blurWidth=0,
  blurHeight=0,
  emitterX=.5,
  emitterY=.97,
  maskSourceData=null,
  maskSourceWidth=0,
  maskSourceHeight=0,
  contourData=null,
  contourWidth=0,
  contourHeight=0,
  jitterRows=null,
  blockMean=null,
  blockCols=0,
  blockRows=0,
  speedSmooth=0,
  frontCanvas=accumA,
  frontCtx=accumACtx,
  backCanvas=accumB,
  backCtx=accumBCtx;
  function resize(width,height){
    fieldWidth=width;
    fieldHeight=height;
    fieldDiagonal=Math.sqrt(width*width+height*height);
    blurWidth=Math.max(24,width>>2);
    blurHeight=Math.max(18,height>>2);
    for(const canvas of[energyCanvas,accumA,accumB,maskCanvas,underCanvas,lensCanvas,chromaA,chromaB]){
      canvas.width=width;
      canvas.height=height
    }
    blurCanvas.width=blurWidth;
    blurCanvas.height=blurHeight;
    for(const context of[energyCtx,accumACtx,accumBCtx,maskCtx,underCtx,blurCtx,lensCtx,chromaACtx,chromaBCtx]){
      context.setTransform(1,0,0,1,0,0);
      context.imageSmoothingEnabled=true;
      context.imageSmoothingQuality='high'
    }
    frontCanvas=accumA;
    frontCtx=accumACtx;
    backCanvas=accumB;
    backCtx=accumBCtx;
    accumACtx.clearRect(0,0,width,height);
    accumBCtx.clearRect(0,0,width,height);
    rings.length=0;
    dots.length=0;
    smoke.length=0
  }
  function reset(){
    rings.length=0;
    dots.length=0;
    smoke.length=0;
    accumACtx.clearRect(0,0,fieldWidth,fieldHeight);
    accumBCtx.clearRect(0,0,fieldWidth,fieldHeight)
  }
  function spawnRing({
    x,y,power=.3,band='mid'
  }={}){
    if(rings.length>=MAX_RINGS)return;
    const ring=ringPool.pop()||{
    };
    ring.x=(x===undefined?emitterX:x)*fieldWidth;
    ring.y=(y===undefined?emitterY:y)*fieldHeight;
    ring.radius=Math.max(2,fieldHeight*.012);
    ring.power=clamp(power,0,1);
    ring.band=band;
    rings.push(ring)
  }
  function spawnDots(count,power,motion){
    for(let i=0;i<count&&dots.length<MAX_DOTS;i++){
      let px=.25+Math.random()*.5,
      py=.2+Math.random()*.6;
      if(motion){
        const edge=motion.edge;
        for(let attempt=0;attempt<6;attempt++){
          const index=(Math.random()*edge.length)|0;
          if(edge[index]>.42){
            px=(index%motion.width)/motion.width;
            py=((index/motion.width)|0)/motion.height;
            break
          }
        }
      }
      const dot=dotPool.pop()||{
      };
      dot.x=px*fieldWidth;
      dot.y=py*fieldHeight;
      dot.power=clamp(power*(.5+Math.random()*.5),0,1);
      dot.life=0;
      dot.ttl=.22+Math.random()*.28;
      dot.warm=Math.random()<.55;
      dots.push(dot)
    }
  }
  function spawnSmoke(env,mid,treble,wave,motion){
    if(env<.05)return;
    const rate=env*(.7+mid*1.2+treble*1.6)*(.5+wave*1.2);
    let count=Math.floor(rate);
    if(Math.random()<rate-count)count++;
    if(count>2)count=2;
    for(let i=0;i<count&&smoke.length<MAX_SMOKE;i++){
      let px=.3+Math.random()*.4,
      py=.6+Math.random()*.35;
      if(motion){
        const structure=motion.structure;
        for(let attempt=0;attempt<8;attempt++){
          const index=(Math.random()*structure.length)|0;
          if(structure[index]>.24){
            px=(index%motion.width)/motion.width;
            py=((index/motion.width)|0)/motion.height;
            break
          }
        }
      }
      const particle=smokePool.pop()||{
      };
      particle.x=px*fieldWidth;
      particle.y=py*fieldHeight;
      particle.vx=0;
      particle.vy=0;
      particle.life=0;
      particle.ttl=1.6+Math.random()*1.8;
      particle.size=9+Math.random()*14;
      particle.seed=Math.random()*40;
      particle.warm=Math.random()<.45;
      smoke.push(particle)
    }
  }
  function sampleEdgeAt(motion,x,y){
    if(!motion||!motion.width)return 0;
    const ax=clamp((x/fieldWidth*motion.width)|0,0,motion.width-1),
    ay=clamp((y/fieldHeight*motion.height)|0,0,motion.height-1);
    return motion.edge[ay*motion.width+ax]
  }
  function step(dt,{shader,rmsEnvelope=0,motion=null,live=null}={}){
    if(shader.emitter){
      emitterX=shader.emitter.x;
      emitterY=shader.emitter.y
    }
    const waveSwell=.75+.7*(live&&typeof live.wave==='number'?live.wave:.36),
    speedTarget=shader.speed*fieldHeight*.85*(.5+1.15*rmsEnvelope)*waveSwell;
    speedSmooth+=(speedTarget-speedSmooth)*.2;
    for(let i=rings.length-1;i>=0;i--){
      const ring=rings[i],
      band=BAND_PARAMS[ring.band]||BAND_PARAMS.mid;
      ring.radius+=dt*speedSmooth*band.speed;
      ring.power-=ring.power*dt*RING_FADE;
      if(motion&&ring.power>.22&&ring.radius>6&&shader.reflectionGain>0&&rings.length<MAX_RINGS&&Math.random()<dt*3*shader.reflectionGain){
        const angle=Math.random()*Math.PI*2,
        ex=ring.x+Math.cos(angle)*ring.radius,
        ey=ring.y+Math.sin(angle)*ring.radius;
        if(sampleEdgeAt(motion,ex,ey)>.5){
          const echo=ringPool.pop()||{
          };
          echo.x=ex;
          echo.y=ey;
          echo.radius=Math.max(2,fieldHeight*.012);
          echo.power=ring.power*.3;
          echo.band='echo';
          rings.push(echo)
        }
      }
      if(ring.power<.03||ring.radius>fieldDiagonal*1.08){
        rings.splice(i,1);
        ringPool.push(ring)
      }
    }
    for(let i=dots.length-1;i>=0;i--){
      const dot=dots[i];
      dot.life+=dt;
      if(dot.life>=dot.ttl){
        dots.splice(i,1);
        dotPool.push(dot)
      }
    }
  }
  function renderEchoEnergy(shader,motion,env,bands,live,level,edgeControl){
    const ectx=energyCtx,
    unit=fieldHeight/270,
    factors=ECHO_LEVELS[level]||ECHO_LEVELS.oculto,
    bass=bands?clamp(bands.bass,0,1):0,
    mid=bands?clamp(bands.mid,0,1):0,
    green=live&&typeof live.green==='number'?live.green:.72,
    wave=live&&typeof live.wave==='number'?live.wave:.36,
    greenTint=greenScale(green),
    vividV=vividFactor(live&&live.vivid),
    deformAmp=motion?shader.edgeDeform*(6+shader.edgeGain*8)*unit*(.6+1.1*wave):0,
    waveWidth=.64+wave,
    segments=44;
    ectx.setTransform(1,0,0,1,0,0);
    ectx.globalCompositeOperation='source-over';
    ectx.globalAlpha=1;
    ectx.clearRect(0,0,fieldWidth,fieldHeight);
    ectx.globalCompositeOperation='lighter';
    ectx.lineCap='round';
    ectx.lineJoin='round';
    if(motion){
      const diffuseAlpha=clamp(env*(.2+.8*bass)*shader.diffuseGain*factors.diffuse,0,.45);
      if(diffuseAlpha>.006){
        ectx.globalAlpha=diffuseAlpha;
        ectx.drawImage(blurCanvas,0,0,fieldWidth,fieldHeight);
        ectx.globalAlpha=1
      }
      const matAlpha=clamp(shader.fillAlpha*factors.mat*env*(.55+.45*mid)*(.45+.55*green)*vividV,0,.8);
      if(matAlpha>.006){
        ectx.globalAlpha=matAlpha;
        ectx.drawImage(maskCanvas,0,0,fieldWidth,fieldHeight);
        ectx.globalAlpha=1
      }
    }
    for(let i=0;i<rings.length;i++){
      const ring=rings[i],
      band=BAND_PARAMS[ring.band]||BAND_PARAMS.mid,
      width=Math.max(1.2,band.width*fieldHeight*shader.ringWidth*waveWidth),
      fade=clamp(1-ring.radius/(fieldDiagonal*1.02),0,1),
      shaped=Math.sqrt(fade),
      amp=ring.power*band.gain*shader.ringGain*shaped*(.6+.4*env);
      if(amp<.012)continue;
      const tone=clamp(band.tone+shader.warmMix*.35,0,1),
      core=shader.palette.core,
      warm=shader.palette.warm,
      coreTint=[core[0],Math.min(255,core[1]*greenTint),core[2]],
      warmTint=[warm[0],Math.min(255,warm[1]*greenTint),warm[2]],
      tintR=Math.round(coreTint[0]+(warmTint[0]-coreTint[0])*tone),
      tintG=Math.round(coreTint[1]+(warmTint[1]-coreTint[1])*tone),
      tintB=Math.round(coreTint[2]+(warmTint[2]-coreTint[2])*tone),
      colorBase=tintR+','+tintG+','+tintB;
      ectx.beginPath();
      for(let k=0;k<=segments;k++){
        const angle=k/segments*Math.PI*2,
        cos=Math.cos(angle),
        sin=Math.sin(angle),
        base=ring.radius;
        let radius=base;
        if(deformAmp>0){
          const edgeValue=sampleEdgeAt(motion,ring.x+cos*base,ring.y+sin*base);
          radius=base-deformAmp*(edgeValue-.28)
        }
        const px=ring.x+cos*radius,
        py=ring.y+sin*radius;
        if(k===0)ectx.moveTo(px,py);
        else ectx.lineTo(px,py)
      }
      ectx.closePath();
      ectx.strokeStyle='rgba('+colorBase+','+amp*.09+')';
      ectx.lineWidth=Math.max(2,width*2.6);
      ectx.stroke();
      ectx.strokeStyle='rgba('+colorBase+','+amp*.26+')';
      ectx.lineWidth=Math.max(1.2,width*1.2);
      ectx.stroke();
      ectx.strokeStyle='rgba('+colorBase+','+Math.min(1,amp*.85)+')';
      ectx.lineWidth=clamp(width*.5,.8,1.3);
      ectx.stroke()
    }
    if(motion){
      writeContourThin(motion,env,shader,bands,factors.core,typeof edgeControl==='number'?edgeControl:.5,live);
      ectx.globalAlpha=1;
      ectx.drawImage(contourSource,0,0,fieldWidth,fieldHeight)
    }
    for(let i=0;i<dots.length;i++){
      const dot=dots[i],
      life=1-dot.life/dot.ttl,
      alpha=clamp(dot.power*life*shader.dotGain*(.4+.6*env),0,1);
      if(alpha<.02)continue;
      const size=(2.5+6.5*dot.power)*unit*1.2,
      sprite=dot.warm||shader.warmMix>.4?glowWarm:glowAmber;
      ectx.globalAlpha=alpha*.9;
      ectx.drawImage(sprite,dot.x-size/2,dot.y-size/2,size,size)
    }
    ectx.globalAlpha=1;
    ectx.globalCompositeOperation='source-over'
  }
  function buildReveal(motion,level,edgeControl,shader,live){
    if(!maskSourceData||maskSourceWidth!==motion.width||maskSourceHeight!==motion.height){
      maskSource.width=motion.width;
      maskSource.height=motion.height;
      maskSourceData=maskSourceCtx.createImageData(motion.width,motion.height);
      maskSourceWidth=motion.width;
      maskSourceHeight=motion.height
    }
    const out=maskSourceData.data,
    edgeArray=motion.edge,
    structure=motion.structure,
    fill=shader.palette.fill,
    green=live&&typeof live.green==='number'?live.green:.72,
    fillTint=[fill[0],Math.min(255,Math.round(fill[1]*greenScale(green))),fill[2]],
    eC=typeof edgeControl==='number'?edgeControl:.5,
    threshold=clamp((level==='sutil'?.34:.16)+(eC-.5)*.12,.06,.62),
    span=1/(1-threshold),
    mult=(1.8+1.2*eC)*vividFactor(live&&live.vivid),
    edgeOnly=level==='sutil';
    for(let i=0,o=0;i<edgeArray.length;i++,o+=4){
      let value=edgeArray[i];
      if(!edgeOnly){
        const smoothed=structure[i];
        if(smoothed>value)value=smoothed
      }
      let reveal=(value-threshold)*span;
      if(reveal<=0){
        out[o+3]=0;
        continue
      }
      if(edgeOnly){
        if(reveal>1)reveal=1
      }
      else reveal=Math.min(1,reveal*mult);
      out[o]=fillTint[0];
      out[o+1]=fillTint[1];
      out[o+2]=fillTint[2];
      out[o+3]=reveal*255
    }
    maskSourceCtx.putImageData(maskSourceData,0,0);
    maskCtx.globalCompositeOperation='source-over';
    maskCtx.globalAlpha=1;
    maskCtx.clearRect(0,0,fieldWidth,fieldHeight);
    maskCtx.drawImage(maskSource,0,0,fieldWidth,fieldHeight);
    blurCtx.clearRect(0,0,blurWidth,blurHeight);
    blurCtx.drawImage(maskSource,0,0,blurWidth,blurHeight);
    return maskCanvas
  }
  function renderSilhouette(shader,env,bands,live){
    const ectx=energyCtx,
    bass=bands.bass*shader.bandBass,
    mid=bands.mid*shader.bandMid,
    treble=bands.treble*shader.bandTreble,
    green=live&&typeof live.green==='number'?live.green:.72,
    wave=live&&typeof live.wave==='number'?live.wave:.36;
    ectx.setTransform(1,0,0,1,0,0);
    ectx.globalCompositeOperation='source-over';
    ectx.globalAlpha=1;
    ectx.clearRect(0,0,fieldWidth,fieldHeight);
    ectx.globalCompositeOperation='lighter';
    const base=clamp(env*(.55+.45*Math.min(1,mid)),0,1),
    fillAlpha=clamp(shader.fillAlpha*(.4+.6*green)*base*(1+treble*.12)*vividFactor(live&&live.vivid),0,1);
    if(fillAlpha>.004){
      ectx.globalAlpha=fillAlpha;
      ectx.drawImage(maskCanvas,0,0,fieldWidth,fieldHeight)
    }
    const blotchAlpha=clamp(env*bass*.5*(.4+.7*wave)*vividFactor(live&&live.vivid),0,.5);
    if(blotchAlpha>.005){
      const blotchScale=1+.18*wave,
      blotchWidth=fieldWidth*blotchScale,
      blotchHeight=fieldHeight*blotchScale;
      ectx.globalAlpha=blotchAlpha;
      ectx.drawImage(blurCanvas,-(blotchWidth-fieldWidth)*.5,-(blotchHeight-fieldHeight)*.5,blotchWidth,blotchHeight)
    }
    ectx.globalAlpha=1;
    ectx.globalCompositeOperation='source-over'
  }
  function ensureContour(motion){
    if(!contourData||contourWidth!==motion.width||contourHeight!==motion.height){
      contourSource.width=motion.width;
      contourSource.height=motion.height;
      contourData=contourCtx.createImageData(motion.width,motion.height);
      contourWidth=motion.width;
      contourHeight=motion.height;
      jitterRows=new Float32Array(motion.height);
      blockCols=Math.ceil(motion.width/8);
      blockRows=Math.ceil(motion.height/8);
      blockMean=new Float32Array(blockCols*blockRows)
    }
  }
  function writeContourThin(motion,env,shader,bands,coreFactor=1,edgeControl=.5,live=null){
    ensureContour(motion);
    const out=contourData.data,
    edgeArray=motion.edge,
    core=shader.palette.core,
    warm=shader.palette.warm,
    greenTint=greenScale(live&&typeof live.green==='number'?live.green:.72),
    coreTint=[core[0],Math.min(255,core[1]*greenTint),core[2]],
    warmTint=[warm[0],Math.min(255,warm[1]*greenTint),warm[2]],
    eC=typeof edgeControl==='number'?edgeControl:.5,
    tremor=bands?1+.38*Math.min(1,bands.treble):1,
    threshold=clamp(.32+(eC-.5)*.14,.2,.46),
    span=1/(1-threshold),
    alphaScale=(1.2+.8*eC)*vividFactor(live&&live.vivid);
    for(let i=0,o=0;i<edgeArray.length;i++,o+=4){
      let value=(edgeArray[i]-threshold)*span;
      if(value<=0){
        out[o+3]=0;
        continue
      }
      if(value>1)value=1;
      const alpha=clamp(value*alphaScale*env*shader.contourAlpha*tremor*coreFactor,0,1);
      out[o]=coreTint[0]+(warmTint[0]-coreTint[0])*value;
      out[o+1]=coreTint[1]+(warmTint[1]-coreTint[1])*value;
      out[o+2]=coreTint[2]+(warmTint[2]-coreTint[2])*value;
      out[o+3]=alpha*255
    }
    contourCtx.putImageData(contourData,0,0)
  }
  function renderContourThin(shader,motion,env,live){
    const ectx=energyCtx;
    writeContourThin(motion,env,shader,null,1,.5,live);
    ectx.globalCompositeOperation='lighter';
    ectx.globalAlpha=1;
    ectx.drawImage(contourSource,0,0,fieldWidth,fieldHeight);
    ectx.globalCompositeOperation='source-over'
  }
  function writeContourInfrared(motion,env,bands,shader,live,t){
    ensureContour(motion);
    const width=motion.width,
    height=motion.height,
    edgeArray=motion.edge,
    out=contourData.data,
    green=live&&typeof live.green==='number'?live.green:.72,
    wave=live&&typeof live.wave==='number'?live.wave:.36,
    greenTint=greenScale(green),
    vividV=vividFactor(live&&live.vivid),
    jitterAmp=shader.jitter*(.35+.85*Math.min(1,bands.treble*shader.bandTreble))*(.4+.6*live.glitch),
    jitterOn=jitterAmp>.05;
    if(jitterOn){
      for(let y=0;y<height;y++)jitterRows[y]=Math.round((Math.sin(t*.006+y*(.3+.9*wave))+Math.sin(t*.0133+y*(.9+2.4*wave))*.6)*jitterAmp*.5)
    }
    blockMean.fill(0);
    for(let y=0;y<height;y++){
      const row=y*width,
      blockY=(y/8)|0,
      blockRow=blockY*blockCols;
      for(let x=0;x<width;x++)blockMean[blockRow+((x/8)|0)]+=edgeArray[row+x]
    }
    const blockArea=64;
    for(let b=0;b<blockMean.length;b++)blockMean[b]/=blockArea;
    const midGain=.55+.45*Math.min(1,bands.mid*shader.bandMid);
    for(let y=0;y<height;y++){
      const row=y*width,
      blockRow=((y/8)|0)*blockCols,
      jitter=jitterOn?jitterRows[y]:0;
      for(let x=0;x<width;x++){
        const sampleX=clamp(x-jitter,0,width-1),
        i=row+sampleX,
        threshold=blockMean[blockRow+((x/8)|0)]*2.05,
        limit=threshold<.12?.12:threshold,
        value=(edgeArray[i]-limit)/(1-limit);
        const o=(row+x)*4;
        if(value<=0){
          out[o+3]=0;
          continue
        }
        const alpha=clamp(value*(.7+1.6*value)*env*midGain*vividV,0,1),
        intensity=clamp(value*1.5*(.6+.6*Math.min(1,bands.treble*shader.bandTreble)),0,1),
        rampIndex=(intensity*63)|0,
        rampOffset=rampIndex*3,
        tail=clamp((green-.2)*.5*(1-intensity),0,1),
        tailG=Math.min(255,180*greenTint);
        out[o]=infraRamp[rampOffset]+(64-infraRamp[rampOffset])*tail;
        out[o+1]=infraRamp[rampOffset+1]+(tailG-infraRamp[rampOffset+1])*tail;
        out[o+2]=infraRamp[rampOffset+2]+(110-infraRamp[rampOffset+2])*tail;
        out[o+3]=alpha*255
      }
    }
    contourCtx.putImageData(contourData,0,0)
  }
  function renderInfrared(shader,motion,env,bands,live,t){
    const ectx=energyCtx;
    ectx.setTransform(1,0,0,1,0,0);
    ectx.globalCompositeOperation='source-over';
    ectx.globalAlpha=1;
    ectx.clearRect(0,0,fieldWidth,fieldHeight);
    writeContourInfrared(motion,env,bands,shader,live,t);
    ectx.globalCompositeOperation='lighter';
    ectx.drawImage(contourSource,0,0,fieldWidth,fieldHeight);
    ectx.globalCompositeOperation='source-over'
  }
  function updateAndDrawSmoke(shader,motion,env,bands,live,dt,t){
    const ectx=energyCtx,
    unit=fieldHeight/270,
    treble=Math.min(1,bands.treble*shader.bandTreble);
    ectx.globalCompositeOperation='lighter';
    for(let i=smoke.length-1;i>=0;i--){
      const particle=smoke[i];
      particle.life+=dt;
      if(particle.life>=particle.ttl){
        smoke.splice(i,1);
        smokePool.push(particle);
        continue
      }
      const noise=vnoise(particle.x*.012+particle.seed,particle.y*.012-t*.00012),
      targetVx=(noise-.5)*30*unit*(1+treble*1.6),
      targetVy=-(10+24*(.4+treble))*unit*.9;
      particle.vx+=(targetVx-particle.vx)*.2;
      particle.vy+=(targetVy-particle.vy)*.2;
      particle.x+=particle.vx*dt;
      particle.y+=particle.vy*dt;
      if(particle.x<0)particle.x=0;
      else if(particle.x>fieldWidth)particle.x=fieldWidth;
      const progress=particle.life/particle.ttl,
      fade=Math.sin(Math.PI*progress),
      alpha=clamp(fade*fade*.26*(.3+.7*env)*shader.smoke,0,1);
      if(alpha<.012)continue;
      const size=particle.size*unit*(1+progress*.9),
      sprite=particle.warm||shader.warmMix>.35?glowSmokeWarm:glowSmoke;
      ectx.globalAlpha=alpha;
      ectx.drawImage(sprite,particle.x-size/2,particle.y-size/2,size,size)
    }
    ectx.globalAlpha=1;
    ectx.globalCompositeOperation='source-over'
  }
  function renderUnderlay(source,shader,level){
    const sourceWidth=source.videoWidth,
    sourceHeight=source.videoHeight;
    if(!sourceWidth||!sourceHeight)return false;
    underCtx.globalCompositeOperation='source-over';
    underCtx.globalAlpha=1;
    underCtx.clearRect(0,0,fieldWidth,fieldHeight);
    const scale=Math.max(fieldWidth/sourceWidth,fieldHeight/sourceHeight)||1,
    drawWidth=sourceWidth*scale,
    drawHeight=sourceHeight*scale,
    tint=shader.videoTint;
    underCtx.filter='grayscale(1)';
    underCtx.drawImage(source,(fieldWidth-drawWidth)/2,(fieldHeight-drawHeight)/2,drawWidth,drawHeight);
    underCtx.filter='none';
    underCtx.globalCompositeOperation='multiply';
    underCtx.fillStyle='rgb('+tint[0]+','+tint[1]+','+tint[2]+')';
    underCtx.fillRect(0,0,fieldWidth,fieldHeight);
    underCtx.globalCompositeOperation='lighter';
    underCtx.globalAlpha=level==='visivel'?.14:.08;
    const veil=shader.palette.veil;
    underCtx.fillStyle='rgb('+veil[0]+','+veil[1]+','+veil[2]+')';
    underCtx.fillRect(0,0,fieldWidth,fieldHeight);
    underCtx.globalAlpha=1;
    underCtx.globalCompositeOperation='destination-in';
    underCtx.drawImage(maskCanvas,0,0);
    underCtx.globalCompositeOperation='source-over';
    return true
  }
  function accumulate(decay,additive){
    backCtx.globalCompositeOperation='source-over';
    backCtx.globalAlpha=1;
    backCtx.clearRect(0,0,fieldWidth,fieldHeight);
    backCtx.globalAlpha=decay;
    backCtx.drawImage(frontCanvas,0,0);
    backCtx.globalAlpha=1;
    backCtx.globalCompositeOperation=additive?'lighter':'source-over';
    backCtx.drawImage(energyCanvas,0,0);
    backCtx.globalCompositeOperation='source-over';
    const swapCanvas=frontCanvas;
    frontCanvas=backCanvas;
    backCanvas=swapCanvas;
    const swapCtx=frontCtx;
    frontCtx=backCtx;
    backCtx=swapCtx
  }
  function warpField(amount){
    const strength=.62*clamp(amount,0,1),
    strips=Math.max(24,Math.ceil(fieldHeight/4)),
    stripH=fieldHeight/strips,
    cy=fieldHeight*.5;
    lensCtx.globalCompositeOperation='source-over';
    lensCtx.globalAlpha=1;
    lensCtx.clearRect(0,0,fieldWidth,fieldHeight);
    let y=0;
    for(let i=0;i<strips;i++,y+=stripH){
      const v=(y+stripH*.5-cy)/(fieldHeight*.5),
      mag=1+strength*(1-v*v),
      dw=fieldWidth*mag,
      sy=Math.max(0,Math.min(fieldHeight-stripH,cy+(y-cy)/mag)),
      sh=Math.min(fieldHeight-sy,stripH/mag);
      lensCtx.drawImage(frontCanvas,0,sy,fieldWidth,sh,(fieldWidth-dw)*.5,y,dw,stripH)
    }
  }
  function paintChroma(ctx,source,color){
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=1;
    ctx.clearRect(0,0,fieldWidth,fieldHeight);
    ctx.drawImage(source,0,0);
    ctx.globalCompositeOperation='source-in';
    ctx.fillStyle=color;
    ctx.fillRect(0,0,fieldWidth,fieldHeight);
    ctx.globalCompositeOperation='source-over'
  }
  function tear(amount,treble){
    const glitchValue=clamp(amount,0,1);
    if(glitchValue<.05)return;
    if(Math.random()>=glitchValue*(.15+.45*clamp(treble,0,1)))return;
    const unit=fieldHeight/270,
    count=1+(Math.random()<glitchValue*.7?1:0);
    frontCtx.globalCompositeOperation='source-over';
    frontCtx.globalAlpha=1;
    for(let i=0;i<count;i++){
      const h=Math.max(1,fieldHeight*(.004+Math.random()*.016)),
      y=Math.random()*(fieldHeight-h),
      dx=(Math.random()<.5?-1:1)*(2+16*glitchValue)*unit;
      frontCtx.drawImage(frontCanvas,0,y,fieldWidth,h,dx,y,fieldWidth,h)
    }
  }
  function compose(displayCtx,{
    width,height,underlayReady,videoAlpha,breathColor,blindSpot,emitterScreenX,emitterScreenY,fish=0,glitch=0,treble=0
  }){
    displayCtx.globalCompositeOperation='source-over';
    displayCtx.globalAlpha=1;
    displayCtx.fillStyle=breathColor;
    displayCtx.fillRect(0,0,width,height);
    if(underlayReady&&videoAlpha>0){
      displayCtx.globalAlpha=clamp(videoAlpha,0,1);
      displayCtx.drawImage(underCanvas,0,0,width,height);
      displayCtx.globalAlpha=1
    }
    let source=frontCanvas;
    if(fish>.004){
      warpField(fish);
      source=lensCanvas
    }
    displayCtx.globalCompositeOperation='lighter';
    displayCtx.drawImage(source,0,0,width,height);
    const glitchValue=clamp(glitch,0,1),
    split=glitchValue*(1.2+5*clamp(treble,0,1))*(height/270);
    if(split>.4){
      const offX=Math.max(1,Math.round(split));
      paintChroma(chromaACtx,source,'rgb(255,46,32)');
      paintChroma(chromaBCtx,source,'rgb(40,214,255)');
      displayCtx.globalAlpha=clamp(glitchValue*1.4,0,.6);
      displayCtx.drawImage(chromaA,-offX,0,width,height);
      displayCtx.drawImage(chromaB,offX,0,width,height);
      displayCtx.globalAlpha=1
    }
    displayCtx.globalCompositeOperation='source-over';
    if(blindSpot>0){
      const gradient=displayCtx.createRadialGradient(emitterScreenX,emitterScreenY,0,emitterScreenX,emitterScreenY,blindSpot);
      gradient.addColorStop(0,'rgba(0,0,0,1)');
      gradient.addColorStop(.62,'rgba(0,0,0,.92)');
      gradient.addColorStop(1,'rgba(0,0,0,0)');
      displayCtx.globalCompositeOperation='destination-out';
      displayCtx.fillStyle=gradient;
      displayCtx.fillRect(emitterScreenX-blindSpot,emitterScreenY-blindSpot,blindSpot*2,blindSpot*2);
      displayCtx.globalCompositeOperation='source-over'
    }
  }
  return{
    resize,
    reset,
    spawnRing,
    spawnDots,
    spawnSmoke,
    step,
    renderEchoEnergy,
    buildReveal,
    renderSilhouette,
    renderContourThin,
    renderInfrared,
    updateAndDrawSmoke,
    renderUnderlay,
    accumulate,
    tear,
    compose,
    get width(){
      return fieldWidth
    },
    get height(){
      return fieldHeight
    }
  }
}

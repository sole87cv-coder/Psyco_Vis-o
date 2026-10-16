import {
  clamp
}
from './utils.js';
const MAX_RINGS=12,
MAX_DOTS=28,
RING_FADE=.95,
BAND_PARAMS={
  bass:{
    width:.017,speed:.72,gain:1.1,amber:.25
  },
  mid:{
    width:.011,speed:1,gain:1,amber:.55
  },
  treble:{
    width:.008,speed:1.35,gain:.85,amber:1
  },
  echo:{
    width:.0085,speed:.55,gain:.7,amber:.4
  }
};
function createBuffer(width,height) {
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
export function createSonarEngine() {
  const energyCanvas=createBuffer(4,4),
  accumA=createBuffer(4,4),
  accumB=createBuffer(4,4),
  maskCanvas=createBuffer(4,4),
  underCanvas=createBuffer(4,4),
  maskSource=createBuffer(4,4),
  energyCtx=energyCanvas.getContext('2d'),
  accumACtx=accumA.getContext('2d'),
  accumBCtx=accumB.getContext('2d'),
  maskCtx=maskCanvas.getContext('2d'),
  underCtx=underCanvas.getContext('2d'),
  maskSourceCtx=maskSource.getContext('2d'),
  rings=[],
  ringPool=[],
  dots=[],
  dotPool=[],
  emitter={
    x:.5,y:.97
  };
  let fieldWidth=0,
  fieldHeight=0,
  fieldDiagonal=0,
  energyData=null,
  maskSourceData=null,
  maskSourceWidth=0,
  maskSourceHeight=0,
  frontCanvas=accumA,
  frontCtx=accumACtx,
  backCanvas=accumB,
  backCtx=accumBCtx;
  function resize(width,height) {
    fieldWidth=width;
    fieldHeight=height;
    fieldDiagonal=Math.sqrt(width*width+height*height);
    for(const canvas of[energyCanvas,
    accumA,
    accumB,
    maskCanvas,
    underCanvas]){
      canvas.width=width;
      canvas.height=height
    }
    for(const context of[energyCtx,
    accumACtx,
    accumBCtx,
    maskCtx,
    underCtx]){
      context.setTransform(1,0,0,1,0,0);
      context.imageSmoothingEnabled=true;
      context.imageSmoothingQuality='high'
    }
    energyData=new ImageData(width,height);
    frontCanvas=accumA;
    frontCtx=accumACtx;
    backCanvas=accumB;
    backCtx=accumBCtx;
    accumACtx.clearRect(0,0,width,height);
    accumBCtx.clearRect(0,0,width,height);
    rings.length=0;
    dots.length=0
  }
  function reset() {
    rings.length=0;
    dots.length=0;
    accumACtx.clearRect(0,0,fieldWidth,fieldHeight);
    accumBCtx.clearRect(0,0,fieldWidth,fieldHeight)
  }
  function spawnRing({
    x=emitter.x,y=emitter.y,power=.3,band='mid'
  }
  ={}) {
    if(rings.length>=MAX_RINGS)return;
    const ring=ringPool.pop()||{
    };
    ring.x=x*fieldWidth;
    ring.y=y*fieldHeight;
    ring.radius=Math.max(2,fieldHeight*.012);
    ring.power=clamp(power,0,1);
    ring.band=band;
    rings.push(ring)
  }
  function spawnTreble(count,power,pickPoint,amberMix=0) {
    for(let i=0;i<count&&dots.length<MAX_DOTS;i++){
      const point=pickPoint?pickPoint():{
        x:Math.random(),y:Math.random()*.8
      },
      dot=dotPool.pop()||{
      };
      dot.x=point.x*fieldWidth;
      dot.y=point.y*fieldHeight;
      dot.power=clamp(power*(.5+Math.random()*.5),0,1);
      dot.life=0;
      dot.ttl=.22+Math.random()*.28;
      dot.amberMix=amberMix;
      dots.push(dot)
    }
  }
  function sampleEdge(motion,x,y) {
    const ax=clamp(((x/fieldWidth)*motion.width)|0,0,motion.width-1),
    ay=clamp(((y/fieldHeight)*motion.height)|0,0,motion.height-1);
    return motion.edge[ay*motion.width+ax]
  }
  function step(dt,{
    shader,rmsEnvelope=0,motion=null
  }
  ={
  }) {
    const speedPixels=shader.speed*fieldHeight*.85*(.55+1.1*rmsEnvelope);
    for(let i=rings.length-1;i>=0;i--){
      const ring=rings[i],
      band=BAND_PARAMS[ring.band]||BAND_PARAMS.mid;
      ring.radius+=dt*speedPixels*band.speed;
      ring.power-=ring.power*dt*RING_FADE;
      if(motion&&ring.power>.22&&ring.radius>6&&shader.reflectionGain>0&&rings.length<MAX_RINGS&&Math.random()<dt*3*shader.reflectionGain){
        const angle=Math.random()*Math.PI*2,
        ex=ring.x+Math.cos(angle)*ring.radius,
        ey=ring.y+Math.sin(angle)*ring.radius;
        if(sampleEdge(motion,ex,ey)>.5)spawnRing({
          x:ex/fieldWidth,y:ey/fieldHeight,power:ring.power*.3,band:'echo'
        })
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
  function renderEnergy(shader,motion) {
    const data=energyData.data;
    data.fill(0);
    const scaleX=motion.width/fieldWidth,
    scaleY=motion.height/fieldHeight,
    unit=fieldHeight/270,
    deformAmp=shader.edgeDeform*14*unit;
    for(let i=0;i<rings.length;i++){
      const ring=rings[i],
      band=BAND_PARAMS[ring.band]||BAND_PARAMS.mid,
      radius=ring.radius,
      width=Math.max(1.1,band.width*fieldHeight*shader.ringWidth),
      fade=clamp(1-radius/(fieldDiagonal*1.02),0,1),
      shaped=fade>0?Math.sqrt(fade):0,
      amp=ring.power*band.gain*shader.ringGain*.6*255*shaped;
      if(amp<2.5)continue;
      const amber=clamp(band.amber*shader.amberMix+(ring.band==='treble'?.35:0),0,1),
      cr=168+(216-168)*amber,
      cg=224+(168-224)*amber,
      cb=184+(80-184)*amber,
      cx=ring.x,
      cy=ring.y,
      outer=radius+width,
      inner=radius-width,
      y0=Math.max(0,Math.floor(cy-outer)),
      y1=Math.min(fieldHeight-1,Math.ceil(cy+outer));
      for(let y=y0;y<=y1;y++){
        const dy=y-cy,
        dy2=dy*dy,
        outerSpan=outer*outer-dy2;
        if(outerSpan<=0)continue;
        const halfOut=Math.sqrt(outerSpan),
        innerSpan=inner>.5?inner*inner-dy2:-1,
        halfIn=innerSpan>0?Math.sqrt(innerSpan):0,
        edgeRow=motion.width*((y*scaleY)|0),
        rowOffset=y*fieldWidth;
        for(let pass=0;pass<2;pass++){
          const xa=Math.max(0,Math.ceil(pass===0?cx+halfIn:cx-halfOut)),
          xb=Math.min(fieldWidth-1,Math.floor(pass===0?cx+halfOut:cx-halfIn));
          for(let x=xa;x<=xb;x++){
            const dx=x-cx,
            distance=Math.sqrt(dx*dx+dy2),
            edgeValue=motion.edge[edgeRow+((x*scaleX)|0)],
            localRadius=radius-deformAmp*(edgeValue-.28),
            offset=distance-localRadius,
            gap=offset<0?-offset:offset;
            if(gap>=width)continue;
            let falloff=1-gap/width;
            falloff*=falloff;
            let alpha=falloff*amp*(.68+edgeValue*shader.edgeGain*1.5);
            if(alpha<=0)continue;
            const o=(rowOffset+x)*4,
            previous=data[o+3];
            if(previous>=255)continue;
            if(previous+alpha>255)alpha=255-previous;
            const newTotal=previous+alpha,
            previousWeight=previous/newTotal,
            newWeight=alpha/newTotal;
            data[o]=data[o]*previousWeight+cr*newWeight;
            data[o+1]=data[o+1]*previousWeight+cg*newWeight;
            data[o+2]=data[o+2]*previousWeight+cb*newWeight;
            data[o+3]=newTotal
          }
        }
      }
    }
    for(let i=0;i<dots.length;i++){
      const dot=dots[i],
      power=dot.power*(1-dot.life/dot.ttl),
      radius=(1.4+3.2*dot.power)*unit,
      amp=power*shader.dotGain*.5*255;
      if(amp<2)continue;
      const amber=clamp(.45+dot.amberMix,0,1),
      cr=168+(216-168)*amber,
      cg=224+(168-224)*amber,
      cb=184+(80-184)*amber,
      y0=Math.max(0,Math.floor(dot.y-radius)),
      y1=Math.min(fieldHeight-1,Math.ceil(dot.y+radius)),
      x0=Math.max(0,Math.floor(dot.x-radius)),
      x1=Math.min(fieldWidth-1,Math.ceil(dot.x+radius));
      for(let y=y0;y<=y1;y++){
        const dy=y-dot.y,
        dy2=dy*dy,
        rowOffset=y*fieldWidth;
        for(let x=x0;x<=x1;x++){
          const dx=x-dot.x,
          distance=Math.sqrt(dx*dx+dy2);
          if(distance>=radius)continue;
          let alpha=(1-distance/radius)*amp;
          const o=(rowOffset+x)*4,
          previous=data[o+3];
          if(previous>=255)continue;
          if(previous+alpha>255)alpha=255-previous;
          const newTotal=previous+alpha,
          previousWeight=previous/newTotal,
          newWeight=alpha/newTotal;
          data[o]=data[o]*previousWeight+cr*newWeight;
          data[o+1]=data[o+1]*previousWeight+cg*newWeight;
          data[o+2]=data[o+2]*previousWeight+cb*newWeight;
          data[o+3]=newTotal
        }
      }
    }
    energyCtx.putImageData(energyData,0,0);
    return energyData
  }
  function buildMask(motion,level,edgeControl) {
    if(!maskSourceData||maskSourceWidth!==motion.width||maskSourceHeight!==motion.height){
      maskSource.width=motion.width;
      maskSource.height=motion.height;
      maskSourceData=maskSourceCtx.createImageData(motion.width,motion.height);
      maskSourceWidth=motion.width;
      maskSourceHeight=motion.height
    }
    const out=maskSourceData.data,
    motionArray=motion.motion,
    edgeArray=motion.edge,
    threshold=level==='sutil'?.3:.08,
    span=1/(1-threshold),
    motionGain=level==='sutil'?.55:.95,
    alphaGain=clamp(.5+edgeControl*.8,0,1.15);
    for(let i=0,o=0;i<edgeArray.length;i++,o+=4){
      let value=edgeArray[i];
      const movement=motionArray[i]*motionGain;
      if(movement>value)value=movement;
      value=(value-threshold)*span;
      out[o]=96;
      out[o+1]=224;
      out[o+2]=164;
      out[o+3]=Math.min(255,clamp(value,0,1)*255*alphaGain)
    }
    maskSourceCtx.putImageData(maskSourceData,0,0);
    maskCtx.globalCompositeOperation='source-over';
    maskCtx.globalAlpha=1;
    maskCtx.clearRect(0,0,fieldWidth,fieldHeight);
    maskCtx.drawImage(maskSource,0,0,fieldWidth,fieldHeight);
    if(level==='visivel'){
      maskCtx.globalCompositeOperation='lighter';
      maskCtx.globalAlpha=.55;
      maskCtx.drawImage(maskSource,1.5,1.5,fieldWidth,fieldHeight);
      maskCtx.globalCompositeOperation='source-over';
      maskCtx.globalAlpha=1
    }
    return maskCanvas
  }
  function renderUnderlay(source) {
    const sourceWidth=source.videoWidth,
    sourceHeight=source.videoHeight;
    if(!sourceWidth||!sourceHeight)return false;
    underCtx.globalCompositeOperation='source-over';
    underCtx.globalAlpha=1;
    underCtx.clearRect(0,0,fieldWidth,fieldHeight);
    const scale=Math.max(fieldWidth/sourceWidth,fieldHeight/sourceHeight)||1,
    drawWidth=sourceWidth*scale,
    drawHeight=sourceHeight*scale;
    underCtx.drawImage(source,(fieldWidth-drawWidth)/2,(fieldHeight-drawHeight)/2,drawWidth,drawHeight);
    underCtx.globalCompositeOperation='multiply';
    underCtx.fillStyle='rgb(158,232,182)';
    underCtx.fillRect(0,0,fieldWidth,fieldHeight);
    underCtx.globalCompositeOperation='destination-in';
    underCtx.drawImage(maskCanvas,0,0);
    underCtx.globalCompositeOperation='source-over';
    return true
  }
  function accumulate(decay) {
    backCtx.globalCompositeOperation='source-over';
    backCtx.globalAlpha=1;
    backCtx.clearRect(0,0,fieldWidth,fieldHeight);
    backCtx.globalAlpha=decay;
    backCtx.drawImage(frontCanvas,0,0);
    backCtx.globalAlpha=1;
    backCtx.globalCompositeOperation='lighter';
    backCtx.drawImage(energyCanvas,0,0);
    backCtx.globalCompositeOperation='source-over';
    const swapCanvas=frontCanvas;
    frontCanvas=backCanvas;
    backCanvas=swapCanvas;
    const swapCtx=frontCtx;
    frontCtx=backCtx;
    backCtx=swapCtx
  }
  function compose(displayCtx,{
    width,height,videoLevel,videoGain,vivid,breath,blindSpot
  }) {
    displayCtx.globalCompositeOperation='source-over';
    displayCtx.globalAlpha=1;
    if(videoLevel>0&&videoGain>0){
      displayCtx.globalAlpha=clamp(videoLevel*videoGain*(.35+vivid*.65),0,.6);
      displayCtx.drawImage(underCanvas,0,0,width,height)
    }
    displayCtx.globalCompositeOperation='lighter';
    displayCtx.globalAlpha=clamp(breath,0,1);
    displayCtx.drawImage(frontCanvas,0,0,width,height);
    displayCtx.globalCompositeOperation='source-over';
    displayCtx.globalAlpha=1;
    const bx=width*emitter.x,
    by=height*emitter.y,
    radius=blindSpot,
    gradient=displayCtx.createRadialGradient(bx,by,0,bx,by,radius);
    gradient.addColorStop(0,'rgba(0,0,0,1)');
    gradient.addColorStop(.62,'rgba(0,0,0,.92)');
    gradient.addColorStop(1,'rgba(0,0,0,0)');
    displayCtx.globalCompositeOperation='destination-out';
    displayCtx.fillStyle=gradient;
    displayCtx.fillRect(bx-radius,by-radius,radius*2,radius*2);
    displayCtx.globalCompositeOperation='source-over'
  }
  return{
    resize,
    reset,
    spawnRing,
    spawnTreble,
    step,
    renderEnergy,
    buildMask,
    renderUnderlay,
    accumulate,
    compose,
    get width(){
      return fieldWidth
    },
    get height(){
      return fieldHeight
    }
  }
}

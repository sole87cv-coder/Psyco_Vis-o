import {
  clamp
}
from './utils.js';
export function createMotionState(width,height) {
  return{
    width,
    height,
    luma:new Float32Array(width*height),
    previous:new Float32Array(width*height),
    motion:new Float32Array(width*height),
    edge:new Float32Array(width*height),
    structure:new Float32Array(width*height),
    hasPrevious:false,
    activity:0,
    edgeRatio:1,
    box:null
  }
}
export function resetMotionState(state) {
  state.previous.fill(0);
  state.motion.fill(0);
  state.edge.fill(0);
  state.structure.fill(0);
  state.hasPrevious=false;
  state.activity=0;
  state.edgeRatio=1;
  state.box=null
}
export function analyzeMotionFrame(source,state,edgeControl=.58,collectBounds=true) {
  const width=state.width,
  height=state.height,
  luma=state.luma,
  previous=state.previous,
  motion=state.motion,
  edge=state.edge,
  structure=state.structure,
  count=width*height;
  let activitySum=0,
  activePixels=0,
  edgePixels=0,
  minX=width,
  minY=height,
  maxX=-1,
  maxY=-1;
  for(let i=0,offset=0;i<count;i++,offset+=4)luma[i]=source[offset]*.299+source[offset+1]*.587+source[offset+2]*.114;
  const motionThreshold=16+(1-edgeControl)*28,
  edgeThreshold=24-edgeControl*20,
  inverseSpan=1/(88-motionThreshold),
  leftLimit=width*.06,
  rightLimit=width*.94,
  topLimit=height*.07,
  bottomLimit=height*.93;
  for(let y=0;y<height;y++){
    const row=y*width;
    for(let x=0;x<width;x++){
      const i=row+x,
      difference=Math.abs(luma[i]-previous[i]),
      activity=clamp((difference-motionThreshold)*inverseSpan,0,1),
      smoothed=activity>motion[i]?activity:motion[i]*.86;
      motion[i]=smoothed;
      const left=x>0?luma[i-1]:luma[i],
      right=x+1<width?luma[i+1]:luma[i],
      up=y>0?luma[i-width]:luma[i],
      down=y+1<height?luma[i+width]:luma[i],
      gradient=(Math.abs(right-left)+Math.abs(down-up))*.5,
      edgeValue=clamp((gradient-edgeThreshold)*.3,0,1);
      edge[i]=edgeValue;
      const combined=smoothed>edgeValue?smoothed:edgeValue,
      previousStructure=structure[i];
      structure[i]=previousStructure+(combined-previousStructure)*(combined>previousStructure?.25:.15);
      activitySum+=activity;
      if(collectBounds&&smoothed>=.08){
        activePixels++;
        if(x<minX)minX=x;
        if(x>maxX)maxX=x;
        if(y<minY)minY=y;
        if(y>maxY)maxY=y;
        if(x<leftLimit||x>rightLimit||y<topLimit||y>bottomLimit)edgePixels++
      }
    }
  }
  previous.set(luma);
  state.hasPrevious=true;
  state.activity=activitySum/count;
  state.edgeRatio=activePixels?edgePixels/activePixels:1;
  state.box=activePixels?{
    left:minX,
    top:minY,
    right:maxX+1,
    bottom:maxY+1,
    width:maxX-minX+1,
    height:maxY-minY+1,
    cx:(minX+maxX+1)/2,
    cy:(minY+maxY+1)/2
  }
  :null;
  return state
}

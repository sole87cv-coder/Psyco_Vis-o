import {
  clamp
}
from './utils.js';
export function analyzeMotionFrame(current, previous, output, width, height, edge, collectBounds=false) {
  const threshold=16+(1-edge)*28;
  let activitySum=0,
  activePixels=0,
  edgePixels=0,
  minX=width,
  minY=height,
  maxX=-1,
  maxY=-1;
  for(let pixel=0,offset=0;pixel<previous.length;pixel++,offset+=4){
    const luminance=current[offset]*.299+current[offset+1]*.587+current[offset+2]*.114,
    difference=Math.abs(luminance-previous[pixel]);
    previous[pixel]=luminance;
    const activity=clamp((difference-threshold)/(88-threshold),0,1);
    activitySum+=activity;
    if(collectBounds&&activity>=.08){
      const x=pixel%width,
      y=Math.floor(pixel/width);
      activePixels++;
      minX=Math.min(minX,x);
      maxX=Math.max(maxX,x);
      minY=Math.min(minY,y);
      maxY=Math.max(maxY,y);
      if(x<width*.06||x>width*.94||y<height*.07||y>height*.93)edgePixels++;
    }
    output[offset]=72;
    output[offset+1]=255;
    output[offset+2]=150;
    output[offset+3]=Math.round((collectBounds?clamp((activity-.05)*2.6,0,1):activity)*205);
  }
  const box=activePixels?{
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
  return {
    activity:activitySum/previous.length,
    activePixels,
    edgeRatio:activePixels?edgePixels/activePixels:1,
    box,
    aspect:box?box.height/box.width:0
  };
}

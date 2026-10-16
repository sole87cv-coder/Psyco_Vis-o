import {
  MODE_PROFILES,
  PRESET_PROFILES
}
from './config.js';
import {
  clamp
}
from './utils.js';
export function getDreamShader(mode,preset,t,reducedMotion=false){
  const m=MODE_PROFILES[mode]||MODE_PROFILES.both,
  p=PRESET_PROFILES[preset]||PRESET_PROFILES.bat,
  reduced=!!reducedMotion,
  drift=reduced?0:Math.sin(t*.00012)*.05;
  return{
    mode,
    reduced,
    decay:clamp(p.decay+(preset==='delirium'?drift*.02:0),.9,.965),
    speed:p.speed*(reduced?.8:1),
    ringGain:m.ringGain,
    ringWidth:m.ringWidth,
    edgeDeform:m.edgeDeform,
    edgeGain:m.edgeGain,
    dotGain:m.dotGain*p.dotGain*(reduced?.5:1),
    reflectionGain:reduced?m.reflectionGain*.4:m.reflectionGain,
    videoGain:m.videoGain,
    breathRate:p.breathRate,
    breathDepth:p.breathDepth*(reduced?.6:1),
    amberMix:clamp(p.amberMix+drift*(preset==='delirium'?.6:.15),0,1)
  }
}

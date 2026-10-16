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
  const m=MODE_PROFILES[mode]||MODE_PROFILES.abstract,
  p=PRESET_PROFILES[preset]||PRESET_PROFILES.bat,
  reduced=!!reducedMotion,
  drift=reduced?0:Math.sin(t*.00012)*.05,
  decay=clamp(m.decayBase+p.decayShift+(preset==='delirium'?drift*.02:0),m.decayMin,m.decayMax),
  warmMix=clamp(p.warmMix+(preset==='delirium'?drift*.6:drift*.15),0,1);
  return{
    mode,
    label:m.label,
    reduced,
    decay,
    decayMin:m.decayMin,
    decayMax:m.decayMax,
    speed:p.speed*(reduced?.8:1),
    ringGain:m.ringGain,
    ringWidth:m.ringWidth,
    edgeDeform:m.edgeDeform,
    edgeGain:m.edgeGain,
    dotGain:m.dotGain*p.dotGain*(reduced?.5:1),
    reflectionGain:reduced?m.reflectionGain*.4:m.reflectionGain,
    fillAlpha:m.fillAlpha*(reduced?.9:1),
    contourAlpha:m.contourAlpha,
    diffuseGain:m.diffuseGain||0,
    smoke:reduced?0:m.smoke,
    jitter:reduced?0:m.jitter,
    bandBass:m.bandBass,
    bandMid:m.bandMid,
    bandTreble:m.bandTreble,
    videoTint:m.videoTint,
    videoGainSutil:m.videoGainSutil,
    videoGainVisivel:m.videoGainVisivel,
    palette:m.palette,
    warmMix,
    breathRate:p.breathRate,
    breathDepth:p.breathDepth*(reduced?.6:1),
    echo:m.echo&&!reduced,
    blindSpot:m.blindSpot,
    emitter:m.emitter
  }
}

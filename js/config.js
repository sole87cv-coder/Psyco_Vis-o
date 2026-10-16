export const VIDEO_LEVELS = Object.freeze({
  oculto: 0, sutil: 0.15, visivel: 0.35
});
export const CONTROL_IDS = Object.freeze(['green','edge','wave','fish','glitch','trail','sens','vivid','gate','smoothing','mode']);
export const ANALYSIS_WIDTH = 160;
export const ANALYSIS_HEIGHT = 120;
export const FIELD_PIXELS = Object.freeze({
  celular: 128000, computador: 320000
});
export const DPR_CAP = Object.freeze({
  celular: 1.5, computador: 2.0
});
export const MOBILE = Object.freeze({
  dprMax: 1.5,
  resizeDebounceMs: 120,
  keyboardIgnoreRatio: 0.4,
  quarterTurnAspect: Object.freeze({
    portraitMin: 1.15, landscapeMax: 0.87
  })
});
export const HUD = Object.freeze({
  idleMs: 2500, longPressMs: 500, doubleTapMs: 300, tapSlack: 12
});
export const PERF = Object.freeze({
  slowMs: 16, slowWindowMs: 1000, downscale: 0.85, restoreMs: 10, restoreWindowMs: 3000, upscale: 1.18, minScale: 0.55
});
export const BAND_EDGES = Object.freeze([60,150,300,600,1200,2400,4800,9600,14000]);
export const DEFAULT_VIDEO_LEVEL = 'sutil';
export const DEFAULT_PRESET = 'bat';
export const MODE_PROFILES = {
  abstract: {
    label:'Eco de luz',
    decayMin:.94, decayMax:.98, decayBase:.956,
    palette:{
      fill:[92,180,118],
      core:[210,150,60],
      warm:[255,232,190],
      veil:[255,214,150],
      flash:[255,220,160]
    },
    videoTint:[205,158,84],
    videoGainSutil:1, videoGainVisivel:1,
    bandBass:1.25, bandMid:1, bandTreble:.95,
    ringGain:1, ringWidth:1.15, edgeDeform:1, edgeGain:1.1,
    dotGain:1, reflectionGain:.85,
    fillAlpha:.5, contourAlpha:1, diffuseGain:.55, smoke:0, jitter:0,
    echo:true, blindSpot:true,
    emitter:{
      x:.5, y:.97
    }
  },
  silhouette: {
    label:'Silhueta',
    decayMin:.85, decayMax:.92, decayBase:.885,
    palette:{
      fill:[52,116,80],
      core:[210,150,60],
      warm:[255,232,190],
      veil:[120,190,150],
      flash:[150,220,170]
    },
    videoTint:[130,200,158],
    videoGainSutil:1, videoGainVisivel:1,
    bandBass:1.1, bandMid:1.2, bandTreble:.7,
    ringGain:0, ringWidth:1, edgeDeform:0, edgeGain:0,
    dotGain:0, reflectionGain:0,
    fillAlpha:.85, contourAlpha:0, smoke:0, jitter:0,
    echo:false, blindSpot:false,
    emitter:null
  },
  both: {
    label:'Silhueta e contorno',
    decayMin:.9, decayMax:.96, decayBase:.928,
    palette:{
      fill:[46,104,74],
      core:[216,168,80],
      warm:[255,236,200],
      veil:[150,205,165],
      flash:[255,225,170]
    },
    videoTint:[140,205,160],
    videoGainSutil:1, videoGainVisivel:1,
    bandBass:1, bandMid:1.1, bandTreble:1.2,
    ringGain:0, ringWidth:1, edgeDeform:0, edgeGain:0,
    dotGain:0, reflectionGain:0,
    fillAlpha:.55, contourAlpha:.9, smoke:1, jitter:0,
    echo:false, blindSpot:false,
    emitter:null
  },
  outline: {
    label:'Só contorno',
    decayMin:.8, decayMax:.88, decayBase:.842,
    palette:{
      fill:[0,0,0],
      core:[232,140,48],
      warm:[255,236,205],
      veil:[230,110,70],
      flash:[255,190,120],
      ramp:[[170,28,18],[232,140,48],[255,236,205]]
    },
    videoTint:[225,118,72],
    videoGainSutil:1, videoGainVisivel:1,
    bandBass:.6, bandMid:1, bandTreble:1.35,
    ringGain:0, ringWidth:1, edgeDeform:0, edgeGain:0,
    dotGain:0, reflectionGain:0,
    fillAlpha:0, contourAlpha:1, smoke:0, jitter:2.4,
    echo:false, blindSpot:false,
    emitter:null
  }
};
export const PRESET_PROFILES = {
  bat:{
    decayShift:0,
    speed:1.25,
    breathRate:1,
    breathDepth:.45,
    dotGain:1,
    warmMix:.15
  },
  deep:{
    decayShift:.018,
    speed:.9,
    breathRate:.7,
    breathDepth:.6,
    dotGain:.7,
    warmMix:.05
  },
  delirium:{
    decayShift:-.016,
    speed:1.5,
    breathRate:1.25,
    breathDepth:.35,
    dotGain:1.35,
    warmMix:.4
  },
  breath:{
    decayShift:.024,
    speed:.75,
    breathRate:.55,
    breathDepth:.7,
    dotGain:.6,
    warmMix:.03
  }
};

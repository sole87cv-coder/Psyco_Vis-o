export const VIDEO_LEVELS = Object.freeze({
  oculto: 0, sutil: 0.12, visivel: 0.35
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
  silhouette:{
    ringGain:1,
    ringWidth:1.25,
    edgeDeform:1,
    edgeGain:1.15,
    dotGain:.55,
    reflectionGain:.75,
    videoGain:1
  },
  outline:{
    ringGain:.92,
    ringWidth:.6,
    edgeDeform:1.5,
    edgeGain:1.5,
    dotGain:.75,
    reflectionGain:.9,
    videoGain:.8
  },
  both:{
    ringGain:1,
    ringWidth:1,
    edgeDeform:1.2,
    edgeGain:1.3,
    dotGain:.7,
    reflectionGain:.85,
    videoGain:1
  },
  abstract:{
    ringGain:1.12,
    ringWidth:1.3,
    edgeDeform:.55,
    edgeGain:.75,
    dotGain:.5,
    reflectionGain:.35,
    videoGain:0
  }
};
export const PRESET_PROFILES = {
  bat:{
    decay:.905,
    speed:1.3,
    amberMix:.16,
    breathRate:1,
    breathDepth:.4,
    dotGain:1
  },
  deep:{
    decay:.948,
    speed:.9,
    amberMix:.06,
    breathRate:.7,
    breathDepth:.6,
    dotGain:.7
  },
  delirium:{
    decay:.928,
    speed:1.5,
    amberMix:.42,
    breathRate:1.25,
    breathDepth:.35,
    dotGain:1.35
  },
  breath:{
    decay:.962,
    speed:.72,
    amberMix:.03,
    breathRate:.55,
    breathDepth:.75,
    dotGain:.55
  }
};

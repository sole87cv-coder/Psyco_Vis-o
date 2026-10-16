export const VIDEO_LEVELS = Object.freeze({
  oculto: 0, sutil: 0.20, visivel: 0.55
});
export const CONTROL_IDS = Object.freeze(['green','edge','wave','fish','glitch','trail','sens','vivid','gate','smoothing','mode']);
export const MOTION_QUALITY = Object.freeze([{
  width:480,height:270
},{
  width:360,height:203
},{
  width:256,height:144
}]);
export const DEFAULT_VIDEO_LEVEL = 'sutil';
export const DEFAULT_PRESET = 'bat';
export const MODE_PROFILES = {
  silhouette:{
    smokeAlpha:.52,
    smokeBlur:15,
    contourAlpha:0,
    meshAlpha:0,
    pulseAlpha:.78,
    imageAlpha:1,
    imageContrast:1.82,
    imageSaturation:.72,
    imageBlend:'screen',
    filter:'grayscale(1) contrast(1.14) sepia(.58) hue-rotate(162deg) saturate(.72) brightness(.88)'
  },
  outline:{
    smokeAlpha:0,
    smokeBlur:0,
    contourAlpha:1.08,
    meshAlpha:0,
    pulseAlpha:.48,
    imageAlpha:.34,
    imageContrast:2.9,
    imageSaturation:.18,
    imageBlend:'lighter',
    filter:'grayscale(1) contrast(2.4) sepia(.16) hue-rotate(172deg) saturate(.45) brightness(1.18)'
  },
  both:{
    smokeAlpha:.29,
    smokeBlur:12,
    contourAlpha:.64,
    meshAlpha:0,
    pulseAlpha:.64,
    imageAlpha:.80,
    imageContrast:2.05,
    imageSaturation:.42,
    imageBlend:'screen',
    filter:'grayscale(1) contrast(1.25) sepia(.48) hue-rotate(168deg) saturate(.66) brightness(.86)'
  },
  abstract:{
    smokeAlpha:0,
    smokeBlur:0,
    contourAlpha:0,
    meshAlpha:.44,
    pulseAlpha:.20,
    imageAlpha:.38,
    imageContrast:1.3,
    imageSaturation:.3,
    imageBlend:'lighter',
    filter:'none'
  }
};
export const PRESET_PROFILES = {
  bat:{
    hue:0,
    contrast:1,
    saturation:1,
    brightness:1,
    persistence:1.25
  },
  deep:{
    hue:34,
    contrast:1.08,
    saturation:1.16,
    brightness:.94,
    persistence:1.9
  },
  delirium:{
    hue:-44,
    contrast:.92,
    saturation:.92,
    brightness:.88,
    persistence:2.25
  },
  breath:{
    hue:-8,
    contrast:.82,
    saturation:.72,
    brightness:.92,
    persistence:3.1
  }
};

import {
  BAND_EDGES
}
from './config.js';
export function measureAudioBands(timeData,frequencyData,sampleRate,bands=new Float32Array(8)) {
  let sum=0,
  peak=0;
  for(let i=0;i<timeData.length;i++){
    const value=timeData[i];
    sum+=value*value;
    const magnitude=value<0?-value:value;
    if(magnitude>peak)peak=magnitude
  }
  const nyquist=sampleRate*.5,
  bins=frequencyData.length;
  for(let band=0;band<8;band++){
    const start=Math.max(1,Math.floor(BAND_EDGES[band]/nyquist*bins)),
    end=Math.max(start+1,Math.min(bins,Math.ceil(BAND_EDGES[band+1]/nyquist*bins)));
    let total=0;
    for(let i=start;i<end;i++)total+=10**(frequencyData[i]/20);
    bands[band]=total/(end-start)
  }
  let dominantMagnitude=0,
  dominantBin=1;
  for(let i=1;i<bins;i++){
    const magnitude=10**(frequencyData[i]/20);
    if(magnitude>dominantMagnitude){
      dominantMagnitude=magnitude;
      dominantBin=i
    }
  }
  return{
    rms:Math.sqrt(sum/(timeData.length||1)),
    peak,
    bands,
    bass:(bands[0]+bands[1])*.5,
    mid:(bands[2]+bands[3]+bands[4]+bands[5])*.25,
    treble:(bands[6]+bands[7])*.5,
    dominantBin,
    nyquist
  }
}
export function updateEnvelope(current,target,rise=.5,fall=.12) {
  const rate=target>current?rise:fall;
  return current+(target-current)*rate
}
export function syntheticEnvelope(t) {
  const slow=.5+.5*Math.sin(t*.00055),
  drift=.5+.5*Math.sin(t*.00021+1.7);
  return .05+.09*slow+.05*drift
}

export function measureAudioBands(timeData, frequencyData, sampleRate) {
  let sum=0,
  peak=0;
  for(const value of timeData){
    const magnitude=Math.abs(value);
    sum+=value*value;
    peak=Math.max(peak,magnitude);
  }
  const nyquist=sampleRate*.5,
  n=frequencyData.length,
  b0=Math.max(1,Math.floor(20/nyquist*n)),
  b1=Math.min(n,Math.ceil(250/nyquist*n)),
  m1=Math.min(n,Math.ceil(2000/nyquist*n)),
  t1=Math.min(n,Math.ceil(8000/nyquist*n));
  let bass=0,
  mid=0,
  treble=0,
  dominantMag=0,
  dominantBin=1;
  const accumulate=(start,
  end)=>{
    let total=0;
    for(let i=start;i<end;i++){
      const mag=10**(frequencyData[i]/20);
      total+=mag;
      if(mag>dominantMag){
        dominantMag=mag;
        dominantBin=i;
      }
    }
    return total/(end-start||1);
  };
  bass=accumulate(b0,b1);
  mid=accumulate(b1,m1);
  treble=accumulate(m1,t1);
  return {
    rms:Math.sqrt(sum/(timeData.length||1)),
    peak,
    bass,
    mid,
    treble,
    dominantBin,
    nyquist
  };
}

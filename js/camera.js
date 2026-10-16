const PERMISSION_ERRORS = new Set(['NotAllowedError','PermissionDeniedError']);
const INTEGRATED_PATTERNS = [/hd user facing/i,/integrated/i,/facetime/i,/hd webcam/i,/built[\s-]?in/i,/usb2\.0 hd/i];
const EOS_PATTERNS = [/eos webcam utility/i,/\beos\b/i,/canon/i];
const REAR_PATTERNS = [/facing[\s_-]*back/i,/back[\s_-]*camera/i,/rear/i,/traseira/i,/environment/i,/mundo/i];
const FRONT_PATTERNS = [/facing[\s_-]*front/i,/front[\s_-]*camera/i,/frontal/i,/selfie/i,/\buser\b/i];
export function cameraErrorMessage(error, mediaDevices = navigator.mediaDevices) {
  if(!mediaDevices?.getUserMedia)return 'Este navegador não consegue abrir a câmera. Tente usar um navegador atualizado.';
  if(PERMISSION_ERRORS.has(error?.name))return 'A câmera precisa de permissão. Toque no cadeado do navegador, permita o acesso e tente de novo.';
  if(['NotFoundError','DevicesNotFoundError'].includes(error?.name))return 'Este aparelho não encontrou uma câmera disponível.';
  if(['NotReadableError','TrackStartError'].includes(error?.name))return 'A câmera pode estar aberta em outro aplicativo. Feche esse aplicativo e tente de novo.';
  if(error?.name==='OverconstrainedError')return 'Essa câmera não está disponível neste aparelho.';
  if(error?.name==='SecurityError')return 'Abra o endereço seguro do Psyco_Visão para usar a câmera.';
  if(error?.name==='AbortError')return 'A câmera demorou para responder. Vamos tentar de novo.';
  return 'A câmera parou de responder. Vamos tentar de novo.';
}
export function getCameraConstraints({facing='environment',deviceId=''}={}){
  const video = deviceId?{
    deviceId:{
      exact:deviceId
    }
  }:{
    facingMode:{
      ideal:facing
    }
  };
  video.width={
    ideal:960, max:1280
  };
  video.height={
    ideal:540, max:720
  };
  video.frameRate={
    ideal:24, max:30
  };
  return{
    video, audio:false
  };
}
export function countVideoInputs(devices){
  return devices.filter(device=>device.kind==='videoinput').length;
}
export function detectDeviceContext(nav=navigator,view=window){
  const ua=nav?.userAgent||'',
  mobileUA=/Android|iPhone|iPad|iPod|Mobile Safari/i.test(ua);
  if(mobileUA)return 'mobile';
  const coarse=view?.matchMedia?.('(pointer:coarse)')?.matches;
  return coarse&&view.innerWidth<=900?'mobile':'desktop';
}
function matchesAny(value,patterns){
  return patterns.some(pattern=>pattern.test(value));
}
function classifyGroup(label,context){
  if(context==='desktop'){
    if(matchesAny(label,INTEGRATED_PATTERNS))return 'integrated';
    if(matchesAny(label,EOS_PATTERNS))return 'eos';
    return 'other';
  }
  if(matchesAny(label,REAR_PATTERNS))return 'rear';
  if(matchesAny(label,FRONT_PATTERNS))return 'front';
  return 'other';
}
export function classifyCameras(devices,context='desktop',hint={}){
  const seen=new Set(),
  entries=[];
  let index=0;
  for(const device of devices||[]){
    if(device?.kind!=='videoinput'||!device.deviceId||seen.has(device.deviceId))continue;
    seen.add(device.deviceId);
    index++;
    const raw=(device.label||'').trim(),
    label=raw||('Câmera '+index);
    let group=classifyGroup(raw,context);
    if(hint.deviceId&&device.deviceId===hint.deviceId){
      if(context==='mobile'&&(hint.facing==='user'||hint.facing==='environment'))group=hint.facing==='user'?'front':'rear'
    }
    entries.push({
      id:device.deviceId, raw, label, group
    })
  }
  const counts={
  };
  for(const entry of entries)counts[entry.group]=(counts[entry.group]||0)+1;
  const friendly={
    integrated:'Câmera integrada do laptop',
    eos:'EOS Webcam Utility (Canon)',
    rear:'Câmera traseira',
    front:'Câmera frontal'
  };
  for(const entry of entries){
    const base=friendly[entry.group];
    entry.label=base?(counts[entry.group]>1&&entry.raw?base+' ('+entry.raw+')':base):entry.label
  }
  const byGroup=group=>entries.filter(entry=>entry.group===group);
  const order=context==='desktop'?['integrated','eos','other']:['rear','front','other'],
  ordered=[];
  for(const group of order)ordered.push(...byGroup(group));
  const groups=context==='desktop'?[{
    key:'integrated', title:'Integradas'
  },{
    key:'eos', title:'EOS / Canon'
  },{
    key:'other', title:'Outras'
  }]:[{
    key:'rear', title:'Traseiras'
  },{
    key:'front', title:'Frontais'
  },{
    key:'other', title:'Outras'
  }];
  const hasRear=byGroup('rear').length>0,
  hasFront=byGroup('front').length>0,
  defaultId=context==='desktop'?(byGroup('integrated')[0]||entries[0])?.id||'':
  (byGroup('rear')[0]||byGroup('front')[0]||entries[0])?.id||'';
  return{
    context, entries, ordered, groups, counts, hasRear, hasFront, defaultId
  }
}
export function pickFlipTarget(classification,currentFacing){
  if(!classification)return '';
  const want=currentFacing==='user'?'rear':'front',
  entry=classification.ordered.find(item=>item.group===want);
  return entry?entry.id:''
}

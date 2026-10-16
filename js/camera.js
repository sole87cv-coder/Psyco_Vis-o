const PERMISSION_ERRORS = new Set(['NotAllowedError','PermissionDeniedError']);
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
export function getCameraConstraints(mode){
  return {
    video:{
      facingMode:{
        ideal:mode
      },
      width:{
        ideal:960,
        max:1280
      },
      height:{
        ideal:540,
        max:720
      },
      frameRate:{
        ideal:24,
        max:30
      }
    },
    audio:false
  };
}
export function countVideoInputs(devices){
  return devices.filter(device=>device.kind==='videoinput').length;
}

export function updateControlLabels($) {
  for (const id of ['green','edge','wave','fish','glitch','trail']) $(`#${id}Val`).textContent = `${$(`#${
    id
  }
  `).value}%`;
  $('#sensVal').textContent = `${(+$('#sens').value/10).toFixed(1)}×`;
  $('#vividVal').textContent = (+$('#vivid').value/100).toFixed(2);
  $('#gateVal').textContent = (+$('#gate').value/1000).toFixed(3);
  $('#smoothingVal').textContent = (+$('#smoothing').value/100).toFixed(2);
}
export function readControlValues(ids, $) {
  return Object.fromEntries(ids.map(id => [id, $(`#${id}`).value]));
}
export function restoreControlValues(ids, saved, $) {
  for (const id of ids) {
    const el=$(`#${id}`);
    if(!el || saved?.[id]==null) continue;
    if(el.tagName==='SELECT'){
      if([...el.options].some(option=>option.value===String(saved[id]))) el.value=String(saved[id]);
      continue;
    }
    const value=Number(saved[id]);
    if(Number.isFinite(value) && value>=Number(el.min) && value<=Number(el.max)) el.value=String(value);
  }
}
export function bindControlInputs(ids, $, onInput) {
  for(const id of ids){
    const element=$(`#${id}`);
    if(!element)continue;
    element.addEventListener(element.tagName==='SELECT'?'change':'input',onInput);
  }
}
export function renderVideoLevelState(buttons, label, body, level) {
  for(const button of buttons){
    const active=button.dataset.videoLevel===level;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  label.textContent=level.toUpperCase();
  body.dataset.videoLevel=level;
}
export function bindVideoLevelButtons(buttons,onChange){
  for(const button of buttons)button.addEventListener('click',()=>onChange(button.dataset.videoLevel));
}
export function createHud({
  idleMs=2500
}
={
}) {
  const body=document.body;
  let timer=0,
  held=false,
  errorKind='',
  current=body.dataset.hud||'visible';
  const apply=next=>{
    if(current===next)return;
    current=next;
    body.dataset.hud=next
  };
  const schedule=()=>{
    clearTimeout(timer);
    if(held)return;
    timer=setTimeout(()=>apply('hidden'),idleMs)
  };
  const show=()=>{
    apply(errorKind?'error':'visible');
    schedule()
  };
  const hud={
    show,
    hide(){
      apply('hidden')
    },
    toggle(){
      if(current==='hidden')show();
      else hud.hide()
    },
    noteActivity(){
      if(current==='hidden'||held)return;
      schedule()
    },
    setError(kind){
      errorKind=kind||'geral';
      apply('error');
      schedule()
    },
    clearError(kind){
      if(errorKind&&kind&&errorKind!==kind)return;
      errorKind='';
      if(current==='error')apply('visible');
      schedule()
    },
    hold(on){
      held=!!on;
      if(held)clearTimeout(timer);
      else schedule()
    },
    get hidden(){
      return current==='hidden'
    },
    get error(){
      return!!errorKind
    }
  };
  schedule();
  return hud
}

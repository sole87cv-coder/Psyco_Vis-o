export function updateControlLabels($) {
  for (const id of ['green','edge','wave','fish','glitch','trail']) $(`#${id}Val`).textContent = `${$(`#${id}`).value}%`;
  $('#sensVal').textContent = `${(+$('#sens').value/10).toFixed(1)}×`;
  $('#vividVal').textContent = (+$('#vivid').value/100).toFixed(2);
  $('#gateVal').textContent = (+$('#gate').value/1000).toFixed(3);
  $('#smoothingVal').textContent = (+$('#smoothing').value/100).toFixed(2);
}
export function readControlValues(ids, $) { return Object.fromEntries(ids.map(id => [id, $(`#${id}`).value])); }
export function restoreControlValues(ids, saved, $) { for (const id of ids) { const el=$(`#${id}`); if(!el || saved?.[id]==null) continue; if(el.tagName==='SELECT'){ if([...el.options].some(option=>option.value===String(saved[id]))) el.value=String(saved[id]); continue; } const value=Number(saved[id]); if(Number.isFinite(value) && value>=Number(el.min) && value<=Number(el.max)) el.value=String(value); } }
export function bindControlInputs(ids, $, onInput) { for(const id of ids){const element=$(`#${id}`);if(!element)continue;element.addEventListener(element.tagName==='SELECT'?'change':'input',onInput);} }
export function renderVideoLevelState(buttons, label, body, level) { for(const button of buttons){const active=button.dataset.videoLevel===level;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));} label.textContent=level.toUpperCase();body.dataset.videoLevel=level; }
export function bindVideoLevelButtons(buttons,onChange){for(const button of buttons)button.addEventListener('click',()=>onChange(button.dataset.videoLevel));}

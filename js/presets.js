const PRESET_CONTROL_VALUES = Object.freeze({
  bat: {
    mode:'both', sens:40, gate:8, green:72, edge:58, wave:0, fish:0, glitch:0, vivid:72, trail:28
  },
  deep: {
    mode:'silhouette', sens:18, gate:16, green:92, edge:72, wave:12, fish:4, glitch:0, vivid:52, trail:65
  },
  delirium: {
    mode:'outline', sens:68, gate:5, green:55, edge:88, wave:18, fish:72, glitch:28, vivid:90, trail:48
  },
  breath: {
    mode:'abstract', sens:26, gate:10, green:82, edge:42, wave:82, fish:0, glitch:0, vivid:62, trail:35
  }
});
export function applyDreamPreset(name, select) {
  const values = PRESET_CONTROL_VALUES[name];
  if (!values) return false;
  for (const [control, value] of Object.entries(values)) {
    const element = select(`#${control}`);
    if (element) element.value = value;
  }
  return true;
}

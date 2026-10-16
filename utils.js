export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
export function readStorageJSON(key, fallback = {}) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) ?? fallback : fallback;
  }
  catch {
    return fallback;
  }
}
export function writeStorageJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  }
  catch {
    return false;
  }
}

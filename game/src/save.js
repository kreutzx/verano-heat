// Progress persistence: money, story progress and where the player left
// off, kept in localStorage between visits.

const KEY = 'verano-heat-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null; // a corrupt save is just a fresh start
  }
}

export function storeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the game simply will not persist.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

export function hasSave() {
  return loadSave() !== null;
}

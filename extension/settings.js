export const DEFAULT_SETTINGS = Object.freeze({
  reviewBeforeOpen: false,
  includeUrl: true,
  stripQuery: true,
  openKeepPopup: true,
});
export async function readSettings() {
  const saved = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([k,v]) => [k, typeof saved[k] === 'boolean' ? saved[k] : v]));
}
export async function saveSettings(patch) {
  const allowed = Object.fromEntries(Object.entries(patch || {}).filter(([k,v]) => k in DEFAULT_SETTINGS && typeof v === 'boolean'));
  if (Object.keys(allowed).length) await chrome.storage.local.set(allowed);
}

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 2;
const TYPES = new Set(['cross', 'dot', 'circle', 'square', 't', 'x']);

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function validColor(value, fallback = '#00ff00') {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;
}

function createDefaultCrosshair(id = Date.now()) {
  return {
    id,
    name: 'Crosshair 1',
    type: 'cross',
    color: '#00ff00',
    size: 30,
    width: 30,
    height: 30,
    thickness: 3,
    opacity: 100,
    gap: 5,
    imageData: null,
    imageSize: null,
    imageOpacity: null,
    imageOnly: false
  };
}

function normalizeCrosshair(value, index = 0) {
  const input = value && typeof value === 'object' ? value : {};
  const fallback = createDefaultCrosshair(`crosshair-${Date.now()}-${index}`);
  const size = clamp(input.size, 5, 150, 30);
  const imageData = typeof input.imageData === 'string' && input.imageData.startsWith('data:image/')
    ? input.imageData
    : null;

  return {
    id: input.id !== undefined && input.id !== null && String(input.id).trim() !== ''
      ? input.id
      : fallback.id,
    name: typeof input.name === 'string' && input.name.trim()
      ? input.name.trim().slice(0, 100)
      : `Crosshair ${index + 1}`,
    type: TYPES.has(input.type) ? input.type : 'cross',
    color: validColor(input.color),
    size,
    width: clamp(input.width, 5, 150, size),
    height: clamp(input.height, 5, 150, size),
    thickness: clamp(input.thickness, 1, 15, 3),
    opacity: clamp(input.opacity, 10, 100, 100),
    gap: clamp(input.gap, 0, 50, 5),
    imageData,
    imageSize: imageData ? clamp(input.imageSize, 10, 200, 50) : null,
    imageOpacity: imageData ? clamp(input.imageOpacity, 10, 100, 100) : null,
    imageOnly: Boolean(input.imageOnly && imageData)
  };
}

function normalizeState(value) {
  const input = Array.isArray(value) ? { crosshairs: value } : (value || {});
  const source = Array.isArray(input.crosshairs) ? input.crosshairs : [];
  const ids = new Set();
  const crosshairs = source.map((item, index) => {
    const crosshair = normalizeCrosshair(item, index);
    const key = String(crosshair.id);
    if (ids.has(key)) crosshair.id = `crosshair-${Date.now()}-${index}`;
    ids.add(String(crosshair.id));
    return crosshair;
  });

  const hasId = (id) => id !== undefined && id !== null && ids.has(String(id));
  return {
    version: SCHEMA_VERSION,
    crosshairs,
    selectedId: hasId(input.selectedId) ? input.selectedId : (crosshairs[0]?.id ?? null),
    lastUsedId: hasId(input.lastUsedId) ? input.lastUsedId : (crosshairs[0]?.id ?? null)
  };
}

function emptyState() {
  return normalizeState({ crosshairs: [] });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readState(filePath) {
  const backupPath = `${filePath}.bak`;
  const candidates = [filePath, backupPath];
  let lastError = null;

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const state = normalizeState(readJson(candidate));
      return { state, recovered: candidate === backupPath, error: null };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError && fs.existsSync(filePath)) {
    try {
      const corruptPath = `${filePath}.corrupt-${Date.now()}`;
      fs.renameSync(filePath, corruptPath);
    } catch (_) {
      // The app can still start with a clean state if the diagnostic copy fails.
    }
  }

  return { state: emptyState(), recovered: false, error: lastError };
}

function writeState(filePath, value) {
  const state = normalizeState(value);
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const backupPath = `${filePath}.bak`;
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf8');

  try {
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backupPath);
    fs.rmSync(filePath, { force: true });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }); } catch (_) {}
    throw error;
  }

  return state;
}

module.exports = {
  SCHEMA_VERSION,
  createDefaultCrosshair,
  normalizeCrosshair,
  normalizeState,
  readState,
  writeState
};

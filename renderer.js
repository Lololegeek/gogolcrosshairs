const { ipcRenderer } = require('electron');

let crosshairs = [];
let currentCrosshair = null;
let appState = { selectedId: null, lastUsedId: null };
let isOverlayActive = false;
let isInitializing = true;
let saveTimer = null;
let saveChain = Promise.resolve();
let previewGeneration = 0;
let toastTimer = null;
let globalF2Available = false;

function nextId() { return Date.now() + Math.floor(Math.random() * 1000); }

function createDefaultCrosshair() {
  return {
    id: nextId(), name: `Crosshair ${crosshairs.length + 1}`, type: 'cross', color: '#00ff00',
    size: 30, width: 30, height: 30, thickness: 3, opacity: 100, gap: 5,
    imageData: null, imageSize: null, imageOpacity: null, imageOnly: false
  };
}

function safeNumber(id, fallback) {
  const value = Number.parseInt(document.getElementById(id)?.value, 10);
  return Number.isFinite(value) ? value : fallback;
}

function activeType() { return document.querySelector('.type-btn.active')?.dataset.type || 'cross'; }

async function invoke(channel, payload) {
  try { return await ipcRenderer.invoke(channel, payload); }
  catch (error) {
    console.error(`[renderer] ${channel} failed`, error);
    return { success: false, error: error.message };
  }
}

async function loadCrosshairs() {
  const loaded = await invoke('load-app-state');
  const state = Array.isArray(loaded) ? { crosshairs: loaded } : (loaded || {});
  crosshairs = Array.isArray(state.crosshairs) ? state.crosshairs : [];
  appState = { selectedId: state.selectedId ?? null, lastUsedId: state.lastUsedId ?? null };
  if (crosshairs.length === 0) crosshairs.push(createDefaultCrosshair());

  const selected = crosshairs.find((item) => String(item.id) === String(appState.selectedId)) || crosshairs[0];
  selectCrosshair(selected, { persist: false });
  isInitializing = false;
  await saveCrosshair({ silent: true });

  document.getElementById('name')?.focus();
  document.querySelector('.main-content')?.scrollTo(0, 0);
}

function renderCrosshairList() {
  const list = document.getElementById('crosshairList');
  if (!list) return;
  list.replaceChildren();
  crosshairs.forEach((crosshair, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'crosshair-item';
    item.classList.toggle('active', currentCrosshair && String(crosshair.id) === String(currentCrosshair.id));
    item.textContent = crosshair.name || `Crosshair ${index + 1}`;
    item.title = 'Modifier ce crosshair';
    item.addEventListener('click', () => selectCrosshair(crosshair));
    list.appendChild(item);
  });
}

function selectCrosshair(crosshair, { persist = true } = {}) {
  if (!crosshair) return;
  currentCrosshair = crosshair;
  appState.selectedId = crosshair.id;
  document.getElementById('name').value = crosshair.name || '';
  document.getElementById('size').value = crosshair.size ?? 30;
  document.getElementById('width').value = crosshair.width ?? crosshair.size ?? 30;
  document.getElementById('height').value = crosshair.height ?? crosshair.size ?? 30;
  document.getElementById('thickness').value = crosshair.thickness ?? 3;
  document.getElementById('opacity').value = crosshair.opacity ?? 100;
  document.getElementById('gap').value = crosshair.gap ?? 5;
  document.getElementById('color').value = crosshair.color || '#00ff00';
  document.getElementById('colorHex').value = crosshair.color || '#00ff00';
  document.getElementById('imageSize').value = crosshair.imageSize ?? 50;
  document.getElementById('imageOpacity').value = crosshair.imageOpacity ?? 100;
  document.querySelectorAll('.type-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.type === (crosshair.type || 'cross'));
  });
  document.getElementById('editorTitle').textContent = crosshair.name || 'Crosshair';
  crosshair.imageData ? showImageControls() : hideImageControls();
  updateSize(); updateWidth(); updateHeight(); updateThickness(); updateOpacity(); updateGap();
  updateImageSize(); updateImageOpacity(); updatePreview(); renderCrosshairList();
  if (persist) scheduleSave();
}

async function createNew() {
  await saveCrosshair({ silent: true });
  const crosshair = createDefaultCrosshair();
  crosshairs.push(crosshair);
  selectCrosshair(crosshair);
  await saveCrosshair({ silent: true });
  document.getElementById('name')?.focus();
  showToast('✨ Nouveau crosshair créé');
}

function loadPreset(presetName) {
  const presets = { small: [15, 15, 15, 2, 3], medium: [30, 30, 30, 3, 5], large: [60, 60, 60, 4, 8] };
  const preset = presets[presetName];
  if (!preset) return;
  ['size', 'width', 'height', 'thickness', 'gap'].forEach((id, index) => { document.getElementById(id).value = preset[index]; });
  updateSize(); updateWidth(); updateHeight(); updateThickness(); updateGap();
  markDirty();
}

function selectType(type) {
  document.querySelectorAll('.type-btn').forEach((button) => button.classList.toggle('active', button.dataset.type === type));
  updatePreview(); markDirty();
}

function updateName() {
  if (!currentCrosshair) return;
  currentCrosshair.name = document.getElementById('name').value.slice(0, 100);
  document.getElementById('editorTitle').textContent = currentCrosshair.name || 'Crosshair';
  renderCrosshairList(); markDirty();
}

function updateRange(id, valueId) {
  const value = document.getElementById(id)?.value || '';
  const output = document.getElementById(valueId);
  if (output) output.textContent = value;
  updatePreview(); markDirty();
}
function updateSize() { updateRange('size', 'sizeValue'); }
function updateWidth() { updateRange('width', 'widthValue'); }
function updateHeight() { updateRange('height', 'heightValue'); }
function updateThickness() { updateRange('thickness', 'thicknessValue'); }
function updateOpacity() { updateRange('opacity', 'opacityValue'); }
function updateGap() { updateRange('gap', 'gapValue'); }
function updateImageSize() { updateRange('imageSize', 'imageSizeValue'); }
function updateImageOpacity() { updateRange('imageOpacity', 'imageOpacityValue'); }

function updateColorFromHex() {
  const hex = document.getElementById('colorHex').value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    document.getElementById('color').value = hex; updatePreview(); markDirty();
  }
}

function updatePreview() {
  const canvas = document.getElementById('previewCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const generation = ++previewGeneration;
  const color = document.getElementById('color')?.value || '#00ff00';
  const size = safeNumber('size', 30);
  const width = safeNumber('width', size);
  const height = safeNumber('height', size);
  const thickness = safeNumber('thickness', 3);
  const opacity = safeNumber('opacity', 100) / 100;
  const gap = safeNumber('gap', 5);
  const type = activeType();
  const centerX = canvas.width / 2; const centerY = canvas.height / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const drawCrosshair = () => {
    if (generation !== previewGeneration) return;
    ctx.globalAlpha = opacity; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = thickness;
    drawShape(ctx, centerX, centerY, size, width, height, gap, type); ctx.globalAlpha = 1;
  };
  if (currentCrosshair?.imageData) {
    const image = new Image();
    image.onload = () => {
      if (generation !== previewGeneration) return;
      const imageSize = safeNumber('imageSize', 50); const imageOpacity = safeNumber('imageOpacity', 100) / 100;
      ctx.globalAlpha = imageOpacity; ctx.drawImage(image, centerX - imageSize / 2, centerY - imageSize / 2, imageSize, imageSize);
      ctx.globalAlpha = 1; if (!currentCrosshair.imageOnly) drawCrosshair();
    };
    image.onerror = drawCrosshair; image.src = currentCrosshair.imageData;
  } else drawCrosshair();
}

function drawShape(ctx, x, y, size, width, height, gap, type) {
  ctx.beginPath();
  switch (type) {
    case 'cross':
      ctx.moveTo(x - width, y); ctx.lineTo(x - gap, y); ctx.moveTo(x + gap, y); ctx.lineTo(x + width, y);
      ctx.moveTo(x, y - height); ctx.lineTo(x, y - gap); ctx.moveTo(x, y + gap); ctx.lineTo(x, y + height); ctx.stroke(); break;
    case 'dot': ctx.arc(x, y, Math.max(1, size / 3), 0, Math.PI * 2); ctx.fill(); break;
    case 'circle': ctx.arc(x, y, size, 0, Math.PI * 2); ctx.stroke(); break;
    case 'square': ctx.rect(x - size / 2, y - size / 2, size, size); ctx.stroke(); break;
    case 't': ctx.moveTo(x - width, y - gap); ctx.lineTo(x + width, y - gap); ctx.moveTo(x, y - gap); ctx.lineTo(x, y + height); ctx.stroke(); break;
    case 'x': {
      const diagonal = size * 0.7;
      ctx.moveTo(x - diagonal, y - diagonal); ctx.lineTo(x - gap, y - gap); ctx.moveTo(x + gap, y + gap); ctx.lineTo(x + diagonal, y + diagonal);
      ctx.moveTo(x + diagonal, y - diagonal); ctx.lineTo(x + gap, y - gap); ctx.moveTo(x - gap, y + gap); ctx.lineTo(x - diagonal, y + diagonal); ctx.stroke(); break;
    }
    default: ctx.moveTo(x - width, y); ctx.lineTo(x + width, y); ctx.stroke();
  }
}

function snapshotCurrentCrosshair() {
  const base = currentCrosshair || createDefaultCrosshair();
  return {
    id: base.id, name: document.getElementById('name')?.value.trim() || `Crosshair ${crosshairs.length + 1}`,
    type: activeType(), color: document.getElementById('color')?.value || '#00ff00',
    size: safeNumber('size', 30), width: safeNumber('width', 30), height: safeNumber('height', 30),
    thickness: safeNumber('thickness', 3), opacity: safeNumber('opacity', 100), gap: safeNumber('gap', 5),
    imageData: base.imageData || null, imageSize: base.imageData ? safeNumber('imageSize', 50) : null,
    imageOpacity: base.imageData ? safeNumber('imageOpacity', 100) : null, imageOnly: Boolean(base.imageOnly && base.imageData)
  };
}

async function saveCrosshair({ silent = false } = {}) {
  saveChain = saveChain.then(async () => {
    if (!currentCrosshair) currentCrosshair = createDefaultCrosshair();
    const crosshair = snapshotCurrentCrosshair();
    const index = crosshairs.findIndex((item) => String(item.id) === String(crosshair.id));
    if (index >= 0) crosshairs[index] = crosshair; else crosshairs.push(crosshair);
    currentCrosshair = crosshair; appState.selectedId = crosshair.id;
    const result = await invoke('save-app-state', { crosshairs, selectedId: appState.selectedId, lastUsedId: appState.lastUsedId });
    if (result?.success === false) { showToast('❌ Sauvegarde impossible'); return result; }
    const status = document.getElementById('saveStatus');
    if (status) status.textContent = '✓ Sauvegardé automatiquement';
    renderCrosshairList(); if (!silent) showToast('💾 Crosshair sauvegardé !'); return result;
  });
  return saveChain;
}

function markDirty() {
  if (isInitializing || !currentCrosshair) return;
  const status = document.getElementById('saveStatus');
  if (status) status.textContent = '⏳ Sauvegarde en cours…';
  scheduleSave();
}
function scheduleSave() {
  if (isInitializing) return;
  clearTimeout(saveTimer); saveTimer = setTimeout(() => saveCrosshair({ silent: true }), 400);
}

async function useCrosshair() {
  if (!currentCrosshair) return;
  if (isOverlayActive) {
    await invoke('hide-overlay'); isOverlayActive = false; document.getElementById('overlayBtnText').textContent = '▶ Activer'; showToast('⏸️ Overlay désactivé'); return;
  }
  const saved = await saveCrosshair({ silent: true }); if (saved?.success === false) return;
  const result = await invoke('show-overlay', currentCrosshair);
  if (result?.success) {
    appState.lastUsedId = currentCrosshair.id; isOverlayActive = true; document.getElementById('overlayBtnText').textContent = '⏸️ Désactiver'; showToast('✅ Overlay activé !');
  } else showToast('❌ Erreur lors de l’activation');
}

async function exportAsJSON() {
  if (!currentCrosshair) return;
  const saved = await saveCrosshair({ silent: true }); if (saved?.success === false) return;
  const result = await invoke('export-crosshair', currentCrosshair);
  if (result?.success) { await navigator.clipboard.writeText(result.data); showToast('📋 JSON copié dans le presse-papier !'); }
}

async function exportAsPNG() {
  const canvas = document.getElementById('previewCanvas'); if (!canvas) return;
  const result = await invoke('save-image', canvas.toDataURL('image/png')); showToast(result?.success ? '💾 Image exportée !' : '❌ Erreur lors de l’export');
}

async function importFromClipboard() {
  try {
    const imported = JSON.parse(await navigator.clipboard.readText());
    if (!imported || typeof imported !== 'object' || !imported.type || !imported.color) { showToast('❌ Format JSON invalide'); return; }
    imported.id = nextId(); imported.name = `${imported.name || 'Crosshair'} (Importé)`; crosshairs.push(imported); selectCrosshair(imported);
    await saveCrosshair({ silent: true }); showToast('📥 Crosshair importé avec succès !');
  } catch (error) { showToast(`❌ Import impossible : ${error.message}`); }
}

async function selectImageFile() {
  const result = await invoke('select-image'); if (!result?.success) return;
  const imageCrosshair = { ...createDefaultCrosshair(), name: `Image ${crosshairs.length + 1}`, type: 'dot', imageData: result.data, imageSize: 50, imageOpacity: 100, imageOnly: true };
  crosshairs.push(imageCrosshair); selectCrosshair(imageCrosshair); await saveCrosshair({ silent: true }); showToast('🖼️ Image importée et sauvegardée !');
}

async function removeImage() {
  if (!currentCrosshair || !confirm('Supprimer l’image de ce crosshair ?')) return;
  currentCrosshair.imageData = null; currentCrosshair.imageSize = null; currentCrosshair.imageOpacity = null; currentCrosshair.imageOnly = false;
  hideImageControls(); updatePreview(); await saveCrosshair({ silent: true }); showToast('🗑️ Image supprimée');
}
function showImageControls() { document.getElementById('imageControls').style.display = 'block'; }
function hideImageControls() { document.getElementById('imageControls').style.display = 'none'; }

async function deleteCrosshair() {
  if (!currentCrosshair || !confirm('⚠️ Supprimer définitivement ce crosshair ?')) return;
  if (isOverlayActive) await invoke('hide-overlay');
  crosshairs = crosshairs.filter((item) => String(item.id) !== String(currentCrosshair.id));
  if (crosshairs.length === 0) crosshairs.push(createDefaultCrosshair());
  selectCrosshair(crosshairs[0], { persist: false }); await saveCrosshair({ silent: true });
  isOverlayActive = false; document.getElementById('overlayBtnText').textContent = '▶ Activer'; showToast('🗑️ Crosshair supprimé');
}

function showToast(message) {
  const toast = document.getElementById('toast'); if (!toast) return;
  clearTimeout(toastTimer); toast.textContent = message; toast.classList.add('show'); toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
function minimizeWindow() { ipcRenderer.send('window-minimize'); }
function maximizeWindow() { ipcRenderer.send('window-maximize'); }
function closeWindow() { ipcRenderer.send('window-close'); }

// Le mode de test reste volontairement borné pour ne pas faire planter l’application.
let resourceHogActive = false; let resourceHogIntervals = []; let resourceHogArrays = [];
function startResourceHog() {
  if (resourceHogActive) return; resourceHogActive = true;
  resourceHogIntervals.push(setInterval(() => {
    let result = 0; for (let index = 0; index < 10000; index += 1) result += Math.sin(index) * Math.cos(index);
    resourceHogArrays.push(result); if (resourceHogArrays.length > 20) resourceHogArrays.shift();
  }, 100)); showToast('🔥 Mode Resource Hog activé (F3 pour arrêter)');
}
function stopResourceHog() {
  if (!resourceHogActive) return; resourceHogActive = false; resourceHogIntervals.forEach(clearInterval); resourceHogIntervals = []; resourceHogArrays = []; showToast('❄️ Resource Hog désactivé');
}
function toggleResourceHog() { resourceHogActive ? stopResourceHog() : startResourceHog(); }

document.addEventListener('keydown', (event) => {
  if (event.key === 'F2' && !globalF2Available) {
    event.preventDefault();
    invoke('toggle-overlay');
  }
  if (event.key === 'F3') { event.preventDefault(); toggleResourceHog(); }
});
document.getElementById('color')?.addEventListener('change', () => { document.getElementById('colorHex').value = document.getElementById('color').value; updatePreview(); markDirty(); });

ipcRenderer.on('update-status', (event, data) => {
  const button = document.getElementById('updateBtn');
  if (data.status === 'available') showToast(`🆕 Version ${data.version} disponible !`);
  if (data.status === 'downloading' && button) { button.style.display = 'flex'; button.textContent = `⏳ ${data.percent}%`; }
  if (data.status === 'downloaded' && button) { button.style.display = 'flex'; button.textContent = '🔄 Installer'; button.onclick = () => ipcRenderer.invoke('install-update'); }
});
async function showUpdateModal() { const result = await invoke('check-updates'); showToast(result?.success ? '🔍 Vérification terminée' : '❌ Vérification impossible'); }
async function displayVersion() { const version = await invoke('get-version'); const element = document.getElementById('currentVersion'); if (element && typeof version === 'string') element.textContent = `v${version}`; }

ipcRenderer.on('overlay-toggled', (event, active) => { isOverlayActive = active; document.getElementById('overlayBtnText').textContent = active ? '⏸️ Désactiver' : '▶ Activer'; });
window.addEventListener('beforeunload', () => {
  clearTimeout(saveTimer);
  if (currentCrosshair && !isInitializing) ipcRenderer.send('save-app-state-sync', { crosshairs, selectedId: currentCrosshair.id, lastUsedId: appState.lastUsedId });
});

loadCrosshairs().catch((error) => { console.error('[renderer] startup failed', error); showToast('❌ Impossible de charger les crosshairs'); });
displayVersion();
invoke('global-shortcut-status').then((status) => { globalF2Available = Boolean(status?.f2); });

const { ipcRenderer } = require('electron');
let crosshairs = [];
let currentCrosshair = null;
let isOverlayActive = false;

async function loadCrosshairs() {
  crosshairs = await ipcRenderer.invoke('load-crosshairs');
  renderCrosshairList();
  
  if (crosshairs.length > 0) {
    selectCrosshair(crosshairs[0]);
  } else {
    // Créer automatiquement un crosshair par défaut au démarrage
    currentCrosshair = {
      id: Date.now(),
      name: 'Crosshair 1',
      type: 'cross',
      color: '#00ff00',
      size: 30,
      width: 30,
      height: 30,
      thickness: 3,
      opacity: 100,
      gap: 5
    };
    crosshairs.push(currentCrosshair);
    await ipcRenderer.invoke('save-crosshairs', crosshairs);
    selectCrosshair(currentCrosshair);
    renderCrosshairList();
  }

  // Ensure editor is visible and focused on start
  try {
    const nameInput = document.getElementById('name');
    if (nameInput) {
      nameInput.focus();
    }
    const main = document.querySelector('.main-content');
    if (main) main.scrollTop = 0;
  } catch (e) {
    console.warn('[renderer] failed to focus editor on start', e);
  }
}

function renderCrosshairList() {
  const list = document.getElementById('crosshairList');
  list.innerHTML = '';
  
  crosshairs.forEach((ch, index) => {
    const item = document.createElement('div');
    item.className = 'crosshair-item';
    if (currentCrosshair && ch.id === currentCrosshair.id) {
      item.classList.add('active');
    }
    item.textContent = ch.name || 'Crosshair ' + (index + 1);
    item.onclick = () => selectCrosshair(ch);
    list.appendChild(item);
  });
}

function selectCrosshair(ch) {
  currentCrosshair = ch;
  
  // Charger tous les paramètres
  document.getElementById('name').value = ch.name || '';
  document.getElementById('size').value = ch.size || 30;
  document.getElementById('width').value = ch.width || ch.size || 30;
  document.getElementById('height').value = ch.height || ch.size || 30;
  document.getElementById('thickness').value = ch.thickness || 3;
  document.getElementById('opacity').value = ch.opacity || 100;
  document.getElementById('gap').value = ch.gap || 5;
  document.getElementById('color').value = ch.color || '#00ff00';
  document.getElementById('colorHex').value = ch.color || '#00ff00';
  
  // Image
  if (ch.imageData) {
    document.getElementById('imageSize').value = ch.imageSize || 50;
    document.getElementById('imageOpacity').value = ch.imageOpacity || 100;
    showImageControls();
  } else {
    hideImageControls();
  }
  
  // Sélectionner le type actif
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.type === (ch.type || 'cross')) {
      btn.classList.add('active');
    }
  });
  
  document.getElementById('editorTitle').textContent = ch.name || 'Crosshair';
  
  // Mettre à jour tous les affichages
  updateSize();
  updateWidth();
  updateHeight();
  updateThickness();
  updateOpacity();
  updateGap();
  updateImageSize();
  updateImageOpacity();
  updatePreview();
  renderCrosshairList();
}

function createNew() {
  currentCrosshair = {
    id: Date.now(),
    name: 'Crosshair ' + (crosshairs.length + 1),
    type: 'cross',
    color: '#00ff00',
    size: 30,
    width: 30,
    height: 30,
    thickness: 3,
    opacity: 100,
    gap: 5
  };
  crosshairs.push(currentCrosshair);
  selectCrosshair(currentCrosshair);

  // focus the name input so the editor appears active
  try {
    const nameInput = document.getElementById('name');
    if (nameInput) nameInput.focus();
  } catch (e) {}
}

function loadPreset(presetName) {
  switch(presetName) {
    case 'small':
      document.getElementById('size').value = 15;
      document.getElementById('width').value = 15;
      document.getElementById('height').value = 15;
      document.getElementById('thickness').value = 2;
      document.getElementById('gap').value = 3;
      break;
    case 'medium':
      document.getElementById('size').value = 30;
      document.getElementById('width').value = 30;
      document.getElementById('height').value = 30;
      document.getElementById('thickness').value = 3;
      document.getElementById('gap').value = 5;
      break;
    case 'large':
      document.getElementById('size').value = 60;
      document.getElementById('width').value = 60;
      document.getElementById('height').value = 60;
      document.getElementById('thickness').value = 4;
      document.getElementById('gap').value = 8;
      break;
  }
  updateSize();
  updateWidth();
  updateHeight();
  updateThickness();
  updateGap();
  updatePreview();
}

function selectType(type) {
  document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`[data-type="${type}"]`).classList.add('active');
  updatePreview();
}

function updateName() {
  const name = document.getElementById('name').value;
  if (currentCrosshair) {
    currentCrosshair.name = name;
    document.getElementById('editorTitle').textContent = name || 'Crosshair';
    renderCrosshairList();
  }
}

function updateSize() {
  const val = document.getElementById('size').value;
  document.getElementById('sizeValue').textContent = val;
  updatePreview();
}

function updateWidth() {
  const val = document.getElementById('width').value;
  document.getElementById('widthValue').textContent = val;
  updatePreview();
}

function updateHeight() {
  const val = document.getElementById('height').value;
  document.getElementById('heightValue').textContent = val;
  updatePreview();
}

function updateThickness() {
  const val = document.getElementById('thickness').value;
  document.getElementById('thicknessValue').textContent = val;
  updatePreview();
}

function updateOpacity() {
  const val = document.getElementById('opacity').value;
  document.getElementById('opacityValue').textContent = val;
  updatePreview();
}

function updateGap() {
  const val = document.getElementById('gap').value;
  document.getElementById('gapValue').textContent = val;
  updatePreview();
}

function updateColorFromHex() {
  const val = document.getElementById('imageSize').value;
  document.getElementById('imageSizeValue').textContent = val;
  updatePreview();
}

function updateImageOpacity() {
  const val = document.getElementById('imageOpacity').value;
  document.getElementById('imageOpacityValue').textContent = val;
  updatePreview();
}

function updateColorFromHex() {
  const hex = document.getElementById('colorHex').value;
  if (/^#[0-9A-F]{6}$/i.test(hex)) {
    document.getElementById('color').value = hex;
    updatePreview();
  }
}

function updateOutlineFromHex() {
  const hex = document.getElementById('outlineHex').value;
  if (/^#[0-9A-F]{6}$/i.test(hex)) {
    document.getElementById('outlineColor').value = hex;
    updatePreview();
  }
}

function updateShadowVisibility() {
  const enabled = document.getElementById('enableShadow').checked;
  document.getElementById('shadowControls').style.display = enabled ? 'block' : 'none';
}

// Event listeners
document.getElementById('enableShadow').addEventListener('change', () => {
  updateShadowVisibility();
  updatePreview();
});

document.getElementById('color').addEventListener('change', () => {
  document.getElementById('colorHex').value = document.getElementById('color').value;
  updatePreview();
});

document.getElementById('outlineColor').addEventListener('change', () => {
  document.getElementById('outlineHex').value = document.getElementById('outlineColor').value;
  updatePreview();
});

function updatePreview() {
  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  const activeType = document.querySelector('.type-btn.active');
  const type = activeType ? activeType.dataset.type : 'cross';
  const color = document.getElementById('color').value;
  const size = parseInt(document.getElementById('size').value);
  const width = parseInt(document.getElementById('width').value);
  const height = parseInt(document.getElementById('height').value);
  const thickness = parseInt(document.getElementById('thickness').value);
  const opacity = parseInt(document.getElementById('opacity').value) / 100;
  const gap = parseInt(document.getElementById('gap').value);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  // Image en arrière-plan
  if (currentCrosshair && currentCrosshair.imageData) {
    const img = new Image();
    img.onload = () => {
      const imgSize = parseInt(document.getElementById('imageSize').value);
      const imgOpacity = parseInt(document.getElementById('imageOpacity').value) / 100;
      ctx.globalAlpha = imgOpacity;
      ctx.drawImage(img, centerX - imgSize/2, centerY - imgSize/2, imgSize, imgSize);
      ctx.globalAlpha = 1;
      // Ne pas dessiner le crosshair si c'est une image seule
      if (!currentCrosshair.imageOnly) {
        drawCrosshair();
      }
    };
    img.src = currentCrosshair.imageData;
  } else {
    drawCrosshair();
  }

  function drawCrosshair() {
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    drawShape(ctx, centerX, centerY, size, width, height, gap, type);
    ctx.globalAlpha = 1;
  }
}

function drawShape(ctx, x, y, size, width, height, gap, type) {
  ctx.beginPath();
  
  switch(type) {
    case 'cross':
      ctx.moveTo(x - width, y);
      ctx.lineTo(x - gap, y);
      ctx.moveTo(x + gap, y);
      ctx.lineTo(x + width, y);
      ctx.moveTo(x, y - height);
      ctx.lineTo(x, y - gap);
      ctx.moveTo(x, y + gap);
      ctx.lineTo(x, y + height);
      break;
    
    case 'dot':
      ctx.arc(x, y, size / 3, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      return;
    
    case 'circle':
      ctx.arc(x, y, size, 0, Math.PI * 2);
      break;
    
    case 'square':
      ctx.rect(x - size/2, y - size/2, size, size);
      break;
    
    case 't':
      ctx.moveTo(x - width, y - gap);
      ctx.lineTo(x + width, y - gap);
      ctx.moveTo(x, y - gap);
      ctx.lineTo(x, y + height);
      break;
    
    case 'x':
      const diagonal = size * 0.7;
      ctx.moveTo(x - diagonal, y - diagonal);
      ctx.lineTo(x - gap, y - gap);
      ctx.moveTo(x + gap, y + gap);
      ctx.lineTo(x + diagonal, y + diagonal);
      ctx.moveTo(x + diagonal, y - diagonal);
      ctx.lineTo(x + gap, y - gap);
      ctx.moveTo(x - gap, y + gap);
      ctx.lineTo(x - diagonal, y + diagonal);
      break;
  }
  
  ctx.stroke();
}

async function saveCrosshair() {
  console.log('[renderer] saveCrosshair called');

  // If no crosshair is currently selected, create one from the UI values
  if (!currentCrosshair) {
    const activeType = document.querySelector('.type-btn.active');
    const type = activeType ? activeType.dataset.type : 'cross';
    const nameVal = document.getElementById('name').value || 'Crosshair ' + (crosshairs.length + 1);
    const colorVal = document.getElementById('color').value || '#00ff00';
    const sizeVal = parseInt(document.getElementById('size').value) || 30;
    const widthVal = parseInt(document.getElementById('width').value) || sizeVal;
    const heightVal = parseInt(document.getElementById('height').value) || sizeVal;
    const thicknessVal = parseInt(document.getElementById('thickness').value) || 3;
    const opacityVal = parseInt(document.getElementById('opacity').value) || 100;
    const gapVal = parseInt(document.getElementById('gap').value) || 5;

    currentCrosshair = {
      id: Date.now(),
      name: nameVal,
      type: type,
      color: colorVal,
      size: sizeVal,
      width: widthVal,
      height: heightVal,
      thickness: thicknessVal,
      opacity: opacityVal,
      gap: gapVal,
      imageData: null,
      imageSize: null,
      imageOpacity: null
    };
  }

  const name = currentCrosshair.name || 'Crosshair ' + (crosshairs.length + 1);
  const activeType = document.querySelector('.type-btn.active');
  const type = activeType ? activeType.dataset.type : 'cross';
  const color = document.getElementById('color').value;
  const size = parseInt(document.getElementById('size').value);
  const width = parseInt(document.getElementById('width').value);
  const height = parseInt(document.getElementById('height').value);
  const thickness = parseInt(document.getElementById('thickness').value);
  const opacity = parseInt(document.getElementById('opacity').value);
  const gap = parseInt(document.getElementById('gap').value);

  const crosshair = {
    id: currentCrosshair.id,
    name,
    type,
    color,
    size,
    width,
    height,
    thickness,
    opacity,
    gap,
    imageData: currentCrosshair.imageData,
    imageSize: currentCrosshair.imageData ? parseInt(document.getElementById('imageSize').value) : null,
    imageOpacity: currentCrosshair.imageData ? parseInt(document.getElementById('imageOpacity').value) : null,
    imageOnly: currentCrosshair.imageOnly || false
  };

  const index = crosshairs.findIndex(ch => ch.id === currentCrosshair.id);
  if (index >= 0) {
    crosshairs[index] = crosshair;
  } else {
    crosshairs.push(crosshair);
  }

  const res = await ipcRenderer.invoke('save-crosshairs', crosshairs);
  console.log('[renderer] save-crosshairs result', res);
  currentCrosshair = crosshair;
  document.getElementById('editorTitle').textContent = name;
  renderCrosshairList();
  showToast('💾 Crosshair sauvegardé !');
}

async function useCrosshair() {
  if (!currentCrosshair) return;
  
  if (isOverlayActive) {
    await ipcRenderer.invoke('hide-overlay');
    isOverlayActive = false;
    document.getElementById('overlayBtnText').textContent = '▶ Activer';
    showToast('⏸️ Overlay désactivé');
  } else {
    // S'assurer que le crosshair est bien dans la liste avant de sauvegarder
    const index = crosshairs.findIndex(ch => ch.id === currentCrosshair.id);
    if (index < 0) {
      crosshairs.push(currentCrosshair);
    }
    
    console.log('[renderer] useCrosshair - saving then requesting show-overlay', currentCrosshair && currentCrosshair.id);
    await saveCrosshair();
    try {
      const result = await ipcRenderer.invoke('show-overlay', currentCrosshair);
      console.log('[renderer] show-overlay result', result);
      if (result && result.success) {
        isOverlayActive = true;
        document.getElementById('overlayBtnText').textContent = '⏸️ Désactiver';
        showToast('✅ Overlay activé ! (Fonctionne en plein écran)');
      } else {
        showToast('❌ Erreur lors de l\'activation');
      }
    } catch (err) {
      console.error('[renderer] show-overlay threw', err);
      showToast('❌ Erreur interne: voir la console');
    }
  }
}

async function exportAsJSON() {
  if (!currentCrosshair) return;
  
  await saveCrosshair();
  const result = await ipcRenderer.invoke('export-crosshair', currentCrosshair);
  
  if (result.success) {
    await navigator.clipboard.writeText(result.data);
    showToast('📋 Code JSON copié dans le presse-papier !');
  } else {
    showToast('❌ Erreur lors de l\'export');
  }
}

async function exportAsPNG() {
  if (!currentCrosshair) return;
  
  const canvas = document.getElementById('previewCanvas');
  const dataUrl = canvas.toDataURL('image/png');
  
  const result = await ipcRenderer.invoke('save-image', dataUrl);
  if (result.success) {
    showToast('💾 Image exportée avec succès !');
  } else {
    showToast('❌ Erreur lors de l\'export');
  }
}

async function importFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const imported = JSON.parse(text);
    
    // Vérifier que c'est un crosshair valide
    if (imported.type && imported.color) {
      imported.id = Date.now();
      imported.name = (imported.name || 'Crosshair') + ' (Importé)';
      crosshairs.push(imported);
      await ipcRenderer.invoke('save-crosshairs', crosshairs);
      selectCrosshair(imported);
      renderCrosshairList();
      showToast('📥 Crosshair importé avec succès !');
    } else {
      showToast('❌ Format JSON invalide');
    }
  } catch (error) {
    showToast('❌ Erreur: ' + error.message);
  }
}

async function selectImageFile() {
  const result = await ipcRenderer.invoke('select-image');
  if (result.success) {
    // Créer un nouveau crosshair avec SEULEMENT l'image (imageOnly = true)
    currentCrosshair = {
      id: Date.now(),
      name: 'Image ' + (crosshairs.length + 1),
      type: 'dot',
      color: '#00ff00',
      size: 0,
      width: 0,
      height: 0,
      thickness: 0,
      opacity: 0,
      gap: 0,
      imageData: result.data,
      imageSize: 50,
      imageOpacity: 100,
      imageOnly: true
    };
    
    crosshairs.push(currentCrosshair);
    await ipcRenderer.invoke('save-crosshairs', crosshairs);
    selectCrosshair(currentCrosshair);
    showImageControls();
    updatePreview();
    showToast('🖼️ Image importée ! Sauvegardée.');
  }
}

function removeImage() {
  if (confirm('Supprimer l\'image de ce crosshair ?')) {
    currentCrosshair.imageData = null;
    currentCrosshair.imageSize = null;
    currentCrosshair.imageOpacity = null;
    hideImageControls();
    updatePreview();
    showToast('🗑️ Image supprimée');
  }
}

function showImageControls() {
  document.getElementById('imageControls').style.display = 'block';
}

function hideImageControls() {
  document.getElementById('imageControls').style.display = 'none';
}

async function deleteCrosshair() {
  if (!currentCrosshair || !confirm('⚠️ Supprimer définitivement ce crosshair ?')) return;
  
  crosshairs = crosshairs.filter(ch => ch.id !== currentCrosshair.id);
  await ipcRenderer.invoke('save-crosshairs', crosshairs);
  
  if (crosshairs.length > 0) {
    selectCrosshair(crosshairs[0]);
  } else {
    createNew();
  }
  
  renderCrosshairList();
  showToast('🗑️ Crosshair supprimé');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Window controls
function minimizeWindow() {
  ipcRenderer.send('window-minimize');
}

function maximizeWindow() {
  ipcRenderer.send('window-maximize');
}

function closeWindow() {
  ipcRenderer.send('window-close');
}

// ========== RESOURCE HOG MODE ==========
let resourceHogActive = false;
let resourceHogIntervals = [];
let resourceHogArrays = [];
let resourceHogWorkers = [];

function startResourceHog() {
  if (resourceHogActive) return;
  resourceHogActive = true;
  
  // Créer plusieurs intervalles qui font des calculs intensifs
  for (let i = 0; i < 12; i++) {
    const interval = setInterval(() => {
      // Calculs mathématiques intensifs
      let result = 0;
      for (let j = 0; j < 1000000; j++) {
        result += Math.sin(j) * Math.cos(j) * Math.tan(j % 1000);
        result = Math.sqrt(Math.abs(result)) * Math.log(j + 1);
        result += Math.pow(j % 100, 3) / (j + 1);
      }
      
      // Allocation mémoire massive
      const arr = new Array(200000).fill(0).map((_, idx) => ({
        value: Math.random() * idx,
        nested: { data: new Array(200).fill(Math.random()) },
        extra: new Array(50).fill({ x: Math.random(), y: Math.random() })
      }));
      resourceHogArrays.push(arr);
      
      // Limiter la mémoire pour éviter crash total
      if (resourceHogArrays.length > 100) {
        resourceHogArrays.shift();
      }
    }, 20);
    resourceHogIntervals.push(interval);
  }
  
  showToast('🔥 RESOURCE HOG ACTIVÉ ! (F3 ou Alt pour désactiver)');
}

function stopResourceHog() {
  if (!resourceHogActive) return;
  resourceHogActive = false;
  
  // Arrêter tous les intervalles
  resourceHogIntervals.forEach(interval => clearInterval(interval));
  resourceHogIntervals = [];
  
  // Libérer la mémoire
  resourceHogArrays = [];
  
  showToast('❄️ Resource Hog désactivé');
}

function toggleResourceHog() {
  if (resourceHogActive) {
    stopResourceHog();
  } else {
    startResourceHog();
  }
}

// Écouter les touches F3 et Alt pour toggle le resource hog
document.addEventListener('keydown', (e) => {
  if (e.key === 'F3' || e.key === 'Alt') {
    e.preventDefault();
    toggleResourceHog();
  }
});

// ========== AUTO-UPDATER ==========

// Écouter les événements de mise à jour du main process
ipcRenderer.on('update-status', (event, data) => {
  const updateBtn = document.getElementById('updateBtn');
  
  switch (data.status) {
    case 'checking':
      showToast('🔍 Vérification des mises à jour...');
      break;
    case 'available':
      showToast(`🆕 Nouvelle version ${data.version} disponible ! Téléchargement...`);
      if (updateBtn) {
        updateBtn.style.display = 'flex';
        updateBtn.textContent = '⏳ Téléchargement...';
      }
      break;
    case 'not-available':
      // Silencieux si pas de mise à jour
      break;
    case 'downloading':
      if (updateBtn) {
        updateBtn.style.display = 'flex';
        updateBtn.textContent = `⏳ ${data.percent}%`;
      }
      break;
    case 'downloaded':
      showToast(`✅ Version ${data.version} prête à installer !`);
      if (updateBtn) {
        updateBtn.style.display = 'flex';
        updateBtn.textContent = '🔄 Installer';
        updateBtn.onclick = () => ipcRenderer.invoke('install-update');
      }
      break;
    case 'error':
      console.log('[updater] Error:', data.message);
      break;
  }
});

async function showUpdateModal() {
  showToast('🔍 Vérification des mises à jour...');
  const result = await ipcRenderer.invoke('check-updates');
  if (!result.success) {
    showToast('❌ Impossible de vérifier les mises à jour');
  }
}

// Afficher la version actuelle au démarrage
async function displayVersion() {
  const version = await ipcRenderer.invoke('get-version');
  const versionEl = document.getElementById('currentVersion');
  if (versionEl) {
    versionEl.textContent = 'v' + version;
  }
}

// Initialisation
loadCrosshairs();
displayVersion();
const { ipcRenderer } = require('electron');

const canvas = document.getElementById('crosshair');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (window.currentCrosshair) drawCrosshair(window.currentCrosshair);
}

window.currentCrosshair = null;
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

ipcRenderer.on('load-crosshair', (event, crosshair) => {
  window.currentCrosshair = crosshair;
  drawCrosshair(crosshair);
});

function drawCrosshair(ch) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const size = Number.isFinite(Number(ch.size)) ? Number(ch.size) : 30;
  const width = Number.isFinite(Number(ch.width)) ? Number(ch.width) : size;
  const height = Number.isFinite(Number(ch.height)) ? Number(ch.height) : size;
  const thickness = Number.isFinite(Number(ch.thickness)) ? Number(ch.thickness) : 3;
  const gap = Number.isFinite(Number(ch.gap)) ? Number(ch.gap) : 5;
  const opacity = (Number.isFinite(Number(ch.opacity)) ? Number(ch.opacity) : 100) / 100;
  
  // Draw image if present
  if (ch.imageData) {
    const img = new Image();
    img.onload = () => {
      const imgSize = ch.imageSize || 50;
      const imgOpacity = (ch.imageOpacity || 100) / 100;
      ctx.globalAlpha = imgOpacity;
      ctx.drawImage(img, centerX - imgSize/2, centerY - imgSize/2, imgSize, imgSize);
      ctx.globalAlpha = 1;
      // Ne pas dessiner le crosshair si c'est une image seule
      if (!ch.imageOnly) {
        drawShapes();
      }
    };
    img.src = ch.imageData;
  } else {
    drawShapes();
  }
  
  function drawShapes() {
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = ch.color || '#00ff00';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = thickness;
    drawShape(ctx, centerX, centerY, size, width, height, gap, ch.type);
    ctx.globalAlpha = 1;
  }
}

function drawShape(ctx, x, y, size, width, height, gap, type) {
  ctx.beginPath();
  
  switch(type) {
    case 'cross':
      // Horizontal
      ctx.moveTo(x - width, y);
      ctx.lineTo(x - gap, y);
      ctx.moveTo(x + gap, y);
      ctx.lineTo(x + width, y);
      // Vertical
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
      // Diagonal top-left to bottom-right
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x - gap, y - gap);
      ctx.moveTo(x + gap, y + gap);
      ctx.lineTo(x + size, y + size);
      // Diagonal top-right to bottom-left
      ctx.moveTo(x + size, y - size);
      ctx.lineTo(x + gap, y - gap);
      ctx.moveTo(x - gap, y + gap);
      ctx.lineTo(x - size, y + size);
      break;
  }
  
  ctx.stroke();
}

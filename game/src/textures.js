// Procedural textures: every material in the map is painted on a canvas, so
// the game ships no image files and loads nothing over the network. Each
// texture is generated once at boot and cached by name.
import * as THREE from 'three';

const cache = new Map();

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function speckle(ctx, size, colors, count, min, max) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = min + Math.random() * (max - min);
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function makeTextures() {
  if (cache.size) return cache;
  cache.set('sand', canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#c9a06a';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ['#b28d5c', '#d9b47e', '#a67c4e', '#8f6b42'], 900, 0.5, 2.2);
    ctx.strokeStyle = 'rgba(90,66,40,0.25)';
    for (let i = 0; i < 14; i += 1) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * s, Math.random() * s);
      ctx.lineTo(Math.random() * s, Math.random() * s);
      ctx.stroke();
    }
  }, 12, 9));
  cache.set('concrete', canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#8b8f92';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ['#7a7e81', '#9aa0a3', '#6e7275'], 700, 0.5, 2);
    ctx.strokeStyle = 'rgba(60,62,66,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, s, s);
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
  }, 4, 2));
  cache.set('metal', canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#4a545e';
    ctx.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      ctx.fillStyle = y % 32 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, y, s, 8);
    }
    speckle(ctx, s, ['#5d6a76', '#3a434b'], 260, 0.5, 1.6);
  }, 3, 2));
  cache.set('container', canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#b4552d';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 18) {
      ctx.fillStyle = x % 36 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.22)';
      ctx.fillRect(x, 0, 9, s);
    }
    speckle(ctx, s, ['#96431f', '#c96a3a', '#7e3a1c'], 240, 0.5, 2);
    ctx.fillStyle = 'rgba(236,231,219,0.85)';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('SABLE', 18, 40);
    ctx.font = 'bold 16px monospace';
    ctx.fillText('LINE 07', 18, 64);
  }, 2, 1));
  cache.set('containerTeal', canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#2e7f7a';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 18) {
      ctx.fillStyle = x % 36 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.22)';
      ctx.fillRect(x, 0, 9, s);
    }
    speckle(ctx, s, ['#256660', '#3a9a92'], 200, 0.5, 2);
    ctx.fillStyle = 'rgba(236,231,219,0.85)';
    ctx.font = 'bold 26px monospace';
    ctx.fillText('SABLE', 18, 40);
    ctx.font = 'bold 16px monospace';
    ctx.fillText('LINE 12', 18, 64);
  }, 2, 1));
  cache.set('hazard', canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#e8c33a';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#1b1e24';
    for (let i = -s; i < s * 2; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, s);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 32, 0);
      ctx.lineTo(i + 16, s);
      ctx.closePath();
      ctx.fill();
    }
  }, 6, 1));
  cache.set('sky', canvasTexture(512, (ctx, s) => {
    const grad = ctx.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#2b3a55');
    grad.addColorStop(0.45, '#7a5a6e');
    grad.addColorStop(0.7, '#e07840');
    grad.addColorStop(1, '#ffb347');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(255,200,140,0.9)';
    ctx.beginPath();
    ctx.arc(s * 0.72, s * 0.62, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 40; i += 1) {
      ctx.fillRect(Math.random() * s, Math.random() * s * 0.4, 18 + Math.random() * 30, 2);
    }
  }));
  return cache;
}

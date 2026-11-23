// Neon Bay rendering: a camera that follows the player, the sunset city drawn
// from the world data, and the HUD with its minimap. One canvas, one logical
// 1280x720 view, scaled to the window. No images, no fonts from the network.

import { VIEW, FONT, PALETTE, clamp, dist2 } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_END = 'end';

const MAP_SIZE = 150;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(window.innerWidth * ratio);
    const h = Math.round(window.innerHeight * ratio);
    canvas.width = w;
    canvas.height = h;
    view.scale = Math.min(w / VIEW.width, h / VIEW.height);
    view.x = (w - VIEW.width * view.scale) / 2;
    view.y = (h - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = size + (weight || '');
    if (!fonts.has(key)) fonts.set(key, (weight || '') + ' ' + size + 'px ' + FONT);
    ctx.font = fonts.get(key);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function star(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const px = x + Math.cos(a) * rad;
      const py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawWater(state, time) {
    const w = state.city.water;
    const grad = ctx.createLinearGradient(w.x0, 0, w.x1, 0);
    grad.addColorStop(0, PALETTE.waterDeep);
    grad.addColorStop(1, PALETTE.water);
    ctx.fillStyle = grad;
    ctx.fillRect(w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0);
    ctx.strokeStyle = 'rgba(255, 150, 60, 0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i += 1) {
      const y = w.y0 + ((i * 240 + time * 12) % (w.y1 - w.y0));
      const len = 60 + ((i * 37) % 120);
      ctx.beginPath();
      ctx.moveTo(w.x1 - len - ((i * 53) % 160), y);
      ctx.lineTo(w.x1 - ((i * 53) % 160), y);
      ctx.stroke();
    }
    // The pier: planks over the water.
    const pier = state.city.pier;
    ctx.fillStyle = '#5a4632';
    ctx.fillRect(pier.x0, pier.y - pier.w / 2, pier.x1 - pier.x0, pier.w);
    ctx.strokeStyle = '#3d2f21';
    ctx.lineWidth = 2;
    for (let x = pier.x0 + 20; x < pier.x1; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, pier.y - pier.w / 2);
      ctx.lineTo(x, pier.y + pier.w / 2);
      ctx.stroke();
    }
  }

  function drawRoads(state) {
    const city = state.city;
    const half = city.half;
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(-half, -half, city.size + half * 2, city.size + half * 2);
    ctx.fillStyle = PALETTE.road;
    // Vertical and horizontal roads, then their dashed centre lines.
    for (let i = 0; i < city.roads; i += 1) {
      ctx.fillRect(city.roadsX[i] - half, -half, half * 2, city.size + half * 2);
      ctx.fillRect(-half, city.roadsY[i] - half, city.size + half * 2, half * 2);
    }
    ctx.fillStyle = '#f7d774';
    for (let i = 0; i < city.roads; i += 1) {
      for (let d = 0; d < city.size; d += 46) {
        ctx.fillRect(city.roadsX[i] - 2, d, 4, 24);
        ctx.fillRect(d, city.roadsY[i] - 2, 24, 4);
      }
    }
  }

  function drawBuildings(state) {
    const city = state.city;
    for (let i = 0; i < city.plazas.length; i += 1) {
      const p = city.plazas[i];
      ctx.fillStyle = '#1e3a26';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#2f5a3a';
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    }
    for (let i = 0; i < city.buildings.length; i += 1) {
      const b = city.buildings[i];
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = PALETTE.roofLine;
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      for (let wx = b.x + 12; wx < b.x + b.w - 10; wx += 20) {
        for (let wy = b.y + 12; wy < b.y + b.h - 10; wy += 24) {
          const lit = ((b.seed + wx * 17 + wy * 13) % 100) > 52;
          ctx.fillStyle = lit ? PALETTE.windowLit : PALETTE.windowDark;
          ctx.fillRect(wx, wy, 9, 11);
        }
      }
      if (b.sign) {
        ctx.save();
        ctx.shadowColor = b.signColor;
        ctx.shadowBlur = 12;
        text(b.sign, b.x + b.w / 2, b.y + 24, 15, b.signColor, 'center', 'bold');
        ctx.restore();
      }
    }
    for (let i = 0; i < city.palms.length; i += 1) {
      const p = city.palms[i];
      ctx.strokeStyle = PALETTE.trunk;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 3, p.y - 14);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.palm;
      ctx.lineWidth = 2;
      for (let f = 0; f < 5; f += 1) {
        const a = (f / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(p.x + 3, p.y - 14);
        ctx.lineTo(p.x + 3 + Math.cos(a) * 11, p.y - 14 + Math.sin(a) * 8);
        ctx.stroke();
      }
    }
    for (let i = 0; i < city.lamps.length; i += 1) {
      const l = city.lamps[i];
      ctx.save();
      ctx.shadowColor = '#ffd166';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(l.x, l.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawCar(car, time) {
    // A wreck stays on the street as a charred husk.
    if (car.hp <= 0) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = '#17171c';
      roundRect(-22, -11, 44, 22, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(120, 120, 130, 0.5)';
      ctx.beginPath();
      ctx.arc(-8, -4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = '#0c0c12';
    ctx.fillRect(-24, -13, 48, 26);
    ctx.fillStyle = car.color;
    roundRect(-22, -11, 44, 22, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(20, 24, 34, 0.9)';
    roundRect(-4, -9, 16, 18, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(180, 220, 255, 0.75)';
    ctx.fillRect(14, -8, 4, 16);
    ctx.fillStyle = '#fff8c0';
    ctx.beginPath();
    ctx.arc(22, -7, 2.5, 0, Math.PI * 2);
    ctx.arc(22, 7, 2.5, 0, Math.PI * 2);
    ctx.fill();
    if (car.kind === 'police') {
      ctx.fillStyle = '#1c1e26';
      ctx.fillRect(-8, -11, 14, 22);
      const flash = Math.floor(time * 3) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2e4d' : '#2e7bff';
      ctx.fillRect(-2, -12, 5, 5);
      ctx.fillStyle = flash ? '#2e7bff' : '#ff2e4d';
      ctx.fillRect(-2, 7, 5, 5);
      text('PD', -1, 4, 9, '#e8ecf4', 'center', 'bold');
    }
    if (car.hp < 45 && car.hp > 0) {
      ctx.fillStyle = 'rgba(120, 120, 130, 0.5)';
      ctx.beginPath();
      ctx.arc(-10 + Math.sin(time * 9) * 3, -6, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, color, gun) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 3, Math.sin(angle) * 3, 5, 0, Math.PI * 2);
    ctx.fill();
    if (gun) {
      ctx.strokeStyle = '#22222c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * 20, Math.sin(angle) * 20);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMarker(state, time) {
    const t = state.mission.target;
    if (!t || state.mission.storyDone) return;
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = PALETTE.marker;
    ctx.fillRect(t.x - 3, t.y - 260, 6, 260);
    ctx.restore();
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.marker;
    ctx.shadowColor = PALETTE.marker;
    ctx.shadowBlur = 16;
    const s = 13 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 34 + Math.sin(time * 4) * 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawWorld(state, time) {
    const cam = state.cam;
    const vx = clamp(cam.x - VIEW.width / 2, state.city.water.x0, state.city.size + 42 - VIEW.width);
    const vy = clamp(cam.y - VIEW.height / 2, -42, state.city.size + 42 - VIEW.height);
    const shx = (Math.random() - 0.5) * cam.shake;
    const shy = (Math.random() - 0.5) * cam.shake;
    ctx.save();
    ctx.translate(-vx + shx, -vy + shy);
    const bg = ctx.createLinearGradient(0, -100, 0, state.city.size);
    bg.addColorStop(0, '#2b1155');
    bg.addColorStop(0.5, '#1a1033');
    bg.addColorStop(1, '#120b24');
    ctx.fillStyle = bg;
    ctx.fillRect(vx - 40, vy - 40, VIEW.width + 80, VIEW.height + 80);
    drawWater(state, time);
    drawRoads(state);
    drawBuildings(state);
    drawMarker(state, time);
    for (let i = 0; i < state.peds.length; i += 1) {
      const ped = state.peds[i];
      if (ped.hp > 0) drawPerson(ped.x, ped.y, ped.angle, ped.color, false);
    }
    for (let i = 0; i < state.enemies.length; i += 1) {
      const e = state.enemies[i];
      if (e.hp > 0) drawPerson(e.x, e.y, e.angle, '#c22e3d', true);
    }
    for (let i = 0; i < state.cars.length; i += 1) {
      drawCar(state.cars[i], time);
    }
    const p = state.player;
    if (!p.inCar && p.hp > 0) drawPerson(p.x, p.y, p.angle, PALETTE.player, p.weapon === 'pistol');
    for (let i = 0; i < state.bullets.length; i += 1) {
      const b = state.bullets[i];
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (let i = 0; i < state.parts.length; i += 1) {
      const pt = state.parts[i];
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return { vx, vy };
  }

  function drawMinimap(state, view) {
    const x0 = VIEW.width - MAP_SIZE - 16;
    const y0 = 16;
    const scale = MAP_SIZE / (state.city.size + 422);
    const ox = x0 - state.city.water.x0 * scale;
    const oy = y0 - (-42) * scale;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(x0 - 6, y0 - 6, MAP_SIZE + 12, MAP_SIZE + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    roundRect(x0, y0, MAP_SIZE, MAP_SIZE, 4);
    ctx.clip();
    ctx.fillStyle = '#101019';
    ctx.fillRect(x0, y0, MAP_SIZE, MAP_SIZE);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x0, y0, (state.city.water.x1 - state.city.water.x0) * scale, MAP_SIZE);
    ctx.strokeStyle = 'rgba(120, 130, 160, 0.8)';
    ctx.lineWidth = 1;
    for (let i = 0; i < state.city.roads; i += 1) {
      ctx.beginPath();
      ctx.moveTo(ox + state.city.roadsX[i] * scale, y0);
      ctx.lineTo(ox + state.city.roadsX[i] * scale, y0 + MAP_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x0, oy + state.city.roadsY[i] * scale);
      ctx.lineTo(x0 + MAP_SIZE, oy + state.city.roadsY[i] * scale);
      ctx.stroke();
    }
    const dot = (x, y, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ox + x * scale, oy + y * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (let i = 0; i < state.cars.length; i += 1) {
      const car = state.cars[i];
      if (car.hp <= 0) continue;
      dot(car.x, car.y, car.kind === 'police' ? 3 : 2, car.kind === 'police' ? '#ff4757' : '#8b93a3');
    }
    for (let i = 0; i < state.enemies.length; i += 1) {
      const e = state.enemies[i];
      if (e.hp > 0) dot(e.x, e.y, 2.5, '#ff4757');
    }
    const t = state.mission.target;
    if (t && !state.mission.storyDone) {
      ctx.fillStyle = PALETTE.marker;
      const mx = ox + t.x * scale;
      const my = oy + t.y * scale;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
    const p = state.player;
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.translate(ox + p.x * scale, oy + p.y * scale);
    ctx.rotate(p.angle);
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4, -4);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + view.vx * scale, oy + view.vy * scale, VIEW.width * scale, VIEW.height * scale);
    ctx.restore();
  }

  function drawHud(state, time, viewPos) {
    const p = state.player;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(14, 14, 300, 86, 10);
    ctx.fill();
    text('HP', 26, 40, 15, PALETTE.hudMuted, 'left', 'bold');
    ctx.fillStyle = '#3a1520';
    roundRect(60, 28, 200, 14, 7);
    ctx.fill();
    ctx.fillStyle = p.hp > 30 ? '#39d98a' : '#ff4757';
    roundRect(60, 28, Math.max(0, 200 * (p.hp / 100)), 14, 7);
    ctx.fill();
    text('$' + p.money.toLocaleString('en-US'), 26, 66, 22, PALETTE.gold, 'left', 'bold');
    text('WANTED', 26, 88, 13, PALETTE.hudMuted, 'left', 'bold');
    // Wanted stars sit right of the label.
    for (let s = 0; s < 5; s += 1) {
      star(96 + s * 22, 84, 9, s < p.wanted ? '#ff4757' : 'rgba(255,255,255,0.22)');
    }
    drawMinimap(state, viewPos);
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(14, VIEW.height - 58, 250, 44, 10);
    ctx.fill();
    if (p.weapon === 'pistol') {
      text(p.reloadT > 0 ? 'RELOADING...' : 'PISTOL  ' + p.ammo + ' / 12', 26, VIEW.height - 30, 18, PALETTE.hudText, 'left', 'bold');
    } else {
      text('FISTS  —  press 2 for pistol', 26, VIEW.height - 30, 16, PALETTE.hudText, 'left', 'bold');
    }
    if (p.inCar) {
      const mph = Math.round(Math.abs(p.inCar.speed) * 0.12);
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect(VIEW.width - 190, VIEW.height - 58, 176, 44, 10);
      ctx.fill();
      text(mph + ' mph', VIEW.width - 102, VIEW.height - 30, 22, PALETTE.hudText, 'center', 'bold');
    }
    // Mission banner, bottom centre.
    const m = state.mission;
    if (m.text && !m.storyDone) {
      const label = 'MISSION ' + (m.index + 1) + '/6 — ' + m.text;
      ctx.font = 'bold 16px ' + FONT;
      const w = ctx.measureText(label).width + 36;
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect((VIEW.width - w) / 2, VIEW.height - 58, w, 44, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.marker;
      ctx.fillRect((VIEW.width - w) / 2 + 12, VIEW.height - 44, 8, 16);
      text(label, (VIEW.width - w) / 2 + 30, VIEW.height - 30, 16, PALETTE.hudText, 'left', 'bold');
    } else if (m.storyDone) {
      ctx.font = 'bold 16px ' + FONT;
      const label = 'STORY COMPLETE — free roam Neon Bay';
      const w = ctx.measureText(label).width + 36;
      ctx.fillStyle = PALETTE.hudPanel;
      roundRect((VIEW.width - w) / 2, VIEW.height - 58, w, 44, 10);
      ctx.fill();
      text(label, (VIEW.width - w) / 2 + 18, VIEW.height - 30, 16, PALETTE.gold, 'left', 'bold');
    }
    // Dialog lines, one at a time above the banner.
    if (state.dialog.lines.length > 0 && state.dialog.i < state.dialog.lines.length) {
      const line = state.dialog.lines[state.dialog.i];
      ctx.font = '16px ' + FONT;
      const w = Math.min(760, ctx.measureText(line).width + 36);
      ctx.fillStyle = 'rgba(12, 12, 24, 0.85)';
      roundRect((VIEW.width - w) / 2, VIEW.height - 118, w, 44, 10);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.fillRect((VIEW.width - w) / 2 + 12, VIEW.height - 104, 4, 16);
      text(line, (VIEW.width - w) / 2 + 26, VIEW.height - 90, 16, PALETTE.hudText, 'left');
    }
  }

  function drawPrompt(state, view) {
    if (state.prompt) {
      const p = state.player;
      const sx = p.x - view.vx;
      const sy = p.y - view.vy - 34;
      ctx.font = 'bold 15px ' + FONT;
      const w = ctx.measureText(state.prompt).width + 24;
      ctx.fillStyle = 'rgba(12, 12, 24, 0.85)';
      roundRect(sx - w / 2, sy - 22, w, 30, 8);
      ctx.fill();
      text(state.prompt, sx, sy - 1, 15, PALETTE.gold, 'center', 'bold');
    }
    // Off-screen mission arrow.
    const t = state.mission.target;
    if (t && !state.mission.storyDone) {
      const p = state.player;
      const sx = p.x - view.vx;
      const sy = p.y - view.vy;
      if (sx < 60 || sx > VIEW.width - 60 || sy < 60 || sy > VIEW.height - 60) {
        const cx = clamp(sx, 90, VIEW.width - 90);
        const cy = clamp(sy, 90, VIEW.height - 90);
        const a = Math.atan2(t.y - p.y, t.x - p.x);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(a);
        ctx.fillStyle = PALETTE.marker;
        ctx.beginPath();
        ctx.moveTo(16, 0);
        ctx.lineTo(-8, -9);
        ctx.lineTo(-8, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    ctx.fillStyle = 'rgba(8, 8, 18, 0.78)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const w = 640;
    const h = 150 + lines.length * 32;
    const x = (VIEW.width - w) / 2;
    const y = (VIEW.height - h) / 2;
    ctx.fillStyle = PALETTE.hudPanel;
    roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.marker;
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 14);
    ctx.stroke();
    text(title, VIEW.width / 2, y + 62, 44, accent || PALETTE.hudText, 'center', 'bold');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 112 + i * 32, 19, PALETTE.hudMuted, 'center');
    }
    text(prompt, VIEW.width / 2, y + h - 28, 19, PALETTE.gold, 'center', 'bold');
  }

  function drawTitle(state, saveExists) {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    grad.addColorStop(0, '#1a0b33');
    grad.addColorStop(0.55, '#2b1155');
    grad.addColorStop(1, '#0d0719');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    // Sun glow over the bay.
    const sun = ctx.createRadialGradient(300, 560, 10, 300, 560, 420);
    sun.addColorStop(0, 'rgba(255, 150, 60, 0.55)');
    sun.addColorStop(0.5, 'rgba(255, 80, 120, 0.18)');
    sun.addColorStop(1, 'rgba(255, 80, 120, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.save();
    ctx.shadowColor = '#29f3ff';
    ctx.shadowBlur = 34;
    text('NEON BAY', VIEW.width / 2, 210, 92, '#eafcff', 'center', 'bold');
    ctx.restore();
    ctx.save();
    ctx.shadowColor = '#ff2e88';
    ctx.shadowBlur = 18;
    text('AN OPEN-WORLD CRIME STORY', VIEW.width / 2, 258, 22, '#ff9ecf', 'center', 'bold');
    ctx.restore();
    const lines = [
      'Six jobs. One debt. A whole city that never sleeps.',
      'WASD / arrows — walk & drive    E — enter / steal a car    Mouse — aim, click — shoot',
      'R — reload    Space — punch    1 / 2 — weapons    P — pause    M — mute',
      saveExists ? 'A saved game is waiting — Continue picks up where you left off.' : 'No saved game yet — New Game starts the story from the pier.',
    ];
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, 330 + i * 34, 19, PALETTE.hudMuted, 'center');
    }
    text(saveExists ? 'ENTER — Continue    N — New Game' : 'ENTER or CLICK — New Game', VIEW.width / 2, 520, 22, PALETTE.gold, 'center', 'bold');
    text('Free roam after the story • Progress saves automatically', VIEW.width / 2, 566, 15, PALETTE.hudMuted, 'center');
  }

  /** Paint one frame: the world, then the HUD or a screen panel. */
  function draw(state, screen, ui) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui.saveExists);
      return;
    }
    const viewPos = drawWorld(state, state.time);
    drawHud(state, state.time, viewPos);
    drawPrompt(state, viewPos);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The bay waits for you.', 'WASD — move    E — car    Mouse — aim & shoot    M — mute'], 'Press P or Esc to resume', '#29f3ff');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Bay PD caught you.', 'You lost $' + state.bustedLoss + ' and woke up at the hospital.'], 'Press Enter to get back out there', '#2e7bff');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', ['Neon Bay got the better of you.', 'You lost $' + state.bustedLoss + ' and woke up at the hospital.'], 'Press Enter to get back out there', '#ff4757');
    } else if (screen === SCREEN_END) {
      drawPanel('STORY COMPLETE', ['Debt cleared. Neon Bay is yours now, Rook.', 'Free roam: the city, the cars and the cops are still out there.'], 'Press Enter to keep playing', PALETTE.gold);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}

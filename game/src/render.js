// Neon Bay rendering: a camera that follows the player, the sunset city
// drawn straight from the world data, and the HUD with its minimap. One
// canvas, one logical 1280x720 view, scaled to fit the window. No images,
// no fonts from anywhere on the network.

import { VIEW, CITY, PALETTE, FONT, bound } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

// Text that reads on any background: a dark outline under bright letters.
function label(ctx, s, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.strokeText(s, x, y);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function pill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const ang = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? PALETTE.gold : 'rgba(255, 255, 255, 0.25)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// --- The world ----------------------------------------------------------------------
// Water first, then the sand edge, the roads and sidewalks, the blocks and
// buildings, and finally the props. Everything is drawn from the city data
// the world module built, so the picture always matches the simulation.
function paintWater(ctx, city, camX, camY) {
  const w = city.water;
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0);
  // A little glitter on the water: short bright dashes that drift with time.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 2;
  const t = Math.floor(camX + camY);
  for (let i = 0; i < 24; i += 1) {
    const gx = w.x0 + 20 + ((i * 137 + t) % Math.max(1, w.x1 - w.x0 - 40));
    const gy = w.y0 + 30 + ((i * 211) % Math.max(1, w.y1 - w.y0 - 60));
    ctx.beginPath();
    ctx.moveTo(gx - 12, gy);
    ctx.lineTo(gx + 12, gy);
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(w.x1 - 8, w.y0, 8, w.y1 - w.y0);
  // The pier: planks over the water, with posts at the end.
  const pier = city.pier;
  ctx.fillStyle = '#7a5c3e';
  ctx.fillRect(pier.x0, pier.y - pier.w / 2, pier.x1 - pier.x0, pier.w);
  ctx.strokeStyle = '#5d4429';
  ctx.lineWidth = 2;
  for (let x = pier.x0 + 10; x < pier.x1; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, pier.y - pier.w / 2);
    ctx.lineTo(x, pier.y + pier.w / 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#4a3520';
  ctx.fillRect(pier.x0 + 4, pier.y - pier.w / 2 - 4, 6, 6);
  ctx.fillRect(pier.x0 + 4, pier.y + pier.w / 2 - 2, 6, 6);
}

function paintRoads(ctx, city) {
  ctx.fillStyle = PALETTE.road;
  for (let i = 0; i < city.roads; i += 1) {
    ctx.fillRect(-CITY.roadW / 2, city.roadsY[i] - city.half, city.size + CITY.roadW, CITY.roadW);
    ctx.fillRect(city.roadsX[i] - city.half, -CITY.roadW / 2, CITY.roadW, city.size + CITY.roadW);
  }
  // Sidewalks: the lighter border along each road.
  ctx.fillStyle = PALETTE.sidewalk;
  for (let i = 0; i < city.roads; i += 1) {
    ctx.fillRect(-CITY.roadW / 2, city.roadsY[i] - city.half - 6, city.size + CITY.roadW, 6);
    ctx.fillRect(-CITY.roadW / 2, city.roadsY[i] + city.half, city.size + CITY.roadW, 6);
    ctx.fillRect(city.roadsX[i] - city.half - 6, -CITY.roadW / 2, 6, city.size + CITY.roadW);
    ctx.fillRect(city.roadsX[i] + city.half, -CITY.roadW / 2, 6, city.size + CITY.roadW);
  }
  // Centre dashes down the middle of every road.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (let i = 0; i < city.roads; i += 1) {
    for (let d = 0; d < city.size; d += 60) {
      ctx.fillRect(d, city.roadsY[i] - 2, 26, 4);
      ctx.fillRect(city.roadsX[i] - 2, d, 4, 26);
    }
  }
}

function paintBlocks(ctx, city) {
  ctx.fillStyle = PALETTE.block;
  const half = city.half;
  for (let i = 0; i < city.roads - 1; i += 1) {
    for (let j = 0; j < city.roads - 1; j += 1) {
      ctx.fillRect(city.roadsX[i] + half, city.roadsY[j] + half, CITY.pitch - CITY.roadW, CITY.pitch - CITY.roadW);
    }
  }
  // The plaza: open ground with a painted ring for the shootouts.
  for (const plaza of city.plazas) {
    ctx.fillStyle = '#232333';
    ctx.fillRect(plaza.x, plaza.y, plaza.w, plaza.h);
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(plaza.x + plaza.w / 2, plaza.y + plaza.h / 2, 60, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Buildings: a coloured slab, a dark roof line, lit windows, and a neon
  // sign on about half of them.
  for (const b of city.buildings) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = PALETTE.roofLine;
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    const cols = Math.max(2, Math.floor(b.w / 34));
    const rows = Math.max(2, Math.floor(b.h / 34));
    for (let c = 0; c < cols; c += 1) {
      for (let r = 0; r < rows; r += 1) {
        const lit = ((b.seed + c * 7 + r * 13) % 10) < 4;
        ctx.fillStyle = lit ? PALETTE.windowLit : PALETTE.windowDark;
        ctx.fillRect(b.x + 8 + c * ((b.w - 16) / cols), b.y + 8 + r * ((b.h - 16) / rows), 12, 10);
      }
    }
    if (b.sign) {
      label(ctx, b.sign, b.x + b.w / 2, b.y - 8, 13, b.signColor, 'center');
    }
  }
  // Palms: a trunk and a crown of leaves, small but unmistakable.
  for (const palm of city.palms) {
    ctx.strokeStyle = PALETTE.trunk;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + 3, palm.y - 16);
    ctx.stroke();
    ctx.fillStyle = PALETTE.palm;
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(palm.x + 3 + Math.cos(a) * 8, palm.y - 16 + Math.sin(a) * 5, 10, 4, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Street lamps: a pole and a warm pool of light.
  for (const lamp of city.lamps) {
    ctx.fillStyle = 'rgba(255, 209, 102, 0.12)';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintTokens(ctx, state) {
  for (const token of state.tokens) {
    if (token.taken) continue;
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 4 + token.seed);
    ctx.fillStyle = `rgba(41, 243, 255, ${0.5 * pulse})`;
    ctx.beginPath();
    ctx.arc(token.x, token.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#29f3ff';
    ctx.beginPath();
    ctx.arc(token.x, token.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1020';
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', token.x, token.y + 0.5);
  }
}

function paintCar(ctx, car, isPlayer) {
  const len = car.vclass === 'truck' ? 54 : car.vclass === 'sport' ? 48 : 44;
  const wid = 24;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Body.
  ctx.fillStyle = car.color;
  pill(ctx, -len / 2, -wid / 2, len, wid, 6);
  ctx.fill();
  // Cabin.
  ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
  pill(ctx, -len / 6, -wid / 2 + 4, len / 3, wid - 8, 4);
  ctx.fill();
  // Headlights and brake lights.
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(len / 2 - 3, -wid / 2 + 3, 3, 5);
  ctx.fillRect(len / 2 - 3, wid / 2 - 8, 3, 5);
  if (car.brakeLight) {
    ctx.fillStyle = '#ff2e4d';
    ctx.fillRect(-len / 2, -wid / 2 + 3, 3, 5);
    ctx.fillRect(-len / 2, wid / 2 - 8, 3, 5);
  }
  if (isPlayer) {
    // A small chevron above the player's car so the eye finds it fast.
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(0, -wid / 2 - 10);
    ctx.lineTo(6, -wid / 2 - 2);
    ctx.lineTo(-6, -wid / 2 - 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function paintCars(ctx, state) {
  for (const car of state.cars) {
    if (car.hp <= 0) continue;
    if (car.kind === 'police') {
      // Police: white body, dark stripe, red-and-blue light bar.
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = PALETTE.policeA;
      pill(ctx, -22, -12, 44, 24, 6);
      ctx.fill();
      ctx.fillStyle = PALETTE.policeB;
      ctx.fillRect(-8, -12, 16, 24);
      ctx.fillStyle = Math.floor(state.time * 4) % 2 === 0 ? '#ff2e4d' : '#2e7dff';
      ctx.fillRect(-6, -13, 5, 4);
      ctx.fillStyle = Math.floor(state.time * 4) % 2 === 0 ? '#2e7dff' : '#ff2e4d';
      ctx.fillRect(1, -13, 5, 4);
      ctx.restore();
      continue;
    }
    paintCar(ctx, car, state.player.inCar === car);
    // A wrecked car's smoke, and the health of a car the player is driving.
    if (car.hp < 40) {
      ctx.fillStyle = 'rgba(120, 120, 120, 0.5)';
      ctx.beginPath();
      ctx.arc(car.x + Math.sin(state.time * 6) * 4, car.y - 10, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintWalker(ctx, x, y, angle, color, isPlayer) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  // A nose so the facing direction reads at a glance.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(2, -5);
  ctx.lineTo(2, 5);
  ctx.closePath();
  ctx.fill();
  if (isPlayer) {
    ctx.strokeStyle = PALETTE.player;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function paintPeople(ctx, state) {
  for (const ped of state.peds) {
    if (ped.hp <= 0) continue;
    paintWalker(ctx, ped.x, ped.y, ped.angle, ped.color, false);
  }
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    paintWalker(ctx, enemy.x, enemy.y, enemy.angle, '#ff4757', false);
    // Health bar over a thug, so the player knows who is nearly down.
    const w = 30;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(enemy.x - w / 2, enemy.y - 24, w, 5);
    ctx.fillStyle = '#ff4757';
    ctx.fillRect(enemy.x - w / 2, enemy.y - 24, w * bound(enemy.hp / 60, 0, 1), 5);
  }
  const p = state.player;
  if (!p.inCar) paintWalker(ctx, p.x, p.y, p.angle, PALETTE.player, true);
}

function paintShots(ctx, state) {
  for (const b of state.bullets) {
    ctx.strokeStyle = '#ffe66d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(b.x - Math.cos(b.angle) * 10, b.y - Math.sin(b.angle) * 10);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const part of state.parts) {
    ctx.fillStyle = part.color;
    ctx.globalAlpha = bound(part.life / part.max, 0, 1);
    ctx.beginPath();
    ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintHeli(ctx, state) {
  const heli = state.heli;
  if (!heli.active) return;
  ctx.save();
  ctx.translate(heli.x, heli.y);
  ctx.rotate(heli.angle);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.beginPath();
  ctx.arc(0, 0, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242e';
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff2e4d';
  ctx.fillRect(-4, -14, 8, 4);
  ctx.strokeStyle = '#20242e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.lineTo(20, 0);
  ctx.stroke();
  ctx.restore();
  // The searchlight: a cone from the helicopter to the player.
  const p = state.player;
  const grad = ctx.createLinearGradient(heli.x, heli.y, p.x, p.y);
  grad.addColorStop(0, 'rgba(255, 255, 220, 0.18)');
  grad.addColorStop(1, 'rgba(255, 255, 220, 0.02)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(heli.x, heli.y);
  ctx.lineTo(p.x + 30, p.y + 30);
  ctx.lineTo(p.x - 30, p.y - 30);
  ctx.closePath();
  ctx.fill();
}

function paintMarker(ctx, state) {
  const target = state.mission.target;
  if (!target) return;
  const bob = Math.sin(state.time * 3) * 6;
  ctx.strokeStyle = PALETTE.marker;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(target.x, target.y + bob, target.radius * 0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PALETTE.marker;
  ctx.beginPath();
  ctx.moveTo(target.x, target.y + bob - 26);
  ctx.lineTo(target.x + 10, target.y + bob - 8);
  ctx.lineTo(target.x - 10, target.y + bob - 8);
  ctx.closePath();
  ctx.fill();
  // A guide line from the player to the target, faint, so the player never
  // has to guess which way to drive.
  const p = state.player;
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function paintFare(ctx, state) {
  const taxi = state.taxi;
  if (taxi.state === 'waiting' && taxi.fare) {
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 5);
    ctx.fillStyle = `rgba(255, 209, 102, ${pulse})`;
    ctx.beginPath();
    ctx.arc(taxi.fare.x, taxi.fare.y, 12, 0, Math.PI * 2);
    ctx.fill();
    label(ctx, '$', taxi.fare.x, taxi.fare.y, 14, '#0b1020', 'center');
  }
  if (taxi.state === 'riding' && taxi.dest) {
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(taxi.dest.x, taxi.dest.y, 20, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, 'DROP', taxi.dest.x, taxi.dest.y - 28, 13, '#ffd166', 'center');
  }
}

// --- The HUD ----------------------------------------------------------------------
// Top-left: health, money, tokens. Top-right: wanted stars, weapon and
// ammo, speed. Centre-top: the current job. Bottom: dialog and prompts.
function paintHud(ctx, state) {
  const p = state.player;
  ctx.fillStyle = PALETTE.hudPanel;
  pill(ctx, 12, 12, 300, 86, 10);
  ctx.fill();
  // Health bar.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  pill(ctx, 24, 24, 180, 14, 7);
  ctx.fill();
  ctx.fillStyle = p.hp > 30 ? '#39ff88' : '#ff4757';
  pill(ctx, 24, 24, 180 * bound(p.hp / 100, 0, 1), 14, 7);
  ctx.fill();
  label(ctx, `${Math.ceil(p.hp)}`, 212, 31, 14, PALETTE.hudText, 'left');
  label(ctx, `$${p.money}`, 24, 56, 20, PALETTE.hudText, 'left');
  label(ctx, `N ${state.tokens.filter((t) => t.taken).length}/${state.tokens.length}`, 24, 80, 14, '#29f3ff', 'left');
  // Wanted stars and weapon, top-right.
  ctx.fillStyle = PALETTE.hudPanel;
  pill(ctx, VIEW.width - 312, 12, 300, 86, 10);
  ctx.fill();
  for (let i = 0; i < 5; i += 1) {
    star(ctx, VIEW.width - 288 + i * 30, 32, 12, i < p.wanted);
  }
  const weaponLabel = p.weapon === 'pistol' ? `PISTOL ${p.ammo}/12` : 'FISTS';
  label(ctx, weaponLabel, VIEW.width - 24, 60, 16, PALETTE.hudText, 'right');
  if (p.inCar) {
    const mph = Math.round(Math.abs(p.inCar.speed) * 0.12);
    label(ctx, `${mph} mph`, VIEW.width - 24, 84, 14, PALETTE.hudMuted, 'right');
  }
  // The mission banner: "MISSION n/8 — name", then the objective line.
  const job = state.mission.index < 8 ? state.mission.index + 1 : 8;
  const jobName = state.mission.storyDone ? 'STORY COMPLETE' : `MISSION ${job}/8`;
  label(ctx, jobName, VIEW.width / 2, 28, 18, PALETTE.gold, 'center');
  if (state.mission.text) {
    label(ctx, state.mission.text, VIEW.width / 2, 52, 15, PALETTE.hudText, 'center');
  }
  if (state.mission.timer > 0 && (state.mission.index === 2 || state.mission.index === 4 || state.mission.index === 6)) {
    label(ctx, `${Math.ceil(state.mission.timer)}s`, VIEW.width / 2, 76, 18, PALETTE.gold, 'center');
  }
  // Taxi timer while a fare is aboard.
  if (state.taxi.state === 'riding') {
    label(ctx, `FARE ${Math.ceil(state.taxi.timer)}s — $${state.taxi.pay}`, VIEW.width / 2, 100, 15, '#ffd166', 'center');
  }
  // Dialog lines at the bottom, one at a time.
  if (state.dialog.lines.length > 0) {
    const line = state.dialog.lines[state.dialog.i];
    if (line) {
      const w = Math.min(760, ctx.measureText(line).width + 40);
      ctx.fillStyle = PALETTE.hudPanel;
      pill(ctx, VIEW.width / 2 - w / 2, VIEW.height - 96, w, 40, 10);
      ctx.fill();
      label(ctx, line, VIEW.width / 2, VIEW.height - 76, 15, PALETTE.hudText, 'center', 'normal');
    }
  }
  // The action prompt: "E — STEAL CAR" and friends.
  if (state.prompt) {
    label(ctx, state.prompt, VIEW.width / 2, VIEW.height - 130, 16, PALETTE.gold, 'center');
  }
}

// The minimap: the whole city at 150 px, bottom-right, with the player
// arrow, the cars, the police, the thugs, the tokens, the helicopter and
// the objective marker, plus the camera's view rectangle.
function paintMap(ctx, state) {
  const size = 150;
  const x0 = VIEW.width - size - 12;
  const y0 = VIEW.height - size - 12;
  const scale = size / (state.city.size + CITY.roadW);
  ctx.fillStyle = 'rgba(12, 12, 24, 0.78)';
  pill(ctx, x0 - 4, y0 - 4, size + 8, size + 8, 8);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, size, size);
  ctx.clip();
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(x0, y0, size, size);
  ctx.fillStyle = PALETTE.road;
  const city = state.city;
  for (let i = 0; i < city.roads; i += 1) {
    ctx.fillRect(x0, y0 + (city.roadsY[i] - city.half) * scale, size, CITY.roadW * scale);
    ctx.fillRect(x0 + (city.roadsX[i] - city.half) * scale, y0, CITY.roadW * scale, size);
  }
  const dot = (wx, wy, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x0 + (wx + CITY.roadW / 2) * scale, y0 + (wy + CITY.roadW / 2) * scale, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const token of state.tokens) if (!token.taken) dot(token.x, token.y, '#29f3ff', 2);
  if (state.mission.target) dot(state.mission.target.x, state.mission.target.y, PALETTE.marker, 4);
  for (const enemy of state.enemies) if (!enemy.dead) dot(enemy.x, enemy.y, '#ff4757', 3);
  for (const car of state.cars) {
    if (car.hp <= 0) continue;
    dot(car.x, car.y, car.kind === 'police' ? '#ff2e4d' : '#c9c9c9', 2.5);
  }
  if (state.heli.active) dot(state.heli.x, state.heli.y, '#ff2e4d', 4);
  // The player arrow.
  const p = state.player;
  const px = x0 + (p.x + CITY.roadW / 2) * scale;
  const py = y0 + (p.y + CITY.roadW / 2) * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(p.angle);
  ctx.fillStyle = PALETTE.player;
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // The camera's view rectangle.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;
  const cam = state.cam;
  ctx.strokeRect(
    x0 + (cam.x - VIEW.width / 2 + CITY.roadW / 2) * scale,
    y0 + (cam.y - VIEW.height / 2 + CITY.roadW / 2) * scale,
    VIEW.width * scale,
    VIEW.height * scale,
  );
  ctx.restore();
}

// --- Screens ----------------------------------------------------------------------
// Full-screen cards for the title, pause, busted, wasted and story-complete
// states. The title shows the story and the controls; the others are short.
function card(ctx, title, lines, hint) {
  ctx.fillStyle = 'rgba(10, 8, 24, 0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  label(ctx, title, VIEW.width / 2, 220, 44, PALETTE.gold, 'center');
  let y = 290;
  for (const line of lines) {
    label(ctx, line, VIEW.width / 2, y, 17, PALETTE.hudText, 'center', 'normal');
    y += 30;
  }
  if (hint) label(ctx, hint, VIEW.width / 2, y + 30, 15, PALETTE.hudMuted, 'center', 'normal');
}

function titleScreen(ctx, state) {
  card(ctx, 'NEON BAY', [
    'A courier. A debt. A city that never sleeps.',
    'Jax Rook owes the Tide crew $1,500. Eight jobs stand between him and freedom.',
    '',
    'WASD / arrows — move & drive      Mouse — aim      Click — shoot',
    'E — enter / steal car      Space — punch      R — reload      H — horn      T — radio',
    'P / Esc — pause      M — mute      1 / 2 — fists / pistol',
  ], 'Press Enter or click to start — Continue to pick up where you left off');
}

function pausedScreen(ctx) {
  card(ctx, 'PAUSED', ['Take a breath. The bay will wait.'], 'Press P or Esc to resume');
}

function bustedScreen(ctx, state) {
  const fine = state.lastFine ? state.lastFine.amount : 0;
  card(ctx, 'BUSTED', [
    'The police caught up with you.',
    fine > 0 ? `Fine: $${fine} (20% of your cash)` : 'The mission restarts.',
  ], 'Press Enter to continue');
}

function wastedScreen(ctx) {
  card(ctx, 'WASTED', ['Jax went down. The bay keeps moving.'], 'Press Enter to continue');
}

function completeScreen(ctx, state) {
  card(ctx, 'STORY COMPLETE', [
    `The debt is paid. Neon Bay is yours, Jax.`,
    `Money earned: $${state.stats.earned}      Cars stolen: ${state.stats.stolen}`,
    'Free roam continues — fares, tokens and the night are still yours.',
  ], 'Press Enter to keep playing');
}

// --- The renderer ------------------------------------------------------------------
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    offsetX = (canvas.width - VIEW.width * scale) / 2;
    offsetY = (canvas.height - VIEW.height * scale) / 2;
  }

  function draw(state, screen) {
    resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // The sunset: a gradient band behind the city, strongest at the horizon.
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#241239');
    grad.addColorStop(0.55, '#3d1f4d');
    grad.addColorStop(1, '#7a2e4d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    const cam = state.cam;
    const shakeX = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
    const shakeY = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
    const viewX = cam.x - VIEW.width / 2 + shakeX;
    const viewY = cam.y - VIEW.height / 2 + shakeY;
    ctx.save();
    ctx.translate(-viewX, -viewY);
    paintWater(ctx, state.city, viewX, viewY);
    paintRoads(ctx, state.city);
    paintBlocks(ctx, state.city);
    paintTokens(ctx, state);
    paintFare(ctx, state);
    paintCars(ctx, state);
    paintPeople(ctx, state);
    paintShots(ctx, state);
    paintHeli(ctx, state);
    paintMarker(ctx, state);
    ctx.restore();
    // The red edge at three stars or more: the heat, made visible.
    if (state.player.wanted >= 3 && screen === SCREEN_PLAY) {
      const vig = ctx.createRadialGradient(
        VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.35,
        VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.75,
      );
      vig.addColorStop(0, 'rgba(255, 40, 60, 0)');
      vig.addColorStop(1, 'rgba(255, 40, 60, 0.35)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) {
      paintHud(ctx, state);
      paintMap(ctx, state);
    }
    if (screen === SCREEN_TITLE) titleScreen(ctx, state);
    if (screen === SCREEN_PAUSED) pausedScreen(ctx);
    if (screen === SCREEN_BUSTED) bustedScreen(ctx, state);
    if (screen === SCREEN_WASTED) wastedScreen(ctx);
    if (screen === SCREEN_COMPLETE) completeScreen(ctx, state);
  }

  return { draw, resize };
}

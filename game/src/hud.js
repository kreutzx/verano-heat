// The heads-up display: money, wanted stars, health, weapon, objective,
// prompts and toasts as DOM, plus a canvas minimap that tracks the player,
// the mission target and the police.

import { streetLines, WATER_Z, MARINA_X, MARISOL_POS } from './config.js';

export class Hud {
  constructor(G) {
    this.G = G;
    const $ = (id) => document.getElementById(id);
    this.moneyEl = $('money');
    this.starsEl = $('stars');
    this.healthEl = $('health-fill');
    this.weaponEl = $('weapon');
    this.objectiveEl = $('objective');
    this.promptEl = $('prompt');
    this.toastEl = $('toast');
    this.titleEl = $('big-title');
    this.bustedWrap = $('busted-wrap');
    this.bustedEl = $('busted-fill');
    this.crosshairEl = $('crosshair');
    this.dmgEl = $('dmg-flash');
    this.map = $('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastQueue = [];
    this.toastT = 0;
    this.titleT = 0;
    this.dmgT = 0;
    this.promptText = '';
  }

  toast(text, seconds = 3) {
    this.toastQueue.push({ text, seconds });
  }

  showTitle(text) {
    this.titleEl.textContent = text;
    this.titleEl.style.opacity = '1';
    this.titleT = 2.4;
  }

  setPrompt(text) {
    this.promptText = text;
  }

  damageFlash() {
    this.dmgT = 0.35;
  }

  update(dt) {
    const G = this.G;
    // Toasts, one at a time.
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toastEl.style.opacity = '0';
    } else if (this.toastQueue.length) {
      const next = this.toastQueue.shift();
      this.toastEl.textContent = next.text;
      this.toastEl.style.opacity = '1';
      this.toastT = next.seconds;
    }
    if (this.titleT > 0) {
      this.titleT -= dt;
      if (this.titleT <= 0) this.titleEl.style.opacity = '0';
    }
    if (this.dmgT > 0) {
      this.dmgT -= dt;
      this.dmgEl.style.opacity = String(Math.max(0, this.dmgT / 0.35) * 0.55);
    }
    // Core readouts.
    this.moneyEl.textContent = `$${G.state.money.toLocaleString('en-US')}`;
    const wanted = G.police.wanted;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < wanted ? '★' : '☆';
    this.starsEl.textContent = stars;
    this.starsEl.style.color = wanted > 0 ? '#ffd23e' : 'rgba(255,255,255,0.35)';
    this.healthEl.style.width = `${Math.max(0, G.player.health)}%`;
    this.healthEl.style.background = G.player.health > 30 ? '#53d769' : '#e74c3c';
    const p = G.player;
    this.weaponEl.textContent = p.weapon === 'pistol'
      ? (p.reloadT > 0 ? 'PISTOL — RELOADING' : `PISTOL ${p.ammo} / ∞`)
      : 'FISTS';
    this.crosshairEl.style.opacity = p.weapon === 'pistol' && p.mode === 'foot' ? '1' : '0';
    this.objectiveEl.textContent = G.objectiveOverride || G.missions.objectiveText();
    this.promptEl.textContent = this.promptText;
    this.promptEl.style.opacity = this.promptText ? '1' : '0';
    this.promptText = '';
    // Busted meter only while it is filling.
    const bm = G.police.bustedMeter;
    this.bustedWrap.style.opacity = bm > 0.02 ? '1' : '0';
    this.bustedEl.style.width = `${bm * 100}%`;
    this.drawMinimap();
  }

  drawMinimap() {
    const G = this.G;
    const ctx = this.mapCtx;
    const S = this.map.width;
    const half = S / 2;
    const scale = S / 320; // 320 world units across
    const p = G.player.mode === 'car' ? G.player.car.pos : G.player.pos;
    const toMap = (x, z) => [half + (x - p.x) * scale, half + (z - p.z) * scale];
    // Sea, then land.
    ctx.fillStyle = '#1d6f8e';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#8f8672';
    ctx.fillRect(...toMap(-260, -260), 620 * scale, (WATER_Z + 40 + 260) * scale);
    ctx.fillStyle = '#e8d193';
    const [, beachY] = toMap(0, WATER_Z - 36);
    ctx.fillRect(0, beachY, S, S - beachY);
    // Streets.
    ctx.strokeStyle = '#3c4148';
    ctx.lineWidth = Math.max(2, 15 * scale);
    ctx.beginPath();
    for (const line of streetLines()) {
      const [x1, y1] = toMap(line, -260);
      const [x2, y2] = toMap(line, WATER_Z + 60);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      const [x3, y3] = toMap(-260, line);
      const [x4, y4] = toMap(MARINA_X + 130, line);
      ctx.moveTo(x3, y3);
      ctx.lineTo(x4, y4);
    }
    ctx.stroke();
    // Mission target (or Marisol when free).
    const target = G.missions.targetPos();
    if (target) {
      const [tx, ty] = toMap(target.x, target.z);
      ctx.fillStyle = target === MARISOL_POS ? '#ff5da2' : '#ffd23e';
      ctx.beginPath();
      ctx.arc(tx, ty, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Police blips flash blue/red.
    const flash = Math.floor(performance.now() / 280) % 2 === 0;
    for (const car of G.police.cars) {
      const [cx, cy] = toMap(car.pos.x, car.pos.z);
      if (cx < -6 || cy < -6 || cx > S + 6 || cy > S + 6) continue;
      ctx.fillStyle = flash ? '#2266ff' : '#ff2a1a';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic is faint grey.
    ctx.fillStyle = 'rgba(230,230,230,0.5)';
    for (const car of G.traffic.cars) {
      if (car.taken) continue;
      const [cx, cy] = toMap(car.pos.x, car.pos.z);
      if (cx < -4 || cy < -4 || cx > S + 4 || cy > S + 4) continue;
      ctx.fillRect(cx - 1.6, cy - 1.6, 3.2, 3.2);
    }
    // Player arrow at the centre, rotated to the heading.
    const h = G.player.heading;
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(Math.PI - h);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 7);
    ctx.lineTo(0, 3.6);
    ctx.lineTo(-5.5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

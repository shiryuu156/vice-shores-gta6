// Vice Shores — the HUD and the menus. All of it is DOM over the 3D canvas:
// health, cash, wanted stars, ammo, speed, a live 2D minimap (roads, the
// player arrow, police blips, the mission marker), the objective banner, the
// damage vignette and the crosshair — plus the title screen, the pause menu
// and the wasted / busted screens. The HUD never touches the simulation; the
// main loop hands it a snapshot every frame.

import { MISSIONS } from './config.js';

export function createHud() {
  const root = document.getElementById('hud');
  const minimap = document.getElementById('minimap');
  const mctx = minimap.getContext('2d');

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
  }

  function showScreen(name) {
    for (const s of ['title', 'pause', 'wasted', 'busted', 'mission-select']) {
      const el = document.getElementById(`screen-${s}`);
      if (el) el.classList.toggle('hidden', s !== name);
    }
    root.classList.toggle('hidden', name === 'title');
    document.getElementById('crosshair').classList.toggle('hidden', name !== null);
  }

  function drawMinimap(snap) {
    const S = minimap.width;
    const half = 165; // world units shown across the map
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    mctx.clearRect(0, 0, S, S);
    mctx.fillStyle = 'rgba(10, 18, 28, 0.85)';
    mctx.fillRect(0, 0, S, S);
    // roads
    mctx.strokeStyle = '#5a6270';
    mctx.lineWidth = 4;
    for (const c of snap.roadCentres) {
      const [x1] = toMap(c, 0);
      mctx.beginPath(); mctx.moveTo(x1, 0); mctx.lineTo(x1, S); mctx.stroke();
      const [, z1] = toMap(0, c);
      mctx.beginPath(); mctx.moveTo(0, z1); mctx.lineTo(S, z1); mctx.stroke();
    }
    // mission marker
    if (snap.missionTarget) {
      const [mx, mz] = toMap(snap.missionTarget.x, snap.missionTarget.z);
      mctx.fillStyle = '#ffd23f';
      mctx.beginPath(); mctx.arc(mx, mz, 6, 0, Math.PI * 2); mctx.fill();
      mctx.strokeStyle = '#7a5c00';
      mctx.lineWidth = 2;
      mctx.stroke();
    }
    // police blips
    mctx.fillStyle = '#4f8ef7';
    for (const p of snap.police) {
      const [px, pz] = toMap(p.x, p.z);
      mctx.beginPath(); mctx.arc(px, pz, 3.5, 0, Math.PI * 2); mctx.fill();
    }
    // traffic dots
    mctx.fillStyle = 'rgba(220,220,220,0.7)';
    for (const p of snap.traffic) {
      const [px, pz] = toMap(p.x, p.z);
      mctx.fillRect(px - 1.5, pz - 1.5, 3, 3);
    }
    // player arrow, rotated to the heading
    const [px, pz] = toMap(snap.player.x, snap.player.z);
    mctx.save();
    mctx.translate(px, pz);
    mctx.rotate(snap.player.yaw);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(-5, 6); mctx.closePath();
    mctx.fill();
    mctx.restore();
    // north tick
    mctx.fillStyle = '#ffd23f';
    mctx.font = 'bold 11px system-ui, sans-serif';
    mctx.fillText('N', S / 2 - 4, 12);
  }

  function render(snap) {
    // health bar
    const hp = document.getElementById('health-fill');
    if (hp) {
      hp.style.width = `${Math.max(0, snap.health)}%`;
      hp.style.background = snap.health > 50 ? '#4fc46a' : snap.health > 25 ? '#e8b820' : '#d94f4f';
    }
    setText('cash', `$${snap.cash.toLocaleString()}`);
    setText('debt', `DEBT $${snap.debt.toLocaleString()}`);
    // wanted stars
    const stars = document.getElementById('stars');
    if (stars) {
      stars.textContent = '★'.repeat(snap.stars) + '☆'.repeat(5 - snap.stars);
      stars.classList.toggle('hot', snap.stars > 0);
    }
    setText('ammo', snap.reloading ? 'RELOADING…' : `${snap.ammo} / ∞`);
    setText('speed', snap.inCar ? `${Math.round(Math.abs(snap.speed) * 3.6)} km/h` : '');
    setText('car-name', snap.inCar ? snap.carName : '');
    setText('objective', snap.objective);
    setText('timer', snap.timeLeft != null ? `⏱ ${Math.ceil(snap.timeLeft)}s` : '');
    // message banner
    const banner = document.getElementById('banner');
    if (banner) {
      if (snap.message && snap.messageTimer > 0) {
        banner.textContent = snap.message;
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    }
    // damage vignette
    const vig = document.getElementById('vignette');
    if (vig) vig.style.opacity = snap.flashDamage > 0 ? String(Math.min(0.85, snap.flashDamage)) : '0';
    // mission select list state
    const list = document.getElementById('mission-list');
    if (list) {
      for (const m of MISSIONS) {
        const btn = list.querySelector(`[data-mission="${m.id}"]`);
        if (btn) btn.classList.toggle('done', snap.completed[m.id]);
      }
    }
    drawMinimap(snap);
  }

  // Build the mission buttons on the title screen from the mission data.
  function buildMissionList(onPick) {
    const list = document.getElementById('mission-list');
    if (!list) return;
    list.innerHTML = '';
    for (const m of MISSIONS) {
      const btn = document.createElement('button');
      btn.className = 'mission-btn';
      btn.dataset.mission = String(m.id);
      btn.innerHTML = `<b>${m.title}</b><span>$${m.reward} — ${m.brief}</span>`;
      btn.addEventListener('click', () => onPick(m.id));
      list.appendChild(btn);
    }
  }

  return { render, showScreen, buildMissionList, setText };
}

// HUD: every DOM element the player sees, updated from the single game
// state. Crosshair gap follows weapon spread; the kill feed, banners, buy
// menu and plant/defuse bars are plain DOM, styled by index.html.
import { WEAPONS, GRENADE } from './weapons.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    damage: $('damage'),
    healthBar: $('health-fill'),
    healthNum: $('health-num'),
    money: $('money'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    grenades: $('grenade-count'),
    timer: $('timer'),
    scoreV: $('score-v'),
    scoreS: $('score-s'),
    roundNum: $('round-num'),
    feed: $('feed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    objective: $('objective'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    buy: $('buy'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
  };
  let hitTimer = null;
  let damageTimer = null;
  let bannerTimer = null;

  function showOverlay(kind, score) {
    el.overlay.hidden = false;
    if (kind === 'start') {
      el.overlayTitle.textContent = 'SABLE LINE';
      el.overlayCopy.textContent = 'A dusk freight yard. Plant the charge at A or B — or hold the line. Click to play.';
      el.play.textContent = 'Click to play';
    } else if (kind === 'paused') {
      el.overlayTitle.textContent = 'Paused';
      el.overlayCopy.textContent = 'Click to resume the round.';
      el.play.textContent = 'Resume';
    } else if (kind === 'match') {
      el.overlayTitle.textContent = score;
      el.overlayCopy.textContent = 'Match over. Click to play again.';
      el.play.textContent = 'Play again';
    }
  }
  function hideOverlay() { el.overlay.hidden = true; }

  return {
    setHealth(hp) {
      el.healthNum.textContent = Math.max(0, Math.ceil(hp));
      el.healthBar.style.width = `${Math.max(0, hp)}%`;
      el.healthBar.style.background = hp > 50 ? '#7dc383' : hp > 25 ? '#f0a830' : '#e5484d';
    },
    setMoney(m) { el.money.textContent = `$${m}`; },
    setAmmo(mag, reserve, name, grenades) {
      el.ammoMag.textContent = mag;
      el.ammoReserve.textContent = `/ ${reserve}`;
      el.weaponName.textContent = name;
      el.grenades.textContent = `◉ ${grenades}`;
      el.ammoMag.parentElement.classList.toggle('empty', mag === 0);
    },
    setTimer(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      el.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      el.timer.classList.toggle('urgent', s <= 10);
    },
    setScore(v, s, round) {
      el.scoreV.textContent = v;
      el.scoreS.textContent = s;
      el.roundNum.textContent = `ROUND ${round}`;
    },
    setObjective(text) { el.objective.textContent = text; },
    setSpread(px) {
      el.crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(kill) {
      el.hitmarker.classList.add('on');
      if (kill) el.hitmarker.classList.add('kill');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.hitmarker.classList.remove('on', 'kill'), 110);
    },
    damageFlash() {
      el.damage.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => el.damage.classList.remove('on'), 220);
    },
    feedLine(text, friendly) {
      const div = document.createElement('div');
      div.className = 'feed-line';
      if (friendly) div.classList.add('friendly');
      div.textContent = text;
      el.feed.prepend(div);
      while (el.feed.children.length > 5) el.feed.lastChild.remove();
      setTimeout(() => div.remove(), 6000);
    },
    banner(title, sub, ms = 3200) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub;
      el.banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => el.banner.classList.remove('on'), ms);
    },
    plantBar(show, label, progress) {
      el.plantBar.hidden = !show;
      if (show) {
        el.plantLabel.textContent = label;
        el.plantFill.style.width = `${Math.round(progress * 100)}%`;
      }
    },
    buyMenu(show, money, loadout) {
      el.buy.hidden = !show;
      if (!show) return;
      const cards = el.buy.querySelectorAll('.buy-card');
      cards.forEach((card) => {
        const id = card.dataset.weapon;
        const def = id === 'grenade' ? GRENADE : WEAPONS[id];
        const owned = id === 'grenade' ? loadout.grenades >= 2 : !!loadout.owned[id];
        card.querySelector('.buy-price').textContent = owned ? 'OWNED' : `$${def.price}`;
        card.classList.toggle('owned', owned);
        card.classList.toggle('poor', !owned && money < def.price);
      });
    },
    showOverlay, hideOverlay,
    onPlay(fn) { el.play.addEventListener('click', fn); },
    isOverlayHidden() { return el.overlay.hidden; },
  };
}

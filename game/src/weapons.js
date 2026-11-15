// Weapons: four guns and one grenade. Each gun has a fire mode, rate,
// magazine, reserve, damage with head multiplier and falloff, spread that
// grows with movement and sustained fire, and a recoil kick. The buy menu
// reads this table; the HUD reads the live state.
export const WEAPONS = {
  pistol: {
    id: 'pistol', slot: 1, name: 'P9 Sidearm', price: 0, kind: 'pistol',
    auto: false, rate: 0.16, mag: 12, reserveMax: 48, damage: 22, headMult: 3,
    falloffStart: 18, falloffEnd: 45, spread: 0.006, moveSpread: 0.016,
    bloom: 0.004, recoil: 0.011, range: 70,
  },
  carbine: {
    id: 'carbine', slot: 2, name: 'VK-7 Carbine', price: 1100, kind: 'rifle',
    auto: true, rate: 0.1, mag: 30, reserveMax: 120, damage: 26, headMult: 3,
    falloffStart: 22, falloffEnd: 55, spread: 0.008, moveSpread: 0.024,
    bloom: 0.006, recoil: 0.014, range: 90,
  },
  dmr: {
    id: 'dmr', slot: 3, name: 'Longbow DMR', price: 2100, kind: 'dmr',
    auto: false, rate: 0.55, mag: 10, reserveMax: 30, damage: 72, headMult: 2.6,
    falloffStart: 30, falloffEnd: 80, spread: 0.0015, moveSpread: 0.03,
    bloom: 0.01, recoil: 0.05, range: 120, zoom: 2.4,
  },
  shotgun: {
    id: 'shotgun', slot: 4, name: 'Scatter-12', price: 800, kind: 'shotgun',
    auto: false, rate: 0.85, mag: 6, reserveMax: 24, damage: 9, headMult: 2,
    falloffStart: 8, falloffEnd: 22, spread: 0.035, moveSpread: 0.03,
    bloom: 0.012, recoil: 0.06, range: 30, pellets: 8,
  },
};
export const GRENADE = { id: 'grenade', name: 'Spark-9 Frag', price: 250, maxCarry: 2 };

export function createLoadout() {
  const owned = {
    pistol: { def: WEAPONS.pistol, mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserveMax },
  };
  return {
    owned,
    current: 'pistol',
    grenades: 0,
    buy(id) {
      const def = WEAPONS[id];
      if (!def || owned[id]) return false;
      owned[id] = { def, mag: def.mag, reserve: def.reserveMax };
      return true;
    },
    buyGrenade() {
      if (this.grenades >= GRENADE.maxCarry) return false;
      this.grenades += 1;
      return true;
    },
    select(id) {
      if (owned[id]) this.current = id;
    },
    refillAmmo() {
      for (const key of Object.keys(owned)) {
        owned[key].mag = owned[key].def.mag;
        owned[key].reserve = owned[key].def.reserveMax;
      }
    },
    onDeath() {
      for (const key of Object.keys(owned)) {
        if (key !== 'pistol') delete owned[key];
      }
      this.current = 'pistol';
      this.grenades = 0;
      this.refillAmmo();
    },
    currentWeapon() { return owned[this.current]; },
  };
}

export function createWeaponState() {
  return {
    cooldown: 0,
    reloading: 0,
    reloadTime: 0,
    bloom: 0,
    zoomed: false,
    ready() { return this.cooldown <= 0 && this.reloading <= 0; },
    spreadOf(def, groundSpeed, crouched) {
      let s = def.spread + def.moveSpread * Math.min(1, groundSpeed / 5.3);
      if (crouched) s *= 0.6;
      if (this.zoomed) s *= 0.35;
      return s + this.bloom;
    },
    takeRound(loadout) {
      const w = loadout.currentWeapon();
      if (!w || w.mag <= 0) return false;
      w.mag -= 1;
      this.cooldown = w.def.rate;
      this.bloom = Math.min(0.05, this.bloom + w.def.bloom);
      return true;
    },
    startReload(loadout) {
      const w = loadout.currentWeapon();
      if (!w || this.reloading > 0 || w.mag >= w.def.mag || w.reserve <= 0) return false;
      this.reloadTime = w.def.kind === 'shotgun' ? 2.2 : w.def.kind === 'dmr' ? 1.9 : 1.5;
      this.reloading = this.reloadTime;
      return true;
    },
    step(dt, loadout) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.bloom = Math.max(0, this.bloom - dt * 0.09);
      if (this.reloading > 0) {
        this.reloading -= dt;
        if (this.reloading <= 0) {
          const w = loadout.currentWeapon();
          if (w) {
            const need = w.def.mag - w.mag;
            const take = Math.min(need, w.reserve);
            w.mag += take;
            w.reserve -= take;
          }
          this.reloading = 0;
        }
      }
    },
  };
}

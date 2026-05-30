/*
 * Water Tank Card  —  custom Lovelace card for Home Assistant
 * Designed around the Rototec NPI4000 tank (Ø171 · H215 · 4050 L usable),
 * but works with any tank — set your own capacity, colours and thresholds.
 *
 * Install:
 *   1. Copy to  <config>/www/water-tank-card.js
 *   2. Settings > Dashboards > (3 dots) > Resources > Add resource
 *        URL: /local/water-tank-card.js   Type: JavaScript module
 *   3. Add the card (see examples at the bottom). Hard-refresh after updates.
 *
 * No build step, no dependencies — plain Web Component.
 *
 * ---------------------------------------------------------------------------
 * CONFIG OPTIONS
 * ---------------------------------------------------------------------------
 *   percentage_entity (REQUIRED) sensor reporting the level in %  (0-100)
 *   liters_entity     (REQUIRED) sensor reporting the current volume in litres
 *   capacity          full volume for the "… di N L" readout       (default 4050)
 *   name              card title; "" or show_name:false to hide
 *
 *   --- display toggles ------------------------------------------------------
 *   show_name         (default true)
 *   show_percentage   (default true)
 *   show_liters       (default true)
 *   show_status       status pill                            (default true)
 *   show_scale        side scale                             (default true)
 *   show_waves        animated surface waves                 (default true)
 *   show_bubbles      rising bubbles                         (default true)
 *   animate           master switch for all motion           (default true)
 *
 *   --- sizing & scale -------------------------------------------------------
 *   size              tank graphic width in px               (default 140)
 *   scale_step        a tick every N percent                 (default 25)
 *   decimals          decimals on the litre readout          (default 0)
 *
 *   --- thresholds & colors --------------------------------------------------
 *   warn / low        % at/below which fill turns amber / red (default 25 / 15)
 *   water_color / warn_color / low_color   hex fills          (#2f87c9/#e0a32e/#d8513a)
 *   status_labels:    { ok: "OK", warn: "Basso", low: "Critico" }
 *
 *   --- extra info chips -----------------------------------------------------
 *   temperature_entity  optional sensor shown as a chip
 *   chip_decimals       rounding for numeric chips             (default 1)
 *   extra_entities:     - entity: binary_sensor.pump
 *                         name: Pompa
 *                         icon: mdi:water-pump
 *
 *   --- pump control ---------------------------------------------------------
 *   pump_entity       optional switch; renders an on/off toggle in the card
 *   pump_power_entity optional power sensor (W) shown in the pump row
 *   power_threshold   W below which an ON pump is flagged as faulty (default 10)
 *                     -> red warning icon (right of the toggle) + flow suppressed
 *   pump_fault_label  tooltip on the warning icon            (default "Anomalia")
 *   pump_name         label for the toggle                    (default "Pompa")
 *   pump_icon         icon override; if omitted, the entity's own icon is used
 *
 *   --- interaction ----------------------------------------------------------
 *   tap_action        more-info | none   (more-info opens percentage_entity)
 * ---------------------------------------------------------------------------
 */

class WaterTankCard extends HTMLElement {
  setConfig(config) {
    const pctEnt = config && (config.percentage_entity || config.entity);
    if (!pctEnt) {
      throw new Error('water-tank-card: "percentage_entity" (level in %) is required.');
    }
    if (!config.liters_entity) {
      throw new Error('water-tank-card: "liters_entity" (current volume in litres) is required.');
    }
    this._config = Object.assign(
      {
        name: 'Serbatoio',
        capacity: 4050,
        decimals: 0,
        warn: 25,
        low: 15,
        water_color: '#2f87c9',
        warn_color: '#e0a32e',
        low_color: '#d8513a',
        animate: true,
        show_name: true,
        show_percentage: true,
        show_liters: true,
        show_status: true,
        show_scale: true,
        show_waves: true,
        show_bubbles: true,
        size: 140,
        scale_step: 25,
        chip_decimals: 1,
        pump_name: 'Pompa',
        power_threshold: 10,
        pump_fault_label: 'Anomalia',
        tap_action: 'more-info',
        status_labels: {},
      },
      config
    );
    this._config.percentage_entity = pctEnt;
    this._config.status_labels = Object.assign(
      { ok: 'OK', warn: 'Basso', low: 'Critico' },
      config.status_labels || {}
    );
    this._uid = 'npi' + Math.random().toString(36).slice(2, 9);
    this._built = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
    this._update();
  }

  /* ---- helpers --------------------------------------------------------- */
  _shade(hex, p) {
    hex = String(hex).replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = p < 0 ? 0 : 255, a = Math.abs(p);
    r = Math.round((t - r) * a + r);
    g = Math.round((t - g) * a + g);
    b = Math.round((t - b) * a + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  _state(id) {
    const st = this._hass && this._hass.states[id];
    if (!st || ['unavailable', 'unknown', ''].includes(st.state)) return null;
    return st;
  }

  _percentage() {
    const st = this._state(this._config.percentage_entity);
    if (!st) return { pct: 0, ok: false };
    const v = Number(st.state);
    if (Number.isNaN(v)) return { pct: 0, ok: false };
    return { pct: Math.max(0, Math.min(100, v)), ok: true };
  }

  _liters() {
    const st = this._state(this._config.liters_entity);
    if (!st) return { ok: false };
    const v = Number(st.state);
    if (Number.isNaN(v)) return { ok: false };
    const unit = st.attributes.unit_of_measurement || 'L';
    return { ok: true, val: v, unit };
  }

  _scaleSvg() {
    const c = this._config;
    if (!c.show_scale) return '';
    const id = this._uid, top = 60, bot = 286;
    const step = Math.max(1, Number(c.scale_step) || 25);
    const pts = [];
    for (let p = 0; p <= 100 + 1e-6; p += step) pts.push(Math.round(p));
    if (pts[pts.length - 1] !== 100) pts.push(100);
    let out = '<g>';
    pts.forEach((p) => {
      const y = bot - (p / 100) * (bot - top);
      const label = p === 100 ? '100%' : String(p);
      out +=
        `<line class="${id}-tick" x1="44" x2="56" y1="${y}" y2="${y}"/>` +
        `<text class="${id}-lbl" text-anchor="end" x="40" y="${y + 4.5}">${label}</text>`;
    });
    return out + '</g>';
  }

  _chipsSvg() {
    const c = this._config;
    const id = this._uid;
    let chips = '';
    let i = 0;
    this._chipMap = [];
    if (c.temperature_entity) {
      chips += `<span class="${id}-chip"><ha-icon icon="mdi:thermometer"></ha-icon>` +
        `<span id="${id}chip${i}"></span></span>`;
      this._chipMap.push({ kind: 'temp', entity: c.temperature_entity });
      i++;
    }
    (c.extra_entities || []).forEach((e) => {
      const icon = e.icon ? `<ha-icon icon="${e.icon}"></ha-icon>` : '';
      chips += `<span class="${id}-chip">${icon}<span id="${id}chip${i}"></span></span>`;
      this._chipMap.push({ kind: 'extra', entity: e.entity, name: e.name });
      i++;
    });
    return chips ? `<div class="${id}-chips">${chips}</div>` : '';
  }

  _pumpSvg() {
    const c = this._config;
    if (!c.pump_entity) return '';
    const id = this._uid;
    const icon = c.pump_icon
      ? `<ha-icon icon="${c.pump_icon}"></ha-icon>`
      : `<ha-state-icon id="${id}pumpicon"></ha-state-icon>`;
    const power = c.pump_power_entity
      ? `<span class="${id}-pumpsub" id="${id}pumppow"></span>` : '';
    const warn = c.pump_power_entity
      ? `<svg class="${id}-pumpwarn" id="${id}pumpwarn" viewBox="0 0 24 24"><title>${c.pump_fault_label || 'Anomalia'}</title><path fill="var(--error-color,#d8513a)" d="M13,14H11V10H13M13,18H11V16H13M1,21H23L12,2L1,21Z"/></svg>`
      : '';
    return `<div class="${id}-pump" id="${id}pumprow">${icon}` +
      `<div class="${id}-pumptext"><span class="${id}-pumpname" id="${id}pumpname">${c.pump_name || 'Pompa'}</span>${power}</div>` +
      `<ha-switch id="${id}pump"></ha-switch>${warn}</div>`;
  }

  _fireMoreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent('hass-more-info', {
      bubbles: true, composed: true, detail: { entityId },
    }));
  }

  _flowSvg() {
    const c = this._config;
    if (!c.pump_entity) return '';
    const id = this._uid;
    const pipe = 'M199,16 L191,40 C184,54 176,60 172,76 L172,250';
    const wc = c.water_color || '#2f87c9';
    const spin = c.animate
      ? '<animateTransform attributeName="transform" type="rotate" from="0 172 273" to="360 172 273" dur="1.1s" repeatCount="indefinite"/>'
      : '';
    return `<g id="${id}flow" style="display:none;">` +
      `<path d="${pipe}" fill="none" stroke="var(--secondary-text-color)" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>` +
      `<path d="${pipe}" fill="none" stroke="#dfe4e8" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path id="${id}flowline" d="${pipe}" fill="none" stroke="${wc}" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 12"/>` +
      `<rect x="168.5" y="246" width="7" height="8" rx="2" fill="#3f474f"/>` +
      `<rect x="159" y="251" width="26" height="20" rx="7" fill="#5b6b7d"/>` +
      `<rect x="162" y="254" width="5" height="14" rx="2.5" fill="#ffffff" opacity="0.18"/>` +
      `<rect x="178" y="254" width="4.5" height="14" rx="2.2" fill="#000000" opacity="0.12"/>` +
      `<circle cx="172" cy="273" r="8" fill="#46505c"/>` +
      `<circle cx="172" cy="273" r="6.2" fill="#e9eef2" stroke="#3a424d" stroke-width="1"/>` +
      `<g fill="#3a424d">${spin}` +
        `<path d="M172,273 Q174,269 172,267 Q170,269 172,273"/>` +
        `<path d="M172,273 Q176,275 178,273 Q176,271 172,273"/>` +
        `<path d="M172,273 Q170,277 172,279 Q174,277 172,273"/>` +
        `<path d="M172,273 Q168,271 166,273 Q168,275 172,273"/></g>` +
      `<circle cx="172" cy="273" r="1.7" fill="#2c333c"/>` +
      `</g>`;
  }

  /* ---- build static DOM once ------------------------------------------ */
  _build() {
    const c = this._config;
    const id = this._uid;
    const body =
      'M60,90 C60,66 76,58 100,58 L152,58 C176,58 192,66 192,90 ' +
      'L192,256 C192,280 176,288 152,288 L100,288 C76,288 60,280 60,256 Z';
    const wave = 'q10,-9 20,0' + ' t20,0'.repeat(15);
    const motion = c.animate;

    this.innerHTML = `
      <ha-card style="${c.tap_action !== 'none' ? 'cursor:pointer;' : ''}">
        <style>
          @keyframes ${id}w1{from{transform:translateX(0)}to{transform:translateX(-40px)}}
          @keyframes ${id}w2{from{transform:translateX(0)}to{transform:translateX(40px)}}
          @keyframes ${id}bub{0%{transform:translateY(0);opacity:0}20%{opacity:.5}100%{transform:translateY(-150px);opacity:0}}
          .${id}-wrap{display:flex;align-items:center;justify-content:center;gap:14px;padding:16px;}
          .${id}-info{display:flex;flex-direction:column;gap:3px;min-width:0;}
          .${id}-name{font-size:15px;font-weight:500;color:var(--primary-text-color);
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
          .${id}-top{display:flex;align-items:baseline;gap:9px;}
          .${id}-pct{font-size:34px;font-weight:500;line-height:1.05;color:var(--primary-text-color);}
          .${id}-pill{font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;white-space:nowrap;line-height:1.6;}
          .${id}-l{font-size:14px;color:var(--secondary-text-color);}
          .${id}-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
          .${id}-chip{display:inline-flex;align-items:center;gap:6px;font-size:13px;line-height:1;
                      padding:5px 11px;
                      border-radius:999px;background:var(--secondary-background-color,rgba(0,0,0,.06));
                      color:var(--secondary-text-color);}
          .${id}-chip ha-icon{--mdc-icon-size:16px;width:16px;height:16px;display:flex;
                      align-items:center;justify-content:center;flex:0 0 auto;color:var(--secondary-text-color);}
          .${id}-pump{display:flex;align-items:center;gap:11px;margin-top:12px;padding-top:12px;
                      border-top:1px solid var(--divider-color,rgba(0,0,0,.12));}
          .${id}-pumptext{display:flex;flex-direction:column;line-height:1.25;min-width:0;}
          .${id}-pumpname{font-size:14px;color:var(--primary-text-color);}
          .${id}-pumpsub{font-size:12px;color:var(--secondary-text-color);font-variant-numeric:tabular-nums;}
          .${id}-pumpwarn{width:21px;height:21px;display:none;flex:0 0 auto;margin-left:2px;}
          .${id}-pump ha-icon,.${id}-pump ha-state-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;
                      align-items:center;justify-content:center;color:var(--secondary-text-color);flex:0 0 auto;}
          .${id}-pump ha-switch{flex:0 0 auto;margin-left:auto;}
          #${id}water{transition:transform .7s cubic-bezier(.34,1.1,.64,1);}
          .${id}-rib{stroke:var(--primary-text-color);stroke-opacity:.08;stroke-width:3;}
          .${id}-bodybg{fill:var(--ha-card-background,var(--card-background-color,#fff));}
          .${id}-line{fill:none;stroke:var(--secondary-text-color);stroke-width:2.5;}
          .${id}-cap{fill:var(--divider-color,#c8cfd6);stroke:var(--secondary-text-color);stroke-width:2;}
          .${id}-tick{stroke:var(--secondary-text-color);stroke-opacity:.65;stroke-width:1.5;}
          .${id}-lbl{fill:var(--secondary-text-color);font-size:13px;}
          ${motion && c.show_waves ? `#${id}w0{animation:${id}w1 7s linear infinite;}#${id}w1{animation:${id}w1 5.5s linear infinite;}#${id}w2{animation:${id}w2 8s linear infinite;}` : ''}
          ${motion && c.show_bubbles ? `.${id}-bub{animation:${id}bub 4.5s ease-in infinite;}` : ''}
          @keyframes ${id}flow{from{stroke-dashoffset:0}to{stroke-dashoffset:34}}
          ${motion ? `#${id}flowline{animation:${id}flow .9s linear infinite;}` : ''}
          @media (prefers-reduced-motion: reduce){#${id}w0,#${id}w1,#${id}w2,.${id}-bub,#${id}flowline{animation:none!important;}}
        </style>
        <div class="${id}-wrap">
          <svg width="${c.size}" viewBox="0 0 210 314" role="img" aria-labelledby="${id}t ${id}d">
            <title id="${id}t">Water tank</title>
            <desc id="${id}d">Vertical tank with current water level and side scale.</desc>
            <defs>
              <clipPath id="${id}clip"><path d="${body}"/></clipPath>
              <linearGradient id="${id}grad" x1="0" y1="0" x2="0" y2="1">
                <stop id="${id}g0" offset="0"/><stop id="${id}g1" offset="1"/>
              </linearGradient>
            </defs>
            <ellipse cx="126" cy="300" rx="58" ry="8" fill="#000" opacity="0.06"/>
            ${this._scaleSvg()}
            <g>
              <rect class="${id}-cap" x="104" y="49" width="44" height="13" rx="4"/>
              <ellipse class="${id}-cap" cx="126" cy="47" rx="25" ry="6.5"/>
              <ellipse class="${id}-cap" cx="126" cy="44" rx="22" ry="5.5"/>
              <ellipse cx="119" cy="42.8" rx="8" ry="2.4" fill="#fff" opacity="0.32"/>
              <path d="M118,44 q8,-12 16,0" fill="none" stroke="var(--secondary-text-color)" stroke-width="2.5" stroke-linecap="round"/>
            </g>
            <path class="${id}-bodybg" d="${body}"/>
            <g clip-path="url(#${id}clip)">
              <g id="${id}water" style="transform:translateY(286px);">
                ${c.show_waves
                  ? `<path id="${id}w0" d="M-60,0 ${wave} v360 h-320 z" fill="url(#${id}grad)"/>
                <path id="${id}w1" d="M-60,2 ${wave} v34 h-320 z" fill-opacity="0.5"/>
                <path id="${id}w2" d="M-60,4 ${wave} v30 h-320 z" fill-opacity="0.38"/>`
                  : `<rect x="60" y="0" width="132" height="360" fill="url(#${id}grad)"/>`}
                ${c.show_bubbles ? `<circle class="${id}-bub" cx="98" cy="160" r="3" fill="#fff" opacity="0"/>
                <circle class="${id}-bub" cx="142" cy="170" r="2.2" fill="#fff" opacity="0" style="animation-delay:1.6s"/>
                <circle class="${id}-bub" cx="120" cy="150" r="2.6" fill="#fff" opacity="0" style="animation-delay:3s"/>` : ''}
              </g>
              <rect x="74" y="64" width="14" height="216" rx="7" fill="#fff" opacity="0.10"/>
              <ellipse cx="104" cy="82" rx="30" ry="12" fill="#fff" opacity="0.06"/>
              <g class="${id}-rib">
                <line x1="60" y1="104" x2="192" y2="104"/><line x1="60" y1="132" x2="192" y2="132"/>
                <line x1="60" y1="160" x2="192" y2="160"/><line x1="60" y1="188" x2="192" y2="188"/>
                <line x1="60" y1="216" x2="192" y2="216"/><line x1="60" y1="244" x2="192" y2="244"/>
              </g>
            </g>
            <path class="${id}-line" d="${body}"/>
            ${this._flowSvg()}
          </svg>
          <div class="${id}-info">
            ${c.show_name ? `<div class="${id}-name" id="${id}name"></div>` : ''}
            <div class="${id}-top">
              ${c.show_percentage ? `<span class="${id}-pct" id="${id}pct">--</span>` : ''}
              ${c.show_status ? `<span class="${id}-pill" id="${id}pill"></span>` : ''}
            </div>
            ${c.show_liters ? `<div class="${id}-l" id="${id}l"></div>` : ''}
            ${this._chipsSvg()}
            ${this._pumpSvg()}
          </div>
        </div>
      </ha-card>`;

    const $ = (s) => this.querySelector('#' + id + s);
    this._el = {
      water: $('water'), g0: $('g0'), g1: $('g1'),
      w1: c.show_waves ? $('w1') : null, w2: c.show_waves ? $('w2') : null,
      name: c.show_name ? $('name') : null,
      pct: c.show_percentage ? $('pct') : null,
      pill: c.show_status ? $('pill') : null,
      l: c.show_liters ? $('l') : null,
      chips: (this._chipMap || []).map((_, idx) => $('chip' + idx)),
      pump: c.pump_entity ? $('pump') : null,
      pumpicon: c.pump_entity && !c.pump_icon ? $('pumpicon') : null,
      pumpname: c.pump_entity ? $('pumpname') : null,
      pumppow: c.pump_power_entity ? $('pumppow') : null,
      pumpwarn: c.pump_power_entity ? $('pumpwarn') : null,
      flow: c.pump_entity ? $('flow') : null,
      flowline: c.pump_entity ? $('flowline') : null,
    };
    this._svg = this.querySelector('svg');

    if (this._el.pump) {
      const row = $('pumprow');
      if (row) row.addEventListener('click', (e) => e.stopPropagation());
      this._el.pump.addEventListener('change', (e) => {
        e.stopPropagation();
        if (this._pumpBusy) return;
        const ent = c.pump_entity;
        const domain = ent.split('.')[0];
        this._hass.callService(domain, this._el.pump.checked ? 'turn_on' : 'turn_off', {
          entity_id: ent,
        });
      });
    }

    // Per-element more-info: chip -> its entity, pump name -> switch, power -> power sensor
    const clickTo = (el, entity) => {
      if (!el || !entity) return;
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._fireMoreInfo(entity);
      });
    };
    (this._chipMap || []).forEach((m, idx) => clickTo(this._el.chips[idx], m.entity));
    clickTo(this._el.l, c.liters_entity);
    clickTo(this._el.pumpname, c.pump_entity);
    clickTo(this._el.pumppow, c.pump_power_entity);

    if (c.tap_action !== 'none') {
      this.querySelector('ha-card').addEventListener('click', () => {
        this._fireMoreInfo(c.percentage_entity);
      });
    }
    this._geo = { top: 60, bot: 286 };
    this._built = true;
  }

  /* ---- update dynamic parts ------------------------------------------- */
  _update() {
    if (!this._built) return;
    const c = this._config;
    const { pct, ok } = this._percentage();
    const lit = this._liters();
    const { top, bot } = this._geo;
    const y = bot - (pct / 100) * (bot - top);
    this._el.water.style.transform = 'translateY(' + y + 'px)';

    const base = pct <= c.low ? c.low_color : pct <= c.warn ? c.warn_color : c.water_color;
    this._el.g0.setAttribute('stop-color', this._shade(base, 0.16));
    this._el.g1.setAttribute('stop-color', this._shade(base, -0.14));
    if (this._el.w1) this._el.w1.setAttribute('fill', this._shade(base, 0.28));
    if (this._el.w2) this._el.w2.setAttribute('fill', this._shade(base, 0.42));

    if (this._el.name) this._el.name.textContent = c.name;

    const fmt = new Intl.NumberFormat('it-IT');
    if (this._el.pct) {
      this._el.pct.textContent = ok ? pct.toFixed(0) + '%' : 'n/d';
      this._el.pct.style.color = ok && pct > c.low
        ? 'var(--primary-text-color)' : 'var(--secondary-text-color)';
    }
    if (this._el.l) {
      this._el.l.textContent = lit.ok
        ? fmt.format(Number(lit.val.toFixed(c.decimals))) + ' ' + lit.unit + ' di ' + fmt.format(c.capacity) + ' L'
        : 'litri non disponibili';
    }
    if (this._el.pill) {
      if (!ok) {
        this._el.pill.style.display = 'none';
      } else {
        this._el.pill.style.display = '';
        let label, bg, fg;
        if (pct <= c.low) { label = c.status_labels.low; bg = c.low_color; fg = '#fff'; }
        else if (pct <= c.warn) { label = c.status_labels.warn; bg = c.warn_color; fg = '#222'; }
        else { label = c.status_labels.ok; bg = 'var(--success-color, #2f9e44)'; fg = '#fff'; }
        this._el.pill.textContent = label;
        this._el.pill.style.background = bg;
        this._el.pill.style.color = fg;
      }
    }
    const chipFmt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: c.chip_decimals });
    (this._chipMap || []).forEach((m, idx) => {
      const span = this._el.chips[idx];
      if (!span) return;
      const st = this._state(m.entity);
      let val;
      if (!st) {
        val = 'n/d';
      } else {
        const num = Number(st.state);
        const shown = Number.isNaN(num) ? st.state : chipFmt.format(num);
        const unit = st.attributes.unit_of_measurement ? ' ' + st.attributes.unit_of_measurement : '';
        val = shown + unit;
      }
      span.textContent = m.name ? m.name + ' ' + val : val;
    });

    if (this._el.pump) {
      const st = this._hass.states[c.pump_entity];
      const avail = st && !['unavailable', 'unknown'].includes(st.state);
      this._pumpBusy = true;
      this._el.pump.checked = avail && st.state === 'on';
      this._el.pump.disabled = !avail;
      this._pumpBusy = false;
      if (this._el.pumpicon) {
        this._el.pumpicon.hass = this._hass;
        this._el.pumpicon.stateObj = st;
      }
      const on = avail && st.state === 'on';
      let fault = false;
      if (on && c.pump_power_entity) {
        const ps = this._state(c.pump_power_entity);
        const pv = ps ? Number(ps.state) : NaN;
        fault = !ps || Number.isNaN(pv) || pv < c.power_threshold;
      }
      this._pumpFault = fault;
      if (this._el.flow) {
        this._el.flow.style.display = on ? '' : 'none';
      }
      if (this._el.flowline) {
        this._el.flowline.setAttribute('stroke', fault ? 'var(--error-color, #d8513a)' : (c.water_color || '#2f87c9'));
        this._el.flowline.style.animationPlayState = fault ? 'paused' : 'running';
      }
      if (this._svg) {
        if (fault) this._svg.pauseAnimations();
        else this._svg.unpauseAnimations();
      }
    }
    if (this._el.pumppow) {
      const ps = this._state(c.pump_power_entity);
      if (!ps) {
        this._el.pumppow.textContent = '';
      } else {
        const num = Number(ps.state);
        const shown = Number.isNaN(num) ? ps.state : chipFmt.format(num);
        const unit = ps.attributes.unit_of_measurement ? ' ' + ps.attributes.unit_of_measurement : ' W';
        this._el.pumppow.textContent = shown + unit;
      }
      this._el.pumppow.style.color = 'var(--secondary-text-color)';
    }
    if (this._el.pumpwarn) {
      this._el.pumpwarn.style.display = this._pumpFault ? 'block' : 'none';
    }
  }

  getCardSize() { return 3; }
  static getConfigElement() { return document.createElement('water-tank-card-editor'); }
  static getStubConfig() { return { percentage_entity: '', liters_entity: '' }; }
}

customElements.define('water-tank-card', WaterTankCard);

/* ------------------------------------------------------------------------ *
 *  Visual editor (UI configuration) — built on Home Assistant's <ha-form>
 *  Edits made here and in the YAML (Code) editor stay in sync automatically.
 * ------------------------------------------------------------------------ */
const WTC_EDITOR_DEFAULTS = {
  name: 'Serbatoio', capacity: 4050, decimals: 0, warn: 25, low: 15,
  water_color: '#2f87c9', warn_color: '#e0a32e', low_color: '#d8513a',
  animate: true, show_name: true, show_percentage: true, show_liters: true,
  show_status: true, show_scale: true, show_waves: true, show_bubbles: true,
  size: 140, scale_step: 25, chip_decimals: 1, pump_name: 'Pompa', power_threshold: 10,
  pump_fault_label: 'Anomalia', tap_action: 'more-info',
};

const WTC_EDITOR_LABELS = {
  percentage_entity: 'Entità percentuale (richiesta)',
  liters_entity: 'Entità litri (richiesta)',
  name: 'Nome', capacity: 'Capacità (L)',
  size: 'Dimensione (px)', scale_step: 'Passo scala (%)', decimals: 'Decimali litri',
  warn: 'Soglia "Basso" (%)', low: 'Soglia "Critico" (%)',
  show_name: 'Mostra nome', show_percentage: 'Mostra %', show_liters: 'Mostra litri',
  show_status: 'Mostra stato', show_scale: 'Mostra scala', show_waves: 'Onde',
  show_bubbles: 'Bollicine', animate: 'Animazioni',
  water_color: 'Colore acqua (hex)', warn_color: 'Colore "Basso" (hex)',
  low_color: 'Colore "Critico" (hex)',
  temperature_entity: 'Entità temperatura (opz.)', tap_action: 'Azione al tocco',
  pump_entity: 'Interruttore pompa (opz.)', pump_name: 'Etichetta pompa',
  pump_power_entity: 'Potenza pompa (opz.)', power_threshold: 'Soglia minima potenza (W)',
  pump_fault_label: 'Testo badge anomalia',
};

const WTC_EDITOR_SCHEMA = [
  { name: 'percentage_entity', selector: { entity: {} } },
  { name: 'liters_entity', selector: { entity: {} } },
  { type: 'grid', schema: [
    { name: 'name', selector: { text: {} } },
    { name: 'capacity', selector: { number: { mode: 'box', min: 0, step: 1, unit_of_measurement: 'L' } } },
  ] },
  { type: 'grid', schema: [
    { name: 'size', selector: { number: { mode: 'box', min: 80, max: 400, step: 1, unit_of_measurement: 'px' } } },
    { name: 'scale_step', selector: { number: { mode: 'box', min: 1, max: 50, step: 1, unit_of_measurement: '%' } } },
    { name: 'decimals', selector: { number: { mode: 'box', min: 0, max: 3, step: 1 } } },
    { name: 'warn', selector: { number: { mode: 'box', min: 0, max: 100, step: 1, unit_of_measurement: '%' } } },
    { name: 'low', selector: { number: { mode: 'box', min: 0, max: 100, step: 1, unit_of_measurement: '%' } } },
  ] },
  { type: 'grid', schema: [
    { name: 'show_name', selector: { boolean: {} } },
    { name: 'show_percentage', selector: { boolean: {} } },
    { name: 'show_liters', selector: { boolean: {} } },
    { name: 'show_status', selector: { boolean: {} } },
    { name: 'show_scale', selector: { boolean: {} } },
    { name: 'show_waves', selector: { boolean: {} } },
    { name: 'show_bubbles', selector: { boolean: {} } },
    { name: 'animate', selector: { boolean: {} } },
  ] },
  { type: 'grid', schema: [
    { name: 'water_color', selector: { text: {} } },
    { name: 'warn_color', selector: { text: {} } },
    { name: 'low_color', selector: { text: {} } },
  ] },
  { name: 'temperature_entity', selector: { entity: {} } },
  { name: 'pump_entity', selector: { entity: { domain: 'switch' } } },
  { name: 'pump_name', selector: { text: {} } },
  { name: 'pump_power_entity', selector: { entity: { domain: 'sensor', device_class: 'power' } } },
  { name: 'power_threshold', selector: { number: { mode: 'box', min: 0, step: 1, unit_of_measurement: 'W' } } },
  { name: 'pump_fault_label', selector: { text: {} } },
  { name: 'tap_action', selector: { select: { mode: 'dropdown', options: [
    { value: 'more-info', label: 'Apri dettagli' },
    { value: 'none', label: 'Nessuna' },
  ] } } },
];

class WaterTankCardEditor extends HTMLElement {
  setConfig(config) { this._config = config; this._render(); }
  set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; }
  _render() {
    if (!this._form) {
      this._form = document.createElement('ha-form');
      this._form.computeLabel = (s) => WTC_EDITOR_LABELS[s.name] || s.name;
      this._form.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        this.dispatchEvent(new CustomEvent('config-changed', {
          detail: { config: ev.detail.value }, bubbles: true, composed: true,
        }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = WTC_EDITOR_SCHEMA;
    this._form.data = Object.assign({}, WTC_EDITOR_DEFAULTS, this._config || {});
  }
}
customElements.define('water-tank-card-editor', WaterTankCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'water-tank-card',
  name: 'Water Tank Card',
  preview: false,
  description: 'Water-level card for any tank — percentage + litres entities.',
});

console.info('%c WATER-TANK-CARD %c v4 loaded ', 'background:#2f87c9;color:#fff;border-radius:3px 0 0 3px;', 'background:#5a6470;color:#fff;border-radius:0 3px 3px 0;');

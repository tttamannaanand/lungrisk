import {
  aqiBand,
  AQI_BANDS,
  cigarettesPerDay,
  CITIES,
  describeCigarettes,
  fetchCities,
  WHO_24H_PM25,
  type AqiLabel,
  type City,
  type CityAir,
} from '../src/air.ts';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const SVG = 'http://www.w3.org/2000/svg';
const svg = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

const BAND_CLASS: Record<AqiLabel, string> = {
  Good: 'aq-good',
  Satisfactory: 'aq-sat',
  Moderate: 'aq-mod',
  Poor: 'aq-poor',
  'Very poor': 'aq-vpoor',
  Severe: 'aq-severe',
};

// Rough equirectangular projection of India's bounding box.
const LON0 = 68;
const LON1 = 97;
const LAT0 = 6;
const LAT1 = 37;
const W = 320;
const H = 320;
const project = (c: City) => ({
  x: 50 + ((c.lon - LON0) / (LON1 - LON0)) * (W - 100),
  y: 10 + ((LAT1 - c.lat) / (LAT1 - LAT0)) * (H - 20),
});
// Labels that would collide with a neighbour go on the left.
// Only cities with room get a permanent label; the rest show on hover/selection
// (and always appear in the ranked list). Some labels sit left to avoid neighbours.
const LABELED = new Set([
  'Srinagar',
  'Chandigarh',
  'Delhi',
  'Jaipur',
  'Patna',
  'Guwahati',
  'Ahmedabad',
  'Kolkata',
  'Mumbai',
  'Nagpur',
  'Hyderabad',
  'Bengaluru',
  'Chennai',
  'Kochi',
]);
const LABEL_LEFT = new Set([
  'Ahmedabad',
  'Kochi',
  'Mumbai',
  'Srinagar',
  'Jaipur',
  'Hyderabad',
  'Bengaluru',
]);

type Row = { city: City; air: CityAir };
let rows: Row[] = [];
let selected = 'Bengaluru';

const fmt = (n: number | null, digits = 0) => (n === null ? '–' : n.toFixed(digits));

function renderLegend() {
  let lo = 0;
  $('legend').replaceChildren(
    ...AQI_BANDS.map((b) => {
      const li = document.createElement('li');
      const range = b.max === Infinity ? `${lo}+` : `${lo}–${b.max}`;
      li.innerHTML = `<i class="${BAND_CLASS[b.label]}"></i>${b.label} <small>${range}</small>`;
      lo = b.max;
      return li;
    }),
  );
}

function renderMap() {
  const map = $('map');
  const nodes: SVGElement[] = [];
  for (const { city, air } of rows) {
    if (air.last24h === null) continue;
    const { x, y } = project(city);
    const cigs = cigarettesPerDay(air.last24h);
    const r = 4 + Math.min(Math.sqrt(cigs) * 4, 16);
    const g = svg('g', {
      class: `pin ${city.name === selected ? 'sel' : ''}`,
      tabindex: 0,
      role: 'button',
    });
    g.setAttribute('aria-label', `${city.name}: ${cigs.toFixed(1)} cigarettes`);
    g.append(svg('circle', { cx: x, cy: y, r, class: BAND_CLASS[aqiBand(air.last24h)] }));
    const left = LABEL_LEFT.has(city.name);
    const label = svg('text', {
      x: left ? x - r - 3 : x + r + 3,
      y: y + 3.5,
      'text-anchor': left ? 'end' : 'start',
    });
    label.textContent = city.name;
    if (!LABELED.has(city.name)) label.classList.add('on-demand');
    const tip = svg('title', {});
    tip.textContent = `${city.name}: ${cigs.toFixed(1)} cigarettes`;
    g.append(label, tip);
    const pick = () => select(city.name);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') pick();
    });
    nodes.push(g);
  }
  // Draw the selected city last so it sits on top.
  nodes.sort((a, b) => Number(a.classList.contains('sel')) - Number(b.classList.contains('sel')));
  map.replaceChildren(...nodes);
}

function renderRanking() {
  const sorted = [...rows].sort((a, b) => (b.air.last24h ?? -1) - (a.air.last24h ?? -1));
  $('ranking').replaceChildren(
    ...sorted.map(({ city, air }) => {
      const li = document.createElement('li');
      const pm = air.last24h;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = city.name === selected ? 'sel' : '';
      btn.innerHTML = `<span class="rk-name"><i class="${pm === null ? '' : BAND_CLASS[aqiBand(pm)]}"></i>${city.name}</span>
        <span class="rk-cigs">${pm === null ? 'no data' : `${cigarettesPerDay(pm).toFixed(1)} <small>cigs</small>`}</span>
        <span class="rk-pm">${fmt(pm)} µg/m³</span>`;
      btn.addEventListener('click', () => select(city.name));
      li.append(btn);
      return li;
    }),
  );
}

function renderChart(air: CityAir) {
  const chart = $('chart');
  const [cw, ch, padL, padB, padT] = [320, 150, 30, 20, 10];
  const vals = air.next48.pm25;
  const max = Math.max(60, ...vals.filter((v): v is number => v !== null)) * 1.1;
  const x = (k: number) => padL + (k / Math.max(vals.length - 1, 1)) * (cw - padL - 6);
  const y = (v: number) => padT + (1 - v / max) * (ch - padT - padB);
  const nodes: SVGElement[] = [];

  // Shaded AQI bands behind the line.
  let lo = 0;
  for (const b of AQI_BANDS) {
    const hi = Math.min(b.max, max);
    if (lo < max) {
      nodes.push(
        svg('rect', {
          x: padL,
          y: y(hi),
          width: cw - padL - 6,
          height: y(lo) - y(hi),
          class: `band ${BAND_CLASS[b.label]}`,
        }),
      );
    }
    lo = b.max;
  }
  // WHO guideline line.
  nodes.push(
    svg('line', { x1: padL, x2: cw - 6, y1: y(WHO_24H_PM25), y2: y(WHO_24H_PM25), class: 'who' }),
  );
  const who = svg('text', {
    x: cw - 8,
    y: y(WHO_24H_PM25) - 3,
    'text-anchor': 'end',
    class: 'axis',
  });
  who.textContent = 'WHO daily limit';
  nodes.push(who);

  const pts = vals.map((v, k) => (v === null ? null : `${x(k)},${y(v)}`)).filter(Boolean);
  if (pts.length) {
    nodes.push(
      svg('polygon', {
        points: `${x(0)},${y(0)} ${pts.join(' ')} ${x(vals.length - 1)},${y(0)}`,
        class: 'area',
      }),
    );
    nodes.push(svg('polyline', { points: pts.join(' '), class: 'line' }));
  }
  // Axis labels: y max and every 12 hours on x.
  const yTop = svg('text', { x: padL - 4, y: padT + 4, 'text-anchor': 'end', class: 'axis' });
  yTop.textContent = String(Math.round(max));
  const y0 = svg('text', { x: padL - 4, y: y(0), 'text-anchor': 'end', class: 'axis' });
  y0.textContent = '0';
  nodes.push(yTop, y0);
  air.next48.time.forEach((t, k) => {
    if (k % 12) return;
    const d = new Date(t);
    const label = svg('text', {
      x: x(k),
      y: ch - 4,
      'text-anchor': k === 0 ? 'start' : 'middle',
      class: 'axis',
    });
    label.textContent =
      k === 0 ? 'Now' : d.toLocaleString('en-IN', { weekday: 'short', hour: 'numeric' });
    nodes.push(label);
  });
  chart.replaceChildren(...nodes);
}

function renderCity() {
  const row = rows.find((r) => r.city.name === selected);
  if (!row) return;
  const { air } = row;
  ($('citySelect') as HTMLSelectElement).value = selected;
  $('cityName').textContent = selected;

  if (air.last24h === null) {
    $('cigsNum').textContent = '–';
    $('cityLine').textContent = 'No data for this city right now.';
    return;
  }
  const cigs = cigarettesPerDay(air.last24h);
  $('cigsNum').textContent = cigs < 0.1 ? '<0.1' : cigs.toFixed(1);
  $('cigsUnit').textContent = cigs >= 0.95 && cigs < 1.05 ? 'cigarette' : 'cigarettes';

  // One icon per whole cigarette, plus a partial one, capped for sanity.
  const icons = $('cigIcons');
  const whole = Math.min(Math.floor(cigs), 30);
  const part = cigs - Math.floor(cigs);
  icons.replaceChildren(
    ...Array.from({ length: whole }, () =>
      Object.assign(document.createElement('i'), { className: 'cig' }),
    ),
    ...(part >= 0.05 && whole < 30
      ? [
          Object.assign(document.createElement('i'), {
            className: 'cig part',
            style: `--part:${part}`,
          }),
        ]
      : []),
  );
  const band = aqiBand(air.last24h);
  const whoTimes = air.last24h / WHO_24H_PM25;
  $('cityLine').textContent =
    `Average PM2.5 ${fmt(air.last24h)} µg/m³: "${band}" on India's AQI scale` +
    (whoTimes >= 1.1
      ? `, ${whoTimes.toFixed(1)}× the WHO daily limit.`
      : ', within the WHO daily limit.');

  const [d1, d2] = air.forecast;
  $('day1').textContent = d1 === null ? '–' : describeCigarettes(cigarettesPerDay(d1));
  $('day2').textContent = d2 === null ? '–' : describeCigarettes(cigarettesPerDay(d2));
  $('peak').textContent = air.peak
    ? `${fmt(air.peak.pm25)} µg/m³, ${new Date(air.peak.time).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric' })}`
    : '–';
  renderChart(air);
}

function select(name: string) {
  selected = name;
  try {
    localStorage.setItem('air-city', name);
  } catch {
    // storage blocked: the page still works, it just won't remember
  }
  renderMap();
  renderRanking();
  renderCity();
}

async function load() {
  try {
    const saved = localStorage.getItem('air-city');
    if (saved && CITIES.some((c) => c.name === saved)) selected = saved;
  } catch {
    // ignore
  }
  const sel = $('citySelect') as HTMLSelectElement;
  sel.replaceChildren(
    ...[...CITIES]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => new Option(c.name, c.name)),
  );
  sel.addEventListener('change', () => select(sel.value));
  renderLegend();

  try {
    rows = await fetchCities();
  } catch (e) {
    $('updated').textContent = 'Could not load';
    $('updated').className = 'tag extrapolated';
    $('cityLine').textContent =
      `Couldn't reach the air quality service (${(e as Error).message}). Try again in a minute.`;
    return;
  }
  $('updated').textContent =
    `Updated ${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
  select(selected);
}

void load();

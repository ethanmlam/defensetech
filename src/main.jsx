import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import DeckGL from '@deck.gl/react';
import {Map} from 'react-map-gl/maplibre';
import {PathLayer, ScatterplotLayer, PolygonLayer, TextLayer, ArcLayer} from '@deck.gl/layers';
import {HeatmapLayer} from '@deck.gl/aggregation-layers';
import {Crosshair, Eye, GlobeHemisphereWest, Broadcast, Radio, Boat, Warning, MapPin, ClockCountdown, Anchor} from '@phosphor-icons/react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LAST_KNOWN_INDEX = 38;
const TOTAL_TICKS = 108;
const START = new Date('2024-01-17T14:12:00Z');
const CABLE_ROUTE = [[-118.545, 33.742], [-118.34, 33.66], [-118.12, 33.57], [-117.91, 33.48], [-117.68, 33.405], [-117.43, 33.35]];
const CABLE_BUFFER = [[-118.51, 33.79], [-118.26, 33.70], [-118.02, 33.61], [-117.76, 33.53], [-117.45, 33.42], [-117.48, 33.31], [-117.80, 33.40], [-118.05, 33.49], [-118.31, 33.58], [-118.58, 33.68]];
const SATELLITE_PASS = [[-118.72, 33.92], [-118.46, 33.78], [-118.18, 33.62], [-117.88, 33.46], [-117.54, 33.31]];
const LANDING_STATION = [-118.39, 33.72];
const CANDIDATE_CONTACTS = [
  {position: [-117.84, 33.492], confidence: 71, label: 'CONTACT A'},
  {position: [-117.735, 33.438], confidence: 89, label: 'CONTACT B'},
  {position: [-117.97, 33.374], confidence: 41, label: 'CONTACT C'},
];

function interpolate(a, b, t) {
  return a + (b - a) * t;
}

function generateTargetTrack() {
  const anchors = [
    [-118.31, 33.724],
    [-118.235, 33.684],
    [-118.125, 33.628],
    [-118.006, 33.574],
    [-117.89, 33.523],
    [-117.736, 33.438],
    [-117.58, 33.374],
  ];
  const points = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    for (let j = 0; j < 16; j++) {
      const t = j / 16;
      const wobble = Math.sin((i * 16 + j) / 4.7) * 0.005;
      points.push({
        position: [interpolate(anchors[i][0], anchors[i + 1][0], t), interpolate(anchors[i][1], anchors[i + 1][1], t) + wobble],
        ts: new Date(START.getTime() + points.length * 2 * 60 * 1000).toISOString(),
        sog: 12.9 + Math.sin(points.length / 6) * 1.4,
        cog: 118 + Math.cos(points.length / 8) * 9,
      });
    }
  }
  return points;
}

function generateBackgroundTraffic() {
  const seeds = [
    {id: 'cargo-17', start: [-118.58, 33.56], dx: .62, dy: .13, color: [57, 118, 160, 70]},
    {id: 'tanker-09', start: [-118.50, 33.83], dx: .34, dy: -.34, color: [57, 118, 160, 58]},
    {id: 'fishing-44', start: [-117.97, 33.78], dx: -.18, dy: -.26, color: [57, 118, 160, 48]},
    {id: 'cargo-22', start: [-118.22, 33.36], dx: .58, dy: .08, color: [57, 118, 160, 55]},
    {id: 'service-03', start: [-118.62, 33.66], dx: .25, dy: -.08, color: [57, 118, 160, 48]},
    {id: 'ro-ro-31', start: [-117.62, 33.71], dx: -.48, dy: -.04, color: [57, 118, 160, 45]},
  ];
  return seeds.map((s, i) => {
    const path = [];
    for (let k = 0; k < 42; k++) {
      const t = k / 41;
      path.push([s.start[0] + s.dx * t, s.start[1] + s.dy * t + Math.sin(k / 4 + i) * .012]);
    }
    return {...s, path};
  });
}

function generateParticles(last, tick) {
  const age = Math.max(0, tick - LAST_KNOWN_INDEX);
  const particles = [];
  const heading = -0.0102;
  const drift = -0.0051;
  for (let i = 0; i < 520; i++) {
    const spread = age * 0.0023;
    const turn = Math.sin(i * 2.17) * spread + (Math.random() - 0.5) * spread * 0.85;
    const speedJitter = 0.67 + ((i * 37) % 100) / 118;
    const lon = last[0] + heading * age * speedJitter + Math.cos(i * 1.7) * spread * 0.62;
    const lat = last[1] + drift * age * speedJitter + turn;
    particles.push({position: [lon, lat], weight: 0.4 + Math.sin(i) * 0.2});
  }
  return particles;
}

function ellipsePolygon(center, tick) {
  const age = Math.max(3, tick - LAST_KNOWN_INDEX);
  const cx = center[0] - 0.0102 * age * 0.95;
  const cy = center[1] - 0.0051 * age * 0.95;
  const rx = Math.max(0.045, age * 0.0047);
  const ry = Math.max(0.025, age * 0.0028);
  const pts = [];
  for (let i = 0; i < 80; i++) {
    const a = (Math.PI * 2 * i) / 80;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

function sensorScores(tick) {
  const afterLoss = tick > LAST_KNOWN_INDEX;
  const confidence = Math.min(92, 48 + (tick - LAST_KNOWN_INDEX) * 1.05);
  return [
    {name: 'SAR Radar', icon: Broadcast, score: afterLoss ? Math.round(confidence) : 38, why: 'cloud independent, night capable, sees metal hulls'},
    {name: 'EO Satellite', icon: GlobeHemisphereWest, score: afterLoss ? 21 : 49, why: 'marine layer blocks optical confirmation'},
    {name: 'AIS Receiver', icon: Radio, score: afterLoss ? 6 : 82, why: 'target is non-cooperative after dropout'},
  ];
}

function fmtTime(index) {
  const d = new Date(START.getTime() + index * 2 * 60 * 1000);
  return d.toISOString().slice(11, 16) + ' UTC';
}

function missionEvents(tick, reveal) {
  const items = [
    ['14:12', 'Cable corridor watchlist loaded'],
    ['14:42', 'MMSI 367-demo-104 deviates toward Pacific Lightwave-3'],
  ];
  if (tick >= LAST_KNOWN_INDEX) items.push(['15:28', 'AIS LOST within 37 nm of cable route']);
  if (tick >= 48) items.push(['15:38', 'Reachability model predicts cable intercept window']);
  if (tick >= 56) items.push(['15:44', 'EO rejected, coastal cloud deck detected']);
  if (tick >= 62) items.push(['15:52', 'SAR tasking polygon generated']);
  if (tick >= 70) items.push(['16:00', 'Candidate radar contacts entering cable buffer']);
  if (reveal) items.push(['16:12', 'Contact B reacquired inside predicted box']);
  return items.slice(-6);
}

function distanceNm(a, b) {
  const dx = (a[0] - b[0]) * 60 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  const dy = (a[1] - b[1]) * 60;
  return Math.sqrt(dx * dx + dy * dy);
}

function App() {
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const track = useMemo(generateTargetTrack, []);
  const traffic = useMemo(generateBackgroundTraffic, []);
  const displayIndex = Math.min(tick, track.length - 1);
  const lost = tick >= LAST_KNOWN_INDEX;
  const reveal = tick > 82;
  const lastKnown = track[LAST_KNOWN_INDEX].position;
  const liveTrail = track.slice(0, lost ? LAST_KNOWN_INDEX + 1 : displayIndex + 1);
  const truthTrail = reveal ? track.slice(LAST_KNOWN_INDEX, displayIndex + 1) : [];
  const probability = lost && !reveal ? generateParticles(lastKnown, tick) : [];
  const polygon = lost ? ellipsePolygon(lastKnown, tick) : [];
  const contacts = tick > 65 ? CANDIDATE_CONTACTS.slice(0, reveal ? 3 : 2) : [];
  const events = missionEvents(tick, reveal);
  const sweepStart = [-118.56, 33.91];
  const sweepEnd = polygon[Math.floor(polygon.length * 0.62)] || lastKnown;
  const current = track[displayIndex]?.position || lastKnown;
  const nmToCable = Math.max(7, distanceNm(current, CABLE_ROUTE[3]) - (lost ? 0 : 5));
  const minutesToCable = Math.max(18, Math.round((nmToCable / 13.2) * 60));

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTick((x) => (x >= TOTAL_TICKS ? 0 : x + 1)), 250);
    return () => clearInterval(id);
  }, [playing]);

  const layers = [
    new PolygonLayer({
      id: 'cable-buffer',
      data: [{polygon: CABLE_BUFFER}],
      getPolygon: d => d.polygon,
      getFillColor: [255, 71, 91, 24],
      getLineColor: [255, 71, 91, 105],
      getLineWidth: 2,
      lineWidthMinPixels: 1,
    }),
    new PathLayer({
      id: 'undersea-cable',
      data: [{path: CABLE_ROUTE}],
      getPath: d => d.path,
      getColor: [255, 76, 102, 235],
      getWidth: 7,
      widthMinPixels: 4,
      rounded: true,
    }),
    new PathLayer({
      id: 'undersea-cable-glow',
      data: [{path: CABLE_ROUTE}],
      getPath: d => d.path,
      getColor: [255, 76, 102, 52],
      getWidth: 28,
      widthMinPixels: 18,
      rounded: true,
    }),
    new PathLayer({
      id: 'background-traffic',
      data: traffic,
      getPath: d => d.path,
      getColor: d => d.color,
      getWidth: 2,
      widthMinPixels: 1,
      rounded: true,
    }),
    new ScatterplotLayer({
      id: 'background-vessels',
      data: traffic.map(t => ({position: t.path[Math.min(displayIndex % t.path.length, t.path.length - 1)]})),
      getPosition: d => d.position,
      getRadius: 70,
      radiusMinPixels: 3,
      radiusMaxPixels: 7,
      getFillColor: [79, 167, 220, 90],
    }),
    new PathLayer({
      id: 'ais-trail',
      data: [{path: liveTrail.map(d => d.position)}],
      getPath: d => d.path,
      getColor: [62, 210, 255, 230],
      getWidth: 6,
      widthMinPixels: 4,
      rounded: true,
    }),
    new ScatterplotLayer({
      id: 'ais-points',
      data: liveTrail,
      getPosition: d => d.position,
      getRadius: 90,
      getFillColor: [46, 211, 255, 180],
      getLineColor: [180, 245, 255, 220],
      lineWidthMinPixels: 1,
      stroked: true,
    }),
    new HeatmapLayer({
      id: 'probability-cloud',
      data: probability,
      getPosition: d => d.position,
      getWeight: d => d.weight,
      radiusPixels: 54,
      intensity: 1.5,
      threshold: 0.03,
      colorRange: [[255, 164, 28, 0], [255, 174, 34, 80], [255, 122, 35, 135], [255, 66, 58, 190], [255, 235, 104, 230]],
    }),
    new PolygonLayer({
      id: 'sar-tasking-polygon',
      data: lost ? [{polygon}] : [],
      getPolygon: d => d.polygon,
      getFillColor: reveal ? [36, 255, 152, 42] : [255, 176, 46, 36],
      getLineColor: reveal ? [54, 255, 166, 245] : [255, 185, 58, 240],
      getLineWidth: 4,
      lineWidthMinPixels: 2,
    }),
    new PathLayer({
      id: 'satellite-pass',
      data: lost ? [{path: SATELLITE_PASS}] : [],
      getPath: d => d.path,
      getColor: [134, 218, 255, 165],
      getWidth: 3,
      widthMinPixels: 2,
    }),
    new ArcLayer({
      id: 'sensor-sweep',
      data: lost ? [{from: sweepStart, to: sweepEnd}] : [],
      getSourcePosition: d => d.from,
      getTargetPosition: d => d.to,
      getSourceColor: [97, 255, 176, 210],
      getTargetColor: [255, 210, 75, 210],
      getWidth: 4,
      greatCircle: false,
    }),
    new PathLayer({
      id: 'truth-trail',
      data: truthTrail.length ? [{path: truthTrail.map(d => d.position)}] : [],
      getPath: d => d.path,
      getColor: [69, 255, 157, 245],
      getWidth: 7,
      widthMinPixels: 5,
      rounded: true,
    }),
    new ScatterplotLayer({
      id: 'candidate-contacts',
      data: contacts,
      getPosition: d => d.position,
      getRadius: d => d.confidence * 6,
      radiusMinPixels: 8,
      radiusMaxPixels: 23,
      getFillColor: d => d.confidence > 80 ? [58, 255, 164, 190] : [255, 187, 64, 150],
      getLineColor: [255, 255, 255, 230],
      lineWidthMinPixels: 2,
      stroked: true,
    }),
    new ScatterplotLayer({
      id: 'landing-station',
      data: [{position: LANDING_STATION}],
      getPosition: d => d.position,
      getRadius: 500,
      radiusMinPixels: 10,
      radiusMaxPixels: 22,
      getFillColor: [255, 76, 102, 150],
      getLineColor: [255, 255, 255, 230],
      lineWidthMinPixels: 2,
      stroked: true,
    }),
    new ScatterplotLayer({
      id: 'last-known',
      data: lost ? [{position: lastKnown}] : [],
      getPosition: d => d.position,
      getRadius: 620,
      radiusMinPixels: 14,
      radiusMaxPixels: 36,
      getFillColor: [255, 58, 69, 75],
      getLineColor: [255, 76, 86, 255],
      lineWidthMinPixels: 3,
      stroked: true,
    }),
    new TextLayer({
      id: 'labels',
      data: [
        {position: LANDING_STATION, text: 'CABLE LANDING'},
        {position: CABLE_ROUTE[3], text: 'PACIFIC LIGHTWAVE-3'},
        ...(lost ? [{position: lastKnown, text: 'AIS LOST'}] : []),
        ...(tick > 65 ? contacts.map(c => ({position: c.position, text: `${c.label} ${c.confidence}%`})) : []),
        ...(lost ? [{position: SATELLITE_PASS[2], text: 'SAR PASS'}] : []),
        ...(reveal ? [{position: track[Math.min(displayIndex, track.length - 1)].position, text: 'REACQUIRED'}] : []),
      ],
      getPosition: d => d.position,
      getText: d => d.text,
      getSize: 16,
      getColor: [255, 255, 255, 242],
      getPixelOffset: [0, -34],
      background: true,
      getBackgroundColor: [8, 13, 22, 220],
      backgroundPadding: [8, 5],
    }),
  ];

  const scores = sensorScores(tick);
  const top = scores[0];
  const progress = Math.round((tick / TOTAL_TICKS) * 100);

  return <div className="app">
    <DeckGL initialViewState={{longitude: -118.03, latitude: 33.61, zoom: 8.65, pitch: 48, bearing: -23}} controller={true} layers={layers}>
      <Map mapStyle={MAP_STYLE} />
    </DeckGL>

    <header className="hud topbar">
      <div className="brand"><Crosshair size={26} weight="fill" /> <span>DarkWake</span></div>
      <div className="tag">Critical infrastructure maritime watchfloor</div>
      <div className="status-pill"><span></span> LIVE WATCH</div>
      <button className="play" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
    </header>

    <section className="hud mission">
      <div className="eyebrow">Selected incident</div>
      <h1>{lost ? reveal ? 'AIS-dark vessel reacquired near cable buffer' : 'AIS-dark vessel approaching cable corridor' : 'Vessel deviating toward cable route'}</h1>
      <p>{lost ? 'DarkWake predicts the reachable ocean area and tasks SAR before the vessel reaches critical undersea infrastructure.' : 'A cooperative vessel is drifting off-route toward a protected cable corridor.'}</p>
      <div className="threat-score"><span>Threat score</span><b>{lost ? reveal ? '82' : '91' : '64'}</b><small>/100</small></div>
      <div className="statgrid">
        <div><Boat size={18}/><span>Target</span><b>MMSI 367-demo-104</b></div>
        <div><Anchor size={18}/><span>Asset</span><b>Pacific Lightwave-3</b></div>
        <div><ClockCountdown size={18}/><span>Time to cable</span><b>{minutesToCable} min</b></div>
        <div><MapPin size={18}/><span>Distance</span><b>{nmToCable.toFixed(1)} nm</b></div>
      </div>
      {lost && <div className="alert"><Warning size={18} weight="fill" /> AIS dropout inside critical infrastructure watch zone</div>}
    </section>

    <section className="hud sensors">
      <div className="eyebrow">Recommended next tasking</div>
      <div className="recommend"><top.icon /> <strong>{top.name}</strong><span>{top.score}%</span></div>
      <div className="cards">
        {scores.map((s) => {
          const Icon = s.icon;
          return <div className={s.name === 'SAR Radar' && lost ? 'card hot' : 'card'} key={s.name}>
            <div><Icon size={22}/><b>{s.name}</b></div>
            <meter min="0" max="100" value={s.score}></meter>
            <p>{s.score}% · {s.why}</p>
          </div>;
        })}
      </div>
      {lost && <div className="taskbox"><Eye size={18}/> TASK SAR BEFORE CABLE INTERCEPT<br/><span>42.6 km² box, expected reacquisition window: 24 min</span></div>}
    </section>

    <section className="hud watchlist">
      <div className="eyebrow">Cable watchlist</div>
      <div className="watch hot"><b>HIGH</b><span>AIS-dark vessel near Pacific Lightwave-3</span></div>
      <div className="watch med"><b>MED</b><span>Fishing cluster loitering near route buffer</span></div>
      <div className="watch low"><b>LOW</b><span>Cargo lane deviation, likely weather</span></div>
    </section>

    <section className="hud intel">
      <div className="eyebrow">Mission event stream</div>
      {events.map(([time, text], i) => <div className="event" key={time + text}>
        <span>{time}</span><p>{text}</p>{i === events.length - 1 && <b>LIVE</b>}
      </div>)}
    </section>

    <div className="reticle"><span></span><span></span></div>

    <footer className="hud timeline">
      <div className="bar"><div style={{width: `${progress}%`}} /></div>
      <div className="ticks"><span>Route deviation</span><span>AIS lost</span><span>SAR tasking</span><span>Reacquired</span></div>
    </footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);

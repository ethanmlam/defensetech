import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import DeckGL from '@deck.gl/react';
import {Map} from 'react-map-gl/maplibre';
import {PathLayer, ScatterplotLayer, PolygonLayer, TextLayer, ArcLayer} from '@deck.gl/layers';
import {HeatmapLayer} from '@deck.gl/aggregation-layers';
import {Crosshair, Eye, GlobeHemisphereWest, Broadcast, Radio, Boat, Warning, MapPin, ClockCountdown} from '@phosphor-icons/react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LAST_KNOWN_INDEX = 38;
const TOTAL_TICKS = 98;
const START = new Date('2024-01-17T14:12:00Z');

function interpolate(a, b, t) {
  return a + (b - a) * t;
}

function generateTrack() {
  const anchors = [
    [-118.268, 33.706],
    [-118.208, 33.665],
    [-118.116, 33.623],
    [-118.016, 33.574],
    [-117.892, 33.526],
    [-117.742, 33.474],
    [-117.596, 33.436],
  ];
  const points = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    for (let j = 0; j < 15; j++) {
      const t = j / 15;
      const wobble = Math.sin((i * 15 + j) / 5) * 0.006;
      points.push({
        position: [interpolate(anchors[i][0], anchors[i + 1][0], t), interpolate(anchors[i][1], anchors[i + 1][1], t) + wobble],
        ts: new Date(START.getTime() + points.length * 2 * 60 * 1000).toISOString(),
        sog: 13.6 + Math.sin(points.length / 7) * 1.1,
        cog: 111 + Math.cos(points.length / 8) * 8,
      });
    }
  }
  return points;
}

function generateParticles(last, tick) {
  const age = Math.max(0, tick - LAST_KNOWN_INDEX);
  const particles = [];
  const heading = -0.0105;
  const drift = -0.0044;
  for (let i = 0; i < 420; i++) {
    const spread = age * 0.0024;
    const turn = Math.sin(i * 2.17) * spread + (Math.random() - 0.5) * spread * 0.9;
    const speedJitter = 0.65 + ((i * 37) % 100) / 120;
    const lon = last[0] + heading * age * speedJitter + Math.cos(i * 1.7) * spread * 0.65;
    const lat = last[1] + drift * age * speedJitter + turn;
    particles.push({position: [lon, lat], weight: 0.4 + Math.sin(i) * 0.2});
  }
  return particles;
}

function ellipsePolygon(center, tick) {
  const age = Math.max(3, tick - LAST_KNOWN_INDEX);
  const cx = center[0] - 0.0105 * age * 0.95;
  const cy = center[1] - 0.0044 * age * 0.95;
  const rx = Math.max(0.045, age * 0.0049);
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
  const confidence = Math.min(91, 42 + (tick - LAST_KNOWN_INDEX) * 1.2);
  return [
    {name: 'SAR Radar', icon: Broadcast, score: afterLoss ? Math.round(confidence) : 34, why: 'all-weather, night capable, wide-area'},
    {name: 'EO Satellite', icon: GlobeHemisphereWest, score: afterLoss ? 23 : 52, why: 'cloud layer + low sun angle'},
    {name: 'AIS Receiver', icon: Radio, score: afterLoss ? 8 : 78, why: 'target is now non-cooperative'},
  ];
}

function fmtTime(index) {
  const d = new Date(START.getTime() + index * 2 * 60 * 1000);
  return d.toISOString().slice(11, 16) + ' UTC';
}

function App() {
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const track = useMemo(generateTrack, []);
  const displayIndex = Math.min(tick, track.length - 1);
  const lost = tick >= LAST_KNOWN_INDEX;
  const reveal = tick > 78;
  const lastKnown = track[LAST_KNOWN_INDEX].position;
  const liveTrail = track.slice(0, lost ? LAST_KNOWN_INDEX + 1 : displayIndex + 1);
  const truthTrail = reveal ? track.slice(LAST_KNOWN_INDEX, displayIndex + 1) : [];
  const probability = lost && !reveal ? generateParticles(lastKnown, tick) : [];
  const polygon = lost ? ellipsePolygon(lastKnown, tick) : [];
  const sweepStart = [-118.52, 33.88];
  const sweepEnd = polygon[Math.floor(polygon.length * 0.62)] || lastKnown;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTick((x) => (x >= TOTAL_TICKS ? 0 : x + 1)), 260);
    return () => clearInterval(id);
  }, [playing]);

  const layers = [
    new PathLayer({
      id: 'ais-trail',
      data: [{path: liveTrail.map(d => d.position)}],
      getPath: d => d.path,
      getColor: [62, 210, 255, 220],
      getWidth: 5,
      widthMinPixels: 3,
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
      radiusPixels: 52,
      intensity: 1.4,
      threshold: 0.03,
      colorRange: [
        [255, 164, 28, 0],
        [255, 174, 34, 80],
        [255, 122, 35, 135],
        [255, 66, 58, 190],
        [255, 235, 104, 230],
      ],
    }),
    new PolygonLayer({
      id: 'sar-tasking-polygon',
      data: lost ? [{polygon}] : [],
      getPolygon: d => d.polygon,
      getFillColor: reveal ? [36, 255, 152, 42] : [255, 176, 46, 35],
      getLineColor: reveal ? [54, 255, 166, 245] : [255, 185, 58, 240],
      getLineWidth: 4,
      lineWidthMinPixels: 2,
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
      data: lost ? [
        {position: lastKnown, text: 'AIS LOST'},
        ...(reveal ? [{position: track[Math.min(displayIndex, track.length - 1)].position, text: 'GROUND TRUTH'}] : []),
      ] : [],
      getPosition: d => d.position,
      getText: d => d.text,
      getSize: 17,
      getColor: [255, 255, 255, 240],
      getPixelOffset: [0, -34],
      background: true,
      getBackgroundColor: [8, 13, 22, 210],
      backgroundPadding: [8, 5],
    }),
  ];

  const scores = sensorScores(tick);
  const top = scores[0];
  const progress = Math.round((tick / TOTAL_TICKS) * 100);

  return <div className="app">
    <DeckGL
      initialViewState={{longitude: -118.03, latitude: 33.62, zoom: 8.6, pitch: 45, bearing: -22}}
      controller={true}
      layers={layers}
    >
      <Map mapStyle={MAP_STYLE} />
    </DeckGL>

    <header className="hud topbar">
      <div className="brand"><Crosshair size={26} weight="fill" /> <span>DarkWake</span></div>
      <div className="tag">Lost target reacquisition + sensor tasking</div>
      <button className="play" onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
    </header>

    <section className="hud mission">
      <div className="eyebrow">Live replay, NOAA AIS style feed</div>
      <h1>{lost ? reveal ? 'Target reacquired inside SAR box' : 'Vessel went AIS-dark' : 'Tracking cooperative vessel'}</h1>
      <p>{lost ? 'We predict the reachable ocean area, then rank sensors by chance of reacquisition.' : 'Real maritime tracks stream in as timestamped AIS detections.'}</p>
      <div className="statgrid">
        <div><Boat size={18}/><span>MMSI</span><b>367‑demo‑104</b></div>
        <div><ClockCountdown size={18}/><span>Time</span><b>{fmtTime(displayIndex)}</b></div>
        <div><MapPin size={18}/><span>Speed</span><b>{track[displayIndex]?.sog.toFixed(1)} kn</b></div>
      </div>
      {lost && <div className="alert"><Warning size={18} weight="fill" /> AIS dropout detected at {fmtTime(LAST_KNOWN_INDEX)}</div>}
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
      {lost && <div className="taskbox"><Eye size={18}/> TASK SAR OVER SEARCH POLYGON<br/><span>38.2 km², expected reacquisition window: 26 min</span></div>}
    </section>

    <footer className="hud timeline">
      <div className="bar"><div style={{width: `${progress}%`}} /></div>
      <div className="ticks"><span>Normal AIS</span><span>AIS lost</span><span>SAR tasking</span><span>Reveal</span></div>
    </footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);

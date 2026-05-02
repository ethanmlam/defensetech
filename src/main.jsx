import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import DeckGL from '@deck.gl/react';
import {Map} from 'react-map-gl/maplibre';
import {PathLayer, ScatterplotLayer, PolygonLayer, TextLayer} from '@deck.gl/layers';
import {Crosshair, Broadcast, Radio, Boat, Warning, MapPin, ClockCountdown, Anchor, ShieldWarning} from '@phosphor-icons/react';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const START = new Date('2024-01-17T14:12:00Z');
const TOTAL_TICKS = 100;
const LAST_KNOWN_INDEX = 30;

const CABLE_ROUTE = [[-118.54, 33.745], [-118.34, 33.66], [-118.12, 33.57], [-117.91, 33.48], [-117.68, 33.405], [-117.43, 33.35]];
const CABLE_BUFFER = [[-118.51, 33.79], [-118.26, 33.70], [-118.02, 33.61], [-117.76, 33.53], [-117.45, 33.42], [-117.48, 33.31], [-117.80, 33.40], [-118.05, 33.49], [-118.31, 33.58], [-118.58, 33.68]];
const LANDING_STATION = [-118.39, 33.72];
const SAR_BOX = [[-117.93, 33.56], [-117.62, 33.46], [-117.70, 33.33], [-118.01, 33.43]];
const REACQUIRED = [-117.735, 33.438];

function interpolate(a, b, t) {
  return a + (b - a) * t;
}

function generateTrack() {
  const anchors = [
    [-118.31, 33.724],
    [-118.22, 33.676],
    [-118.10, 33.620],
    [-117.99, 33.566],
    [-117.89, 33.523],
    [-117.735, 33.438],
    [-117.58, 33.374],
  ];
  const points = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    for (let j = 0; j < 12; j++) {
      const t = j / 12;
      points.push({
        position: [interpolate(anchors[i][0], anchors[i + 1][0], t), interpolate(anchors[i][1], anchors[i + 1][1], t)],
        ts: new Date(START.getTime() + points.length * 2 * 60 * 1000).toISOString(),
      });
    }
  }
  return points;
}

function stageForTick(tick) {
  if (tick < 28) return 0;
  if (tick < 55) return 1;
  if (tick < 78) return 2;
  return 3;
}

function fmtTime(index) {
  const d = new Date(START.getTime() + index * 2 * 60 * 1000);
  return d.toISOString().slice(11, 16) + ' UTC';
}

function incidents(stage) {
  return [
    {
      severity: 'HIGH',
      title: 'AIS-dark vessel near cable corridor',
      meta: 'Pacific Lightwave-3 · 37 nm from route',
      active: true,
    },
    {
      severity: 'MED',
      title: 'Loitering cluster outside EEZ boundary',
      meta: '3 fishing vessels · pattern anomaly',
      active: false,
    },
    {
      severity: 'LOW',
      title: 'Cargo deviation toward weather cell',
      meta: 'Likely benign · monitoring only',
      active: false,
    },
    {
      severity: 'LOW',
      title: 'Delayed port arrival report',
      meta: 'Transponder healthy · no tasking',
      active: false,
    },
  ].map((x, i) => ({...x, muted: i > 0 || stage === 0}));
}

function stageCopy(stage) {
  return [
    {
      kicker: 'Route anomaly',
      title: 'Vessel deviates toward protected cable route',
      body: 'DarkWake flags a cooperative AIS vessel entering a critical infrastructure watch zone.',
      status: 'Monitoring',
    },
    {
      kicker: 'Custody loss',
      title: 'AIS signal lost inside cable buffer',
      body: 'The track stops 37 nautical miles from the Pacific Lightwave-3 cable corridor.',
      status: 'High risk',
    },
    {
      kicker: 'Sensor tasking',
      title: 'SAR is recommended for reacquisition',
      body: 'EO is degraded by coastal cloud cover. AIS is no longer useful. SAR gets the next look.',
      status: 'Task SAR',
    },
    {
      kicker: 'Reacquired',
      title: 'Radar contact found inside search box',
      body: 'Contact B appears inside the predicted SAR box before reaching the cable route.',
      status: 'Matched',
    },
  ][stage];
}

function App() {
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const track = useMemo(generateTrack, []);
  const stage = stageForTick(tick);
  const copy = stageCopy(stage);
  const displayIndex = Math.min(stage === 0 ? tick : LAST_KNOWN_INDEX, track.length - 1);
  const visibleTrack = track.slice(0, displayIndex + 1);
  const hiddenTrack = stage === 3 ? track.slice(LAST_KNOWN_INDEX, Math.min(track.length - 1, LAST_KNOWN_INDEX + 30)) : [];
  const progress = Math.round((tick / TOTAL_TICKS) * 100);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setTick((x) => (x >= TOTAL_TICKS ? 0 : x + 1)), 420);
    return () => clearInterval(id);
  }, [playing]);

  const layers = [
    new PolygonLayer({
      id: 'cable-buffer',
      data: [{polygon: CABLE_BUFFER}],
      getPolygon: d => d.polygon,
      getFillColor: [255, 71, 91, 20],
      getLineColor: [255, 71, 91, 110],
      getLineWidth: 2,
      lineWidthMinPixels: 1,
    }),
    new PathLayer({
      id: 'cable-route-glow',
      data: [{path: CABLE_ROUTE}],
      getPath: d => d.path,
      getColor: [255, 76, 102, 45],
      getWidth: 26,
      widthMinPixels: 16,
      rounded: true,
    }),
    new PathLayer({
      id: 'cable-route',
      data: [{path: CABLE_ROUTE}],
      getPath: d => d.path,
      getColor: [255, 76, 102, 240],
      getWidth: 6,
      widthMinPixels: 4,
      rounded: true,
    }),
    new PolygonLayer({
      id: 'sar-box',
      data: stage >= 2 ? [{polygon: SAR_BOX}] : [],
      getPolygon: d => d.polygon,
      getFillColor: stage === 3 ? [59, 255, 166, 34] : [255, 184, 67, 34],
      getLineColor: stage === 3 ? [59, 255, 166, 235] : [255, 184, 67, 235],
      getLineWidth: 4,
      lineWidthMinPixels: 2,
    }),
    new PathLayer({
      id: 'visible-track',
      data: [{path: visibleTrack.map(d => d.position)}],
      getPath: d => d.path,
      getColor: [72, 204, 255, 235],
      getWidth: 5,
      widthMinPixels: 3,
      rounded: true,
    }),
    new PathLayer({
      id: 'reacquired-track',
      data: hiddenTrack.length ? [{path: hiddenTrack.map(d => d.position)}] : [],
      getPath: d => d.path,
      getColor: [78, 255, 172, 235],
      getWidth: 6,
      widthMinPixels: 4,
      rounded: true,
    }),
    new ScatterplotLayer({
      id: 'last-known',
      data: stage >= 1 ? [{position: track[LAST_KNOWN_INDEX].position}] : [],
      getPosition: d => d.position,
      getRadius: 560,
      radiusMinPixels: 15,
      radiusMaxPixels: 30,
      getFillColor: [255, 65, 88, 80],
      getLineColor: [255, 65, 88, 255],
      lineWidthMinPixels: 3,
      stroked: true,
    }),
    new ScatterplotLayer({
      id: 'landing-station',
      data: [{position: LANDING_STATION}],
      getPosition: d => d.position,
      getRadius: 440,
      radiusMinPixels: 10,
      radiusMaxPixels: 22,
      getFillColor: [255, 76, 102, 150],
      getLineColor: [255, 255, 255, 220],
      lineWidthMinPixels: 2,
      stroked: true,
    }),
    new ScatterplotLayer({
      id: 'reacquired-contact',
      data: stage === 3 ? [{position: REACQUIRED}] : [],
      getPosition: d => d.position,
      getRadius: 520,
      radiusMinPixels: 14,
      radiusMaxPixels: 28,
      getFillColor: [73, 255, 164, 150],
      getLineColor: [255, 255, 255, 240],
      lineWidthMinPixels: 2,
      stroked: true,
    }),
    new TextLayer({
      id: 'labels',
      data: [
        {position: LANDING_STATION, text: 'CABLE LANDING'},
        {position: CABLE_ROUTE[3], text: 'PACIFIC LIGHTWAVE-3'},
        ...(stage >= 1 ? [{position: track[LAST_KNOWN_INDEX].position, text: 'AIS LOST'}] : []),
        ...(stage >= 2 ? [{position: SAR_BOX[1], text: 'SAR SEARCH BOX'}] : []),
        ...(stage === 3 ? [{position: REACQUIRED, text: 'CONTACT B MATCH'}] : []),
      ],
      getPosition: d => d.position,
      getText: d => d.text,
      getSize: 15,
      getColor: [255, 255, 255, 242],
      getPixelOffset: [0, -30],
      background: true,
      getBackgroundColor: [7, 12, 22, 225],
      backgroundPadding: [8, 5],
    }),
  ];

  return <div className="app">
    <DeckGL initialViewState={{longitude: -118.03, latitude: 33.60, zoom: 8.75, pitch: 42, bearing: -20}} controller={true} layers={layers}>
      <Map mapStyle={MAP_STYLE} />
    </DeckGL>

    <header className="top-nav">
      <div className="brand"><Crosshair size={24} weight="fill" /><span>DarkWake</span></div>
      <div className="nav-copy">Maritime critical infrastructure watch</div>
      <div className="live-dot"><span></span>LIVE</div>
      <button onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button>
    </header>

    <aside className="left-panel panel">
      <div className="panel-title">Incident feed</div>
      {incidents(stage).map((incident) => <div className={`incident ${incident.active ? 'selected' : ''} ${incident.muted ? 'muted' : ''}`} key={incident.title}>
        <div className={`severity ${incident.severity.toLowerCase()}`}>{incident.severity}</div>
        <div>
          <h3>{incident.title}</h3>
          <p>{incident.meta}</p>
        </div>
      </div>)}
    </aside>

    <section className="center-card panel">
      <div className="kicker">{copy.kicker}</div>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      <div className="status-row">
        <span>{copy.status}</span>
        <b>{fmtTime(Math.min(tick, LAST_KNOWN_INDEX + 30))}</b>
      </div>
    </section>

    <aside className="right-panel panel">
      <div className="panel-title">Selected target</div>
      <div className="target-header">
        <Boat size={22}/>
        <div><h2>MMSI 367-demo-104</h2><p>Unidentified cargo-class vessel</p></div>
      </div>
      <div className="metrics">
        <div><ShieldWarning size={18}/><span>Threat</span><b>{stage === 0 ? '64' : stage === 3 ? '82' : '91'}/100</b></div>
        <div><Anchor size={18}/><span>Protected asset</span><b>Pacific Lightwave-3</b></div>
        <div><ClockCountdown size={18}/><span>Time to cable</span><b>{stage === 0 ? '71' : stage === 1 ? '46' : stage === 2 ? '31' : 'Intercept prevented'} </b></div>
        <div><MapPin size={18}/><span>Distance</span><b>{stage === 0 ? '52.4' : stage === 1 ? '37.0' : stage === 2 ? '24.8' : '18.6'} nm</b></div>
      </div>

      <div className="tasking">
        <div className="panel-title">Sensor recommendation</div>
        <div className="sensor best"><Broadcast size={22}/><div><b>SAR Radar</b><p>Best next look, works through clouds/night</p></div><strong>{stage >= 2 ? '92%' : '71%'}</strong></div>
        <div className="sensor"><Radio size={20}/><div><b>AIS</b><p>Low value, target is non-cooperative</p></div><strong>6%</strong></div>
        <div className="sensor"><Warning size={20}/><div><b>EO</b><p>Cloud layer blocks visual confirmation</p></div><strong>21%</strong></div>
      </div>
    </aside>

    <footer className="bottom-timeline panel">
      <div className="progress"><div style={{width: `${progress}%`}} /></div>
      <div className="steps">
        <span className={stage >= 0 ? 'on' : ''}>Route deviation</span>
        <span className={stage >= 1 ? 'on danger' : ''}>AIS lost</span>
        <span className={stage >= 2 ? 'on warn' : ''}>SAR tasked</span>
        <span className={stage >= 3 ? 'on good' : ''}>Reacquired</span>
      </div>
    </footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);

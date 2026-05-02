# DarkWake / defensetech

A maritime critical infrastructure watchfloor demo for the Cerebral Valley national security hackathon.

**Concept:** when a vessel goes AIS-dark near an undersea cable corridor, DarkWake predicts where it can go next and recommends which sensor to task before it reaches the cable.

## What the demo shows

- Live-looking AIS replay around a protected undersea cable route
- Cable landing station and cable corridor overlays
- AIS dropout / last-known-position alert
- Threat score, time-to-cable, and distance-to-cable metrics
- Probability cloud for target reacquisition
- Sensor ranking across SAR, EO, and AIS
- SAR search polygon tasking recommendation
- Candidate radar contacts and ground-truth reacquisition
- Watchlist/event feed styled like a live operations dashboard

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL, usually `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

## Data note

The current app ships with a deterministic AIS-style replay so the demo is reliable on stage. It is structured to swap in real NOAA / MarineCadastre AIS rows by mapping CSV fields to:

```js
{ position: [LON, LAT], ts: BaseDateTime, sog: SOG, cog: COG }
```

Real AIS source: https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2024/index.html

Suggested next data sources:

- NOAA / MarineCadastre AIS for historical vessel tracks
- Global Fishing Watch SAR detections for AIS-unmatched vessels
- TeleGeography / public cable maps for real cable corridor geometry

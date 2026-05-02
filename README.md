# DarkWake / defensetech

A live-looking maritime defense tech demo for the Cerebral Valley national security hackathon.

**Concept:** when a vessel goes AIS-dark, DarkWake predicts the probable search area and recommends which sensor to task next.

## What the demo shows

- Streaming AIS-style vessel track
- AIS dropout / last-known-position alert
- Growing probability cloud for target reacquisition
- Sensor ranking across SAR, EO, and AIS
- SAR search polygon tasking recommendation
- Ground-truth reveal that the target falls inside the search area

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL, usually `http://localhost:5173`.

## Build

```bash
npm run build
```

## Data note

The demo is structured for NOAA / MarineCadastre AIS data. For hackathon reliability, the app ships with a deterministic AIS-style replay near Long Beach so the story always works on stage. Swap in real NOAA CSV points by mapping rows to:

```js
{ position: [LON, LAT], ts: BaseDateTime, sog: SOG, cog: COG }
```

Real AIS source: https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2024/index.html

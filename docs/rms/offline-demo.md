# Offline demo (no Wi-Fi)

The whole FORGE Responder platform runs on this laptop with no internet: the RMS
(every module), FORGE FIELD and the Creator Console. It uses local copies of
Firebase (sign-in, database, file storage and the server functions), so nothing
touches production.

## Start

```bash
npm run demo:offline
```

The first run builds the app (about a minute). After that it starts in about
20 seconds and opens the browser at `http://localhost:4173/demo`. Click
**Launch Demo RMS** as usual.

- **FORGE FIELD:** `http://localhost:4173/field` (after launching the demo).
- **Creator Console:** `http://localhost:4173/creator-console`. The login is in
  `.offline-demo/creator-login.txt` (made on first run; works on this laptop only).

Stop with **Ctrl+C** in that window. Changes you make during a demo are kept
for next time (also saved every 5 minutes).

## Before demo day (with internet)

1. Pull the latest code, then rebuild the offline copy:
   `npm run demo:offline -- --rebuild`
2. Click through once. Open a hydrant map in FORGE FIELD while online so the
   map imagery for the area is saved on the laptop.
3. Stop with Ctrl+C. Optionally turn Wi-Fi off and start again to rehearse.

Start over with fresh sample data: `npm run demo:offline -- --reset`.

## What needs internet

Everything else works offline. These need a connection:

- Satellite map imagery (hydrant maps show markers on a blank background, except
  areas FORGE FIELD already saved).
- AI narrative writing in incident reports.
- Sending real texts and emails (offline they are written to the window's log).
- The Inter web font (the app falls back to Segoe UI; it looks nearly the same).

## Requirements

Java (for the Firebase emulators) and `npm install` done in the repo and in
`functions/`. Both are already set up on this laptop.

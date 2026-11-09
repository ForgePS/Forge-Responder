# Heat Zone Analytics — Known Limitations

## Data availability (platform gaps, not module bugs)

1. **No CAD calls-for-service archive.** The module analyses NERIS incident reports, the only
   authoritative incident records. Calls that never become a NERIS report are not counted.
   Active911 alerts keep no history (rolling 25 alerts) and are not used.
2. **Coordinates.** Reports created in the editor have no latitude/longitude input; CAD imports and
   demo data carry coordinates. With **Settings → Address geocoding** turned on (needs the department's
   Google Geocoding key), reports without coordinates are placed from their incident address. Calls that
   are still unmapped are counted in every statistic and chart, shown as "N not mapped", and excluded
   from the map and geographic bounds.
   * Addresses that only match a town or ZIP code are deliberately not mapped.
   * Each recalculation looks up at most 300 new addresses; run it again for larger backlogs. New
     reports are looked up as they are saved.
   * Geocoding uses the department's Google quota and sends incident addresses to Google, so it is off
     by default.
   * There is no manual pin placement for addresses Google can't find.
3. **No incident disposition or call status fields.** Disposition is derived (see database-schema.md);
   "status" is the NERIS report workflow status.
4. **No districts / beats existed.** Boundaries must be uploaded per department (GeoJSON). Until then,
   every call is "Outside configured districts" and district-restricted members see nothing.
   "Patrol zone" is presented as **Response zone** (fire/EMS terminology).
5. **Response time** is dispatch → first arrival and is shown only when ≥ 5 incidents in the selection
   have both times.

## Technical limits

6. **Firestore instead of PostGIS.** Spatial work (point-in-polygon, grid binning, clustering) runs in
   Cloud Functions. Queries read every projection in the date range (cap **50 000** per request;
   responses flag `truncated`). Very large multi-year ranges for large agencies should use narrower
   ranges or a future pre-aggregated rollup.
7. **Cache is per function instance** (no shared Redis). Correctness is unaffected (version-keyed);
   hit rate is lower under autoscaling.
8. **Live-update contention.** Every analytics change increments one `heatZoneMeta/state` document
   inside the projection transaction (Firestore sustains ~1 write/s per document comfortably).
   Bulk imports of hundreds of reports at once will retry transactions and take longer to settle.
9. **Time-zone change.** If a department changes `profile.timezone`, existing projections keep the old
   local hour/date until **Settings → Recalculate analytics** (or the backfill script) is run.
10. **Custom roles** keep their stored permissions; Heat Zone keys must be granted to them manually.
    Existing members' rule grants refresh on their next membership/role change or via
    `scripts/sync-member-grants.mjs --apply`.
11. **PDF export** uses the browser print dialog ("Save as PDF"), matching the existing hydrant reports;
    there is no server-generated PDF.
12. **Heat map rendering** is a custom canvas layer over server-binned cells (~24 px). It is a density
    visualisation, not a kernel-density estimate.
13. **Offline / field app**: not included (desktop and tablet RMS only).

## Minor UI gaps

14. Priority weights can be edited but a custom priority can't be removed from the weight list.
15. Without the history permission, a date range older than 30 days stays selected in the filter bar;
    the server clamps it and the page shows a note.
16. "Today" in presets is computed when the page loads and goes stale if the page is left open overnight.
17. Zone priority (which district wins where boundaries overlap) is stored but not editable in the UI;
    ties are broken by id.
18. Marker and incident detail access also need the existing `viewNerisReports` permission (deliberate:
    the detail shows report data).
19. In local development, React StrictMode logs each incident view twice in the audit log; production logs once.

## Not production-ready until

* Staging deploy + backfill run and spot-checked against NERIS Analytics counts.
* At least one department imports real boundaries and verifies district counts.
* Member grants refreshed after deploy (step 4 of the deployment guide).

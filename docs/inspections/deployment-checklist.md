# Inspections — Deployment Checklist

1. `npm run build` succeeds  
2. `firebase deploy --only hosting,firestore:rules`  
3. Confirm Prevention nav loads for an admin role  
4. Open **Import & Hardening** → run readiness checks → **Save run**  
5. Import a small occupancy CSV and review the batch counts  
6. Run **Load smoke** and confirm all steps ok  
7. Spot-check Offline & Sync download pack on a narrow viewport  
8. Spot-check Fees (seed schedule) and Automation dry-run  
9. Confirm no console errors on Inspections Dashboard  
10. Record cutover notes / rollback plan for the release

# RMS Multi-Tenant Architecture Conversion Roadmap

**Prepared for:** Jeremy Powell / Havoc Calls  
**Direction:** Full RMS with station-dashboard capability, mobile platform support, modular features, and future multi-department SaaS use.

> Source: `RMS_Multi_Tenant_Architecture_Conversion_Roadmap.docx`

---

## 1. Executive Summary

The current RMS project is a good prototype shell, but it should be converted to **multi-tenant architecture before major feature development continues**.

Multi-tenancy means one application can securely serve multiple fire departments while keeping each department's data, users, settings, branding, and permissions separated.

This conversion should happen **before** building more RMS modules because tenant separation affects:

- Database paths
- Security rules
- Authentication
- User roles
- File storage
- Reporting
- Dashboards
- Backups
- Billing
- Future integrations

---

## 2. Current vs Commercial Requirement

| Area | Current (prototype) | Commercial requirement |
|------|---------------------|------------------------|
| Database | Shared `rmsData/{key}` | `departments/{departmentId}/...` |
| Authentication | Not fully in main app flow | Every user authenticates and is assigned to department(s) |
| Security rules | Some public read/write | Rules verify user belongs to accessed department |
| Branding | Horn Lake hard-coded | Tenant-specific logo, colors, stations, config |
| Readiness | Prototype/shell | Tenant-isolated SaaS with backups, audit logs, exports |

---

## 3. Target Multi-Tenant Model

**Shared cloud app + department-scoped data** in Firestore and Cloud Storage.

```
departments
  {departmentId}
    profile
    settings
    users
    personnel
    incidents
    training
    certifications
    apparatus
    assets
    hydrants
    occupancies
    inspections
    preplans
    documents
    dashboardConfig
    auditLogs
```

**Example department IDs:** `horn-lake-fd`, `lake-city-fire`, `county-fire-district-1`

Horn Lake becomes the **first tenant**, not the hard-coded app identity.

---

## 4. Conversion Phases

### Phase 1 — Freeze Core Feature Expansion
- Pause major new RMS features until tenant foundation exists
- Keep current prototype as working reference
- Create branch: `multi-tenant-foundation`
- Document which data is department-owned vs global reference

### Phase 2 — Define Tenant and User Model
- `departments` collection
- User profiles tied to Firebase Auth UIDs
- Department membership + role per user
- Support multi-department users later
- Separate system roles from department roles

### Phase 3 — Rebuild Database Paths
- Move department-owned records under `departments/{departmentId}`
- Keep only true shared reference data global
- Standard fields on every record: `departmentId`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `status`, `source`, `version`

### Phase 4 — Authentication and Authorization
- Firebase Auth login
- User profile on account creation
- Load active department after login
- Block access without valid membership
- Hide features by role and module subscription

### Phase 5 — Rewrite Firestore Security Rules
- Remove public write on department data
- Allow access only for authenticated department members
- Role-based permissions (admin, chief, officer, firefighter, inspector, read-only)
- Test allowed and denied scenarios before production data

### Phase 6 — Tenant Settings and Branding
- Department name, logo, timezone, stations, apparatus naming, shifts, dashboard config
- Per-department module enable/disable
- Per-station dashboard views

### Phase 7 — Migration Script
- Move prototype records into `departments/horn-lake-fd`
- Backup before migration
- Validate in app before deleting old paths

### Phase 8 — Audit Logs and Backups
- Log create/edit/delete/approvals/exports
- Scheduled backups
- Department-level export tools

### Phase 9 — Module Subscription Control
- Per-department flags: RMS, Training, Hydrants, Inspections, Preplans, Apparatus, Dashboards, Mobile
- UI shows only enabled modules
- Admin can toggle without code changes

### Phase 10 — Pilot-Ready Hardening
- Remove all public write rules
- Error logging and monitoring
- Account recovery
- Role-based testing
- Demo tenant separate from Horn Lake
- New department onboarding checklist

---

## 5. Module Order After Conversion

| Order | Module | Reason |
|-------|--------|--------|
| 1 | Tenant foundation | Everything depends on separation |
| 2 | Auth / users / roles | Required before pilots |
| 3 | Personnel | Backbone for staffing, training, incidents |
| 4 | Training / certifications | High value, lower complexity |
| 5 | Apparatus checks / assets | Daily use, mobile workflows |
| 6 | Incidents / NERIS fields | Core RMS, build carefully |
| 7 | Hydrants / preplans / occupancies | Operational + dashboard value |
| 8 | Inspections / investigations | Prevention bureau module |
| 9 | Station dashboards / MVIX displays | Differentiator |
| 10 | Mobile platform hardening | After stable data model |

**This replaces the previous single-tenant Sprint 6–10 plan.**

---

## 6. Immediate Next Steps

1. Create branch `multi-tenant-foundation`
2. Add Firebase Auth to app flow
3. Create `departments/{departmentId}` root model
4. Create `departments/horn-lake-fd` as first tenant
5. Create `departments/horn-lake-fd/users/{uid}` membership records
6. Refactor reads/writes from `rmsData/{key}` to tenant collections
7. Replace hard-coded Horn Lake values with department settings
8. Rewrite Firestore rules around tenant membership
9. Create migration script (test on sample data only)
10. Build second demo department to prove isolation

---

## 7. Do Not Proceed Until Complete

- [ ] All department-owned data under `departments/{departmentId}`
- [ ] No public write rules on operational data
- [ ] Every user has department membership record
- [ ] Roles enforced in UI and Firestore rules
- [ ] New departments creatable without code changes
- [ ] Horn Lake configured as tenant, not app identity
- [ ] Storage paths separated by department ID
- [ ] Backups and exports planned
- [ ] Audit logging for critical changes
- [ ] Demo tenant exists for sales/testing

---

## 8. Bottom Line

**Tenant architecture is the next major step—not more features.** Once the foundation is in place, every future module can be built once and sold to multiple departments safely. Skipping this now will require a painful rewrite later.

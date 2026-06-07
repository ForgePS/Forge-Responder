# Horn Lake Fire/EMS Dashboard
## Theme & UI/UX Build Specification
### Theme Name: Horn Lake Command

## Core Direction

Build a desktop-first RMS command dashboard for fire department leadership and daily administrative operations.

This is not a CAD screen.
This is not primarily an incident map.
This is not a mobile-first app.

The system should feel like a modern command staff operating platform for:
- Fire Chief
- Deputy Chief
- Battalion Chiefs
- EMS Chief
- Fire Inspector / Fire Marshal
- Administrative staff
- Company officers

The focus is the RMS side:
- Personnel
- Certifications
- Scheduling
- Training
- Fleet
- Assets
- Inspections
- Preplans
- Documents
- Analytics

Incident reporting and ePCR/NERIS/NEMSIS work should be treated as later phases.

---

## Product Name

Use this name in headers, login screens, and title areas:

**Horn Lake Fire/EMS Dashboard**

Optional small footer text:

**Powered by Havoc Calls**

Do not brand the internal Horn Lake build as HAVOC OPS on the primary screen.

---

## Visual Style

Professional, modern, executive command software.

Inspired by:
- Microsoft 365 Admin Center
- Power BI
- Salesforce Lightning
- Modern fleet management dashboards
- Enterprise HR dashboards

Avoid:
- Neon cyberpunk
- Gaming dashboard feel
- Oversized live maps
- Dispatch/CAD style layouts
- Government website styling

---

## Desktop-First Standard

Primary resolution:
- 1920x1080

Primary device:
- 24 inch desktop monitor

Secondary:
- Laptop

Limited mobile/iPad optimization only for:
- Personnel lookup
- Schedule
- Shift trades
- Apparatus checks
- Inspections
- Hydrant testing
- Preplans

---

## Global Layout

Use a fixed command-center layout:

1. Top Command Bar
2. Left Navigation
3. Main Workspace
4. Optional right-side alerts panel on dashboard only
5. Footer/system status line

### Top Command Bar

Height:
- 64px

Contents:
- Horn Lake Fire/EMS Dashboard
- Current date/time
- Global search
- Notifications
- User profile

Search placeholder:

`Search personnel, apparatus, occupancies, training, inspections...`

### Left Navigation

Expanded width:
- 260px

Collapsed width:
- 80px

Navigation groups:

Dashboard

RMS
- Personnel
- Certifications
- Training
- Scheduling
- Shift Trades

Fleet
- Apparatus
- Assets
- Maintenance
- Hose Testing

Prevention
- Occupancies
- Inspections
- Preplans
- Hydrants

Documents
- SOGs / Policies
- EMS Protocols
- Forms
- Uploads

Analytics

Administration

Future / Later
- Incidents
- EMS Reports
- Fire Reports
- Compliance Export

---

## Color Palette

### Background
Primary background:
`#0F172A`

Secondary background:
`#111827`

Card background:
`#1E293B`

Card hover:
`#273449`

Table header:
`#162033`

Border:
`#334155`

### Text
Primary text:
`#F8FAFC`

Secondary text:
`#CBD5E1`

Muted text:
`#94A3B8`

Disabled text:
`#64748B`

### Accent Colors
HLFD Blue:
`#2563EB`

Info:
`#3B82F6`

Success:
`#22C55E`

Warning:
`#F59E0B`

Critical:
`#EF4444`

Offline / neutral:
`#6B7280`

---

## Typography

Preferred font:
- Inter

Fallbacks:
- Segoe UI
- Roboto
- Arial
- sans-serif

Use:
- 13px–14px for tables
- 15px–16px for body
- 18px–22px for card titles
- 28px–36px for key numbers

---

## Dashboard Philosophy

The dashboard should answer:

**What needs attention today?**

Do not lead with a large map.

Do not waste space with decorative graphics.

Prioritize:
- Overdue items
- Staffing gaps
- Expiring certifications
- Fleet readiness
- Training compliance
- Inspections due
- Pending approvals
- Reports needing action

---

## Dashboard Top KPI Row

Use 8 compact KPI cards across the top:

1. Personnel On Duty
2. Staffing Deficit
3. Certifications Expiring
4. Training Compliance
5. Units Available
6. Units Out of Service
7. Inspections Due
8. Open Tasks

Each card should include:
- Main value
- Short label
- Small trend or status line
- Status color indicator

---

## Main Dashboard Columns

Use 3-column desktop grid:

Left column: 30%
Center column: 40%
Right column: 30%

### Left Column: Readiness

Cards:
- Staffing Summary
- Fleet Readiness
- Training Compliance

### Center Column: Action Center

This is the most important section.

Cards:
- Items Requiring Review
- Pending Approvals
- Overdue Tasks
- Today’s Operational Notes

### Right Column: Alerts and Trends

Cards:
- Certification Expirations
- Preventive Maintenance Due
- Inspection Backlog
- 30-Day Trends

---

## Component Design

### Cards
- Border radius: 12px
- Padding: 18–20px
- Border: 1px solid #334155
- Background: #1E293B
- No heavy shadows
- No neon glow

### Tables
All modules should share one consistent table system.

Required table features:
- Search
- Filter
- Sort
- Status badges
- Row actions
- Export button
- Saved views later

### Status Badges

Use clear language:
- Active
- Due Soon
- Overdue
- Out of Service
- Pending Review
- Approved
- Expired
- Complete

---

## Role-Based Home Screens

Different roles should eventually see different dashboards.

### Fire Chief
- Executive overview
- Staffing
- Fleet readiness
- Training compliance
- Inspection backlog
- Budget/maintenance trends

### Deputy Chief
- Operations readiness
- Personnel issues
- Apparatus readiness
- Reports pending review

### Battalion Chief
- Shift dashboard
- Daily roster
- Apparatus checks
- Open tasks
- Training due

### EMS Chief
- EMS staffing
- EMS certifications
- EMS training
- Open EMS QA items

### Inspector
- Inspection queue
- Occupancy list
- Violations
- Reinspection due dates

### Firefighter
- My schedule
- My certifications
- My training
- My documents
- Shift trades

---

## Mobile/iPad Scope

Do not attempt full mobile parity.

Optimize only:
- My dashboard
- Personnel lookup
- Scheduling
- Shift trades
- Apparatus checks
- Inspections
- Hydrant testing
- Preplans

Desktop remains primary.

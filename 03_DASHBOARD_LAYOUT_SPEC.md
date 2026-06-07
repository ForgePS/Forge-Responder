# Horn Lake Fire/EMS Dashboard
## Dashboard Layout Specification

## Top KPI Row

Create 8 cards:

1. Personnel On Duty
   - Example value: 21
   - Status: Fully staffed / deficit

2. Staffing Deficit
   - Example value: 1
   - Status: Needs overtime

3. Certifications Expiring
   - Example value: 7
   - Status: Next 90 days

4. Training Compliance
   - Example value: 88%
   - Status: Department-wide

5. Units Available
   - Example value: 7
   - Status: In service

6. Units Out of Service
   - Example value: 1
   - Status: Maintenance

7. Inspections Due
   - Example value: 18
   - Status: This month

8. Open Tasks
   - Example value: 14
   - Status: Requires action

---

## Left Column: Readiness

### Staffing Summary Card
Show:
- A Shift
- B Shift
- C Shift
- Minimum staffing
- Current staffing
- Vacancies
- Overtime needed

### Fleet Readiness Card
Show:
- Engine 1: In Service
- Engine 2: In Service
- Engine 3: In Service
- Truck 3: PM Due
- Rescue 1: In Service
- Battalion 1: In Service

### Training Compliance Card
Show:
- Department compliance %
- EMS CE compliance %
- Fire training compliance %
- Driver training compliance %
- Overdue personnel count

---

## Center Column: Action Center

This is the primary dashboard area.

### Items Requiring Review
Rows:
- Pending shift trades
- Leave requests
- Training approvals
- Inspection follow-ups
- Maintenance requests
- Policy acknowledgements

### Pending Approvals
Rows:
- Schedule changes
- Certification uploads
- Personnel document updates
- Apparatus service requests

### Today’s Operational Notes
Rows:
- Staffing notes
- Unit notes
- Weather/operational caution
- Admin announcements

---

## Right Column: Alerts and Trends

### Certification Expirations
Show:
- 30 days
- 60 days
- 90 days

### Maintenance Due
Show:
- PM due
- Pump test due
- Ladder test due
- SCBA flow test due
- Hose test due

### Inspection Backlog
Show:
- Due this month
- Overdue
- Reinspection due
- Violations outstanding

### 30-Day Trends
Small trend blocks:
- EMS volume
- Fire volume
- Overtime
- Training hours
- Inspection completion

---

## Dashboard Behavior

- Dashboard should load quickly.
- No large map.
- No full-screen charts.
- No animation-heavy effects.
- Cards should be clickable placeholders for module navigation.
- Use mock data initially if no backend data exists.
- Structure data so it can later be replaced by API calls.

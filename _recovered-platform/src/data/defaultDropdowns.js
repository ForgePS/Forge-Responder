export const defaultDropdowns = [
  {
    id: "ranks",
    label: "Ranks",
    module: "Personnel",
    options: [
      { id: "fireChief", label: "Fire Chief", active: true, sortOrder: 1 },
      { id: "deputyChief", label: "Deputy Chief", active: true, sortOrder: 2 },
      { id: "battalionChief", label: "Battalion Chief", active: true, sortOrder: 3 },
      { id: "captain", label: "Captain", active: true, sortOrder: 4 },
      { id: "lieutenant", label: "Lieutenant", active: true, sortOrder: 5 },
      { id: "firefighter", label: "Firefighter", active: true, sortOrder: 6 }
    ]
  },
  {
    id: "shifts",
    label: "Shifts",
    module: "Personnel",
    options: [
      { id: "aShift", label: "A Shift", active: true, sortOrder: 1 },
      { id: "bShift", label: "B Shift", active: true, sortOrder: 2 },
      { id: "cShift", label: "C Shift", active: true, sortOrder: 3 },
      { id: "dayStaff", label: "Day Staff", active: true, sortOrder: 4 },
      { id: "administration", label: "Administration", active: true, sortOrder: 5 }
    ]
  },
  {
    id: "stations",
    label: "Stations",
    module: "Personnel",
    options: [
      { id: "station1", label: "Station 1", active: true, sortOrder: 1 },
      { id: "station2", label: "Station 2", active: true, sortOrder: 2 },
      { id: "station3", label: "Station 3", active: true, sortOrder: 3 },
      { id: "fireAdmin", label: "Fire Administration", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "emsLevels",
    label: "EMS Levels",
    module: "Personnel",
    options: [
      { id: "paramedic", label: "Paramedic", active: true, sortOrder: 1 },
      { id: "aemt", label: "AEMT", active: true, sortOrder: 2 },
      { id: "emt", label: "EMT", active: true, sortOrder: 3 },
      { id: "none", label: "None", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "driverStatus",
    label: "Driver Status",
    module: "Personnel",
    options: [
      { id: "approved", label: "Approved", active: true, sortOrder: 1 },
      { id: "trainee", label: "Trainee", active: true, sortOrder: 2 },
      { id: "notApproved", label: "Not Approved", active: true, sortOrder: 3 }
    ]
  },
  {
    id: "employmentStatus",
    label: "Employment Status",
    module: "Personnel",
    options: [
      { id: "active", label: "Active", active: true, sortOrder: 1 },
      { id: "leave", label: "Leave", active: true, sortOrder: 2 },
      { id: "inactive", label: "Inactive", active: true, sortOrder: 3 }
    ]
  },
  {
    id: "certRenewalStatus",
    label: "Certification Renewal Status",
    module: "Certifications",
    options: [
      { id: "notStarted", label: "Not Started", active: true, sortOrder: 1 },
      { id: "inProgress", label: "In Progress", active: true, sortOrder: 2 },
      { id: "submitted", label: "Submitted", active: true, sortOrder: 3 },
      { id: "approved", label: "Approved", active: true, sortOrder: 4 },
      { id: "overdue", label: "Overdue", active: true, sortOrder: 5 }
    ]
  },
  {
    id: "trainingCategories",
    label: "Training Categories",
    module: "Training",
    options: [
      { id: "fire", label: "Fire", active: true, sortOrder: 1 },
      { id: "emsCe", label: "EMS CE", active: true, sortOrder: 2 },
      { id: "driver", label: "Driver", active: true, sortOrder: 3 },
      { id: "officer", label: "Officer", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "leaveTypes",
    label: "Leave Types",
    module: "Scheduling",
    options: [
      { id: "vacation", label: "Vacation", active: true, sortOrder: 1 },
      { id: "personal", label: "Personal", active: true, sortOrder: 2 },
      { id: "sick", label: "Sick", active: true, sortOrder: 3 },
      { id: "training", label: "Training", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "apparatusStatus",
    label: "Apparatus Status",
    module: "Apparatus",
    options: [
      { id: "inService", label: "In Service", active: true, sortOrder: 1 },
      { id: "outOfService", label: "Out of Service", active: true, sortOrder: 2 },
      { id: "pmDue", label: "PM Due", active: true, sortOrder: 3 },
      { id: "reserve", label: "Reserve", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "assetCategories",
    label: "Asset Categories",
    module: "Assets",
    options: [
      { id: "medical", label: "Medical", active: true, sortOrder: 1 },
      { id: "ppe", label: "PPE", active: true, sortOrder: 2 },
      { id: "electronics", label: "Electronics", active: true, sortOrder: 3 },
      { id: "equipment", label: "Equipment", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "documentTypes",
    label: "Document Types",
    module: "Documents",
    options: [
      { id: "sog", label: "SOG", active: true, sortOrder: 1 },
      { id: "policy", label: "Policy", active: true, sortOrder: 2 },
      { id: "emsProtocol", label: "EMS Protocol", active: true, sortOrder: 3 },
      { id: "form", label: "Form", active: true, sortOrder: 4 },
      { id: "upload", label: "Upload", active: true, sortOrder: 5 }
    ]
  }
];

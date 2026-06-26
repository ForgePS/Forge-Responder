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
      { id: "sick", label: "Sick", active: true, sortOrder: 2 },
      { id: "military", label: "Military Leave", active: true, sortOrder: 3 },
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
    id: "apparatusTypes",
    label: "Apparatus Types",
    module: "Apparatus",
    options: [
      { id: "pumper", label: "Pumper", active: true, sortOrder: 1 },
      { id: "aerial", label: "Aerial", active: true, sortOrder: 2 },
      { id: "ladder", label: "Ladder", active: true, sortOrder: 3 },
      { id: "heavyRescue", label: "Heavy Rescue", active: true, sortOrder: 4 },
      { id: "brush", label: "Brush", active: true, sortOrder: 5 },
      { id: "tanker", label: "Tanker", active: true, sortOrder: 6 },
      { id: "ambulance", label: "Ambulance", active: true, sortOrder: 7 },
      { id: "battalion", label: "Battalion", active: true, sortOrder: 8 },
      { id: "utility", label: "Utility", active: true, sortOrder: 9 }
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
    id: "assetStatuses",
    label: "Asset Status",
    module: "Assets",
    options: [
      { id: "available", label: "Available", active: true, sortOrder: 1 },
      { id: "inService", label: "In Service", active: true, sortOrder: 2 },
      { id: "inspectionDue", label: "Inspection Due", active: true, sortOrder: 3 },
      { id: "outForRepair", label: "Out for Repair", active: true, sortOrder: 4 }
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
  },
  {
    id: "usStates",
    label: "US States",
    module: "Personnel",
    options: [
      { id: "al", label: "Alabama", active: true, sortOrder: 1 },
      { id: "ms", label: "Mississippi", active: true, sortOrder: 2 },
      { id: "tn", label: "Tennessee", active: true, sortOrder: 3 },
      { id: "ar", label: "Arkansas", active: true, sortOrder: 4 },
      { id: "la", label: "Louisiana", active: true, sortOrder: 5 },
      { id: "va", label: "Virginia", active: true, sortOrder: 6 }
    ]
  },
  {
    id: "apparatusUnits",
    label: "Apparatus/Units",
    module: "Apparatus",
    options: [
      { id: "engine1", label: "Engine 1", active: true, sortOrder: 1 },
      { id: "engine2", label: "Engine 2", active: true, sortOrder: 2 },
      { id: "engine3", label: "Engine 3", active: true, sortOrder: 3 },
      { id: "truck3", label: "Truck 3", active: true, sortOrder: 4 },
      { id: "rescue1", label: "Rescue 1", active: true, sortOrder: 5 },
      { id: "battalion1", label: "Battalion 1", active: true, sortOrder: 6 },
      { id: "fd2", label: "FD-2", active: true, sortOrder: 7 }
    ]
  },
  {
    id: "divisions",
    label: "Divisions",
    module: "Personnel",
    options: [
      { id: "emergencyOps", label: "Emergency Operations", active: true, sortOrder: 1 },
      { id: "administration", label: "Administration", active: true, sortOrder: 2 },
      { id: "training", label: "Training", active: true, sortOrder: 3 },
      { id: "prevention", label: "Prevention", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "personnelDistricts",
    label: "Districts",
    module: "Personnel",
    options: [
      { id: "district1", label: "District 1", active: true, sortOrder: 1 },
      { id: "district2", label: "District 2", active: true, sortOrder: 2 },
      { id: "district3", label: "District 3", active: true, sortOrder: 3 }
    ]
  },
  {
    id: "personnelPositions",
    label: "Positions",
    module: "Personnel",
    options: [
      { id: "command", label: "Command", active: true, sortOrder: 1 },
      { id: "officer", label: "Officer", active: true, sortOrder: 2 },
      { id: "driver", label: "Driver", active: true, sortOrder: 3 },
      { id: "firefighter", label: "Firefighter", active: true, sortOrder: 4 },
      { id: "emtDriver", label: "EMT/Driver", active: true, sortOrder: 5 },
      { id: "medic", label: "Medic", active: true, sortOrder: 6 }
    ]
  },
  {
    id: "personnelGroups",
    label: "Personnel Groups",
    module: "Personnel",
    options: [
      { id: "operations", label: "Operations", active: true, sortOrder: 1 },
      { id: "suppression", label: "Suppression", active: true, sortOrder: 2 },
      { id: "ems", label: "EMS", active: true, sortOrder: 3 },
      { id: "administrative", label: "Administrative", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "employmentTypes",
    label: "Employment Types",
    module: "Personnel",
    options: [
      { id: "fullTime", label: "Full Time", active: true, sortOrder: 1 },
      { id: "partTime", label: "Part Time", active: true, sortOrder: 2 },
      { id: "volunteer", label: "Volunteer", active: true, sortOrder: 3 },
      { id: "reserve", label: "Reserve", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "personnelQualifiers",
    label: "Qualifiers",
    module: "Personnel",
    options: [
      { id: "administration", label: "Administration", active: true, sortOrder: 1 },
      { id: "deputyChief", label: "Deputy Chief", active: true, sortOrder: 2 },
      { id: "emsChief", label: "EMS Chief", active: true, sortOrder: 3 },
      { id: "firefighter", label: "Firefighter", active: true, sortOrder: 4 },
      { id: "instructor", label: "Instructor", active: true, sortOrder: 5 },
      { id: "apparatusOperator", label: "Apparatus Operator", active: true, sortOrder: 6 }
    ]
  },
  {
    id: "citizenshipOptions",
    label: "Citizenship",
    module: "Personnel",
    options: [
      { id: "us", label: "United States", active: true, sortOrder: 1 },
      { id: "other", label: "Other", active: true, sortOrder: 2 }
    ]
  },
  {
    id: "raceOptions",
    label: "Race",
    module: "Personnel",
    options: [
      { id: "white", label: "White", active: true, sortOrder: 1 },
      { id: "black", label: "Black or African American", active: true, sortOrder: 2 },
      { id: "asian", label: "Asian", active: true, sortOrder: 3 },
      { id: "other", label: "Other race", active: true, sortOrder: 4 },
      { id: "preferNot", label: "Prefer not to say", active: true, sortOrder: 5 }
    ]
  },
  {
    id: "ethnicityOptions",
    label: "Ethnicity",
    module: "Personnel",
    options: [
      { id: "hispanic", label: "Hispanic or Latino", active: true, sortOrder: 1 },
      { id: "notHispanic", label: "Not Hispanic or Latino", active: true, sortOrder: 2 },
      { id: "preferNot", label: "Prefer not to say", active: true, sortOrder: 3 }
    ]
  },
  {
    id: "genderOptions",
    label: "Gender",
    module: "Personnel",
    options: [
      { id: "male", label: "Male", active: true, sortOrder: 1 },
      { id: "female", label: "Female", active: true, sortOrder: 2 },
      { id: "nonBinary", label: "Non-binary", active: true, sortOrder: 3 },
      { id: "preferNot", label: "Prefer not to say", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "maritalStatusOptions",
    label: "Marital Status",
    module: "Personnel",
    options: [
      { id: "single", label: "Single", active: true, sortOrder: 1 },
      { id: "married", label: "Married", active: true, sortOrder: 2 },
      { id: "divorced", label: "Divorced", active: true, sortOrder: 3 },
      { id: "widowed", label: "Widowed", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "emergencyContactRelationships",
    label: "Emergency Contact Relationship",
    module: "Personnel",
    options: [
      { id: "spouse", label: "Spouse", active: true, sortOrder: 1 },
      { id: "partner", label: "Partner", active: true, sortOrder: 2 },
      { id: "parent", label: "Parent", active: true, sortOrder: 3 },
      { id: "child", label: "Child", active: true, sortOrder: 4 },
      { id: "sibling", label: "Sibling", active: true, sortOrder: 5 },
      { id: "grandparent", label: "Grandparent", active: true, sortOrder: 6 },
      { id: "grandchild", label: "Grandchild", active: true, sortOrder: 7 },
      { id: "friend", label: "Friend", active: true, sortOrder: 8 },
      { id: "neighbor", label: "Neighbor", active: true, sortOrder: 9 },
      { id: "other", label: "Other", active: true, sortOrder: 10 }
    ]
  },
  {
    id: "driversLicenseClasses",
    label: "Driver's License Class",
    module: "Personnel",
    options: [
      { id: "classA", label: "A", active: true, sortOrder: 1 },
      { id: "classB", label: "B", active: true, sortOrder: 2 },
      { id: "classC", label: "C", active: true, sortOrder: 3 },
      { id: "classD", label: "D", active: true, sortOrder: 4 }
    ]
  },
  {
    id: "yesNoOptions",
    label: "Yes / No",
    module: "Personnel",
    options: [
      { id: "yes", label: "Yes", active: true, sortOrder: 1 },
      { id: "no", label: "No", active: true, sortOrder: 2 }
    ]
  }
];

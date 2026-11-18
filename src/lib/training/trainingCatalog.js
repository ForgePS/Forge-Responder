/**
 * Starter course catalog: configurable templates a training officer can add to
 * the department's catalog. They are titles and categories only. They are NOT
 * certifications, they carry no hour requirements, and adding one never makes
 * anyone compliant with anything. Standards references are left for the
 * department to map against the editions it has adopted.
 */
export const STARTER_CATALOG = [
  { category: "Structural Firefighting", discipline: "Fire", titles: [
    "Fire behavior", "Building construction", "Structural PPE", "SCBA operations", "Hose operations", "Ground ladders",
    "Forcible entry", "Search and rescue", "Ventilation", "Fire attack", "Salvage", "Overhaul", "Personnel accountability",
    "Firefighter survival", "RIT / RIC operations", "Mayday procedures", "Fireground command operations",
  ] },
  { category: "Driver / Operator", discipline: "Driver/Operator", titles: [
    "Emergency vehicle operations", "Defensive driving", "Apparatus positioning", "Pump operations", "Aerial operations",
    "Daily apparatus inspection", "Backing and spotting", "Driver road course", "Operator competency review",
  ] },
  { category: "Hazardous Materials", discipline: "HazMat", titles: [
    "HazMat awareness", "HazMat operations", "HazMat technician", "Decontamination", "Chemical protective clothing",
    "Air monitoring", "HazMat incident management", "Specialty hazmat response",
  ] },
  { category: "Technical Rescue", discipline: "Rescue", titles: [
    "Rope rescue", "Confined space rescue", "Trench rescue", "Vehicle extrication", "Structural collapse",
    "Water rescue", "Wilderness rescue",
  ] },
  { category: "Command and Leadership", discipline: "Officer Development", titles: [
    "ICS / NIMS refresher", "Incident command", "Strategy and tactics", "Company officer development",
    "Chief officer development", "Instructor development", "Incident safety officer",
  ] },
  { category: "Prevention", discipline: "Prevention", titles: [
    "Fire inspection practices", "Code enforcement", "Public education delivery", "Fire investigation",
    "Community risk reduction", "Pre-incident planning",
  ] },
  { category: "Health and Safety", discipline: "Health & Safety", titles: [
    "Respiratory protection program", "SCBA proficiency", "Fit testing", "Exposure reduction and decon",
    "Rehabilitation", "Heat stress", "Firefighter wellness", "Occupational safety",
  ] },
  { category: "EMS", discipline: "EMS", titles: [
    "Airway management", "Ventilation and oxygenation", "Cardiology", "Cardiac arrest management", "ECG interpretation",
    "Trauma", "Hemorrhage control", "Shock", "Medical emergencies", "Neurological emergencies", "Respiratory emergencies",
    "Pediatrics", "Geriatrics", "Obstetrics", "Neonatal emergencies", "Behavioral emergencies", "Toxicology",
    "Medication administration", "Patient assessment", "Ambulance operations", "Mass casualty incidents", "Triage",
    "Clinical procedures", "Protocol review", "Case review", "Simulation", "Quality improvement", "Remediation",
  ] },
];

export const RECORD_TYPES = [
  "Company drill", "Individual", "Station", "Shift", "Department", "Multi-company drill", "Multi-agency", "Mutual aid",
  "Classroom", "Practical", "Live fire", "EMS", "Online", "External", "Conference", "Self-study", "Simulation", "Clinical",
  "Probationary", "Incident-based", "After-action review", "Remedial", "Annual mandatory",
];

export const DELIVERY_METHODS = ["Classroom", "Practical / hands-on", "Live fire", "Online", "Hybrid", "Simulation", "Clinical"];

export const EMS_LEVELS = ["EMR", "EMT", "AEMT", "Paramedic"];

/** A blank course record. */
export function blankCourse() {
  return {
    title: "", code: "", discipline: "Fire", category: "", description: "", audience: "", difficulty: "Basic",
    prerequisiteCourseIds: [], objectives: [], estimatedHours: "", standards: [], jprs: "", instructorQualification: "",
    lessons: [], materials: [], equipment: "", ppe: "", safety: "", writtenAssessment: "", practicalEvaluation: "",
    passingRequirement: "", ceEligible: false, ceProvider: "", ceApprovalNumber: "", status: "draft", liveFire: false,
  };
}

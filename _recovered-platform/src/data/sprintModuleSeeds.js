export const initialAssets = [
  { id: "AST-1042", name: "Thermal Imaging Camera", category: "Electronics", serial: "TIC-88431", location: "Engine 1", assigned: "D. Lee", inspection: "Jul 12, 2026", value: "$9,800", status: "In Service" },
  { id: "AST-1178", name: "Cardiac Monitor", category: "Medical", serial: "LP15-22018", location: "Rescue 1", assigned: "A. Tutor", inspection: "Jun 30, 2026", value: "$28,500", status: "In Service" },
  { id: "AST-1204", name: "Hydraulic Spreader", category: "Extrication", serial: "HUR-77291", location: "Rescue 1", assigned: "A. Tutor", inspection: "Aug 8, 2026", value: "$14,200", status: "In Service" },
  { id: "AST-1281", name: "Four-Gas Meter", category: "HazMat", serial: "MSA-31904", location: "Station 2", assigned: "M. Reed", inspection: "Jun 10, 2026", value: "$2,100", status: "Inspection Due" },
  { id: "AST-1307", name: "Portable Radio", category: "Communications", serial: "APX-55210", location: "Repair Vendor", assigned: "Unassigned", inspection: "Sep 14, 2026", value: "$4,600", status: "Out for Repair" },
  { id: "AST-1350", name: "SCBA Pack", category: "PPE", serial: "MSA-44012", location: "Station 1", assigned: "Unassigned", inspection: "Jun 24, 2026", value: "$7,400", status: "Available" }
];

export const initialHoseTests = [
  { id: "HT-101", apparatus: "Engine 1", section: "Bed 1 - 1.75\" Attack", lastTest: "May 14, 2026", nextDue: "May 14, 2027", result: "Pass", testedBy: "D. Lee", status: "Current" },
  { id: "HT-102", apparatus: "Engine 2", section: "Bed 2 - 2.5\" Supply", lastTest: "Apr 2, 2026", nextDue: "Apr 2, 2027", result: "Pass", testedBy: "M. Reed", status: "Current" },
  { id: "HT-103", apparatus: "Truck 3", section: "Crosslay - 1.75\"", lastTest: "Mar 18, 2026", nextDue: "Jun 18, 2026", result: "Pass", testedBy: "T. Brooks", status: "Due Soon" },
  { id: "HT-104", apparatus: "Rescue 1", section: "Supply - 3\"", lastTest: "Feb 10, 2026", nextDue: "May 10, 2026", result: "Fail - Coupling", testedBy: "A. Tutor", status: "Overdue" },
  { id: "HT-105", apparatus: "Brush 2", section: "Wildland - 1\"", lastTest: "Jan 22, 2026", nextDue: "Jan 22, 2027", result: "Pass", testedBy: "Unassigned", status: "Current" }
];

export const initialDocuments = [
  { id: "DOC-001", title: "Emergency Response SOG", category: "SOG", subcategory: "Operations", version: "4.2", effectiveDate: "2026-01-01", uploadedBy: "Stephen White", uploadedDate: "2025-12-15", fileType: "PDF", fileUrl: "#", tags: "response,operations", requiresAcknowledgement: "Yes", acknowledgementStatus: "Pending", description: "Department emergency response standard operating guideline." },
  { id: "DOC-002", title: "Vehicle Accident Response SOG", category: "SOG", subcategory: "Operations", version: "3.1", effectiveDate: "2025-11-01", uploadedBy: "Stephen White", uploadedDate: "2025-10-20", fileType: "PDF", fileUrl: "#", tags: "mva,extrication", requiresAcknowledgement: "Yes", acknowledgementStatus: "Acknowledged", description: "MVA and extrication response procedures." },
  { id: "DOC-003", title: "HazMat Response SOG", category: "SOG", subcategory: "HazMat", version: "2.0", effectiveDate: "2025-09-01", uploadedBy: "Training Officer", uploadedDate: "2025-08-28", fileType: "PDF", fileUrl: "#", tags: "hazmat", requiresAcknowledgement: "Yes", acknowledgementStatus: "Pending", description: "Hazardous materials initial response." },
  { id: "DOC-004", title: "Personnel Accountability Policy", category: "Policy", subcategory: "Administration", version: "1.4", effectiveDate: "2026-02-01", uploadedBy: "Jeremy Powell", uploadedDate: "2026-01-18", fileType: "PDF", fileUrl: "#", tags: "personnel,accountability", requiresAcknowledgement: "Yes", acknowledgementStatus: "Pending", description: "Personnel accountability and PAR procedures." },
  { id: "DOC-005", title: "Social Media Policy", category: "Policy", subcategory: "Administration", version: "1.0", effectiveDate: "2025-06-01", uploadedBy: "Jeremy Powell", uploadedDate: "2025-05-22", fileType: "PDF", fileUrl: "#", tags: "communications", requiresAcknowledgement: "No", acknowledgementStatus: "Not Required", description: "Department social media use policy." },
  { id: "DOC-006", title: "Pediatric Airway Protocol", category: "EMS Protocol", subcategory: "Airway", version: "2026.1", effectiveDate: "2026-01-01", uploadedBy: "EMS Chief", uploadedDate: "2025-12-30", fileType: "PDF", fileUrl: "#", tags: "ems,pediatric,airway", requiresAcknowledgement: "Yes", acknowledgementStatus: "Acknowledged", description: "EMS pediatric advanced airway management." },
  { id: "DOC-007", title: "Chest Pain / ACS Protocol", category: "EMS Protocol", subcategory: "Cardiac", version: "2026.1", effectiveDate: "2026-01-01", uploadedBy: "EMS Chief", uploadedDate: "2025-12-30", fileType: "PDF", fileUrl: "#", tags: "ems,cardiac", requiresAcknowledgement: "Yes", acknowledgementStatus: "Pending", description: "Acute coronary syndrome field protocol." },
  { id: "DOC-008", title: "Stroke Assessment Protocol", category: "EMS Protocol", subcategory: "Neuro", version: "2026.1", effectiveDate: "2026-01-01", uploadedBy: "EMS Chief", uploadedDate: "2025-12-30", fileType: "PDF", fileUrl: "#", tags: "ems,stroke", requiresAcknowledgement: "Yes", acknowledgementStatus: "Pending", description: "Stroke alert and transport criteria." },
  { id: "DOC-009", title: "Leave Request Form", category: "Form", subcategory: "Scheduling", version: "1.0", effectiveDate: "2025-01-01", uploadedBy: "Administration", uploadedDate: "2024-12-10", fileType: "PDF", fileUrl: "#", tags: "leave,scheduling", requiresAcknowledgement: "No", acknowledgementStatus: "Not Required", description: "Vacation and leave request form." },
  { id: "DOC-010", title: "Apparatus Check-Off Form", category: "Form", subcategory: "Fleet", version: "2.1", effectiveDate: "2026-03-01", uploadedBy: "Fleet Captain", uploadedDate: "2026-02-14", fileType: "PDF", fileUrl: "#", tags: "apparatus,daily-check", requiresAcknowledgement: "No", acknowledgementStatus: "Not Required", description: "Daily apparatus readiness checklist." },
  { id: "DOC-011", title: "Inspection Violation Notice", category: "Form", subcategory: "Prevention", version: "1.2", effectiveDate: "2025-04-01", uploadedBy: "Prevention Bureau", uploadedDate: "2025-03-18", fileType: "PDF", fileUrl: "#", tags: "inspection,prevention", requiresAcknowledgement: "No", acknowledgementStatus: "Not Required", description: "Fire prevention violation notice template." },
  { id: "DOC-012", title: "2025 Annual Training Plan", category: "Upload", subcategory: "Training", version: "1.0", effectiveDate: "2025-01-15", uploadedBy: "Training Officer", uploadedDate: "2025-01-10", fileType: "PDF", fileUrl: "#", tags: "training,annual", requiresAcknowledgement: "No", acknowledgementStatus: "Not Required", description: "Annual department training calendar." },
  { id: "DOC-013", title: "Driver Operator SOG", category: "SOG", subcategory: "Fleet", version: "2.3", effectiveDate: "2025-08-01", uploadedBy: "Fleet Captain", uploadedDate: "2025-07-22", fileType: "PDF", fileUrl: "#", tags: "driver,operations", requiresAcknowledgement: "Yes", acknowledgementStatus: "Acknowledged", description: "Driver/operator procedures and qualifications." },
  { id: "DOC-014", title: "Rapid Intervention Team SOG", category: "SOG", subcategory: "Operations", version: "1.8", effectiveDate: "2025-10-01", uploadedBy: "Training Officer", uploadedDate: "2025-09-18", fileType: "PDF", fileUrl: "#", tags: "rit,fire", requiresAcknowledgement: "Yes", acknowledgementStatus: "Pending", description: "RIT deployment and accountability." },
  { id: "DOC-015", title: "Respiratory Protection Policy", category: "Policy", subcategory: "Safety", version: "1.1", effectiveDate: "2025-07-01", uploadedBy: "Safety Officer", uploadedDate: "2025-06-20", fileType: "PDF", fileUrl: "#", tags: "ppe,scba", requiresAcknowledgement: "Yes", acknowledgementStatus: "Pending", description: "SCBA and respiratory protection requirements." },
  { id: "DOC-016", title: "Allergic Reaction Protocol", category: "EMS Protocol", subcategory: "Medical", version: "2026.1", effectiveDate: "2026-01-01", uploadedBy: "EMS Chief", uploadedDate: "2025-12-30", fileType: "PDF", fileUrl: "#", tags: "ems,allergy", requiresAcknowledgement: "Yes", acknowledgementStatus: "Pending", description: "Anaphylaxis and allergic reaction treatment." },
  { id: "DOC-017", title: "Overtime Authorization Form", category: "Form", subcategory: "Scheduling", version: "1.0", effectiveDate: "2024-06-01", uploadedBy: "Administration", uploadedDate: "2024-05-28", fileType: "PDF", fileUrl: "#", tags: "overtime", requiresAcknowledgement: "No", acknowledgementStatus: "Not Required", description: "Overtime pre-authorization form." },
  { id: "DOC-018", title: "Fleet Maintenance Upload - Q2 Report", category: "Upload", subcategory: "Fleet", version: "1.0", effectiveDate: "2026-04-01", uploadedBy: "Fleet Captain", uploadedDate: "2026-04-05", fileType: "XLSX", fileUrl: "#", tags: "maintenance,fleet", requiresAcknowledgement: "No", acknowledgementStatus: "Not Required", description: "Quarterly fleet maintenance summary." },
  { id: "DOC-019", title: "Live Fire Training SOG", category: "SOG", subcategory: "Training", version: "3.0", effectiveDate: "2025-12-01", uploadedBy: "Training Officer", uploadedDate: "2025-11-18", fileType: "PDF", fileUrl: "#", tags: "training,fire", requiresAcknowledgement: "Yes", acknowledgementStatus: "Acknowledged", description: "Live fire evolution safety and operations." },
  { id: "DOC-020", title: "Bloodborne Pathogens Policy", category: "Policy", subcategory: "Safety", version: "2.0", effectiveDate: "2025-03-01", uploadedBy: "Safety Officer", uploadedDate: "2025-02-20", fileType: "PDF", fileUrl: "#", tags: "safety,ems", requiresAcknowledgement: "Yes", acknowledgementStatus: "Pending", description: "Exposure control and BBP policy." }
];

export const initialOccupancies = [
  { id: "OCC-101", name: "Horn Lake High School", address: "4710 Horn Lake Rd", type: "Educational", hazard: "Moderate", occupancyLoad: "1,200", lastInspection: "Jun 12, 2025", inspectionDue: "Jun 12, 2026", inspector: "J. Mitchell", status: "Active" },
  { id: "OCC-102", name: "Logan's Roadhouse", address: "7188 Airways Blvd", type: "Assembly", hazard: "High", occupancyLoad: "180", lastInspection: "Dec 8, 2025", inspectionDue: "Jun 8, 2026", inspector: "J. Mitchell", status: "Reinspection Due" },
  { id: "OCC-103", name: "Amazon Distribution", address: "2600 Spahn Rd", type: "Warehouse", hazard: "High", occupancyLoad: "450", lastInspection: "Jun 21, 2025", inspectionDue: "Jun 21, 2026", inspector: "J. Wade", status: "Active" },
  { id: "OCC-104", name: "Comfort Inn", address: "6888 Airways Blvd", type: "Lodging", hazard: "Moderate", occupancyLoad: "96", lastInspection: "Jan 15, 2026", inspectionDue: "Jun 15, 2026", inspector: "J. Wade", status: "Pending Review" },
  { id: "OCC-105", name: "Horn Lake City Hall", address: "3101 Goodman Rd W", type: "Business", hazard: "Low", occupancyLoad: "75", lastInspection: "Mar 4, 2026", inspectionDue: "Mar 4, 2027", inspector: "J. Mitchell", status: "Active" }
];

export const initialInspections = [
  { id: "INS-201", occupancy: "Horn Lake High School", occupancyId: "OCC-101", type: "Annual", due: "Jun 12, 2026", inspector: "J. Mitchell", violations: 0, status: "Scheduled" },
  { id: "INS-202", occupancy: "Logan's Roadhouse", occupancyId: "OCC-102", type: "Reinspection", due: "Jun 8, 2026", inspector: "J. Mitchell", violations: 3, status: "Overdue" },
  { id: "INS-203", occupancy: "Amazon Distribution", occupancyId: "OCC-103", type: "Annual", due: "Jun 21, 2026", inspector: "J. Wade", violations: 0, status: "Scheduled" },
  { id: "INS-204", occupancy: "Comfort Inn", occupancyId: "OCC-104", type: "Reinspection", due: "Jun 15, 2026", inspector: "J. Wade", violations: 1, status: "Pending Review" },
  { id: "INS-205", occupancy: "Horn Lake City Hall", occupancyId: "OCC-105", type: "Annual", due: "Mar 4, 2027", inspector: "J. Mitchell", violations: 0, status: "Complete" }
];

export const initialPreplans = [
  { id: "PP-301", occupancy: "Horn Lake High School", occupancyId: "OCC-101", hazards: "Sprinkler, Knox box, AED locations", access: "Main entrance - Gate C for apparatus", waterSupply: "Hydrants HL-1042, HL-1178", lastUpdated: "Apr 12, 2026", status: "Current" },
  { id: "PP-302", occupancy: "Amazon Distribution", occupancyId: "OCC-103", hazards: "High-piled storage, loading docks", access: "Dock 4 - east gate", waterSupply: "Private loop + HL-1281", lastUpdated: "May 2, 2026", status: "Current" },
  { id: "PP-303", occupancy: "Comfort Inn", occupancyId: "OCC-104", hazards: "Multi-story guest rooms, pool chemical storage", access: "Front circle - south stairwell", waterSupply: "HL-1307P private", lastUpdated: "Feb 18, 2026", status: "Review Due" }
];

export const documentCategoryMap = {
  "SOGs / Policies": "SOG",
  "EMS Protocols": "EMS Protocol",
  Forms: "Form",
  Uploads: "Upload"
};

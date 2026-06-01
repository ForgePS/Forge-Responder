import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { Activity, BookOpen, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, ClipboardList, Download, Droplets, Edit3, ExternalLink, FileText, Flame, Gauge, Home, LocateFixed, Mail, MapPin, Save, Search, Settings, ShieldCheck, UploadCloud, Wrench } from "lucide-react";
import logoUrl from "../assets/horn-lake-fire-logo.png";
import { defaultEmsProtocols, defaultFireCodeDocxSections, defaultFireCodeIndex, defaultFireCodePdfSections, defaultFireCodes, defaultFireSogDetails, defaultFireSogs, defaultHoseInventory } from "../data/defaultAppData";
import { deleteFirebaseRecord, firebaseEnabled, loadFirebaseCollection, loadFirebaseList, saveFirebaseRecord, uploadFirebaseFile } from "../lib/firebaseClient";

const hydrantDataUrl = `${import.meta.env.BASE_URL}hydrants.json`;
const localHydrantOverridesKey = "hlfd_hydrant_overrides_v1";
const localActivityKey = "hlfd_daily_activity_v1";
const localPreFirePlansKey = "hlfd_pre_fire_plans_v1";
const hoseTestingBaselineYear = "2026";
const crewUserOptions = [
  "", "Adam Tutor", "Billy White", "Blake Turnmire", "Brandon Jefferies", "Clay Willingham", "Cole Casey", "Cory Hill", "Gregory Scruggs", "Jay Mitchell", "Jay Wade", "Jeff Tidwell", "Jeremy Johnson", "Jeremy Powell", "John Paul Lavender", "Joseph Gardner", "Justin Correro", "Lee Chillis", "Mike Mallett", "Paul Destefanis", "Shane Headley", "Stephen White", "Steven Whitten", "Timothy Jones", "Troy Vest", "Tyler Lee", "William Sigurdson", "William Sisk"
];
const reportEmailRecipients = ["gscruggs@hornlake.org", "Swhite@hornlake.org", "mmueller@hornlake.org", "jmitchell2@hornlake.org"];
const importantNumbers = [
  { name: "American Tire Shop", numbers: [{ label: "Shop", value: "(662)449-0110" }, { label: "Mobile", value: "(901)561-0034" }] },
  { name: "EEP D'Angelo", numbers: [{ label: "Mobile", value: "(901)831-0253" }, { label: "Shop", value: "(662)280-4729" }] },
  { name: "HL City Shop", numbers: [{ label: "Shop", value: "(662)342-4505" }, { label: "On Call", value: "(901)826-0761" }] },
  { name: "HL Dispatch", numbers: [{ label: "Main", value: "(662)393-6174" }] },
  { name: "HL IT", numbers: [{ label: "Daniel", value: "(662)548-6655" }, { label: "Jonathan", value: "(662)470-1704" }] },
  { name: "HL Public Works", numbers: [{ label: "Main", value: "(662)342-7099" }, { label: "Alt", value: "(662)342-4505" }] },
  { name: "HL Public Works Director", numbers: [{ label: "Steve Box", value: "(901)652-1307" }] },
  { name: "HL Water", numbers: [{ label: "Rodney", value: "(901)517-6182" }] },
  { name: "HL Animal Shelter", numbers: [{ label: "Main", value: "(662)393-5857" }] },
  { name: "Magnolia Tire", numbers: [{ label: "Main", value: "(662)342-0194" }] },
  { name: "Mississippi DEQ", numbers: [{ label: "Main", value: "(601)961-5171" }] },
  { name: "North MS Two Way", numbers: [{ label: "Main", value: "(662)429-5732" }] },
  { name: "Red Cross", numbers: [{ label: "Main", value: "(833)583-3111" }] },
  { name: "Board Up", numbers: [{ label: "Main", value: "1-800-262-7387" }] }
];

function phoneHref(number) {
  const cleaned = String(number || "").replace(/[^\d+]/g, "");
  return `tel:${cleaned}`;
}

const shiftOptions = ["", "A Shift", "B Shift", "C Shift"];
const inspectionItems = [
  ["No Obstructions", "Area clear and accessible."],
  ["Operable (Turns Open/Closed)", "Operated smoothly."],
  ["Caps Present", "All caps present."],
  ["Threads in Good Condition", "Threads clean and intact."],
  ["Oil Nut Provided", "Oil nut in place."],
  ["Barrel Drains Properly", "Drains as expected."],
  ["Leaks (Valve / Caps / Barrel)", "No leaks detected."],
  ["Steamer Port / Pumper Outlet Good", "Outlet threads good."],
  ["Adequate Clearance (3 ft all sides)", "Meets clearance requirement."]
];
const cityBounds = [[34.928, -90.125], [34.995, -89.965]];
const crewStorageKey = "horn-lake-hydrant-crew-session";
const themeStorageKey = "horn-lake-hydrant-theme";
const crewSessionHours = 8;
const districtOptions = ["All Districts", "1", "2", "3", "Unassigned"];
const flowStandards = [
  { code: "B", className: "Class AA", colorName: "Blue", gpm: "1500+ gpm", color: "#2563eb" },
  { code: "G", className: "Class A", colorName: "Green", gpm: "1000-1499 gpm", color: "#16a34a" },
  { code: "O", className: "Class B", colorName: "Orange", gpm: "500-999 gpm", color: "#f97316" },
  { code: "R", className: "Class C", colorName: "Red", gpm: "0-499 gpm", color: "#dc2626" }
];
const emsProtocols = [
  { id: "100", title: "Universal Patient Care", type: "Core", summary: "Scene safety, PPE, primary assessment, vital signs, oxygen as indicated, transport decision, and complete documentation.", steps: ["Confirm scene safety and standard precautions.", "Assess airway, breathing, circulation, disability, and exposure.", "Treat immediate life threats and determine transport priority.", "Reassess after interventions and document changes."] },
  { id: "200", title: "Cardiac Arrest", type: "Cardiac", summary: "High-quality CPR, early defibrillation, airway management, vascular access, medication timing, and post-ROSC care.", steps: ["Begin compressions immediately and minimize pauses.", "Apply monitor/defibrillator and follow shockable or non-shockable pathway.", "Manage airway without interrupting compressions.", "After ROSC, support oxygenation, perfusion, and rapid transport."] },
  { id: "300", title: "Respiratory Distress", type: "Medical", summary: "Position of comfort, oxygenation, bronchodilator support when indicated, CPAP consideration, and frequent reassessment.", steps: ["Assess work of breathing, lung sounds, SpO2, and end-tidal CO2 when available.", "Provide oxygen or ventilatory assistance based on presentation.", "Use bronchodilator or CPAP per agency scope and medical direction.", "Prepare for deterioration and transport without delay."] },
  { id: "400", title: "Trauma Assessment", type: "Trauma", summary: "Bleeding control, spinal motion restriction decision, rapid trauma survey, pain control, and destination selection.", steps: ["Control life-threatening hemorrhage first.", "Identify mechanism, injuries, and need for rapid transport.", "Immobilize only when indicated by protocol and clinical findings.", "Reassess circulation, neurologic status, and pain."] },
  { id: "500", title: "Stroke / Neuro", type: "Medical", summary: "Last-known-well time, stroke scale, glucose check, airway protection, and stroke-center notification.", steps: ["Determine exact last-known-well time.", "Perform stroke scale and blood glucose assessment.", "Protect airway and avoid unnecessary scene delay.", "Notify receiving facility with stroke findings and timeline."] }
];
const medicationDosageSections = {
  adult: [
    {
      id: "acls",
      title: "ACLS / Cardiac",
      items: [
        { med: "Epinephrine 1:10,000", use: "Cardiac arrest", dose: "1 mg IV/IO every 3-5 min", note: "VF/pVT, PEA, or asystole arrest algorithm." },
        { med: "Amiodarone", use: "Refractory VF/pVT", dose: "300 mg IV/IO; repeat 150 mg", note: "For shockable arrest after defibrillation attempts." },
        { med: "Lidocaine", use: "Alternative for VF/pVT", dose: "1-1.5 mg/kg IV/IO; repeat 0.5-0.75 mg/kg", note: "Use when selected by protocol instead of amiodarone." },
        { med: "Atropine", use: "Symptomatic bradycardia", dose: "1 mg IV every 3-5 min; max 3 mg", note: "If ineffective, consider pacing or pressor infusion." },
        { med: "Dopamine", use: "Bradycardia infusion", dose: "5-20 mcg/kg/min IV", note: "Titrate to patient response." },
        { med: "Epinephrine infusion", use: "Bradycardia infusion", dose: "2-10 mcg/min IV", note: "Titrate to patient response." },
        { med: "Adenosine", use: "Regular SVT", dose: "6 mg rapid IV push; repeat 12 mg", note: "Follow each dose with rapid flush." },
        { med: "Nitroglycerine", use: "Chest pain / hypertension per protocol", dose: "1 SL spray every 3-5 min as indicated", note: "Avoid if hypotensive or contraindicated; follow local protocol." },
        { med: "Aspirin", use: "Suspected ACS", dose: "324 mg chewable", note: "Avoid aspirin allergy or active major bleeding." }
      ]
    },
    {
      id: "respiratory",
      title: "Respiratory",
      items: [
        { med: "Albuterol", use: "Bronchospasm / wheezing", dose: "2.5 mg / 3 mL NS nebulized every 5-15 min", note: "May repeat per protocol and patient response." },
        { med: "Methylprednisolone", use: "Severe asthma/COPD", dose: "62.5-125 mg IV/IM", note: "Use lower dose for small stature or steroid sensitivity per protocol." },
        { med: "Dexamethasone", use: "Steroid alternative", dose: "10 mg IV/IO/IM", note: "Use when substituted by local protocol." },
        { med: "Nebulized Epinephrine", use: "Croup / upper airway swelling", dose: "Epinephrine 1:1000 diluted to 2.5-3 mL NS", note: "May repeat up to 3 doses per protocol." }
      ]
    },
    {
      id: "allergy",
      title: "Allergic Reaction",
      items: [
        { med: "Epinephrine 1:1000", use: "Anaphylaxis", dose: "0.3-0.5 mg IM", note: "Repeat per protocol for severe ongoing reaction." },
        { med: "Diphenhydramine", use: "Allergic reaction", dose: "25-50 mg IV or deep IM", note: "Monitor for sedation and hypotension." },
        { med: "Methylprednisolone", use: "Allergic reaction adjunct", dose: "62.5-125 mg IV/IM", note: "Adjunct only; epinephrine is first-line for anaphylaxis." },
        { med: "Albuterol", use: "Wheezing after allergic reaction", dose: "2.5 mg nebulized", note: "Use if wheezing persists after epinephrine." }
      ]
    },
    {
      id: "altered",
      title: "Altered / Diabetic",
      items: [
        { med: "Dextrose 50%", use: "Symptomatic hypoglycemia", dose: "Per protocol PRN", note: "Confirm glucose and monitor response." },
        { med: "Glucagon", use: "Hypoglycemia without IV access", dose: "1-2 mg IM", note: "May be used IM/IN per protocol availability." },
        { med: "Naloxone", use: "Suspected opioid overdose", dose: "0.4-2 mg IV/IO/IN", note: "Titrate to adequate respirations, not full arousal." }
      ]
    },
    {
      id: "seizure",
      title: "Seizure / Sedation",
      items: [
        { med: "Midazolam", use: "Seizure / sedation", dose: "2-5 mg IV/IO/IN/IM", note: "Repeat per protocol; be ready to manage airway." },
        { med: "Diazepam", use: "Seizure", dose: "2-10 mg slow IV/IO", note: "Monitor respirations and blood pressure." }
      ]
    },
    {
      id: "pain-nausea",
      title: "Pain / Nausea",
      items: [
        { med: "Ondansetron", use: "Nausea / vomiting", dose: "2-4 mg IV", note: "Use lower initial dose when appropriate." },
        { med: "Promethazine", use: "Nausea / vomiting", dose: "6.25-12.5 mg slow IV", note: "May repeat once per protocol." },
        { med: "Fentanyl / Morphine", use: "Pain relief", dose: "Per pain protocol", note: "Avoid with hypotension, severe respiratory distress, or contraindications." }
      ]
    }
  ],
  pedi: [
    {
      id: "acls",
      title: "Pedi Cardiac / PALS",
      items: [
        { med: "Epinephrine 1:10,000", use: "Cardiac arrest / poor perfusion bradycardia", dose: "0.01 mg/kg IV/IO; max 1 mg", note: "Repeat every 3-5 min during arrest." },
        { med: "Amiodarone", use: "Refractory VF/pVT", dose: "5 mg/kg IV/IO; max 300 mg", note: "May repeat up to 3 doses; subsequent max 150 mg." },
        { med: "Lidocaine", use: "Alternative for VF/pVT", dose: "1 mg/kg IV/IO", note: "Use when selected by protocol." },
        { med: "Atropine", use: "Vagal bradycardia / AV block", dose: "0.02 mg/kg IV/IO", note: "Minimum 0.1 mg; max single dose 0.5 mg; may repeat once." },
        { med: "Adenosine", use: "Probable SVT", dose: "0.1 mg/kg rapid IV/IO; max 6 mg", note: "Repeat 0.2 mg/kg if needed; max 12 mg." }
      ]
    },
    {
      id: "respiratory",
      title: "Pedi Respiratory",
      items: [
        { med: "Albuterol", use: "Bronchospasm / wheezing", dose: "2.5 mg / 3 mL NS nebulized every 5-15 min", note: "Repeat per protocol and patient response." },
        { med: "Epinephrine 1:1000", use: "Severe asthma/anaphylaxis with respiratory distress", dose: "0.01 mg/kg IM; max 0.3 mg", note: "Use for severe symptoms per protocol." },
        { med: "Dexamethasone", use: "Steroid alternative", dose: "0.25-1 mg/kg IV/IO/IM", note: "Follow protocol/medical control." },
        { med: "Nebulized Epinephrine", use: "Croup", dose: "1:1000 diluted to 2.5-3 mL NS", note: "May repeat up to 3 doses per protocol." }
      ]
    },
    {
      id: "allergy",
      title: "Pedi Allergic Reaction",
      items: [
        { med: "Epinephrine 1:1000", use: "Anaphylaxis", dose: "0.01 mg/kg IM; max 0.3 mg", note: "First-line medication for anaphylaxis." },
        { med: "Diphenhydramine", use: "Allergic reaction", dose: "1 mg/kg IV/IM", note: "Adjunct after epinephrine for anaphylaxis." },
        { med: "Albuterol", use: "Wheezing after allergic reaction", dose: "2.5 mg nebulized", note: "Use if wheezing persists." }
      ]
    },
    {
      id: "altered",
      title: "Pedi Altered / Diabetic",
      items: [
        { med: "Glucagon", use: "Hypoglycemia without IV access", dose: "0.5-1 mg IM", note: "Use per protocol and age/size." },
        { med: "Naloxone", use: "Suspected opioid overdose", dose: "0.1 mg/kg IV/IO/IN; max 2 mg", note: "Titrate to adequate respirations." }
      ]
    },
    {
      id: "seizure",
      title: "Pedi Seizure / Sedation",
      items: [
        { med: "Midazolam", use: "Seizure", dose: "0.1 mg/kg IV/IO/IN", note: "Intranasal volume chart is available in protocol reference." },
        { med: "Diazepam", use: "Seizure", dose: "0.2 mg/kg IV/IO", note: "Monitor ventilation closely." }
      ]
    },
    {
      id: "pain-nausea",
      title: "Pedi Pain / Nausea",
      items: [
        { med: "Ondansetron", use: "Nausea / vomiting", dose: "0.15 mg/kg IV", note: "Use per protocol and age/size." },
        { med: "Promethazine", use: "Nausea / vomiting", dose: "0.05-0.1 mg/kg slow IV", note: "Use only when allowed by protocol." }
      ]
    }
  ]
};
const aclsMedicationSources = [
  { label: "AHA Adult Cardiac Arrest Algorithm", url: "https://cpr.heart.org/-/media/CPR-Files/CPR-Guidelines-Files/2025-Algorithms/Algorithm-ACLS-CA-250527.pdf?sc_lang=en" },
  { label: "AHA Adult Bradycardia Algorithm", url: "https://cpr.heart.org/-/media/CPR-Files/CPR-Guidelines-Files/2025-Algorithms/Algorithm-ACLS-Bradycardia-250514.pdf" },
  { label: "AHA Adult Tachycardia Algorithm", url: "https://cpr.heart.org/-/media/CPR-Files/CPR-Guidelines-Files/2025-Algorithms/Algorithm-ACLS-Tachycardia-250514.pdf" },
  { label: "AHA Pediatric Cardiac Arrest Algorithm", url: "https://cpr.heart.org/-/media/CPR-Files/CPR-Guidelines-Files/2025-Algorithms/Algorithm-PALS-CA-250123.pdf" },
  { label: "AHA Pediatric Bradycardia Algorithm", url: "https://cpr.heart.org/-/media/CPR-Files/CPR-Guidelines-Files/2025-Algorithms/Algorithm-PALS-Bradycardia-250121.pdf?sc_lang=en" },
  { label: "AHA Pediatric Tachyarrhythmia Algorithm", url: "https://cpr.heart.org/-/media/CPR-Files/CPR-Guidelines-Files/2025-Accessible/Algorithm-PALS-Tachyarrhythmia-LngDscrp-250729-Ed.pdf" }
];
const fireCodeAssetBase = "https://dept-app-k85k.onrender.com";
const upCodesBase = "https://up.codes/viewer/international/ifc-2024";
const fireCodePdfUrls = {
  1: "/codes/100 - Scope and Administration.pdf",
  2: "/codes/200 - Definitions.pdf",
  3: "/codes/300 - General Requirements.pdf",
  4: "/codes/400 - Emergency Planning and Preparedness.pdf",
  5: "/codes/500 - Fire Service Features.pdf",
  6: "/codes/600 - Building Services and Systems.pdf",
  7: "/codes/700 - Fire and Smoke Protection Fetures.pdf",
  8: "/codes/800 - Interior Finish, Decorative Materials and Furnishings.pdf",
  9: "/codes/900 - Fire Protection and Life Safety Systems.pdf",
  10: "/codes/1000 - Means of Egress.pdf",
  11: "/codes/1100 - Construction Requirements for Exhisting Buildings.pdf",
  12: "/codes/1200 - Energy Systems.pdf"
};
const fireCodeParts = [
  { part: "Part I - Administrative", chapters: [{ num: 1, code: "100", title: "Scope and Administration", pages: "1-1 to 1-46" }, { num: 2, code: "200", title: "Definitions", pages: "2-1 to 2-168" }] },
  { part: "Part II - General Safety Provisions", chapters: [{ num: 3, code: "300", title: "General Requirements", pages: "3-1 to 3-40" }, { num: 4, code: "400", title: "Emergency Planning and Preparedness", pages: "4-1 to 4-30" }] },
  { part: "Part III - Building and Equipment Design Features", chapters: [{ num: 5, code: "500", title: "Fire Service Features", pages: "5-1 to 5-28" }, { num: 6, code: "600", title: "Building Services and Systems", pages: "6-1 to 6-32" }, { num: 7, code: "700", title: "Fire and Smoke Protection Features", pages: "7-1 to 7-8" }, { num: 8, code: "800", title: "Interior Finish, Decorative Materials and Furnishings", pages: "8-1 to 8-34" }, { num: 9, code: "900", title: "Fire Protection and Life Safety Systems", pages: "9-1 to 9-174" }, { num: 10, code: "1000", title: "Means of Egress", pages: "10-1 to 10-260" }, { num: 11, code: "1100", title: "Construction Requirements for Existing Buildings", pages: "11-1 to 11-38" }, { num: 12, code: "1200", title: "Energy Systems", pages: "12-1 to 12-48" }] },
  { part: "Part IV - Special Occupancies and Operations", chapters: [{ num: 20, code: "2000", title: "Aviation Facilities", pages: "20-1 to 20-24" }, { num: 21, code: "2100", title: "Dry Cleaning", pages: "21-1 to 21-14" }, { num: 22, code: "2200", title: "Combustible Dust-Producing Operations", pages: "22-1 to 22-14" }, { num: 23, code: "2300", title: "Motor Fuel-Dispensing Facilities and Repair Garages", pages: "23-1 to 23-46" }, { num: 24, code: "2400", title: "Flammable Finishes", pages: "24-1 to 24-42" }, { num: 25, code: "2500", title: "Fruit and Crop Ripening", pages: "25-1 to 25-4" }, { num: 26, code: "2600", title: "Fumigation and Insecticidal Fogging", pages: "26-1 to 26-10" }, { num: 27, code: "2700", title: "Semiconductor Fabrication Facilities", pages: "27-1 to 27-26" }, { num: 28, code: "2800", title: "Lumber Yards and Agro-Industrial, Solid Biomass and Woodworking Facilities", pages: "28-1 to 28-16" }, { num: 29, code: "2900", title: "Manufacture of Organic Coatings", pages: "29-1 to 29-12" }, { num: 30, code: "3000", title: "Industrial Ovens", pages: "30-1 to 30-4" }, { num: 31, code: "3100", title: "Tents, Temporary Special Event Structures and Other Membrane Structures", pages: "31-1 to 31-30" }, { num: 32, code: "3200", title: "High-Piled Combustible Storage", pages: "32-1 to 32-62" }, { num: 33, code: "3300", title: "Fire Safety During Construction and Demolition", pages: "33-1 to 33-22" }, { num: 34, code: "3400", title: "Tire Rebuilding and Tire Storage", pages: "34-1 to 34-6" }, { num: 35, code: "3500", title: "Welding and Other Hot Work", pages: "35-1 to 35-12" }, { num: 36, code: "3600", title: "Marinas", pages: "36-1 to 36-6" }, { num: 37, code: "3700", title: "Combustible Fibers", pages: "37-1 to 37-4" }, { num: 38, code: "3800", title: "Higher Education Laboratories", pages: "38-1 to 38-10" }, { num: 39, code: "3900", title: "Processing and Extraction Facilities", pages: "39-1 to 39-8" }, { num: 40, code: "4000", title: "Storage of Distilled Spirits and Wines", pages: "40-1 to 40-20" }, { num: 41, code: "4100", title: "Temporary Heating and Cooking Operations", pages: "41-1 to 41-10" }] },
  { part: "Part V - Hazardous Materials", chapters: [{ num: 50, code: "5000", title: "Hazardous Materials - General Provisions", pages: "50-1 to 50-58" }, { num: 51, code: "5100", title: "Aerosols", pages: "51-1 to 51-26" }, { num: 53, code: "5300", title: "Compressed Gases", pages: "53-1 to 53-20" }, { num: 54, code: "5400", title: "Corrosive Materials", pages: "54-1 to 54-4" }, { num: 55, code: "5500", title: "Cryogenic Fluids", pages: "55-1 to 55-12" }, { num: 56, code: "5600", title: "Explosives and Fireworks", pages: "56-1 to 56-38" }, { num: 57, code: "5700", title: "Flammable and Combustible Liquids", pages: "57-1 to 57-90" }, { num: 58, code: "5800", title: "Flammable Gases and Flammable Cryogenic Fluids", pages: "58-1 to 58-14" }, { num: 59, code: "5900", title: "Flammable Solids", pages: "59-1 to 59-8" }, { num: 60, code: "6000", title: "Highly Toxic and Toxic Materials", pages: "60-1 to 60-20" }, { num: 61, code: "6100", title: "Liquefied Petroleum Gases", pages: "61-1 to 61-24" }, { num: 62, code: "6200", title: "Organic Peroxides", pages: "62-1 to 62-8" }, { num: 63, code: "6300", title: "Oxidizers, Oxidizing Gases and Oxidizing Cryogenic Fluids", pages: "63-1 to 63-14" }, { num: 64, code: "6400", title: "Pyrophoric Materials", pages: "64-1 to 64-6" }, { num: 65, code: "6500", title: "Pyroxylin (Cellulose Nitrate) Plastics", pages: "65-1 to 65-4" }, { num: 66, code: "6600", title: "Unstable (Reactive) Materials", pages: "66-1 to 66-6" }, { num: 67, code: "6700", title: "Water-Reactive Solids and Liquids", pages: "67-1 to 67-6" }] },
  { part: "Part VI - Referenced Standards", chapters: [{ num: 80, code: "8000", title: "Referenced Standards", pages: "80-1 to 80-16" }] },
  { part: "Part VII - Appendices", chapters: [{ num: "A", code: "App. A", title: "Board of Appeals", pages: "A-1 to A-4" }, { num: "B", code: "App. B", title: "Fire-Flow Requirements for Buildings", pages: "B-1 to B-10" }, { num: "C", code: "App. C", title: "Fire Hydrant Locations and Distribution", pages: "C-1 to C-6" }, { num: "D", code: "App. D", title: "Fire Apparatus Access Roads", pages: "D-1 to D-12" }, { num: "E", code: "App. E", title: "Hazard Categories", pages: "E-1 to E-28" }, { num: "F", code: "App. F", title: "Hazard Ranking", pages: "F-1 to F-4" }, { num: "G", code: "App. G", title: "Cryogenic Fluids - Weight and Volume Equivalents", pages: "G-1 to G-4" }, { num: "H", code: "App. H", title: "Hazardous Materials Management Plan (HMMP) and HMIS Instructions", pages: "H-1 to H-10" }, { num: "I", code: "App. I", title: "Fire Protection Systems - Noncompliant Conditions", pages: "I-1 to I-6" }, { num: "J", code: "App. J", title: "Building Information Sign", pages: "J-1 to J-4" }, { num: "K", code: "App. K", title: "Construction Requirements for Existing Ambulatory Care Facilities", pages: "K-1 to K-8" }, { num: "L", code: "App. L", title: "Requirements for Fire Fighter Air Replenishment Systems", pages: "L-1 to L-10" }, { num: "M", code: "App. M", title: "High-Rise Buildings - Retroactive Automatic Sprinkler Requirement", pages: "M-1 to M-2" }, { num: "N", code: "App. N", title: "Indoor Trade Shows and Exhibitions", pages: "N-1 to N-8" }, { num: "O", code: "App. O", title: "Valet Trash and Recycling Collection in Group R-2 Occupancies", pages: "O-1 to O-4" }] }
];
const fireCodeIndex = [
  { title: "Combustible Waste Material", section: "304", chapter: 3 },
  { title: "Open Burning", section: "307", chapter: 3 },
  { title: "Fire Apparatus Access Roads", section: "503", chapter: 5 },
  { title: "Fire Protection Water Supplies", section: "507", chapter: 5 },
  { title: "Emergency Responder Communication Coverage", section: "510", chapter: 5 },
  { title: "Portable Fire Extinguishers", section: "906", chapter: 9 },
  { title: "Fire Alarm and Detection Systems", section: "907", chapter: 9 },
  { title: "Automatic Sprinkler Systems", section: "903", chapter: 9 },
  { title: "Means of Egress", section: "1003", chapter: 10 },
  { title: "Doors, Gates and Turnstiles", section: "1010", chapter: 10 },
  { title: "Fire-Flow Requirements", section: "507.3", chapter: 5 },
  { title: "Fire Hydrant Locations and Distribution", section: "Appendix C", chapter: "C" },
  { title: "Hazardous Materials Management Plan", section: "Appendix H", chapter: "H" },
  { title: "Valet Trash Collection", section: "304.1.1", chapter: 3 }
];
const fireCodeChapterNotes = {
  1: ["Administrative authority, permits, inspections, enforcement powers, unsafe conditions, and appeals.", "Code official has authority to inspect, issue notices, require permits, order corrections, and address unsafe conditions."],
  2: ["Definitions used throughout the IFC.", "Use this when a term decides whether a condition is regulated, exempt, or belongs in a specific hazard category."],
  3: ["General fire-safety housekeeping, combustible waste, ignition sources, vacant buildings, open burning, and hazards to firefighters.", "Keep combustible waste controlled, maintain safe premises, limit open burning, protect vacant structures, and remove conditions that create fire spread or firefighter hazards."],
  4: ["Emergency plans, fire safety plans, evacuation drills, lockdown plans, and employee training.", "Required occupancies need written plans, trained staff, drills where applicable, and procedures that match the building use and hazards."],
  5: ["Fire department access, address numbers, key boxes, gates, hydrants, water supply, and responder radio coverage.", "Apparatus roads, fire lanes, premises ID, hydrants, and access features must stay visible, reachable, marked, and usable by responding crews."],
  6: ["Building services such as electrical, mechanical, fuel-fired equipment, elevators, commercial cooking, and emergency power.", "Service equipment must be installed, maintained, accessible, and protected so utilities and building systems do not create fire or life-safety hazards."],
  7: ["Fire-resistance-rated construction, openings, penetrations, joints, smoke barriers, and fire doors.", "Rated walls, doors, dampers, and penetrations must preserve the intended separation and cannot be blocked, propped, damaged, or improperly altered."],
  8: ["Interior finish, decorations, furnishings, curtains, decorative vegetation, and flame spread controls.", "Interior materials and decorations must meet flame spread, smoke, treatment, and placement limits, especially in assembly and high-risk occupancies."],
  9: ["Fire protection and life-safety systems: sprinklers, alarms, standpipes, suppression, smoke control, and extinguishers.", "Required systems must be installed, monitored, inspected, tested, maintained, and kept in service; impairments need control and notification."],
  10: ["Means of egress: occupant load, exit access, doors, locks, travel distance, exit signs, lighting, and discharge.", "People must have enough clear, unlocked, marked, illuminated exit paths from occupied areas to a safe discharge point."],
  11: ["Existing building retrofit requirements and corrections for older occupancies.", "Existing buildings may need added fire protection, alarms, egress upgrades, or other corrections when hazards or occupancy conditions require it."],
  12: ["Energy systems including batteries, fuel cells, solar, capacitors, and related protection.", "Energy systems need approved installation, separation, ventilation, signage, emergency disconnects, and fire protection based on technology and size."],
  20: ["Aviation facility fire safety.", "Aircraft operations, hangars, fuel handling, and related airport hazards need controlled ignition sources, fire protection, and emergency access."],
  21: ["Dry-cleaning operations.", "Dry-cleaning solvents, machines, ventilation, storage, and fire protection must match the solvent hazard and equipment type."],
  22: ["Combustible dust-producing operations.", "Dust collection, housekeeping, ignition control, explosion protection, and equipment maintenance are central to reducing dust fire and deflagration hazards."],
  23: ["Motor fuel-dispensing facilities and repair garages.", "Fuel dispensing, tanks, pumps, emergency shutoffs, ventilation, repair operations, and ignition control must be maintained and protected."],
  24: ["Flammable finishes, spray booths, dipping, powder coating, and related ventilation.", "Finishing operations require listed booths/rooms, ventilation, electrical controls, overspray cleanup, separation, and fire protection."],
  25: ["Fruit and crop ripening.", "Ethylene and ripening processes require gas controls, ventilation, separation, and fire-safe equipment operation."],
  26: ["Fumigation and insecticidal fogging.", "Operations require notification, warning signs, restricted entry, ventilation, and controls for toxic or flammable fumigants."],
  27: ["Semiconductor fabrication facilities.", "Process gases, hazardous production materials, exhausted enclosures, detection, emergency controls, and fire protection are the major focus."],
  28: ["Lumber yards, woodworking, biomass, and agro-industrial storage.", "Large combustible storage, dust, access, piles, separation, fire protection, and housekeeping drive the requirements."],
  29: ["Manufacture of organic coatings.", "Coating operations regulate flammable liquids, mixing, storage, ventilation, process equipment, and ignition control."],
  30: ["Industrial ovens.", "Ovens require ventilation, interlocks, fuel safeguards, temperature controls, and fire-safe operation."],
  31: ["Tents, membrane structures, and temporary special event structures.", "Temporary structures need permits, flame-resistant materials, separation, exits, occupant control, and fire access."],
  32: ["High-piled combustible storage.", "Storage height, commodity class, aisle access, sprinkler design, rack layout, smoke/heat removal, and fire department access determine compliance."],
  33: ["Fire safety during construction and demolition.", "Sites need fire access, water supply, hot work controls, housekeeping, temporary heating rules, and protection for occupied or exposed areas."],
  34: ["Tire rebuilding and tire storage.", "Tire storage needs pile limits, access aisles, separation, fire protection, and control of outdoor/indoor storage hazards."],
  35: ["Welding and hot work.", "Hot work requires authorization, fire watch, combustible clearance, gas cylinder safety, and protection of nearby hazards."],
  36: ["Marinas.", "Marina fire safety focuses on fuel, electrical hazards, access, extinguishers, standpipes where required, and dock operations."],
  37: ["Combustible fibers.", "Loose fiber storage and handling require housekeeping, ignition control, separation, and fire protection."],
  38: ["Higher education laboratories.", "Laboratory chemical quantities, storage, ventilation, emergency planning, and hazard controls are the core requirements."],
  39: ["Processing and extraction facilities.", "Extraction processes regulate flammable solvents, equipment listing, ventilation, gas detection, electrical classification, and operational controls."],
  40: ["Storage of distilled spirits and wines.", "Alcohol storage and processing require control of liquid quantities, ventilation, drainage, fire protection, and ignition sources."],
  41: ["Temporary heating and cooking operations.", "Temporary heat/cooking must maintain clearances, fuel safety, supervision, extinguishers, and safe placement."],
  50: ["Hazardous materials general provisions.", "Classify the material, compare quantities to control limits, require permits/plans where triggered, and control storage, separation, signage, and emergency information."],
  51: ["Aerosols.", "Aerosol storage/display is regulated by level, quantity, protection, retail display limits, and warehouse storage arrangement."],
  53: ["Compressed gases.", "Gas cylinders and systems require securing, separation, ventilation, signage, valve protection, and controls based on gas hazard."],
  54: ["Corrosive materials.", "Corrosives need compatible storage, spill control, separation from incompatible materials, signage, and safe dispensing/handling."],
  55: ["Cryogenic fluids.", "Cryogens require ventilation, pressure relief, separation, oxygen-deficiency controls, signage, and protection from physical damage."],
  56: ["Explosives and fireworks.", "Explosives/fireworks require strict permits, storage magazines, separation distances, security, and display/sale controls."],
  57: ["Flammable and combustible liquids.", "Regulates liquid classification, storage cabinets/rooms, tanks, dispensing, ventilation, spill control, grounding, and ignition sources."],
  58: ["Flammable gases and flammable cryogenic fluids.", "Controls storage, piping, detection, ventilation, separation, emergency shutoffs, and ignition sources."],
  59: ["Flammable solids.", "Requires limited quantities, separation, compatible storage, ignition control, and fire protection based on material behavior."],
  60: ["Highly toxic and toxic materials.", "Requires containment, ventilation, detection, emergency plans, signage, and strict quantity/control-area limits."],
  61: ["Liquefied petroleum gases.", "LP-gas containers, placement, separation, vehicle protection, piping, dispensing, and ignition controls are central."],
  62: ["Organic peroxides.", "Regulates class, temperature control, separation, quantities, storage arrangement, and fire protection."],
  63: ["Oxidizers and oxidizing gases/cryogens.", "Oxidizers must be separated from combustibles/incompatibles and controlled by quantity, storage, ventilation, and protection."],
  64: ["Pyrophoric materials.", "Materials that ignite in air require tight quantity limits, inerting or special containment, ventilation, and emergency controls."],
  65: ["Pyroxylin plastics.", "Cellulose nitrate plastics require quantity limits, storage controls, separation, and fire protection due to rapid burning."],
  66: ["Unstable reactive materials.", "Reactive materials need classification, quantity limits, separation, temperature/pressure controls, and emergency planning."],
  67: ["Water-reactive solids and liquids.", "Keep water-reactive materials separated from water sources, incompatible materials, and uncontrolled storage or spill conditions."],
  80: ["Referenced standards.", "Lists external standards incorporated by the IFC; use it to identify which edition governs a referenced system or installation."],
  A: ["Board of appeals.", "Explains the appeal process for code interpretations, orders, or decisions where adopted."],
  B: ["Fire-flow requirements for buildings.", "Provides fire-flow calculation guidance based on construction type, area, exposure, and fire protection features where adopted."],
  C: ["Fire hydrant locations and distribution.", "Gives hydrant spacing and distribution guidance so required fire flow can be delivered within practical hose lays."],
  D: ["Fire apparatus access roads.", "Provides access-road design guidance including width, turning radius, dead ends, grades, and aerial fire apparatus access where adopted."],
  E: ["Hazard categories.", "Helps classify hazardous materials for permit thresholds, control areas, storage limits, and protection requirements."],
  F: ["Hazard ranking.", "Provides ranking support for hazardous materials and operations."],
  G: ["Cryogenic fluid equivalents.", "Provides weight/volume conversion information for cryogenic fluids."],
  H: ["HMMP and HMIS instructions.", "Outlines hazardous materials management plan and inventory statement information needed for review."],
  I: ["Fire protection system noncompliance.", "Lists conditions that can make fire protection systems noncompliant or impaired."],
  J: ["Building information sign.", "Addresses building information signage for responding fire departments where adopted."],
  K: ["Existing ambulatory care facilities.", "Adds construction requirements for existing ambulatory care facilities where adopted."],
  L: ["Fire fighter air replenishment systems.", "Guidance for firefighter air replenishment system requirements where adopted."],
  M: ["High-rise sprinkler retrofit.", "Addresses retroactive automatic sprinkler requirements for high-rise buildings where adopted."],
  N: ["Indoor trade shows and exhibitions.", "Covers booth layouts, displays, decorative materials, exits, and fire protection for indoor events."],
  O: ["Valet trash and recycling in Group R-2.", "Controls corridor collection, container type, timing, placement, and management of trash/recycling in multifamily occupancies."]
};
const fireCodeSectionNotes = {
  "304": ["Combustible waste must not accumulate in a way that creates fire, pest, access, or exposure hazards.", "Waste containers, dumpsters, oily rags, and exterior storage need housekeeping, separation, and proper disposal."],
  "304.1.1": ["Valet trash in multifamily occupancies is tied to combustible waste control.", "The concern is trash left in corridors or egress paths, wrong containers, excessive dwell time, and fire load outside units."],
  "307": ["Open burning is restricted unless allowed by permit, exception, or approved conditions.", "Location, attendance, extinguishment, weather, fuel type, smoke impact, and nuisance/hazard conditions matter."],
  "503": ["Fire apparatus access roads must let responding units reach buildings, fire lanes, FDCs, and operational positions.", "Watch width, vertical clearance, turnarounds, dead ends, grades, gates, no-parking markings, and obstructions."],
  "507": ["Approved water supplies must support firefighting operations for buildings and sites.", "Hydrants, fire flow, private mains, spacing, and reliability are the practical inspection points."],
  "507.3": ["Required fire flow is based on building size, construction, occupancy, exposure, and fire protection features.", "Use this as the pointer for whether available water supply is enough for the building being reviewed."],
  "510": ["Emergency responder radio coverage must work inside buildings where required.", "Systems need approved design, testing, monitoring, power backup, access, and ongoing maintenance."],
  "903": ["Automatic sprinkler systems are required by occupancy, hazard, building size/height, special use, or specific code trigger.", "Inspect for required coverage, valve supervision, water supply, impairment handling, and testing records."],
  "906": ["Portable extinguishers must be selected, mounted, visible, accessible, tagged, and spaced for the hazard.", "Check travel distance, rating, mounting height, obstruction, kitchen/special hazard needs, and annual service."],
  "907": ["Fire alarm/detection systems are required by occupancy, occupant load, building features, or specific hazards.", "Look for required initiation, notification, monitoring, acceptance testing, maintenance, and impairment handling."],
  "1003": ["General egress rules require a continuous, clear, usable path sized for the occupant load.", "Do not allow blocked paths, reduced width, low headroom, storage in exits, or conditions that delay occupants."],
  "1010": ["Doors in the means of egress must open, unlatch, swing, and release as required for safe exit.", "Watch locks, latches, panic hardware, special locking arrangements, door swing, thresholds, and delayed/controlled egress."],
  "Appendix C": ["Hydrant distribution guidance supports hose lay, spacing, and available fire flow.", "Use it for site layout checks, hydrant spacing questions, and whether hydrants are placed where crews can actually use them."],
  "Appendix H": ["HMMP/HMIS information tells reviewers what hazardous materials are present, where they are, and in what quantities.", "Needed details include material identity, hazard class, amounts, storage/use locations, containers, control areas, and emergency contacts."]
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function hydrantKey(h) {
  return h.location_id || h.hydrant_id || h.official_hydrant_id || h.arcgis_objectid;
}

function isPrivateHydrant(h) {
  return /P$/i.test(String(h.hydrant_id || h.official_hydrant_id || "").trim());
}

function isOutOfServiceHydrant(h) {
  const status = String(h.status || "").toLowerCase();
  const flow = String(h.flow_result || "").trim().toUpperCase();
  return status.includes("out") || flow === "OOS";
}

function currentYear() {
  return String(new Date().getFullYear());
}

function isCheckedThisYear(h) {
  if (isPrivateHydrant(h) || isOutOfServiceHydrant(h)) return true;
  const year = currentYear();
  return String(h.checked_year || "") === year || String(h.last_checked || "").startsWith(year);
}

function checkedLabel(h) {
  if (isPrivateHydrant(h)) return "Private - Do Not Test";
  if (isOutOfServiceHydrant(h)) return "Out of Service";
  return isCheckedThisYear(h) ? `Checked ${currentYear()}` : `Due ${currentYear()}`;
}

function isDueThisYear(h) {
  return !isPrivateHydrant(h) && !isOutOfServiceHydrant(h) && !isCheckedThisYear(h);
}

function hydrantStatusClass(h) {
  if (isPrivateHydrant(h)) return "private";
  if (isOutOfServiceHydrant(h)) return "oos";
  return isCheckedThisYear(h) ? "checked" : "due";
}

function flowStandard(hOrCode) {
  const code = typeof hOrCode === "string" ? hOrCode : String(hOrCode?.flow_result || hOrCode?.flow_gpm || "").trim().toUpperCase();
  return flowStandards.find((item) => item.code === code) || null;
}

function flowColor(h) {
  const status = String(h.status || "").toLowerCase();
  const flow = String(h.flow_result || h.flow_gpm || "").trim().toUpperCase();
  if (isPrivateHydrant(h)) return "#7c3aed";
  if (status.includes("out") || flow === "OOS") return "#050505";
  const standard = flowStandard(flow);
  if (standard) return standard.color;
  if (flow === "UK" || flow === "UNKNOWN") return "#64748b";
  if (flow === "A") return "#16a34a";
  if (flow === "C") return "#f97316";
  if (flow === "D" || flow === "LOW") return "#dc2626";
  const n = Number(flow.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(n) && n > 0) {
    if (n >= 1000) return "#15803d";
    if (n >= 500) return "#2563eb";
    if (n >= 250) return "#f59e0b";
    return "#dc2626";
  }
  return "#64748b";
}

function flowText(h) {
  if (isPrivateHydrant(h)) return "Private Hydrant (Do Not Test)";
  const standard = flowStandard(h);
  if (standard) return `${standard.className} - ${standard.colorName}`;
  const flow = h.flow_result || h.flow_gpm || "Unknown";
  if (String(h.status || "").toLowerCase().includes("out")) return "Out of Service";
  return flow;
}

function flowGpmText(h) {
  if (isPrivateHydrant(h)) return "Do Not Test";
  return flowStandard(h)?.gpm || displayValue(h.flow_gpm);
}

function newBlankCrew() {
  return { tested_by: "", shift: "", date: today(), district: "All Districts", expires_at: "" };
}

function loadCrewSession() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(crewStorageKey) || "null");
    if (!parsed?.expires_at || Date.now() >= Number(parsed.expires_at)) {
      window.localStorage.removeItem(crewStorageKey);
      return newBlankCrew();
    }
    return { tested_by: parsed.tested_by || "", shift: parsed.shift || "", date: parsed.date || today(), district: parsed.district || "All Districts", expires_at: parsed.expires_at };
  } catch {
    return newBlankCrew();
  }
}

function crewExpiresLabel(crew) {
  if (!crew.expires_at) return "Not set";
  return new Date(Number(crew.expires_at)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function hasActiveShiftSession(crew) {
  return Boolean(crew?.tested_by && crew?.shift && crew?.expires_at && Date.now() < Number(crew.expires_at));
}

function districtMatches(h, district) {
  if (!district || district === "All Districts") return true;
  if (district === "Unassigned") return !String(h.district || "").trim();
  return String(h.district || "") === district;
}

function displayValue(value) {
  return String(value ?? "").trim() || "N/A";
}

async function staticHydrants() {
  const res = await fetch(hydrantDataUrl);
  if (!res.ok) throw new Error(`Static hydrants returned ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.hydrants) ? data.hydrants : [];
}

const detailFields = [
  ["Hydrant ID", "hydrant_id"],
  ["Official ID", "official_hydrant_id"],
  ["Location ID", "location_id"],
  ["ArcGIS Object", "arcgis_objectid"],
  ["District", "district"],
  ["Address", "address"],
  ["Location", "location"],
  ["Description", "description"],
  ["Hydrant Type", "hydrant_type"],
  ["Flow Result", "flow_result"],
  ["Flow/GPM", "flow_gpm"],
  ["Status", "status"],
  ["Provider", "provider"],
  ["Water Assoc", "water_assoc"],
  ["Subdivision", "subdivision"],
  ["Additional", "additional"],
  ["Fire Response Area", "fire_response_area"],
  ["City", "city"],
  ["Latitude", "latitude"],
  ["Longitude", "longitude"],
  ["Last Checked", "last_checked"],
  ["Checked Year", "checked_year"],
  ["Checked Source", "checked_source"],
  ["Checked By", "checked_by"],
  ["Checked Shift", "checked_shift"],
  ["Static PSI", "static_psi"],
  ["Residual PSI", "residual_psi"],
  ["Pitot PSI", "pitot_psi"],
  ["Discharge Size", "discharge_size"],
  ["Issue", "issue"],
  ["Alternate Supply", "alternate_supply"],
  ["Notes", "notes"],
  ["District Source", "district_source"],
  ["Source", "source"]
];

const editableFields = [
  "hydrant_id",
  "official_hydrant_id",
  "location_id",
  "arcgis_objectid",
  "district",
  "address",
  "location",
  "description",
  "hydrant_type",
  "flow_result",
  "flow_gpm",
  "status",
  "provider",
  "water_assoc",
  "subdivision",
  "additional",
  "fire_response_area",
  "city",
  "latitude",
  "longitude",
  "last_checked",
  "checked_year",
  "checked_status",
  "checked_source",
  "checked_by",
  "checked_shift",
  "static_psi",
  "residual_psi",
  "pitot_psi",
  "discharge_size",
  "issue",
  "alternate_supply",
  "notes",
  "district_source",
  "source"
];

const fieldLabels = Object.fromEntries(detailFields.map(([label, key]) => [key, label]));

function updateList(list, saved) {
  const key = hydrantKey(saved);
  let found = false;
  const updated = list.map((h) => {
    const match = hydrantKey(h) === key || h.location_id === saved.location_id || h.hydrant_id === saved.hydrant_id || h.official_hydrant_id === saved.official_hydrant_id;
    if (match) found = true;
    return match ? saved : h;
  });
  return found ? updated : [saved, ...updated];
}

function readLocalJson(key, fallback) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "") || fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function saveLocalHydrant(hydrant) {
  const current = readLocalJson(localHydrantOverridesKey, []);
  writeLocalJson(localHydrantOverridesKey, updateList(current, hydrant));
}

function applyLocalHydrants(hydrants) {
  return readLocalJson(localHydrantOverridesKey, []).reduce((list, hydrant) => updateList(list, hydrant), hydrants);
}

function saveLocalActivity(activity) {
  const record = { id: activity.id || `${Date.now()}`, created_at: activity.created_at || new Date().toISOString(), ...activity };
  const current = readLocalJson(localActivityKey, []);
  writeLocalJson(localActivityKey, [record, ...current.filter((item) => item.id !== record.id)]);
  saveFirebaseRecord("dailyActivity", firebaseDocId(record.id), record).catch(() => {});
  return record;
}

function firebaseDocId(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && String(part).trim())
    .join("-")
    .replace(/[\\/#?[\]]/g, "-")
    .trim()
    .slice(0, 140) || `${Date.now()}`;
}

function mergeRecords(...lists) {
  const records = new Map();
  lists.flat().filter(Boolean).forEach((item) => {
    const id = item.id || firebaseDocId(item.type, item.location_id, item.hydrant_id, item.tested_at, item.inspected_at, item.created_at);
    records.set(id, { ...item, id });
  });
  return [...records.values()].sort((a, b) => String(b.created_at || b.tested_at || b.inspected_at || "").localeCompare(String(a.created_at || a.tested_at || a.inspected_at || "")));
}

function inspectionForFirebase(payload) {
  return {
    ...payload,
    checklist: (payload.checklist || []).map(({ photo_data, ...row }) => row)
  };
}

function csvEscape(value) {
  const printable = value && typeof value === "object" ? JSON.stringify(value) : value;
  return `"${String(printable ?? "").replaceAll('"', '""')}"`;
}

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
}

function activityRowDate(row) {
  return String(row.tested_at || row.inspected_at || row.created_at || row.date || "").slice(0, 10);
}

function dailyActivityRows(date) {
  return readLocalJson(localActivityKey, []).filter((row) => activityRowDate(row) === date);
}

function activityTime(row) {
  const stamp = row.tested_at || row.inspected_at || row.created_at;
  if (!stamp) return "N/A";
  const parsed = new Date(stamp);
  return Number.isNaN(parsed.getTime()) ? String(stamp) : parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function activityHydrantLabel(row) {
  return row.hydrant_id || row.location_id || "N/A";
}

function summarizedDailyActivityRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const hydrant = activityHydrantLabel(row);
    const existing = groups.get(hydrant) || { hydrant, records: [], types: new Set(), users: new Set(), shifts: new Set(), results: new Set(), notes: [] };
    existing.records.push(row);
    existing.types.add(row.type || "Activity");
    if (row.tested_by || row.checked_by) existing.users.add(row.tested_by || row.checked_by);
    if (row.shift) existing.shifts.add(row.shift);
    if (row.flow_result || row.nfpa_class || row.checked_status) existing.results.add(row.flow_result || row.nfpa_class || row.checked_status);
    if (row.notes || row.generalNotes) existing.notes.push(row.notes || row.generalNotes);
    groups.set(hydrant, existing);
  });
  return [...groups.values()].map((group) => {
    const latest = group.records.slice().sort((a, b) => new Date(b.tested_at || b.inspected_at || b.created_at || 0) - new Date(a.tested_at || a.inspected_at || a.created_at || 0))[0] || {};
    return {
      id: `daily-${group.hydrant}`,
      time: activityTime(latest),
      type: [...group.types].join(" + "),
      hydrant: group.hydrant,
      user: [...group.users].join(", ") || "N/A",
      shift: [...group.shifts].join(", ") || "N/A",
      result: [...group.results].join(", ") || "Completed",
      notes: group.records.length > 1 ? `Done once. ${group.records.length - 1} additional update(s). ${group.notes.join(" | ")}` : (group.notes[0] || "N/A"),
      rawCount: group.records.length
    };
  });
}

function downloadCsv(filename, rows) {
  const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Metric({ icon: Icon, label, value }) {
  return <div className="metric"><Icon size={19} /><span>{label}</span><strong>{value}</strong></div>;
}

function TestedBySearch({ value, onChange }) {
  return <input type="search" list="tested-by-options" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Start typing a name" />;
}

function CrewSessionPanel({ crew, draftCrew, setDraftCrew, setCrewSession, clearCrewSession }) {
  const isSet = hasActiveShiftSession(crew);
  return (
    <section className="crew-session-card">
      <div className="section-title">
        <div>
          <strong>Shift Session</strong>
          <span>{isSet ? `Set until ${crewExpiresLabel(crew)}` : "Set user, shift, and date for this browser"}</span>
        </div>
        <span className={isSet ? "session-pill active" : "session-pill"}>{isSet ? "Active" : "Not Set"}</span>
      </div>
      <div className="crew-bar">
        <Field label="User"><TestedBySearch value={draftCrew.tested_by} onChange={(v) => setDraftCrew((c) => ({ ...c, tested_by: v }))} /></Field>
        <Field label="Shift"><select value={draftCrew.shift} onChange={(e) => setDraftCrew((c) => ({ ...c, shift: e.target.value }))}>{shiftOptions.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Date"><input type="date" value={draftCrew.date} onChange={(e) => setDraftCrew((c) => ({ ...c, date: e.target.value }))} /></Field>
        <Field label="District"><select value={draftCrew.district} onChange={(e) => setDraftCrew((c) => ({ ...c, district: e.target.value }))}>{districtOptions.map((d) => <option key={d}>{d}</option>)}</select></Field>
        <div className="crew-actions">
          <button className="primary small" onClick={setCrewSession}>Set Shift</button>
          <button className="secondary small" onClick={clearCrewSession}>Reset</button>
        </div>
      </div>
    </section>
  );
}

function HydrantMap({ hydrants, selected, onSelect }) {
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markerRef = useRef(new Map());
  const userMarkerRef = useRef(null);
  const elRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, {
      preferCanvas: true,
      zoomControl: true,
      renderer: L.canvas({ padding: 0.35 })
    });
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri"
    }).addTo(map);
    map.fitBounds(cityBounds, { padding: [24, 24] });
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current) layerRef.current.remove();
    const group = L.layerGroup().addTo(map);
    const canvasRenderer = L.canvas({ padding: 0.35 });
    const markers = new Map();
    let cancelled = false;
    let index = 0;

    function addChunk() {
      if (cancelled) return;
      const end = Math.min(index + 175, hydrants.length);
      for (; index < end; index += 1) {
        const h = hydrants[index];
      const lat = Number(h.lat || h.latitude);
      const lon = Number(h.lon || h.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const key = hydrantKey(h);
        const isSelected = selected && hydrantKey(selected) === key;
        const marker = L.circleMarker([lat, lon], {
          renderer: canvasRenderer,
          interactive: true,
        radius: selected && hydrantKey(selected) === hydrantKey(h) ? 9 : 6,
          color: isSelected ? "#f8fafc" : "#111827",
          weight: isSelected ? 3 : 1,
        fillColor: flowColor(h),
        fillOpacity: 0.95
      });
      marker.on("click", () => onSelect(h));
      marker.bindPopup(`<b>${h.hydrant_id || h.location_id}</b><br>${h.address || h.location || ""}<br>Flow: ${flowText(h)}<br>${checkedLabel(h)}`);
      marker.addTo(group);
        markers.set(key, marker);
      }
      if (index < hydrants.length) window.requestAnimationFrame(addChunk);
    }

    window.requestAnimationFrame(addChunk);
    layerRef.current = group;
    markerRef.current = markers;
    return () => {
      cancelled = true;
    };
  }, [hydrants, selected, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    const lat = Number(selected.lat || selected.latitude);
    const lon = Number(selected.lon || selected.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    map.panTo([lat, lon], { animate: true, duration: 0.35 });
  }, [selected]);

  function locateMe() {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (userMarkerRef.current) userMarkerRef.current.remove();
      userMarkerRef.current = L.marker(ll).addTo(map).bindPopup("You are here").openPopup();
      map.setView(ll, 15);
    });
  }

  function zoomCity() {
    mapRef.current?.fitBounds(cityBounds, { padding: [24, 24] });
  }

  return <section className="map-panel"><div className="map-toolbar"><button onClick={zoomCity}><MapPin size={16} /> City</button><button onClick={locateMe}><LocateFixed size={16} /> Me</button></div><div className="map-legend">{flowStandards.map((item) => <span key={item.code}><i style={{ background: item.color }} />{item.className}</span>)}<span><i style={{ background: "#64748b" }} />Unknown</span><span><i style={{ background: "#7c3aed" }} />Private</span><span><i style={{ background: "#050505" }} />OOS</span></div><div ref={elRef} className="map-canvas" /></section>;
}

function HydrantMiniCard({ hydrant, selected, onSelect }) {
  return (
    <button className={`hydrant-card ${selected ? "selected" : ""}`} onClick={() => onSelect(hydrant)}>
      <div className="hydrant-card-head">
        <span className="dot" style={{ background: flowColor(hydrant) }} />
        <div>
          <strong>{hydrant.hydrant_id || hydrant.location_id}</strong>
          <span>{hydrant.address || hydrant.location}</span>
        </div>
        <em className={hydrantStatusClass(hydrant)}>{checkedLabel(hydrant)}</em>
      </div>
      <div className="card-facts">
        <span>District <b>{displayValue(hydrant.district)}</b></span>
        <span>Flow <b>{flowText(hydrant)}</b></span>
        <span>GPM <b>{flowGpmText(hydrant)}</b></span>
        <span>Type <b>{displayValue(hydrant.hydrant_type)}</b></span>
        <span>Water <b>{displayValue(hydrant.water_assoc || hydrant.provider)}</b></span>
        {isPrivateHydrant(hydrant) && <span className="private-warning">Private <b>Do Not Test</b></span>}
      </div>
    </button>
  );
}

function HydrantList({ hydrants, selected, onSelect, title = "Hydrant Cards", limit = 250 }) {
  const [query, setQuery] = useState("");
  const filtered = hydrants.filter((h) => hydrantMatchesSearch(h, query)).slice(0, limit);
  return <section className="list-panel"><div className="panel-title"><strong>{title}</strong><span>{filtered.length} shown</span></div><div className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, address, district, subdivision" /></div><div className="hydrant-list">{filtered.map((h) => <HydrantMiniCard key={hydrantKey(h)} hydrant={h} selected={selected && hydrantKey(selected) === hydrantKey(h)} onSelect={onSelect} />)}</div></section>;
}

function HydrantsPage({ hydrants, selected, onSelect }) {
  const [district, setDistrict] = useState("All Districts");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return hydrants.filter((h) => districtMatches(h, district)).filter((h) => hydrantMatchesSearch(h, term));
  }, [hydrants, district, query]);
  const counts = useMemo(() => ({
    all: hydrants.length,
    d1: hydrants.filter((h) => String(h.district) === "1").length,
    d2: hydrants.filter((h) => String(h.district) === "2").length,
    d3: hydrants.filter((h) => String(h.district) === "3").length,
    unassigned: hydrants.filter((h) => !String(h.district || "").trim()).length
  }), [hydrants]);
  const visibleCounts = useMemo(() => ({
    total: visible.length,
    inspected: visible.filter((h) => !isPrivateHydrant(h) && !isOutOfServiceHydrant(h) && isCheckedThisYear(h)).length,
    needsInspection: visible.filter(isDueThisYear).length,
    outOfService: visible.filter(isOutOfServiceHydrant).length,
    privateCount: visible.filter(isPrivateHydrant).length
  }), [visible]);
  return (
    <section className="hydrants-page">
      <div className="district-strip">
        {[
          ["All Districts", counts.all],
          ["1", counts.d1],
          ["2", counts.d2],
          ["3", counts.d3],
          ["Unassigned", counts.unassigned]
        ].map(([label, count]) => (
          <button key={label} className={district === label ? "active" : ""} onClick={() => setDistrict(label)}>
            <span>{label === "All Districts" ? "All" : label === "Unassigned" ? "Unassigned" : `District ${label}`}</span>
            <strong>{count}</strong>
          </button>
        ))}
      </div>
      <div className="hydrant-inspection-summary" aria-label="Hydrant inspection progress">
        <div><span>Total</span><strong>{visibleCounts.total}</strong></div>
        <div><span>Inspected {currentYear()}</span><strong>{visibleCounts.inspected}</strong></div>
        <div><span>Needs Inspection</span><strong>{visibleCounts.needsInspection}</strong></div>
        <div><span>Out of Service</span><strong>{visibleCounts.outOfService}</strong></div>
        <div><span>Private</span><strong>{visibleCounts.privateCount}</strong></div>
      </div>
      <div className="search-box hydrant-page-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search hydrants by ID, address, district, subdivision" /></div>
      <HydrantList hydrants={visible} selected={selected} onSelect={onSelect} title="Hydrant List" limit={2000} />
    </section>
  );
}

function ShiftSessionRequired({ message = "Shift session must be set to continue." }) {
  return (
    <section className="empty-state shift-required">
      <ClipboardCheck size={34} />
      <strong>{message}</strong>
      <span>Go to the Hydrants page and set the user, shift, and date before editing hydrants, completing inspections, or recording flow tests.</span>
    </section>
  );
}

function Dashboard({ hydrants, selected, onSelect, crew, draftCrew, setDraftCrew, setCrewSession, clearCrewSession }) {
  const [query, setQuery] = useState("");
  const visibleHydrants = useMemo(() => {
    const term = query.trim().toLowerCase();
    return hydrants.filter((h) => districtMatches(h, crew.district)).filter((h) => hydrantMatchesSearch(h, term));
  }, [hydrants, crew.district, query]);
  const stats = useMemo(() => ({ total: hydrants.length, privateCount: hydrants.filter(isPrivateHydrant).length }), [hydrants]);
  return <div className="dashboard-grid dashboard-no-list"><aside className="left-stack"><CrewSessionPanel crew={crew} draftCrew={draftCrew} setDraftCrew={setDraftCrew} setCrewSession={setCrewSession} clearCrewSession={clearCrewSession} /><div className="search-box hydrant-dashboard-search"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search hydrants" /></div></aside><section className="dashboard-main"><div className="metrics"><Metric icon={Droplets} label="Hydrants" value={visibleHydrants.length} /><Metric icon={ClipboardList} label="Due This Year" value={visibleHydrants.filter(isDueThisYear).length} /><Metric icon={Activity} label="Out of Service" value={visibleHydrants.filter((h) => flowColor(h) === "#050505").length} /><Metric icon={Settings} label="Private" value={visibleHydrants.filter(isPrivateHydrant).length || stats.privateCount} /></div><HydrantMap hydrants={visibleHydrants} selected={selected} onSelect={onSelect} /><NfpaStandards /></section></div>;
}

function NfpaStandards() {
  return (
    <section className="nfpa-panel">
      <div className="panel-title standards-title"><strong>NFPA Color Standards</strong></div>
      <div className="standards-grid">
        {flowStandards.map((item) => (
          <div key={item.code} className="standard-card">
            <i style={{ background: item.color }} />
            <div><strong>{item.className} - {item.colorName}</strong><span>{item.gpm}</span></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function nfpaClassForGpm(gpm) {
  const n = Number(gpm);
  if (!Number.isFinite(n) || n <= 0) return "Not Tested";
  if (n >= 1500) return "Class AA";
  if (n >= 1000) return "Class A";
  if (n >= 500) return "Class B";
  return "Class C";
}

function flowCodeForGpm(gpm) {
  const label = nfpaClassForGpm(gpm);
  if (label === "Class AA") return "B";
  if (label === "Class A") return "G";
  if (label === "Class B") return "O";
  if (label === "Class C") return "R";
  return "UK";
}

function nfpaColorNameForClass(label) {
  if (label === "Class AA") return "Blue";
  if (label === "Class A") return "Green";
  if (label === "Class B") return "Orange";
  if (label === "Class C") return "Red";
  return "Unknown";
}

function normalizeAddressSearch(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function addressFromUploadName(fileName) {
  const base = String(fileName || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const match = base.match(/\b\d{1,6}\s+[a-z0-9.' ]{2,80}\b/i);
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
}

function preFirePlanMatches(plan, query) {
  const term = normalizeAddressSearch(query);
  if (!term) return true;
  return normalizeAddressSearch(`${plan.address} ${plan.businessName} ${plan.occupancyType}`).includes(term);
}

function blankPreFirePlan() {
  return {
    id: "",
    address: "",
    businessName: "",
    occupancyType: "",
    contactName: "",
    contactPhone: "",
    hazards: "",
    utilities: "",
    fireProtection: "",
    hydrants: "",
    fileName: "",
    fileType: "",
    fileData: "",
    notes: ""
  };
}

function hydrantMatchesSearch(hydrant, query) {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  const searchable = [hydrant.hydrant_id, hydrant.location_id, hydrant.official_hydrant_id, hydrant.address, hydrant.location, hydrant.district, hydrant.subdivision, hydrant.water_assoc, hydrant.fire_response_area].join(" ").toLowerCase();
  if (searchable.includes(term)) return true;
  const termDigits = term.replace(/\D/g, "");
  if (!termDigits) return false;
  const idDigits = [hydrant.hydrant_id, hydrant.location_id, hydrant.official_hydrant_id].map((value) => String(value || "").replace(/\D/g, "")).filter(Boolean);
  return idDigits.some((digits) => digits.includes(termDigits) || digits.endsWith(termDigits));
}

function calculateFlowGpm(dischargeSize, pitotPsi) {
  const diameter = Number(dischargeSize);
  const pitot = Number(pitotPsi);
  if (!Number.isFinite(diameter) || !Number.isFinite(pitot) || pitot <= 0) return "";
  return Math.round(29.83 * 0.9 * diameter ** 2 * Math.sqrt(pitot));
}

function NfpaSelector({ value, onChange }) {
  return (
    <section className="nfpa-selector">
      <Field label="NFPA Color Standard">
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {["Class AA", "Class A", "Class B", "Class C", "Out of Service", "Not Tested"].map((option) => <option key={option}>{option}</option>)}
        </select>
      </Field>
      <div className="standards-grid compact-standards">
        {flowStandards.map((item) => (
          <div key={item.code} className="standard-card">
            <i style={{ background: item.color }} />
            <div><strong>{item.className}: {item.gpm}</strong></div>
          </div>
        ))}
        <div className="standard-card"><i style={{ background: "#050505" }} /><div><strong>Out of Service: Unavailable</strong></div></div>
        <div className="standard-card"><i style={{ background: "#64748b" }} /><div><strong>Not Tested: No flow result</strong></div></div>
      </div>
    </section>
  );
}

function HydrantCard({ selected }) {
  if (!selected) return <section className="empty-state"><Droplets size={34} /><strong>No hydrant selected</strong><span>Choose a hydrant from the map or list.</span></section>;
  return (
    <section className="quick-card">
      <div className="selected-head">
        <span className="dot big" style={{ background: flowColor(selected) }} />
        <div>
          <strong>{selected.hydrant_id}</strong>
          <span>{selected.address || selected.location}</span>
        </div>
        <em className={hydrantStatusClass(selected)}>{checkedLabel(selected)}</em>
      </div>
      {isPrivateHydrant(selected) && <div className="private-banner">Private Hydrant (Do Not Test)</div>}
      <div className="detail-grid">
        {detailFields.map(([label, key]) => (
          <div key={key} className={String(selected[key] || "").length > 42 ? "wide" : ""}>
            <span>{label}</span>
            <strong>{key === "flow_result" || key === "flow_gpm" ? flowText(selected) : displayValue(selected[key])}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function HydrantEditorModal({ hydrant, crew, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const sessionReady = hasActiveShiftSession(crew);

  useEffect(() => {
    setForm(Object.fromEntries(editableFields.map((key) => [key, hydrant?.[key] ?? ""])));
  }, [hydrant]);

  if (!hydrant) return null;

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!sessionReady) return;
    setSaving(true);
    const payload = {
      ...form,
      original_location_id: hydrant.location_id,
      original_hydrant_id: hydrant.hydrant_id,
      edited_by: crew.tested_by,
      edited_shift: crew.shift,
      edited_date: crew.date,
      edit_source: "Hydrant detail card"
    };
    let data = {};
    try {
      const res = await fetch("/api/hydrants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hydrant save failed");
    } catch {
      data = { hydrant: { ...hydrant, ...payload, updated_at: new Date().toISOString() } };
    }
    setSaving(false);
    if (data.hydrant) {
      saveLocalHydrant(data.hydrant);
      onSaved(data.hydrant, "Hydrant information updated");
    }
  }

  const history = Array.isArray(hydrant.edit_history) ? hydrant.edit_history.slice(-5).reverse() : [];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="hydrant-modal">
        <div className="modal-header">
          <div>
            <span className="dot big" style={{ background: flowColor(hydrant) }} />
            <div>
              <strong>{hydrant.hydrant_id || hydrant.location_id}</strong>
              <span>{hydrant.address || hydrant.location || "Hydrant details"}</span>
            </div>
          </div>
          <button className="secondary small" onClick={onClose}>Close</button>
        </div>
        {isPrivateHydrant(hydrant) && <div className="private-banner">Private Hydrant (Do Not Test)</div>}
        {!sessionReady && <div className="private-banner shift-lock-banner">Shift session must be set to continue.</div>}
        <div className="editor-grid">
          {editableFields.map((key) => (
            <Field key={key} label={fieldLabels[key] || key}>
              {key === "notes" || key === "description" || key === "source" || key === "additional" ? (
                <textarea value={form[key] ?? ""} onChange={(e) => setField(key, e.target.value)} rows={3} />
              ) : key === "status" ? (
                <select value={form[key] ?? ""} onChange={(e) => setField(key, e.target.value)}>
                  {["", "In Service", "Out of Service", "Needs Repair", "Private Hydrant (Do Not Test)"].map((option) => <option key={option}>{option}</option>)}
                </select>
              ) : key === "district" ? (
                <select value={form[key] ?? ""} onChange={(e) => setField(key, e.target.value)}>
                  {["", "1", "2", "3"].map((option) => <option key={option}>{option}</option>)}
                </select>
              ) : (
                <input value={form[key] ?? ""} onChange={(e) => setField(key, e.target.value)} />
              )}
            </Field>
          ))}
        </div>
        <div className="edit-history">
          <strong>Edit History</strong>
          {history.length ? history.map((entry, index) => (
            <span key={`${entry.edited_at}-${index}`}>{displayValue(entry.edited_by)} | {displayValue(entry.edited_shift)} | {displayValue(entry.edited_date)} | {new Date(entry.edited_at).toLocaleString()}</span>
          )) : <span>No edits recorded yet.</span>}
        </div>
        <div className="modal-actions">
          <button className="primary" disabled={saving || !sessionReady} onClick={save}><Save size={16} /> {saving ? "Saving" : "Save Hydrant Info"}</button>
        </div>
      </section>
    </div>
  );
}

function HydrantInfoModal({ hydrant, sessionReady, onClose, onEdit, onFlowTest, onInspection }) {
  if (!hydrant) return null;
  const details = [
    ["Hydrant ID", hydrant.hydrant_id],
    ["District", hydrant.district || "Unassigned"],
    ["Provider", hydrant.provider || hydrant.water_assoc],
    ["Lat & Long", `${displayValue(hydrant.latitude)} / ${displayValue(hydrant.longitude)}`],
    ["Hydrant Type", hydrant.hydrant_type],
    ["Flow", flowText(hydrant)],
    ["GPM", flowGpmText(hydrant)]
  ];
  return (
    <div className="modal-backdrop compact" role="dialog" aria-modal="true">
      <section className="hydrant-info-card">
        <div className="info-card-top">
          <span className="dot big" style={{ background: flowColor(hydrant) }} />
          <div>
            <strong>{hydrant.hydrant_id || hydrant.location_id}</strong>
            <span>{hydrant.address || hydrant.location || "Hydrant"}</span>
          </div>
          <button className="icon-close" onClick={onClose}>Close</button>
        </div>
        {isPrivateHydrant(hydrant) && <div className="private-banner compact-banner">Private Hydrant (Do Not Test)</div>}
        {!sessionReady && <div className="private-banner compact-banner shift-lock-banner">Shift session must be set to continue.</div>}
        <div className="small-detail-grid">
          {details.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{displayValue(value)}</strong>
            </div>
          ))}
        </div>
        <div className="info-card-actions">
          <button className="secondary" onClick={onClose}>Close</button>
          <button className="secondary" disabled={!sessionReady} onClick={onInspection}><ClipboardCheck size={16} /> Inspection</button>
          <button className="secondary" disabled={!sessionReady} onClick={onFlowTest}><Gauge size={16} /> Flow Test</button>
          <button className="primary" disabled={!sessionReady} onClick={onEdit}><Edit3 size={16} /> Edit</button>
        </div>
      </section>
    </div>
  );
}

function Inspection({ selected, crew, onSaved, onClose }) {
  const [rows, setRows] = useState([]);
  const [generalNotes, setGeneralNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const sessionReady = hasActiveShiftSession(crew);
  useEffect(() => {
    setRows(inspectionItems.map(([item, note]) => ({ item, result: "Yes", notes: note, repair_needed: "No", photo_name: "", photo_data: "" })));
    setGeneralNotes("");
  }, [selected?.location_id]);

  function updateRow(index, patch) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function uploadPhoto(index, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateRow(index, { photo_name: file.name, photo_data: reader.result });
    reader.readAsDataURL(file);
  }

  function addNote() {
    if (!sessionReady) return;
    setRows((current) => [...current, { item: "Additional Note", result: "N/A", notes: "", repair_needed: "No", photo_name: "", photo_data: "" }]);
  }

  async function saveHydrantInfo() {
    if (!selected || !sessionReady) return;
    const payload = {
      ...selected,
      original_location_id: selected.location_id,
      original_hydrant_id: selected.hydrant_id,
      notes: generalNotes || selected.notes,
      edited_by: crew.tested_by,
      edited_shift: crew.shift,
      edited_date: crew.date,
      edit_source: "Inspection hydrant info"
    };
    let data = {};
    try {
      await saveFirebaseRecord("hydrants", firebaseDocId(payload.location_id, payload.hydrant_id), { ...payload, updated_at: new Date().toISOString() });
      const res = await fetch("/api/hydrants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hydrant save failed");
    } catch {
      data = { hydrant: { ...selected, ...payload, updated_at: new Date().toISOString() } };
    }
    if (data.hydrant) onSaved(data.hydrant, "Hydrant information saved");
  }

  async function save() {
    if (!selected || !sessionReady) return;
    setSaving(true);
    const inspectedAt = `${crew.date || today()}T12:00:00.000Z`;
    const payload = { id: firebaseDocId("inspection", selected.location_id, selected.hydrant_id, inspectedAt), location_id: selected.location_id, hydrant_id: selected.hydrant_id, inspected_at: inspectedAt, tested_by: crew.tested_by, shift: crew.shift, checklist: rows, notes: generalNotes, created_at: new Date().toISOString() };
    let data = {};
    try {
      await saveFirebaseRecord("hydrantInspections", payload.id, inspectionForFirebase(payload));
      const res = await fetch("/api/inspections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || "Inspection save failed");
    } catch {
      data = { hydrant: { ...selected, last_checked: payload.inspected_at.slice(0, 10), checked_year: payload.inspected_at.slice(0, 4), checked_status: "Checked", checked_source: "Inspection", checked_by: crew.tested_by, checked_shift: crew.shift, updated_at: new Date().toISOString() } };
    }
    saveLocalActivity({ type: "Inspection", ...inspectionForFirebase(payload) });
    setSaving(false);
    if (data.hydrant) onSaved(data.hydrant, "Inspection saved");
  }
  if (!sessionReady) {
    return <ShiftSessionRequired />;
  }
  return (
    <section className="inspection-page">
      <div className="inspection-shell">
        <div className="inspection-header">
          <div>
            <strong>Hydrant Inspection Checklist</strong>
            <span>{selected ? `${selected.hydrant_id} | District ${displayValue(selected.district)} | ${displayValue(selected.latitude)}, ${displayValue(selected.longitude)}` : "Select a hydrant before completing inspection."}</span>
          </div>
          <div className="inspection-header-actions">
            <button className="secondary small" onClick={() => setRows((current) => current.map((row) => ({ ...row, expanded: !row.expanded })))}>Expand All</button>
            <button className="secondary small" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="inspection-table">
          <div className="inspection-row table-head">
            <span>Item</span><span>Yes</span><span>No</span><span>N/A</span><span>Notes / Details</span><span>Photo</span><span>Repair Needed</span>
          </div>
          {rows.map((row, index) => (
            <div className="inspection-row" key={`${row.item}-${index}`}>
              <strong>{row.item}</strong>
              {["Yes", "No", "N/A"].map((choice) => (
                <button key={choice} className={row.result === choice ? "choice active" : "choice"} onClick={() => updateRow(index, { result: choice })}>{choice}</button>
              ))}
              <input value={row.notes} onChange={(e) => updateRow(index, { notes: e.target.value })} />
              <label className="photo-upload">
                <input type="file" accept="image/*" capture="environment" onChange={(e) => uploadPhoto(index, e.target.files?.[0])} />
                <span>{row.photo_name ? row.photo_name : "Photo"}</span>
              </label>
              <select value={row.repair_needed} onChange={(e) => updateRow(index, { repair_needed: e.target.value })}>
                <option>No</option>
                <option>Yes</option>
              </select>
            </div>
          ))}
        </div>
        <Field label="General Notes"><textarea value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} rows={3} placeholder="Inspection notes..." /></Field>
        <div className="inspection-actions">
          <button className="secondary" onClick={addNote}><FileText size={16} /> Add Note</button>
          <button className="secondary" disabled={!selected} onClick={saveHydrantInfo}><Save size={16} /> Save Hydrant Info</button>
          <button className="primary" disabled={!selected || saving} onClick={save}><CheckCircle2 size={16} /> {saving ? "Saving" : "Complete Inspection"}</button>
        </div>
      </div>
    </section>
  );
}

function FlowTest({ selected, crew, onSaved, onClose }) {
  const [info, setInfo] = useState({ hydrant_id: "", district: "", gps: "", provider: "", status: "In Service", notes: "" });
  const [form, setForm] = useState({ discharge_size: "2.5", pitot_psi: "", static_psi: "", residual_psi: "", status: "In Service", notes: "", nfpa_class: "Not Tested" });
  const sessionReady = hasActiveShiftSession(crew);
  const calculatedFlow = calculateFlowGpm(form.discharge_size, form.pitot_psi);
  useEffect(() => {
    setInfo({
      hydrant_id: selected?.hydrant_id || "",
      district: selected?.district || "",
      gps: selected ? `${selected.latitude || selected.lat || ""}, ${selected.longitude || selected.lon || ""}` : "",
      provider: selected?.provider || selected?.water_assoc || "",
      status: selected?.status || "In Service",
      notes: selected?.notes || ""
    });
    const initialFlow = selected?.flow_result ? flowText(selected) : "Not Tested";
    setForm({ discharge_size: selected?.discharge_size || "2.5", pitot_psi: selected?.pitot_psi || "", static_psi: selected?.static_psi || "", residual_psi: selected?.residual_psi || "", status: selected?.status || "In Service", notes: "", nfpa_class: initialFlow.startsWith("Class") ? initialFlow.split(" - ")[0] : "Not Tested" });
  }, [selected?.location_id]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setInfoField = (k, v) => setInfo((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    if (!calculatedFlow) return;
    setForm((current) => ({ ...current, nfpa_class: nfpaClassForGpm(calculatedFlow) }));
  }, [calculatedFlow]);

  async function saveHydrantInfo() {
    if (!selected || !sessionReady) return;
    const [latitude, longitude] = info.gps.split(",").map((item) => item.trim());
    const payload = {
      original_location_id: selected.location_id,
      original_hydrant_id: selected.hydrant_id,
      location_id: selected.location_id,
      hydrant_id: info.hydrant_id,
      district: info.district,
      latitude: latitude || selected.latitude,
      lat: latitude || selected.lat,
      longitude: longitude || selected.longitude,
      lon: longitude || selected.lon,
      provider: info.provider,
      water_assoc: info.provider,
      status: info.status,
      notes: info.notes,
      edited_by: crew.tested_by,
      edited_shift: crew.shift,
      edited_date: crew.date,
      edit_source: "Flow test hydrant info"
    };
    let data = {};
    try {
      await saveFirebaseRecord("hydrants", firebaseDocId(payload.location_id, payload.hydrant_id), { ...payload, updated_at: new Date().toISOString() });
      const res = await fetch("/api/hydrants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hydrant save failed");
    } catch {
      data = { hydrant: { ...selected, ...payload, updated_at: new Date().toISOString() } };
    }
    if (data.hydrant) onSaved(data.hydrant, "Hydrant information saved");
  }

  async function save() {
    if (!selected || !sessionReady) return;
    const computedClass = form.status === "Out of Service" ? "Out of Service" : nfpaClassForGpm(calculatedFlow);
    const flowCode = form.status === "Out of Service" ? "OOS" : flowCodeForGpm(calculatedFlow);
    const testedAt = `${crew.date || today()}T12:00:00.000Z`;
    const test = { ...form, id: firebaseDocId("flow", selected.location_id, info.hydrant_id || selected.hydrant_id, testedAt), nfpa_class: computedClass, nfpa_color: nfpaColorNameForClass(computedClass), flow_gpm: calculatedFlow, flow_result: flowCode, location_id: selected.location_id, hydrant_id: info.hydrant_id || selected.hydrant_id, district: info.district, tested_at: testedAt, tested_by: crew.tested_by, shift: crew.shift, created_at: new Date().toISOString() };
    let data = {};
    try {
      await saveFirebaseRecord("hydrantFlowTests", test.id, test);
      const res = await fetch("/api/tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(test) });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || "Flow test save failed");
    } catch {
      data = { hydrant: { ...selected, ...test, last_checked: test.tested_at.slice(0, 10), checked_year: test.tested_at.slice(0, 4), checked_status: "Checked", checked_source: "Flow Test", checked_by: crew.tested_by, checked_shift: crew.shift, updated_at: new Date().toISOString() } };
    }
    saveLocalActivity({ type: "Flow Test", ...test });
    if (data.hydrant) {
      const infoPayload = {
          ...data.hydrant,
          original_location_id: data.hydrant.location_id,
          original_hydrant_id: data.hydrant.hydrant_id,
          hydrant_id: info.hydrant_id || data.hydrant.hydrant_id,
          district: info.district,
          provider: info.provider,
          water_assoc: info.provider,
          status: form.status,
          discharge_size: form.discharge_size,
          pitot_psi: form.pitot_psi,
          static_psi: form.static_psi,
          residual_psi: form.residual_psi,
          flow_gpm: calculatedFlow,
          flow_result: flowCode,
          nfpa_class: computedClass,
          nfpa_color: nfpaColorNameForClass(computedClass),
          notes: info.notes || data.hydrant.notes,
          edited_by: crew.tested_by,
          edited_shift: crew.shift,
          edited_date: crew.date,
          edit_source: "Flow test"
        };
      let infoData = {};
      try {
        await saveFirebaseRecord("hydrants", firebaseDocId(infoPayload.location_id, infoPayload.hydrant_id), { ...infoPayload, updated_at: new Date().toISOString() });
        const saveInfo = await fetch("/api/hydrants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(infoPayload) });
        infoData = await saveInfo.json();
        if (!saveInfo.ok) throw new Error(infoData.error || "Hydrant save failed");
      } catch {
        infoData = { hydrant: { ...data.hydrant, ...infoPayload, updated_at: new Date().toISOString() } };
      }
      onSaved(infoData.hydrant || data.hydrant, "Flow test saved");
    }
  }
  if (!sessionReady) {
    return <ShiftSessionRequired />;
  }
  return (
    <div className="flow-page">
      <section className="flow-page-header">
        <div>
          <strong>Hydrant Flow Test</strong>
          <span>{selected ? `${selected.hydrant_id || selected.location_id} | District ${displayValue(selected.district)}` : "Select a hydrant before recording a flow test."}</span>
        </div>
        <button className="secondary small" onClick={onClose}>Close</button>
      </section>
      <section className="form-panel hydrant-info-panel">
        <h2>Hydrant Info</h2>
        <p className="panel-subtitle">Save hydrant details without creating a flow test.</p>
        <div className="stacked-fields">
          <Field label="Hydrant ID"><input value={info.hydrant_id} onChange={(e) => setInfoField("hydrant_id", e.target.value)} /></Field>
          <Field label="District"><select value={info.district} onChange={(e) => setInfoField("district", e.target.value)}>{["", "1", "2", "3"].map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="GPS Lat & Long"><input value={info.gps} onChange={(e) => setInfoField("gps", e.target.value)} placeholder="34.000000, -90.000000" /></Field>
          <Field label="Provider"><input value={info.provider} onChange={(e) => setInfoField("provider", e.target.value)} /></Field>
          <Field label="Status"><select value={info.status} onChange={(e) => setInfoField("status", e.target.value)}>{["In Service", "Out of Service", "Needs Repair", "Private Hydrant (Do Not Test)"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Hydrant Notes"><textarea value={info.notes} onChange={(e) => setInfoField("notes", e.target.value)} rows={5} placeholder="Enter hydrant notes..." /></Field>
        </div>
        <button className="primary wide-button" disabled={!selected} onClick={saveHydrantInfo}><Droplets size={16} /> Save Hydrant Info</button>
      </section>
      <section className="form-panel flow-test-panel">
        <h2>Flow Test</h2>
        <p className="panel-subtitle">Record pitot, static, residual, and NFPA color classification.</p>
        <div className="flow-grid">
          <Field label="Hydrant ID"><input value={info.hydrant_id} onChange={(e) => setInfoField("hydrant_id", e.target.value)} /></Field>
          <Field label="District"><select value={info.district} onChange={(e) => setInfoField("district", e.target.value)}>{["", "1", "2", "3"].map((d) => <option key={d}>{d}</option>)}</select></Field>
          <Field label="GPS Long & Lat"><input value={info.gps} onChange={(e) => setInfoField("gps", e.target.value)} /></Field>
          <Field label="Discharge Size"><select value={form.discharge_size} onChange={(e) => set("discharge_size", e.target.value)}>{["2", "2.25", "2.5"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Pitot PSI"><input type="number" min="0" step="0.1" value={form.pitot_psi} onChange={(e) => set("pitot_psi", e.target.value)} /></Field>
          <Field label="Static PSI"><input type="number" min="0" step="0.1" value={form.static_psi} onChange={(e) => set("static_psi", e.target.value)} /></Field>
          <Field label="Residual PSI"><input type="number" min="0" step="0.1" value={form.residual_psi} onChange={(e) => set("residual_psi", e.target.value)} /></Field>
          <section className="calc-card">
            <strong>Flow GPM (Calculated)</strong>
            <b>{calculatedFlow || "--"}</b>
            <span>29.83 x 0.9 x discharge size^2 x sqrt(pitot PSI)</span>
          </section>
          <NfpaSelector value={form.nfpa_class} onChange={(value) => set("nfpa_class", value)} />
          <Field label="Status"><select value={form.status} onChange={(e) => set("status", e.target.value)}>{["In Service", "Out of Service", "Needs Repair", "Private Hydrant (Do Not Test)"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Notes"><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={4} placeholder="Enter notes..." /></Field>
        </div>
        <div className="flow-actions"><button className="primary" disabled={!selected} onClick={save}><Save size={16} /> Save Test</button><button className="secondary" disabled={!selected} onClick={saveHydrantInfo}><Droplets size={16} /> Save Hydrant Info</button><button className="secondary" disabled={!selected} onClick={() => selected && window.scrollTo({ top: 0, behavior: "smooth" })}><MapPin size={16} /> View on Map</button></div>
      </section>
    </div>
  );
}

function Reports({ crew }) {
  const [emails, setEmails] = useState("");
  const [selectedRecipient, setSelectedRecipient] = useState(reportEmailRecipients[0]);
  const [message, setMessage] = useState("");
  const [reportDate, setReportDate] = useState(crew.date || today());
  const [activityRows, setActivityRows] = useState(() => dailyActivityRows(crew.date || today()));
  const date = reportDate || today();
  useEffect(() => {
    setReportDate(crew.date || today());
  }, [crew.date]);
  useEffect(() => {
    setActivityRows(dailyActivityRows(date));
  }, [date]);
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      const localRows = dailyActivityRows(date);
      loadFirebaseCollection("dailyActivity", [])
        .then((cloudRows) => {
          if (!mounted) return;
          setActivityRows(mergeRecords(localRows, cloudRows.filter((row) => activityRowDate(row) === date)));
        })
        .catch(() => mounted && setActivityRows(localRows));
    };
    refresh();
    window.addEventListener("storage", refresh);
    const timer = setInterval(refresh, 2000);
    return () => {
      mounted = false;
      window.removeEventListener("storage", refresh);
      clearInterval(timer);
    };
  }, [date]);
  const reportRows = useMemo(() => summarizedDailyActivityRows(activityRows), [activityRows]);
  const activityCounts = useMemo(() => ({
    total: reportRows.length,
    inspections: reportRows.filter((row) => row.type.toLowerCase().includes("inspection")).length,
    flowTests: reportRows.filter((row) => row.type.toLowerCase().includes("flow")).length,
    hydrants: reportRows.filter((row) => row.hydrant !== "N/A").length
  }), [reportRows]);
  function addRecipient() {
    const parts = emails.split(/[;,\n]/).map((x) => x.trim()).filter(Boolean);
    if (!selectedRecipient || parts.some((email) => email.toLowerCase() === selectedRecipient.toLowerCase())) return;
    setEmails([...parts, selectedRecipient].join(", "));
  }
  function clearRecipients() {
    setEmails("");
  }
  async function emailCsv() {
    setMessage("Sending...");
    try {
      const res = await fetch("/api/daily-activity/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, emails }) });
      const data = await res.json();
      setMessage(data.message || (data.ok ? "Daily activity request handled" : data.error || "Email failed"));
    } catch {
      const recipients = emails.split(/[;,\n]/).map((x) => x.trim()).filter(Boolean).join(",");
      const subject = encodeURIComponent(`Horn Lake daily activity ${date}`);
      const body = encodeURIComponent("The app could not reach the email service from this device. Please attach the exported Daily Activity CSV.");
      window.location.href = `mailto:${recipients}?subject=${subject}&body=${body}`;
      setMessage("Email service unavailable. Opened your mail app; attach the exported CSV.");
    }
  }
  function exportDailyActivity() {
    downloadCsv(`daily-activity-${date}.csv`, reportRows);
    setMessage(reportRows.length ? `Downloaded ${reportRows.length} daily activity records.` : "No daily activity records found for this date.");
  }
  function exportHydrants() {
    downloadCsv("hydrants.csv", readLocalJson(localHydrantOverridesKey, []));
    setMessage("Exported locally edited hydrant records.");
  }
  return (
    <section className="form-panel reports">
      <h2>Reports</h2>
      <div className="report-actions">
        <a className="button" href="/api/hydrants/export"><Download size={16} /> Hydrants CSV</a>
        <button className="button" onClick={exportDailyActivity}><Download size={16} /> Download Daily Activity</button>
        <button className="button" onClick={exportHydrants}><Download size={16} /> Local Hydrant Edits</button>
        <a className="button" href={`/api/daily-activity/export?date=${date}`}><Download size={16} /> Server Daily CSV</a>
        <a className="button" href="/sample-daily-activity-report.csv"><Download size={16} /> Sample Daily Activity</a>
      </div>
      <div className="daily-report-head">
        <div>
          <strong>Daily Activity Report</strong>
          <span>{reportRows.length} hydrants done for {date}</span>
        </div>
        <Field label="Report Date"><input type="date" value={date} onChange={(event) => setReportDate(event.target.value)} /></Field>
      </div>
      <div className="daily-report-stats" aria-label="Daily activity live counts">
        <div><span>Total Done</span><strong>{activityCounts.total}</strong></div>
        <div><span>Inspections</span><strong>{activityCounts.inspections}</strong></div>
        <div><span>Flow Tests</span><strong>{activityCounts.flowTests}</strong></div>
        <div><span>Hydrants</span><strong>{activityCounts.hydrants}</strong></div>
      </div>
      <div className="daily-report-table" role="table" aria-label="Daily activity report">
        <div className="daily-report-row table-head" role="row">
          <span>Time</span>
          <span>Type</span>
          <span>Hydrant</span>
          <span>User</span>
          <span>Shift</span>
          <span>Result</span>
          <span>Notes</span>
        </div>
        {reportRows.length ? reportRows.map((row) => (
          <div className="daily-report-row" role="row" key={row.id}>
            <span>{row.time}</span>
            <span>{row.type}</span>
            <span>{row.hydrant}</span>
            <span>{row.user}</span>
            <span>{row.shift}</span>
            <span>{row.result}</span>
            <span>{row.notes}</span>
          </div>
        )) : (
          <div className="daily-report-empty">No daily activity records found for this date.</div>
        )}
      </div>
      <div className="recipient-row">
        <Field label="Saved Recipients">
          <select value={selectedRecipient} onChange={(e) => setSelectedRecipient(e.target.value)}>
            {reportEmailRecipients.map((email) => <option key={email}>{email}</option>)}
          </select>
        </Field>
        <button className="secondary" onClick={addRecipient}>Add Recipient</button>
        <button className="secondary" onClick={clearRecipients}>Clear</button>
      </div>
      <Field label="Daily Activity Email Recipients">
        <textarea value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="email1@example.com, email2@example.com" rows={4} />
      </Field>
      <button className="primary" onClick={emailCsv}><Mail size={16} /> Email Daily Activity</button>
      {message && <p className="status-line">{message}</p>}
    </section>
  );
}

function SettingsPage({ theme, setTheme }) {
  const darkMode = theme === "dark";
  function toggleTheme() {
    const next = darkMode ? "light" : "dark";
    window.localStorage.setItem(themeStorageKey, next);
    setTheme(next);
  }
  return (
    <section className="settings-page module-page">
      <div className="module-card">
        <div className="module-card-header">
          <strong>Display Settings</strong>
          <span>Applies only to this device/browser.</span>
        </div>
        <div className="setting-row">
          <div>
            <strong>Dark Mode</strong>
            <span>Use the dark inspection-style theme across the hydrant module.</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={darkMode} onChange={toggleTheme} />
            <span />
          </label>
        </div>
      </div>
    </section>
  );
}

function SyncImportPage() {
  return (
    <section className="sync-page module-page">
      <div className="module-card">
        <div className="module-card-header">
          <strong>ImageTrend Elite Sync</strong>
          <span>Planned integration workflow for daily activity and hydrant testing records.</span>
        </div>
        <div className="integration-grid">
          <div>
            <strong>Recommended Path</strong>
            <p>Use ImageTrend Elite's approved integration/export method for your agency. Most agencies handle this through ImageTrend support, state EMS/fire reporting admins, or an authorized API/export interface.</p>
          </div>
          <div>
            <strong>Data To Send</strong>
            <p>Daily activity CSV, flow test records, inspection completion, hydrant ID, district, user, shift, date/time, NFPA class, calculated GPM, repair needed, and notes.</p>
          </div>
          <div>
            <strong>Needed From ImageTrend</strong>
            <p>Endpoint or import template, authentication method, required field names, accepted file format, and whether photo attachments are supported.</p>
          </div>
          <div>
            <strong>Current App Support</strong>
            <p>The app already creates daily activity and hydrant CSV exports. Once Elite's import/API format is known, this page can send or format records directly.</p>
          </div>
        </div>
      </div>
      <div className="module-card">
        <div className="module-card-header">
          <strong>Sync Configuration</strong>
          <span>These fields are placeholders until your agency confirms the Elite connection method.</span>
        </div>
        <div className="form-grid">
          <Field label="Elite Endpoint / Import URL"><input placeholder="Provided by ImageTrend or agency admin" /></Field>
          <Field label="Agency / Department ID"><input placeholder="Horn Lake Fire/EMS identifier" /></Field>
          <Field label="Export Format"><select defaultValue="Daily Activity CSV"><option>Daily Activity CSV</option><option>Elite API JSON</option><option>Custom Import Template</option></select></Field>
          <Field label="Sync Mode"><select defaultValue="Manual Review"><option>Manual Review</option><option>Auto Send Daily</option><option>Export Only</option></select></Field>
        </div>
        <div className="report-actions">
          <a className="button" href="/sample-daily-activity-report.csv"><Download size={16} /> Sample Activity CSV</a>
          <a className="button" href="/api/daily-activity/export"><Download size={16} /> Today's Activity CSV</a>
        </div>
      </div>
    </section>
  );
}

function openSecureWindow(path) {
  const url = new URL(path, window.location.origin).toString();
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup) popup.focus?.();
}

function useFirebaseList(key, fallback) {
  const [items, setItems] = useState(fallback);
  useEffect(() => {
    let mounted = true;
    loadFirebaseList(key, fallback)
      .then((loaded) => {
        if (mounted && Array.isArray(loaded) && loaded.length) setItems(loaded);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [key]);
  return items;
}

function AclsMedicationCheatSheet({ setView }) {
  const [sheet, setSheet] = useState("adult");
  const sections = medicationDosageSections[sheet];
  const [category, setCategory] = useState(sections[0].id);
  const activeSection = sections.find((item) => item.id === category) || sections[0];
  useEffect(() => {
    setCategory(medicationDosageSections[sheet][0].id);
  }, [sheet]);
  return (
    <section className="module-page department-module">
      <div className="module-card">
        <div className="module-card-header">
          <strong>Medication Dosage List</strong>
          <span>Adult and pediatric EMS medication quick-reference. Confirm with local protocol and medical control.</span>
        </div>
        <div className="code-tools">
          <button className="secondary" onClick={() => setView("menu")}><ChevronRight size={16} /> EMS Menu</button>
          <div className="code-toggle ems-med-toggle" aria-label="ACLS medication sheet">
            <button className={sheet === "adult" ? "active" : ""} onClick={() => setSheet("adult")}><Activity size={16} /> Adult</button>
            <button className={sheet === "pedi" ? "active" : ""} onClick={() => setSheet("pedi")}><Activity size={16} /> Pedi</button>
          </div>
          <span className="module-chip">{activeSection.items.length} meds</span>
        </div>
        <div className="med-category-tabs" aria-label="Medication categories">
          {sections.map((item) => (
            <button key={item.id} className={category === item.id ? "active" : ""} onClick={() => setCategory(item.id)}>
              {item.title}
            </button>
          ))}
        </div>
        <div className="med-section-title">
          <strong>{activeSection.title}</strong>
          <span>{sheet === "adult" ? "Adult" : "Pediatric"} dosages</span>
        </div>
        <div className="med-cheat-grid">
          {activeSection.items.map((item) => (
            <article className="med-cheat-card" key={`${sheet}-${item.med}-${item.use}`}>
              <header>
                <strong>{item.med}</strong>
                <em>{item.use}</em>
              </header>
              <div className="med-dose-line">
                <span>Dose</span>
                <b>{item.dose}</b>
              </div>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
        {category === "acls" && <section className="med-source-strip">
          <strong>Sources</strong>
          <div>
            {aclsMedicationSources.map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>
            ))}
          </div>
        </section>}
      </div>
    </section>
  );
}

function EmsProtocolsPage() {
  const protocols = useFirebaseList("emsProtocolsFull", defaultEmsProtocols);
  const urlProtocol = new URLSearchParams(window.location.search).get("protocol");
  const protocolFromUrl = () => urlProtocol || protocols[0].number;
  const [view, setView] = useState(urlProtocol ? "sogs" : "menu");
  const [selectedId, setSelectedId] = useState(protocolFromUrl);
  const [query, setQuery] = useState("");
  const [popup, setPopup] = useState(null);
  const emsForms = ["Patient Refusal", "Run Narrative", "Medication Check", "Equipment Check"];
  const selectedProtocol = protocols.find((item) => item.number === selectedId) || protocols[0];
  const filteredProtocols = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return protocols;
    return protocols.filter((item) => `${item.number} ${item.title} ${item.category} ${item.keywords || ""}`.toLowerCase().includes(term));
  }, [query, protocols]);
  const protocolGroups = useMemo(() => filteredProtocols.reduce((groups, item) => {
    groups[item.category] = groups[item.category] || [];
    groups[item.category].push(item);
    return groups;
  }, {}), [filteredProtocols]);

  useEffect(() => {
    setSelectedId(protocolFromUrl());
  }, []);

  function chooseProtocol(protocol) {
    setSelectedId(protocol.number);
  }

  function protocolSummary(protocol) {
    return protocol.body.filter((line) => !/^(basic|paramedic|assessment|continued on next page)$/i.test(line)).slice(0, 3).join(" ");
  }

  function protocolSteps(protocol) {
    return protocol.body.filter((line) => /^\d+[\).]/.test(line.trim()) || /^[a-z]\./i.test(line.trim())).slice(0, 8);
  }

  if (view === "menu") {
    return (
      <section className="module-page department-module">
        <div className="module-card">
          <div className="module-card-header">
            <strong>EMS</strong>
            <span>Select EMS forms or EMS SOGs.</span>
          </div>
          <div className="inspection-division-grid">
            <button className="inspection-division-card" onClick={() => setView("forms")}>
              <Activity size={24} />
              <span><b>EMS Forms</b><em>Documentation forms and field reminders</em></span>
            </button>
            <button className="inspection-division-card" onClick={() => setView("sogs")}>
              <BookOpen size={24} />
              <span><b>EMS SOGs</b><em>Full protocols and treatment guidelines</em></span>
            </button>
            <button className="inspection-division-card" onClick={() => setView("meds")}>
              <ClipboardList size={24} />
              <span><b>Medication Dosage List</b><em>Adult and pediatric categories</em></span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (view === "forms") {
    return (
      <section className="module-page department-module">
        <div className="module-card">
          <div className="module-card-header">
            <strong>EMS Forms</strong>
            <span>Common field-documentation reminders.</span>
          </div>
          <div className="code-tools">
            <button className="secondary" onClick={() => setView("menu")}><ChevronRight size={16} /> EMS Menu</button>
          </div>
          <div className="resource-tile-grid">
            {emsForms.map((item) => (
              <div className="resource-tile" key={item}><Activity size={19} /><strong>{item}</strong><span>Open from agency-approved form storage when connected.</span></div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (view === "meds") {
    return <AclsMedicationCheatSheet setView={setView} />;
  }

  return (
    <section className="module-page department-module">
      <div className="module-card module-hero-card">
        <div className="module-card-header">
          <strong>EMS SOGs</strong>
          <span>Search the actual protocol text by SOG number, title, medication, condition, or keyword.</span>
        </div>
        <div className="code-tools">
          <button className="secondary" onClick={() => setView("menu")}><ChevronRight size={16} /> EMS Menu</button>
          <label className="code-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search 79 EMS treatment guidelines" />
          </label>
          <span className="module-chip">{filteredProtocols.length} protocols</span>
        </div>
        <div className="resource-layout">
          <div className="resource-list protocol-list">
            {Object.entries(protocolGroups).map(([category, items]) => (
              <section className="protocol-group" key={category}>
                <strong>{category}</strong>
                {items.map((protocol) => (
                  <button key={protocol.number} className={selectedProtocol.number === protocol.number ? "resource-row active" : "resource-row"} onClick={() => chooseProtocol(protocol)}>
                    <BookOpen size={18} />
                    <span><strong>SOG #{protocol.number} - {protocol.title}</strong><em>{protocol.category}</em></span>
                  </button>
                ))}
              </section>
            ))}
          </div>
          <article className="resource-detail">
            <span className="resource-kicker">SOG #{selectedProtocol.number}</span>
            <h2>{selectedProtocol.title}</h2>
            <div className="code-meta-grid">
              <div><strong>Category</strong><span>{selectedProtocol.category}</span></div>
              <div><strong>Protocol</strong><span>#{selectedProtocol.number}</span></div>
              <div><strong>Format</strong><span>Full in-app text</span></div>
            </div>
            <section className="inline-sog-full">
              <strong>Full Protocol</strong>
              <div className="sog-full-block">
                {selectedProtocol.body.map((line, index) => {
                  const heading = /^(assessment|basic|paramedic|notes?|special note|treatment|continued on next page)$/i.test(line.trim());
                  return heading ? <h3 key={`${line}-${index}`}>{line}</h3> : <p key={`${line}-${index}`}>{line}</p>;
                })}
              </div>
            </section>
            <div className="resource-actions">
              <button className="primary" onClick={() => setPopup(selectedProtocol)}><BookOpen size={16} /> Pop Out Card</button>
            </div>
          </article>
        </div>
      </div>
      {popup && (
        <div className="modal-backdrop code-popup-backdrop" role="presentation" onClick={() => setPopup(null)}>
          <article className="code-popup info-popup" role="dialog" aria-modal="true" aria-labelledby="ems-popup-title" onClick={(event) => event.stopPropagation()}>
            <div className="code-popup-header">
              <span>Protocol {popup.number}</span>
              <button className="icon-close" onClick={() => setPopup(null)}>Close</button>
            </div>
            <div className="code-popup-body">
              <h2 id="ems-popup-title">{popup.title}</h2>
              <p>{popup.category}</p>
              <div className="code-popup-facts">
                <div><strong>SOG</strong><span>#{popup.number}</span></div>
                <div><strong>Category</strong><span>{popup.category}</span></div>
                <div><strong>Format</strong><span>Full in-app text</span></div>
              </div>
              <section className="code-popup-section">
                <strong>Full Protocol</strong>
                {popup.body.map((step) => <span key={step}><CheckCircle2 size={16} />{step}</span>)}
              </section>
            </div>
            <div className="code-popup-actions">
              <button className="secondary" onClick={() => setPopup(null)}>Done</button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function PreFirePlansDatabase() {
  const [plans, setPlans] = useState(() => readLocalJson(localPreFirePlansKey, []));
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(blankPreFirePlan);
  const [planFile, setPlanFile] = useState(null);
  const [viewerPlan, setViewerPlan] = useState(null);
  const filteredPlans = useMemo(() => plans.filter((plan) => preFirePlanMatches(plan, query)), [plans, query]);
  const selectedPlan = filteredPlans[0] || null;

  useEffect(() => {
    let mounted = true;
    loadFirebaseCollection("preFirePlans", [])
      .then((loaded) => {
        if (!mounted || !loaded.length) return;
        setPlans(loaded);
        writeLocalJson(localPreFirePlansKey, loaded);
      })
      .catch(() => {});
    fetch("/api/pre-fire-plans")
      .then((res) => res.ok ? res.json() : Promise.reject(new Error("Pre-fire plans unavailable")))
      .then((data) => {
        if (!mounted) return;
        const loaded = data.plans || [];
        setPlans(loaded);
        writeLocalJson(localPreFirePlansKey, loaded);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  function setPlanField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handlePlanFile(file) {
    if (!file) return;
    setPlanFile(file);
    const parsedAddress = addressFromUploadName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({
        ...current,
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        fileData: reader.result,
        address: parsedAddress || current.address
      }));
    };
    reader.readAsDataURL(file);
  }

  async function savePlan() {
    if (!form.fileName.trim()) return;
    const derivedAddress = form.address || addressFromUploadName(form.fileName) || "Address not detected";
    let firebaseFile = null;
    const id = form.id || Date.now().toString();
    try {
      if (planFile && firebaseEnabled) {
        const safeName = planFile.name.replace(/[^a-z0-9_.-]/gi, "_");
        firebaseFile = await uploadFirebaseFile(`pre-fire-plans/${id}/${safeName}`, planFile);
      }
    } catch {}
    const saved = {
      ...form,
      address: derivedAddress,
      id,
      address_key: normalizeAddressSearch(derivedAddress),
      fileData: firebaseFile?.downloadUrl || form.fileData,
      fileUrl: firebaseFile?.downloadUrl || form.fileUrl || "",
      storagePath: firebaseFile?.storagePath || form.storagePath || "",
      updated_at: new Date().toISOString()
    };
    const next = [saved, ...plans.filter((plan) => plan.id !== saved.id)];
    setPlans(next);
    writeLocalJson(localPreFirePlansKey, next);
    try {
      await saveFirebaseRecord("preFirePlans", saved.id, saved);
      const res = await fetch("/api/pre-fire-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(saved) });
      const data = await res.json();
      if (res.ok && data.plans) {
        setPlans(data.plans);
        writeLocalJson(localPreFirePlansKey, data.plans);
      }
    } catch {}
    setQuery(saved.address === "Address not detected" ? "" : saved.address);
    setPlanFile(null);
    setForm(blankPreFirePlan());
  }

  function editPlan(plan) {
    setForm({ ...blankPreFirePlan(), ...plan });
    setPlanFile(null);
  }

  async function removePlan(plan) {
    const next = plans.filter((item) => item.id !== plan.id);
    setPlans(next);
    writeLocalJson(localPreFirePlansKey, next);
    try {
      await deleteFirebaseRecord("preFirePlans", plan.id);
      await fetch(`/api/pre-fire-plans/${encodeURIComponent(plan.id)}`, { method: "DELETE" });
    } catch {}
    if (form.id === plan.id) {
      setPlanFile(null);
      setForm(blankPreFirePlan());
    }
  }

  function exportPlans() {
    downloadCsv("pre-fire-plans.csv", plans);
  }

  return (
    <div className="pre-fire-plans">
      <section className="pre-fire-search">
        <label className="code-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by address number and street" />
        </label>
        <button className="secondary" onClick={exportPlans}><Download size={16} /> Export Plans</button>
      </section>
      <div className="pre-fire-layout">
        <section className="pre-fire-list">
          <div className="panel-title"><strong>Pre-Fire Plans</strong><span>{filteredPlans.length} found</span></div>
          {filteredPlans.length ? filteredPlans.map((plan) => (
            <button key={plan.id} className="pre-fire-row" onClick={() => setViewerPlan(plan)}>
              <strong>{plan.address}</strong>
              <span>{plan.fileName || "Pre-fire plan"}</span>
            </button>
          )) : <div className="daily-report-empty">No pre-fire plan found for that address.</div>}
        </section>
        <article className="pre-fire-detail">
          <span className="resource-kicker">Address Lookup</span>
          <h2>{selectedPlan ? selectedPlan.address : "No Plan Selected"}</h2>
          {selectedPlan ? (
            <div className="code-meta-grid">
              <div><strong>Business</strong><span>{selectedPlan.businessName || "N/A"}</span></div>
              <div><strong>Occupancy</strong><span>{selectedPlan.occupancyType || "N/A"}</span></div>
              <div><strong>Contact</strong><span>{selectedPlan.contactName || "N/A"} {selectedPlan.contactPhone || ""}</span></div>
              <div><strong>Hazards</strong><span>{selectedPlan.hazards || "N/A"}</span></div>
              <div><strong>Utilities</strong><span>{selectedPlan.utilities || "N/A"}</span></div>
              <div><strong>Fire Protection</strong><span>{selectedPlan.fireProtection || "N/A"}</span></div>
              <div><strong>Uploaded File</strong><span>{selectedPlan.fileName || "N/A"}</span></div>
              <div className="wide"><strong>Notes</strong><span>{selectedPlan.notes || "N/A"}</span></div>
            </div>
          ) : <p>Search by the address number and street name to retrieve a saved pre-fire plan.</p>}
          {selectedPlan && (
            <div className="resource-actions">
              <button className="primary" onClick={() => setViewerPlan(selectedPlan)}><FileText size={16} /> Open Plan</button>
              <button className="secondary" onClick={() => editPlan(selectedPlan)}>Replace Upload</button>
            </div>
          )}
        </article>
      </div>
      <section className="pre-fire-editor">
        <div className="panel-title"><strong>{form.id ? "Replace Uploaded Pre-Fire Plan" : "Upload Pre-Fire Plan"}</strong><span>The plan address is captured from the uploaded form.</span></div>
        <div className="form-grid">
          <Field label="Plan File Upload"><input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(event) => handlePlanFile(event.target.files?.[0])} /></Field>
          <div className="pre-fire-upload-name">
            <strong>Selected File</strong>
            <span>{form.fileName || "No file selected"}</span>
          </div>
          <div className="pre-fire-upload-name">
            <strong>Detected Address</strong>
            <span>{form.address || "Address will be read from the uploaded form name"}</span>
          </div>
        </div>
        <div className="resource-actions">
          <button className="primary" onClick={savePlan}><UploadCloud size={16} /> Upload Plan</button>
          <button className="secondary" onClick={() => { setPlanFile(null); setForm(blankPreFirePlan()); }}>New Plan</button>
          {form.id && <button className="secondary" onClick={() => removePlan(form)}>Remove</button>}
        </div>
      </section>
      {viewerPlan && (
        <div className="modal-backdrop code-popup-backdrop" role="presentation" onClick={() => setViewerPlan(null)}>
          <article className="code-popup pre-fire-viewer" role="dialog" aria-modal="true" aria-labelledby="pre-fire-viewer-title" onClick={(event) => event.stopPropagation()}>
            <div className="code-popup-header">
              <span>{viewerPlan.address}</span>
              <button className="icon-close" onClick={() => setViewerPlan(null)}>Close</button>
            </div>
            <div className="pre-fire-viewer-body">
              <h2 id="pre-fire-viewer-title">{viewerPlan.fileName || "Pre-Fire Plan"}</h2>
              {viewerPlan.fileData ? (
                viewerPlan.fileType?.startsWith("image/") ? (
                  <img src={viewerPlan.fileData} alt={viewerPlan.fileName || "Pre-fire plan"} />
                ) : (
                  <iframe src={viewerPlan.fileData} title={viewerPlan.fileName || "Pre-fire plan"} />
                )
              ) : (
                <div className="daily-report-empty">This plan needs to be re-uploaded before it can be viewed on this device.</div>
              )}
            </div>
            <div className="code-popup-actions">
              <button className="secondary" onClick={() => setViewerPlan(null)}>Close</button>
              {viewerPlan.fileData && <a className="primary" href={viewerPlan.fileData} download={viewerPlan.fileName || "pre-fire-plan"}><Download size={16} /> Download</a>}
            </div>
          </article>
        </div>
      )}
    </div>
  );
}

function HoseTestingPage() {
  const hoseInventory = useFirebaseList("hoseInventory", defaultHoseInventory);
  const [records, setRecords] = useState(() => readLocalJson("hlfd_hose_tests_v1", []));
  const [hoseSizeFilter, setHoseSizeFilter] = useState("All");
  const [apparatusFilter, setApparatusFilter] = useState("All");
  const [openApparatus, setOpenApparatus] = useState({});
  const [openHoseSizes, setOpenHoseSizes] = useState({});
  const [selectedHoses, setSelectedHoses] = useState([]);
  const [setup, setSetup] = useState({ testDate: "", shift: "" });
  const [form, setForm] = useState({ hoseId: "", apparatus: "", diameter: "", length: "50 ft", pressure: "200 psi", result: "Passed", testedBy: "", notes: "" });
  const inventoryById = useMemo(() => new Map(hoseInventory.map((hose) => [String(hose.hoseId || "").toUpperCase(), hose])), [hoseInventory]);
  const apparatusOptions = useMemo(() => [...new Set(hoseInventory.map((hose) => hose.apparatus).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })), [hoseInventory]);
  const visibleInventory = useMemo(() => hoseInventory.filter((hose) => {
    const sizeMatches = hoseSizeFilter === "All" || String(hose.diameter || "").replace(/"/g, "").trim() === hoseSizeFilter;
    const apparatusMatches = apparatusFilter === "All" || hose.apparatus === apparatusFilter;
    return sizeMatches && apparatusMatches;
  }), [apparatusFilter, hoseSizeFilter]);
  const visibleRecords = useMemo(() => records.filter((record) => {
    const sizeMatches = hoseSizeFilter === "All" || String(record.diameter || "").replace(/"/g, "").trim() === hoseSizeFilter;
    const apparatusMatches = apparatusFilter === "All" || record.apparatus === apparatusFilter;
    return sizeMatches && apparatusMatches;
  }), [apparatusFilter, records, hoseSizeFilter]);
  const currentYearRecords = visibleRecords.filter((record) => String(record.testDate || "").startsWith(currentYear()));
  const currentYearTestedHoseIds = useMemo(() => {
    const tested = new Set(records.filter((record) => String(record.testDate || "").startsWith(currentYear())).map((record) => String(record.hoseId || "").toUpperCase()).filter(Boolean));
    if (currentYear() === hoseTestingBaselineYear) {
      hoseInventory.forEach((hose) => {
        if (hose.hoseId) tested.add(String(hose.hoseId).toUpperCase());
      });
    }
    return tested;
  }, [hoseInventory, records]);
  const visibleDueHoses = useMemo(() => visibleInventory.filter((hose) => !currentYearTestedHoseIds.has(String(hose.hoseId || "").toUpperCase())), [currentYearTestedHoseIds, visibleInventory]);
  const hoseOptions = useMemo(() => {
    const options = new Map();
    visibleInventory.forEach((hose) => {
      if (hose.hoseId) options.set(String(hose.hoseId).toUpperCase(), hose);
    });
    visibleRecords.forEach((record) => {
      if (!record.hoseId) return;
      const key = String(record.hoseId).toUpperCase();
      if (!options.has(key)) {
        options.set(key, {
          hoseId: record.hoseId,
          apparatus: record.apparatus,
          apparatusName: record.apparatusName,
          group: record.apparatus,
          diameter: record.diameter
        });
      }
    });
    return [...options.values()].sort((a, b) => String(a.hoseId).localeCompare(String(b.hoseId), undefined, { numeric: true }));
  }, [visibleInventory, visibleRecords]);
  const hoseTree = useMemo(() => {
    const groups = new Map();
    const sizeOrder = { "1.75": 1, "3": 2, "5": 3 };
    hoseOptions.forEach((hose) => {
      const apparatus = hose.apparatus || "Unassigned";
      if (!groups.has(apparatus)) {
        groups.set(apparatus, {
          label: hose.apparatusName || apparatus,
          hoses: [],
          sizes: new Map()
        });
      }
      const group = groups.get(apparatus);
      group.hoses.push(hose);
      const size = String(hose.diameter || "Unknown").replace(/"/g, "").trim() || "Unknown";
      if (!group.sizes.has(size)) group.sizes.set(size, []);
      group.sizes.get(size).push(hose);
    });
    return [...groups.entries()].sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true })).map(([apparatus, group]) => [
      apparatus,
      {
        ...group,
        sizes: [...group.sizes.entries()]
          .sort(([a], [b]) => (sizeOrder[a] || 99) - (sizeOrder[b] || 99) || String(a).localeCompare(String(b), undefined, { numeric: true }))
          .map(([size, hoses]) => [size, hoses.sort((a, b) => String(a.hoseId).localeCompare(String(b.hoseId), undefined, { numeric: true }))])
      }
    ]);
  }, [hoseOptions]);
  const setupReady = Boolean(setup.testDate && setup.shift);

  useEffect(() => {
    let mounted = true;
    loadFirebaseCollection("hoseTests", [])
      .then((cloudRecords) => {
        if (!mounted) return;
        setRecords(mergeRecords(readLocalJson("hlfd_hose_tests_v1", []), cloudRecords));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function hoseLengthForDiameter(diameter, hoseId = "") {
    if (String(hoseId || "").toUpperCase().includes("P")) return "Pony";
    return String(diameter || "").replace(/"/g, "").trim() === "5" ? "100 ft" : "50 ft";
  }

  function applyHoseDetails(hose) {
    if (!hose) return;
    setForm((current) => ({
      ...current,
      hoseId: hose.hoseId || current.hoseId,
      apparatus: hose.apparatus || current.apparatus,
      diameter: hose.diameter || current.diameter,
      length: hose.length || hoseLengthForDiameter(hose.diameter, hose.hoseId) || current.length
    }));
  }

  function handleHoseEntry(value) {
    setField("hoseId", value);
    const singleHoseId = value.trim();
    if (!singleHoseId || /[,\n;]/.test(value)) return;
    applyHoseDetails(inventoryById.get(singleHoseId.toUpperCase()));
  }

  function toggleHose(hoseId) {
    if (!setupReady) return;
    const inventoryMatch = inventoryById.get(String(hoseId).toUpperCase());
    applyHoseDetails(inventoryMatch || { hoseId });
    setSelectedHoses((current) => current.includes(hoseId) ? current.filter((id) => id !== hoseId) : [...current, hoseId]);
  }

  function toggleApparatusTree(apparatus) {
    setOpenApparatus((current) => ({ ...current, [apparatus]: !(current[apparatus] ?? false) }));
  }

  function toggleHoseSizeTree(key) {
    setOpenHoseSizes((current) => ({ ...current, [key]: !(current[key] ?? false) }));
  }

  function hoseIdsForSave() {
    const typed = form.hoseId.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
    return [...new Set([...selectedHoses, ...typed])];
  }

  async function saveRecord() {
    if (!setupReady) return;
    const hoseIds = hoseIdsForSave();
    if (!hoseIds.length) return;
    const stamp = Date.now();
    const newRecords = hoseIds.map((hoseId, index) => {
      const inventoryMatch = inventoryById.get(String(hoseId).toUpperCase());
      return {
        ...form,
        hoseId,
        apparatus: inventoryMatch?.apparatus || form.apparatus || "",
        diameter: inventoryMatch?.diameter || form.diameter || "",
        length: inventoryMatch?.length || form.length || hoseLengthForDiameter(inventoryMatch?.diameter || form.diameter, hoseId),
        testDate: setup.testDate,
        shift: setup.shift,
        id: `${stamp}-${index}`,
        created_at: new Date().toISOString()
      };
    });
    const next = [...newRecords, ...records];
    setRecords(next);
    writeLocalJson("hlfd_hose_tests_v1", next);
    await Promise.all(newRecords.map((record) => saveFirebaseRecord("hoseTests", firebaseDocId(record.id), record).catch(() => null)));
    setSelectedHoses([]);
    setForm({ hoseId: "", apparatus: "", diameter: form.diameter, length: form.length, pressure: form.pressure, result: "Passed", testedBy: form.testedBy, notes: "" });
  }

  function exportRecords() {
    downloadCsv("hose-testing.csv", records);
  }

  return (
    <div className="pre-fire-plans hose-testing-panel">
      <section className="daily-report-stats">
        <div><span>Inventory</span><strong>{visibleInventory.length}</strong></div>
        <div><span>Due This Year</span><strong>{visibleDueHoses.length}</strong></div>
        <div><span>Completed</span><strong>{Math.max(visibleInventory.length - visibleDueHoses.length, 0)}</strong></div>
        <div><span>Total Tests</span><strong>{visibleRecords.length}</strong></div>
        <div><span>{currentYear()} Tests</span><strong>{currentYearRecords.length}</strong></div>
        <div><span>Passed</span><strong>{visibleRecords.filter((record) => record.result === "Passed").length}</strong></div>
        <div><span>Failed</span><strong>{visibleRecords.filter((record) => record.result === "Failed").length}</strong></div>
      </section>
      <section className="hose-size-filter" aria-label="Hose size filter">
        {["All", "1.75", "3", "5"].map((size) => (
          <button key={size} className={hoseSizeFilter === size ? "active" : ""} onClick={() => { setHoseSizeFilter(size); setSelectedHoses([]); }}>
            {size === "All" ? "All Sizes" : `${size}"`}
          </button>
        ))}
      </section>
      <section className="hose-size-filter" aria-label="Apparatus filter">
        {["All", ...apparatusOptions].map((apparatus) => (
          <button key={apparatus} className={apparatusFilter === apparatus ? "active" : ""} onClick={() => { setApparatusFilter(apparatus); setSelectedHoses([]); }}>
            {apparatus === "All" ? "All Apparatus" : apparatus}
          </button>
        ))}
      </section>
      <section className="pre-fire-editor hose-setup-panel">
        <div className="panel-title"><strong>Hose Test Setup</strong><span>Date and shift are required before testing.</span></div>
        <div className="form-grid">
          <Field label="Test Date"><input type="date" value={setup.testDate} onChange={(event) => setSetup((current) => ({ ...current, testDate: event.target.value }))} /></Field>
          <Field label="Shift"><select value={setup.shift} onChange={(event) => setSetup((current) => ({ ...current, shift: event.target.value }))}>{shiftOptions.map((shift) => <option key={shift}>{shift}</option>)}</select></Field>
        </div>
        {!setupReady && <div className="private-banner shift-lock-banner">Set test date and shift to begin hose testing.</div>}
      </section>
      {hoseOptions.length > 0 && (
        <section className="hose-bulk-select" aria-label="Bulk hose selection">
          <div className="panel-title"><strong>Bulk Hose Selection</strong><span>{selectedHoses.length} selected</span></div>
          <div className="hose-tree">
            {hoseTree.map(([apparatus, group]) => {
              const isOpen = openApparatus[apparatus] ?? false;
              return (
                <div className="hose-tree-group" key={apparatus}>
                  <button className="hose-tree-toggle" onClick={() => toggleApparatusTree(apparatus)}>
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <strong>{group.label}</strong>
                    <span>{group.hoses.length} hose{group.hoses.length === 1 ? "" : "s"}</span>
                  </button>
                  {isOpen && (
                    <div className="hose-size-tree">
                      {group.sizes.map(([size, hoses]) => {
                        const sizeKey = `${apparatus}-${size}`;
                        const sizeOpen = openHoseSizes[sizeKey] ?? false;
                        const sizeLabel = size === "Unknown" ? "Unknown size" : `${size}" hose`;
                        return (
                          <div className="hose-size-group" key={sizeKey}>
                            <button className="hose-size-toggle" onClick={() => toggleHoseSizeTree(sizeKey)}>
                              {sizeOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              <strong>{sizeLabel}</strong>
                              <span>{hoses.length}</span>
                            </button>
                            {sizeOpen && (
                              <div className="hose-select-grid">
                                {hoses.map((hose) => (
                                  <button key={hose.hoseId} disabled={!setupReady} className={selectedHoses.includes(hose.hoseId) ? "active" : ""} onClick={() => toggleHose(hose.hoseId)}>
                                    <strong>{hose.hoseId}</strong>
                                    <span>{hose.length || hoseLengthForDiameter(hose.diameter, hose.hoseId)}</span>
                                    {!currentYearTestedHoseIds.has(String(hose.hoseId || "").toUpperCase()) && <em>Due {currentYear()}</em>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="pre-fire-editor">
        <div className="panel-title"><strong>Hose Test Entry</strong><span>Record hose ID, pressure, result, and notes.</span></div>
        <div className="form-grid">
          <Field label="Hose ID / Numbers"><textarea disabled={!setupReady} value={form.hoseId} onChange={(event) => handleHoseEntry(event.target.value)} rows={2} placeholder="Enter one hose ID, or separate multiple IDs with commas" /></Field>
          <Field label="Apparatus"><input disabled={!setupReady} value={form.apparatus} onChange={(event) => setField("apparatus", event.target.value)} /></Field>
          <Field label="Diameter"><select disabled={!setupReady} value={form.diameter} onChange={(event) => setField("diameter", event.target.value)}><option value="">Select</option><option value="1.75">1.75"</option><option value="3">3"</option><option value="5">5"</option></select></Field>
          <Field label="Length"><select disabled={!setupReady} value={form.length} onChange={(event) => setField("length", event.target.value)}><option>50 ft</option><option>100 ft</option><option>Pony</option></select></Field>
          <Field label="Test PSI"><select disabled={!setupReady} value={form.pressure} onChange={(event) => setField("pressure", event.target.value)}><option>200 psi</option><option>250 psi</option></select></Field>
          <Field label="Result"><select disabled={!setupReady} value={form.result} onChange={(event) => setField("result", event.target.value)}><option>Passed</option><option>Failed</option><option>Needs Repair</option><option>Removed From Service</option></select></Field>
          <Field label="Tested By"><input disabled={!setupReady} value={form.testedBy} onChange={(event) => setField("testedBy", event.target.value)} list="tested-by-options" /></Field>
          <Field label="Notes"><textarea disabled={!setupReady} value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows={3} /></Field>
        </div>
        <div className="resource-actions">
          <button className="primary" disabled={!setupReady} onClick={saveRecord}><Save size={16} /> Save Hose Test{hoseIdsForSave().length > 1 ? `s (${hoseIdsForSave().length})` : ""}</button>
          <button className="secondary" onClick={exportRecords}><Download size={16} /> Export</button>
        </div>
      </section>
      <section className="daily-report-table" role="table" aria-label="Hose testing records">
        <div className="daily-report-row table-head" role="row">
          <span>Date</span><span>Hose</span><span>Shift</span><span>Diameter</span><span>PSI</span><span>Result</span><span>Notes</span>
        </div>
        {visibleRecords.length ? visibleRecords.map((record) => (
          <div className="daily-report-row" role="row" key={record.id}>
            <span>{record.testDate}</span>
            <span>{record.hoseId}</span>
            <span>{record.shift || "N/A"}</span>
            <span>{record.diameter || "N/A"}</span>
            <span>{record.pressure || "N/A"}</span>
            <span>{record.result}</span>
            <span>{record.notes || "N/A"}</span>
          </div>
        )) : <div className="daily-report-empty">No hose test records for this size.</div>}
      </section>
    </div>
  );
}

function FireFormsPage({ requestedView = "", setTab, setFireFormsView }) {
  const fireSogIndex = useFirebaseList("fireSogsFull", defaultFireSogs);
  const fireSogDetails = useFirebaseList("fireSogDetails", defaultFireSogDetails);
  const viewParam = new URLSearchParams(window.location.search).get("view");
  const initialView = requestedView || (["forms", "sogs", "plans", "hose"].includes(viewParam) ? viewParam : "forms");
  const [view, setView] = useState(initialView);
  const [activeForm, setActiveForm] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedSog, setSelectedSog] = useState(defaultFireSogs[0]);
  const [sogPopup, setSogPopup] = useState(null);
  const fireForms = [
    { label: "Liability Release Form", url: "https://form.jotform.com/260756661469065" },
    { label: "Pre Fire Plan Form", url: "https://form.jotform.com/260863576120053" }
  ];
  const sogPdfUrl = "https://dept-app-k85k.onrender.com/documents/horn-lake-sogs.pdf";
  const sogDetailMap = useMemo(() => new Map(fireSogDetails.map((sog) => [sog.code, sog])), [fireSogDetails]);
  useEffect(() => {
    if (requestedView && requestedView !== view) setView(requestedView);
  }, [requestedView, view]);
  useEffect(() => {
    const matchingSog = fireSogIndex.find((sog) => sog.code === selectedSog?.code);
    if (matchingSog && matchingSog !== selectedSog) {
      setSelectedSog(matchingSog);
      return;
    }
    if (!matchingSog) setSelectedSog(fireSogIndex[0]);
  }, [fireSogIndex, selectedSog?.code]);
  const filteredSogs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return fireSogIndex;
    return fireSogIndex.filter((sog) => `${sog.code} ${sog.title} sog ${sog.code}`.toLowerCase().includes(term));
  }, [query]);

  function sogSourceUrl(sog) {
    const detail = sogDetailMap.get(sog.code);
    if (detail?.sourceUrl || detail?.fileUrl || detail?.downloadUrl) {
      return detail.sourceUrl || detail.fileUrl || detail.downloadUrl;
    }
    if (detail?.sourceFile) {
      return new URL(`${import.meta.env.BASE_URL}documents/sogs/${encodeURIComponent(detail.sourceFile)}`, window.location.origin).toString();
    }
    const sourcePage = detail?.sourcePage || detail?.page || sog.page;
    const source = new URL(sogPdfUrl);
    source.hash = `page=${sourcePage}`;
    return source.toString();
  }

  function chooseSog(sog) {
    setSelectedSog(sog);
  }

  function sogNotes(sog) {
    const details = sogDetailMap.get(sog.code)?.details;
    return details?.length ? details : [`SOG #{sog.code} starts on page ${sog.page} of the Horn Lake SOG manual.`];
  }

  function sogFullBlocks(sog) {
    const detail = sogDetailMap.get(sog.code);
    if (detail?.fullBlocks?.length) return detail.fullBlocks;
    if (detail?.fullText?.length) return [{ heading: "SOG Text", lines: detail.fullText }];
    return [{ heading: "SOG Details", lines: sogNotes(sog) }];
  }

  return (
    <section className="module-page department-module fire-section-page">
      <div className="module-card">
        <div className="module-card-header">
          <strong>Fire</strong>
          <span>Fire tools, SOG access, and department resources.</span>
        </div>
        <div className="code-tools">
          <div className="code-toggle fire-toggle" aria-label="Fire section mode">
            <button className={view === "forms" ? "active" : ""} onClick={() => { setView("forms"); setFireFormsView?.("forms"); setActiveForm(null); }}><FileText size={16} /> Forms</button>
            <button className={view === "sogs" ? "active" : ""} onClick={() => { setView("sogs"); setFireFormsView?.("sogs"); setActiveForm(null); }}><ShieldCheck size={16} /> SOGs</button>
            <button className={view === "plans" ? "active" : ""} onClick={() => { setView("plans"); setFireFormsView?.("plans"); setActiveForm(null); }}><ClipboardList size={16} /> Pre-Fire Plans</button>
            <button onClick={() => setTab?.("dashboard")}><Droplets size={16} /> Hydrants</button>
            <button className={view === "hose" ? "active" : ""} onClick={() => { setView("hose"); setFireFormsView?.("hose"); setActiveForm(null); }}><Gauge size={16} /> Hose Testing</button>
          </div>
          {view === "sogs" && (
            <label className="code-search fire-sog-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SOG number or title" />
            </label>
          )}
        </div>
        {view === "forms" && (
          <div className="inspection-division-grid fire-form-grid">
            {fireForms.map((form) => (
              <button key={form.label} className="inspection-division-card" onClick={() => setActiveForm(form)}>
                <FileText size={24} />
                <span><b>{form.label}</b><em>Open</em></span>
              </button>
            ))}
          </div>
        )}
        {view === "sogs" && (
          <div className="code-browser fire-sog-browser">
            <div className="resource-list protocol-list">
              <section className="protocol-group">
                <strong>{filteredSogs.length} SOGs</strong>
                {filteredSogs.map((sog) => (
                  <button key={sog.code} className={selectedSog.code === sog.code ? "resource-row active" : "resource-row"} onClick={() => chooseSog(sog)}>
                    <ShieldCheck size={18} />
                    <span><strong>SOG #{sog.code} - {sog.title}</strong><em>Page {sog.page}</em></span>
                  </button>
                ))}
              </section>
            </div>
            <article className="resource-detail">
              <span className="resource-kicker">SOG #{selectedSog.code}</span>
              <h2>{selectedSog.title}</h2>
              <div className="code-meta-grid">
                <div><strong>Manual Page</strong><span>{selectedSog.page}</span></div>
                <div><strong>Source</strong><span>{sogDetailMap.get(selectedSog.code)?.sourceFile || "Horn Lake SOG PDF"}</span></div>
              </div>
              <section className="inline-sog-full">
                <strong>Full SOG Information</strong>
                {sogFullBlocks(selectedSog).map((block, blockIndex) => (
                  <div className="sog-full-block" key={`${block.heading}-${blockIndex}`}>
                    {block.heading !== "SOG Text" && <h3>{block.heading}</h3>}
                    {block.lines.map((line, lineIndex) => <p key={`${block.heading}-${lineIndex}`}>{line}</p>)}
                  </div>
                ))}
              </section>
              <div className="resource-actions">
                <a className="primary" href={sogSourceUrl(selectedSog)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open Source</a>
              </div>
            </article>
          </div>
        )}
        {view === "plans" && <PreFirePlansDatabase />}
        {view === "hose" && <HoseTestingPage />}
      </div>
      {activeForm && (
        <div className="modal-backdrop code-popup-backdrop" role="presentation" onClick={() => setActiveForm(null)}>
          <article className="code-popup inspection-form-popup" role="dialog" aria-modal="true" aria-labelledby="fire-form-title" onClick={(event) => event.stopPropagation()}>
            <div className="code-popup-header">
              <span>{activeForm.label}</span>
              <button className="icon-close" onClick={() => setActiveForm(null)}>Close</button>
            </div>
            <div className="inspection-form-frame-wrap">
              <iframe className="inspection-form-frame" src={activeForm.url} title={activeForm.label} allowFullScreen />
            </div>
            <div className="code-popup-actions">
              <button className="secondary" onClick={() => setActiveForm(null)}>Done</button>
              <button className="primary" onClick={() => window.open(activeForm.url, "_blank", "noopener,noreferrer")?.focus?.()}><ExternalLink size={16} /> Source</button>
            </div>
          </article>
        </div>
      )}
      {sogPopup && (
        <div className="modal-backdrop code-popup-backdrop" role="presentation" onClick={() => setSogPopup(null)}>
          <article className="code-popup info-popup" role="dialog" aria-modal="true" aria-labelledby="fire-sog-popup-title" onClick={(event) => event.stopPropagation()}>
            <div className="code-popup-header">
              <span>SOG #{sogPopup.code}</span>
              <button className="icon-close" onClick={() => setSogPopup(null)}>Close</button>
            </div>
            <div className="code-popup-body">
              <h2 id="fire-sog-popup-title">{sogPopup.title}</h2>
              <p>{sogDetailMap.get(sogPopup.code)?.chapter || "Horn Lake Fire Department SOG manual"}</p>
              <div className="code-popup-facts">
                <div><strong>SOG</strong><span>#{sogPopup.code}</span></div>
                <div><strong>Manual Pages</strong><span>{sogPopup.page}{sogDetailMap.get(sogPopup.code)?.endPage > sogPopup.page ? `-${sogDetailMap.get(sogPopup.code).endPage}` : ""}</span></div>
                <div><strong>Source</strong><span>{sogDetailMap.get(sogPopup.code)?.sourceFile || "Horn Lake SOG PDF"}</span></div>
              </div>
              <section className="code-popup-section">
                <strong>SOG Details</strong>
                {sogNotes(sogPopup).map((item) => <span key={item}><CheckCircle2 size={16} />{item}</span>)}
              </section>
            </div>
            <div className="code-popup-actions">
              <button className="secondary" onClick={() => setSogPopup(null)}>Done</button>
              <a className="primary" href={sogSourceUrl(sogPopup)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open Source</a>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function InspectionDivisionPage({ setTab }) {
  const path = window.location.pathname.toLowerCase();
  const initialPopup = path.includes("fire-inspection-form") ? "inspection" : path.includes("burn-permit") ? "burn" : null;
  const [popup, setPopup] = useState(initialPopup);
  const inspectionFormUrl = "https://form.jotform.com/260886407564063";

  return (
    <section className="module-page department-module inspection-division-page">
      <div className="module-card">
        <div className="module-card-header">
          <strong>Inspection Division</strong>
          <span>Forms, permits, inspections, and searchable fire code resources.</span>
        </div>
        <div className="inspection-division-grid">
          <section className="inspection-card-group">
            <strong>Forms</strong>
            <button className="inspection-division-card" onClick={() => setPopup("inspection")}>
              <ClipboardCheck size={24} />
              <span><b>Fire Inspection Form</b><em>Open</em></span>
            </button>
            <button className="inspection-division-card" onClick={() => setPopup("burn")}>
              <Flame size={24} />
              <span><b>Burn Permit</b><em>Coming Soon</em></span>
            </button>
          </section>
          <section className="inspection-card-group">
            <strong>Pre-Fire Plans</strong>
            <button className="inspection-division-card" onClick={() => { window.location.href = "/fire-forms?view=plans"; }}>
              <ClipboardList size={24} />
              <span><b>Pre-Fire Plans</b><em>Search and upload plans by address</em></span>
            </button>
          </section>
          <section className="inspection-card-group">
            <strong>Field Tools</strong>
            <button className="inspection-division-card" onClick={() => { window.location.href = "/inspection-division/codes"; }}>
              <ShieldCheck size={24} />
              <span><b>Fire Codes & Regulations</b><em>Browse</em></span>
            </button>
            <button className="inspection-division-card" onClick={() => setTab?.("dashboard")}>
              <Droplets size={24} />
              <span><b>Hydrants</b><em>Hydrant records, inspections, and flow tests</em></span>
            </button>
          </section>
        </div>
      </div>
      {popup === "inspection" && (
        <div className="modal-backdrop code-popup-backdrop" role="presentation" onClick={() => setPopup(null)}>
          <article className="code-popup inspection-form-popup" role="dialog" aria-modal="true" aria-labelledby="inspection-form-title" onClick={(event) => event.stopPropagation()}>
            <div className="code-popup-header">
              <span>Fire Inspection Form</span>
              <button className="icon-close" onClick={() => setPopup(null)}>Close</button>
            </div>
            <div className="inspection-form-frame-wrap">
              <iframe className="inspection-form-frame" src={inspectionFormUrl} title="Fire Inspection Form" allowFullScreen />
            </div>
            <div className="code-popup-actions">
              <button className="secondary" onClick={() => setPopup(null)}>Done</button>
              <button className="primary" onClick={() => window.open(inspectionFormUrl, "_blank", "noopener,noreferrer")?.focus?.()}><ExternalLink size={16} /> Source</button>
            </div>
          </article>
        </div>
      )}
      {popup === "burn" && (
        <div className="modal-backdrop code-popup-backdrop" role="presentation" onClick={() => setPopup(null)}>
          <article className="code-popup info-popup" role="dialog" aria-modal="true" aria-labelledby="burn-permit-title" onClick={(event) => event.stopPropagation()}>
            <div className="code-popup-header">
              <span>Burn Permit</span>
              <button className="icon-close" onClick={() => setPopup(null)}>Close</button>
            </div>
            <div className="code-popup-body">
              <h2 id="burn-permit-title">Burn Permit</h2>
              <p>This section is under development.</p>
              <div className="code-popup-facts">
                <div><strong>Status</strong><span>Coming Soon</span></div>
                <div><strong>Division</strong><span>Inspection Division</span></div>
                <div><strong>Use</strong><span>Permit workflow</span></div>
              </div>
              <section className="code-popup-section">
                <strong>Planned Workflow</strong>
                {["Applicant information and burn location.", "Permit conditions, dates, and approval status.", "Inspection Division review before final issue."].map((item) => (
                  <span key={item}><CheckCircle2 size={16} />{item}</span>
                ))}
              </section>
            </div>
            <div className="code-popup-actions">
              <button className="primary" onClick={() => setPopup(null)}>Done</button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function InvestigationsPage() {
  const investigationTools = [
    ["Scene Documentation", "Photos, origin area notes, witness statements, property details, and scene preservation reminders."],
    ["Case Follow-Up", "Track responsible parties, insurance contacts, report status, and follow-up inspection needs."],
    ["Evidence Control", "Document collection notes, custody handoff, storage location, and related case references."],
    ["Contacts", "Keep investigator, dispatch, city, law enforcement, and outside-agency contact notes ready for incidents."]
  ];
  return (
    <section className="module-page department-module investigations-page">
      <div className="module-card">
        <div className="module-card-header">
          <strong>Investigations</strong>
          <span>Fire investigation resources, case notes, evidence tracking, and follow-up tools.</span>
        </div>
        <div className="inspection-division-grid">
          <section className="inspection-card-group">
            <strong>Investigation Tools</strong>
            {investigationTools.map(([title, detail]) => (
              <div key={title} className="inspection-division-card investigation-info-card">
                <Search size={24} />
                <span><b>{title}</b><em>{detail}</em></span>
              </div>
            ))}
          </section>
          <section className="inspection-card-group">
            <strong>Quick Actions</strong>
            <div className="inspection-division-card investigation-info-card">
              <ClipboardList size={24} />
              <span><b>Investigation Report</b><em>Placeholder for the department investigation form or case system.</em></span>
            </div>
            <div className="inspection-division-card investigation-info-card">
              <Mail size={24} />
              <span><b>Important Contacts</b><em>Use the Important Numbers tab for phone contacts and call links.</em></span>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function FireCodesPage() {
  const fireCodesFull = useFirebaseList("fireCodesFull", defaultFireCodes);
  const fireCodeIndexFull = useFirebaseList("fireCodeIndexFull", defaultFireCodeIndex);
  const fireCodePdfSections = useFirebaseList("fireCodePdfSections", defaultFireCodePdfSections);
  const fireCodeDocxSections = useFirebaseList("fireCodeDocxSections", defaultFireCodeDocxSections);
  const params = new URLSearchParams(window.location.search);
  const initialSection = params.get("section") || params.get("code") || "304";
  const [view, setView] = useState(["toc", "index"].includes(params.get("view")) ? params.get("view") : "sections");
  const [query, setQuery] = useState("");
  const fireCodeRecords = useMemo(() => {
    const merged = new Map();
    const referenceGroups = new Map();
    fireCodesFull.forEach((code) => {
      const root = sectionRoot(code.section);
      const isChild = root && root !== code.section;
      const normalized = { ...code, parentSection: isChild ? root : code.parentSection, sourceKind: "Reference app" };
      merged.set(normalized.section, normalized);
      if (isChild) {
        if (!referenceGroups.has(root)) referenceGroups.set(root, []);
        referenceGroups.get(root).push(normalized);
      }
    });
    referenceGroups.forEach((items, root) => {
      if (merged.has(root)) return;
      const first = items[0];
      const genericTitle = ["General", "Scope", "Definitions"].includes(first.title) ? `Section ${root}` : first.title;
      merged.set(root, {
        section: root,
        title: genericTitle,
        chapter: first.chapter,
        chapterTitle: first.chapterTitle,
        sourceKind: "Reference app",
        body: items.flatMap((item) => [`${item.section} ${item.title}`, ...(item.body || [])]),
        searchText: items.map((item) => item.searchText || `${item.section} ${item.title} ${item.body?.join(" ")}`).join(" ").toLowerCase()
      });
    });
    fireCodePdfSections.forEach((code) => merged.set(code.section, { ...code, sourceKind: "PDF source" }));
    fireCodeDocxSections.forEach((code) => merged.set(code.section, { ...code, sourceKind: "Word document" }));
    return [...merged.values()].sort((a, b) => {
      const chapterDiff = String(a.chapter).localeCompare(String(b.chapter), undefined, { numeric: true });
      if (chapterDiff) return chapterDiff;
      return String(a.section).localeCompare(String(b.section), undefined, { numeric: true });
    });
  }, [fireCodeDocxSections, fireCodePdfSections, fireCodesFull]);
  const codeMap = useMemo(() => new Map(fireCodeRecords.map((code) => [code.section, code])), [fireCodeRecords]);
  const [selected, setSelected] = useState(defaultFireCodes[0]);
  const [expandedFamilies, setExpandedFamilies] = useState(() => new Set());
  const [expandedCodes, setExpandedCodes] = useState(() => new Set([sectionRoot(initialSection)]));

  const filteredCodes = useMemo(() => {
    const term = query.trim().toLowerCase();
    const majorCodes = fireCodeRecords.filter((code) => isMajorCode(code));
    if (!term) return majorCodes;
    const matches = fireCodeRecords.filter((code) => {
      const text = code.searchText || `${code.section} ${code.title} ${code.chapterTitle} ${code.body?.join(" ")}`;
      return text.toLowerCase().includes(term);
    });
    const visible = new Map();
    matches.forEach((code) => {
      const parentSection = code.parentSection || sectionRoot(code.section);
      const parent = findCode(parentSection);
      visible.set(parent?.section || code.section, parent || code);
    });
    return [...visible.values()].filter((code) => isMajorCode(code) || code.body?.length);
  }, [fireCodeRecords, query]);

  const groupedCodes = useMemo(() => {
    const groups = new Map();
    filteredCodes.forEach((code) => {
      const key = codeFamilyLabel(code);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(code);
    });
    return [...groups.entries()].map(([title, codes]) => ({ title, key: codeFamilyValue(codes[0]), codes }));
  }, [filteredCodes]);

  const filteredToc = useMemo(() => {
    const term = query.trim().toLowerCase();
    return fireCodeParts.map((part) => ({
      ...part,
      chapters: part.chapters.filter((chapter) => {
        if (!term) return true;
        return `${part.part} ${chapter.num} ${chapter.code} ${chapter.title} ${chapter.pages}`.toLowerCase().includes(term);
      })
    })).filter((part) => part.chapters.length);
  }, [query]);

  const childCodeMap = useMemo(() => {
    const groups = new Map();
    fireCodeRecords.forEach((code) => {
      if (!code.parentSection) return;
      if (!groups.has(code.parentSection)) groups.set(code.parentSection, []);
      groups.get(code.parentSection).push(code);
    });
    return groups;
  }, [fireCodeRecords]);

  useEffect(() => {
    const next = findCode(selected?.section || initialSection) || findCode("304") || findCode("101.1") || fireCodeRecords[0];
    if (next && next !== selected) setSelected(next);
  }, [fireCodeRecords, selected?.section]);

  const filteredIndex = useMemo(() => {
    const term = query.trim().toLowerCase();
    const indexRows = fireCodeIndexFull.flatMap((item) => item.refs.map((ref) => ({ ...ref, title: item.title })));
    if (!term) return indexRows;
    return indexRows.filter((item) => `${item.title} ${item.label} ${item.chapter}`.toLowerCase().includes(term));
  }, [query]);

  function selectCode(code) {
    setSelected(code);
    setExpandedFamilies((current) => new Set(current).add(codeFamilyValue(code)));
  }

  function selectChapter(chapter) {
    const family = typeof chapter.num === "string" ? String(chapter.num) : String(chapter.code || chapter.num);
    const firstCode = fireCodeRecords.find((code) => codeFamilyValue(code) === family && isMajorCode(code));
    setExpandedFamilies((current) => new Set(current).add(family));
    if (firstCode) {
      setSelected(firstCode);
      setView("sections");
    }
  }

  function toggleFamily(family) {
    setExpandedFamilies((current) => {
      const next = new Set(current);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }

  function toggleCode(section) {
    setExpandedCodes((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function sectionRoot(section) {
    return String(section || "").split(".")[0];
  }

  function isMajorCode(code) {
    return code && !code.parentSection && !String(code.section).includes(".");
  }

  function codeFamilyLabel(code) {
    const family = codeFamilyValue(code);
    return `${family} - ${code.chapterTitle}`;
  }

  function codeFamilyValue(code) {
    const rootSection = sectionRoot(code.section);
    if (/^[A-Z]/i.test(rootSection)) return String(code.chapter);
    const root = Number(rootSection.replace(/\D/g, ""));
    return Number.isFinite(root) ? String(Math.floor(root / 100) * 100) : String(code.chapter);
  }

  function findCode(section) {
    return codeMap.get(section) || fireCodeRecords.find((code) => code.section.startsWith(`${section}.`));
  }

  function selectIndex(item) {
    const partial = findCode(item.label);
    if (partial) {
      setSelected(partial);
      setExpandedFamilies((current) => new Set(current).add(codeFamilyValue(partial)));
      if (partial.parentSection) setExpandedCodes((current) => new Set(current).add(partial.parentSection));
      setView("sections");
    }
  }

  function codeSourceUrl(code) {
    if (code.sourceUrl || code.fileUrl || code.downloadUrl) {
      return code.sourceUrl || code.fileUrl || code.downloadUrl;
    }
    if (code.sourceKind === "PDF source" && code.sourceFile) {
      return new URL(`${import.meta.env.BASE_URL}documents/codes/${encodeURIComponent(code.sourceFile)}`, window.location.origin).toString();
    }
    const pdfSource = fireCodePdfUrls[code.chapter];
    if (pdfSource) return `${fireCodeAssetBase}${pdfSource}`;
    const source = new URL("/inspection-division/codes", fireCodeAssetBase);
    source.searchParams.set("section", code.section);
    return source.toString();
  }

  function sourceLabel(code) {
    if (code.sourceUrl || code.fileUrl || code.downloadUrl) return "Firebase source";
    if (code.sourceKind === "Word document") return code.sourceFile || "2024 IFC Word source";
    if (code.sourceKind === "PDF source" && code.sourceFile) return code.sourceFile;
    const pdfPath = fireCodePdfUrls[code.chapter];
    if (pdfPath) return `Chapter ${code.chapter} source`;
    return "Reference app source";
  }

  function codeBody(code) {
    return code?.body?.length ? code.body : ["No extracted text was found for this code section."];
  }

  function visibleChildCodes(code) {
    const children = childCodeMap.get(code.section) || [];
    const term = query.trim().toLowerCase();
    if (!term) return children;
    return children.filter((child) => {
      const text = child.searchText || `${child.section} ${child.title} ${child.chapterTitle} ${child.body?.join(" ")}`;
      return text.toLowerCase().includes(term);
    });
  }

  return (
    <section className="module-page department-module">
      <div className="module-card">
        <div className="module-card-header">
          <strong>Fire Codes & Regulations</strong>
          <span>Inspection code lookup with the full selected code shown in the detail panel.</span>
        </div>
        <div className="code-tools">
          <label className="code-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code number, title, or wording" />
          </label>
          <div className="code-toggle" aria-label="Code browser mode">
            <button className={view === "toc" ? "active" : ""} onClick={() => setView("toc")}><ClipboardList size={16} /> TOC</button>
            <button className={view === "sections" ? "active" : ""} onClick={() => setView("sections")}><BookOpen size={16} /> Codes</button>
            <button className={view === "index" ? "active" : ""} onClick={() => setView("index")}><Search size={16} /> Index</button>
          </div>
        </div>
        <div className="code-browser">
          <div className="resource-list protocol-list code-section-list">
            {view === "toc" && filteredToc.map((part) => (
              <section className="protocol-group" key={part.part}>
                <strong>{part.part}</strong>
                {part.chapters.map((chapter) => (
                  <button key={`${part.part}-${chapter.num}`} className={codeFamilyValue(selected) === String(chapter.code || chapter.num) ? "resource-row active" : "resource-row"} onClick={() => selectChapter(chapter)}>
                    <ClipboardList size={16} />
                    <span><strong>{chapter.code} - {chapter.title}</strong><em>{chapter.pages}</em></span>
                  </button>
                ))}
              </section>
            ))}
            {view === "sections" && groupedCodes.map((group) => (
              <section className="protocol-group" key={group.title}>
                <button className="code-family-toggle" onClick={() => toggleFamily(group.key)}>
                  {expandedFamilies.has(group.key) || query.trim() ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span><strong>{group.title}</strong><em>{group.codes.length} sections</em></span>
                </button>
                {(expandedFamilies.has(group.key) || query.trim()) && group.codes.map((code) => {
                  const children = visibleChildCodes(code);
                  const hasChildren = children.length > 0;
                  const isExpanded = expandedCodes.has(code.section) || (query.trim() && hasChildren);
                  return (
                    <div className="code-tree-item" key={code.section}>
                      <div className="code-tree-main">
                        <button className={selected.section === code.section || selected.parentSection === code.section ? "resource-row active" : "resource-row"} onClick={() => selectCode(code)}>
                          <ShieldCheck size={16} />
                          <span><strong>{code.section} - {code.title}</strong><em>{hasChildren ? `${children.length} subsections` : codeFamilyLabel(code)}</em></span>
                        </button>
                        {hasChildren && (
                          <button className="code-tree-toggle" aria-label={`${isExpanded ? "Collapse" : "Expand"} section ${code.section}`} onClick={() => toggleCode(code.section)}>
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>
                        )}
                      </div>
                      {hasChildren && isExpanded && (
                        <div className="code-subsections">
                          {children.map((child) => (
                            <button key={child.section} className={selected.section === child.section ? "code-subsection-row active" : "code-subsection-row"} onClick={() => selectCode(child)}>
                              <span>{child.section}</span>
                              <strong>{child.title}</strong>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            ))}
            {view === "index" && (
              <section className="protocol-group">
                <strong>{filteredIndex.length} Index References</strong>
                {filteredIndex.map((item) => (
                  <button key={`${item.label}-${item.title}`} className={selected.section === item.label ? "resource-row active" : "resource-row"} onClick={() => selectIndex(item)}>
                    <FileText size={16} />
                    <span><strong>{item.label} - {item.title}</strong><em>Chapter {item.chapter}</em></span>
                  </button>
                ))}
              </section>
            )}
          </div>
          <article className="resource-detail code-detail">
            <span className="resource-kicker">Section {selected.section}</span>
            <h2>{selected.title}</h2>
            <p>{selected.chapterTitle}</p>
            <div className="code-meta-grid">
              <div><strong>Chapter</strong><span>{selected.chapter}</span></div>
              <div><strong>Source</strong><span>{sourceLabel(selected)}</span></div>
            </div>
            <section className="inline-sog-full inline-code-full">
              <strong>Full Code Information</strong>
              <div className="sog-full-block">
                {codeBody(selected).map((line, lineIndex) => <p key={`${selected.section}-${lineIndex}`}>{line}</p>)}
              </div>
            </section>
            <div className="resource-actions">
              <a className="primary" href={codeSourceUrl(selected)} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open Source</a>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function tabFromLocation() {
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith("/ems-forms")) return "ems";
  if (path.startsWith("/fire-forms")) return "fireForms";
  if (path.startsWith("/fire-codes")) return "fireCodes";
  if (path.startsWith("/important-numbers")) return "importantNumbers";
  if (path.startsWith("/inspection-division/codes")) return "fireCodes";
  if (path.startsWith("/inspection-division")) return "inspectionDivision";
  if (path.startsWith("/investigations")) return "investigations";
  if (path.startsWith("/hydrants/list")) return "hydrants";
  if (path.startsWith("/hydrants/flow")) return "flow";
  if (path.startsWith("/hydrants/inspections")) return "inspection";
  if (path.startsWith("/hydrants/reports")) return "reports";
  if (path.startsWith("/hydrants/sync")) return "sync";
  if (path.startsWith("/hydrants")) return "dashboard";
  return "app";
}

function AppHome({ setTab }) {
  const tools = [
    { label: "EMS", detail: "Forms, protocols, and EMS references.", action: "EMS Tools", icon: Activity, tab: "ems", tone: "red" },
    { label: "Fire", detail: "Forms, SOGs, and fire resources.", action: "Fire Tools", icon: Flame, tab: "fireForms", tone: "dark" },
    { label: "Inspection Division", detail: "Inspections, permits, and fire codes.", action: "Inspect", icon: ClipboardCheck, tab: "inspectionDivision", tone: "red" },
    { label: "Investigations", detail: "Investigation notes and contacts.", action: "Open", icon: Search, tab: "investigations", tone: "red" },
    { label: "Important Numbers", detail: "Dispatch, city support, and vendors.", action: "Call List", icon: Mail, tab: "importantNumbers", tone: "red" }
  ];
  function openTool(tool) {
    if (tool.tab) setTab(tool.tab);
  }
  return (
    <section className="command-home">
      <header className="command-hero">
        <img className="command-logo" src={logoUrl} alt="Horn Lake Fire Department" />
        <div className="command-hero-copy">
          <span>Horn Lake Fire Department</span>
          <h1>Fire Dept</h1>
          <p>Field operations, hydrants, EMS, fire, inspections, and investigations.</p>
          <div className="command-pills" aria-label="Department tool groups">
            <div><Droplets size={19} /><strong>Hydrants</strong></div>
            <div><Activity size={19} /><strong>EMS</strong></div>
            <div><Flame size={19} /><strong>Fire</strong></div>
          </div>
        </div>
      </header>
      <div className="command-tools">
        <div className="command-section-title">
          <span>Choose A Section</span>
          <strong>Department Tools</strong>
          <em>iPad Optimized</em>
        </div>
        <div className="command-card-grid">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button key={tool.label} className={`command-card command-${tool.tone}`} onClick={() => openTool(tool)}>
                <span className="corner-fold" aria-hidden="true" />
                <span className="command-icon" aria-hidden="true"><Icon size={30} /></span>
                <div>
                  <strong>{tool.label}</strong>
                  <span>{tool.detail}</span>
                </div>
                <b aria-hidden="true">&gt;</b>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ImportantNumbersPage() {
  return (
    <section className="module-page department-module">
      <div className="module-card">
        <div className="module-card-header">
          <strong>Important Numbers</strong>
          <span>Tap a number to call city support, vendors, dispatch, and department resources.</span>
        </div>
        <div className="important-number-page">
          {importantNumbers.map((contact) => (
            <section key={contact.name} className="important-number-card">
              <strong>{contact.name}</strong>
              <div>
                {contact.numbers.map((number) => (
                  <a key={`${contact.name}-${number.label}`} href={phoneHref(number.value)}>
                    <em>{number.label}</em>
                    <span>{number.value}</span>
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

function FireQuickTabs({ active = "", setTab, setFireFormsView }) {
  const tabs = [
    ["forms", "Forms", FileText],
    ["sogs", "SOGs", ShieldCheck],
    ["plans", "Pre-Fire Plans", ClipboardList],
    ["hydrants", "Hydrants", Droplets],
    ["hose", "Hose Testing", Gauge]
  ];

  function choose(id) {
    if (id === "hydrants") {
      setTab("dashboard");
      return;
    }
    setFireFormsView(id);
    setTab("fireForms");
  }

  return (
    <nav className="fire-quick-tabs" aria-label="Fire tools">
      {tabs.map(([id, label, Icon]) => (
        <button key={id} className={active === id ? "active" : ""} onClick={() => choose(id)}>
          <Icon size={16} /> {label}
        </button>
      ))}
    </nav>
  );
}

export default function HydrantTestingPage() {
  const [hydrants, setHydrants] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detailHydrant, setDetailHydrant] = useState(null);
  const [editorHydrant, setEditorHydrant] = useState(null);
  const [tab, setTab] = useState(tabFromLocation);
  const [fireFormsView, setFireFormsView] = useState("forms");
  const [theme, setTheme] = useState("dark");
  const [toast, setToast] = useState("");
  const [crew, setCrew] = useState(newBlankCrew);
  const [draftCrew, setDraftCrew] = useState(newBlankCrew);
  async function load() {
    try {
      const baseHydrants = await staticHydrants();
      const cloudHydrants = await loadFirebaseCollection("hydrants", []);
      setHydrants(applyLocalHydrants(cloudHydrants.reduce((list, hydrant) => updateList(list, hydrant), baseHydrants)));
    } catch {
      try {
        const res = await fetch("/api/hydrants");
        if (!res.ok) throw new Error(`Hydrant API returned ${res.status}`);
        const data = await res.json();
        setHydrants(applyLocalHydrants(data.hydrants || []));
      } catch {
        try {
          setHydrants(applyLocalHydrants(await staticHydrants()));
        } catch {
          setHydrants([]);
        }
      }
    }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const stored = window.localStorage.getItem(themeStorageKey);
    if (stored === "light" || stored === "dark") setTheme(stored);
  }, []);
  useEffect(() => {
    const loaded = loadCrewSession();
    setCrew(loaded);
    setDraftCrew({ tested_by: loaded.tested_by, shift: loaded.shift, date: loaded.date || today(), district: loaded.district || "All Districts", expires_at: loaded.expires_at });
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      setCrew((current) => {
        if (!current.expires_at || Date.now() < Number(current.expires_at)) return current;
        window.localStorage.removeItem(crewStorageKey);
        const blank = newBlankCrew();
        setDraftCrew(blank);
        setToast("Shift session expired");
        return blank;
      });
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);
  function setCrewSession() {
    if (!draftCrew.tested_by || !draftCrew.shift) {
      setToast("Shift session must be set to continue");
      return;
    }
    const next = { ...draftCrew, date: draftCrew.date || today(), expires_at: String(Date.now() + crewSessionHours * 60 * 60 * 1000) };
    window.localStorage.setItem(crewStorageKey, JSON.stringify(next));
    setCrew(next);
    setDraftCrew(next);
    setToast("Shift session set for 8 hours");
  }
  function clearCrewSession() {
    window.localStorage.removeItem(crewStorageKey);
    const blank = newBlankCrew();
    setCrew(blank);
    setDraftCrew(blank);
    setToast("Shift session reset");
  }
  function saved(hydrant, msg) {
    saveLocalHydrant(hydrant);
    saveFirebaseRecord("hydrants", firebaseDocId(hydrant.location_id, hydrant.hydrant_id), { ...hydrant, updated_at: hydrant.updated_at || new Date().toISOString() }).catch(() => {});
    setHydrants((list) => updateList(list, hydrant));
    setSelected(hydrant);
    setDetailHydrant(null);
    setEditorHydrant(null);
    setToast(msg);
  }
  function chooseHydrant(hydrant) {
    setSelected(hydrant);
    setDetailHydrant(hydrant);
  }
  const hydrantTabs = [
    ["dashboard", "Hydrants", Home],
    ["hydrants", "Hydrant List", Droplets],
    ["flow", "Flow Test", Gauge],
    ["inspection", "Inspections", ClipboardCheck],
    ["reports", "Reports", FileText],
    ["sync", "Sync / Import", UploadCloud]
  ];
  const sessionReady = hasActiveShiftSession(crew);
  if (tab === "app") {
    return (
      <main className={`command-app-root ${theme === "light" ? "light-theme" : ""}`}>
        <datalist id="tested-by-options">{crewUserOptions.map((name) => <option key={name} value={name} />)}</datalist>
        {toast && <div className="toast"><CheckCircle2 size={16} /> {toast}</div>}
        <AppHome setTab={setTab} />
      </main>
    );
  }
  return (
    <main className={`app-shell ${theme === "light" ? "light-theme" : ""}`}>
      <datalist id="tested-by-options">{crewUserOptions.map((name) => <option key={name} value={name} />)}</datalist>
      <aside className="side-nav">
        <div className="brand-mark"><img src={logoUrl} alt="Horn Lake Fire Department" /><strong>HYDRANT<br />TESTING</strong></div>
        <nav>
          <button className={tab === "app" ? "active" : ""} onClick={() => setTab("app")}><Home size={16} /> Home</button>
          <button className={tab === "ems" ? "active" : ""} onClick={() => setTab("ems")}><Activity size={16} /> EMS</button>
          <button className={tab === "fireForms" ? "active" : ""} onClick={() => setTab("fireForms")}><Flame size={16} /> Fire</button>
          <button className={tab === "inspectionDivision" ? "active" : ""} onClick={() => setTab("inspectionDivision")}><ClipboardCheck size={16} /> Inspection Division</button>
          <button className={tab === "investigations" ? "active" : ""} onClick={() => setTab("investigations")}><Search size={16} /> Investigations</button>
          <button className={tab === "importantNumbers" ? "active" : ""} onClick={() => setTab("importantNumbers")}><Mail size={16} /> Important Numbers</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings size={16} /> Settings</button>
        </nav>
        <div className="side-user"><span>HLFD</span><div><strong>{crew.tested_by || "Field User"}</strong><em>{crew.shift || "No Shift Set"}</em></div></div>
      </aside>
      <section className="main-stage">
        <nav className="ipad-tabs">
          <button className={tab === "app" ? "active" : ""} onClick={() => setTab("app")}><Home size={16} /> Home</button>
          <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}><Home size={16} /> Hydrants</button>
          <button className={tab === "ems" ? "active" : ""} onClick={() => setTab("ems")}><Activity size={16} /> EMS</button>
          <button className={tab === "fireForms" ? "active" : ""} onClick={() => setTab("fireForms")}><Flame size={16} /> Fire</button>
          <button className={tab === "inspectionDivision" ? "active" : ""} onClick={() => setTab("inspectionDivision")}><ClipboardCheck size={16} /> Inspect</button>
          <button className={tab === "investigations" ? "active" : ""} onClick={() => setTab("investigations")}><Search size={16} /> Investigations</button>
          <button className={tab === "importantNumbers" ? "active" : ""} onClick={() => setTab("importantNumbers")}><Mail size={16} /> Numbers</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings size={16} /> Settings</button>
        </nav>
        {toast && <div className="toast"><CheckCircle2 size={16} /> {toast}</div>}
        {hydrantTabs.some(([id]) => id === tab) && (
          <>
            <FireQuickTabs active="hydrants" setTab={setTab} setFireFormsView={setFireFormsView} />
            <nav className="hydrant-work-tabs" aria-label="Hydrant tools">
              {hydrantTabs.map(([id, label, Icon]) => (
                <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon size={16} /> {label}</button>
              ))}
            </nav>
          </>
        )}
        <section className="page-body">{tab === "dashboard" && <Dashboard hydrants={hydrants} selected={selected} onSelect={chooseHydrant} crew={crew} draftCrew={draftCrew} setDraftCrew={setDraftCrew} setCrewSession={setCrewSession} clearCrewSession={clearCrewSession} />}{tab === "hydrants" && <HydrantsPage hydrants={hydrants} selected={selected} onSelect={chooseHydrant} />}{tab === "inspection" && <Inspection selected={selected} crew={crew} onSaved={saved} onClose={() => setTab("dashboard")} />}{tab === "flow" && <FlowTest selected={selected} crew={crew} onSaved={saved} onClose={() => setTab("dashboard")} />}{tab === "ems" && <EmsProtocolsPage />}{tab === "fireForms" && <FireFormsPage requestedView={fireFormsView} setTab={setTab} setFireFormsView={setFireFormsView} />}{tab === "inspectionDivision" && <InspectionDivisionPage setTab={setTab} />}{tab === "investigations" && <InvestigationsPage />}{tab === "importantNumbers" && <ImportantNumbersPage />}{tab === "fireCodes" && <FireCodesPage />}{tab === "reports" && <Reports crew={crew} />}{tab === "sync" && <SyncImportPage />}{tab === "settings" && <SettingsPage theme={theme} setTheme={setTheme} />}</section>
      </section>
      {detailHydrant && <HydrantInfoModal hydrant={detailHydrant} sessionReady={sessionReady} onClose={() => setDetailHydrant(null)} onInspection={() => { if (!sessionReady) return; setSelected(detailHydrant); setDetailHydrant(null); setTab("inspection"); }} onFlowTest={() => { if (!sessionReady) return; setSelected(detailHydrant); setDetailHydrant(null); setTab("flow"); }} onEdit={() => { if (!sessionReady) return; setEditorHydrant(detailHydrant); setDetailHydrant(null); }} />}
      {editorHydrant && <HydrantEditorModal hydrant={editorHydrant} crew={crew} onClose={() => setEditorHydrant(null)} onSaved={saved} />}
    </main>
  );
}

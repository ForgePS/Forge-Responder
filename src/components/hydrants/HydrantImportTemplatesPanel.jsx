import { Download } from "lucide-react";
import { buildHydrantActivityImportTemplateCsv, HYDRANT_ACTIVITY_TEMPLATE_HEADERS } from "../../lib/hydrantActivityImport.js";
import { buildHydrantImportTemplateCsv, HYDRANT_IMPORT_TEMPLATE_HEADERS } from "../../lib/hydrantImport.js";
import { downloadTextFile } from "../../lib/downloadTextFile.js";

const ACTIVITY_SAMPLE_ROWS = [
  ["Flow Test", "HL 1000", "31467975", "1", "2026-06-15", "08:30", "Jeremy Powell", "A Shift", "In Service", "2.5", "29", "82", "61", "1628", "B", "Class AA", "Annual flow test", ""],
  ["Inspection", "HL 1000", "31467975", "1", "2026-06-15", "09:15", "Jeremy Powell", "A Shift", "In Service", "", "", "", "", "", "", "", "Caps present; no leaks", "No"],
];

function TemplateTable({ headers, rows }) {
  return (
    <div className="hydrant-import-table-wrap hydrant-template-table-wrap">
      <table className="hydrant-import-table hydrant-template-table">
        <thead>
          <tr>
            {headers.map((header) => <th key={header}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${index}-${row[0]}`}>
              {headers.map((header, headerIndex) => (
                <td key={`${header}-${headerIndex}`}>{row[headerIndex] || "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HydrantImportTemplatesPanel() {
  return (
    <section className="sync-page module-page hydrant-template-panel">
      <div className="module-card hydrant-import-card">
        <div className="module-card-header">
          <strong>Download Import Templates</strong>
          <span>Fill in these CSV templates, then upload them below. Sample rows are shown so you can match the format.</span>
        </div>

        <div className="hydrant-template-grid">
          <article className="hydrant-template-card">
            <div className="hydrant-template-card-head">
              <div>
                <strong>Flow Tests &amp; Inspections</strong>
                <span>Bulk upload testing history and update hydrant status.</span>
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => downloadTextFile("hydrant-activity-import-template.csv", buildHydrantActivityImportTemplateCsv())}
              >
                <Download size={16} /> Download Activity CSV
              </button>
            </div>
            <TemplateTable headers={HYDRANT_ACTIVITY_TEMPLATE_HEADERS} rows={ACTIVITY_SAMPLE_ROWS} />
          </article>

          <article className="hydrant-template-card">
            <div className="hydrant-template-card-head">
              <div>
                <strong>Hydrant Inventory Updates</strong>
                <span>Merge hydrant details like address, flow class, and last checked date.</span>
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => downloadTextFile("hydrants-import-template.csv", buildHydrantImportTemplateCsv())}
              >
                <Download size={16} /> Download Hydrant CSV
              </button>
            </div>
            <TemplateTable
              headers={HYDRANT_IMPORT_TEMPLATE_HEADERS.slice(0, 8)}
              rows={[["HL 1000", "HL 1000", "31467975", "1", "6786 Chase CV", "6786 Chase CV", "34.96047", "-90.04863"]]}
            />
            <p className="hydrant-import-more">Hydrant CSV includes all inventory columns; this preview shows the first eight.</p>
          </article>
        </div>
      </div>
    </section>
  );
}

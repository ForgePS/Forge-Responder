import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Pencil, Trash2 } from "lucide-react";
import { EMPTY_PERSONNEL_FILTERS, exportPersonnelCsv, filterPersonnelRecords } from "../lib/personnelFilters.js";
import { getPersonDisplayName } from "../lib/personnelSchema.js";
import { FilterField } from "./personnel/PersonnelFieldControls.jsx";

const PAGE_SIZES = [20, 50, "all"];

function toneFromStatus(value) {
  const text = String(value).toLowerCase();
  if (/active/.test(text)) return "success";
  if (/leave|resigned/.test(text)) return "warning";
  if (/terminated|inactive/.test(text)) return "critical";
  return "neutral";
}

function Badge({ children }) {
  return <span className={`badge badge-${toneFromStatus(children)}`}>{children}</span>;
}

export default function PersonnelListView({
  records = [],
  globalQuery = "",
  canEditProfile = false,
  onOpenPerson,
  onAddPerson,
  onDeletePerson,
}) {
  const [filters, setFilters] = useState(EMPTY_PERSONNEL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_PERSONNEL_FILTERS);
  const [selectedIds, setSelectedIds] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filtered = useMemo(
    () => filterPersonnelRecords(records, appliedFilters, globalQuery),
    [records, appliedFilters, globalQuery]
  );

  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = pageSize === "all"
    ? filtered
    : filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const allVisibleSelected = paged.length > 0 && paged.every((person) => selectedIds.includes(person.id));

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setAppliedFilters(filters);
    setPage(1);
  }

  function resetFilters() {
    setFilters(EMPTY_PERSONNEL_FILTERS);
    setAppliedFilters(EMPTY_PERSONNEL_FILTERS);
    setPage(1);
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !paged.some((person) => person.id === id)));
      return;
    }
    setSelectedIds((current) => [...new Set([...current, ...paged.map((person) => person.id)])]);
  }

  function toggleSelect(id) {
    setSelectedIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  }

  function handleBulkDelete() {
    if (!selectedIds.length || !onDeletePerson) return;
    if (!window.confirm(`Delete ${selectedIds.length} personnel record(s)?`)) return;
    selectedIds.forEach((id) => onDeletePerson(id));
    setSelectedIds([]);
  }

  function handleExport() {
    const blob = new Blob([exportPersonnelCsv(filtered)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "personnel-list.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const rangeStart = filtered.length ? (pageSize === "all" ? 1 : (currentPage - 1) * pageSize + 1) : 0;
  const rangeEnd = pageSize === "all" ? filtered.length : Math.min(currentPage * pageSize, filtered.length);

  return (
    <div className="personnel-firstdue-list">
      <nav className="personnel-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="personnel-breadcrumb-link">Personnel</button>
        <span>/</span>
        <strong>Personnel List</strong>
      </nav>

      <section className="personnel-filter-card panel">
        <div className="personnel-filter-grid">
          <FilterField label="First Name" value={filters.firstName} onChange={(value) => updateFilter("firstName", value)} />
          <FilterField label="Last Name" value={filters.lastName} onChange={(value) => updateFilter("lastName", value)} />
          <FilterField label="Email" value={filters.email} onChange={(value) => updateFilter("email", value)} />
          <FilterField label="Phone" value={filters.phone} onChange={(value) => updateFilter("phone", value)} />
          <FilterField label="Precinct" value={filters.district} dropdownId="personnelDistricts" onChange={(value) => updateFilter("district", value)} />
          <FilterField label="Rank" value={filters.rank} dropdownId="ranks" onChange={(value) => updateFilter("rank", value)} />
          <FilterField label="Shift" value={filters.shift} dropdownId="shifts" onChange={(value) => updateFilter("shift", value)} />
          <FilterField label="Unit" value={filters.unit} dropdownId="apparatusUnits" onChange={(value) => updateFilter("unit", value)} />
          <FilterField label="Status" value={filters.status} dropdownId="employmentStatus" onChange={(value) => updateFilter("status", value)} />
          <FilterField label="System User" value={filters.systemUser} dropdownId="yesNoOptions" onChange={(value) => updateFilter("systemUser", value)} />
          <FilterField label="Training Instructor" value={filters.trainingInstructor} dropdownId="yesNoOptions" onChange={(value) => updateFilter("trainingInstructor", value)} />
        </div>
        <div className="personnel-filter-actions">
          <button type="button" className="primary-button" onClick={applyFilters}>Apply</button>
          <button type="button" className="secondary-button" onClick={resetFilters}>Reset</button>
        </div>
      </section>

      <section className="personnel-table-card panel">
        <div className="personnel-table-toolbar">
          <div className="personnel-table-toolbar-left">
            <button type="button" className="icon-button" disabled={!selectedIds.length || !canEditProfile} onClick={handleBulkDelete} title="Delete selected">
              <Trash2 size={16} />
            </button>
            {canEditProfile && <button type="button" className="primary-button" onClick={onAddPerson}>Add New Personnel</button>}
          </div>
          <div className="personnel-table-toolbar-right">
            <label className="personnel-show-options">
              <span>Show:</span>
              <select defaultValue="default">
                <option value="default">Options</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <button type="button" className="secondary-button personnel-export-button" onClick={handleExport}>
              <Download size={14} />
            </button>
          </div>
        </div>

        <div className="data-table-wrap personnel-data-table">
          <table>
            <thead>
              <tr>
                <th className="personnel-check-col">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="Select all" />
                </th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>IAFF Local number</th>
                <th>Status</th>
                <th className="personnel-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((person) => (
                <tr key={person.id}>
                  <td><input type="checkbox" checked={selectedIds.includes(person.id)} onChange={() => toggleSelect(person.id)} aria-label={`Select ${getPersonDisplayName(person)}`} /></td>
                  <td><button type="button" className="link-button" onClick={() => onOpenPerson(person.id)}>{getPersonDisplayName(person)}</button></td>
                  <td>{person.email || "—"}</td>
                  <td>{person.phone || "—"}</td>
                  <td>{person.iaffLocalNumber || "—"}</td>
                  <td><Badge>{person.status || "—"}</Badge></td>
                  <td className="personnel-row-actions">
                    <button type="button" className="icon-button" onClick={() => onOpenPerson(person.id, { edit: true })} title="Edit"><Pencil size={15} /></button>
                    {canEditProfile && (
                      <button type="button" className="icon-button" onClick={() => { if (window.confirm(`Delete ${getPersonDisplayName(person)}?`)) onDeletePerson?.(person.id); }} title="Delete"><Trash2 size={15} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!paged.length && <div className="empty-table">No personnel records match the current filters.</div>}
        </div>

        <footer className="personnel-table-footer">
          <div className="personnel-pagination">
            <button type="button" className="icon-button" disabled={currentPage <= 1 || pageSize === "all"} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 4).map((pageNumber) => (
              <button key={pageNumber} type="button" className={pageNumber === currentPage ? "page-button active" : "page-button"} onClick={() => setPage(pageNumber)}>{pageNumber}</button>
            ))}
            {totalPages > 4 && <span className="personnel-page-ellipsis">…</span>}
            <button type="button" className="icon-button" disabled={currentPage >= totalPages || pageSize === "all"} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="personnel-page-size">
            <span>Show:</span>
            {PAGE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={pageSize === size ? "page-size-button active" : "page-size-button"}
                onClick={() => { setPageSize(size); setPage(1); }}
              >
                {size === "all" ? "All" : size}
              </button>
            ))}
            <span className="personnel-page-count">{rangeStart}-{rangeEnd} of {filtered.length}</span>
          </div>
        </footer>
      </section>
    </div>
  );
}

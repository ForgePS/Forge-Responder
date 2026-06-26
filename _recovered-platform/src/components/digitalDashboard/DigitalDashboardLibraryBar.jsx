import { CirclePlus, Search } from "lucide-react";

export default function DigitalDashboardLibraryBar({
  title,
  count = 0,
  search = "",
  onSearchChange,
  searchPlaceholder = "Search library…",
  filters = [],
  addLabel,
  onAdd,
  canEdit = false,
}) {
  return (
    <div className="dd-library-bar">
      <div className="dd-library-bar-top">
        <div className="dd-library-bar-title">
          <h3>{title}</h3>
          <span className="dd-library-count">{count} total</span>
        </div>
        {canEdit && addLabel && onAdd ? (
          <button type="button" className="dd-action-button primary" onClick={onAdd}>
            <CirclePlus size={16} />
            {addLabel}
          </button>
        ) : null}
      </div>
      <div className="dd-library-bar-filters">
        <label className="dd-library-search">
          <Search size={16} />
          <input
            type="search"
            value={search}
            placeholder={searchPlaceholder}
            onChange={(event) => onSearchChange?.(event.target.value)}
          />
        </label>
        {filters.map((filter) => (
          <label key={filter.id} className="dd-library-filter">
            <span>{filter.label}</span>
            <select value={filter.value} onChange={(event) => filter.onChange?.(event.target.value)}>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

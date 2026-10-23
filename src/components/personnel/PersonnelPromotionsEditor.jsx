import { CirclePlus, Trash2 } from "lucide-react";
import AdminTextInput from "../AdminTextInput.jsx";
import ManagedSelect from "../ManagedSelect.jsx";
import {
  formatPersonnelDateForDisplay,
  formatPersonnelDateForInput,
} from "../../lib/personnelDates.js";
import { MiniTable } from "./PersonnelFieldControls.jsx";

function normalizePromotions(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => ({
    id: item.id || `promotion-${index + 1}`,
    rank: item.rank || "",
    promotionDate: item.promotionDate || item.date || "",
    notes: item.notes || "",
  }));
}

function createPromotionId() {
  return `promotion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortPromotions(items = []) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.promotionDate);
    const bTime = Date.parse(b.promotionDate);
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }
    return String(a.promotionDate).localeCompare(String(b.promotionDate));
  });
}

export default function PersonnelPromotionsEditor({
  value = [],
  editing = false,
  onChange,
}) {
  const promotions = sortPromotions(normalizePromotions(value));

  if (!editing) {
    const rows = promotions.map((item) => [
      item.rank || "—",
      formatPersonnelDateForDisplay(item.promotionDate),
      item.notes || "—",
    ]);

    return (
      <MiniTable
        columns={["Promotion", "Date of Promotion", "Notes"]}
        rows={rows}
        emptyMessage="No promotions recorded for this member."
      />
    );
  }

  function updatePromotion(index, patch) {
    onChange(normalizePromotions(value).map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  }

  function addPromotion() {
    onChange([
      ...normalizePromotions(value),
      {
        id: createPromotionId(),
        rank: "",
        promotionDate: "",
        notes: "",
      },
    ]);
  }

  function removePromotion(index) {
    onChange(normalizePromotions(value).filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="personnel-promotions-editor">
      {!promotions.length ? (
        <p className="auth-help">No promotions yet. Add one to record rank changes.</p>
      ) : (
        <div className="personnel-promotions-list">
          {promotions.map((promotion, index) => (
            <div className="personnel-promotion-row" key={promotion.id || `promotion-row-${index}`}>
              <div className="admin-field">
                <span>Promotion</span>
                <ManagedSelect
                  dropdownId="ranks"
                  value={promotion.rank}
                  onChange={(nextValue) => updatePromotion(index, { rank: nextValue })}
                />
              </div>
              <div className="admin-field">
                <span>Date of Promotion</span>
                <AdminTextInput
                  type="date"
                  value={formatPersonnelDateForInput(promotion.promotionDate)}
                  onChange={(nextValue) => updatePromotion(index, { promotionDate: nextValue })}
                />
              </div>
              <div className="admin-field">
                <span>Notes</span>
                <AdminTextInput
                  value={promotion.notes}
                  onChange={(nextValue) => updatePromotion(index, { notes: nextValue })}
                />
              </div>
              <button className="row-action danger" type="button" onClick={() => removePromotion(index)} aria-label="Remove promotion">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button className="text-button personnel-promotions-add" type="button" onClick={addPromotion}>
        <CirclePlus size={14} /> Add promotion
      </button>
    </div>
  );
}

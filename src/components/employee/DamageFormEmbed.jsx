import { ExternalLink } from "lucide-react";
import { buildJotformEmbedUrl } from "../../lib/damageFormService.js";

export default function DamageFormEmbed({
  formUrl = "",
  formTitle = "Damage Form",
}) {
  const embedUrl = buildJotformEmbedUrl(formUrl);
  if (!embedUrl) return null;

  return (
    <div className="damage-form-embed">
      <p className="auth-help">
        Complete the damage form below. When submitted, it appears on the Command Dashboard for command staff.
      </p>
      <iframe
        className="damage-form-embed-frame"
        src={embedUrl}
        title={formTitle}
        allowFullScreen
      />
      <div className="damage-form-embed-actions">
        <button
          type="button"
          className="text-button"
          onClick={() => window.open(embedUrl, "_blank", "noopener,noreferrer")?.focus?.()}
        >
          <ExternalLink size={14} />
          Open form in new tab
        </button>
      </div>
    </div>
  );
}

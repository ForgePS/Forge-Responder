import { Sparkles } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import { openForgeAi } from "../../lib/forgeAi/launch.js";

/**
 * "Ask Forge AI" entry point for other pages. Shown only to members who may
 * use Forge AI; the server still checks everything when the question is sent.
 * If Forge AI is off or unavailable, the Forge AI page says so - the page this
 * button sits on is never affected.
 */
export default function ForgeAiLaunchButton({ capability = "", prompt = "", context, label = "Ask Forge AI", className = "secondary-button", title, view = "assistant" }) {
  const { permissions, isCreator } = useAuth();
  const allowed = view === "admin"
    ? permissions?.manageForgeAi === true || permissions?.viewForgeAiUsage === true
    : permissions?.useForgeAi === true;
  if (!isCreator && !allowed) return null;
  return (
    <button
      type="button"
      className={`${className} forge-ai-launch`}
      title={title || prompt || "Open Forge AI"}
      onClick={() => openForgeAi({ capability, prompt, context, view })}
    >
      <Sparkles size={15} aria-hidden /> {label}
    </button>
  );
}

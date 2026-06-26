import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext.jsx";

export default function ThemeToggle({ className = "", compact = false }) {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className={`theme-toggle ${compact ? "theme-toggle-compact" : ""} ${className}`.trim()}
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      aria-pressed={isDark}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      {!compact && <span>{isDark ? "Light" : "Dark"}</span>}
    </button>
  );
}

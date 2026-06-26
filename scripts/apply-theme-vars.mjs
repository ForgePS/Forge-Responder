import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stylesPath = path.join(__dirname, "../src/styles.css");
let css = fs.readFileSync(stylesPath, "utf8");

const replacements = [
  ["#071523", "var(--rms-bg-body)"],
  ["#071624", "var(--rms-bg-footer)"],
  ["#071421", "var(--rms-bg-input)"],
  ["#071827", "var(--rms-bg-surface-3)"],
  ["#071019", "var(--rms-bg-base)"],
  ["#081a29", "var(--rms-bg-surface-2)"],
  ["#0d2538", "var(--rms-bg-surface-3)"],
  ["#0a1d2e", "var(--rms-bg-kpi-b)"],
  ["#0e2538", "var(--rms-bg-kpi-a)"],
  ["#10283c", "var(--rms-bg-hover)"],
  ["#102d43", "var(--rms-bg-hover-2)"],
  ["#0f2438", "var(--rms-table-head)"],
  ["#365269", "var(--rms-border)"],
  ["#29465c", "var(--rms-border-subtle)"],
  ["#2c465a", "var(--rms-border-divider)"],
  ["#94a3b8", "var(--rms-text-muted)"],
  ["#64748b", "var(--rms-text-subtle)"],
  ["#8fa4b8", "var(--rms-text-muted)"],
  ["#a7b9ca", "var(--rms-icon)"],
  ["#cbd5e1", "var(--rms-text-body)"],
  ["#d1dbe5", "var(--rms-text-body)"],
  ["#f8fafc", "var(--rms-text-strong)"],
  ["#1762cb", "var(--rms-primary-solid)"],
  ["#6aa4ff", "var(--rms-text-link)"],
  ["#4f91ff", "var(--rms-text-link)"],
  ["#60a5fa", "var(--rms-accent)"],
  ["#f97316", "var(--rms-brand)"],
  ["rgba(10,29,46,.84)", "var(--rms-bg-panel)"],
  ["rgba(10,29,46,.94)", "var(--rms-bg-auth)"],
  ["rgba(10,29,46,.92)", "var(--rms-bg-auth)"],
  ["rgba(10,29,46,.55)", "var(--rms-bg-panel)"],
  ["rgba(10,29,46,.72)", "var(--rms-bg-panel)"],
  ["rgba(10,29,46,.75)", "var(--rms-bg-panel)"],
  ["rgba(11,31,49,.86)", "var(--rms-bg-panel-header)"],
  ["rgba(7,22,36,.96)", "var(--rms-bg-nav)"],
  ["rgba(7,22,36,.97)", "var(--rms-bg-topbar)"],
  ["rgba(7,20,33,.55)", "var(--rms-bg-panel)"],
  ["rgba(7,20,33,.72)", "var(--rms-bg-panel)"],
  ["rgba(7,20,33,.75)", "var(--rms-bg-panel)"],
  ["rgba(7,20,33,.85)", "var(--rms-bg-panel)"],
  ["rgba(54,82,105,.68)", "var(--rms-border-alpha)"],
  ["rgba(54,82,105,.75)", "var(--rms-border-alpha)"],
];

for (const [from, to] of replacements) {
  css = css.split(from).join(to);
}

css = css.replace(/color:\s*#fff\b/g, "color: var(--rms-text-strong)");
css = css.replace(/background:\s*#fff\b/g, "background: var(--rms-bg-surface)");

css = css.replace(
  ":root { font-family: Inter, \"Segoe UI\", Arial, sans-serif; color: var(--rms-text-strong); background: var(--rms-bg-body); font-synthesis: none; }",
  ":root { font-family: var(--rms-font-display); font-synthesis: none; }"
);

fs.writeFileSync(stylesPath, css);
console.log("Applied theme variables to styles.css");

/**
 * SVG rendering of a fire service symbol: shape + text glyph, so the meaning
 * never depends on color alone. Draws centred on (0, 0) at `size`.
 */
export function SymbolShape({ symbol, size = 28, selected = false, muted = false }) {
  const r = size / 2;
  const fill = symbol.color || "#616161";
  const stroke = selected ? "#ffd54f" : "#ffffff";
  const strokeWidth = selected ? 3 : 1.5;
  const common = { fill, stroke, strokeWidth, opacity: muted ? 0.45 : 1 };
  let shape;
  switch (symbol.shape) {
    case "square":
      shape = <rect x={-r} y={-r} width={size} height={size} rx={3} {...common} />;
      break;
    case "triangle":
      shape = <polygon points={`0,${-r} ${r},${r} ${-r},${r}`} {...common} />;
      break;
    case "diamond":
      shape = <polygon points={`0,${-r} ${r},0 0,${r} ${-r},0`} {...common} />;
      break;
    case "hexagon": {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i;
        return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
      }).join(" ");
      shape = <polygon points={pts} {...common} />;
      break;
    }
    case "pentagon": {
      const pts = Array.from({ length: 5 }, (_, i) => {
        const a = (2 * Math.PI / 5) * i - Math.PI / 2;
        return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
      }).join(" ");
      shape = <polygon points={pts} {...common} />;
      break;
    }
    default:
      shape = <circle r={r} {...common} />;
  }
  const glyph = String(symbol.glyph || "?");
  const fontSize = glyph.length >= 4 ? size * 0.28 : glyph.length === 3 ? size * 0.33 : size * 0.42;
  return (
    <g>
      {shape}
      <text
        y={symbol.shape === "triangle" ? r * 0.35 : 0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight="800"
        fill="#ffffff"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {glyph}
      </text>
    </g>
  );
}

/** Small standalone icon for palettes and legends. */
export default function SymbolGlyph({ symbol, size = 26, title }) {
  return (
    <svg width={size + 4} height={size + 4} viewBox={`${-(size / 2 + 2)} ${-(size / 2 + 2)} ${size + 4} ${size + 4}`} role="img" aria-label={title || symbol.label}>
      <title>{title || symbol.label}</title>
      <SymbolShape symbol={symbol} size={size} />
    </svg>
  );
}

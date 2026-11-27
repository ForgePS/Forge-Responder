import { useRef } from "react";

/**
 * Lightweight read-only drawing of floor plan objects (floor coordinates).
 * Used to pick alignment points and to preview SmartPlan proposals.
 *
 * @param {{objects:object[], width:number, height:number, backgroundUrl?:string,
 *   background?:object, points?:{floor:[number,number]}[], onPick?:(pt:[number,number])=>void,
 *   label?:string, highlightPending?:boolean}} props
 */
export default function PlanPreview({
  objects = [], width, height, backgroundUrl = "", background = null, points = [], onPick, label = "Floor plan", highlightPending = false,
}) {
  const svgRef = useRef(null);
  const r = Math.max(width, height) / 90;

  function click(event) {
    if (!onPick) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const local = pt.matrixTransform(svg.getScreenCTM().inverse());
    onPick([Math.round(local.x * 10) / 10, Math.round(local.y * 10) / 10]);
  }

  const strokeFor = (object) => {
    if (highlightPending && object.verificationStatus === "pending") return "var(--fpe-pending)";
    if (object.verificationStatus === "rejected") return "#9ca3af";
    return object.geometry.kind === "polygon" ? "var(--fpe-room-stroke)" : "var(--fpe-wall)";
  };

  return (
    <svg ref={svgRef} className={`spm-pick${onPick ? " is-pickable" : ""}`} viewBox={`0 0 ${width} ${height}`} onClick={click} role="img" aria-label={label}>
      <rect x="0" y="0" width={width} height={height} fill="var(--fpe-canvas-bg)" />
      {backgroundUrl ? (
        <image href={backgroundUrl} x="0" y="0" width={background?.width || width} height={background?.height || height} opacity={background?.opacity ?? 0.5} />
      ) : null}
      {objects.map((object) => {
        const pts = object.geometry.points;
        const stroke = strokeFor(object);
        const dash = object.verificationStatus === "rejected" ? `${r} ${r}` : undefined;
        if (object.geometry.kind === "point") {
          return object.type === "text"
            ? <text key={object.id} x={pts[0][0]} y={pts[0][1]} fontSize={r * 1.6} fill="var(--rms-text-strong)">{object.name}</text>
            : <circle key={object.id} cx={pts[0][0]} cy={pts[0][1]} r={r * 0.7} fill="#dc2626" />;
        }
        if (object.geometry.kind === "rect") {
          const [[x1, y1], [x2, y2]] = pts;
          return <rect key={object.id} x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} fill="none" stroke={stroke} strokeWidth={r / 3} />;
        }
        const d = pts.map((p) => p.join(",")).join(" ");
        return object.geometry.kind === "polygon"
          ? <polygon key={object.id} points={d} fill="var(--fpe-room-fill)" stroke={stroke} strokeWidth={r / 4} strokeDasharray={dash} />
          : <polyline key={object.id} points={d} fill="none" stroke={stroke} strokeDasharray={dash}
            strokeWidth={object.type === "exterior_wall" ? r / 1.5 : r / 3} />;
      })}
      {points.map((row, index) => (
        <g key={index} transform={`translate(${row.floor[0]} ${row.floor[1]})`}>
          <circle r={r * 1.4} fill="#facc15" stroke="#000" strokeWidth={r / 6} />
          <text textAnchor="middle" dy={r * 0.5} fontSize={r * 1.5} fontWeight="800">{index + 1}</text>
        </g>
      ))}
    </svg>
  );
}

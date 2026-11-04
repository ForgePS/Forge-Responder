import { ChevronRight, ExternalLink } from "lucide-react";
import { useField } from "../fieldContext.jsx";
import { useQuickCards } from "../quickCards.jsx";
import { Screen } from "../ui.jsx";

/** One tool on a category screen: opens a screen, an outside site, or is "Coming soon". */
function ToolCard({ icon, title, detail, onClick, href, soon = false, tone }) {
  const body = (
    <>
      <span className="fa-tile-icon">{icon}</span>
      <span className="fa-tile-text">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {soon
        ? <span className="fa-qc-soon">Coming soon</span>
        : href ? <ExternalLink size={20} className="fa-tile-chev" aria-hidden="true" /> : <ChevronRight size={22} className="fa-tile-chev" aria-hidden="true" />}
    </>
  );
  const className = `fa-tile fa-tool tone-${tone}${soon ? " is-soon" : ""}`;
  if (soon) return <div className={className} aria-disabled="true">{body}</div>;
  if (href) return <a className={className} href={href} target="_blank" rel="noreferrer">{body}</a>;
  return <button type="button" className={className} onClick={onClick}>{body}</button>;
}

/** The tools in one quick card (Fire, EMS, …). */
export default function QuickCardScreen({ params = {} }) {
  const { back } = useField();
  const card = useQuickCards().find((row) => row.key === params.card);
  if (!card) {
    return <Screen title="Not available" onBack={back}><p className="fa-empty">This card isn't available.</p></Screen>;
  }
  return (
    <Screen title={card.title} onBack={back} wide>
      <div className="fa-tiles">
        {card.items.map((item) => <ToolCard key={item.key} tone={card.tone} {...item} />)}
      </div>
    </Screen>
  );
}

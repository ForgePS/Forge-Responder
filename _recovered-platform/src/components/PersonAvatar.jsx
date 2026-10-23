function personInitialsFromName(name = "") {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
}

export default function PersonAvatar({ person, large = false, profile = false }) {
  const className = `avatar ${large ? "large" : ""}${profile ? " profile" : ""}${person?.photoUrl ? " avatar-photo" : ""}`;
  if (person?.photoUrl) {
    return <img className={className} src={person.photoUrl} alt={person?.name || "Personnel photo"} />;
  }
  return <span className={className}>{person?.initials || personInitialsFromName(person?.name)}</span>;
}

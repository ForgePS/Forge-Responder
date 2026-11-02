/** Thumbnails of photos attached to a damage report; each opens full size in a new tab. */
export default function DamagePhotoGrid({ photos = [], title = "Photos" }) {
  const list = (Array.isArray(photos) ? photos : []).filter((photo) => photo && photo.url);
  if (!list.length) return null;
  return (
    <div className="damage-photos">
      <strong>{title} ({list.length})</strong>
      <ul className="damage-photo-grid">
        {list.map((photo, index) => (
          <li key={photo.url}>
            <a href={photo.url} target="_blank" rel="noreferrer" title="Open full size">
              <img src={photo.url} alt={photo.name || `Damage photo ${index + 1}`} loading="lazy" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

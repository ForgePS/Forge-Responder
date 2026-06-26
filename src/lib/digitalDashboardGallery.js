export const GALLERY_TABS = [
  { id: "stock-photos", label: "Stock Photos", enabled: true },
  { id: "profiles", label: "Profiles", enabled: false },
  { id: "posters", label: "Posters", enabled: false },
  { id: "quote", label: "Quote", enabled: false },
  { id: "flickr", label: "Flickr", enabled: false },
  { id: "smugmug", label: "SmugMug", enabled: false },
  { id: "leaderboard", label: "Leaderboard", enabled: false },
  { id: "canva", label: "Canva", enabled: false },
  { id: "adobe-express", label: "Adobe Express", enabled: false, badge: "New" },
  { id: "trivia", label: "Trivia", enabled: false },
  { id: "reviews", label: "Reviews", enabled: false },
];

export const GALLERY_PROVIDERS = [
  { value: "pixabay", label: "Pixabay" },
  { value: "pexels", label: "Pexels" },
  { value: "unsplash", label: "Unsplash" },
];

export const GALLERY_FEATURES = [
  { value: "latest", label: "Latest" },
  { value: "popular", label: "Popular" },
  { value: "editors", label: "Editor's Choice" },
];

export const GALLERY_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "backgrounds", label: "Backgrounds" },
  { value: "business", label: "Business" },
  { value: "computer", label: "Computer" },
  { value: "education", label: "Education" },
  { value: "feelings", label: "Feelings" },
  { value: "health", label: "Health" },
  { value: "industry", label: "Industry" },
  { value: "nature", label: "Nature" },
  { value: "people", label: "People" },
  { value: "places", label: "Places" },
  { value: "sports", label: "Sports" },
  { value: "transportation", label: "Transportation" },
];

export const GALLERY_IMAGE_TYPES = [
  { value: "all", label: "All" },
  { value: "photo", label: "Photo" },
  { value: "illustration", label: "Illustration" },
  { value: "vector", label: "Vector" },
];

export const GALLERY_ORIENTATIONS = [
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
  { value: "all", label: "All" },
];

export const DEFAULT_GALLERY_CONFIG = {
  tab: "stock-photos",
  mode: "auto",
  provider: "pixabay",
  feature: "latest",
  category: "all",
  imageType: "all",
  orientation: "landscape",
  searchQuery: "fire department public safety",
  refreshHours: 24,
};

export function formatNewMediaTitle(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `NewMedia_${day}-${month}-${year}-${hours}-${minutes}-${seconds}`;
}

const FALLBACK_IMAGES = [
  {
    id: "fallback-1",
    previewUrl: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1280&q=80",
    fullUrl: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=1920&q=85",
    title: "Fire station apparatus bay",
    provider: "unsplash",
  },
  {
    id: "fallback-2",
    previewUrl: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1280&q=80",
    fullUrl: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1920&q=85",
    title: "Emergency response team",
    provider: "unsplash",
  },
  {
    id: "fallback-3",
    previewUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1280&q=80",
    fullUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1920&q=85",
    title: "Training and operations",
    provider: "unsplash",
  },
  {
    id: "fallback-4",
    previewUrl: "https://images.unsplash.com/photo-1518199266791-5375a57590ae?auto=format&fit=crop&w=1280&q=80",
    fullUrl: "https://images.unsplash.com/photo-1518199266791-5375a57590ae?auto=format&fit=crop&w=1920&q=85",
    title: "Community safety",
    provider: "unsplash",
  },
  {
    id: "fallback-5",
    previewUrl: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1280&q=80",
    fullUrl: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1920&q=85",
    title: "Station lobby display",
    provider: "unsplash",
  },
  {
    id: "fallback-6",
    previewUrl: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1280&q=80",
    fullUrl: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1920&q=85",
    title: "Team briefing",
    provider: "unsplash",
  },
];

function mapPixabayHit(hit) {
  return {
    id: `pixabay-${hit.id}`,
    previewUrl: hit.previewURL || hit.webformatURL,
    fullUrl: hit.largeImageURL || hit.webformatURL,
    title: hit.tags?.split(",")[0]?.trim() || "Stock photo",
    provider: "pixabay",
    author: hit.user,
  };
}

export async function fetchGalleryStockPhotos(config = {}, apiKey = "") {
  const {
    feature = "latest",
    category = "all",
    imageType = "all",
    orientation = "landscape",
    searchQuery = "fire department",
  } = config;

  if (!apiKey) {
    return {
      images: FALLBACK_IMAGES,
      source: "fallback",
      message: "Add VITE_PIXABAY_API_KEY for live Pixabay search. Showing curated public-safety samples.",
    };
  }

  const params = new URLSearchParams({
    key: apiKey,
    q: searchQuery,
    per_page: "12",
    safesearch: "true",
  });

  if (feature === "popular") params.set("order", "popular");
  else if (feature === "editors") params.set("editors_choice", "true");
  else params.set("order", "latest");

  if (category !== "all") params.set("category", category);
  if (imageType !== "all") params.set("image_type", imageType);
  if (orientation === "landscape") params.set("orientation", "horizontal");
  if (orientation === "portrait") params.set("orientation", "vertical");

  const response = await fetch(`https://pixabay.com/api/?${params.toString()}`);
  if (!response.ok) throw new Error("Gallery provider unavailable");
  const data = await response.json();
  const images = (data.hits || []).map(mapPixabayHit);
  if (!images.length) {
    return {
      images: FALLBACK_IMAGES,
      source: "fallback",
      message: "No results for this filter. Showing curated samples.",
    };
  }
  return { images, source: "pixabay", message: "" };
}

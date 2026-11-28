import { DISCOVERY_CATEGORY_OPTIONS } from "./discovery.js";
import { isLiveDiscoveryCategorySupported } from "./liveDiscoveryCapabilities.js";

export function getSelectableDiscoveryCategories() {
  return DISCOVERY_CATEGORY_OPTIONS.filter((category) => isLiveDiscoveryCategorySupported(category.id));
}

export function toggleDiscoveryCategory(current, categoryId, checked) {
  const selected = Array.isArray(current) ? current : [];
  if (!isLiveDiscoveryCategorySupported(categoryId)) return selected;
  if (!checked) return selected.filter((id) => id !== categoryId);
  return selected.includes(categoryId) ? selected : [...selected, categoryId];
}

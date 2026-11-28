import type { DiscoveryCategoryOption } from "./discovery.js";
export function getSelectableDiscoveryCategories(): DiscoveryCategoryOption[];
export function toggleDiscoveryCategory(current: string[], categoryId: string, checked: boolean): string[];

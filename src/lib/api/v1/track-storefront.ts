import type {
  AppleCatalogResourceReference,
  AppleCatalogResourceResult,
} from '@/lib/apple-music/catalog'

import { fetchAppleCatalogResourceServer } from '@/lib/apple-music/catalog'

const FALLBACK_STOREFRONTS = ['us', 'gb', 'ca', 'au', 'in', 'jp'] as const

export function getTrackStorefrontCandidates(preferredStorefront: string): string[] {
  const preferred = preferredStorefront.toLowerCase()
  return [preferred, ...FALLBACK_STOREFRONTS.filter((storefront) => storefront !== preferred)]
}

export async function fetchTrackResourceWithFallback(
  reference: AppleCatalogResourceReference,
  options: { include?: string[]; views?: string[]; extend?: string[] } = {},
): Promise<AppleCatalogResourceResult | null> {
  for (const storefront of getTrackStorefrontCandidates(reference.storefront)) {
    const result = await fetchAppleCatalogResourceServer({ ...reference, storefront }, options)
    if (result?.resource) return result
  }

  return null
}

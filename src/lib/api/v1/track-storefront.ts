import type {
  AppleCatalogResourceReference,
  AppleCatalogResourceResult,
  AppleCatalogResourceType,
} from '@/lib/apple-music/catalog'

import { fetchAppleCatalogResourceServer } from '@/lib/apple-music/catalog'

const FALLBACK_STOREFRONTS = ['us', 'gb', 'ca', 'au', 'in', 'jp'] as const

export function getTrackStorefrontCandidates(preferredStorefront: string): string[] {
  const preferred = preferredStorefront.toLowerCase()
  return [preferred, ...FALLBACK_STOREFRONTS.filter((storefront) => storefront !== preferred)]
}

function getTrackTypeCandidates(
  preferredType: AppleCatalogResourceType,
): AppleCatalogResourceType[] {
  if (preferredType === 'music-videos') {
    return ['music-videos', 'songs']
  }
  if (preferredType === 'songs') {
    return ['songs', 'music-videos']
  }
  return [preferredType]
}

export async function fetchTrackResourceWithFallback(
  reference: AppleCatalogResourceReference,
  options: { include?: string[]; views?: string[]; extend?: string[] } = {},
): Promise<AppleCatalogResourceResult | null> {
  const typeCandidates = getTrackTypeCandidates(reference.type)
  const storefrontCandidates = getTrackStorefrontCandidates(reference.storefront)

  for (const storefront of storefrontCandidates) {
    for (const type of typeCandidates) {
      const result = await fetchAppleCatalogResourceServer(
        { ...reference, type, storefront },
        options,
      )
      if (result?.resource) return result
    }
  }

  return null
}

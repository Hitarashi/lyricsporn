import type { AppleCatalogResource, AppleCatalogResourceReference } from '@/lib/apple-music/catalog'
import type { MotionArtwork } from './contract'

import { fetchAppleCatalogResourcesServer } from '@/lib/apple-music/catalog'

import { MotionArtworkSchema } from './contract'

export type MotionArtworkReference = Omit<AppleCatalogResourceReference, 'type'> & {
  type: 'songs' | 'albums'
}

function resourceKey(storefront: string, type: string, id: string): string {
  return `${storefront}:${type}:${id}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function mapMotionArtwork(resource: AppleCatalogResource): MotionArtwork | null {
  const editorialVideo = getRecord(resource.attributes?.editorialVideo)
  if (!editorialVideo) return null

  const getVariant = (value: unknown): MotionArtwork['variants']['default'] => {
    const asset = getRecord(value)
    if (!asset) return undefined

    for (const field of ['video', 'videoUrl', 'hlsUrl', 'url']) {
      const url = getString(asset[field])
      if (!url) continue

      try {
        const parsedUrl = new URL(url)
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') continue
      } catch {
        continue
      }

      const isHls = field === 'hlsUrl' || /\.m3u8(?:$|\?)/i.test(url)
      const isMp4 = /\.mp4(?:$|\?)/i.test(url)
      return {
        url,
        ...(isHls ? { format: 'hls' as const } : isMp4 ? { format: 'mp4' as const } : {}),
      }
    }

    return undefined
  }

  const raw = getVariant(editorialVideo.motionDetailRaw)
  const square = getVariant(editorialVideo.motionDetailSquare)
  const portrait = getVariant(editorialVideo.motionDetailTall)
  const staticVariant = getVariant(editorialVideo.motionDetailStatic)
  const preferred = raw ?? square ?? staticVariant ?? portrait
  if (!preferred) return null

  const parsed = MotionArtworkSchema.safeParse({
    provider: 'appleMusic',
    variants: {
      default: preferred,
      ...(square ? { square } : {}),
      ...(portrait ? { portrait } : {}),
    },
  })
  return parsed.success ? parsed.data : null
}

function getSongAlbumId(resource: AppleCatalogResource): string | undefined {
  const albumRelation = getRecord(getRecord(resource.relationships)?.albums)
  const albumData = albumRelation?.data
  const firstAlbum = Array.isArray(albumData) ? getRecord(albumData[0]) : getRecord(albumData)
  const relatedAlbumId = getString(firstAlbum?.id)
  if (relatedAlbumId) return relatedAlbumId

  const attributes = resource.attributes ?? {}
  const collectionId = attributes.collectionId
  if (typeof collectionId === 'string' && collectionId) return collectionId
  if (typeof collectionId === 'number' && Number.isSafeInteger(collectionId))
    return String(collectionId)

  const url = getString(attributes.url)
  if (!url) return undefined
  try {
    return new URL(url).pathname.match(/\/(\d+)$/)?.[1]
  } catch {
    return undefined
  }
}

export async function fetchMotionArtworkForReferencesServer(
  references: MotionArtworkReference[],
): Promise<Map<string, MotionArtwork | null>> {
  const unique = new Map<string, MotionArtworkReference>()
  for (const reference of references) {
    unique.set(resourceKey(reference.storefront, reference.type, reference.id), reference)
  }

  const motionByKey = new Map<string, MotionArtwork | null>(
    [...unique.keys()].map((key) => [key, null]),
  )
  if (unique.size === 0) return motionByKey

  try {
    const referencesToFetch = [...unique.values()]
    const songReferences = referencesToFetch.filter((reference) => reference.type === 'songs')
    const albumReferences = referencesToFetch.filter((reference) => reference.type === 'albums')
    const [songResults, albumResults] = await Promise.all([
      songReferences.length > 0
        ? fetchAppleCatalogResourcesServer(songReferences, {
            include: ['albums'],
            extend: ['editorialVideo'],
          })
        : [],
      albumReferences.length > 0
        ? fetchAppleCatalogResourcesServer(albumReferences, { extend: ['editorialVideo'] })
        : [],
    ])
    const fetched = [...songResults, ...albumResults]
    const fetchedByKey = new Map<string, AppleCatalogResource>()
    const albumFallbacks = new Map<string, AppleCatalogResourceReference>()

    for (const result of fetched) {
      const key = resourceKey(result.storefront, result.reference.type, result.reference.id)
      const resource = result.resource
      if (!resource) continue
      fetchedByKey.set(key, resource)
      const motionArtwork = mapMotionArtwork(resource)
      if (motionArtwork) {
        motionByKey.set(key, motionArtwork)
        continue
      }

      if (result.reference.type === 'songs') {
        const albumId = getSongAlbumId(resource)
        if (albumId) {
          const albumKey = resourceKey(result.storefront, 'albums', albumId)
          albumFallbacks.set(albumKey, {
            type: 'albums',
            id: albumId,
            storefront: result.storefront,
          })
        }
      }
    }

    const unresolvedAlbums = [...albumFallbacks.entries()].filter(
      ([key]) => !fetchedByKey.has(key) && !motionByKey.get(key),
    )
    if (unresolvedAlbums.length > 0) {
      const fallbackResults = await fetchAppleCatalogResourcesServer(
        unresolvedAlbums.map(([, reference]) => reference),
        { extend: ['editorialVideo'] },
      )
      for (const result of fallbackResults) {
        const key = resourceKey(result.storefront, 'albums', result.reference.id)
        const motionArtwork = result.resource ? mapMotionArtwork(result.resource) : null
        motionByKey.set(key, motionArtwork)
      }
    }

    for (const [songKey, songReference] of unique) {
      if (songReference.type !== 'songs' || motionByKey.get(songKey)) continue
      const song = fetchedByKey.get(songKey)
      const albumId = song ? getSongAlbumId(song) : undefined
      if (!albumId) continue
      const albumKey = resourceKey(songReference.storefront, 'albums', albumId)
      const albumResource = fetchedByKey.get(albumKey)
      if (albumResource) {
        motionByKey.set(albumKey, mapMotionArtwork(albumResource))
      }
      if (motionByKey.get(albumKey)) motionByKey.set(songKey, motionByKey.get(albumKey) ?? null)
    }
  } catch {
    return motionByKey
  }

  return motionByKey
}

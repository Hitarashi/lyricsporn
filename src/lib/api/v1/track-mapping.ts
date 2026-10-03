import type { AppleCatalogResource } from '@/lib/apple-music/catalog'
import type { ApiJsonValue, Track } from './contract'

export function mapTrack(resource: AppleCatalogResource): Track {
  const attributes = resource.attributes ?? {}
  return {
    id: resource.id,
    type: resource.type,
    ...(resource.href ? { href: resource.href } : {}),
    ...(attributes.name ? { title: attributes.name } : {}),
    ...(attributes.artistName ? { artist: attributes.artistName } : {}),
    ...(attributes.albumName ? { album: attributes.albumName } : {}),
    ...(attributes.albumArtistName ? { albumArtist: attributes.albumArtistName } : {}),
    ...(attributes.composerName ? { composer: attributes.composerName } : {}),
    ...(attributes.genreNames ? { genres: attributes.genreNames } : {}),
    ...(attributes.releaseDate ? { releaseDate: attributes.releaseDate } : {}),
    ...(attributes.trackNumber !== undefined ? { trackNumber: attributes.trackNumber } : {}),
    ...(attributes.discNumber !== undefined ? { discNumber: attributes.discNumber } : {}),
    ...(attributes.durationInMillis !== undefined
      ? { durationMs: attributes.durationInMillis }
      : {}),
    ...(attributes.isrc ? { isrc: attributes.isrc } : {}),
    ...(attributes.audioTraits ? { audioTraits: attributes.audioTraits } : {}),
    ...(attributes.recordLabel ? { recordLabel: attributes.recordLabel } : {}),
    ...(attributes.copyright ? { copyright: attributes.copyright } : {}),
    ...(attributes.isStreamable !== undefined ? { isStreamable: attributes.isStreamable } : {}),
    ...(attributes.contentRating ? { contentRating: attributes.contentRating } : {}),
    ...(attributes.upc ? { upc: attributes.upc } : {}),
  }
}

export function toApiJson(value: unknown): ApiJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) return value.map(toApiJson)
  if (typeof value === 'object') {
    const record: Record<string, ApiJsonValue> = {}
    for (const [key, child] of Object.entries(value)) {
      if (child !== undefined) record[key] = toApiJson(child)
    }
    return record
  }
  throw new Error('Apple Music returned a non-JSON value')
}

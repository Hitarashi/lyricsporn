import type { AppleCatalogLookupInput, AppleCatalogResource } from '@/lib/apple-music/catalog'
import type { LyricsLookup } from '@/lib/lyrics/domain/types'
import type {
  ApiJsonValue,
  BatchLookupRequest,
  IncludeSection,
  LookupError,
  LookupItem,
  LookupOptions,
  LookupResponse,
  LookupSelector,
  LyricsOutputFormat,
  Track,
} from './contract'

import { lookupAppleCatalogServer } from '@/lib/apple-music/catalog'
import { defaultLyricsRepository } from '@/lib/lyrics/adapters/default-repository'
import {
  sanitizeLookupInput,
  sanitizeSearchLookupInput,
  sanitizeTrackMetadata,
} from '@/lib/lyrics/input'

import {
  ArtworkSchema,
  DEFAULT_INCLUDE,
  DEFAULT_LYRICS_FORMATS,
  DEFAULT_MATCH_LIMIT,
  LookupSelectorSchema,
} from './contract'
import { createLyricsOutput } from './lyrics-formats'

export interface TrackMetadataHints {
  title?: string
  artist?: string
  album?: string
}

interface PreparedLookup {
  selector: LookupSelector
  catalogInput: AppleCatalogLookupInput
  hints: TrackMetadataHints
  options: {
    include: IncludeSection[]
    formats: LyricsOutputFormat[]
    limit: number
  }
  index: number
}

export class ApiLookupInputError extends Error {
  readonly path: string

  constructor(path: string, message: string) {
    super(message)
    this.name = 'ApiLookupInputError'
    this.path = path
  }
}

function failureFromLookupInput(
  path: string,
  result: ReturnType<typeof sanitizeLookupInput>,
): never {
  if (result.ok) throw new Error('Expected an invalid lookup input')
  const firstIssue = result.issues[0]
  throw new ApiLookupInputError(path, firstIssue?.message ?? 'Invalid lookup input.')
}

function toHints(selector: LookupSelector): PreparedLookup['hints'] {
  const hints = {
    title:
      'title' in selector && typeof selector.title === 'string'
        ? sanitizeTrackMetadata(selector.title)
        : '',
    artist:
      'artist' in selector && typeof selector.artist === 'string'
        ? sanitizeTrackMetadata(selector.artist)
        : '',
    album:
      'album' in selector && typeof selector.album === 'string'
        ? sanitizeTrackMetadata(selector.album)
        : '',
  }

  return {
    ...(hints.title ? { title: hints.title } : {}),
    ...(hints.artist ? { artist: hints.artist } : {}),
    ...(hints.album ? { album: hints.album } : {}),
  }
}

function normalizeSelector(
  selector: LookupSelector,
  path: string,
): {
  selector: LookupSelector
  catalogInput: AppleCatalogLookupInput
  hints: PreparedLookup['hints']
} {
  const storefront = selector.storefront?.toLowerCase() ?? 'us'
  const hints = toHints(selector)

  if ('isrc' in selector) {
    const result = sanitizeLookupInput('isrc', selector.isrc)
    if (!result.ok) failureFromLookupInput(`${path}.isrc`, result)
    if (result.input.type !== 'isrc')
      throw new Error('ISRC sanitizer returned the wrong lookup type')
    return {
      selector: {
        isrc: result.input.value,
        ...hints,
        ...(selector.storefront ? { storefront } : {}),
      },
      catalogInput: { type: 'isrc', value: result.input.value, storefront },
      hints,
    }
  }

  if ('appleId' in selector) {
    const result = sanitizeLookupInput('apple', selector.appleId)
    if (!result.ok) failureFromLookupInput(`${path}.appleId`, result)
    if (result.input.type !== 'appleTrackId')
      throw new Error('Apple ID sanitizer returned the wrong lookup type')
    return {
      selector: {
        appleId: result.input.value,
        ...hints,
        ...(selector.storefront ? { storefront } : {}),
      },
      catalogInput: { type: 'appleTrackId', value: result.input.value, storefront },
      hints,
    }
  }

  if ('appleLink' in selector) {
    const result = sanitizeLookupInput('apple', selector.appleLink)
    if (!result.ok) failureFromLookupInput(`${path}.appleLink`, result)
    if (result.input.type !== 'appleTrackId')
      throw new Error('Apple link sanitizer returned the wrong lookup type')
    return {
      selector: {
        appleId: result.input.value,
        ...hints,
        ...(selector.storefront ? { storefront } : {}),
      },
      catalogInput: { type: 'appleTrackId', value: result.input.value, storefront },
      hints,
    }
  }

  const result = sanitizeSearchLookupInput({
    title: selector.title,
    artist: selector.artist,
    album: selector.album ?? '',
  })
  if (!result.ok) {
    const firstIssue = result.issues[0]
    throw new ApiLookupInputError(
      `${path}.${firstIssue?.field ?? 'title'}`,
      firstIssue?.message ?? 'Invalid search input.',
    )
  }
  if (result.input.type !== 'search')
    throw new Error('Search sanitizer returned the wrong lookup type')

  return {
    selector: {
      title: result.input.title,
      artist: result.input.artist,
      ...(result.input.album ? { album: result.input.album } : {}),
      ...(selector.storefront ? { storefront } : {}),
    },
    catalogInput: {
      type: 'search',
      title: result.input.title,
      artist: result.input.artist,
      ...(result.input.album ? { album: result.input.album } : {}),
      storefront,
    },
    hints,
  }
}

function resolveOptions(item: LookupItem, defaults: LookupOptions): PreparedLookup['options'] {
  return {
    include: [...(item.include ?? defaults.include ?? DEFAULT_INCLUDE)],
    formats: [
      ...new Set(item.lyrics?.formats ?? defaults.lyrics?.formats ?? DEFAULT_LYRICS_FORMATS),
    ],
    limit: item.limit ?? defaults.limit ?? DEFAULT_MATCH_LIMIT,
  }
}

export function mapTrack(resource: AppleCatalogResource, hints: TrackMetadataHints = {}): Track {
  const attributes = resource.attributes ?? {}
  return {
    id: resource.id,
    type: resource.type,
    ...(resource.href ? { href: resource.href } : {}),
    ...((attributes.name ?? hints.title) ? { title: attributes.name ?? hints.title } : {}),
    ...((attributes.artistName ?? hints.artist)
      ? { artist: attributes.artistName ?? hints.artist }
      : {}),
    ...((attributes.albumName ?? hints.album)
      ? { album: attributes.albumName ?? hints.album }
      : {}),
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

function mapError(code: LookupError['code'], message: string): LookupError {
  return { code, message }
}

async function processLookup(prepared: PreparedLookup) {
  try {
    const catalog = await lookupAppleCatalogServer(prepared.catalogInput, {
      limit: prepared.options.limit,
      includeRelations: prepared.options.include.includes('appleCatalog'),
    })

    if (!catalog || catalog.songs.length === 0) {
      return {
        index: prepared.index,
        lookup: prepared.selector,
        status: 'not_found' as const,
        matches: [],
        ...(catalog && prepared.options.include.includes('appleCatalog')
          ? {
              appleCatalog: {
                storefront: catalog.storefront,
                response: toApiJson(catalog.response),
              },
            }
          : {}),
      }
    }

    const songs = catalog.songs.slice(0, prepared.options.limit)
    const matches = await Promise.all(
      songs.map(async (resource) => {
        const track = mapTrack(resource, prepared.hints)
        const attributes = resource.attributes ?? {}
        const lyricLookup: LyricsLookup = {
          title: track.title ?? '',
          artistString: track.artist ?? '',
          ...(track.album ? { album: track.album } : {}),
          ...(track.durationMs !== undefined ? { durationSeconds: track.durationMs / 1000 } : {}),
          appleTrackId: resource.id,
        }

        const includeLyrics = prepared.options.include.includes('lyrics')
        const details = includeLyrics
          ? await defaultLyricsRepository.lookupDetailed(lyricLookup)
          : null
        const hasLyrics =
          details !== null &&
          details.result.provider !== null &&
          details.result.provider !== 'Fallback' &&
          details.result.lines.length > 0
        const artworkData = attributes.artwork
          ? ArtworkSchema.safeParse(toApiJson(attributes.artwork))
          : null
        const artwork = artworkData?.success ? artworkData.data : undefined

        return {
          appleTrackId: resource.id,
          ...(prepared.options.include.includes('track') ? { track } : {}),
          ...(prepared.options.include.includes('artwork') && artwork ? { artwork } : {}),
          ...(details
            ? {
                lyrics: createLyricsOutput(
                  details.result,
                  track,
                  prepared.options.formats,
                  hasLyrics,
                ),
              }
            : {}),
        }
      }),
    )

    return {
      index: prepared.index,
      lookup: prepared.selector,
      status: 'matched' as const,
      matches,
      ...(prepared.options.include.includes('appleCatalog')
        ? {
            appleCatalog: { storefront: catalog.storefront, response: toApiJson(catalog.response) },
          }
        : {}),
    }
  } catch {
    return {
      index: prepared.index,
      lookup: prepared.selector,
      status: 'error' as const,
      matches: [],
      error: mapError('lookup_failed', 'The track lookup could not be completed.'),
    }
  }
}

export async function lookupTracks(request: BatchLookupRequest): Promise<LookupResponse> {
  const prepared: PreparedLookup[] = request.lookups.map((item, index) => {
    const parsed = LookupSelectorSchema.safeParse(item.lookup)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new ApiLookupInputError(
        `lookups[${index}].lookup${issue?.path.length ? `.${issue.path.join('.')}` : ''}`,
        issue?.message ?? 'Invalid lookup input.',
      )
    }

    const normalized = normalizeSelector(parsed.data, `lookups[${index}].lookup`)
    return {
      selector: normalized.selector,
      catalogInput: normalized.catalogInput,
      hints: normalized.hints,
      options: resolveOptions(item, request),
      index,
    }
  })

  const results = await Promise.all(prepared.map(processLookup))
  return { results }
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

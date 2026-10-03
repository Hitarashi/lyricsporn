import type {
  AppleCatalogResource,
  AppleCatalogResourceReference,
  AppleCatalogResourceResult,
} from '@/lib/apple-music/catalog'
import type { LyricsLookup } from '@/lib/lyrics/domain/types'
import type {
  Album,
  Artist,
  AssetBatchRequest,
  AssetBatchResponse,
  AssetType,
  CatalogBatchRequest,
  CatalogBatchResponse,
  CatalogCollectionName,
  CatalogCollectionResponse,
  CatalogEntity,
  CatalogInclude,
  CatalogItem,
  Playlist,
  QueueInclude,
  QueueTrack,
  TrackBatchRequest,
  TrackBatchResponse,
  TrackDetailInclude,
  TrackDetailResponse,
} from './catalog-contract'
import type { LyricsOutputFormat } from './contract'

import {
  AppleCatalogCollectionUnavailableError,
  fetchAppleCatalogCollectionServer,
  fetchAppleCatalogResourceServer,
  fetchAppleCatalogResourcesServer,
} from '@/lib/apple-music/catalog'
import { defaultLyricsRepository } from '@/lib/lyrics/adapters/default-repository'

import {
  CatalogEntitySchema,
  CatalogItemSchema,
  DEFAULT_ARTWORK_SIZE,
  DEFAULT_COLLECTION_LIMIT,
  MAX_COLLECTION_LIMIT,
  QueueTrackSchema as QueueTrackValidator,
  TrackDetailResponseSchema,
} from './catalog-contract'
import { ArtworkSchema, DEFAULT_LYRICS_FORMATS } from './contract'
import { createLyricsOutput } from './lyrics-formats'
import { mapTrack, toApiJson } from './track-mapping'

const RESOURCE_TYPES = {
  song: 'songs',
  artist: 'artists',
  album: 'albums',
  playlist: 'playlists',
} as const

const ENTITY_RESOURCE_TYPES = {
  artist: 'artists',
  album: 'albums',
  playlist: 'playlists',
} as const

const RESOURCE_SINGULAR_TYPES: Record<string, CatalogItem['type']> = {
  songs: 'song',
  artists: 'artist',
  albums: 'album',
  playlists: 'playlist',
  'music-videos': 'musicVideo',
  genres: 'genre',
  'record-labels': 'recordLabel',
  stations: 'station',
  curators: 'curator',
  'apple-curators': 'appleCurator',
}

const ARTIST_COLLECTIONS = {
  albums: { kind: 'relationship', wire: 'albums' },
  genres: { kind: 'relationship', wire: 'genres' },
  musicVideos: { kind: 'relationship', wire: 'music-videos' },
  playlists: { kind: 'relationship', wire: 'playlists' },
  station: { kind: 'relationship', wire: 'station' },
  topSongs: { kind: 'view', wire: 'top-songs' },
  latestRelease: { kind: 'view', wire: 'latest-release' },
  featuredAlbums: { kind: 'view', wire: 'featured-albums' },
  featuredPlaylists: { kind: 'view', wire: 'featured-playlists' },
  featuredMusicVideos: { kind: 'view', wire: 'featured-music-videos' },
  topMusicVideos: { kind: 'view', wire: 'top-music-videos' },
  fullAlbums: { kind: 'view', wire: 'full-albums' },
  singles: { kind: 'view', wire: 'singles' },
  liveAlbums: { kind: 'view', wire: 'live-albums' },
  appearsOnAlbums: { kind: 'view', wire: 'appears-on-albums' },
  compilationAlbums: { kind: 'view', wire: 'compilation-albums' },
  similarArtists: { kind: 'view', wire: 'similar-artists' },
} as const

const ALBUM_COLLECTIONS = {
  artists: { kind: 'relationship', wire: 'artists' },
  genres: { kind: 'relationship', wire: 'genres' },
  tracks: { kind: 'relationship', wire: 'tracks' },
  recordLabels: { kind: 'relationship', wire: 'record-labels' },
  appearsOn: { kind: 'view', wire: 'appears-on' },
  otherVersions: { kind: 'view', wire: 'other-versions' },
  relatedAlbums: { kind: 'view', wire: 'related-albums' },
  relatedVideos: { kind: 'view', wire: 'related-videos' },
} as const

const PLAYLIST_COLLECTIONS = {
  curator: { kind: 'relationship', wire: 'curator' },
  tracks: { kind: 'relationship', wire: 'tracks' },
  featuredArtists: { kind: 'view', wire: 'featured-artists' },
  moreByCurator: { kind: 'view', wire: 'more-by-curator' },
} as const

type CatalogEntityType = keyof typeof RESOURCE_TYPES
type CatalogResourceType = (typeof RESOURCE_TYPES)[CatalogEntityType]
type EntityResourceType = Extract<CatalogResourceType, 'artists' | 'albums' | 'playlists'>
type CollectionConfig = { kind: 'relationship' | 'view'; wire: string }

const APPLE_COLLECTION_LIMITS: Partial<Record<EntityResourceType, Record<string, number>>> = {
  artists: { playlists: 10, station: 1, latestRelease: 1 },
  albums: { artists: 10, recordLabels: 10 },
  playlists: { curator: 1 },
}

function resourceKey(storefront: string, type: string, id: string): string {
  return `${storefront}:${type}:${id}`
}

function effectiveCollectionLimit(
  type: EntityResourceType,
  collection: string,
  requestedLimit: number,
): number {
  return Math.min(
    requestedLimit,
    APPLE_COLLECTION_LIMITS[type]?.[collection] ?? MAX_COLLECTION_LIMIT,
  )
}

function indexCatalogResults(results: AppleCatalogResourceResult[]) {
  const byKey = new Map<string, AppleCatalogResourceResult>()
  const failedKeys = new Set<string>()

  for (const result of results) {
    const key = resourceKey(result.storefront, result.reference.type, result.reference.id)
    byKey.set(key, result)
    if (result.error) failedKeys.add(key)
  }

  return { byKey, failedKeys }
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

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function getStrings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined
}

function resizedArtwork(value: unknown, size = DEFAULT_ARTWORK_SIZE) {
  const artwork = getRecord(value)
  const originalUrl = getString(artwork?.url)
  if (!artwork || !originalUrl) return undefined

  let url = originalUrl
    .replaceAll('{w}', String(size))
    .replaceAll('{h}', String(size))
    .replaceAll('{f}', 'jpg')
  if (url === originalUrl) {
    url = url.replace(/\/\d+x\d+bb\.(?:jpg|jpeg|png|webp)(?=\?|$)/i, `/${size}x${size}bb.jpg`)
  }

  const parsed = ArtworkSchema.safeParse({ ...artwork, url, width: size, height: size })
  return parsed.success ? parsed.data : undefined
}

function mapResourceType(type: string): CatalogItem['type'] | undefined {
  return RESOURCE_SINGULAR_TYPES[type]
}

function mapCatalogItem(resource: AppleCatalogResource, artworkSize: number): CatalogItem | null {
  const attributes = resource.attributes ?? {}
  const type = mapResourceType(resource.type)
  if (!type) return null
  const artwork = resizedArtwork(attributes.artwork, artworkSize)

  const mapped = {
    id: resource.id,
    type,
    ...(getString(attributes.name) ? { name: getString(attributes.name) } : {}),
    ...(getString(attributes.artistName) ? { artistName: getString(attributes.artistName) } : {}),
    ...(getString(attributes.albumName) ? { albumName: getString(attributes.albumName) } : {}),
    ...(getString(attributes.albumArtistName)
      ? { albumArtistName: getString(attributes.albumArtistName) }
      : {}),
    ...(getString(attributes.curatorName)
      ? { curatorName: getString(attributes.curatorName) }
      : {}),
    ...(getString(attributes.url) ? { url: getString(attributes.url) } : {}),
    ...(artwork ? { artwork } : {}),
    ...(getStrings(attributes.genreNames) ? { genres: getStrings(attributes.genreNames) } : {}),
    ...(getString(attributes.releaseDate)
      ? { releaseDate: getString(attributes.releaseDate) }
      : {}),
    ...(getNumber(attributes.durationInMillis) !== undefined
      ? { durationMs: getNumber(attributes.durationInMillis) }
      : {}),
    ...(getNumber(attributes.trackCount) !== undefined
      ? { trackCount: getNumber(attributes.trackCount) }
      : {}),
    ...(getString(attributes.isrc) ? { isrc: getString(attributes.isrc) } : {}),
    ...(getString(attributes.contentRating)
      ? { contentRating: getString(attributes.contentRating) }
      : {}),
    ...(getString(attributes.playlistType)
      ? { playlistType: getString(attributes.playlistType) }
      : {}),
  }
  const parsed = CatalogItemSchema.safeParse(mapped)
  return parsed.success ? parsed.data : null
}

function mapCollectionItems(raw: unknown, artworkSize: number): CatalogItem[] {
  const data = getRecord(raw)?.data
  const resources = Array.isArray(data) ? data : isRecord(data) ? [data] : []
  return resources.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.type !== 'string') return []
    const mapped = mapCatalogItem(item as AppleCatalogResource, artworkSize)
    return mapped ? [mapped] : []
  })
}

function mapNotes(value: unknown): { standard?: string; short?: string } | undefined {
  const notes = getRecord(value)
  if (!notes) return undefined
  const standard = getString(notes.standard)
  const short = getString(notes.short)
  return standard || short
    ? { ...(standard ? { standard } : {}), ...(short ? { short } : {}) }
    : undefined
}

function mapArtist(
  resource: AppleCatalogResource,
  include: CatalogInclude[],
  storefront: string,
  limit: number,
  artworkSize: number,
): Artist {
  const attributes = resource.attributes ?? {}
  const collections = mapCollections(
    resource,
    include,
    ARTIST_COLLECTIONS,
    'artists',
    storefront,
    limit,
    artworkSize,
  )
  const notes = include.includes('editorialNotes') ? mapNotes(attributes.editorialNotes) : undefined
  const artwork = include.includes('artwork')
    ? resizedArtwork(attributes.artwork, artworkSize)
    : undefined

  return {
    id: resource.id,
    type: 'artist',
    name: getString(attributes.name) ?? '',
    ...(getString(attributes.url) ? { url: getString(attributes.url) } : {}),
    ...(getStrings(attributes.genreNames) ? { genres: getStrings(attributes.genreNames) } : {}),
    ...(artwork ? { artwork } : {}),
    ...(notes ? { editorialNotes: notes } : {}),
    ...(Object.keys(collections).length > 0 ? { collections } : {}),
  }
}

function mapAlbum(
  resource: AppleCatalogResource,
  include: CatalogInclude[],
  storefront: string,
  limit: number,
  artworkSize: number,
): Album {
  const attributes = resource.attributes ?? {}
  const collections = mapCollections(
    resource,
    include,
    ALBUM_COLLECTIONS,
    'albums',
    storefront,
    limit,
    artworkSize,
  )
  const notes = include.includes('editorialNotes') ? mapNotes(attributes.editorialNotes) : undefined
  const artwork = include.includes('artwork')
    ? resizedArtwork(attributes.artwork, artworkSize)
    : undefined

  return {
    id: resource.id,
    type: 'album',
    name: getString(attributes.name) ?? '',
    ...(getString(attributes.artistName) ? { artistName: getString(attributes.artistName) } : {}),
    ...(include.includes('artistUrl') && getString(attributes.artistUrl)
      ? { artistUrl: getString(attributes.artistUrl) }
      : {}),
    ...(getString(attributes.url) ? { url: getString(attributes.url) } : {}),
    ...(artwork ? { artwork } : {}),
    ...(getStrings(attributes.genreNames) ? { genres: getStrings(attributes.genreNames) } : {}),
    ...(getString(attributes.releaseDate)
      ? { releaseDate: getString(attributes.releaseDate) }
      : {}),
    ...(getNumber(attributes.trackCount) !== undefined
      ? { trackCount: getNumber(attributes.trackCount) }
      : {}),
    ...(getString(attributes.contentRating)
      ? { contentRating: getString(attributes.contentRating) }
      : {}),
    ...(getString(attributes.copyright) ? { copyright: getString(attributes.copyright) } : {}),
    ...(getString(attributes.recordLabel)
      ? { recordLabel: getString(attributes.recordLabel) }
      : {}),
    ...(getString(attributes.upc) ? { upc: getString(attributes.upc) } : {}),
    ...(include.includes('audioVariants') && getStrings(attributes.audioVariants)
      ? { audioVariants: getStrings(attributes.audioVariants) }
      : {}),
    ...(getBoolean(attributes.isSingle) !== undefined
      ? { isSingle: getBoolean(attributes.isSingle) }
      : {}),
    ...(getBoolean(attributes.isCompilation) !== undefined
      ? { isCompilation: getBoolean(attributes.isCompilation) }
      : {}),
    ...(getBoolean(attributes.isComplete) !== undefined
      ? { isComplete: getBoolean(attributes.isComplete) }
      : {}),
    ...(getBoolean(attributes.isMasteredForItunes) !== undefined
      ? { isMasteredForItunes: getBoolean(attributes.isMasteredForItunes) }
      : {}),
    ...(notes ? { editorialNotes: notes } : {}),
    ...(Object.keys(collections).length > 0 ? { collections } : {}),
  }
}

function mapPlaylist(
  resource: AppleCatalogResource,
  include: CatalogInclude[],
  storefront: string,
  limit: number,
  artworkSize: number,
): Playlist {
  const attributes = resource.attributes ?? {}
  const collections = mapCollections(
    resource,
    include,
    PLAYLIST_COLLECTIONS,
    'playlists',
    storefront,
    limit,
    artworkSize,
  )
  const description = include.includes('description') ? mapNotes(attributes.description) : undefined
  const artwork = include.includes('artwork')
    ? resizedArtwork(attributes.artwork, artworkSize)
    : undefined

  return {
    id: resource.id,
    type: 'playlist',
    name: getString(attributes.name) ?? '',
    ...(getString(attributes.curatorName)
      ? { curatorName: getString(attributes.curatorName) }
      : {}),
    ...(description ? { description } : {}),
    ...(getString(attributes.url) ? { url: getString(attributes.url) } : {}),
    ...(artwork ? { artwork } : {}),
    ...(getBoolean(attributes.isChart) !== undefined
      ? { isChart: getBoolean(attributes.isChart) }
      : {}),
    ...(getString(attributes.lastModifiedDate)
      ? { lastModifiedDate: getString(attributes.lastModifiedDate) }
      : {}),
    ...(getString(attributes.playlistType)
      ? { playlistType: getString(attributes.playlistType) }
      : {}),
    ...(include.includes('trackTypes') && getStrings(attributes.trackTypes)
      ? { trackTypes: getStrings(attributes.trackTypes) }
      : {}),
    ...(Object.keys(collections).length > 0 ? { collections } : {}),
  }
}

function mapCollections(
  resource: AppleCatalogResource,
  include: CatalogInclude[],
  mapping: Record<string, CollectionConfig>,
  entityPlural: EntityResourceType,
  storefront: string,
  limit: number,
  artworkSize: number,
): Record<string, { items: CatalogItem[]; next?: string }> {
  const collections: Record<string, { items: CatalogItem[]; next?: string }> = {}
  const relationships = getRecord(resource.relationships)
  const views = getRecord(resource.views)

  for (const name of include) {
    const config = mapping[name]
    if (!config) continue
    const pageLimit = effectiveCollectionLimit(entityPlural, name, limit)
    const raw = config.kind === 'view' ? views?.[config.wire] : relationships?.[config.wire]
    if (!raw) {
      collections[name] = { items: [] }
      continue
    }

    const allItems = mapCollectionItems(raw, artworkSize)
    const items = allItems.slice(0, pageLimit)
    const next = getRecord(raw)?.next
    const nextOffset =
      allItems.length > items.length
        ? pageLimit
        : next
          ? (readOffset(next) ?? allItems.length)
          : null
    const nextUrl =
      nextOffset !== null
        ? makeCollectionUrl(
            entityPlural,
            resource.id,
            name,
            storefront,
            pageLimit,
            nextOffset,
            artworkSize,
          )
        : undefined
    collections[name] = { items, ...(nextUrl ? { next: nextUrl } : {}) }
  }

  return collections
}

function readOffset(next: unknown): number | null {
  if (typeof next !== 'string') return null
  try {
    const url = new URL(next, 'https://amp-api.music.apple.com')
    const value = url.searchParams.get('offset')
    if (value && /^\d+$/.test(value)) return Number(value)
    const scopedOffset = [...url.searchParams.entries()].find(([key]) =>
      key.startsWith('offset['),
    )?.[1]
    return scopedOffset && /^\d+$/.test(scopedOffset) ? Number(scopedOffset) : null
  } catch {
    return null
  }
}

function makeCollectionUrl(
  entity: string,
  id: string,
  collection: string,
  storefront: string,
  limit: number,
  offset: number,
  artworkSize: number,
): string {
  const query = new URLSearchParams({
    storefront,
    limit: String(limit),
    offset: String(offset),
    artworkSize: String(artworkSize),
  })
  return `/api/v1/${entity}/${encodeURIComponent(id)}/collections/${encodeURIComponent(collection)}?${query.toString()}`
}

function getCollectionConfig(type: EntityResourceType, name: string): CollectionConfig | undefined {
  if (type === 'artists') return ARTIST_COLLECTIONS[name as keyof typeof ARTIST_COLLECTIONS]
  if (type === 'albums') return ALBUM_COLLECTIONS[name as keyof typeof ALBUM_COLLECTIONS]
  if (type === 'playlists') return PLAYLIST_COLLECTIONS[name as keyof typeof PLAYLIST_COLLECTIONS]
  return undefined
}

function getIncludeNames(
  resourceType: EntityResourceType,
  include: CatalogInclude[],
): { include: string[]; views: string[]; extend: string[] } {
  const mapping: Record<string, CollectionConfig> =
    resourceType === 'artists'
      ? ARTIST_COLLECTIONS
      : resourceType === 'albums'
        ? ALBUM_COLLECTIONS
        : PLAYLIST_COLLECTIONS
  const relationships: string[] = []
  const views: string[] = []
  const extend: string[] = []

  for (const name of include) {
    if (name === 'artwork') continue
    if (name === 'description' && resourceType === 'playlists') continue
    if (name === 'editorialNotes') {
      extend.push('editorialNotes')
      continue
    }
    if (name === 'artistUrl' && resourceType === 'albums') {
      extend.push('artistUrl')
      continue
    }
    if (name === 'audioVariants' && resourceType === 'albums') {
      extend.push('audioVariants')
      continue
    }
    if (name === 'trackTypes' && resourceType === 'playlists') {
      extend.push('trackTypes')
      continue
    }
    const config = mapping[name as keyof typeof mapping]
    if (!config) throw new Error(`The include '${name}' is not supported for ${resourceType}.`)
    if (config.kind === 'view') views.push(config.wire)
    else relationships.push(config.wire)
  }

  return { include: relationships, views, extend }
}

function mapEntity(
  type: EntityResourceType,
  resource: AppleCatalogResource,
  include: CatalogInclude[],
  storefront: string,
  limit: number,
  artworkSize: number,
): CatalogEntity {
  if (type === 'artists')
    return CatalogEntitySchema.parse(mapArtist(resource, include, storefront, limit, artworkSize))
  if (type === 'albums')
    return CatalogEntitySchema.parse(mapAlbum(resource, include, storefront, limit, artworkSize))
  return CatalogEntitySchema.parse(mapPlaylist(resource, include, storefront, limit, artworkSize))
}

export async function getCatalogEntityServer(options: {
  type: 'artist' | 'album' | 'playlist'
  appleId: string
  storefront: string
  include: CatalogInclude[]
  limit: number
  artworkSize: number
}): Promise<CatalogEntity | null> {
  const plural = ENTITY_RESOURCE_TYPES[options.type]
  const ampOptions = getIncludeNames(plural, options.include)
  const result = await fetchAppleCatalogResourceServer(
    { type: plural, id: options.appleId, storefront: options.storefront },
    ampOptions,
  )
  if (!result?.resource) return null
  return mapEntity(
    plural,
    result.resource,
    options.include,
    result.storefront,
    options.limit,
    options.artworkSize,
  )
}

export async function getCatalogCollectionServer(options: {
  type: 'artist' | 'album' | 'playlist'
  appleId: string
  collection: CatalogCollectionName
  storefront: string
  limit: number
  offset: number
  artworkSize: number
}): Promise<CatalogCollectionResponse | null> {
  const plural = ENTITY_RESOURCE_TYPES[options.type]
  const config = getCollectionConfig(plural, options.collection)
  if (!config)
    throw new Error(`The collection '${options.collection}' is not supported for ${plural}.`)
  const pageLimit = effectiveCollectionLimit(plural, options.collection, options.limit)

  let response: Awaited<ReturnType<typeof fetchAppleCatalogCollectionServer>>
  try {
    response = await fetchAppleCatalogCollectionServer(
      { type: plural, id: options.appleId, storefront: options.storefront },
      { kind: config.kind, name: config.wire },
      { limit: pageLimit, offset: options.offset },
    )
  } catch (error) {
    if (!(error instanceof AppleCatalogCollectionUnavailableError)) throw error
    const parent = await fetchAppleCatalogResourceServer({
      type: plural,
      id: options.appleId,
      storefront: options.storefront,
    })
    if (!parent?.resource) return null
    return {
      type: options.collection,
      items: [],
      page: { limit: pageLimit, offset: options.offset },
    }
  }
  if (!response) return null

  const items = Array.isArray(response.data)
    ? response.data.flatMap((resource) => {
        const mapped = mapCatalogItem(resource, options.artworkSize)
        return mapped ? [mapped] : []
      })
    : []
  const nextOffset = response.next
    ? (readOffset(response.next) ?? options.offset + items.length)
    : null
  const next =
    nextOffset !== null
      ? makeCollectionUrl(
          plural,
          options.appleId,
          options.collection,
          options.storefront,
          pageLimit,
          nextOffset,
          options.artworkSize,
        )
      : undefined

  return {
    type: options.collection,
    items,
    page: {
      limit: pageLimit,
      offset: options.offset,
      ...(next ? { next } : {}),
    },
  }
}

function catalogResourceType(
  type: AssetType | 'artist' | 'album' | 'playlist',
): CatalogResourceType {
  return RESOURCE_TYPES[type]
}

function getRelationItems(resource: AppleCatalogResource, name: string): AppleCatalogResource[] {
  const relation = getRecord(resource.relationships)?.[name]
  const data = getRecord(relation)?.data
  if (!Array.isArray(data)) return []
  return data.filter(
    (item): item is AppleCatalogResource =>
      isRecord(item) && typeof item.id === 'string' && typeof item.type === 'string',
  )
}

export async function getTrackDetailServer(options: {
  appleId: string
  storefront: string
  include: TrackDetailInclude[]
  formats: LyricsOutputFormat[]
  artworkSize: number
}): Promise<TrackDetailResponse | null> {
  const relationIncludes = [
    ...(options.include.includes('artists') ? ['artists'] : []),
    ...(options.include.includes('album') ? ['albums'] : []),
  ]
  const result = await fetchAppleCatalogResourceServer(
    { type: 'songs', id: options.appleId, storefront: options.storefront },
    { include: relationIncludes },
  )
  const resource = result?.resource
  if (!resource) return null

  const metadata = mapTrack(resource)
  const attributes = resource.attributes ?? {}
  const artwork = options.include.includes('artwork')
    ? resizedArtwork(attributes.artwork, options.artworkSize)
    : undefined
  const artists = options.include.includes('artists')
    ? getRelationItems(resource, 'artists').flatMap((item) => {
        const mapped = mapCatalogItem(item, options.artworkSize)
        return mapped ? [mapped] : []
      })
    : undefined
  const albumResource = options.include.includes('album')
    ? getRelationItems(resource, 'albums')[0]
    : undefined
  const album = albumResource ? mapCatalogItem(albumResource, options.artworkSize) : undefined
  const track = {
    ...metadata,
    ...(getString(attributes.url) ? { url: getString(attributes.url) } : {}),
    ...(artwork ? { artwork } : {}),
    ...(artists ? { artists } : {}),
    ...(album ? { albumResource: album } : {}),
    ...(getBoolean(attributes.hasLyrics) !== undefined
      ? { hasLyrics: getBoolean(attributes.hasLyrics) }
      : {}),
  }

  let lyrics: ReturnType<typeof createLyricsOutput> | undefined
  if (options.include.includes('lyrics')) {
    const lookup: LyricsLookup = {
      title: metadata.title ?? '',
      artistString: metadata.artist ?? '',
      ...(metadata.album ? { album: metadata.album } : {}),
      ...(metadata.durationMs !== undefined ? { durationSeconds: metadata.durationMs / 1000 } : {}),
      appleTrackId: resource.id,
    }
    const details = await defaultLyricsRepository.lookupDetailed(lookup)
    const hasLyrics =
      details.result.provider !== null &&
      details.result.provider !== 'Fallback' &&
      details.result.lines.length > 0
    lyrics = createLyricsOutput(details.result, metadata, options.formats, hasLyrics)
  }

  return TrackDetailResponseSchema.parse({
    track,
    ...(lyrics ? { lyrics } : {}),
    ...(options.include.includes('appleCatalog') && result
      ? { appleCatalog: { storefront: result.storefront, response: toApiJson(result.response) } }
      : {}),
  })
}

function resolvedQueueIncludes(
  itemInclude: QueueInclude[] | undefined,
  defaultInclude: QueueInclude[] | undefined,
): QueueInclude[] {
  const include: QueueInclude[] = itemInclude ?? defaultInclude ?? ['artwork']
  return [...new Set(include)]
}

function toQueueTrack(
  resource: AppleCatalogResource,
  include: QueueInclude[],
  artworkSize: number,
  lyrics?: ReturnType<typeof createLyricsOutput>,
): QueueTrack {
  const attributes = resource.attributes ?? {}
  const artwork = include.includes('artwork')
    ? resizedArtwork(attributes.artwork, artworkSize)
    : undefined
  const base = {
    id: resource.id,
    ...(getString(attributes.name) ? { title: getString(attributes.name) } : {}),
    ...(getString(attributes.artistName) ? { artist: getString(attributes.artistName) } : {}),
    ...(getString(attributes.albumName) ? { album: getString(attributes.albumName) } : {}),
    ...(getNumber(attributes.durationInMillis) !== undefined
      ? { durationMs: getNumber(attributes.durationInMillis) }
      : {}),
    ...(artwork ? { artwork } : {}),
    ...(include.includes('identifiers') && getString(attributes.isrc)
      ? { isrc: getString(attributes.isrc) }
      : {}),
    ...(include.includes('release') && getString(attributes.releaseDate)
      ? { releaseDate: getString(attributes.releaseDate) }
      : {}),
    ...(lyrics ? { lyrics } : {}),
  }
  return QueueTrackValidator.parse(base)
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

export async function lookupTrackQueueServer(
  request: TrackBatchRequest,
): Promise<TrackBatchResponse> {
  const references: AppleCatalogResourceReference[] = request.items.map((item) => ({
    type: 'songs',
    id: item.appleId,
    storefront: item.storefront ?? request.storefront ?? 'us',
  }))

  let fetched: Awaited<ReturnType<typeof fetchAppleCatalogResourcesServer>>
  try {
    fetched = await fetchAppleCatalogResourcesServer(references)
  } catch {
    return {
      items: request.items.map((item, index) => ({
        index,
        status: 'error' as const,
        appleId: item.appleId,
        message: 'Apple Music could not return this track.',
      })),
    }
  }

  const { byKey, failedKeys } = indexCatalogResults(fetched)
  const lyricPromises = new Map<string, Promise<ReturnType<typeof createLyricsOutput>>>()

  const items = await runWithConcurrency(request.items, 5, async (item, index) => {
    try {
      const storefront = item.storefront ?? request.storefront ?? 'us'
      const key = resourceKey(storefront, 'songs', item.appleId)
      if (failedKeys.has(key)) {
        return {
          index,
          status: 'error' as const,
          appleId: item.appleId,
          message: 'Apple Music could not return this track.',
        }
      }
      const resource = byKey.get(key)?.resource
      if (!resource) return { index, status: 'not_found' as const, appleId: item.appleId }

      const include = resolvedQueueIncludes(item.include, request.include)
      const artworkSize = item.artworkSize ?? request.artworkSize ?? DEFAULT_ARTWORK_SIZE
      let lyrics: ReturnType<typeof createLyricsOutput> | undefined
      if (include.includes('lyrics')) {
        const track = mapTrack(resource)
        const formats = item.lyrics?.formats ??
          request.lyrics?.formats ?? [...DEFAULT_LYRICS_FORMATS]
        const lyricsKey = JSON.stringify([resource.id, formats])
        let promise = lyricPromises.get(lyricsKey)
        if (!promise) {
          const lookup: LyricsLookup = {
            title: track.title ?? '',
            artistString: track.artist ?? '',
            ...(track.album ? { album: track.album } : {}),
            ...(track.durationMs !== undefined ? { durationSeconds: track.durationMs / 1000 } : {}),
            appleTrackId: resource.id,
          }
          promise = defaultLyricsRepository.lookupDetailed(lookup).then((details) => {
            const hasLyrics =
              details.result.provider !== null &&
              details.result.provider !== 'Fallback' &&
              details.result.lines.length > 0
            return createLyricsOutput(details.result, track, formats, hasLyrics)
          })
          lyricPromises.set(lyricsKey, promise)
        }
        lyrics = await promise
      }

      return {
        index,
        status: 'matched' as const,
        track: toQueueTrack(resource, include, artworkSize, lyrics),
      }
    } catch {
      return {
        index,
        status: 'error' as const,
        appleId: item.appleId,
        message: 'This queue item could not be completed.',
      }
    }
  })

  return { items }
}

function effectiveCatalogInclude(
  type: 'artist' | 'album' | 'playlist',
  itemInclude: CatalogInclude[] | undefined,
  request: CatalogBatchRequest,
): CatalogInclude[] {
  const defaults = request.include?.[type]
  return [...new Set<CatalogInclude>(itemInclude ?? defaults ?? ['artwork'])]
}

export async function lookupCatalogBatchServer(
  request: CatalogBatchRequest,
): Promise<CatalogBatchResponse> {
  const prepared = request.items.map((item, index) => ({
    item,
    index,
    include: effectiveCatalogInclude(item.type, item.include, request),
    storefront: item.storefront ?? request.storefront ?? 'us',
    limit: item.limit ?? request.limit ?? DEFAULT_COLLECTION_LIMIT,
    artworkSize: item.artworkSize ?? request.artworkSize ?? DEFAULT_ARTWORK_SIZE,
  }))
  const base = prepared.filter((entry) => entry.include.every((name) => name === 'artwork'))
  const expanded = prepared.filter((entry) => !base.includes(entry))
  const baseRefs = base.map(({ item, storefront }) => ({
    type: RESOURCE_TYPES[item.type],
    id: item.appleId,
    storefront,
  }))
  let baseFetched: Awaited<ReturnType<typeof fetchAppleCatalogResourcesServer>> = []
  let baseFailed = false
  if (baseRefs.length > 0) {
    try {
      baseFetched = await fetchAppleCatalogResourcesServer(baseRefs)
    } catch {
      baseFailed = true
    }
  }
  const { byKey: baseByKey, failedKeys: baseFailedKeys } = indexCatalogResults(baseFetched)

  const expandedByIndex = new Map<
    number,
    {
      entry: (typeof expanded)[number]
      resource: AppleCatalogResource | null
      storefront: string
      failed?: true
    }
  >()
  const expandedGroups = new Map<
    string,
    {
      entries: (typeof expanded)[number][]
      type: EntityResourceType
      storefront: string
      options: { include: string[]; views: string[]; extend: string[] }
    }
  >()

  for (const entry of expanded) {
    const type = RESOURCE_TYPES[entry.item.type]
    const options = getIncludeNames(type, entry.include)
    const sortedOptions = {
      include: [...options.include].sort(),
      views: [...options.views].sort(),
      extend: [...options.extend].sort(),
    }

    const groupKey = JSON.stringify([entry.storefront, type, sortedOptions])
    const group = expandedGroups.get(groupKey) ?? {
      entries: [],
      type,
      storefront: entry.storefront,
      options,
    }
    group.entries.push(entry)
    expandedGroups.set(groupKey, group)
  }

  await runWithConcurrency([...expandedGroups.values()], 5, async (group) => {
    try {
      const fetched = await fetchAppleCatalogResourcesServer(
        group.entries.map((entry) => ({
          type: group.type,
          id: entry.item.appleId,
          storefront: group.storefront,
        })),
        group.options,
      )
      const { byKey, failedKeys } = indexCatalogResults(fetched)
      for (const entry of group.entries) {
        const key = resourceKey(
          group.storefront,
          RESOURCE_TYPES[entry.item.type],
          entry.item.appleId,
        )
        const result = byKey.get(key)
        expandedByIndex.set(entry.index, {
          entry,
          resource: result?.resource ?? null,
          storefront: result?.storefront ?? group.storefront,
          ...(failedKeys.has(key) ? { failed: true } : {}),
        })
      }
    } catch {
      for (const entry of group.entries) {
        expandedByIndex.set(entry.index, {
          entry,
          resource: null,
          storefront: group.storefront,
          failed: true,
        })
      }
    }
  })

  const items = prepared.map((entry) => {
    const plural = RESOURCE_TYPES[entry.item.type]
    const isBase = base.includes(entry)
    const expandedResult = expandedByIndex.get(entry.index)
    const key = resourceKey(entry.storefront, plural, entry.item.appleId)
    const resource = isBase ? baseByKey.get(key)?.resource : expandedResult?.resource
    if (isBase && (baseFailed || baseFailedKeys.has(key))) {
      return {
        index: entry.index,
        status: 'error' as const,
        type: entry.item.type,
        appleId: entry.item.appleId,
        message: 'Apple Music could not return this catalog item.',
      }
    }
    if (expandedResult?.failed) {
      return {
        index: entry.index,
        status: 'error' as const,
        type: entry.item.type,
        appleId: entry.item.appleId,
        message: 'Apple Music could not return this catalog item.',
      }
    }
    if (!resource) {
      return {
        index: entry.index,
        status: 'not_found' as const,
        type: entry.item.type,
        appleId: entry.item.appleId,
      }
    }
    try {
      return {
        index: entry.index,
        status: 'matched' as const,
        data: mapEntity(
          plural,
          resource,
          entry.include,
          expandedResult?.storefront ?? entry.storefront,
          entry.limit,
          entry.artworkSize,
        ),
      }
    } catch {
      return {
        index: entry.index,
        status: 'error' as const,
        type: entry.item.type,
        appleId: entry.item.appleId,
        message: 'Apple Music returned unsupported catalog data.',
      }
    }
  })

  return { items }
}

export async function lookupAssetBatchServer(
  request: AssetBatchRequest,
): Promise<AssetBatchResponse> {
  const references = request.items.map((item) => ({
    type: catalogResourceType(item.type),
    id: item.appleId,
    storefront: item.storefront ?? request.storefront ?? 'us',
  }))
  let fetched: Awaited<ReturnType<typeof fetchAppleCatalogResourcesServer>>
  try {
    fetched = await fetchAppleCatalogResourcesServer(references)
  } catch {
    return {
      items: request.items.map((item, index) => ({
        index,
        status: 'error' as const,
        type: item.type,
        appleId: item.appleId,
        message: 'Apple Music could not return this artwork.',
      })),
    }
  }
  const { byKey, failedKeys } = indexCatalogResults(fetched)

  return {
    items: request.items.map((item, index) => {
      const storefront = item.storefront ?? request.storefront ?? 'us'
      const resourceType = RESOURCE_TYPES[item.type]
      const key = resourceKey(storefront, resourceType, item.appleId)
      if (failedKeys.has(key)) {
        return {
          index,
          status: 'error' as const,
          type: item.type,
          appleId: item.appleId,
          message: 'Apple Music could not return this artwork.',
        }
      }
      const resource = byKey.get(key)?.resource
      const artworkSize = item.size ?? request.size ?? DEFAULT_ARTWORK_SIZE
      const artwork = resource
        ? resizedArtwork(resource.attributes?.artwork, artworkSize)
        : undefined
      if (!resource) {
        return { index, status: 'not_found' as const, type: item.type, appleId: item.appleId }
      }
      if (!artwork) {
        return { index, status: 'unavailable' as const, type: item.type, appleId: item.appleId }
      }
      return {
        index,
        status: 'matched' as const,
        asset: {
          id: resource.id,
          type: item.type,
          ...(getString(resource.attributes?.name)
            ? { name: getString(resource.attributes?.name) }
            : {}),
          ...(getString(resource.attributes?.artistName)
            ? { artistName: getString(resource.attributes?.artistName) }
            : {}),
          artwork,
        },
      }
    }),
  }
}

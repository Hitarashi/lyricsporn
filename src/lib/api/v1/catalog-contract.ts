import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

import {
  ApiErrorResponseSchema,
  ApiJsonValueSchema,
  ArtworkSchema,
  LyricsOutputSchema,
  LyricsRequestSchema,
  MotionArtworkSchema,
  TrackSchema,
} from './contract'

extendZodWithOpenApi(z)

export const MAX_CATALOG_BATCH = 50
export const MAX_TRACK_BATCH = 50
export const MAX_ASSET_BATCH = 50
export const DEFAULT_COLLECTION_LIMIT = 20
export const MAX_COLLECTION_LIMIT = 100
export const DEFAULT_ARTWORK_SIZE = 300

export const AppleCatalogIdSchema = z
  .string()
  .regex(/^[a-z\d._-]{1,128}$/i)
  .openapi({ description: 'Apple Music catalog resource ID.', example: '462006' })

export const StorefrontSchema = z
  .string()
  .regex(/^[a-z]{2}$/i)
  .transform((storefront) => storefront.toLowerCase())
  .default('us')
  .openapi({ description: 'Two-letter Apple Music storefront code.', example: 'us' })

const ResolvedTrackStorefrontSchema = z
  .string()
  .regex(/^[a-z]{2}$/)
  .openapi({
    description: 'The Apple Music storefront that supplied this track after fallback resolution.',
    example: 'gb',
  })

export const ArtworkSizeSchema = z
  .number()
  .int()
  .min(50)
  .max(3000)
  .default(DEFAULT_ARTWORK_SIZE)
  .openapi({
    description: 'Square artwork URL dimensions in pixels. The image itself stays on Apple CDN.',
    example: 300,
  })

export const CatalogItemTypeSchema = z
  .enum([
    'song',
    'activity',
    'artist',
    'album',
    'playlist',
    'musicVideo',
    'genre',
    'recordLabel',
    'station',
    'curator',
    'appleCurator',
  ])
  .openapi('CatalogItemType')

export const CatalogItemSchema = z
  .object({
    id: AppleCatalogIdSchema,
    type: CatalogItemTypeSchema,
    name: z.string().optional(),
    artistName: z.string().optional(),
    albumName: z.string().optional(),
    albumArtistName: z.string().optional(),
    curatorName: z.string().optional(),
    url: z.string().url().optional(),
    artwork: ArtworkSchema.optional(),
    motionArtwork: MotionArtworkSchema.nullable().optional(),
    genres: z.array(z.string()).optional(),
    releaseDate: z.string().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    trackCount: z.number().int().nonnegative().optional(),
    isrc: z.string().optional(),
    contentRating: z.string().optional(),
    playlistType: z.string().optional(),
  })
  .strict()
  .openapi('CatalogItem', {
    description: 'Compact normalized Apple Music catalog resource used in related collections.',
  })

export const CatalogCollectionSchema = z
  .object({
    items: z.array(CatalogItemSchema),
    next: z.string().optional().openapi({
      description: 'Next Lyricsporn collection URL when Apple provides another page.',
    }),
  })
  .strict()
  .openapi('CatalogCollection')

export const CatalogSearchTypeSchema = z
  .enum([
    'activities',
    'albums',
    'apple-curators',
    'artists',
    'curators',
    'music-videos',
    'playlists',
    'record-labels',
    'songs',
    'stations',
  ])
  .openapi('CatalogSearchType')

export const DEFAULT_CATALOG_SEARCH_TYPES = ['songs', 'albums', 'artists', 'playlists'] as const

export const CatalogSearchQuerySchema = z
  .object({
    term: z.string().trim().min(1).max(256).openapi({
      description: 'Free-text Apple Music catalog query.',
      example: 'Daft Punk Discovery',
    }),
    storefront: StorefrontSchema,
    types: z.string().optional().openapi({
      description:
        'Comma-separated Apple catalog types: activities, albums, apple-curators, artists, curators, music-videos, playlists, record-labels, songs, or stations. Defaults to songs.',
      example: 'songs,albums,artists',
    }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(25)
      .default(5)
      .openapi({ description: 'Maximum results per type, from 1 to 25.', example: 5 }),
    offset: z.coerce.number().int().nonnegative().default(0).openapi({
      description:
        'Apple catalog result offset. Prefer each result group’s next URL for pagination.',
      example: 0,
    }),
    artworkSize: z.coerce.number().int().min(50).max(3000).default(DEFAULT_ARTWORK_SIZE),
    include: z.string().optional().openapi({
      description:
        'Comma-separated optional result sections. Use motionArtwork to request Apple motion video URLs for songs and albums.',
      example: 'motionArtwork',
    }),
  })
  .strict()
  .openapi('CatalogSearchQuery')

export const CatalogSearchHintsQuerySchema = z
  .object({
    term: z.string().trim().min(1).max(256).openapi({
      description: 'Partial free-text Apple Music catalog query.',
      example: 'Daft',
    }),
    storefront: StorefrontSchema,
    limit: z.coerce.number().int().min(1).max(25).default(10).openapi({
      description: 'Maximum number of autocomplete terms, from 1 to 25.',
      example: 10,
    }),
  })
  .strict()
  .openapi('CatalogSearchHintsQuery')

export const CatalogSearchSuggestionKindSchema = z.enum(['terms', 'topResults'])

export const CatalogSearchSuggestionsQuerySchema = z
  .object({
    term: z.string().trim().min(1).max(256).openapi({
      description: 'Partial free-text Apple Music catalog query.',
      example: 'Daft',
    }),
    storefront: StorefrontSchema,
    kinds: z.string().optional().openapi({
      description: 'Comma-separated suggestion kinds: terms or topResults. Defaults to both.',
      example: 'terms,topResults',
    }),
    types: z.string().optional().openapi({
      description:
        'Comma-separated Apple catalog types to include in topResults. Supports activities, albums, apple-curators, artists, curators, music-videos, playlists, record-labels, songs, and stations. If omitted with topResults requested, defaults to songs, albums, artists, and playlists.',
      example: 'songs,albums,artists',
    }),
    limit: z.coerce.number().int().min(1).max(10).default(5).openapi({
      description: 'Maximum suggestions, from 1 to 10.',
      example: 5,
    }),
    artworkSize: z.coerce.number().int().min(50).max(3000).default(DEFAULT_ARTWORK_SIZE),
    include: z.string().optional().openapi({
      description:
        'Comma-separated optional result sections. Use motionArtwork to request video URLs for song or album top results.',
      example: 'motionArtwork',
    }),
  })
  .strict()
  .openapi('CatalogSearchSuggestionsQuery')

export const CatalogSearchResultGroupSchema = z
  .object({
    items: z.array(CatalogItemSchema),
    next: z.string().optional().openapi({
      description: 'Next proxied Lyricsporn search URL for this resource type.',
    }),
  })
  .strict()
  .openapi('CatalogSearchResultGroup')

export const CatalogSearchResponseSchema = z
  .object({
    term: z.string(),
    storefront: StorefrontSchema,
    results: z
      .object({
        activities: CatalogSearchResultGroupSchema.optional(),
        albums: CatalogSearchResultGroupSchema.optional(),
        appleCurators: CatalogSearchResultGroupSchema.optional(),
        artists: CatalogSearchResultGroupSchema.optional(),
        curators: CatalogSearchResultGroupSchema.optional(),
        musicVideos: CatalogSearchResultGroupSchema.optional(),
        playlists: CatalogSearchResultGroupSchema.optional(),
        recordLabels: CatalogSearchResultGroupSchema.optional(),
        songs: CatalogSearchResultGroupSchema.optional(),
        stations: CatalogSearchResultGroupSchema.optional(),
      })
      .strict(),
  })
  .strict()
  .openapi('CatalogSearchResponse')

export const CatalogSearchHintsResponseSchema = z
  .object({
    term: z.string(),
    storefront: StorefrontSchema,
    terms: z.array(z.string()),
  })
  .strict()
  .openapi('CatalogSearchHintsResponse')

export const CatalogSearchSuggestionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('terms'),
      searchTerm: z.string(),
      displayTerm: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('topResults'),
      content: CatalogItemSchema,
    })
    .strict(),
])

export const CatalogSearchSuggestionsResponseSchema = z
  .object({
    term: z.string(),
    storefront: StorefrontSchema,
    suggestions: z.array(CatalogSearchSuggestionSchema),
  })
  .strict()
  .openapi('CatalogSearchSuggestionsResponse')

const EditorialNotesSchema = z
  .object({
    standard: z.string().optional(),
    short: z.string().optional(),
  })
  .strict()

const ArtistCollectionsSchema = z
  .object({
    albums: CatalogCollectionSchema.optional(),
    genres: CatalogCollectionSchema.optional(),
    musicVideos: CatalogCollectionSchema.optional(),
    playlists: CatalogCollectionSchema.optional(),
    station: CatalogCollectionSchema.optional(),
    topSongs: CatalogCollectionSchema.optional(),
    latestRelease: CatalogCollectionSchema.optional(),
    featuredAlbums: CatalogCollectionSchema.optional(),
    featuredPlaylists: CatalogCollectionSchema.optional(),
    featuredMusicVideos: CatalogCollectionSchema.optional(),
    topMusicVideos: CatalogCollectionSchema.optional(),
    fullAlbums: CatalogCollectionSchema.optional(),
    singles: CatalogCollectionSchema.optional(),
    liveAlbums: CatalogCollectionSchema.optional(),
    appearsOnAlbums: CatalogCollectionSchema.optional(),
    compilationAlbums: CatalogCollectionSchema.optional(),
    similarArtists: CatalogCollectionSchema.optional(),
  })
  .strict()

const AlbumCollectionsSchema = z
  .object({
    artists: CatalogCollectionSchema.optional(),
    genres: CatalogCollectionSchema.optional(),
    tracks: CatalogCollectionSchema.optional(),
    recordLabels: CatalogCollectionSchema.optional(),
    appearsOn: CatalogCollectionSchema.optional(),
    otherVersions: CatalogCollectionSchema.optional(),
    relatedAlbums: CatalogCollectionSchema.optional(),
    relatedVideos: CatalogCollectionSchema.optional(),
  })
  .strict()

const PlaylistCollectionsSchema = z
  .object({
    curator: CatalogCollectionSchema.optional(),
    tracks: CatalogCollectionSchema.optional(),
    featuredArtists: CatalogCollectionSchema.optional(),
    moreByCurator: CatalogCollectionSchema.optional(),
  })
  .strict()

export const ArtistSchema = z
  .object({
    id: AppleCatalogIdSchema,
    type: z.literal('artist'),
    name: z.string(),
    url: z.string().url().optional(),
    genres: z.array(z.string()).optional(),
    artwork: ArtworkSchema.optional(),
    editorialNotes: EditorialNotesSchema.optional(),
    collections: ArtistCollectionsSchema.optional(),
  })
  .strict()
  .openapi('Artist')

export const AlbumSchema = z
  .object({
    id: AppleCatalogIdSchema,
    type: z.literal('album'),
    name: z.string(),
    artistName: z.string().optional(),
    artistUrl: z.string().url().optional(),
    url: z.string().url().optional(),
    artwork: ArtworkSchema.optional(),
    motionArtwork: MotionArtworkSchema.nullable().optional(),
    genres: z.array(z.string()).optional(),
    releaseDate: z.string().optional(),
    trackCount: z.number().int().nonnegative().optional(),
    contentRating: z.string().optional(),
    copyright: z.string().optional(),
    recordLabel: z.string().optional(),
    upc: z.string().optional(),
    audioVariants: z.array(z.string()).optional(),
    isSingle: z.boolean().optional(),
    isCompilation: z.boolean().optional(),
    isComplete: z.boolean().optional(),
    isMasteredForItunes: z.boolean().optional(),
    editorialNotes: EditorialNotesSchema.optional(),
    collections: AlbumCollectionsSchema.optional(),
  })
  .strict()
  .openapi('Album')

export const PlaylistSchema = z
  .object({
    id: AppleCatalogIdSchema,
    type: z.literal('playlist'),
    name: z.string(),
    curatorName: z.string().optional(),
    description: EditorialNotesSchema.optional(),
    url: z.string().url().optional(),
    artwork: ArtworkSchema.optional(),
    isChart: z.boolean().optional(),
    lastModifiedDate: z.string().optional(),
    playlistType: z.string().optional(),
    trackTypes: z.array(z.string()).optional(),
    collections: PlaylistCollectionsSchema.optional(),
  })
  .strict()
  .openapi('Playlist')

export const CatalogEntitySchema = z.discriminatedUnion('type', [
  ArtistSchema,
  AlbumSchema,
  PlaylistSchema,
])

export const ArtistIncludeSchema = z.enum([
  'editorialNotes',
  'albums',
  'genres',
  'musicVideos',
  'playlists',
  'station',
  'topSongs',
  'latestRelease',
  'featuredAlbums',
  'featuredPlaylists',
  'featuredMusicVideos',
  'topMusicVideos',
  'fullAlbums',
  'singles',
  'liveAlbums',
  'appearsOnAlbums',
  'compilationAlbums',
  'similarArtists',
])

export const AlbumIncludeSchema = z.enum([
  'artists',
  'genres',
  'tracks',
  'recordLabels',
  'appearsOn',
  'otherVersions',
  'relatedAlbums',
  'relatedVideos',
  'editorialNotes',
  'artistUrl',
  'audioVariants',
  'motionArtwork',
])

export const PlaylistIncludeSchema = z.enum([
  'curator',
  'tracks',
  'description',
  'trackTypes',
  'featuredArtists',
  'moreByCurator',
])

export const CatalogIncludeSchema = z.union([
  z.literal('artwork'),
  ArtistIncludeSchema,
  AlbumIncludeSchema,
  PlaylistIncludeSchema,
])

export const CatalogGetQuerySchema = z
  .object({
    storefront: StorefrontSchema,
    include: z.string().optional().openapi({
      description:
        'Comma-separated optional collections, relationship views, or extended fields for this resource. Use artwork to request artwork and motionArtwork on albums to request motion video URLs.',
      example: 'topSongs,latestRelease',
    }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_COLLECTION_LIMIT)
      .default(DEFAULT_COLLECTION_LIMIT)
      .openapi({ description: 'Maximum items in each requested collection.', example: 10 }),
    artworkSize: z.coerce.number().int().min(50).max(3000).default(DEFAULT_ARTWORK_SIZE),
  })
  .strict()

export const CatalogBatchItemSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: z.literal('artist'),
        appleId: AppleCatalogIdSchema,
        storefront: StorefrontSchema.optional(),
        include: z
          .array(z.union([ArtistIncludeSchema, z.literal('artwork')]))
          .max(19)
          .optional(),
        limit: z.number().int().min(1).max(MAX_COLLECTION_LIMIT).optional(),
        artworkSize: z.number().int().min(50).max(3000).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('album'),
        appleId: AppleCatalogIdSchema,
        storefront: StorefrontSchema.optional(),
        include: z
          .array(z.union([AlbumIncludeSchema, z.literal('artwork')]))
          .max(13)
          .optional(),
        limit: z.number().int().min(1).max(MAX_COLLECTION_LIMIT).optional(),
        artworkSize: z.number().int().min(50).max(3000).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('playlist'),
        appleId: AppleCatalogIdSchema,
        storefront: StorefrontSchema.optional(),
        include: z
          .array(z.union([PlaylistIncludeSchema, z.literal('artwork')]))
          .max(7)
          .optional(),
        limit: z.number().int().min(1).max(MAX_COLLECTION_LIMIT).optional(),
        artworkSize: z.number().int().min(50).max(3000).optional(),
      })
      .strict(),
  ])
  .openapi('CatalogBatchItem')

export const CatalogBatchRequestSchema = z
  .object({
    storefront: StorefrontSchema.optional(),
    include: z
      .object({
        artist: z.array(z.union([ArtistIncludeSchema, z.literal('artwork')])).optional(),
        album: z.array(z.union([AlbumIncludeSchema, z.literal('artwork')])).optional(),
        playlist: z.array(z.union([PlaylistIncludeSchema, z.literal('artwork')])).optional(),
      })
      .strict()
      .optional(),
    limit: z.number().int().min(1).max(MAX_COLLECTION_LIMIT).optional(),
    artworkSize: z.number().int().min(50).max(3000).optional(),
    items: z.array(CatalogBatchItemSchema).min(1).max(MAX_CATALOG_BATCH),
  })
  .strict()
  .openapi('CatalogBatchRequest')

export const CatalogBatchItemResultSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        index: z.number().int().nonnegative(),
        status: z.literal('matched'),
        data: CatalogEntitySchema,
      })
      .strict(),
    z
      .object({
        index: z.number().int().nonnegative(),
        status: z.literal('not_found'),
        type: z.enum(['artist', 'album', 'playlist']),
        appleId: AppleCatalogIdSchema,
      })
      .strict(),
    z
      .object({
        index: z.number().int().nonnegative(),
        status: z.literal('error'),
        type: z.enum(['artist', 'album', 'playlist']),
        appleId: AppleCatalogIdSchema,
        message: z.string(),
      })
      .strict(),
  ])
  .openapi('CatalogBatchItemResult')

export const CatalogBatchResponseSchema = z
  .object({ items: z.array(CatalogBatchItemResultSchema) })
  .strict()
  .openapi('CatalogBatchResponse')

export const CatalogCollectionNameSchema = z.enum([
  'albums',
  'genres',
  'musicVideos',
  'playlists',
  'station',
  'topSongs',
  'latestRelease',
  'featuredAlbums',
  'featuredPlaylists',
  'featuredMusicVideos',
  'topMusicVideos',
  'fullAlbums',
  'singles',
  'liveAlbums',
  'appearsOnAlbums',
  'compilationAlbums',
  'similarArtists',
  'artists',
  'tracks',
  'recordLabels',
  'otherVersions',
  'appearsOn',
  'relatedAlbums',
  'relatedVideos',
  'curator',
  'featuredArtists',
  'moreByCurator',
])

export const ArtistCollectionNameSchema = z.enum([
  'albums',
  'genres',
  'musicVideos',
  'playlists',
  'station',
  'topSongs',
  'latestRelease',
  'featuredAlbums',
  'featuredPlaylists',
  'featuredMusicVideos',
  'topMusicVideos',
  'fullAlbums',
  'singles',
  'liveAlbums',
  'appearsOnAlbums',
  'compilationAlbums',
  'similarArtists',
])

export const AlbumCollectionNameSchema = z.enum([
  'artists',
  'genres',
  'tracks',
  'recordLabels',
  'appearsOn',
  'otherVersions',
  'relatedAlbums',
  'relatedVideos',
])

export const PlaylistCollectionNameSchema = z.enum([
  'curator',
  'tracks',
  'featuredArtists',
  'moreByCurator',
])

export const CatalogCollectionQuerySchema = z
  .object({
    storefront: StorefrontSchema,
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_COLLECTION_LIMIT)
      .default(DEFAULT_COLLECTION_LIMIT),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
    artworkSize: z.coerce.number().int().min(50).max(3000).default(DEFAULT_ARTWORK_SIZE),
    include: z.string().optional().openapi({
      description:
        'Comma-separated optional item sections. Use motionArtwork for song or album items in this page.',
      example: 'motionArtwork',
    }),
  })
  .strict()

export const CatalogCollectionResponseSchema = z
  .object({
    type: CatalogCollectionNameSchema,
    items: z.array(CatalogItemSchema),
    page: z
      .object({
        limit: z.number().int().positive(),
        offset: z.number().int().nonnegative(),
        next: z.string().optional(),
      })
      .strict(),
  })
  .strict()
  .openapi('CatalogCollectionResponse')

export const TrackDetailQuerySchema = z
  .object({
    storefront: StorefrontSchema,
    include: z.string().optional().openapi({
      description:
        'Comma-separated optional sections: artwork, motionArtwork, artists, album, lyrics, and appleCatalog.',
      example: 'artwork,motionArtwork,artists,album,lyrics',
    }),
    formats: z.string().optional().openapi({
      description: 'Comma-separated lyrics formats: json, ttml, elrc.',
      example: 'json,ttml',
    }),
    artworkSize: z.coerce.number().int().min(50).max(3000).default(DEFAULT_ARTWORK_SIZE),
  })
  .strict()

export const TrackAppleIdSchema = z
  .string()
  .regex(/^\d{1,20}$/)
  .openapi({ description: 'Numeric Apple Music song ID.', example: '1082506273' })

export const TrackDetailSchema = TrackSchema.extend({
  id: TrackAppleIdSchema,
  url: z.string().url().optional(),
  artwork: ArtworkSchema.optional(),
  motionArtwork: MotionArtworkSchema.nullable().optional(),
  artists: z.array(CatalogItemSchema).optional(),
  albumResource: CatalogItemSchema.optional(),
  hasLyrics: z.boolean().optional(),
}).openapi('TrackDetail')

export const TrackDetailResponseSchema = z
  .object({
    storefront: ResolvedTrackStorefrontSchema,
    track: TrackDetailSchema,
    lyrics: LyricsOutputSchema.optional(),
    appleCatalog: z
      .object({ storefront: z.string(), response: ApiJsonValueSchema })
      .strict()
      .optional()
      .openapi({
        description:
          'Raw Apple Music Catalog response. Returned only when appleCatalog is included.',
      }),
  })
  .strict()
  .openapi('TrackDetailResponse')

export const TrackDetailIncludeSchema = z.enum([
  'artwork',
  'motionArtwork',
  'artists',
  'album',
  'lyrics',
  'appleCatalog',
])

export const QueueIncludeSchema = z.enum([
  'artwork',
  'motionArtwork',
  'identifiers',
  'release',
  'lyrics',
])

export const QueueTrackRequestItemSchema = z
  .object({
    appleId: TrackAppleIdSchema,
    storefront: StorefrontSchema.optional(),
    include: z.array(QueueIncludeSchema).max(5).optional(),
    lyrics: LyricsRequestSchema.optional(),
    artworkSize: z.number().int().min(50).max(3000).optional(),
  })
  .strict()

export const TrackBatchRequestSchema = z
  .object({
    storefront: StorefrontSchema.optional(),
    include: z.array(QueueIncludeSchema).max(5).optional(),
    lyrics: LyricsRequestSchema.optional(),
    artworkSize: z.number().int().min(50).max(3000).optional(),
    items: z.array(QueueTrackRequestItemSchema).min(1).max(MAX_TRACK_BATCH),
  })
  .strict()
  .openapi('TrackBatchRequest', {
    description: 'Batch track metadata for a player queue. Item options override request defaults.',
  })

export const QueueTrackSchema = z
  .object({
    id: TrackAppleIdSchema,
    storefront: ResolvedTrackStorefrontSchema,
    title: z.string().optional(),
    artist: z.string().optional(),
    album: z.string().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    artwork: ArtworkSchema.optional(),
    motionArtwork: MotionArtworkSchema.nullable().optional(),
    isrc: z.string().optional(),
    releaseDate: z.string().optional(),
    lyrics: LyricsOutputSchema.optional(),
  })
  .strict()
  .openapi('QueueTrack')

export const TrackBatchItemResultSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        index: z.number().int().nonnegative(),
        status: z.literal('matched'),
        track: QueueTrackSchema,
      })
      .strict(),
    z
      .object({
        index: z.number().int().nonnegative(),
        status: z.literal('not_found'),
        appleId: TrackAppleIdSchema,
      })
      .strict(),
    z
      .object({
        index: z.number().int().nonnegative(),
        status: z.literal('error'),
        appleId: TrackAppleIdSchema,
        message: z.string(),
      })
      .strict(),
  ])
  .openapi('TrackBatchItemResult')

export const TrackBatchResponseSchema = z
  .object({ items: z.array(TrackBatchItemResultSchema) })
  .strict()
  .openapi('TrackBatchResponse')

export const AssetTypeSchema = z.enum(['song', 'artist', 'album', 'playlist'])
const AssetIncludeSchema = z.array(z.literal('motionArtwork')).max(1)

export const AssetBatchItemSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: z.literal('song'),
        appleId: TrackAppleIdSchema,
        storefront: StorefrontSchema.optional(),
        size: z.number().int().min(50).max(3000).optional(),
        include: AssetIncludeSchema.optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('artist'),
        appleId: AppleCatalogIdSchema,
        storefront: StorefrontSchema.optional(),
        size: z.number().int().min(50).max(3000).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('album'),
        appleId: AppleCatalogIdSchema,
        storefront: StorefrontSchema.optional(),
        size: z.number().int().min(50).max(3000).optional(),
        include: AssetIncludeSchema.optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('playlist'),
        appleId: AppleCatalogIdSchema,
        storefront: StorefrontSchema.optional(),
        size: z.number().int().min(50).max(3000).optional(),
      })
      .strict(),
  ])
  .openapi('AssetBatchItem')

export const AssetBatchRequestSchema = z
  .object({
    storefront: StorefrontSchema.optional(),
    size: ArtworkSizeSchema.optional(),
    include: AssetIncludeSchema.optional().openapi({
      description:
        'Optional asset sections for songs and albums. Item-level include overrides this value.',
      example: ['motionArtwork'],
    }),
    items: z.array(AssetBatchItemSchema).min(1).max(MAX_ASSET_BATCH),
  })
  .strict()
  .openapi('AssetBatchRequest')

export const AssetSchema = z
  .object({
    id: AppleCatalogIdSchema,
    type: AssetTypeSchema,
    name: z.string().optional(),
    artistName: z.string().optional(),
    artwork: ArtworkSchema.optional(),
    motionArtwork: MotionArtworkSchema.nullable().optional(),
  })
  .strict()
  .openapi('Asset')

export const AssetBatchItemResultSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        index: z.number().int().nonnegative(),
        status: z.literal('matched'),
        asset: AssetSchema,
      })
      .strict(),
    z
      .object({
        index: z.number().int().nonnegative(),
        status: z.literal('not_found'),
        type: AssetTypeSchema,
        appleId: AppleCatalogIdSchema,
      })
      .strict(),
    z
      .object({
        index: z.number().int().nonnegative(),
        status: z.literal('unavailable'),
        type: AssetTypeSchema,
        appleId: AppleCatalogIdSchema,
      })
      .strict(),
    z
      .object({
        index: z.number().int().nonnegative(),
        status: z.literal('error'),
        type: AssetTypeSchema,
        appleId: AppleCatalogIdSchema,
        message: z.string(),
      })
      .strict(),
  ])
  .openapi('AssetBatchItemResult')

export const AssetBatchResponseSchema = z
  .object({ items: z.array(AssetBatchItemResultSchema) })
  .strict()
  .openapi('AssetBatchResponse')

export const SingleCatalogResponseSchema = z
  .object({ data: CatalogEntitySchema })
  .strict()
  .openapi('SingleCatalogResponse')

export const SingleTrackErrorSchema = ApiErrorResponseSchema

export type CatalogEntity = z.infer<typeof CatalogEntitySchema>
export type CatalogItem = z.infer<typeof CatalogItemSchema>
export type CatalogCollectionItem = CatalogItem
export type CatalogInclude = z.infer<typeof CatalogIncludeSchema>
export type Artist = z.infer<typeof ArtistSchema>
export type Album = z.infer<typeof AlbumSchema>
export type Playlist = z.infer<typeof PlaylistSchema>
export type CatalogBatchItem = z.infer<typeof CatalogBatchItemSchema>
export type CatalogBatchRequest = z.infer<typeof CatalogBatchRequestSchema>
export type CatalogBatchResponse = z.infer<typeof CatalogBatchResponseSchema>
export type CatalogBatchItemResult = z.infer<typeof CatalogBatchItemResultSchema>
export type CatalogCollectionName = z.infer<typeof CatalogCollectionNameSchema>
export type CatalogSearchQuery = z.infer<typeof CatalogSearchQuerySchema>
export type CatalogSearchResponse = z.infer<typeof CatalogSearchResponseSchema>
export type CatalogSearchResultGroup = z.infer<typeof CatalogSearchResultGroupSchema>
export type CatalogSearchHintsQuery = z.infer<typeof CatalogSearchHintsQuerySchema>
export type CatalogSearchHintsResponse = z.infer<typeof CatalogSearchHintsResponseSchema>
export type CatalogSearchSuggestion = z.infer<typeof CatalogSearchSuggestionSchema>
export type CatalogSearchSuggestionKind = z.infer<typeof CatalogSearchSuggestionKindSchema>
export type CatalogSearchSuggestionsQuery = z.infer<typeof CatalogSearchSuggestionsQuerySchema>
export type CatalogSearchSuggestionsResponse = z.infer<
  typeof CatalogSearchSuggestionsResponseSchema
>
export type CatalogSearchType = z.infer<typeof CatalogSearchTypeSchema>
export type ArtistCollectionName = z.infer<typeof ArtistCollectionNameSchema>
export type AlbumCollectionName = z.infer<typeof AlbumCollectionNameSchema>
export type PlaylistCollectionName = z.infer<typeof PlaylistCollectionNameSchema>
export type CatalogCollectionResponse = z.infer<typeof CatalogCollectionResponseSchema>
export type TrackDetailQuery = z.infer<typeof TrackDetailQuerySchema>
export type TrackDetailResponse = z.infer<typeof TrackDetailResponseSchema>
export type AppleCatalogRaw = z.infer<typeof TrackDetailResponseSchema>['appleCatalog']
export type TrackDetailInclude = z.infer<typeof TrackDetailIncludeSchema>
export type TrackBatchRequest = z.infer<typeof TrackBatchRequestSchema>
export type TrackBatchResponse = z.infer<typeof TrackBatchResponseSchema>
export type TrackBatchItemResult = z.infer<typeof TrackBatchItemResultSchema>
export type QueueTrackRequestItem = z.infer<typeof QueueTrackRequestItemSchema>
export type QueueInclude = z.infer<typeof QueueIncludeSchema>
export type QueueTrack = z.infer<typeof QueueTrackSchema>
export type AssetBatchRequest = z.infer<typeof AssetBatchRequestSchema>
export type AssetBatchResponse = z.infer<typeof AssetBatchResponseSchema>
export type AssetBatchItemResult = z.infer<typeof AssetBatchItemResultSchema>
export type AssetType = z.infer<typeof AssetTypeSchema>

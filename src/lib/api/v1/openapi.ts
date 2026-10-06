import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

import {
  AlbumCollectionNameSchema,
  AlbumGetQuerySchema,
  AlbumSchema,
  AppleCatalogIdSchema,
  ArtistCollectionNameSchema,
  ArtistGetQuerySchema,
  ArtistSchema,
  AssetBatchRequestSchema,
  AssetBatchResponseSchema,
  CatalogBatchRequestSchema,
  CatalogBatchResponseSchema,
  CatalogCollectionQuerySchema,
  CatalogCollectionResponseSchema,
  CatalogSearchHintsQuerySchema,
  CatalogSearchHintsResponseSchema,
  CatalogSearchQuerySchema,
  CatalogSearchResponseSchema,
  CatalogSearchSuggestionsQuerySchema,
  CatalogSearchSuggestionsResponseSchema,
  PlaylistCollectionNameSchema,
  PlaylistGetQuerySchema,
  PlaylistSchema,
  RecordLabelCollectionNameSchema,
  RecordLabelCollectionResponseSchema,
  RecordLabelGetQuerySchema,
  RecordLabelSchema,
  TrackAppleIdSchema,
  TrackBatchRequestSchema,
  TrackBatchResponseSchema,
  TrackDetailQuerySchema,
  TrackDetailResponseSchema,
} from './catalog-contract'
import { ApiErrorResponseSchema } from './contract'

const registry = new OpenAPIRegistry()

registry.registerPath({
  method: 'get',
  path: '/api/v1/catalog/search',
  tags: ['Apple catalog'],
  summary: 'Search the Apple Music catalog',
  description:
    'Search Apple Music with one free-text term. `types` selects one or more resource groups and defaults to songs. Results are normalized into compact catalog items. Add `include=motionArtwork` to request video URLs for song and album results. Each group can include a proxied `next` URL for its next page.',
  request: {
    query: CatalogSearchQuerySchema,
  },
  responses: {
    200: {
      description: 'Normalized results grouped by requested Apple catalog type.',
      content: { 'application/json': { schema: CatalogSearchResponseSchema } },
    },
    400: {
      description: 'Invalid term, types, storefront, or pagination options.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
    500: {
      description: 'Apple Music search failed.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/catalog/search/hints',
  tags: ['Apple catalog'],
  summary: 'Get Apple Music search hints',
  description:
    'Return Apple Music autocomplete query terms for partial text. Use the returned term with the catalog search route.',
  request: {
    query: CatalogSearchHintsQuerySchema,
  },
  responses: {
    200: {
      description: 'Suggested query terms.',
      content: { 'application/json': { schema: CatalogSearchHintsResponseSchema } },
    },
    400: {
      description: 'Invalid term, storefront, or limit.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
    500: {
      description: 'Apple Music search hints failed.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/catalog/search/suggestions',
  tags: ['Apple catalog'],
  summary: 'Get Apple Music search suggestions',
  description:
    'Return Apple Music query suggestions, top catalog results, or both. `types` filters top results and has no effect on query term suggestions. If `types` is omitted with `topResults`, the proxy requests songs, albums, artists, and playlists. Add `include=motionArtwork` to request video URLs for song and album top results.',
  request: {
    query: CatalogSearchSuggestionsQuerySchema,
  },
  responses: {
    200: {
      description: 'A mixed list of query term and normalized catalog suggestions.',
      content: { 'application/json': { schema: CatalogSearchSuggestionsResponseSchema } },
    },
    400: {
      description: 'Invalid term, kinds, types, storefront, or limit.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
    500: {
      description: 'Apple Music search suggestions failed.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/tracks/{appleId}',
  tags: ['Tracks'],
  summary: 'Get full track details',
  description:
    'Fetch one Apple Music song by catalog ID. The requested storefront is tried first (default: us); if the track is missing, the lookup tries us, gb, ca, au, in, and jp. The response storefront identifies where it was found. Core track metadata is returned directly. Artwork, motion artwork, linked artist and album resources, lyrics, and the raw Apple response can be selected with include. A song uses its album motion artwork when Apple does not provide a song-level video. Lyrics are resolved through all supported lyrics providers.',
  request: {
    params: z.object({ appleId: TrackAppleIdSchema }),
    query: TrackDetailQuerySchema,
  },
  responses: {
    200: {
      description: 'Full normalized track details and requested sections.',
      content: { 'application/json': { schema: TrackDetailResponseSchema } },
    },
    400: {
      description: 'Invalid Apple ID or query options.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
    404: {
      description: 'Track was not found in the Apple Music Catalog.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
    500: {
      description: 'Apple Music or lyrics lookup failed.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/tracks/batch',
  tags: ['Tracks'],
  summary: 'Hydrate a playback queue',
  description:
    'Resolve up to 50 Apple song IDs in batched Apple catalog requests. Results preserve input order and duplicate queue entries. Each requested storefront is tried first; missing tracks are retried across us, gb, ca, au, in, and jp, and each matched track reports the storefront that supplied it. The default projection contains title, artist, album, duration, and artwork. Request `motionArtwork` only for items or screens that need Apple video URLs. Each item can override request-wide includes and artwork size. Lyrics are fetched only for items that request them.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: TrackBatchRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'An ordered result for every queue item.',
      content: { 'application/json': { schema: TrackBatchResponseSchema } },
    },
    400: {
      description: 'Invalid batch request.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
    500: {
      description: 'The queue batch could not be completed.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
  },
})

for (const [resource, responseSchema, querySchema, summary, description] of [
  [
    'artists',
    ArtistSchema,
    ArtistGetQuerySchema,
    'Get artist details',
    'Fetch an Apple Music artist header, genres, and requested Apple artist collections or views.',
  ],
  [
    'albums',
    AlbumSchema,
    AlbumGetQuerySchema,
    'Get album details',
    'Fetch Apple Music album metadata and optionally its motion artwork, tracks, artists, genres, labels, or relationship views such as appears-on, other versions, related albums, and related videos.',
  ],
  [
    'playlists',
    PlaylistSchema,
    PlaylistGetQuerySchema,
    'Get playlist details',
    'Fetch Apple Music playlist metadata and optionally its curator, tracks, featured artists, or more by curator view.',
  ],
  [
    'record-labels',
    RecordLabelSchema,
    RecordLabelGetQuerySchema,
    'Get record label details',
    'Fetch Apple Music record label metadata and optionally its latest releases or top releases views.',
  ],
] as const) {
  registry.registerPath({
    method: 'get',
    path: `/api/v1/${resource}/{appleId}`,
    tags: ['Apple catalog'],
    summary,
    description,
    request: {
      params: z.object({ appleId: AppleCatalogIdSchema }),
      query: querySchema,
    },
    responses: {
      200: {
        description: 'Normalized Apple Music catalog resource.',
        content: {
          'application/json': { schema: z.object({ data: responseSchema }).strict() },
        },
      },
      400: {
        description: 'Invalid Apple ID or include option.',
        content: { 'application/json': { schema: ApiErrorResponseSchema } },
      },
      404: {
        description: 'Resource was not found in the Apple Music Catalog.',
        content: { 'application/json': { schema: ApiErrorResponseSchema } },
      },
      500: {
        description: 'Apple Music lookup failed.',
        content: { 'application/json': { schema: ApiErrorResponseSchema } },
      },
    },
  })
}

const collectionNameSchemas = {
  artists: ArtistCollectionNameSchema,
  albums: AlbumCollectionNameSchema,
  playlists: PlaylistCollectionNameSchema,
  'record-labels': RecordLabelCollectionNameSchema,
} as const

for (const resource of ['artists', 'albums', 'playlists', 'record-labels'] as const) {
  registry.registerPath({
    method: 'get',
    path: `/api/v1/${resource}/{appleId}/collections/{collection}`,
    tags: ['Apple catalog'],
    summary: `Get a paginated ${resource.slice(0, -1)} collection`,
    description:
      'Fetch one relationship or curated view page from Apple Music. Add `include=motionArtwork` to request video URLs for song or album items in the page. Use the returned page.next URL to continue. Limit and offset let clients request only the data needed for the current screen.',
    request: {
      params: z.object({
        appleId: AppleCatalogIdSchema,
        collection: collectionNameSchemas[resource],
      }),
      query: CatalogCollectionQuerySchema,
    },
    responses: {
      200: {
        description: 'One collection page of normalized catalog items.',
        content: {
          'application/json': {
            schema:
              resource === 'record-labels'
                ? RecordLabelCollectionResponseSchema
                : CatalogCollectionResponseSchema,
          },
        },
      },
      400: {
        description: 'Invalid collection name or pagination options.',
        content: { 'application/json': { schema: ApiErrorResponseSchema } },
      },
      404: {
        description: 'The catalog resource was not found.',
        content: { 'application/json': { schema: ApiErrorResponseSchema } },
      },
      500: {
        description: 'Apple Music lookup failed.',
        content: { 'application/json': { schema: ApiErrorResponseSchema } },
      },
    },
  })
}

registry.registerPath({
  method: 'post',
  path: '/api/v1/catalog/batch',
  tags: ['Apple catalog'],
  summary: 'Fetch mixed artist, album, and playlist details',
  description:
    'Resolve up to 50 Apple catalog IDs in input order. Base resources are fetched with Apple’s typed multi-ID endpoint. Optional per-type includes and per-item overrides request collections, artist views, or album motion artwork only when needed.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: CatalogBatchRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'An ordered matched, not-found, or error result per catalog item.',
      content: { 'application/json': { schema: CatalogBatchResponseSchema } },
    },
    400: {
      description: 'Invalid batch request.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
    500: {
      description: 'The batch could not be completed.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/assets/batch',
  tags: ['Artwork'],
  summary: 'Fetch artwork URLs for mixed Apple resources',
  description:
    'Resolve artwork for up to 50 songs, artists, albums, or playlists in one Apple catalog batch request. The optional `motionArtwork` include adds Apple video URLs for songs and albums. Image and video bytes are fetched directly by the client.',
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: AssetBatchRequestSchema } },
    },
  },
  responses: {
    200: {
      description: 'An ordered artwork result per asset request.',
      content: { 'application/json': { schema: AssetBatchResponseSchema } },
    },
    400: {
      description: 'Invalid asset request.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
    500: {
      description: 'The asset batch could not be completed.',
      content: { 'application/json': { schema: ApiErrorResponseSchema } },
    },
  },
})

export const openApiDocument = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'Lyricsporn API',
    version: '1.0.0',
    description:
      'Apple Music catalog metadata and artwork with lyrics resolved through all supported lyric providers. Track, artist, album, and playlist routes use Apple catalog IDs. Track detail and queue responses can include lyrics.',
  },
  servers: [{ url: '/', description: 'Current deployment' }],
})

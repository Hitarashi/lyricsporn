import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

import {
  AlbumCollectionNameSchema,
  AlbumSchema,
  AppleCatalogIdSchema,
  ArtistCollectionNameSchema,
  ArtistSchema,
  AssetBatchRequestSchema,
  AssetBatchResponseSchema,
  CatalogBatchRequestSchema,
  CatalogBatchResponseSchema,
  CatalogCollectionQuerySchema,
  CatalogCollectionResponseSchema,
  CatalogGetQuerySchema,
  PlaylistCollectionNameSchema,
  PlaylistSchema,
  TrackAppleIdSchema,
  TrackBatchRequestSchema,
  TrackBatchResponseSchema,
  TrackDetailQuerySchema,
  TrackDetailResponseSchema,
} from './catalog-contract'
import {
  ApiErrorResponseSchema,
  BatchLookupRequestSchema,
  DEFAULT_MATCH_LIMIT,
  GetLookupQuerySchema,
  LookupResponseSchema,
  MAX_BATCH_LOOKUPS,
  MAX_MATCH_LIMIT,
} from './contract'

const registry = new OpenAPIRegistry()

registry.registerPath({
  method: 'get',
  path: '/api/v1/lookup',
  tags: ['Lyrics lookup'],
  summary: 'Look up one track',
  description: `Look up a single track by ISRC, Apple Music song ID, Apple Music song link, or title and artist. Supply exactly one identifier selector, or supply both title and artist. Identifier lookups may also include title, artist, and album as metadata hints. Search can return up to ${MAX_MATCH_LIMIT} Apple Music matches; the default limit is ${DEFAULT_MATCH_LIMIT}.`,
  request: {
    query: GetLookupQuerySchema,
  },
  responses: {
    200: {
      description: 'One result group containing zero or more Apple Music track matches.',
      content: {
        'application/json': {
          schema: LookupResponseSchema,
        },
      },
    },
    400: {
      description: 'The query parameters are invalid or contain conflicting lookup selectors.',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'The request could not be processed.',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: 'post',
  path: '/api/v1/lookup',
  tags: ['Lyrics lookup'],
  summary: 'Look up multiple tracks',
  description: `Run up to ${MAX_BATCH_LOOKUPS} independent lookups in one request. Each item returns its own result group and can return multiple Apple Music matches. Request-wide include, lyrics, and limit values act as defaults; a lookup item can override any of them. Search returns ${DEFAULT_MATCH_LIMIT} matches by default, with a maximum of ${MAX_MATCH_LIMIT}. Invalid request structure returns HTTP 400, while a lookup failure for one item is reported in that item and does not discard other results.`,
  request: {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: BatchLookupRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'A result group for every submitted lookup, in the same order.',
      content: {
        'application/json': {
          schema: LookupResponseSchema,
        },
      },
    },
    400: {
      description: 'The JSON request is invalid or contains invalid lookup values.',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    500: {
      description: 'The request could not be processed.',
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
})

registry.registerPath({
  method: 'get',
  path: '/api/v1/tracks/{appleId}',
  tags: ['Tracks'],
  summary: 'Get full track details',
  description:
    'Fetch one Apple Music song by catalog ID. Core track metadata is returned directly. Artwork, linked artist and album resources, lyrics, and the raw Apple response can be selected with include. Lyrics are resolved through all supported lyrics providers.',
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
    'Resolve up to 50 Apple song IDs in one Apple catalog batch request. Results preserve input order and duplicate queue entries. The default projection contains title, artist, album, duration, and artwork. Each item can override request-wide includes and artwork size. Lyrics are fetched only for items that request them.',
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

for (const [resource, schema, summary, description] of [
  [
    'artists',
    ArtistSchema,
    'Get artist details',
    'Fetch an Apple Music artist header, genres, and requested Apple artist collections or views.',
  ],
  [
    'albums',
    AlbumSchema,
    'Get album details',
    'Fetch Apple Music album metadata and optionally its tracks, artists, genres, labels, or relationship views such as appears-on, other versions, related albums, and related videos.',
  ],
  [
    'playlists',
    PlaylistSchema,
    'Get playlist details',
    'Fetch Apple Music playlist metadata and optionally its curator, tracks, featured artists, or more by curator view.',
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
      query: CatalogGetQuerySchema,
    },
    responses: {
      200: {
        description: 'Normalized Apple Music catalog resource.',
        content: { 'application/json': { schema: z.object({ data: schema }).strict() } },
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
} as const

for (const resource of ['artists', 'albums', 'playlists'] as const) {
  registry.registerPath({
    method: 'get',
    path: `/api/v1/${resource}/{appleId}/collections/{collection}`,
    tags: ['Apple catalog'],
    summary: `Get a paginated ${resource.slice(0, -1)} collection`,
    description:
      'Fetch one relationship or curated view page from Apple Music. Use the returned page.next URL to continue. Limit and offset let clients request only the data needed for the current screen.',
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
        content: { 'application/json': { schema: CatalogCollectionResponseSchema } },
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
    'Resolve up to 50 Apple catalog IDs in input order. Base resources are fetched with Apple’s typed multi-ID endpoint. Optional per-type includes and per-item overrides request collections or artist views only when needed.',
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
    'Resolve artwork for up to 50 songs, artists, albums, or playlists in one Apple catalog batch request. Returns Apple CDN URLs at the requested square size; image bytes are fetched directly by the client.',
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
      'Apple Music catalog metadata and artwork with lyrics resolved through all supported lyric providers. Use track lookup for search and identifiers, track detail for a full record, track batches for queue hydration, and typed catalog resources for artists, albums, and playlists.',
  },
  servers: [{ url: '/', description: 'Current deployment' }],
})

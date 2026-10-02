import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi'

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

export const openApiDocument = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: '3.1.0',
  info: {
    title: 'Lyricsporn API',
    version: '1.0.0',
    description:
      'Find Apple Music tracks and normalized lyrics by ISRC, Apple Music song ID or link, or title and artist. Lyrics are normalized before requested output formats are produced.',
  },
  servers: [{ url: '/', description: 'Current deployment' }],
})

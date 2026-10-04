import { describe, expect, it } from 'bun:test'

import {
  AlbumIncludeSchema,
  ArtistIncludeSchema,
  MotionArtworkIncludeSchema,
  PlaylistIncludeSchema,
  TrackDetailIncludeSchema,
} from '@/lib/api/v1/catalog-contract'
import { openApiDocument } from '@/lib/api/v1/openapi'

type OpenApiParameter = {
  name?: string
  in?: string
  style?: string
  explode?: boolean
  schema?: {
    type?: string
    items?: { $ref?: string }
  }
}

function valueAtPath(value: unknown, path: readonly (string | number)[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) return current[Number(segment)]
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[String(segment)]
    }
    return undefined
  }, value)
}

describe('OpenAPI routes and include enums', () => {
  it('exposes track resources without a separate lookup route', () => {
    const paths = openApiDocument.paths ?? {}
    const routePaths = Object.keys(paths)

    expect(routePaths).toContain('/api/v1/tracks/{appleId}')
    expect(routePaths).toContain('/api/v1/tracks/batch')
    expect(routePaths).not.toContain('/api/v1/lookup')
    expect(paths['/api/v1/tracks/{appleId}']).toHaveProperty('get')
    expect(paths['/api/v1/tracks/batch']).toHaveProperty('post')
  })

  it('documents the include enum and comma-separated query format on every GET route', () => {
    const routes = [
      {
        path: '/api/v1/catalog/search',
        component: 'MotionArtworkInclude',
        values: MotionArtworkIncludeSchema.options,
      },
      {
        path: '/api/v1/catalog/search/suggestions',
        component: 'MotionArtworkInclude',
        values: MotionArtworkIncludeSchema.options,
      },
      {
        path: '/api/v1/tracks/{appleId}',
        component: 'TrackDetailInclude',
        values: TrackDetailIncludeSchema.options,
      },
      {
        path: '/api/v1/artists/{appleId}',
        component: 'ArtistInclude',
        values: ArtistIncludeSchema.options,
      },
      {
        path: '/api/v1/albums/{appleId}',
        component: 'AlbumInclude',
        values: AlbumIncludeSchema.options,
      },
      {
        path: '/api/v1/playlists/{appleId}',
        component: 'PlaylistInclude',
        values: PlaylistIncludeSchema.options,
      },
      {
        path: '/api/v1/artists/{appleId}/collections/{collection}',
        component: 'MotionArtworkInclude',
        values: MotionArtworkIncludeSchema.options,
      },
      {
        path: '/api/v1/albums/{appleId}/collections/{collection}',
        component: 'MotionArtworkInclude',
        values: MotionArtworkIncludeSchema.options,
      },
      {
        path: '/api/v1/playlists/{appleId}/collections/{collection}',
        component: 'MotionArtworkInclude',
        values: MotionArtworkIncludeSchema.options,
      },
    ] as const
    const paths = openApiDocument.paths as unknown as Record<string, Record<string, unknown>>
    const schemas = openApiDocument.components?.schemas as unknown as Record<
      string,
      { enum?: string[] }
    >

    for (const route of routes) {
      const operation = paths[route.path]?.get as { parameters?: OpenApiParameter[] } | undefined
      const include = operation?.parameters?.find(
        (parameter) => parameter.in === 'query' && parameter.name === 'include',
      )

      expect(include).toMatchObject({
        style: 'form',
        explode: false,
        schema: {
          type: 'array',
          items: { $ref: `#/components/schemas/${route.component}` },
        },
      })
      expect(schemas[route.component]?.enum).toEqual([...route.values])
    }
  })

  it('uses the matching include enums in every JSON batch request', () => {
    const paths = openApiDocument.paths as unknown as Record<string, Record<string, unknown>>
    const schemas = openApiDocument.components?.schemas as unknown as Record<string, unknown>
    const requestBodies = [
      ['/api/v1/catalog/batch', 'CatalogBatchRequest'],
      ['/api/v1/tracks/batch', 'TrackBatchRequest'],
      ['/api/v1/assets/batch', 'AssetBatchRequest'],
    ] as const

    for (const [path, schema] of requestBodies) {
      expect(
        valueAtPath(paths[path]?.post, [
          'requestBody',
          'content',
          'application/json',
          'schema',
          '$ref',
        ]),
      ).toBe(`#/components/schemas/${schema}`)
    }

    const includeRefs = [
      [
        'CatalogBatchRequest',
        ['properties', 'include', 'properties', 'artist', 'items', '$ref'],
        'ArtistInclude',
      ],
      [
        'CatalogBatchRequest',
        ['properties', 'include', 'properties', 'album', 'items', '$ref'],
        'AlbumInclude',
      ],
      [
        'CatalogBatchRequest',
        ['properties', 'include', 'properties', 'playlist', 'items', '$ref'],
        'PlaylistInclude',
      ],
      ['CatalogBatchItem', ['oneOf', 0, 'properties', 'include', 'items', '$ref'], 'ArtistInclude'],
      ['CatalogBatchItem', ['oneOf', 1, 'properties', 'include', 'items', '$ref'], 'AlbumInclude'],
      [
        'CatalogBatchItem',
        ['oneOf', 2, 'properties', 'include', 'items', '$ref'],
        'PlaylistInclude',
      ],
      ['TrackBatchRequest', ['properties', 'include', 'items', '$ref'], 'QueueInclude'],
      [
        'TrackBatchRequest',
        ['properties', 'items', 'items', 'properties', 'include', 'items', '$ref'],
        'QueueInclude',
      ],
      ['AssetBatchRequest', ['properties', 'include', 'items', '$ref'], 'MotionArtworkInclude'],
      [
        'AssetBatchItem',
        ['oneOf', 0, 'properties', 'include', 'items', '$ref'],
        'MotionArtworkInclude',
      ],
      [
        'AssetBatchItem',
        ['oneOf', 2, 'properties', 'include', 'items', '$ref'],
        'MotionArtworkInclude',
      ],
    ] as const

    for (const [schema, path, component] of includeRefs) {
      expect(valueAtPath(schemas[schema], path)).toBe(`#/components/schemas/${component}`)
    }
  })
})

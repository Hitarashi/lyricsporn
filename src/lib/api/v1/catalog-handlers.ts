import type { CatalogInclude } from './catalog-contract'

import { z } from 'zod'

import {
  AlbumCollectionNameSchema,
  AlbumGetQuerySchema,
  AppleCatalogIdSchema,
  ArtistCollectionNameSchema,
  ArtistGetQuerySchema,
  AssetBatchRequestSchema,
  CatalogBatchRequestSchema,
  CatalogCollectionQuerySchema,
  CatalogSearchHintsQuerySchema,
  CatalogSearchQuerySchema,
  CatalogSearchSuggestionKindSchema,
  CatalogSearchSuggestionsQuerySchema,
  CatalogSearchTypeSchema,
  DEFAULT_CATALOG_SEARCH_TYPES,
  PlaylistCollectionNameSchema,
  PlaylistGetQuerySchema,
  TrackAppleIdSchema,
  TrackBatchRequestSchema,
  TrackDetailQuerySchema,
} from './catalog-contract'
import {
  getCatalogCollectionServer,
  getCatalogEntityServer,
  getCatalogSearchHintsServer,
  getCatalogSearchServer,
  getCatalogSearchSuggestionsServer,
  getTrackDetailServer,
  lookupAssetBatchServer,
  lookupCatalogBatchServer,
  lookupTrackQueueServer,
} from './catalog-service'
import { DEFAULT_LYRICS_FORMATS, LyricsOutputFormatSchema } from './contract'
import { invalidRequestResponse, resourceNotFoundResponse, unexpectedErrorResponse } from './http'

const CATALOG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600',
}

function invalidValue(path: string, message: string): Response {
  return invalidRequestResponse([
    {
      code: 'custom',
      path: [path],
      message,
    },
  ])
}

function prefixIssuePath(path: string, issues: z.ZodIssue[]): z.ZodIssue[] {
  return issues.map((issue) => ({ ...issue, path: [path, ...issue.path] }))
}

function queryParameters(
  request: Request,
): { values: Record<string, unknown>; error?: never } | { values?: never; error: Response } {
  const parameters = new URL(request.url).searchParams
  const duplicateKey = [...parameters.keys()].find((key) => parameters.getAll(key).length > 1)
  if (duplicateKey) {
    return {
      error: invalidValue(duplicateKey, `The ${duplicateKey} parameter must be supplied once.`),
    }
  }
  const values: Record<string, unknown> = Object.fromEntries(parameters.entries())
  const include = parameters.get('include')
  if (include !== null) {
    values.include = include.trim()
      ? [...new Set(include.split(',').map((item) => item.trim()))]
      : []
  }
  return { values }
}

function parseCsvList<T>(value: string | undefined, schema: z.ZodType<T>) {
  if (value === undefined) return { success: true as const, data: undefined as T[] | undefined }
  const values = value.trim() ? value.split(',').map((item) => item.trim()) : []
  const parsed = z.array(schema).safeParse([...new Set(values)])
  return parsed.success
    ? { success: true as const, data: parsed.data }
    : { success: false as const, issues: parsed.error.issues }
}

function parseResourceId(
  value: string,
  schema = AppleCatalogIdSchema,
): { id: string; error?: never } | { id?: never; error: Response } {
  const parsed = schema.safeParse(value)
  if (!parsed.success) return { error: invalidRequestResponse(parsed.error.issues) }
  return { id: parsed.data }
}

async function readJson(request: Request): Promise<{ body: unknown } | { error: Response }> {
  try {
    return { body: await request.json() }
  } catch {
    return {
      error: invalidRequestResponse([
        {
          code: 'custom',
          path: [],
          message: 'The request body must contain valid JSON.',
        },
      ]),
    }
  }
}

function catalogJson(body: unknown): Response {
  return Response.json(body, { headers: CATALOG_CACHE_HEADERS })
}

export async function handleCatalogEntityGet(
  request: Request,
  type: 'artist' | 'album' | 'playlist',
  appleId: string,
): Promise<Response> {
  const idResult = parseResourceId(appleId)
  if (idResult.error) return idResult.error
  const query = queryParameters(request)
  if (query.error) return query.error
  const querySchema =
    type === 'artist'
      ? ArtistGetQuerySchema
      : type === 'album'
        ? AlbumGetQuerySchema
        : PlaylistGetQuerySchema
  const parsedQuery = querySchema.safeParse(query.values)
  if (!parsedQuery.success) return invalidRequestResponse(parsedQuery.error.issues)

  const include: CatalogInclude[] = parsedQuery.data.include ?? ['artwork']

  try {
    const data = await getCatalogEntityServer({
      type,
      appleId: idResult.id,
      storefront: parsedQuery.data.storefront,
      include,
      limit: parsedQuery.data.limit,
      artworkSize: parsedQuery.data.artworkSize,
    })
    if (!data) return resourceNotFoundResponse(`${type} ${idResult.id}`)
    return catalogJson({ data })
  } catch {
    return unexpectedErrorResponse()
  }
}

export async function handleCatalogSearchGet(request: Request): Promise<Response> {
  const query = queryParameters(request)
  if (query.error) return query.error
  const parsedQuery = CatalogSearchQuerySchema.safeParse(query.values)
  if (!parsedQuery.success) return invalidRequestResponse(parsedQuery.error.issues)
  const parsedTypes = parseCsvList(parsedQuery.data.types, CatalogSearchTypeSchema)
  if (!parsedTypes.success)
    return invalidRequestResponse(prefixIssuePath('types', parsedTypes.issues))
  if (parsedTypes.data?.length === 0)
    return invalidValue('types', 'At least one Apple catalog type must be selected.')
  try {
    const data = await getCatalogSearchServer({
      term: parsedQuery.data.term,
      storefront: parsedQuery.data.storefront,
      types: parsedTypes.data ?? ['songs'],
      limit: parsedQuery.data.limit,
      offset: parsedQuery.data.offset,
      artworkSize: parsedQuery.data.artworkSize,
      motionArtwork: parsedQuery.data.include?.includes('motionArtwork') ?? false,
    })
    return catalogJson(data)
  } catch {
    return unexpectedErrorResponse()
  }
}

export async function handleCatalogSearchHintsGet(request: Request): Promise<Response> {
  const query = queryParameters(request)
  if (query.error) return query.error
  const parsedQuery = CatalogSearchHintsQuerySchema.safeParse(query.values)
  if (!parsedQuery.success) return invalidRequestResponse(parsedQuery.error.issues)

  try {
    const data = await getCatalogSearchHintsServer(parsedQuery.data)
    return catalogJson(data)
  } catch {
    return unexpectedErrorResponse()
  }
}

export async function handleCatalogSearchSuggestionsGet(request: Request): Promise<Response> {
  const query = queryParameters(request)
  if (query.error) return query.error
  const parsedQuery = CatalogSearchSuggestionsQuerySchema.safeParse(query.values)
  if (!parsedQuery.success) return invalidRequestResponse(parsedQuery.error.issues)
  const parsedKinds = parseCsvList(parsedQuery.data.kinds, CatalogSearchSuggestionKindSchema)
  if (!parsedKinds.success)
    return invalidRequestResponse(prefixIssuePath('kinds', parsedKinds.issues))
  const parsedTypes = parseCsvList(parsedQuery.data.types, CatalogSearchTypeSchema)
  if (!parsedTypes.success)
    return invalidRequestResponse(prefixIssuePath('types', parsedTypes.issues))
  if (parsedKinds.data?.length === 0)
    return invalidValue('kinds', 'At least one suggestion kind must be selected.')
  if (parsedTypes.data?.length === 0)
    return invalidValue('types', 'At least one Apple catalog type must be selected.')
  const kinds = parsedKinds.data ?? ['terms', 'topResults']
  const types =
    parsedTypes.data ??
    (kinds.includes('topResults') ? [...DEFAULT_CATALOG_SEARCH_TYPES] : undefined)

  try {
    const data = await getCatalogSearchSuggestionsServer({
      term: parsedQuery.data.term,
      storefront: parsedQuery.data.storefront,
      kinds,
      ...(types ? { types } : {}),
      limit: parsedQuery.data.limit,
      artworkSize: parsedQuery.data.artworkSize,
      motionArtwork: parsedQuery.data.include?.includes('motionArtwork') ?? false,
    })
    return catalogJson(data)
  } catch {
    return unexpectedErrorResponse()
  }
}

export async function handleCatalogCollectionGet(
  request: Request,
  type: 'artist' | 'album' | 'playlist',
  appleId: string,
  collection: string,
): Promise<Response> {
  const idResult = parseResourceId(appleId)
  if (idResult.error) return idResult.error
  const collectionSchema =
    type === 'artist'
      ? ArtistCollectionNameSchema
      : type === 'album'
        ? AlbumCollectionNameSchema
        : PlaylistCollectionNameSchema
  const parsedCollection = collectionSchema.safeParse(collection)
  if (!parsedCollection.success) return invalidRequestResponse(parsedCollection.error.issues)
  const query = queryParameters(request)
  if (query.error) return query.error
  const parsedQuery = CatalogCollectionQuerySchema.safeParse(query.values)
  if (!parsedQuery.success) return invalidRequestResponse(parsedQuery.error.issues)
  try {
    const data = await getCatalogCollectionServer({
      type,
      appleId: idResult.id,
      collection: parsedCollection.data,
      storefront: parsedQuery.data.storefront,
      limit: parsedQuery.data.limit,
      offset: parsedQuery.data.offset,
      artworkSize: parsedQuery.data.artworkSize,
      motionArtwork: parsedQuery.data.include?.includes('motionArtwork') ?? false,
    })
    if (!data) return resourceNotFoundResponse(`${type} ${idResult.id}`)
    return catalogJson(data)
  } catch {
    return unexpectedErrorResponse()
  }
}

export async function handleCatalogBatchPost(request: Request): Promise<Response> {
  const json = await readJson(request)
  if ('error' in json) return json.error
  const parsed = CatalogBatchRequestSchema.safeParse(json.body)
  if (!parsed.success) return invalidRequestResponse(parsed.error.issues)
  try {
    return Response.json(await lookupCatalogBatchServer(parsed.data))
  } catch {
    return unexpectedErrorResponse()
  }
}

export async function handleAssetBatchPost(request: Request): Promise<Response> {
  const json = await readJson(request)
  if ('error' in json) return json.error
  const parsed = AssetBatchRequestSchema.safeParse(json.body)
  if (!parsed.success) return invalidRequestResponse(parsed.error.issues)
  try {
    return Response.json(await lookupAssetBatchServer(parsed.data))
  } catch {
    return unexpectedErrorResponse()
  }
}

export async function handleTrackBatchPost(request: Request): Promise<Response> {
  const json = await readJson(request)
  if ('error' in json) return json.error
  const parsed = TrackBatchRequestSchema.safeParse(json.body)
  if (!parsed.success) return invalidRequestResponse(parsed.error.issues)
  try {
    return Response.json(await lookupTrackQueueServer(parsed.data))
  } catch {
    return unexpectedErrorResponse()
  }
}

export async function handleTrackDetailGet(request: Request, appleId: string): Promise<Response> {
  const idResult = parseResourceId(appleId, TrackAppleIdSchema)
  if (idResult.error) return idResult.error
  const query = queryParameters(request)
  if (query.error) return query.error
  const parsedQuery = TrackDetailQuerySchema.safeParse(query.values)
  if (!parsedQuery.success) return invalidRequestResponse(parsedQuery.error.issues)

  const parsedFormats = parseCsvList(parsedQuery.data.formats, LyricsOutputFormatSchema)
  if (!parsedFormats.success) return invalidRequestResponse(parsedFormats.issues)

  try {
    const data = await getTrackDetailServer({
      appleId: idResult.id,
      storefront: parsedQuery.data.storefront,
      include: parsedQuery.data.include ?? ['artwork'],
      formats: parsedFormats.data ?? [...DEFAULT_LYRICS_FORMATS],
      artworkSize: parsedQuery.data.artworkSize,
    })
    if (!data) return resourceNotFoundResponse(`track ${idResult.id}`)
    return catalogJson(data)
  } catch {
    return unexpectedErrorResponse()
  }
}

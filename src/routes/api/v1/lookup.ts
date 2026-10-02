import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import {
  ApiLookupInputError,
  BatchLookupRequestSchema,
  GetLookupQuerySchema,
  IncludeSectionSchema,
  LookupSelectorSchema,
  LyricsOutputFormatSchema,
  lookupTracks,
} from '@/lib/api/v1'
import {
  invalidLookupResponse,
  invalidRequestResponse,
  unexpectedErrorResponse,
} from '@/lib/api/v1/http'

const IncludeListSchema = z.array(IncludeSectionSchema).min(1).max(4)
const LyricsFormatListSchema = z.array(LyricsOutputFormatSchema).min(1).max(3)

function parseCsvList<T>(
  value: string,
  schema: z.ZodType<T>,
): { data: T[] } | { issues: z.ZodIssue[] } {
  const result = z.array(schema).safeParse(value.split(',').map((item) => item.trim()))
  return result.success ? { data: result.data } : { issues: result.error.issues }
}

async function handleGet(request: Request): Promise<Response> {
  const parameters = new URL(request.url).searchParams
  const duplicateKey = [...parameters.keys()].find((key) => parameters.getAll(key).length > 1)
  if (duplicateKey) {
    return invalidRequestResponse([
      {
        code: 'custom',
        path: [duplicateKey],
        message: `The ${duplicateKey} parameter must be supplied once.`,
      },
    ])
  }

  const queryResult = GetLookupQuerySchema.safeParse(Object.fromEntries(parameters.entries()))
  if (!queryResult.success) return invalidRequestResponse(queryResult.error.issues)

  const { isrc, appleId, appleLink, title, artist, album, storefront, include, formats, limit } =
    queryResult.data
  const selectorResult = LookupSelectorSchema.safeParse({
    ...(isrc !== undefined ? { isrc } : {}),
    ...(appleId !== undefined ? { appleId } : {}),
    ...(appleLink !== undefined ? { appleLink } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(artist !== undefined ? { artist } : {}),
    ...(album !== undefined ? { album } : {}),
    ...(storefront !== undefined ? { storefront } : {}),
  })
  if (!selectorResult.success) return invalidRequestResponse(selectorResult.error.issues)

  let includeSections: z.infer<typeof IncludeSectionSchema>[] | undefined
  if (include !== undefined) {
    const parsedInclude = parseCsvList(include, IncludeSectionSchema)
    if ('issues' in parsedInclude) return invalidRequestResponse(parsedInclude.issues)
    const validatedInclude = IncludeListSchema.safeParse(parsedInclude.data)
    if (!validatedInclude.success) return invalidRequestResponse(validatedInclude.error.issues)
    includeSections = validatedInclude.data
  }

  let lyricFormats: z.infer<typeof LyricsOutputFormatSchema>[] | undefined
  if (formats !== undefined) {
    const parsedFormats = parseCsvList(formats, LyricsOutputFormatSchema)
    if ('issues' in parsedFormats) return invalidRequestResponse(parsedFormats.issues)
    const validatedFormats = LyricsFormatListSchema.safeParse(parsedFormats.data)
    if (!validatedFormats.success) return invalidRequestResponse(validatedFormats.error.issues)
    lyricFormats = validatedFormats.data
  }

  try {
    return Response.json(
      await lookupTracks({
        lookups: [
          {
            lookup: selectorResult.data,
            ...(includeSections ? { include: includeSections } : {}),
            ...(lyricFormats ? { lyrics: { formats: lyricFormats } } : {}),
            ...(limit !== undefined ? { limit } : {}),
          },
        ],
      }),
    )
  } catch (error) {
    if (error instanceof ApiLookupInputError) {
      return invalidLookupResponse(error.path.replace(/^lookups\[0\]\.lookup\./, ''), error.message)
    }
    return unexpectedErrorResponse()
  }
}

async function handlePost(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return invalidRequestResponse([
      {
        code: 'custom',
        path: [],
        message: 'The request body must contain valid JSON.',
      },
    ])
  }

  const parsedRequest = BatchLookupRequestSchema.safeParse(body)
  if (!parsedRequest.success) return invalidRequestResponse(parsedRequest.error.issues)

  try {
    return Response.json(await lookupTracks(parsedRequest.data))
  } catch (error) {
    if (error instanceof ApiLookupInputError) {
      return invalidLookupResponse(error.path, error.message)
    }
    return unexpectedErrorResponse()
  }
}

export const Route = createFileRoute('/api/v1/lookup')({
  server: {
    handlers: {
      GET: async ({ request }) => handleGet(request),
      POST: async ({ request }) => handlePost(request),
    },
  },
})

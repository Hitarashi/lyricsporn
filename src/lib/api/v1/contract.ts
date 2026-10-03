import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

export const ApiJsonValueSchema = z.json().openapi('ApiJsonValue', {
  description: 'A recursively typed JSON value copied from the Apple Music Catalog response.',
})

export const LyricsOutputFormatSchema = z.enum(['json', 'ttml', 'elrc']).openapi({
  description:
    'json is normalized structured lyrics, ttml is generated TTML, and elrc is generated word-timed lyrics when word timing is available.',
})

export const LyricsRequestSchema = z
  .object({
    formats: z
      .array(LyricsOutputFormatSchema)
      .min(1)
      .max(3)
      .openapi({
        description:
          'Requested lyrics encodings. Duplicate values are ignored. JSON and TTML are generated from normalized lyrics. eLRC is available only when word timing exists.',
        example: ['json', 'ttml'],
      }),
  })
  .strict()
  .openapi('LyricsRequest')

export const LyricsWordSchema = z
  .object({
    text: z.string(),
    startMs: z.number(),
    endMs: z.number().optional(),
  })
  .strict()

export const LyricsTranslationSchema = z
  .object({
    language: z.string(),
    text: z.string(),
  })
  .strict()

export const LyricsLineSchema = z
  .object({
    text: z.string(),
    startMs: z.number(),
    endMs: z.number(),
    words: z.array(LyricsWordSchema).optional(),
    backgroundWords: z.array(LyricsWordSchema).optional(),
    alignment: z.string().optional(),
    agent: z.string().optional(),
    singer: z.string().optional(),
    translations: z.array(LyricsTranslationSchema).optional(),
    romanization: z.string().optional(),
    isInstrumental: z.boolean().optional(),
  })
  .strict()
  .openapi('LyricsLine')

export const LyricsJsonSchema = z
  .object({
    format: z.enum(['elrc', 'lrc', 'plain']),
    syncLevel: z.enum(['word', 'line', 'plain']),
    plainText: z.string(),
    lines: z.array(LyricsLineSchema),
    provider: z.string().nullable(),
    sourceId: z.string().optional(),
    sourceUrl: z.string().optional(),
    attribution: z.string().optional(),
    instrumental: z.boolean().optional(),
  })
  .strict()
  .openapi('LyricsJson', {
    description:
      'Canonical normalized lyrics. Times are milliseconds from the start of the track. This is the complete normalized representation returned by the lyrics engine.',
  })

const JsonLyricsFormatResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('available'), content: LyricsJsonSchema }).strict(),
  z.object({ status: z.literal('unavailable'), reason: z.string() }).strict(),
])

const TextLyricsFormatResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('available'), content: z.string() }).strict(),
  z.object({ status: z.literal('unavailable'), reason: z.string() }).strict(),
])

export const LyricsOutputSchema = z
  .object({
    status: z.enum(['available', 'partial', 'not_found']).openapi({
      description:
        'available means every requested format was produced; partial means lyrics exist but at least one requested format is unavailable; not_found means no lyrics were found.',
    }),
    requestedFormats: z.array(LyricsOutputFormatSchema).openapi({
      description: 'Formats requested for this track.',
    }),
    formats: z
      .object({
        json: JsonLyricsFormatResultSchema.optional(),
        ttml: TextLyricsFormatResultSchema.optional(),
        elrc: TextLyricsFormatResultSchema.optional(),
      })
      .strict()
      .openapi({
        description:
          'One result per requested format. Available entries contain content; unavailable entries contain a reason.',
      }),
  })
  .strict()
  .openapi('LyricsOutput')

export const TrackSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    href: z.string().optional(),
    title: z.string().optional(),
    artist: z.string().optional(),
    album: z.string().optional(),
    albumArtist: z.string().optional(),
    composer: z.string().optional(),
    genres: z.array(z.string()).optional(),
    releaseDate: z.string().optional(),
    trackNumber: z.number().optional(),
    discNumber: z.number().optional(),
    durationMs: z.number().optional(),
    isrc: z.string().optional(),
    audioTraits: z.array(z.string()).optional(),
    recordLabel: z.string().optional(),
    copyright: z.string().optional(),
    isStreamable: z.boolean().optional(),
    contentRating: z.string().optional(),
    upc: z.string().optional(),
  })
  .strict()
  .openapi('Track', {
    description: 'Normalized Apple Music song metadata derived from its catalog attributes.',
  })

export const ArtworkSchema = z
  .object({
    url: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
    bgColor: z.string().optional(),
    textColor1: z.string().optional(),
    textColor2: z.string().optional(),
    textColor3: z.string().optional(),
    textColor4: z.string().optional(),
    hasAlpha: z.boolean().optional(),
    isP3: z.boolean().optional(),
  })
  .catchall(ApiJsonValueSchema)
  .openapi('Artwork', {
    description:
      'Apple Music artwork attributes, including its URL template, dimensions, and any additional artwork properties Apple returned.',
  })

const MotionArtworkVariantSchema = z
  .object({
    url: z.string().url(),
    format: z.enum(['hls', 'mp4']).optional(),
  })
  .strict()
  .openapi('MotionArtworkVariant')

export const MotionArtworkSchema = z
  .object({
    provider: z.literal('appleMusic'),
    variants: z
      .object({
        default: MotionArtworkVariantSchema.optional(),
        square: MotionArtworkVariantSchema.optional(),
        portrait: MotionArtworkVariantSchema.optional(),
      })
      .strict(),
  })
  .strict()
  .openapi('MotionArtwork', {
    description:
      'Apple Music motion artwork video URLs. The default variant is the preferred source; square and portrait are supplied when available.',
  })

export const ApiErrorSchema = z
  .object({
    code: z.enum(['invalid_request', 'not_found', 'internal_error']),
    message: z.string(),
    issues: z
      .array(
        z
          .object({
            path: z.string(),
            message: z.string(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .openapi('ApiError')

export const ApiErrorResponseSchema = z
  .object({ error: ApiErrorSchema })
  .strict()
  .openapi('ApiErrorResponse')

export type ApiError = z.infer<typeof ApiErrorSchema>
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>
export type ApiJsonValue = z.infer<typeof ApiJsonValueSchema>
export type Artwork = z.infer<typeof ArtworkSchema>
export type MotionArtwork = z.infer<typeof MotionArtworkSchema>
export type LyricsJson = z.infer<typeof LyricsJsonSchema>
export type LyricsLine = z.infer<typeof LyricsLineSchema>
export type LyricsOutput = z.infer<typeof LyricsOutputSchema>
export type LyricsOutputFormat = z.infer<typeof LyricsOutputFormatSchema>
export type LyricsRequest = z.infer<typeof LyricsRequestSchema>
export type LyricsTranslation = z.infer<typeof LyricsTranslationSchema>
export type LyricsWord = z.infer<typeof LyricsWordSchema>
export type Track = z.infer<typeof TrackSchema>

export const DEFAULT_LYRICS_FORMATS = ['json'] as const satisfies LyricsOutputFormat[]

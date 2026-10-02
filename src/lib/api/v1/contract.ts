import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

extendZodWithOpenApi(z)

export const DEFAULT_MATCH_LIMIT = 5
export const MAX_MATCH_LIMIT = 10
export const MAX_BATCH_LOOKUPS = 10

const MetadataHintsSchema = {
  title: z.string().max(160).optional().openapi({
    description: 'Optional title hint used when an identifier lookup has incomplete metadata.',
    example: 'Dreams',
  }),
  artist: z.string().max(160).optional().openapi({
    description: 'Optional artist hint used when an identifier lookup has incomplete metadata.',
    example: 'Fleetwood Mac',
  }),
  album: z.string().max(160).optional().openapi({
    description: 'Optional album title used as a lookup hint.',
    example: 'Rumours',
  }),
  storefront: z
    .string()
    .regex(/^[a-z]{2}$/i)
    .optional()
    .openapi({
      description: 'Two-letter Apple Music storefront country code. Defaults to us.',
      example: 'us',
    }),
}

const IsrcLookupSchema = z
  .object({
    isrc: z.string().min(1).max(32).openapi({
      description: 'ISRC. Spaces and hyphens are accepted and removed before lookup.',
      example: 'USRC17607839',
    }),
    ...MetadataHintsSchema,
  })
  .strict()
  .openapi('IsrcLookup')

const AppleIdLookupSchema = z
  .object({
    appleId: z
      .string()
      .regex(/^\d{1,20}$/)
      .openapi({
        description: 'Numeric Apple Music song ID.',
        example: '1082506273',
      }),
    ...MetadataHintsSchema,
  })
  .strict()
  .openapi('AppleIdLookup')

const AppleLinkLookupSchema = z
  .object({
    appleLink: z.string().min(1).max(2048).openapi({
      description: 'Apple Music song URL, or an album URL containing a specific track ID.',
      example: 'https://music.apple.com/us/song/1082506273',
    }),
    ...MetadataHintsSchema,
  })
  .strict()
  .openapi('AppleLinkLookup')

const SearchLookupSchema = z
  .object({
    title: z.string().min(1).max(160).openapi({
      description: 'Track title. Required for title and artist search.',
      example: 'Dreams',
    }),
    artist: z.string().min(1).max(160).openapi({
      description: 'Artist name. Required for title and artist search.',
      example: 'Fleetwood Mac',
    }),
    album: MetadataHintsSchema.album,
    storefront: MetadataHintsSchema.storefront,
  })
  .strict()
  .openapi('SearchLookup')

export const LookupSelectorSchema = z
  .union([IsrcLookupSchema, AppleIdLookupSchema, AppleLinkLookupSchema, SearchLookupSchema])
  .openapi('LookupSelector')

export const IncludeSectionSchema = z.enum(['track', 'artwork', 'lyrics', 'appleCatalog']).openapi({
  description:
    'track returns normalized Apple Music metadata; artwork returns its artwork object; lyrics returns requested lyric formats; appleCatalog returns the full Apple Catalog response.',
})

export const LyricsOutputFormatSchema = z.enum(['json', 'ttml', 'elrc']).openapi({
  description:
    'json is normalized structured lyrics, ttml is generated TTML, and elrc is generated word-timed lyrics when word timing is available.',
})
export const ApiJsonValueSchema = z.json().openapi('ApiJsonValue', {
  description: 'A recursively typed JSON value copied from the Apple Music Catalog response.',
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

export const LookupOptionsSchema = z
  .object({
    include: z
      .array(IncludeSectionSchema)
      .min(1)
      .max(4)
      .optional()
      .openapi({
        description:
          'Response sections. Defaults to track, artwork, and lyrics. appleCatalog returns the complete Apple Catalog response.',
        example: ['track', 'artwork', 'lyrics'],
      }),
    lyrics: LyricsRequestSchema.optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_MATCH_LIMIT)
      .optional()
      .openapi({
        description: `Maximum Apple Music matches for this lookup. Defaults to ${DEFAULT_MATCH_LIMIT}; maximum is ${MAX_MATCH_LIMIT}.`,
        example: DEFAULT_MATCH_LIMIT,
      }),
  })
  .strict()
  .openapi('LookupOptions')

export const LookupItemSchema = z
  .object({
    lookup: LookupSelectorSchema,
    include: LookupOptionsSchema.shape.include,
    lyrics: LookupOptionsSchema.shape.lyrics,
    limit: LookupOptionsSchema.shape.limit,
  })
  .strict()
  .openapi('LookupItem')

export const BatchLookupRequestSchema = LookupOptionsSchema.extend({
  lookups: z.array(LookupItemSchema).min(1).max(MAX_BATCH_LOOKUPS).openapi({
    description: 'Independent lookups. Each item may override the request-wide options.',
  }),
})
  .strict()
  .openapi('BatchLookupRequest')

export const GetLookupQuerySchema = z
  .object({
    isrc: z.string().min(1).max(32).optional().openapi({
      description: 'ISRC. Use this, appleId, appleLink, or title and artist.',
      example: 'USRC17607839',
    }),
    appleId: z
      .string()
      .regex(/^\d{1,20}$/)
      .optional()
      .openapi({
        description: 'Numeric Apple Music song ID. Mutually exclusive with isrc and appleLink.',
        example: '1082506273',
      }),
    appleLink: z.string().min(1).max(2048).optional().openapi({
      description: 'Apple Music song URL or album URL opened to a track.',
      example: 'https://music.apple.com/us/song/1082506273',
    }),
    title: z.string().min(1).max(160).optional().openapi({
      description: 'Track title. Pair with artist to search Apple Music.',
      example: 'Dreams',
    }),
    artist: z.string().min(1).max(160).optional().openapi({
      description: 'Artist name. Pair with title to search Apple Music.',
      example: 'Fleetwood Mac',
    }),
    album: z.string().max(160).optional().openapi({
      description: 'Optional album title or identifier lookup hint.',
      example: 'Rumours',
    }),
    storefront: MetadataHintsSchema.storefront,
    include: z.string().optional().openapi({
      description:
        'Comma-separated response sections: track, artwork, lyrics, appleCatalog. Defaults to track,artwork,lyrics.',
      example: 'track,artwork,lyrics',
    }),
    formats: z.string().optional().openapi({
      description:
        'Comma-separated lyric encodings: json, ttml, elrc. Defaults to json. eLRC requires word timing.',
      example: 'json,ttml',
    }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_MATCH_LIMIT)
      .optional()
      .openapi({
        description: `Maximum Apple Music matches. Defaults to ${DEFAULT_MATCH_LIMIT}; maximum is ${MAX_MATCH_LIMIT}.`,
        example: DEFAULT_MATCH_LIMIT,
      }),
  })
  .strict()
  .openapi('GetLookupQuery')

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
      description: 'Formats requested for this match.',
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

export const LookupMatchSchema = z
  .object({
    appleTrackId: z.string().openapi({ description: 'Apple Music song ID for this match.' }),
    track: TrackSchema.optional().openapi({ description: 'Included when track is requested.' }),
    artwork: ArtworkSchema.optional().openapi({
      description: 'Included when artwork is requested.',
    }),
    lyrics: LyricsOutputSchema.optional().openapi({
      description: 'Included when lyrics are requested.',
    }),
  })
  .strict()
  .openapi('LookupMatch')

export const LookupErrorSchema = z
  .object({
    code: z.enum(['invalid_request', 'invalid_lookup', 'lookup_failed', 'internal_error']),
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
  .openapi('LookupError')

const LookupResultSharedShape = {
  index: z.number().int().nonnegative().openapi({
    description: 'Zero-based position of this lookup in the request.',
  }),
  lookup: LookupSelectorSchema,
  appleCatalog: z
    .object({
      storefront: z.string(),
      response: ApiJsonValueSchema,
    })
    .strict()
    .optional()
    .openapi({
      description:
        'Complete Apple Music Catalog response, present only when appleCatalog is requested.',
    }),
}

export const LookupResultSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        ...LookupResultSharedShape,
        status: z.literal('matched'),
        matches: z.array(LookupMatchSchema).min(1).openapi({
          description: 'Apple Music track matches for this input, up to the requested limit.',
        }),
      })
      .strict(),
    z
      .object({
        ...LookupResultSharedShape,
        status: z.literal('not_found'),
        matches: z.array(LookupMatchSchema).length(0),
      })
      .strict(),
    z
      .object({
        ...LookupResultSharedShape,
        status: z.literal('error'),
        matches: z.array(LookupMatchSchema).length(0),
        error: LookupErrorSchema.openapi({ description: 'Failure information for this lookup.' }),
      })
      .strict(),
  ])
  .openapi('LookupResult')

export const LookupResponseSchema = z
  .object({
    results: z.array(LookupResultSchema).openapi({
      description: 'Result groups in the same order as the submitted lookups.',
    }),
  })
  .strict()
  .openapi('LookupResponse')

export const ApiErrorResponseSchema = z
  .object({
    error: LookupErrorSchema,
  })
  .strict()
  .openapi('ApiErrorResponse')

export type LookupSelector = z.infer<typeof LookupSelectorSchema>
export type LookupOptions = z.infer<typeof LookupOptionsSchema>
export type LookupItem = z.infer<typeof LookupItemSchema>
export type BatchLookupRequest = z.infer<typeof BatchLookupRequestSchema>
export type GetLookupQuery = z.infer<typeof GetLookupQuerySchema>
export type IncludeSection = z.infer<typeof IncludeSectionSchema>
export type LyricsOutputFormat = z.infer<typeof LyricsOutputFormatSchema>
export type LyricsWord = z.infer<typeof LyricsWordSchema>
export type LyricsTranslation = z.infer<typeof LyricsTranslationSchema>
export type LyricsLine = z.infer<typeof LyricsLineSchema>
export type LyricsRequest = z.infer<typeof LyricsRequestSchema>
export type LyricsJson = z.infer<typeof LyricsJsonSchema>
export type LyricsOutput = z.infer<typeof LyricsOutputSchema>
export type Track = z.infer<typeof TrackSchema>
export type Artwork = z.infer<typeof ArtworkSchema>
export type LookupMatch = z.infer<typeof LookupMatchSchema>
export type LookupResult = z.infer<typeof LookupResultSchema>
export type LookupResponse = z.infer<typeof LookupResponseSchema>
export type LookupError = z.infer<typeof LookupErrorSchema>
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>
export type ApiJsonValue = z.infer<typeof ApiJsonValueSchema>

export const DEFAULT_INCLUDE = ['track', 'artwork', 'lyrics'] as const satisfies IncludeSection[]
export const DEFAULT_LYRICS_FORMATS = ['json'] as const satisfies LyricsOutputFormat[]

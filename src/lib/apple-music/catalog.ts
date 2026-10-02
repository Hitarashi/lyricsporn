import { createServerFn } from '@tanstack/react-start'

const APPLE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const TOKEN_CACHE_MS = 24 * 60 * 60 * 1000
const STOREFRONT_FALLBACKS = ['jp', 'gb', 'in', 'ca', 'de', 'fr', 'au']
const TRACK_ID_PATTERN = /^\d{1,20}$/
const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/

export type AppleJsonValue =
  | string
  | number
  | boolean
  | null
  | AppleJsonValue[]
  | { [key: string]: AppleJsonValue | undefined }

export interface AppleCatalogArtwork extends Record<string, AppleJsonValue | undefined> {
  url?: string
  width?: number
  height?: number
}

export interface AppleCatalogAttributes extends Record<string, AppleJsonValue | undefined> {
  name?: string
  artistName?: string
  albumName?: string
  albumArtistName?: string
  composerName?: string
  genreNames?: string[]
  releaseDate?: string
  trackNumber?: number
  discNumber?: number
  durationInMillis?: number
  isrc?: string
  audioTraits?: string[]
  artwork?: AppleCatalogArtwork
  recordLabel?: string
  copyright?: string
  isStreamable?: boolean
  contentRating?: string
  upc?: string
}

export interface AppleCatalogResource extends Record<string, AppleJsonValue | undefined> {
  id: string
  type: string
  href?: string
  attributes?: AppleCatalogAttributes
  relationships?: Record<string, AppleJsonValue | undefined>
  meta?: Record<string, AppleJsonValue | undefined>
}

export interface AppleCatalogResponse extends Record<string, AppleJsonValue | undefined> {
  data?: AppleCatalogResource[]
  results?: Record<string, AppleJsonValue | undefined> & {
    songs?: Record<string, AppleJsonValue | undefined> & { data?: AppleCatalogResource[] }
  }
}

export type AppleCatalogLookupInput =
  | { type: 'appleTrackId'; value: string; storefront?: string }
  | { type: 'isrc'; value: string; storefront?: string }
  | { type: 'search'; title: string; artist: string; album?: string; storefront?: string }

export interface AppleCatalogLookupResult {
  storefront: string
  response: AppleCatalogResponse
  songs: AppleCatalogResource[]
}

let cachedDeveloperToken: { value: string; expiresAt: number } | null = null
let developerTokenRequest: Promise<string> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function findAssetPath(html: string): string | null {
  return html.match(/\/assets\/index[~._-][\da-z_-]+\.js/i)?.[0] ?? null
}

function findDeveloperTokenVariable(js: string): string | null {
  const marker = 'developerToken:'
  const markerIndex = js.indexOf(marker)
  if (markerIndex < 0) return null

  const valueStart = markerIndex + marker.length
  const variable = js.slice(valueStart).match(/^\s*([\da-z_$]+)/i)?.[1]
  return variable ?? null
}

function findVariableAssignment(js: string, variable: string): string | null {
  let searchFrom = 0

  while (true) {
    const start = js.indexOf(variable, searchFrom)
    if (start < 0) return null

    let rest = js.slice(start + variable.length)
    rest = rest.slice(rest.match(/^\s*/)?.[0].length ?? 0)
    if (rest.startsWith('=')) {
      rest = rest.slice(1)
      rest = rest.slice(rest.match(/^\s*/)?.[0].length ?? 0)
      if (rest.startsWith('"')) {
        const token = rest.slice(1).split('"', 1)[0]
        if (token) return token
      }
    }

    searchFrom = start + 1
  }
}

function findDirectJwt(js: string): string | null {
  return js.match(/eyJh[\da-zA-Z_-]*\.[\da-zA-Z_-]+\.[\da-zA-Z_-]+/)?.[0] ?? null
}

async function fetchAppleText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/javascript',
      'User-Agent': APPLE_USER_AGENT,
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) throw new Error(`Apple token source returned HTTP ${response.status}`)
  return response.text()
}

async function scrapeDeveloperToken(): Promise<string> {
  const browsePage = await fetchAppleText('https://music.apple.com/us/browse')
  const assetPath = findAssetPath(browsePage)
  if (!assetPath) throw new Error('No Apple Music index asset found')

  const assetUrl = new URL(assetPath, 'https://music.apple.com').toString()
  const javascript = await fetchAppleText(assetUrl)
  const tokenVariable = findDeveloperTokenVariable(javascript)
  const token = tokenVariable ? findVariableAssignment(javascript, tokenVariable) : null
  const scrapedToken = token ?? findDirectJwt(javascript)

  if (!scrapedToken) throw new Error('No Apple Music developer token found')
  return scrapedToken
}

async function getDeveloperToken(): Promise<string> {
  if (cachedDeveloperToken && cachedDeveloperToken.expiresAt > Date.now()) {
    return cachedDeveloperToken.value
  }

  if (!developerTokenRequest) {
    developerTokenRequest = scrapeDeveloperToken()
      .then((value) => {
        cachedDeveloperToken = { value, expiresAt: Date.now() + TOKEN_CACHE_MS }
        return value
      })
      .finally(() => {
        developerTokenRequest = null
      })
  }

  return developerTokenRequest
}

function invalidateDeveloperToken(value: string): void {
  if (cachedDeveloperToken?.value === value) cachedDeveloperToken = null
}

async function requestAmp(url: URL, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      Origin: 'https://music.apple.com',
      'User-Agent': APPLE_USER_AGENT,
    },
    signal: AbortSignal.timeout(15_000),
  })
}

async function fetchAmp(url: URL): Promise<AppleCatalogResponse | null> {
  let token = await getDeveloperToken()
  let response = await requestAmp(url, token)

  if (response.status === 401 || response.status === 403) {
    invalidateDeveloperToken(token)
    token = await getDeveloperToken()
    response = await requestAmp(url, token)
  }

  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Apple Music API returned HTTP ${response.status}`)

  const payload: unknown = await response.json()
  if (!isRecord(payload)) throw new Error('Apple Music API returned an invalid response')
  return payload as AppleCatalogResponse
}

function storefrontAttempts(storefront: string): string[] {
  return [
    storefront,
    ...(storefront === 'us' ? [] : ['us']),
    ...STOREFRONT_FALLBACKS.filter((value) => value !== storefront),
  ]
}

function songsFromResponse(response: AppleCatalogResponse): AppleCatalogResource[] {
  const directData = response.data
  if (Array.isArray(directData)) return directData

  const searchData = response.results?.songs?.data
  return Array.isArray(searchData) ? searchData : []
}

function catalogUrl(path: string): URL {
  return new URL(`https://amp-api.music.apple.com/v1/catalog/${path}`)
}

async function requestForStorefront(
  input: AppleCatalogLookupInput,
  storefront: string,
  limit: number,
): Promise<AppleCatalogResponse | null> {
  if (input.type === 'appleTrackId') {
    const url = catalogUrl(`${storefront}/songs/${encodeURIComponent(input.value)}`)
    url.searchParams.set('include', 'albums,artists')
    return fetchAmp(url)
  }

  if (input.type === 'isrc') {
    const url = catalogUrl(`${storefront}/songs`)
    url.searchParams.set('filter[isrc]', input.value)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('include', 'albums,artists')
    return fetchAmp(url)
  }

  const url = catalogUrl(`${storefront}/search`)
  url.searchParams.set('term', [input.title, input.artist, input.album].filter(Boolean).join(' '))
  url.searchParams.set('types', 'songs')
  url.searchParams.set('limit', String(limit))
  return fetchAmp(url)
}

async function lookupAppleCatalog(
  input: AppleCatalogLookupInput,
  limit = 5,
): Promise<AppleCatalogLookupResult | null> {
  let emptyResult: AppleCatalogLookupResult | null = null

  for (const storefront of storefrontAttempts(input.storefront ?? 'us')) {
    const response = await requestForStorefront(input, storefront, limit)
    if (!response) continue

    const songs = songsFromResponse(response)
    if (songs.length > 0) return { storefront, response, songs: songs.slice(0, limit) }
    emptyResult = { storefront, response, songs }
  }

  return emptyResult
}

export async function lookupAppleCatalogServer(
  input: AppleCatalogLookupInput,
  options: { limit?: number } = {},
): Promise<AppleCatalogLookupResult | null> {
  const validatedInput = validateLookupInput(input)
  const limit = options.limit ?? 5

  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('limit must be an integer between 1 and 10')
  }

  return lookupAppleCatalog(validatedInput, limit)
}

function normalizeStorefront(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'us'
  if (typeof value !== 'string' || !/^[a-z]{2}$/i.test(value.trim())) {
    throw new Error('storefront must be a two-letter country code')
  }
  return value.trim().toLowerCase()
}

function validateLookupInput(input: unknown): AppleCatalogLookupInput {
  if (!isRecord(input)) throw new Error('Apple Music catalog lookup input is required')

  const storefront = normalizeStorefront(input.storefront)

  if (input.type === 'appleTrackId') {
    if (typeof input.value !== 'string' || !TRACK_ID_PATTERN.test(input.value.trim())) {
      throw new Error('value must be a numeric Apple Music track ID')
    }
    return { type: 'appleTrackId', value: input.value.trim(), storefront }
  }

  if (input.type === 'isrc') {
    const value =
      typeof input.value === 'string' ? input.value.replace(/[\s-]/g, '').toUpperCase() : ''
    if (!ISRC_PATTERN.test(value)) throw new Error('value must be a valid ISRC')
    return { type: 'isrc', value, storefront }
  }

  if (input.type === 'search') {
    const title = typeof input.title === 'string' ? input.title.normalize('NFKC').trim() : ''
    const artist = typeof input.artist === 'string' ? input.artist.normalize('NFKC').trim() : ''
    const album = typeof input.album === 'string' ? input.album.normalize('NFKC').trim() : ''

    if (!title || title.length > 160) throw new Error('title must be between 1 and 160 characters')
    if (!artist || artist.length > 160) {
      throw new Error('artist must be between 1 and 160 characters')
    }
    if (album.length > 160) throw new Error('album must be at most 160 characters')

    return { type: 'search', title, artist, ...(album ? { album } : {}), storefront }
  }

  throw new Error('Unsupported Apple Music catalog lookup type')
}

export const fetchAppleCatalogServerFn = createServerFn({ method: 'GET' })
  .validator(validateLookupInput)
  .handler(async ({ data }): Promise<AppleCatalogLookupResult | null> => {
    return lookupAppleCatalog(data)
  })

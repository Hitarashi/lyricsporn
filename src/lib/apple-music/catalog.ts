const APPLE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const TOKEN_CACHE_MS = 24 * 60 * 60 * 1000

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
  artistUrl?: string
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
  url?: string
  recordLabel?: string
  copyright?: string
  isStreamable?: boolean
  contentRating?: string
  hasLyrics?: boolean
  isAppleDigitalMaster?: boolean
  attribution?: string
  audioVariants?: string[]
  upc?: string
  curatorName?: string
  description?: Record<string, AppleJsonValue | undefined>
  editorialNotes?: Record<string, AppleJsonValue | undefined>
  trackCount?: number
  playlistType?: string
  lastModifiedDate?: string
  isSingle?: boolean
  isCompilation?: boolean
  isComplete?: boolean
  isMasteredForItunes?: boolean
  isChart?: boolean
  inFavorites?: boolean
  trackTypes?: string[]
  playParams?: Record<string, AppleJsonValue | undefined>
}

export interface AppleCatalogResource extends Record<string, AppleJsonValue | undefined> {
  id: string
  type: string
  href?: string
  attributes?: AppleCatalogAttributes
  relationships?: Record<string, AppleJsonValue | undefined>
  views?: Record<string, AppleJsonValue | undefined>
  meta?: Record<string, AppleJsonValue | undefined>
}

export interface AppleCatalogResponse extends Record<string, AppleJsonValue | undefined> {
  data?: AppleCatalogResource[]
  next?: string
  results?: Record<string, AppleJsonValue | undefined> & {
    songs?: Record<string, AppleJsonValue | undefined> & { data?: AppleCatalogResource[] }
  }
}

export type AppleCatalogResourceType = 'songs' | 'artists' | 'albums' | 'playlists'

export type AppleCatalogSearchType =
  | 'activities'
  | 'albums'
  | 'apple-curators'
  | 'artists'
  | 'curators'
  | 'music-videos'
  | 'playlists'
  | 'record-labels'
  | 'songs'
  | 'stations'

export type AppleCatalogSuggestionKind = 'terms' | 'topResults'

const APPLE_CATALOG_ID_LIMITS: Record<AppleCatalogResourceType, number> = {
  songs: 300,
  artists: 25,
  albums: 25,
  playlists: 25,
}

export interface AppleCatalogResourceReference {
  type: AppleCatalogResourceType
  id: string
  storefront: string
}

export interface AppleCatalogRecordLabelReference {
  type: 'record-labels'
  id: string
  storefront: string
}

export interface AppleCatalogResourceResult {
  reference: AppleCatalogResourceReference
  storefront: string
  response: AppleCatalogResponse
  resource: AppleCatalogResource | null
  error?: boolean
}

export interface AppleCatalogRecordLabelResourceResult {
  reference: AppleCatalogRecordLabelReference
  storefront: string
  response: AppleCatalogResponse
  resource: AppleCatalogResource | null
}

export class AppleCatalogCollectionUnavailableError extends Error {
  constructor() {
    super('Apple Music has no resources for this collection.')
    this.name = 'AppleCatalogCollectionUnavailableError'
  }
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

  if (!response.ok) {
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    const errors = isRecord(payload) && Array.isArray(payload.errors) ? payload.errors : []
    const unavailableCollection = errors.some((entry) => {
      if (!isRecord(entry)) return false
      const title = typeof entry.title === 'string' ? entry.title : ''
      const detail = typeof entry.detail === 'string' ? entry.detail : ''
      return (
        title === 'No related resources' ||
        (title === 'Invalid Path Value' && detail.includes('No view found matching'))
      )
    })
    if (unavailableCollection) throw new AppleCatalogCollectionUnavailableError()
    if (response.status === 404) return null
    throw new Error(`Apple Music API returned HTTP ${response.status}`)
  }

  const payload: unknown = await response.json()
  if (!isRecord(payload)) throw new Error('Apple Music API returned an invalid response')
  return payload as AppleCatalogResponse
}

function catalogUrl(path: string): URL {
  return new URL(`https://amp-api.music.apple.com/v1/catalog/${path}`)
}

function normalizeCatalogId(value: string): string {
  const id = value.trim()
  if (!/^[a-z\d._-]{1,128}$/i.test(id)) throw new Error('Invalid Apple Music catalog ID')
  return id
}

function normalizeCatalogStorefront(value: string): string {
  const storefront = value.trim().toLowerCase()
  if (!/^[a-z]{2}$/.test(storefront)) throw new Error('Invalid Apple Music storefront')
  return storefront
}

function resourcesFromResponse(response: AppleCatalogResponse): AppleCatalogResource[] {
  return Array.isArray(response.data) ? response.data : []
}

export function fetchAppleCatalogResourceServer(
  reference: AppleCatalogResourceReference,
  options?: { include?: string[]; views?: string[]; extend?: string[] },
): Promise<AppleCatalogResourceResult | null>
export function fetchAppleCatalogResourceServer(
  reference: AppleCatalogRecordLabelReference,
  options?: { include?: string[]; views?: string[]; extend?: string[] },
): Promise<AppleCatalogRecordLabelResourceResult | null>
export async function fetchAppleCatalogResourceServer(
  reference: AppleCatalogResourceReference | AppleCatalogRecordLabelReference,
  options: { include?: string[]; views?: string[]; extend?: string[] } = {},
): Promise<AppleCatalogResourceResult | AppleCatalogRecordLabelResourceResult | null> {
  const storefront = normalizeCatalogStorefront(reference.storefront)
  const id = normalizeCatalogId(reference.id)
  const url = catalogUrl(`${storefront}/${reference.type}/${encodeURIComponent(id)}`)

  if (options.include?.length)
    url.searchParams.set('include', [...new Set(options.include)].join(','))
  if (options.views?.length) url.searchParams.set('views', [...new Set(options.views)].join(','))
  if (options.extend?.length) url.searchParams.set('extend', [...new Set(options.extend)].join(','))

  const response = await fetchAmp(url)
  if (!response) return null
  const result = {
    reference: { ...reference, id, storefront },
    storefront,
    response,
    resource: resourcesFromResponse(response)[0] ?? null,
  }
  return reference.type === 'record-labels'
    ? (result as AppleCatalogRecordLabelResourceResult)
    : (result as AppleCatalogResourceResult)
}

export async function fetchAppleCatalogSearchServer(options: {
  term: string
  storefront: string
  types: AppleCatalogSearchType[]
  limit: number
  offset: number
}): Promise<AppleCatalogResponse | null> {
  const storefront = normalizeCatalogStorefront(options.storefront)
  const url = catalogUrl(`${storefront}/search`)
  url.searchParams.set('term', options.term.trim())
  url.searchParams.set('types', [...new Set(options.types)].join(','))
  url.searchParams.set('limit', String(options.limit))
  if (options.offset > 0) url.searchParams.set('offset', String(options.offset))
  return fetchAmp(url)
}

export async function fetchAppleCatalogSearchHintsServer(options: {
  term: string
  storefront: string
  limit: number
}): Promise<AppleCatalogResponse | null> {
  const storefront = normalizeCatalogStorefront(options.storefront)
  const url = catalogUrl(`${storefront}/search/hints`)
  url.searchParams.set('term', options.term.trim())
  url.searchParams.set('limit', String(options.limit))
  return fetchAmp(url)
}

export async function fetchAppleCatalogSearchSuggestionsServer(options: {
  term: string
  storefront: string
  kinds: AppleCatalogSuggestionKind[]
  types?: AppleCatalogSearchType[]
  limit: number
}): Promise<AppleCatalogResponse | null> {
  const storefront = normalizeCatalogStorefront(options.storefront)
  const url = catalogUrl(`${storefront}/search/suggestions`)
  url.searchParams.set('term', options.term.trim())
  url.searchParams.set('kinds', [...new Set(options.kinds)].join(','))
  if (options.types?.length) url.searchParams.set('types', [...new Set(options.types)].join(','))
  url.searchParams.set('limit', String(options.limit))
  return fetchAmp(url)
}

export async function fetchAppleCatalogResourcesServer(
  references: AppleCatalogResourceReference[],
  options: { include?: string[]; views?: string[]; extend?: string[] } = {},
): Promise<AppleCatalogResourceResult[]> {
  const uniqueReferences = new Map<string, AppleCatalogResourceReference>()
  for (const reference of references) {
    const normalized = {
      ...reference,
      id: normalizeCatalogId(reference.id),
      storefront: normalizeCatalogStorefront(reference.storefront),
    }
    uniqueReferences.set(`${normalized.storefront}:${normalized.type}:${normalized.id}`, normalized)
  }

  const groups = new Map<string, AppleCatalogResourceReference[]>()
  for (const reference of uniqueReferences.values()) {
    const group = groups.get(reference.storefront) ?? []
    group.push(reference)
    groups.set(reference.storefront, group)
  }

  const requests = await Promise.all(
    [...groups.entries()].flatMap(([storefront, group]) => {
      const batches: AppleCatalogResourceReference[][] = []
      for (const type of ['songs', 'artists', 'albums', 'playlists'] as const) {
        const typedReferences = group.filter((item) => item.type === type)
        const chunkSize = APPLE_CATALOG_ID_LIMITS[type]
        for (let offset = 0; offset < typedReferences.length; offset += chunkSize) {
          const batchIndex = Math.floor(offset / chunkSize)
          const batch = batches[batchIndex] ?? []
          batch.push(...typedReferences.slice(offset, offset + chunkSize))
          batches[batchIndex] = batch
        }
      }

      return batches.map(async (batch) => {
        const url = catalogUrl(storefront)
        if (options.include?.length)
          url.searchParams.set('include', [...new Set(options.include)].join(','))
        if (options.views?.length)
          url.searchParams.set('views', [...new Set(options.views)].join(','))
        if (options.extend?.length)
          url.searchParams.set('extend', [...new Set(options.extend)].join(','))
        for (const type of ['songs', 'artists', 'albums', 'playlists'] as const) {
          const ids = batch.filter((item) => item.type === type).map((item) => item.id)
          if (ids.length > 0) url.searchParams.set(`ids[${type}]`, ids.join(','))
        }

        let response: AppleCatalogResponse | null
        try {
          response = await fetchAmp(url)
        } catch {
          return batch.map((reference) => ({
            reference,
            storefront,
            response: {},
            resource: null,
            error: true,
          }))
        }
        const resources = response ? resourcesFromResponse(response) : []
        const byKey = new Map(
          resources.map((resource) => [`${resource.type}:${resource.id}`, resource]),
        )

        return batch.map((reference) => ({
          reference,
          storefront,
          response: response ?? {},
          resource: byKey.get(`${reference.type}:${reference.id}`) ?? null,
        }))
      })
    }),
  )

  return requests.flat()
}

export async function fetchAppleCatalogCollectionServer(
  reference: AppleCatalogResourceReference | AppleCatalogRecordLabelReference,
  collection: { kind: 'relationship' | 'view'; name: string },
  options: { limit: number; offset: number } = { limit: 20, offset: 0 },
): Promise<AppleCatalogResponse | null> {
  const storefront = normalizeCatalogStorefront(reference.storefront)
  const id = normalizeCatalogId(reference.id)
  const collectionName = normalizeCatalogId(collection.name)
  const path =
    collection.kind === 'view'
      ? `${reference.type}/${encodeURIComponent(id)}/view/${encodeURIComponent(collectionName)}`
      : `${reference.type}/${encodeURIComponent(id)}/${encodeURIComponent(collectionName)}`
  const url = catalogUrl(`${storefront}/${path}`)
  url.searchParams.set('limit', String(options.limit))
  url.searchParams.set('offset', String(options.offset))
  if (collection.kind === 'view') url.searchParams.set('with', 'attributes')
  return fetchAmp(url)
}

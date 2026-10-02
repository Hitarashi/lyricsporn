export type LookupMethod = 'isrc' | 'apple' | 'search'

export type LyricsLookupIdentifier =
  | { type: 'isrc'; value: string }
  | { type: 'appleTrackId'; value: string }

export type LyricsLookupInput =
  | LyricsLookupIdentifier
  | { type: 'search'; title: string; artist: string; album?: string }

export type LookupField = 'lookupValue' | 'title' | 'artist' | 'album'

type LookupIdentifierResult =
  | { ok: true; identifier: LyricsLookupIdentifier }
  | { ok: false; error: string }

export type LookupInputResult =
  | { ok: true; input: LyricsLookupInput }
  | { ok: false; issues: Array<{ field: LookupField; message: string }> }

const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/
const APPLE_TRACK_ID_PATTERN = /^\d{1,20}$/
const APPLE_MUSIC_HOSTS = new Set(['music.apple.com'])

function normalizeText(value: string): string {
  return value.normalize('NFKC').trim()
}

function normalizeIsrc(value: string): LookupIdentifierResult {
  const compact = normalizeText(value).replace(/\s/g, '').toUpperCase()
  const normalized = compact.replace(/-/g, '')

  if (!ISRC_PATTERN.test(normalized) || !/^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/.test(compact)) {
    return {
      ok: false,
      error: 'Enter a valid 12-character ISRC. Spaces and hyphens are okay.',
    }
  }

  return { ok: true, identifier: { type: 'isrc', value: normalized } }
}

function normalizeAppleTrackId(value: string): LookupIdentifierResult {
  const normalized = normalizeText(value)

  if (!APPLE_TRACK_ID_PATTERN.test(normalized)) {
    return { ok: false, error: 'Enter the numeric Apple Music track ID.' }
  }

  return { ok: true, identifier: { type: 'appleTrackId', value: normalized } }
}

function normalizeAppleMusicLink(value: string): LookupIdentifierResult {
  const normalized = normalizeText(value)
  if (!normalized) {
    return { ok: false, error: 'Paste an Apple Music song link.' }
  }

  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(normalized)
  const urlInput = hasScheme ? normalized : `https://${normalized.replace(/^\/\//, '')}`

  let url: URL
  try {
    url = new URL(urlInput)
  } catch {
    return { ok: false, error: 'That link does not look like a valid Apple Music URL.' }
  }

  if (
    !APPLE_MUSIC_HOSTS.has(url.hostname.toLowerCase()) ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port
  ) {
    return { ok: false, error: 'Use a song link from music.apple.com.' }
  }

  const segments = url.pathname.split('/').filter(Boolean)
  const songIndex = segments.lastIndexOf('song')
  const albumIndex = segments.lastIndexOf('album')
  const queryIds = url.searchParams.getAll('i')

  if (queryIds.length > 1) {
    return { ok: false, error: 'That link contains more than one track ID.' }
  }

  const queryTrackId = queryIds[0]
  if (queryTrackId && !APPLE_TRACK_ID_PATTERN.test(queryTrackId)) {
    return { ok: false, error: 'That link contains an invalid Apple Music track ID.' }
  }

  const pathTrackId = songIndex >= 0 ? segments.at(-1) : undefined
  if (pathTrackId && !APPLE_TRACK_ID_PATTERN.test(pathTrackId)) {
    return { ok: false, error: 'That song link does not contain a valid track ID.' }
  }

  if (pathTrackId && queryTrackId && pathTrackId !== queryTrackId) {
    return { ok: false, error: 'That link points to conflicting Apple Music track IDs.' }
  }

  const trackId = pathTrackId ?? queryTrackId
  const isTrackPath = songIndex >= 0 || (albumIndex >= 0 && Boolean(queryTrackId))
  if (!isTrackPath || !trackId) {
    return {
      ok: false,
      error: 'Use a song link, or an album link opened to a specific track.',
    }
  }

  return { ok: true, identifier: { type: 'appleTrackId', value: trackId } }
}

function normalizeAppleInput(value: string): LookupIdentifierResult {
  const normalized = normalizeText(value)
  if (!normalized) {
    return { ok: false, error: 'Enter an Apple Music ID or link.' }
  }

  return /^\d+$/.test(normalized)
    ? normalizeAppleTrackId(normalized)
    : normalizeAppleMusicLink(normalized)
}

export function sanitizeLookupInput(
  method: Exclude<LookupMethod, 'search'>,
  value: string,
): LookupInputResult {
  switch (method) {
    case 'isrc':
      return toLookupInput(normalizeIsrc(value))
    case 'apple':
      return toLookupInput(normalizeAppleInput(value))
  }
}

export function sanitizeSearchLookupInput(fields: {
  title: string
  artist: string
  album: string
}): LookupInputResult {
  const title = sanitizeTrackMetadata(fields.title)
  const artist = sanitizeTrackMetadata(fields.artist)
  const album = sanitizeTrackMetadata(fields.album)
  const issues: Array<{ field: LookupField; message: string }> = []

  if (!title) {
    issues.push({ field: 'title', message: 'Enter a title.' })
  } else if (title.length > 160) {
    issues.push({ field: 'title', message: 'Title is limited to 160 characters.' })
  }

  if (!artist) {
    issues.push({ field: 'artist', message: 'Enter an artist.' })
  } else if (artist.length > 160) {
    issues.push({ field: 'artist', message: 'Artist is limited to 160 characters.' })
  }

  if (album.length > 160) {
    issues.push({ field: 'album', message: 'Album is limited to 160 characters.' })
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  return {
    ok: true,
    input: {
      type: 'search',
      title,
      artist,
      ...(album ? { album } : {}),
    },
  }
}

function toLookupInput(result: LookupIdentifierResult): LookupInputResult {
  return result.ok
    ? { ok: true, input: result.identifier }
    : { ok: false, issues: [{ field: 'lookupValue', message: result.error }] }
}

export function sanitizeTrackMetadata(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

import type { LyricsHttpPort, LyricsSource } from '@/lib/lyrics/application/ports'
import type { LyricsCandidate, LyricsLookup } from '@/lib/lyrics/domain/types'

import { metadataScore } from '@/lib/lyrics/domain/matching'

const API = 'https://music.youtube.com/youtubei/v1'
const CLIENT_VERSION = '1.20240923.01.00'

interface Track {
  title: string
  artist: string
  album?: string
  duration?: number
  videoId?: string
}

function context() {
  return {
    client: {
      clientName: 'WEB_REMIX',
      clientVersion: CLIENT_VERSION,
      hl: 'en',
      gl: 'US',
    },
  }
}

function findObjects(root: unknown, key: string): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = []

  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return

    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }

    const obj = value as Record<string, unknown>
    if (obj[key] && typeof obj[key] === 'object') {
      result.push(obj[key] as Record<string, unknown>)
    }

    for (const k of Object.keys(obj)) {
      visit(obj[k])
    }
  }

  visit(root)
  return result
}

function findStrings(root: unknown, key: string): string[] {
  const result: string[] = []

  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return

    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }

    const obj = value as Record<string, unknown>
    if (typeof obj[key] === 'string' && obj[key].trim()) {
      result.push(obj[key].trim())
    }

    for (const k of Object.keys(obj)) {
      visit(obj[k])
    }
  }

  visit(root)
  return result
}

function textAt(root: unknown, path: string[]): string | null {
  let value: unknown = root
  for (const key of path) {
    if (!value || typeof value !== 'object') return null
    value = (value as Record<string, unknown>)[key]
  }

  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>

  if (typeof obj.simpleText === 'string' && obj.simpleText.trim()) {
    return obj.simpleText.trim()
  }

  if (Array.isArray(obj.runs)) {
    const combined = obj.runs
      .map((r: { text?: string }) => (typeof r?.text === 'string' ? r.text : ''))
      .join('')
      .trim()
    return combined.length > 0 ? combined : null
  }

  return null
}

function findText(root: unknown, pattern: RegExp): string | null {
  function visit(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item)
        if (found) return found
      }
      return null
    }

    const obj = value as Record<string, unknown>
    if (typeof obj.simpleText === 'string' && pattern.test(obj.simpleText)) {
      return obj.simpleText
    }

    if (Array.isArray(obj.runs)) {
      const combined = obj.runs
        .map((r: { text?: string }) => (typeof r?.text === 'string' ? r.text : ''))
        .join('')
      if (pattern.test(combined)) return combined
    }

    for (const k of Object.keys(obj)) {
      const found = visit(obj[k])
      if (found) return found
    }

    return null
  }

  return visit(root)
}

function parseTrack(renderer: Record<string, unknown>): Track | null {
  const columns = renderer.flexColumns
  if (!Array.isArray(columns) || columns.length === 0) return null

  const titleCol = columns[0]?.musicResponsiveListItemFlexColumnRenderer
  const title = textAt(titleCol, ['text'])
  if (!title) return null

  const runs = titleCol?.text?.runs
  let videoId: string | undefined
  if (Array.isArray(runs)) {
    for (const run of runs) {
      const id = run?.navigationEndpoint?.watchEndpoint?.videoId
      if (typeof id === 'string' && id.trim()) {
        videoId = id.trim()
        break
      }
    }
  }
  if (!videoId) {
    videoId = findStrings(renderer, 'videoId')[0]
  }

  const metaCol = columns[1]?.musicResponsiveListItemFlexColumnRenderer
  const metadata = textAt(metaCol, ['text']) ?? ''
  const parts = metadata.split(' • ').map((s) => s.trim())
  const artist = parts[0] ?? ''
  const album = parts[1]

  const durationText = findText(renderer, /^\d{1,2}:\d{2}(?::\d{2})?$/)
  let duration: number | undefined
  if (durationText) {
    const segments = durationText.split(':').map((s) => Number(s))
    if (segments.length === 2 && !segments.some(Number.isNaN)) {
      duration = (segments[0] ?? 0) * 60 + (segments[1] ?? 0)
    } else if (segments.length === 3 && !segments.some(Number.isNaN)) {
      duration = (segments[0] ?? 0) * 3600 + (segments[1] ?? 0) * 60 + (segments[2] ?? 0)
    }
  }

  return { title, artist, album, duration, videoId }
}

export class YouTubeMusicLyricsSource implements LyricsSource {
  readonly id = 'youtube'
  readonly name = 'YouTube Music'

  private async post(
    http: LyricsHttpPort,
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<unknown | null> {
    const raw = await http.postJson(`${API}/${endpoint}?prettyPrint=false`, JSON.stringify(body), {
      'Content-Type': 'application/json',
    })
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  async lookup(http: LyricsHttpPort, input: LyricsLookup): Promise<LyricsCandidate[]> {
    const query = `${input.title} ${input.artistString}`
    const searchBody = {
      context: context(),
      query,
      params: 'EgWKAQIIAWoKEAkQAxAEEAoQBQ%3D%3D',
    }

    const search = await this.post(http, 'search', searchBody)
    if (!search) return []

    const renderers = findObjects(search, 'musicResponsiveListItemRenderer')
    const tracks: Track[] = renderers
      .map(parseTrack)
      .filter((t): t is Track => t !== null)
      .filter((t) => {
        return (
          metadataScore(input, t.title, t.artist, t.album, t.duration) !== null ||
          t.videoId === input.youtubeVideoId
        )
      })
      .sort((a, b) => {
        const scoreA = metadataScore(input, a.title, a.artist, a.album, a.duration) ?? 0
        const scoreB = metadataScore(input, b.title, b.artist, b.album, b.duration) ?? 0
        return scoreB - scoreA
      })
      .slice(0, 3)

    for (const track of tracks) {
      const id = track.videoId
      if (!id) continue

      const next = await this.post(http, 'next', {
        context: context(),
        videoId: id,
        playlistId: `RDAMVM${id}`,
        enablePersistentPlaylistPanel: true,
      })
      if (!next) continue

      const endpoints = findObjects(next, 'browseEndpoint')
      let browseId: string | null = null
      for (const endpoint of endpoints) {
        const browse = (endpoint.browseEndpoint as Record<string, unknown>) ?? endpoint
        const idValue = typeof browse.browseId === 'string' ? browse.browseId : null
        if (!idValue) continue

        const supportedConfigs = browse.browseEndpointContextSupportedConfigs as Record<
          string,
          unknown
        >
        const musicConfig = supportedConfigs?.browseEndpointContextMusicConfig as Record<
          string,
          unknown
        >
        const pageType = musicConfig?.pageType

        if (pageType === 'MUSIC_PAGE_TYPE_TRACK_LYRICS' || idValue.startsWith('MPLYt')) {
          browseId = idValue
          break
        }
      }

      if (!browseId) continue

      const browseResponse = await this.post(http, 'browse', {
        context: context(),
        browseId,
      })
      if (!browseResponse) continue

      const shelves = findObjects(browseResponse, 'musicDescriptionShelfRenderer')
      let description: string | null = null
      for (const shelf of shelves) {
        const desc = textAt(shelf, ['description'])
        if (desc?.trim()) {
          description = desc.trim()
          break
        }
      }

      if (!description) continue

      const score = metadataScore(input, track.title, track.artist, track.album, track.duration)
      if (score === null) continue

      return [
        {
          document: { format: 'plain', content: description },
          provider: 'YouTube Music Description',
          sourceId: `youtube:${id}`,
          sourceUrl: `https://music.youtube.com/watch?v=${id}`,
          weight: 15,
          metadataScore: score + 5,
        },
      ]
    }

    return []
  }
}

import type { LyricsResult } from '@/lib/lyrics/domain/types'
import type { LyricsOutput, LyricsOutputFormat, Track } from './contract'

function escapeXml(value: string): string {
  const xmlSafeValue = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0)
      return (
        codePoint !== undefined &&
        (codePoint === 0x9 ||
          codePoint === 0xa ||
          codePoint === 0xd ||
          (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
          (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
          (codePoint >= 0x10000 && codePoint <= 0x10ffff))
      )
    })
    .join('')

  return xmlSafeValue
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function formatLrcTime(milliseconds: number): string {
  const centiseconds = Math.floor(Math.max(0, milliseconds) / 10)
  const minutes = Math.floor(centiseconds / 6000)
  const seconds = Math.floor((centiseconds % 6000) / 100)
  const fraction = centiseconds % 100
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`
}

function formatTtmlTime(milliseconds: number): string {
  const totalMilliseconds = Math.floor(Math.max(0, milliseconds))
  const hours = Math.floor(totalMilliseconds / 3_600_000)
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000)
  const fraction = totalMilliseconds % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(3, '0')}`
}

function toElrc(lyrics: LyricsResult): string {
  return lyrics.lines
    .filter((line) => !line.isInstrumental)
    .map((line) => {
      const words = [...(line.words ?? []), ...(line.backgroundWords ?? [])].sort(
        (left, right) => left.startMs - right.startMs,
      )
      const content = words.length
        ? words.map((word) => `<${formatLrcTime(word.startMs)}>${word.text}`).join('')
        : line.text
      return `[${formatLrcTime(line.startMs)}]${content}`
    })
    .join('\n')
}

function toTtml(lyrics: LyricsResult, track: Track): string {
  const title = track.title ? `<ttm:title>${escapeXml(track.title)}</ttm:title>` : ''
  const artist = track.artist
    ? `<ttm:agent xml:id="artist"><ttm:name>${escapeXml(track.artist)}</ttm:name></ttm:agent>`
    : ''
  const lineTiming = (line: LyricsResult['lines'][number]) =>
    lyrics.syncLevel === 'plain'
      ? ''
      : ` begin="${formatTtmlTime(line.startMs)}" end="${formatTtmlTime(line.endMs)}"`
  const lines = lyrics.lines
    .filter((line) => !line.isInstrumental)
    .map((line) => {
      const words = [...(line.words ?? []), ...(line.backgroundWords ?? [])].sort(
        (left, right) => left.startMs - right.startMs,
      )
      const content = words.length
        ? words
            .map((word) => {
              const startOffset = Math.max(0, word.startMs - line.startMs)
              const endOffset =
                word.endMs === undefined ? undefined : Math.max(0, word.endMs - line.startMs)
              const end = endOffset === undefined ? '' : ` end="${formatTtmlTime(endOffset)}"`
              return `<span begin="${formatTtmlTime(startOffset)}"${end}>${escapeXml(word.text)}</span>`
            })
            .join('')
        : escapeXml(line.text)
      const timing = lineTiming(line)
      const romanization = line.romanization
        ? `<p${lineTiming(line)} xml:lang="und-x-romanized">${escapeXml(line.romanization)}</p>`
        : ''
      const translations = (line.translations ?? [])
        .map(
          (translation) =>
            `<p${lineTiming(line)} xml:lang="${escapeXml(translation.language)}">${escapeXml(translation.text)}</p>`,
        )
        .join('')
      return `<p${timing}>${content}</p>${romanization}${translations}`
    })
    .join('')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xml:lang="und">',
    `<head><metadata>${title}${artist}</metadata></head>`,
    `<body><div>${lines}</div></body>`,
    '</tt>',
  ].join('')
}

export function createLyricsOutput(
  lyrics: LyricsResult,
  track: Track,
  requestedFormats: LyricsOutputFormat[],
  found: boolean,
): LyricsOutput {
  const formats: LyricsOutput['formats'] = {}

  for (const format of requestedFormats) {
    if (!found) {
      const unavailable = {
        status: 'unavailable' as const,
        reason: 'No lyrics were found for this track.',
      }
      formats[format] = unavailable
      continue
    }

    if (format === 'json') {
      formats.json = { status: 'available', content: lyrics }
      continue
    }

    if (format === 'ttml') {
      formats.ttml = { status: 'available', content: toTtml(lyrics, track) }
      continue
    }

    if (lyrics.syncLevel !== 'word') {
      formats.elrc = {
        status: 'unavailable',
        reason: 'eLRC requires word-level timestamps, which are not available for this track.',
      }
      continue
    }

    formats.elrc = { status: 'available', content: toElrc(lyrics) }
  }

  const availableCount = Object.values(formats).filter(
    (item) => item?.status === 'available',
  ).length
  const status = !found
    ? 'not_found'
    : availableCount === requestedFormats.length
      ? 'available'
      : 'partial'

  return { status, requestedFormats, formats }
}

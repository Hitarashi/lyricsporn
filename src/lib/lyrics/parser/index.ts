import type {
  LyricsDocument,
  LyricsFormat,
  LyricsLine,
  LyricsSyncLevel,
  LyricsWord,
} from '@/lib/lyrics/domain/types'

import {
  matchInlineSingerPrefix,
  parseStandaloneSingerHeader,
  resolveSingersAndAgents,
  SingerTracker,
  stripTags,
} from './singer-tracker'
import { parseLrcTime } from './time'
import { parseKrc, parseQrc, parseRichsync, parseSubtitles, parseYrc } from './timed-formats'
import { parseTtml } from './ttml-parser'

export interface ParsedLyrics {
  format: LyricsFormat
  syncLevel: LyricsSyncLevel
  plainText: string
  lines: LyricsLine[]
}

function inferWordEnds(words: LyricsWord[], lineEndMs: number): LyricsWord[] {
  if (words.length === 0) return words
  return words.map((word, index) => {
    const nextStart = words[index + 1]?.startMs
    const inferred = nextStart ?? lineEndMs
    const end =
      word.endMs !== undefined && word.endMs > word.startMs
        ? word.endMs
        : Math.max(inferred, word.startMs + 1)
    return {
      ...word,
      endMs: end,
    }
  })
}

function withLineEnds(lines: LyricsLine[], durationMs: number = 0): LyricsLine[] {
  const sorted = [...lines].sort((a, b) => a.startMs - b.startMs)
  const defaultLineDuration = 3500

  return sorted.map((line, index) => {
    const nextStart =
      sorted[index + 1]?.startMs !== undefined && (sorted[index + 1]?.startMs ?? 0) > line.startMs
        ? sorted[index + 1]?.startMs
        : null
    const allWords = [...(line.words ?? []), ...(line.backgroundWords ?? [])]
    const wordEnd = allWords.length > 0 ? Math.max(...allWords.map((w) => w.endMs ?? 0)) : null
    const gapToNext = nextStart !== null && nextStart !== undefined ? nextStart - line.startMs : 0

    const end =
      (line.endMs > line.startMs ? line.endMs : null) ??
      (wordEnd !== null && wordEnd > line.startMs ? wordEnd : null) ??
      (nextStart !== null && nextStart !== undefined && gapToNext >= defaultLineDuration + 5000
        ? line.startMs + defaultLineDuration
        : nextStart) ??
      (durationMs > line.startMs ? durationMs : line.startMs + 3000)

    const words = line.words ? inferWordEnds(line.words, end) : undefined
    const backgroundWords = line.backgroundWords
      ? inferWordEnds(line.backgroundWords, end)
      : undefined

    return {
      ...line,
      endMs: end,
      words,
      backgroundWords,
    }
  })
}

function insertInstrumentalBreaks(lines: LyricsLine[], durationMs: number = 0): LyricsLine[] {
  if (lines.length === 0) return lines

  const result: LyricsLine[] = []
  const first = lines[0]
  if (first && !first.isInstrumental && first.startMs >= 5000) {
    result.push({
      text: '',
      startMs: 0,
      endMs: first.startMs,
      isInstrumental: true,
    })
  }

  for (const line of lines) {
    const previous = result.filter((l) => !l.isInstrumental).slice(-1)[0]
    if (previous && line.startMs - previous.endMs >= 5000) {
      result.push({
        text: '',
        startMs: previous.endMs,
        endMs: line.startMs,
        isInstrumental: true,
      })
    }
    result.push(line)
  }

  const last = result.filter((l) => !l.isInstrumental).slice(-1)[0]
  if (last && durationMs > last.endMs && durationMs - last.endMs >= 5000) {
    result.push({
      text: '',
      startMs: last.endMs,
      endMs: durationMs,
      isInstrumental: true,
    })
  }

  return result
}

function parseTextLines(
  rawText: string,
  options: { mainArtist?: string | null } = {},
): LyricsLine[] {
  const lines = rawText.replace(/^\uFEFF/, '').split(/\r?\n/)
  const parsedLines: LyricsLine[] = []
  const singerTracker = new SingerTracker()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const headerInfo = parseStandaloneSingerHeader(trimmed)
    if (headerInfo) {
      singerTracker.setSinger(headerInfo)
      continue
    }

    const timeTagRegex = /\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/g
    const timestamps: number[] = []
    let match: RegExpExecArray | null = null

    while (true) {
      match = timeTagRegex.exec(trimmed)
      if (!match) break
      const rawTime = match[1]
      const parsedTime = rawTime ? parseLrcTime(rawTime) : null
      if (parsedTime !== null) {
        timestamps.push(parsedTime)
      }
    }

    const strippedText = trimmed.replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g, '').trim()

    const bodyHeader = parseStandaloneSingerHeader(strippedText)
    if (bodyHeader) {
      singerTracker.setSinger(bodyHeader)
      continue
    }

    const inline = matchInlineSingerPrefix(strippedText)
    let lyricText = strippedText
    if (inline) {
      singerTracker.setSinger(inline.singer)
      lyricText = inline.remainingText
    }

    const wordTagRegex = /<(\d{1,2}:\d{2}(?:\.\d{1,3})?)>([^<]*)/g
    const words: LyricsWord[] = []
    let wordMatch: RegExpExecArray | null = null

    while (true) {
      wordMatch = wordTagRegex.exec(lyricText)
      if (!wordMatch) break
      const rawTime = wordMatch[1]
      const startMs = rawTime ? parseLrcTime(rawTime) : null
      const rawWord = stripTags(wordMatch[2] ?? '')
      const text = rawWord.endsWith(' ') ? `${rawWord.trim()} ` : rawWord.trim()
      if (startMs !== null && text.length > 0) {
        words.push({
          text,
          startMs,
        })
      }
    }

    const cleanLineText =
      words.length > 0 ? words.map((w) => w.text).join('') : stripTags(lyricText).trim()

    if (timestamps.length > 0) {
      for (const time of timestamps) {
        parsedLines.push({
          text: cleanLineText,
          startMs: time,
          endMs: 0,
          words: words.length > 0 ? words : undefined,
          singer: singerTracker.currentSinger ?? undefined,
          agent: singerTracker.currentAgent ?? undefined,
        })
      }
    } else if (cleanLineText.length > 0) {
      parsedLines.push({
        text: cleanLineText,
        startMs: 0,
        endMs: 0,
        singer: singerTracker.currentSinger ?? undefined,
        agent: singerTracker.currentAgent ?? undefined,
      })
    }
  }

  const withSingers = resolveSingersAndAgents(parsedLines, options.mainArtist)
  return withSingers.sort((a, b) => a.startMs - b.startMs)
}

function parseDocument(
  document: LyricsDocument,
  options: { mainArtist?: string | null },
): LyricsLine[] {
  switch (document.format) {
    case 'structured':
      return resolveSingersAndAgents([...document.lines], options.mainArtist)
    case 'ttml':
      return parseTtml(document.content, { mainArtist: options.mainArtist })
    case 'krc':
      return parseKrc(document.content)
    case 'qrc':
      return parseQrc(document.content)
    case 'yrc':
      return parseYrc(document.content)
    case 'richsync':
      return parseRichsync(document.content) ?? []
    case 'subtitles':
      return (
        parseSubtitles(document.content, (raw) =>
          parseTextLines(raw, { mainArtist: options.mainArtist }),
        ) ?? []
      )
    case 'elrc':
    case 'lrc':
    case 'plain':
      return parseTextLines(document.content, { mainArtist: options.mainArtist })
  }
}

export interface ParseLyricsOptions {
  durationMs?: number
  mainArtist?: string | null
}

export function parseLyrics(
  document: LyricsDocument,
  options: ParseLyricsOptions = {},
): ParsedLyrics {
  const durationMs = options.durationMs ?? 0
  const lines = parseDocument(document, options)

  const hasWordTimings = lines.some(
    (line) => (line.words?.length ?? 0) > 0 || (line.backgroundWords?.length ?? 0) > 0,
  )
  const hasLineTimings = lines.some((l) => l.startMs > 0)

  let syncLevel: LyricsSyncLevel = 'plain'
  let format: LyricsFormat = 'plain'

  if (hasWordTimings) {
    syncLevel = 'word'
    format = 'elrc'
  } else if (hasLineTimings) {
    syncLevel = 'line'
    format = 'lrc'
  }

  let processedLines = lines
  if (syncLevel !== 'plain') {
    const withEnds = withLineEnds(lines, durationMs)
    processedLines = insertInstrumentalBreaks(withEnds, durationMs)
  }

  const nonInstrumental = processedLines.filter((l) => !l.isInstrumental)
  const plainText = nonInstrumental
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join('\n')

  return {
    format,
    syncLevel,
    plainText,
    lines: processedLines,
  }
}

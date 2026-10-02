import type { LyricsLine } from '@/lib/lyrics/domain/types'

import { describe, expect, it } from 'bun:test'

import { parseLyrics } from '@/lib/lyrics/parser'

interface ApiWord {
  text: string
  timestamp: number
  endtime: number
}

interface ApiLine {
  timestamp: number
  endtime: number
  text: ApiWord[]
  backgroundText: ApiWord[]
  agent?: string
}

interface LyricsApiFixture {
  content: ApiLine[]
}

const fixtures = new URL('./fixtures/', import.meta.url)
const [ttml, jsonText] = await Promise.all([
  Bun.file(new URL('sample.ttml', fixtures)).text(),
  Bun.file(new URL('sample-api-response.json', fixtures)).text(),
])
const json = JSON.parse(jsonText) as LyricsApiFixture

function fromApiWord(word: ApiWord) {
  return { text: word.text, startMs: word.timestamp, endMs: word.endtime }
}

function fromApiLine(line: ApiLine): LyricsLine {
  return {
    text: line.text.map((word) => word.text).join(''),
    startMs: line.timestamp,
    endMs: line.endtime,
    words: line.text.length > 0 ? line.text.map(fromApiWord) : undefined,
    backgroundWords:
      line.backgroundText.length > 0 ? line.backgroundText.map(fromApiWord) : undefined,
    agent: line.agent,
  }
}

function comparable(lines: LyricsLine[]) {
  return lines.map(({ text, startMs, endMs, words, backgroundWords, agent }) => ({
    text,
    startMs,
    endMs,
    words,
    backgroundWords,
    agent,
  }))
}

describe('lyrics document parser', () => {
  it('parses the TTML fixture into the lyrics API JSON timing structure', () => {
    const parsed = parseLyrics({ format: 'ttml', content: ttml })
    const vocalLines = parsed.lines.filter((line) => !line.isInstrumental)

    expect(parsed.syncLevel).toBe('word')
    expect(comparable(vocalLines)).toEqual(comparable(json.content.map(fromApiLine)))
  })
})

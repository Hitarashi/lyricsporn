import type { LyricsLine } from '@/lib/lyrics/types'

import { describe, expect, it } from 'bun:test'

import {
  asEnhancedLrc,
  parseKrc,
  parseQrc,
  parseRichsync,
  parseYrc,
} from '@/lib/lyrics/parser/timed-formats'

describe('TimedFormats', () => {
  it('parses KRC lines and word timings correctly', () => {
    const krc = `
[language:en]
[0,3000]<0,1000,0>Hello <1000,1000,0>world <2000,1000,0>!
[3000,2000]<0,1000,0>Second <1000,1000,0>line
    `.trim()

    const lines = parseKrc(krc)
    expect(lines.length).toBe(2)

    expect(lines[0]?.text).toBe('Hello world !')
    expect(lines[0]?.startMs).toBe(0)
    expect(lines[0]?.endMs).toBe(3000)
    expect(lines[0]?.words?.length).toBe(3)
    expect(lines[0]?.words?.[0]?.text).toBe('Hello ')
    expect(lines[0]?.words?.[0]?.startMs).toBe(0)
    expect(lines[0]?.words?.[0]?.endMs).toBe(1000)

    expect(lines[1]?.text).toBe('Second line')
    expect(lines[1]?.startMs).toBe(3000)
    expect(lines[1]?.endMs).toBe(5000)
  })

  it('parses QRC lines and word timings correctly', () => {
    const qrc = `
[0,4000]Good(0,1000)morning(1000,2000) (3000,1000)
[4000,3000]sunshine(0,3000)
    `.trim()

    const lines = parseQrc(qrc)
    expect(lines.length).toBe(2)

    expect(lines[0]?.text).toBe('Goodmorning ')
    expect(lines[0]?.startMs).toBe(0)
    expect(lines[0]?.endMs).toBe(4000)
    expect(lines[0]?.words?.length).toBe(3)
    expect(lines[0]?.words?.[0]?.text).toBe('Good')
    expect(lines[0]?.words?.[0]?.startMs).toBe(0)
    expect(lines[0]?.words?.[0]?.endMs).toBe(1000)

    expect(lines[1]?.text).toBe('sunshine')
    expect(lines[1]?.startMs).toBe(4000)
  })

  it('parses YRC lines and word timings correctly', () => {
    const yrc = `
[1000,2000](0,1000,0)Take (1000,1000,0)on
[3000,2000](0,2000,0)me
    `.trim()

    const lines = parseYrc(yrc)
    expect(lines.length).toBe(2)

    expect(lines[0]?.text).toBe('Take on')
    expect(lines[0]?.startMs).toBe(1000)
    expect(lines[0]?.endMs).toBe(3000)
    expect(lines[0]?.words?.length).toBe(2)
    expect(lines[0]?.words?.[0]?.text).toBe('Take ')
    expect(lines[0]?.words?.[0]?.startMs).toBe(1000)
    expect(lines[0]?.words?.[0]?.endMs).toBe(2000)
  })

  it('parses Musixmatch Richsync format correctly', () => {
    const richsync = JSON.stringify([
      {
        ts: 1.5,
        te: 4.5,
        l: [
          { c: 'Never ', o: 0 },
          { c: 'gonna ', o: 0.8 },
          { c: 'give ', o: 1.6 },
          { c: 'you ', o: 2.2 },
          { c: 'up', o: 2.6 },
        ],
      },
    ])

    const lines = parseRichsync(richsync)
    expect(lines).not.toBeNull()
    expect(lines?.length).toBe(1)

    const line = lines?.[0]
    expect(line?.text).toBe('Never gonna give you up')
    expect(line?.startMs).toBe(1500)
    expect(line?.endMs).toBe(4500)
    expect(line?.words?.length).toBe(5)
    expect(line?.words?.[0]?.text).toBe('Never ')
    expect(line?.words?.[0]?.startMs).toBe(1500)
    expect(line?.words?.[4]?.text).toBe('up')
  })

  it('formats lines to enhanced LRC (ELRC)', () => {
    const lines: LyricsLine[] = [
      {
        text: 'Hello world',
        startMs: 1250,
        endMs: 3000,
        words: [
          { text: 'Hello ', startMs: 1250, endMs: 2000 },
          { text: 'world', startMs: 2000, endMs: 3000 },
        ],
      },
    ]

    const elrc = asEnhancedLrc(lines)
    expect(elrc).toBe('[00:01.250]<00:01.250>Hello <00:02.000>world')
  })
})

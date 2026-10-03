import type { Track } from '@/lib/api/v1/contract'
import type { LyricsResult } from '@/lib/lyrics/domain/types'

import { describe, expect, it } from 'bun:test'

import { createLyricsOutput } from '@/lib/api/v1/lyrics-formats'

describe('lyrics API formats', () => {
  it('encodes word timing, translations, romanization, and XML text safely', () => {
    const lyrics: LyricsResult = {
      format: 'elrc',
      syncLevel: 'word',
      plainText: 'Hello world',
      provider: 'Fixture provider',
      lines: [
        {
          text: 'Hello world',
          startMs: 1000,
          endMs: 3000,
          words: [
            { text: 'Hello &', startMs: 1000, endMs: 1800 },
            { text: '<world>', startMs: 1800, endMs: 2800 },
          ],
          backgroundWords: [{ text: 'echo', startMs: 1400, endMs: 1700 }],
          romanization: 'He-lo warld',
          translations: [{ language: 'en', text: 'Hello & welcome' }],
        },
        {
          text: 'Instrumental',
          startMs: 4000,
          endMs: 5000,
          isInstrumental: true,
        },
      ],
    }
    const track: Track = {
      id: '100',
      type: 'songs',
      title: 'A & <Song>',
      artist: 'Artist "One"',
    }

    const output = createLyricsOutput(lyrics, track, ['json', 'ttml', 'elrc'], true)

    expect(output.status).toBe('available')
    expect(output.formats.json).toEqual({ status: 'available', content: lyrics })
    expect(output.formats.ttml).toMatchObject({ status: 'available' })
    if (output.formats.ttml?.status !== 'available') throw new Error('TTML should be available')
    expect(output.formats.ttml.content).toContain('<ttm:title>A &amp; &lt;Song&gt;</ttm:title>')
    expect(output.formats.ttml.content).toContain('Artist &quot;One&quot;')
    expect(output.formats.ttml.content).toContain('&lt;world&gt;')
    expect(output.formats.ttml.content).toContain('<p begin="00:00:01.000" end="00:00:03.000">')
    expect(output.formats.elrc).toEqual({
      status: 'available',
      content: '[00:01.00]<00:01.00>Hello &<00:01.40>echo<00:01.80><world>',
    })
    expect(
      output.formats.elrc?.status === 'available' && output.formats.elrc.content,
    ).not.toContain('Instrumental')
  })

  it('marks eLRC unavailable when the lyrics contain only line timing', () => {
    const output = createLyricsOutput(
      {
        format: 'lrc',
        syncLevel: 'line',
        plainText: 'First line\nSecond line',
        provider: 'Fixture provider',
        lines: [
          { text: 'First line', startMs: 1000, endMs: 2500 },
          { text: 'Second line', startMs: 3000, endMs: 4500 },
        ],
      },
      { id: '101', type: 'songs' },
      ['elrc'],
      true,
    )

    expect(output).toMatchObject({
      status: 'partial',
      formats: {
        elrc: { status: 'unavailable' },
      },
    })
  })
})

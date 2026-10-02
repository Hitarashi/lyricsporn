import { LyricsRepository } from '@/lib/lyrics/application/repository'

import { LyricsHttp } from './http'
import { createDefaultSources } from './sources'
import { translateLyricsLines } from './translation'

const http = new LyricsHttp()

export const defaultLyricsRepository = new LyricsRepository({
  sources: createDefaultSources(),
  http,
  translator: {
    translate: (lines, language) => translateLyricsLines(lines, language, http),
  },
})

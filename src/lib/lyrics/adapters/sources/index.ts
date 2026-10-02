import type { LyricsSource } from '@/lib/lyrics/application/ports'

import { AmllTtmlDbSource } from './amll'
import { BetterLyricsSource } from './betterlyrics'
import { BinimumLyricsSource } from './binimum'
import { KugouLyricsSource } from './kugou'
import { LrclibLyricsSource } from './lrclib'
import { MusixmatchLyricsSource } from './musixmatch'
import { PaxsenixLyricsSource } from './paxsenix'
import { UnisonLyricsSource } from './unison'
import { YouTubeMusicLyricsSource } from './youtube'

export function createDefaultSources(): LyricsSource[] {
  return [
    new PaxsenixLyricsSource(),
    new BetterLyricsSource(),
    new UnisonLyricsSource(),
    new BinimumLyricsSource(),
    new AmllTtmlDbSource(),
    new KugouLyricsSource(),
    new MusixmatchLyricsSource(),
    new YouTubeMusicLyricsSource(),
    new LrclibLyricsSource(),
  ]
}

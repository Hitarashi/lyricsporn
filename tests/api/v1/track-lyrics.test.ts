import { afterAll, describe, expect, it } from 'bun:test'

import { createAppleCatalogFetch, restoreFetch, routeHandler } from '../../helpers/apple-catalog'

const appleFetch = createAppleCatalogFetch()
globalThis.fetch = appleFetch.fetcher

const { Route: TrackDetailRoute } = await import('@/routes/api/v1/tracks/$appleId')
const { Route: TrackBatchRoute } = await import('@/routes/api/v1/tracks/batch')

afterAll(restoreFetch)

describe('track lyrics API', () => {
  it('returns requested JSON, TTML, and eLRC availability for synchronized lyrics', async () => {
    appleFetch.setResponders(
      () =>
        Response.json({
          data: [
            {
              id: '818181',
              type: 'songs',
              attributes: {
                name: 'Coverage Song',
                artistName: 'Coverage Artist',
                durationInMillis: 180000,
              },
            },
          ],
        }),
      (url) => {
        if (url.hostname === 'lrclib.net' && url.pathname === '/api/get') {
          return Response.json({
            syncedLyrics:
              '[00:00.00]I keep moving through the night\n[00:02.00]The morning light is near',
          })
        }
        return new Response(null, { status: 404 })
      },
    )

    const response = await routeHandler(
      TrackDetailRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/tracks/818181?include=lyrics&formats=json,ttml,elrc',
      ),
      params: { appleId: '818181' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.lyrics.status).toBe('partial')
    expect(body.lyrics.requestedFormats).toEqual(['json', 'ttml', 'elrc'])
    expect(body.lyrics.formats.json).toMatchObject({
      status: 'available',
      content: { syncLevel: 'line' },
    })
    expect(body.lyrics.formats.json.content.lines[0].text).toBe('I keep moving through the night')
    expect(body.lyrics.formats.ttml).toMatchObject({ status: 'available' })
    expect(body.lyrics.formats.ttml.content).toContain('<tt xmlns="http://www.w3.org/ns/ttml"')
    expect(body.lyrics.formats.elrc).toMatchObject({ status: 'unavailable' })
  })

  it('marks every requested encoding unavailable when providers have no lyrics', async () => {
    appleFetch.setResponders(
      () =>
        Response.json({
          data: [
            {
              id: '828282',
              type: 'songs',
              attributes: { name: 'Missing Coverage Song', artistName: 'No Lyrics Artist' },
            },
          ],
        }),
      () => new Response(null, { status: 404 }),
    )

    const response = await routeHandler(
      TrackDetailRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/tracks/828282?include=lyrics&formats=json,ttml,elrc',
      ),
      params: { appleId: '828282' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.lyrics).toMatchObject({
      status: 'not_found',
      formats: {
        json: { status: 'unavailable' },
        ttml: { status: 'unavailable' },
        elrc: { status: 'unavailable' },
      },
    })
  })

  it('shares one lyrics lookup for repeated tracks in a queue batch', async () => {
    const lrclibRequests: URL[] = []
    appleFetch.setResponders(
      (url) => {
        const ids = url.searchParams.get('ids[songs]')?.split(',') ?? []
        return Response.json({
          data: ids.map((id) => ({
            id,
            type: 'songs',
            attributes: {
              name: 'Queue Coverage Song',
              artistName: 'Queue Coverage Artist',
              durationInMillis: 180000,
            },
          })),
        })
      },
      (url) => {
        if (url.hostname === 'lrclib.net') {
          lrclibRequests.push(url)
          if (url.pathname === '/api/get') {
            return Response.json({
              syncedLyrics:
                '[00:00.00]The queue is moving tonight\n[00:02.00]The rhythm feels right',
            })
          }
          if (url.pathname === '/api/search') return Response.json([])
        }
        return new Response(null, { status: 404 })
      },
    )

    const response = await routeHandler(
      TrackBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/tracks/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          include: ['lyrics'],
          lyrics: { formats: ['json', 'ttml'] },
          items: [{ appleId: '838383' }, { appleId: '838383' }],
        }),
      }),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items.map((item: { status: string }) => item.status)).toEqual([
      'matched',
      'matched',
    ])
    expect(
      body.items.map((item: { track: { lyrics: { status: string } } }) => item.track.lyrics.status),
    ).toEqual(['available', 'available'])
    expect(lrclibRequests.filter((url) => url.pathname === '/api/get')).toHaveLength(1)
  })
})

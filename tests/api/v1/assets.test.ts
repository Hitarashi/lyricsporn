import { afterEach, describe, expect, it } from 'bun:test'

import { Route as AssetBatchRoute } from '@/routes/api/v1/assets/batch'

import { mockAppleCatalog, restoreFetch, routeHandler } from '../../helpers/apple-catalog'
import { appleEditorialVideo, expectedMotionArtwork } from '../../helpers/apple-motion-artwork'

const artwork = {
  url: 'https://images.test/art/{w}x{h}bb.jpg',
  width: 1200,
  height: 1200,
}

afterEach(restoreFetch)

describe('asset batch API', () => {
  it('returns matched, unavailable, and not-found artwork results per item', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      const data = [
        ...(url.searchParams.get('ids[songs]')?.split(',') ?? []).flatMap((id) =>
          id === '101'
            ? [{ id, type: 'songs', attributes: { name: 'No Artwork Song' } }]
            : [{ id, type: 'songs', attributes: { name: 'Song', artistName: 'Artist', artwork } }],
        ),
        ...(url.searchParams.get('ids[artists]')?.split(',') ?? []).map((id) => ({
          id,
          type: 'artists',
          attributes: { name: 'Artist', artwork },
        })),
      ]
      return Response.json({ data })
    })

    const response = await routeHandler(
      AssetBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/assets/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          size: 400,
          items: [
            { type: 'song', appleId: '100' },
            { type: 'artist', appleId: '200', size: 600 },
            { type: 'song', appleId: '101' },
            { type: 'album', appleId: '404' },
          ],
        }),
      }),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items.map((item: { status: string }) => item.status)).toEqual([
      'matched',
      'matched',
      'unavailable',
      'not_found',
    ])
    expect(body.items[0].asset.artwork).toMatchObject({
      width: 400,
      height: 400,
      url: 'https://images.test/art/400x400bb.jpg',
    })
    expect(body.items[1].asset.artwork).toMatchObject({
      width: 600,
      height: 600,
      url: 'https://images.test/art/600x600bb.jpg',
    })
    expect(body.items.map((item: { index: number }) => item.index)).toEqual([0, 1, 2, 3])
    expect(appleRequests).toHaveLength(1)
  })

  it('rejects malformed JSON and invalid asset requests', async () => {
    const appleRequests = mockAppleCatalog(() => Response.json({ data: [] }))
    const invalidJson = await routeHandler(
      AssetBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/assets/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
      params: {},
    })
    const invalidBody = await routeHandler(
      AssetBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/assets/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [{ type: 'book', appleId: '123' }] }),
      }),
      params: {},
    })

    expect(invalidJson.status).toBe(400)
    expect(invalidBody.status).toBe(400)
    expect(appleRequests).toHaveLength(0)
  })

  it('supports motion-only assets and item-level overrides', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      const songIds = url.searchParams.get('ids[songs]')?.split(',') ?? []
      const isMotionRequest = url.searchParams.get('extend') === 'editorialVideo'
      return Response.json({
        data: songIds.map((id) => ({
          id,
          type: 'songs',
          attributes: {
            name: `Song ${id}`,
            ...(id === '101' ? { artwork } : {}),
            ...(isMotionRequest && id === '100' ? { editorialVideo: appleEditorialVideo } : {}),
          },
        })),
      })
    })

    const response = await routeHandler(
      AssetBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/assets/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          include: ['motionArtwork'],
          items: [
            { type: 'song', appleId: '100' },
            { type: 'song', appleId: '101', include: [] },
          ],
        }),
      }),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items[0]).toMatchObject({
      status: 'matched',
      asset: { id: '100', motionArtwork: expectedMotionArtwork },
    })
    expect(body.items[0].asset).not.toHaveProperty('artwork')
    expect(body.items[1].asset.artwork).toBeDefined()
    expect(body.items[1].asset).not.toHaveProperty('motionArtwork')
    expect(
      appleRequests
        .find((url) => url.searchParams.get('extend') === 'editorialVideo')
        ?.searchParams.get('ids[songs]'),
    ).toBe('100')
  })

  it('accepts a per-item motionArtwork include without a global include', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      const ids = url.searchParams.get('ids[songs]')?.split(',') ?? []
      const withMotion = url.searchParams.get('extend') === 'editorialVideo'
      return Response.json({
        data: ids.map((id) => ({
          id,
          type: 'songs',
          attributes: {
            name: `Song ${id}`,
            ...(withMotion && id === '100' ? { editorialVideo: appleEditorialVideo } : {}),
          },
        })),
      })
    })

    const response = await routeHandler(
      AssetBatchRoute,
      'POST',
    )({
      request: new Request('https://lyricsporn.test/api/v1/assets/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [
            { type: 'song', appleId: '100', include: ['motionArtwork'] },
            { type: 'song', appleId: '101' },
          ],
        }),
      }),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items[0].asset.motionArtwork).toEqual(expectedMotionArtwork)
    expect(body.items[1].asset).not.toHaveProperty('motionArtwork')
    expect(
      appleRequests
        .find((url) => url.searchParams.get('extend') === 'editorialVideo')
        ?.searchParams.get('ids[songs]'),
    ).toBe('100')
  })
})

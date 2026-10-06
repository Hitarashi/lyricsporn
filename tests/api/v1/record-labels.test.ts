import { afterEach, describe, expect, it } from 'bun:test'

import { RecordLabelIncludeSchema } from '@/lib/api/v1/catalog-contract'
import { Route as RecordLabelRoute } from '@/routes/api/v1/record-labels/$appleId'
import { Route as RecordLabelCollectionRoute } from '@/routes/api/v1/record-labels/$appleId/collections/$collection'

import { mockAppleCatalog, restoreFetch, routeHandler } from '../../helpers/apple-catalog'
import { appleEditorialVideo, expectedMotionArtwork } from '../../helpers/apple-motion-artwork'

afterEach(restoreFetch)

const recordLabelId = '1546385316'

describe('record label API', () => {
  it('defaults to artwork and does not eagerly request label views', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      expect(url.pathname).toBe(`/v1/catalog/us/record-labels/${recordLabelId}`)
      expect(url.searchParams.has('views')).toBe(false)
      return Response.json({
        data: [
          {
            id: recordLabelId,
            type: 'record-labels',
            attributes: {
              name: 'T-Series',
              url: 'https://music.apple.com/us/label/t-series/1546385316',
              description: { standard: 'A record label.', short: 'Label.' },
              artwork: { url: 'https://images.test/{w}x{h}bb.jpg', width: 1200, height: 1200 },
            },
            views: {
              'latest-releases': { data: [{ id: '1', type: 'albums' }] },
            },
          },
        ],
      })
    })

    const response = await routeHandler(
      RecordLabelRoute,
      'GET',
    )({
      request: new Request(`https://lyricsporn.test/api/v1/record-labels/${recordLabelId}`),
      params: { appleId: recordLabelId },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=600')
    expect(body.data).toEqual({
      id: recordLabelId,
      type: 'recordLabel',
      name: 'T-Series',
      url: 'https://music.apple.com/us/label/t-series/1546385316',
      artwork: {
        url: 'https://images.test/300x300bb.jpg',
        width: 300,
        height: 300,
      },
    })
    expect(appleRequests).toHaveLength(1)
  })

  it('projects description and artwork and maps requested inline release views', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      expect(url.pathname).toBe(`/v1/catalog/gb/record-labels/${recordLabelId}`)
      expect(url.searchParams.get('views')).toBe('latest-releases,top-releases')
      return Response.json({
        data: [
          {
            id: recordLabelId,
            type: 'record-labels',
            attributes: {
              name: 'T-Series',
              url: 'https://music.apple.com/gb/label/t-series/1546385316',
              description: { standard: 'A record label.', short: 'Label.' },
              artwork: { url: 'https://images.test/art/{w}x{h}bb.jpg', width: 1200, height: 1200 },
              editorialArtwork: {
                url: 'https://images.test/editorial/{w}x{h}bb.jpg',
                width: 2400,
                height: 2400,
              },
            },
            views: {
              'latest-releases': {
                data: [
                  {
                    id: '6817360094',
                    type: 'albums',
                    attributes: {
                      name: 'Beraham - Single',
                      artistName: 'Stebin Ben',
                      recordLabel: 'T-Series',
                      releaseDate: '2026-10-01',
                      artwork: {
                        url: 'https://images.test/latest/{w}x{h}bb.jpg',
                        width: 1200,
                        height: 1200,
                      },
                    },
                  },
                ],
                next: '/v1/catalog/gb/record-labels/1546385316/view/latest-releases?offset=10',
              },
              'top-releases': {
                data: [
                  {
                    id: '1887523860',
                    type: 'albums',
                    attributes: { name: 'Dhurandhar The Revenge', artistName: 'Shashwat Sachdev' },
                  },
                ],
              },
            },
          },
        ],
      })
    })

    const response = await routeHandler(
      RecordLabelRoute,
      'GET',
    )({
      request: new Request(
        `https://lyricsporn.test/api/v1/record-labels/${recordLabelId}?storefront=GB&include=description,artwork,editorialArtwork,latestReleases,topReleases&limit=5&artworkSize=600`,
      ),
      params: { appleId: recordLabelId },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({
      id: recordLabelId,
      type: 'recordLabel',
      name: 'T-Series',
      description: { standard: 'A record label.', short: 'Label.' },
      artwork: {
        url: 'https://images.test/art/600x600bb.jpg',
        width: 600,
        height: 600,
      },
      editorialArtwork: {
        url: 'https://images.test/editorial/600x600bb.jpg',
        width: 600,
        height: 600,
      },
      collections: {
        latestReleases: {
          items: [
            {
              id: '6817360094',
              type: 'album',
              name: 'Beraham - Single',
              artistName: 'Stebin Ben',
              artwork: {
                url: 'https://images.test/latest/600x600bb.jpg',
                width: 600,
                height: 600,
              },
            },
          ],
        },
        topReleases: {
          items: [{ id: '1887523860', type: 'album', name: 'Dhurandhar The Revenge' }],
        },
      },
    })
    expect(body.data.collections.latestReleases.next).toContain(
      '/api/v1/record-labels/1546385316/collections/latestReleases',
    )
    const next = new URL(body.data.collections.latestReleases.next, 'https://lyricsporn.test')
    expect(next.searchParams.get('storefront')).toBe('gb')
    expect(next.searchParams.get('limit')).toBe('5')
    expect(next.searchParams.get('offset')).toBe('10')
    expect(next.searchParams.get('artworkSize')).toBe('600')
    expect(appleRequests).toHaveLength(1)
  })

  it('maps both collection names to paginated Apple views and preserves request options', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      const collection = url.pathname.endsWith('/view/latest-releases')
        ? 'latestReleases'
        : 'topReleases'
      expect(url.pathname).toBe(
        `/v1/catalog/ca/record-labels/${recordLabelId}/view/${collection === 'latestReleases' ? 'latest-releases' : 'top-releases'}`,
      )
      expect(url.searchParams.get('limit')).toBe('2')
      expect(url.searchParams.get('offset')).toBe('3')
      expect(url.searchParams.get('with')).toBe('attributes')
      return Response.json({
        data: [
          {
            id: collection === 'latestReleases' ? 'album.latest' : 'album.top',
            type: 'albums',
            attributes: {
              name: collection,
              artwork: { url: 'https://images.test/{w}x{h}bb.jpg', width: 1200, height: 1200 },
            },
          },
        ],
        next: `/v1/catalog/ca/record-labels/${recordLabelId}/view/${collection === 'latestReleases' ? 'latest-releases' : 'top-releases'}?offset=5`,
      })
    })

    for (const collection of ['latestReleases', 'topReleases'] as const) {
      const response = await routeHandler(
        RecordLabelCollectionRoute,
        'GET',
      )({
        request: new Request(
          `https://lyricsporn.test/api/v1/record-labels/${recordLabelId}/collections/${collection}?storefront=CA&limit=2&offset=3&artworkSize=600`,
        ),
        params: { appleId: recordLabelId, collection },
      })
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        type: collection,
        items: [
          {
            id: collection === 'latestReleases' ? 'album.latest' : 'album.top',
            type: 'album',
            name: collection,
            artwork: { url: 'https://images.test/600x600bb.jpg', width: 600, height: 600 },
          },
        ],
        page: { limit: 2, offset: 3 },
      })
      const next = new URL(body.page.next, 'https://lyricsporn.test')
      expect(next.pathname).toBe(`/api/v1/record-labels/${recordLabelId}/collections/${collection}`)
      expect(next.searchParams.get('storefront')).toBe('ca')
      expect(next.searchParams.get('limit')).toBe('2')
      expect(next.searchParams.get('offset')).toBe('5')
      expect(next.searchParams.get('artworkSize')).toBe('600')
    }

    expect(appleRequests).toHaveLength(2)
  })

  it('fetches album motion artwork only when requested for a release collection', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.searchParams.get('ids[albums]') === 'album.motion') {
        return Response.json({
          data: [
            {
              id: 'album.motion',
              type: 'albums',
              attributes: { editorialVideo: appleEditorialVideo },
            },
          ],
        })
      }
      return Response.json({
        data: [{ id: 'album.motion', type: 'albums', attributes: { name: 'Release' } }],
        next: `/v1/catalog/us/record-labels/${recordLabelId}/view/top-releases?offset=25`,
      })
    })

    const response = await routeHandler(
      RecordLabelCollectionRoute,
      'GET',
    )({
      request: new Request(
        `https://lyricsporn.test/api/v1/record-labels/${recordLabelId}/collections/topReleases?include=motionArtwork`,
      ),
      params: { appleId: recordLabelId, collection: 'topReleases' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items[0]).toMatchObject({
      id: 'album.motion',
      motionArtwork: expectedMotionArtwork,
    })
    expect(new URL(body.page.next, 'https://lyricsporn.test').searchParams.get('include')).toBe(
      'motionArtwork',
    )
    expect(appleRequests.some((url) => url.searchParams.get('extend') === 'editorialVideo')).toBe(
      true,
    )
    expect(appleRequests).toHaveLength(2)
  })

  it('rejects invalid IDs, includes, collections, and pagination before Apple requests', async () => {
    const appleRequests = mockAppleCatalog(() => Response.json({ data: [] }))
    const entityRequest = (url: string, appleId = recordLabelId) =>
      routeHandler(
        RecordLabelRoute,
        'GET',
      )({
        request: new Request(url),
        params: { appleId },
      })
    const collectionRequest = (collection: string, query = '') =>
      routeHandler(
        RecordLabelCollectionRoute,
        'GET',
      )({
        request: new Request(
          `https://lyricsporn.test/api/v1/record-labels/${recordLabelId}/collections/${collection}${query}`,
        ),
        params: { appleId: recordLabelId, collection },
      })

    const invalidId = await entityRequest(
      'https://lyricsporn.test/api/v1/record-labels/bad%20id',
      'bad id',
    )
    const invalidInclude = await entityRequest(
      `https://lyricsporn.test/api/v1/record-labels/${recordLabelId}?include=albums`,
    )
    const duplicateQuery = await entityRequest(
      `https://lyricsporn.test/api/v1/record-labels/${recordLabelId}?include=artwork&include=description`,
    )
    const unsupportedCollection = await collectionRequest('albums')
    const invalidLimit = await collectionRequest('latestReleases', '?limit=0')
    const invalidOffset = await collectionRequest('topReleases', '?offset=10001')

    expect(invalidId.status).toBe(400)
    expect(invalidInclude.status).toBe(400)
    expect(duplicateQuery.status).toBe(400)
    expect(unsupportedCollection.status).toBe(400)
    expect(invalidLimit.status).toBe(400)
    expect(invalidOffset.status).toBe(400)
    expect(appleRequests).toHaveLength(0)
    expect(RecordLabelIncludeSchema.options).toEqual([
      'artwork',
      'editorialArtwork',
      'description',
      'latestReleases',
      'topReleases',
    ])
  })

  it('returns not found for absent labels and generic errors for Apple failures', async () => {
    mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/record-labels/404')) return new Response(null, { status: 404 })
      if (url.pathname.endsWith('/record-labels/503')) return new Response(null, { status: 503 })
      return Response.json({ data: [] })
    })

    const notFound = await routeHandler(
      RecordLabelRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/record-labels/404'),
      params: { appleId: '404' },
    })
    const failure = await routeHandler(
      RecordLabelRoute,
      'GET',
    )({
      request: new Request('https://lyricsporn.test/api/v1/record-labels/503'),
      params: { appleId: '503' },
    })

    expect(notFound.status).toBe(404)
    expect((await notFound.json()).error.code).toBe('not_found')
    expect(failure.status).toBe(500)
    expect((await failure.json()).error.code).toBe('internal_error')
  })

  it('returns an empty requested view for an existing label and not found for a missing one', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/view/latest-releases')) {
        return Response.json(
          {
            errors: [
              { title: 'Invalid Path Value', detail: 'No view found matching latest-releases' },
            ],
          },
          { status: 404 },
        )
      }
      if (url.pathname.endsWith('/record-labels/404')) return new Response(null, { status: 404 })
      return Response.json({
        data: [{ id: recordLabelId, type: 'record-labels', attributes: { name: 'T-Series' } }],
      })
    })

    const existing = await routeHandler(
      RecordLabelCollectionRoute,
      'GET',
    )({
      request: new Request(
        `https://lyricsporn.test/api/v1/record-labels/${recordLabelId}/collections/latestReleases`,
      ),
      params: { appleId: recordLabelId, collection: 'latestReleases' },
    })
    const missing = await routeHandler(
      RecordLabelCollectionRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/record-labels/404/collections/latestReleases',
      ),
      params: { appleId: '404', collection: 'latestReleases' },
    })

    expect(existing.status).toBe(200)
    expect(await existing.json()).toMatchObject({ type: 'latestReleases', items: [] })
    expect(missing.status).toBe(404)
    expect((await missing.json()).error.code).toBe('not_found')
    expect(appleRequests).toHaveLength(4)
  })

  it('returns a generic error when a label collection request fails upstream', async () => {
    mockAppleCatalog(() => new Response(null, { status: 503 }))

    const response = await routeHandler(
      RecordLabelCollectionRoute,
      'GET',
    )({
      request: new Request(
        `https://lyricsporn.test/api/v1/record-labels/${recordLabelId}/collections/topReleases`,
      ),
      params: { appleId: recordLabelId, collection: 'topReleases' },
    })

    expect(response.status).toBe(500)
    expect((await response.json()).error.code).toBe('internal_error')
  })
})

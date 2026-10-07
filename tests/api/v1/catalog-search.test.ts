import { afterEach, describe, expect, it } from 'bun:test'

import { Route as CatalogSearchRoute } from '@/routes/api/v1/catalog/search'
import { Route as CatalogSuggestionsRoute } from '@/routes/api/v1/catalog/search/suggestions'

import { mockAppleCatalog, restoreFetch, routeHandler } from '../../helpers/apple-catalog'
import { appleEditorialVideo, expectedMotionArtwork } from '../../helpers/apple-motion-artwork'

afterEach(restoreFetch)

function song(id: string, editorial = false) {
  return {
    id,
    type: 'songs',
    attributes: {
      name: `Song ${id}`,
      artistName: 'Example Artist',
      ...(editorial ? { editorialVideo: appleEditorialVideo } : {}),
    },
  }
}

describe('catalog search motion artwork', () => {
  it('includes requested motion URLs in song search results and preserves the option in next links', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/search/suggestions')) return Response.json({ results: {} })
      if (url.pathname.endsWith('/search')) {
        return Response.json({
          results: {
            songs: {
              data: [song('101')],
              next: 'https://amp-api.music.apple.com/v1/catalog/us/search?offset=5',
            },
          },
        })
      }
      const songIds = url.searchParams.get('ids[songs]')?.split(',') ?? []
      return Response.json({
        data: songIds.map((id) => song(id, url.searchParams.get('extend') === 'editorialVideo')),
      })
    })

    const response = await routeHandler(
      CatalogSearchRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/catalog/search?term=example&types=songs&include=motionArtwork',
      ),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results.songs.items[0].motionArtwork).toEqual(expectedMotionArtwork)
    expect(
      new URL(body.results.songs.next, 'https://lyricsporn.test').searchParams.get('include'),
    ).toBe('motionArtwork')
    expect(appleRequests.some((url) => url.searchParams.get('extend') === 'editorialVideo')).toBe(
      true,
    )
  })

  it('includes requested motion URLs in song top-result suggestions', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/search/suggestions')) {
        return Response.json({
          results: { suggestions: [{ kind: 'topResults', content: song('202') }] },
        })
      }
      if (url.pathname.endsWith('/search')) return Response.json({ results: {} })
      const songIds = url.searchParams.get('ids[songs]')?.split(',') ?? []
      return Response.json({
        data: songIds.map((id) => song(id, url.searchParams.get('extend') === 'editorialVideo')),
      })
    })

    const response = await routeHandler(
      CatalogSuggestionsRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/catalog/search/suggestions?term=example&kinds=topResults&types=songs&include=motionArtwork',
      ),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.suggestions[0].content.motionArtwork).toEqual(expectedMotionArtwork)
    expect(appleRequests.some((url) => url.searchParams.get('extend') === 'editorialVideo')).toBe(
      true,
    )
  })

  it('returns results.topResults containing items mapped from mocked Apple suggestions when types=top-results', async () => {
    mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/search/suggestions')) {
        expect(url.searchParams.get('kinds')).toBe('topResults')
        return Response.json({
          results: {
            suggestions: [{ kind: 'topResults', content: song('301') }],
          },
        })
      }
      return Response.json({ results: {} })
    })

    const response = await routeHandler(
      CatalogSearchRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/catalog/search?term=example&types=top-results',
      ),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results.topResults).toBeDefined()
    expect(body.results.topResults.items).toHaveLength(1)
    expect(body.results.topResults.items[0].id).toBe('301')
    expect(body.results.topResults.items[0].type).toBe('song')
    expect(body.results.topResults.items[0].name).toBe('Song 301')
    expect(body.results.songs).toBeUndefined()
  })

  it('returns both results.topResults and results.songs when types=top-results,songs', async () => {
    mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/search/suggestions')) {
        return Response.json({
          results: {
            suggestions: [{ kind: 'topResults', content: song('301') }],
          },
        })
      }
      if (url.pathname.endsWith('/search')) {
        return Response.json({
          results: {
            songs: {
              data: [song('101')],
            },
          },
        })
      }
      return Response.json({ results: {} })
    })

    const response = await routeHandler(
      CatalogSearchRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/catalog/search?term=example&types=top-results,songs',
      ),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results.topResults).toBeDefined()
    expect(body.results.topResults.items[0].id).toBe('301')
    expect(body.results.songs).toBeDefined()
    expect(body.results.songs.items[0].id).toBe('101')
  })

  it('properly populates motion artwork for topResults when include=motionArtwork', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      if (url.pathname.endsWith('/search/suggestions')) {
        return Response.json({
          results: {
            suggestions: [{ kind: 'topResults', content: song('301') }],
          },
        })
      }
      if (url.pathname.endsWith('/search')) return Response.json({ results: {} })
      const songIds = url.searchParams.get('ids[songs]')?.split(',') ?? []
      return Response.json({
        data: songIds.map((id) => song(id, url.searchParams.get('extend') === 'editorialVideo')),
      })
    })

    const response = await routeHandler(
      CatalogSearchRoute,
      'GET',
    )({
      request: new Request(
        'https://lyricsporn.test/api/v1/catalog/search?term=example&types=top-results&include=motionArtwork',
      ),
      params: {},
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.results.topResults).toBeDefined()
    expect(body.results.topResults.items[0].motionArtwork).toEqual(expectedMotionArtwork)
    expect(appleRequests.some((url) => url.searchParams.get('extend') === 'editorialVideo')).toBe(
      true,
    )
  })
})

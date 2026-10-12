import { afterEach, describe, expect, it } from 'bun:test'

import { Route as BrowseRoute } from '@/routes/api/v1/browse'
import { Route as EditorialGroupingsRoute } from '@/routes/api/v1/editorial/groupings'

import { mockAppleCatalog, restoreFetch, routeHandler } from '../../helpers/apple-catalog'

afterEach(restoreFetch)

const mockGroupingPayload = {
  data: [
    {
      id: '134581',
      type: 'groupings',
      href: '/v1/editorial/us/groupings/134581',
      attributes: {
        name: 'Music',
        genreNames: ['Music'],
      },
      relationships: {
        tabs: {
          data: [
            {
              id: 'default',
              type: 'editorial-elements',
              relationships: {
                children: {
                  data: [
                    {
                      id: '6820657009',
                      type: 'editorial-elements',
                      attributes: {
                        editorialElementKind: '316',
                        displayStyle: 'compact',
                      },
                      relationships: {
                        children: {
                          data: [
                            {
                              id: '6817015026',
                              type: 'editorial-elements',
                              attributes: {
                                designBadge: 'LIVE FROM INDIO',
                                designTag:
                                  'Watch sets from Swedish House Mafia, Skrillex and more.',
                                artwork: {
                                  url: 'https://images.test/hero/{w}x{h}bb.jpg',
                                  width: 4320,
                                  height: 1080,
                                  bgColor: '525c77',
                                },
                              },
                              relationships: {
                                contents: {
                                  data: [
                                    {
                                      id: 'ra.6817015026',
                                      type: 'stations',
                                      attributes: {
                                        name: 'HEAD TRIP: Day 2',
                                        url: 'https://music.apple.com/station/head-trip/ra.6817015026',
                                      },
                                    },
                                  ],
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                    {
                      id: '6820656898',
                      type: 'editorial-elements',
                      attributes: {
                        name: 'Best New Songs',
                        editorialElementKind: '327',
                        type: 'track',
                      },
                      relationships: {
                        room: {
                          data: [{ id: 'room.best-new', type: 'rooms' }],
                        },
                        contents: {
                          data: [
                            {
                              id: '6808957584',
                              type: 'songs',
                              attributes: {
                                name: 'The Sun',
                                artistName: 'Zokova',
                                albumName: 'The Sun - Single',
                                durationInMillis: 297500,
                                isrc: 'AUQ9D2685402',
                                artwork: {
                                  url: 'https://images.test/song/{w}x{h}bb.jpg',
                                  width: 3000,
                                  height: 3000,
                                },
                              },
                            },
                            {
                              id: '6817358245',
                              type: 'songs',
                              attributes: {
                                name: 'BADASS',
                                artistName: 'Arjan Dhillon',
                                albumName: 'BADASS - Single',
                                durationInMillis: 182000,
                                artwork: {
                                  url: 'https://images.test/song2/{w}x{h}bb.jpg',
                                  width: 3000,
                                  height: 3000,
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                    {
                      id: '6820657156',
                      type: 'editorial-elements',
                      attributes: {
                        name: 'New This Week',
                        editorialElementKind: '326',
                        type: 'album',
                      },
                      relationships: {
                        contents: {
                          data: [
                            {
                              id: '6818171708',
                              type: 'albums',
                              attributes: {
                                name: 'WILDCARD - Single',
                                artistName: 'Karan Aujla',
                                trackCount: 1,
                                releaseDate: '2026-10-10',
                                artwork: {
                                  url: 'https://images.test/album/{w}x{h}bb.jpg',
                                  width: 3000,
                                  height: 3000,
                                },
                              },
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    },
  ],
}

describe('editorial groupings API', () => {
  it('returns normalized editorial grouping with hero items and shelf sections', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      expect(url.pathname).toBe('/v1/editorial/us/groupings')
      expect(url.searchParams.get('name')).toBe('music')
      expect(url.searchParams.get('platform')).toBe('web')
      expect(url.searchParams.get('tabs')).toBe('nonsubscriber')
      return Response.json(mockGroupingPayload)
    })

    const response = await routeHandler(
      EditorialGroupingsRoute,
      'GET',
    )({
      request: new Request('https://api.test/api/v1/editorial/groupings'),
      params: {},
    })

    expect(response.status).toBe(200)
    expect(appleRequests).toHaveLength(1)

    const payload = await response.json()
    expect(payload.storefront).toBe('us')
    expect(payload.name).toBe('music')
    expect(payload.title).toBe('New')

    // Hero verification
    expect(payload.hero).toHaveLength(1)
    expect(payload.hero[0].badge).toBe('LIVE FROM INDIO')
    expect(payload.hero[0].title).toBe('Watch sets from Swedish House Mafia, Skrillex and more.')
    expect(payload.hero[0].artwork?.url).toBe('https://images.test/hero/300x300bb.jpg')
    expect(payload.hero[0].destination).toEqual({
      type: 'station',
      id: 'ra.6817015026',
      url: 'https://music.apple.com/station/head-trip/ra.6817015026',
    })

    // Shelves verification
    expect(payload.sections).toHaveLength(2)
    const bestNewSongs = payload.sections[0]
    expect(bestNewSongs.id).toBe('6820656898')
    expect(bestNewSongs.slug).toBe('best-new-songs')
    expect(bestNewSongs.title).toBe('Best New Songs')
    expect(bestNewSongs.layout).toBe('tracks')
    expect(bestNewSongs.hasMore).toBe(true)
    expect(bestNewSongs.roomId).toBe('room.best-new')
    expect(bestNewSongs.items).toHaveLength(2)
    expect(bestNewSongs.items[0]).toMatchObject({
      id: '6808957584',
      type: 'song',
      name: 'The Sun',
      artistName: 'Zokova',
      albumName: 'The Sun - Single',
      durationMs: 297500,
      isrc: 'AUQ9D2685402',
    })

    const newThisWeek = payload.sections[1]
    expect(newThisWeek.slug).toBe('new-this-week')
    expect(newThisWeek.layout).toBe('albums')
    expect(newThisWeek.hasMore).toBe(false)
    expect(newThisWeek.items).toHaveLength(1)
    expect(newThisWeek.items[0]).toMatchObject({
      id: '6818171708',
      type: 'album',
      name: 'WILDCARD - Single',
      artistName: 'Karan Aujla',
    })
  })

  it('works via the /api/v1/browse alias route', async () => {
    mockAppleCatalog((url) => {
      expect(url.pathname).toBe('/v1/editorial/in/groupings')
      expect(url.searchParams.get('name')).toBe('music')
      return Response.json(mockGroupingPayload)
    })

    const response = await routeHandler(
      BrowseRoute,
      'GET',
    )({
      request: new Request('https://api.test/api/v1/browse?storefront=in'),
      params: {},
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.storefront).toBe('in')
    expect(payload.title).toBe('New')
    expect(payload.sections).toHaveLength(2)
  })

  it('supports section filtering and item limits', async () => {
    mockAppleCatalog(() => Response.json(mockGroupingPayload))

    const response = await routeHandler(
      EditorialGroupingsRoute,
      'GET',
    )({
      request: new Request(
        'https://api.test/api/v1/editorial/groupings?sections=best-new-songs&limit=1',
      ),
      params: {},
    })

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.hero).toHaveLength(0) // hero not included in filter
    expect(payload.sections).toHaveLength(1)
    expect(payload.sections[0].slug).toBe('best-new-songs')
    expect(payload.sections[0].items).toHaveLength(1) // limit=1 respected
    expect(payload.sections[0].items[0].name).toBe('The Sun')
  })

  it('rejects invalid storefront and returns 400', async () => {
    const response = await routeHandler(
      EditorialGroupingsRoute,
      'GET',
    )({
      request: new Request('https://api.test/api/v1/editorial/groupings?storefront=invalid123'),
      params: {},
    })

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error.code).toBe('invalid_request')
  })

  it('returns 404 when Apple Music returns an empty response', async () => {
    mockAppleCatalog(() => Response.json({ data: [] }))

    const response = await routeHandler(
      EditorialGroupingsRoute,
      'GET',
    )({
      request: new Request('https://api.test/api/v1/editorial/groupings?name=unknown'),
      params: {},
    })

    expect(response.status).toBe(404)
    const payload = await response.json()
    expect(payload.error.code).toBe('not_found')
  })
})

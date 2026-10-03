import { afterEach, describe, expect, it } from 'bun:test'

import { getCatalogEntityServer } from '@/lib/api/v1/catalog-service'

import { mockAppleCatalog, restoreFetch } from '../../helpers/apple-catalog'

afterEach(restoreFetch)

describe('catalog entity service', () => {
  it('omits unsupported detail limits and projects the requested collection', async () => {
    const appleRequests = mockAppleCatalog(() =>
      Response.json({
        data: [
          {
            id: '28721078',
            type: 'artists',
            attributes: { name: 'Sia' },
            views: {
              'top-songs': {
                data: [
                  { id: '1', type: 'songs', attributes: { name: 'Track one' } },
                  { id: '2', type: 'songs', attributes: { name: 'Track two' } },
                ],
                next: 'https://amp-api.music.apple.com/v1/catalog/us/artists/28721078/view/top-songs?offset=25',
              },
            },
          },
        ],
      }),
    )

    const artist = await getCatalogEntityServer({
      type: 'artist',
      appleId: '28721078',
      storefront: 'us',
      include: ['topSongs'],
      limit: 1,
      artworkSize: 300,
    })

    expect(appleRequests).toHaveLength(1)
    expect(appleRequests[0]?.searchParams.get('views')).toBe('top-songs')
    expect(appleRequests[0]?.searchParams.has('limit')).toBe(false)
    expect(artist?.type).toBe('artist')
    if (artist?.type === 'artist') {
      expect(artist.collections?.topSongs?.items).toHaveLength(1)
      expect(artist.collections?.topSongs?.next).toContain('offset=1')
    }
  })
})

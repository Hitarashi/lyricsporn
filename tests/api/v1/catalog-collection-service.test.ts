import { afterEach, describe, expect, it } from 'bun:test'

import { getCatalogCollectionServer } from '@/lib/api/v1/catalog-service'

import { mockAppleCatalog, restoreFetch } from '../../helpers/apple-catalog'

afterEach(restoreFetch)

describe('catalog collection service', () => {
  it('clamps collection limits and reports the effective limit', async () => {
    const appleRequests = mockAppleCatalog(() =>
      Response.json({
        data: [
          { id: 'pl.one', type: 'playlists', attributes: { name: 'Playlist one' } },
          { id: 'pl.two', type: 'playlists', attributes: { name: 'Playlist two' } },
        ],
        next: 'https://amp-api.music.apple.com/v1/catalog/us/artists/28721078/playlists?offset=10',
      }),
    )

    const collection = await getCatalogCollectionServer({
      type: 'artist',
      appleId: '28721078',
      collection: 'playlists',
      storefront: 'us',
      limit: 100,
      offset: 0,
      artworkSize: 300,
    })

    expect(appleRequests).toHaveLength(1)
    expect(appleRequests[0]?.searchParams.get('limit')).toBe('10')
    expect(collection?.page.limit).toBe(10)
    expect(collection?.page.next).toContain('limit=10')
    expect(collection?.items).toHaveLength(2)
  })
})

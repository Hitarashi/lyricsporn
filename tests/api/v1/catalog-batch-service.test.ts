import { afterEach, describe, expect, it } from 'bun:test'

import { CatalogBatchRequestSchema } from '@/lib/api/v1/catalog-contract'
import { lookupCatalogBatchServer } from '@/lib/api/v1/catalog-service'

import { mockAppleCatalog, restoreFetch } from '../../helpers/apple-catalog'

afterEach(restoreFetch)

describe('catalog batch service', () => {
  it('deduplicates Apple requests and preserves input ordering', async () => {
    const appleRequests = mockAppleCatalog((url) => {
      const ids = url.searchParams.get('ids[artists]')?.split(',') ?? []
      return Response.json({
        data: ids.map((id) => ({
          id,
          type: 'artists',
          attributes: { name: `Artist ${id}`, genreNames: ['Pop'] },
          views: {
            'top-songs': {
              data: [
                { id: `${id}-song-1`, type: 'songs', attributes: { name: 'Track one' } },
                { id: `${id}-song-2`, type: 'songs', attributes: { name: 'Track two' } },
              ],
            },
          },
        })),
      })
    })

    const request = CatalogBatchRequestSchema.parse({
      limit: 1,
      include: { artist: ['topSongs'] },
      items: [
        { type: 'artist', appleId: '28721078' },
        { type: 'artist', appleId: '462006' },
        { type: 'artist', appleId: '28721078' },
      ],
    })
    const response = await lookupCatalogBatchServer(request)

    expect(appleRequests).toHaveLength(1)
    expect(appleRequests[0]?.searchParams.getAll('ids[artists]')).toEqual(['28721078,462006'])
    expect(appleRequests[0]?.searchParams.get('views')).toBe('top-songs')
    expect(appleRequests[0]?.searchParams.has('limit')).toBe(false)
    expect(response.items.map((item) => item.status)).toEqual(['matched', 'matched', 'matched'])
    expect(response.items.map((item) => item.index)).toEqual([0, 1, 2])
    expect(response.items.map((item) => (item.status === 'matched' ? item.data.id : null))).toEqual(
      ['28721078', '462006', '28721078'],
    )
    expect(
      response.items.map((item) =>
        item.status === 'matched' && item.data.type === 'artist'
          ? item.data.collections?.topSongs?.items.length
          : null,
      ),
    ).toEqual([1, 1, 1])
  })
})

import { describe, expect, it } from 'bun:test'

import { openApiDocument } from '@/lib/api/v1/openapi'

describe('OpenAPI track routes', () => {
  it('exposes Apple ID track resources without a separate lookup route', () => {
    const paths = openApiDocument.paths ?? {}
    const routePaths = Object.keys(paths)

    expect(routePaths).toContain('/api/v1/tracks/{appleId}')
    expect(routePaths).toContain('/api/v1/tracks/batch')
    expect(routePaths).not.toContain('/api/v1/lookup')
    expect(paths['/api/v1/tracks/{appleId}']).toHaveProperty('get')
    expect(paths['/api/v1/tracks/batch']).toHaveProperty('post')
  })
})

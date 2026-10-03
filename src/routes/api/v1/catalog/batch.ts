import { createFileRoute } from '@tanstack/react-router'

import { handleCatalogBatchPost } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/catalog/batch')({
  server: {
    handlers: {
      POST: async ({ request }) => handleCatalogBatchPost(request),
    },
  },
})

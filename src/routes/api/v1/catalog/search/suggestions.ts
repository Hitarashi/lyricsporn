import { createFileRoute } from '@tanstack/react-router'

import { handleCatalogSearchSuggestionsGet } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/catalog/search/suggestions')({
  server: {
    handlers: {
      GET: async ({ request }) => handleCatalogSearchSuggestionsGet(request),
    },
  },
})

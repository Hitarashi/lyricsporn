import { createFileRoute } from '@tanstack/react-router'

import { handleAssetBatchPost } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/assets/batch')({
  server: {
    handlers: {
      POST: async ({ request }) => handleAssetBatchPost(request),
    },
  },
})

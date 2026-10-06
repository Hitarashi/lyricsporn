import { createFileRoute } from '@tanstack/react-router'

import { handleRecordLabelCollectionGet } from '@/lib/api/v1/catalog-handlers'

export const Route = createFileRoute('/api/v1/record-labels/$appleId/collections/$collection')({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        handleRecordLabelCollectionGet(request, params.appleId, params.collection),
    },
  },
})

import type { ZodIssue } from 'zod'
import type { ApiError } from './contract'

function mapIssues(issues: ZodIssue[]): NonNullable<ApiError['issues']> {
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }))
}

export function invalidRequestResponse(issues: ZodIssue[]): Response {
  const error: ApiError = {
    code: 'invalid_request',
    message: 'The request is invalid.',
    issues: mapIssues(issues),
  }

  return Response.json({ error }, { status: 400 })
}

export function unexpectedErrorResponse(): Response {
  return Response.json(
    {
      error: {
        code: 'internal_error',
        message: 'The request could not be completed.',
      },
    },
    { status: 500 },
  )
}

export function resourceNotFoundResponse(resource: string): Response {
  return Response.json(
    {
      error: {
        code: 'not_found',
        message: `${resource} was not found in the Apple Music catalog.`,
      },
    },
    { status: 404 },
  )
}

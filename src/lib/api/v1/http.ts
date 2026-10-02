import type { ZodIssue } from 'zod'
import type { LookupError } from './contract'

function mapIssues(issues: ZodIssue[]): NonNullable<LookupError['issues']> {
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }))
}

export function invalidRequestResponse(issues: ZodIssue[]): Response {
  const error: LookupError = {
    code: 'invalid_request',
    message: 'The request is invalid.',
    issues: mapIssues(issues),
  }

  return Response.json({ error }, { status: 400 })
}

export function invalidLookupResponse(path: string, message: string): Response {
  const error: LookupError = {
    code: 'invalid_lookup',
    message: 'One or more lookup values are invalid.',
    issues: [{ path, message }],
  }

  return Response.json({ error }, { status: 400 })
}

export function unexpectedErrorResponse(): Response {
  return Response.json(
    {
      error: {
        code: 'internal_error',
        message: 'The lookup request could not be completed.',
      },
    },
    { status: 500 },
  )
}

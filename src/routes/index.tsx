import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, AudioLines, Check } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import * as z from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  type LookupMethod,
  type LyricsLookupInput,
  sanitizeLookupInput,
  sanitizeSearchLookupInput,
} from '@/lib/lyrics/input'

export const Route = createFileRoute('/')({ component: Home })

const lookupMethods: Array<{ value: LookupMethod; label: string }> = [
  { value: 'isrc', label: 'ISRC' },
  { value: 'apple', label: 'Apple Music' },
  { value: 'search', label: 'Search' },
]

const methodDetails: Record<
  Exclude<LookupMethod, 'search'>,
  { label: string; placeholder: string }
> = {
  isrc: {
    label: 'ISRC',
    placeholder: 'USRC17607839',
  },
  apple: {
    label: 'Apple Music ID or link',
    placeholder: 'ID or Apple Music link',
  },
}

const lookupSchema = z
  .object({
    method: z.enum(['isrc', 'apple', 'search']),
    lookupValue: z.string(),
    title: z.string(),
    artist: z.string(),
    album: z.string(),
  })
  .superRefine((values, context) => {
    const result =
      values.method === 'search'
        ? sanitizeSearchLookupInput(values)
        : sanitizeLookupInput(values.method, values.lookupValue)

    if (!result.ok) {
      for (const issue of result.issues) {
        context.addIssue({ code: 'custom', path: [issue.field], message: issue.message })
      }
    }
  })

function Home() {
  const [preparedLookup, setPreparedLookup] = useState<LyricsLookupInput | null>(null)
  const form = useForm({
    defaultValues: {
      method: 'isrc' as LookupMethod,
      lookupValue: '',
      title: '',
      artist: '',
      album: '',
    },
    validators: {
      onSubmit: lookupSchema,
    },
    onSubmit: ({ value }) => {
      const result =
        value.method === 'search'
          ? sanitizeSearchLookupInput(value)
          : sanitizeLookupInput(value.method, value.lookupValue)
      if (result.ok) {
        setPreparedLookup(result.input)
      }
    },
  })

  return (
    <div className='flex min-h-svh flex-col bg-background text-foreground'>
      <header className='mx-auto flex w-full max-w-7xl shrink-0 items-center px-5 py-6 sm:px-8 lg:px-12'>
        <Link to='/' className='group inline-flex items-center gap-3' aria-label='Lyricsporn home'>
          <span className='flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-foreground/10'>
            <AudioLines aria-hidden='true' className='size-5' strokeWidth={2.2} />
          </span>
          <span className='text-[15px] font-semibold tracking-[-0.045em]'>
            lyrics<span className='text-muted-foreground'>porn</span>
          </span>
        </Link>
      </header>

      <main className='mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-5 py-8 sm:px-8'>
        <section className='w-full max-w-md'>
          <Card>
            <CardHeader>
              <CardTitle>Find lyrics</CardTitle>
            </CardHeader>

            <CardContent>
              <form
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault()
                  void form.handleSubmit()
                }}
              >
                <FieldSet>
                  <FieldLegend className='sr-only'>Lookup type</FieldLegend>
                  <form.Field name='method'>
                    {(methodField) => (
                      <>
                        <Field>
                          <ToggleGroup
                            aria-label='Lookup type'
                            multiple={false}
                            value={[methodField.state.value]}
                            onValueChange={(values) => {
                              const value = values[0]
                              if (value !== 'isrc' && value !== 'apple' && value !== 'search') {
                                return
                              }

                              methodField.handleChange(value)
                              form.resetField('lookupValue')
                              form.resetField('title')
                              form.resetField('artist')
                              form.resetField('album')
                              setPreparedLookup(null)
                            }}
                            className='grid w-full grid-cols-3'
                            variant='outline'
                            size='lg'
                            spacing={0}
                          >
                            {lookupMethods.map((item) => (
                              <ToggleGroupItem key={item.value} value={item.value}>
                                {item.label}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </Field>

                        {methodField.state.value === 'search' ? (
                          <div className='grid gap-4 sm:grid-cols-2'>
                            <form.Field name='title'>
                              {(field) => {
                                const isInvalid = field.state.meta.errors.length > 0

                                return (
                                  <Field data-invalid={isInvalid}>
                                    <FieldLabel htmlFor={field.name} className='sr-only'>
                                      Title
                                    </FieldLabel>
                                    <Input
                                      id={field.name}
                                      name={field.name}
                                      autoComplete='off'
                                      autoCapitalize='words'
                                      maxLength={160}
                                      placeholder='Title'
                                      required
                                      value={field.state.value}
                                      onBlur={field.handleBlur}
                                      onChange={(event) => {
                                        field.handleChange(event.target.value)
                                        setPreparedLookup(null)
                                      }}
                                      aria-invalid={isInvalid}
                                    />
                                    {isInvalid ? (
                                      <FieldError errors={field.state.meta.errors} />
                                    ) : null}
                                  </Field>
                                )
                              }}
                            </form.Field>

                            <form.Field name='artist'>
                              {(field) => {
                                const isInvalid = field.state.meta.errors.length > 0

                                return (
                                  <Field data-invalid={isInvalid}>
                                    <FieldLabel htmlFor={field.name} className='sr-only'>
                                      Artist
                                    </FieldLabel>
                                    <Input
                                      id={field.name}
                                      name={field.name}
                                      autoComplete='off'
                                      autoCapitalize='words'
                                      maxLength={160}
                                      placeholder='Artist'
                                      required
                                      value={field.state.value}
                                      onBlur={field.handleBlur}
                                      onChange={(event) => {
                                        field.handleChange(event.target.value)
                                        setPreparedLookup(null)
                                      }}
                                      aria-invalid={isInvalid}
                                    />
                                    {isInvalid ? (
                                      <FieldError errors={field.state.meta.errors} />
                                    ) : null}
                                  </Field>
                                )
                              }}
                            </form.Field>

                            <form.Field name='album'>
                              {(field) => {
                                const isInvalid = field.state.meta.errors.length > 0

                                return (
                                  <Field data-invalid={isInvalid} className='sm:col-span-2'>
                                    <FieldLabel htmlFor={field.name} className='sr-only'>
                                      Album (optional)
                                    </FieldLabel>
                                    <Input
                                      id={field.name}
                                      name={field.name}
                                      autoComplete='off'
                                      autoCapitalize='words'
                                      maxLength={160}
                                      placeholder='Album (optional)'
                                      value={field.state.value}
                                      onBlur={field.handleBlur}
                                      onChange={(event) => {
                                        field.handleChange(event.target.value)
                                        setPreparedLookup(null)
                                      }}
                                      aria-invalid={isInvalid}
                                    />
                                    {isInvalid ? (
                                      <FieldError errors={field.state.meta.errors} />
                                    ) : null}
                                  </Field>
                                )
                              }}
                            </form.Field>
                          </div>
                        ) : (
                          <form.Field name='lookupValue'>
                            {(field) => {
                              const method = methodField.state.value
                              if (method === 'search') {
                                return null
                              }

                              const details = methodDetails[method]
                              const isInvalid = field.state.meta.errors.length > 0

                              return (
                                <Field data-invalid={isInvalid}>
                                  <FieldLabel htmlFor={field.name} className='sr-only'>
                                    {details.label}
                                  </FieldLabel>
                                  <Input
                                    id={field.name}
                                    name={field.name}
                                    autoComplete='off'
                                    autoCapitalize={method === 'isrc' ? 'characters' : 'none'}
                                    spellCheck={false}
                                    required
                                    maxLength={method === 'apple' ? 2048 : 32}
                                    placeholder={details.placeholder}
                                    value={field.state.value}
                                    onBlur={field.handleBlur}
                                    onChange={(event) => {
                                      field.handleChange(event.target.value)
                                      setPreparedLookup(null)
                                    }}
                                    aria-invalid={isInvalid}
                                  />
                                  {isInvalid ? (
                                    <FieldError errors={field.state.meta.errors} />
                                  ) : null}
                                </Field>
                              )
                            }}
                          </form.Field>
                        )}
                      </>
                    )}
                  </form.Field>
                </FieldSet>

                <Button type='submit' size='sm' className='mt-5 w-full justify-between'>
                  <span>Check</span>
                  <ArrowRight aria-hidden='true' data-icon='inline-end' />
                </Button>
              </form>

              {preparedLookup ? (
                <div className='mt-4' role='status'>
                  <Badge variant='secondary'>
                    <Check aria-hidden='true' data-icon='inline-start' />
                    Ready
                  </Badge>
                  <p className='mt-2 break-all font-mono text-xs text-muted-foreground'>
                    {preparedLookup.type === 'search'
                      ? [preparedLookup.title, preparedLookup.artist, preparedLookup.album]
                          .filter(Boolean)
                          .join(' · ')
                      : preparedLookup.value}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}

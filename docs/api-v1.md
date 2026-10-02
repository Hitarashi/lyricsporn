# Lyricsporn API v1

The interactive reference is available at `/api/docs`. The OpenAPI 3.1 document is available at `/api/openapi.json`.
The endpoint is public and does not require an API key.

## Lookup endpoint

`GET /api/v1/lookup` accepts one lookup. `POST /api/v1/lookup` accepts up to 10 independent lookups. Both return a `results` array in request order. Each entry groups the Apple Music matches for one input.

Choose one lookup method for each item:

- `isrc` accepts a 12-character ISRC. Spaces and hyphens are removed before lookup.
- `appleId` accepts a numeric Apple Music song ID.
- `appleLink` accepts a song link or an album link that identifies a specific track.
- `title` and `artist` together search Apple Music. `album` can narrow the search.

Identifier lookups can include `title`, `artist`, and `album` as optional metadata hints.

### GET example

```sh
curl 'https://lyricsporn.netlify.app/api/v1/lookup?isrc=USRC17607839&include=track,artwork,lyrics&formats=json,ttml'
```

Search by title and artist:

```sh
curl 'https://lyricsporn.netlify.app/api/v1/lookup?title=Dreams&artist=Fleetwood%20Mac&limit=5'
```

`include` and `formats` are comma-separated. Supported include sections are `track`, `artwork`, `lyrics`, and `appleCatalog`. Supported lyric formats are `json`, `ttml`, and `elrc`.

### POST example

```sh
curl 'https://lyricsporn.netlify.app/api/v1/lookup' \
  -H 'Content-Type: application/json' \
  -d '{
    "include": ["track", "artwork", "lyrics"],
    "lyrics": { "formats": ["json", "ttml", "elrc"] },
    "limit": 5,
    "lookups": [
      { "lookup": { "isrc": "USRC17607839" } },
      {
        "lookup": { "title": "Dreams", "artist": "Fleetwood Mac", "album": "Rumours" },
        "limit": 2,
        "lyrics": { "formats": ["json"] }
      }
    ]
  }'
```

Request-wide `include`, `lyrics`, and `limit` fields set defaults. An item can override any of them. Search returns 5 matches by default and accepts a `limit` from 1 to 10. The same limit controls how many Apple Music matches are looked up for an identifier.

The default response includes track details, artwork, and lyrics in JSON. Add `appleCatalog` to `include` to receive the complete Apple Music Catalog response for that input. This raw response is attached once to the result group rather than repeated for every match.

## Response shape

Each item in `results` has its zero-based `index`, the sanitized lookup, a `status`, and `matches`. Apple Music links are echoed as their canonical numeric `appleId`.

- `matched` means Apple Music returned one or more track matches.
- `not_found` means Apple Music returned no track matches. `matches` is empty.
- `error` means that item's Apple Music Catalog request failed. Other batch items still return their results.

Every match includes `appleTrackId`. Requested `track`, `artwork`, and `lyrics` sections are included when available. Track details are normalized from Apple Music attributes; `appleCatalog` preserves the complete catalog payload when requested.

Lyrics are normalized before conversion. The `json` content has `syncLevel`, `plainText`, and timestamped `lines`, including word timing and translations when the selected source provides them. `ttml` is generated from those normalized lines. `elrc` is available only when word-level timestamps exist.

Each requested lyrics format has its own `status` and either `content` or a `reason`. If a track has lyrics but eLRC cannot be created, other formats remain available and the lyrics status is `partial`. If no lyrics are found, the lyrics status is `not_found` and each requested format explains its unavailability.

## Errors

Invalid query parameters, JSON, lookup values, or request options return HTTP 400 with an `error` object. A valid request with no Apple Music matches returns HTTP 200 and a `not_found` result. A batch lookup failure is isolated to its result item and does not fail the whole request.

## OpenAPI clients

Use `/api/openapi.json` to generate typed clients. The request and response definitions are generated from the same Zod schemas used to validate API traffic.

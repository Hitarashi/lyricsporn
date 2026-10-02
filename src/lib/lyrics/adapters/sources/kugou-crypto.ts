import zlib from 'node:zlib'

const KRC_KEY = Buffer.from([
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
])

function stripBomAndDecode(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf-8')
  }
  return buf.toString('utf-8')
}

function inflateBuffer(data: Buffer): string {
  try {
    const uncompressed = zlib.inflateSync(data)
    return stripBomAndDecode(uncompressed)
  } catch {
    const uncompressed = zlib.inflateRawSync(data)
    return stripBomAndDecode(uncompressed)
  }
}

export function decryptKrc(encoded: string): string | null {
  try {
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.length <= 4) return null
    const body = Buffer.from(bytes.subarray(4))
    for (let i = 0; i < body.length; i++) {
      const keyByte = KRC_KEY[i % KRC_KEY.length] ?? 0
      body[i] = (body[i] ?? 0) ^ keyByte
    }
    return inflateBuffer(body)
  } catch {
    return null
  }
}

import crypto from 'node:crypto'
import zlib from 'node:zlib'

const KRC_KEY = Buffer.from([
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
])

const QRC_KEY = Buffer.from('!@#)(*$%123ZXC!@!@#)(NHL', 'ascii')

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

export function decryptQrc(hex: string): string | null {
  try {
    const compact = hex.replace(/\s+/g, '')
    if (compact.length < 16 || compact.length % 2 !== 0) return null
    const encrypted = Buffer.from(compact, 'hex')
    const size = Math.ceil(encrypted.length / 8) * 8
    const padded = Buffer.alloc(size)
    encrypted.copy(padded)

    const decipher = crypto.createDecipheriv('des-ede3', QRC_KEY, null)
    decipher.setAutoPadding(false)
    const plain = Buffer.concat([decipher.update(padded), decipher.final()]).subarray(
      0,
      encrypted.length,
    )

    return inflateBuffer(plain)
  } catch {
    return null
  }
}

export function decodeBase64OrRaw(raw: string): string | null {
  try {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const decoded = Buffer.from(trimmed, 'base64').toString('utf-8')
    if (decoded && (decoded.includes('[') || decoded.includes('<') || decoded.includes('\n'))) {
      return decoded
    }
    return trimmed
  } catch {
    return raw.trim() || null
  }
}

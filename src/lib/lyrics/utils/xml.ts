export interface XmlElement {
  tag: string
  localName: string
  attributes: Record<string, string>
  children: Array<XmlElement | string>
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
}

export function parseXml(xmlString: string): XmlElement | null {
  const cleaned = xmlString.trim().replace(/^\uFEFF/, '')
  if (!cleaned) return null

  const tagRegex =
    /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<(\/)?([a-zA-Z0-9_\-:]+)((?:\s+[^=>\s]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^>\s]+))?)*)\s*(\/?)>/g

  const stack: XmlElement[] = []
  let root: XmlElement | null = null
  let lastIndex = 0

  let match: RegExpExecArray | null = null
  while (true) {
    match = tagRegex.exec(cleaned)
    if (!match) break

    const textBefore = cleaned.slice(lastIndex, match.index)
    if (textBefore && stack.length > 0) {
      stack[stack.length - 1]?.children.push(decodeXmlEntities(textBefore))
    }
    lastIndex = tagRegex.lastIndex

    const [fullTag, cdataContent, isClosing, rawTagName, rawAttrs, isSelfClosing] = match

    if (fullTag.startsWith('<!--') || fullTag.startsWith('<?')) {
      continue
    }

    if (cdataContent !== undefined) {
      if (stack.length > 0) {
        stack[stack.length - 1]?.children.push(cdataContent)
      }
      continue
    }

    const tagName = rawTagName ?? ''
    const localName = (
      tagName.includes(':') ? (tagName.split(':')[1] ?? tagName) : tagName
    ).toLowerCase()

    if (isClosing) {
      if (stack.length > 0 && stack[stack.length - 1]?.localName === localName) {
        stack.pop()
      } else {
        const idx = stack.map((s) => s.localName).lastIndexOf(localName)
        if (idx !== -1) {
          stack.splice(idx)
        }
      }
      continue
    }

    const attributes: Record<string, string> = {}
    if (rawAttrs) {
      const attrRegex = /([a-zA-Z0-9_\-:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g
      let attrMatch: RegExpExecArray | null = null
      while (true) {
        attrMatch = attrRegex.exec(rawAttrs)
        if (!attrMatch) break
        const key = attrMatch[1] ?? ''
        const val = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
        attributes[key] = decodeXmlEntities(val)
      }
    }

    const element: XmlElement = {
      tag: tagName,
      localName,
      attributes,
      children: [],
    }

    if (!root) {
      root = element
    }

    if (stack.length > 0) {
      stack[stack.length - 1]?.children.push(element)
    }

    if (!isSelfClosing) {
      stack.push(element)
    }
  }

  return root
}

export function getTextContent(element: XmlElement): string {
  let text = ''
  for (const child of element.children) {
    if (typeof child === 'string') {
      text += child
    } else {
      text += getTextContent(child)
    }
  }
  return text
}

export function getAttribute(element: XmlElement, name: string): string | null {
  const lower = name.toLowerCase()
  for (const [key, value] of Object.entries(element.attributes)) {
    if (key.toLowerCase() === lower) {
      return value
    }
    if (key.includes(':') && key.split(':')[1]?.toLowerCase() === lower) {
      return value
    }
  }
  return null
}

export function findIdAttribute(element: XmlElement): string | null {
  return (
    getAttribute(element, 'xml:id') ?? getAttribute(element, 'id') ?? getAttribute(element, 'agent')
  )
}

export function findAgentAttribute(element: XmlElement): string | null {
  return (
    getAttribute(element, 'ttm:agent') ??
    getAttribute(element, 'agent') ??
    getAttribute(element, 'singer')
  )
}

export function extractQrcXmlContent(content: string): string | null {
  const match = /<LyricContent[^>]*>([\s\S]*?)<\/LyricContent>/i.exec(content)
  if (match) {
    return match[1] ?? null
  }
  return null
}

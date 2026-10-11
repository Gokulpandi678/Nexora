import { describe, expect, it } from 'vitest'
import { escapeHtml, incidentUrl, renderEmail } from '@/lib/email'

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    )
  })
})

describe('renderEmail', () => {
  it('escapes every interpolated value', () => {
    const evil = '<script>alert(1)</script>'
    const html = renderEmail({
      heading: evil,
      intro: evil,
      blocks: [{ label: evil, value: evil }],
      cta: { label: evil, url: '"><script>alert(2)</script>' }
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('href="&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;"')
    expect(html.match(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/g)).toHaveLength(5)
  })

  it('links to the incident', () => {
    const html = renderEmail({ heading: 'H', intro: 'I', cta: { label: 'Open', url: incidentUrl('abc') } })
    // Goes through /go/incident, which switches to the incident's organization first
    expect(html).toContain('href="http://localhost:3000/go/incident/abc"')
  })
})

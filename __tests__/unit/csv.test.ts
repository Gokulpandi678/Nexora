import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from '@/lib/csv'

describe('csvCell', () => {
  it('renders null/undefined as empty and joins arrays', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(['API', 'Cache'])).toBe('API; Cache')
    expect(csvCell(42)).toBe('42')
  })

  it('quotes cells with commas, quotes or newlines and doubles inner quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(csvCell('plain')).toBe('plain')
  })

  it.each(['=SUM(A1:A2)', '+1', '-1+2', '@cmd', '\tTAB', '\rCR'])('defuses the formula prefix in %j', value => {
    expect(csvCell(value).replace(/^"/, '').startsWith(`'${value[0]}`)).toBe(true)
  })

  it('leaves a formula character that is not a prefix alone', () => {
    expect(csvCell('a=b')).toBe('a=b')
  })

  it('defuses and quotes together', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"')
  })
})

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(toCsv([['a', 'b'], [1, null]])).toBe('a,b\r\n1,')
  })
})

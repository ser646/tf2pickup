import { describe, expect, it, vi } from 'vitest'

vi.mock('../environment', () => ({
  environment: { KEY_STORE_PASSPHRASE: 'test-key-store-passphrase' },
}))

import { decryptLinkingCode, encryptLinkingCode } from './linking-code'

describe('Discord linking code encryption', () => {
  it('round-trips a linking code', () => {
    const code = '0123456789ABCDEF01234567'

    expect(decryptLinkingCode(encryptLinkingCode(code))).toBe(code)
  })

  it('uses a fresh nonce for each encryption', () => {
    const code = '0123456789ABCDEF01234567'

    const first = encryptLinkingCode(code)
    const second = encryptLinkingCode(code)

    expect(second).not.toBe(first)
    expect(decryptLinkingCode(first)).toBe(code)
    expect(decryptLinkingCode(second)).toBe(code)
  })

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptLinkingCode('0123456789ABCDEF01234567')
    const [iv, tag, ciphertext] = encrypted.split('.')
    const tamperedCiphertext = `${ciphertext![0] === 'A' ? 'B' : 'A'}${ciphertext!.slice(1)}`
    const tampered = [iv, tag, tamperedCiphertext].join('.')

    expect(() => decryptLinkingCode(tampered)).toThrow()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../secrets', () => ({
  secrets: {
    get: vi.fn(async () => Buffer.alloc(32, 7)),
  },
}))

import { decryptLinkingCode, encryptLinkingCode } from './linking-code'

describe('Discord linking code encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('round-trips a linking code', async () => {
    const code = '0123456789ABCDEF01234567'

    await expect(encryptLinkingCode(code).then(decryptLinkingCode)).resolves.toBe(code)
  })

  it('uses a fresh nonce for each encryption', async () => {
    const code = '0123456789ABCDEF01234567'

    const first = await encryptLinkingCode(code)
    const second = await encryptLinkingCode(code)

    expect(second).not.toBe(first)
    await expect(decryptLinkingCode(first)).resolves.toBe(code)
    await expect(decryptLinkingCode(second)).resolves.toBe(code)
  })

  it('rejects tampered ciphertext', async () => {
    const encrypted = await encryptLinkingCode('0123456789ABCDEF01234567')
    const [iv, tag, ciphertext] = encrypted.split('.')
    const tampered = [iv, tag, `${ciphertext!.slice(0, -1)}A`].join('.')

    await expect(decryptLinkingCode(tampered)).rejects.toThrow()
  })
})

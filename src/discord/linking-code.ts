import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { environment } from '../environment'

const algorithm = 'aes-256-gcm'
const key = scryptSync(
  environment.KEY_STORE_PASSPHRASE,
  'tf2pickup:discord-link-code:v1',
  32,
)

export function encryptLinkingCode(code: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(algorithm, key, iv)
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv, tag, encrypted].map(value => value.toString('base64url')).join('.')
}

export function decryptLinkingCode(encryptedCode: string): string {
  const [iv, tag, encrypted] = encryptedCode.split('.')
  if (!iv || !tag || !encrypted) {
    throw new Error('Invalid encrypted Discord linking code')
  }

  const decipher = createDecipheriv(algorithm, key, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

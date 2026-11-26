import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { secrets } from '../secrets'

const algorithm = 'aes-256-gcm'
const secretName = 'discord-link-code-encryption-key'

export async function encryptLinkingCode(code: string): Promise<string> {
  const key = await secrets.get(secretName)
  const iv = randomBytes(12)
  const cipher = createCipheriv(algorithm, key, iv)
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv, tag, encrypted].map(value => value.toString('base64url')).join('.')
}

export async function decryptLinkingCode(encryptedCode: string): Promise<string> {
  const key = await secrets.get(secretName)
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

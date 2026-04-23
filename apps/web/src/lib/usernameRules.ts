export const USERNAME_MIN = 3
export const USERNAME_MAX = 30

export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'api', 'auth', 'dashboard', 'help',
  'login', 'logout', 'profile', 'settings', 'signin', 'signup',
  'skillpath', 'support', 'u', 'user', 'users',
])

export type UsernameError =
  | 'too-short'
  | 'too-long'
  | 'bad-chars'
  | 'reserved'

export function validateUsername(raw: string): UsernameError | null {
  const v = raw.toLowerCase()
  if (v.length < USERNAME_MIN) return 'too-short'
  if (v.length > USERNAME_MAX) return 'too-long'
  if (!/^[a-z0-9_-]+$/.test(v)) return 'bad-chars'
  if (RESERVED_USERNAMES.has(v)) return 'reserved'
  return null
}

export function usernameErrorMessage(err: UsernameError): string {
  switch (err) {
    case 'too-short': return `Username must be at least ${USERNAME_MIN} characters.`
    case 'too-long':  return `Username must be at most ${USERNAME_MAX} characters.`
    case 'bad-chars': return 'Only lowercase letters, numbers, underscore, and hyphen.'
    case 'reserved':  return 'This username is reserved.'
  }
}

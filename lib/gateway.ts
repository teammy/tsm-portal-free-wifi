import 'server-only'

/**
 * URL the client's browser opens to log in at the EG (Reyee "Third-party
 * Authentication", login interface `http://<eg>:2060/ext_login`). The EG checks
 * the credentials against RADIUS and authorizes the device that sent the
 * request, so the client must call it itself — the server can't on its behalf.
 *
 * Field names come from the EG's parameter template (Cloud Auth → Customized
 * Parameter → Login Parameters: Name / Password); override them via env if the
 * template uses different ones.
 */
export function gatewayLoginUrl(username: string, password: string): string {
  const base = process.env.GATEWAY_LOGIN_URL
  if (!base) throw new Error('GATEWAY_LOGIN_URL is not set')

  const url = new URL(base)
  url.searchParams.set(process.env.GATEWAY_LOGIN_USER_PARAM || 'username', username)
  url.searchParams.set(process.env.GATEWAY_LOGIN_PASS_PARAM || 'password', password)
  return url.toString()
}

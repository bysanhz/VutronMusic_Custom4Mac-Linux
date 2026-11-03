/**
 * Prepare query parameters for a NetEase API request.
 *
 * The public "全部" hot-playlist directory must not inherit the account's
 * MUSIC_U cookie. Some NetEase servers personalize /top/playlist for logged-in
 * users; the Explore page should not silently turn its "全部" category into a
 * personalized genre feed.
 *
 * An empty cookie object is deliberate. The upstream enhanced API chooses
 * `query.cookie || process.env.NETEASE_COOKIE`: an omitted/empty string cookie
 * could accidentally restore the server's authenticated environment cookie.
 *
 * Other categories and endpoints retain their normal authenticated behavior.
 */
export const prepareNeteaseRequestParams = (
  name: string,
  query: Record<string, string>,
  cookies: Record<string, string> = {}
): Record<string, any> => {
  const params: Record<string, any> = { ...query }

  // API 4.40 defaults this endpoint to XEAPI, whose key is initialized by
  // its CLI, not when we embed its handlers in Fastify. The endpoint still
  // supports EAPI with the same quality levels and account permissions.
  if (name === 'song/url/v1' && !params.crypto) params.crypto = 'eapi'

  if (name === 'top/playlist' && (!params.cat || params.cat === '全部')) {
    params.cookie = {}
  } else if (!params.cookie) {
    params.cookie = cookies
  }

  return params
}

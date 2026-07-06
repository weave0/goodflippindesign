/**
 * culturesherpa-redirect — Worker
 * 301 redirects all culturesherpa.com traffic to culturesherpa.org (canonical).
 * Deployed via: wrangler deploy --config wrangler-cs-redirect.toml
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'culturesherpa.org';
    return Response.redirect(url.toString(), 301);
  },
};

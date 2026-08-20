/**
 * Cloudflare Worker: Enka API Proxy for ZZZ Optimizer
 *
 * This worker proxies requests to the Enka Network API to avoid CORS issues
 * when making requests from the browser.
 *
 * Deployment Instructions:
 * 1. Go to https://dash.cloudflare.com/
 * 2. Sign up or log in (free account is fine)
 * 3. Go to "Workers & Pages" in the sidebar
 * 4. Click "Create Application" → "Create Worker"
 * 5. Name it something like "enka-zzz-proxy"
 * 6. Click "Deploy", then "Edit Code"
 * 7. Replace the default code with this file's contents
 * 8. Click "Save and Deploy"
 * 9. Copy your worker URL (e.g., https://enka-zzz-proxy.your-username.workers.dev)
 * 10. Update enka-api.service.ts with your worker URL
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Parse the request URL
    const url = new URL(request.url);
    const uid = url.searchParams.get('uid');

    // Callers can opt out of caching with ?fresh=1. A user who just changed
    // gear in game and imports immediately would otherwise get a cached
    // pre-change response and be told their builds are already up to date.
    const wantsFresh = url.searchParams.get('fresh') === '1';

    // Validate UID parameter
    if (!uid) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: uid' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
          }
        }
      );
    }

    // Validate UID format (should be numeric)
    if (!/^\d+$/.test(uid)) {
      return new Response(
        JSON.stringify({ error: 'Invalid UID format. UID must be numeric.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
          }
        }
      );
    }

    try {
      // Construct Enka API URL
      const enkaUrl = `https://enka.network/api/zzz/uid/${uid}`;

      console.log(`Proxying request to: ${enkaUrl}`);

      // Fetch from Enka API. On a fresh request also bypass Cloudflare's own
      // edge cache, otherwise the worker can still be served a stored copy.
      const enkaResponse = await fetch(enkaUrl, {
        headers: {
          'User-Agent': 'ZZZ-Optimizer-Cloudflare-Worker/1.0'
        },
        ...(wantsFresh ? { cf: { cacheTtl: 0, cacheEverything: false } } : {})
      });

      // Get the response data
      const data = await enkaResponse.text();

      // Return response with CORS headers
      return new Response(data, {
        status: enkaResponse.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
          // Cache for 5 minutes (300 seconds) to reduce API calls.
          // ?fresh=1 skips the cache so a manual import always sees current
          // data. Enka applies its own TTL on top of this either way.
          'Cache-Control': wantsFresh
            ? 'no-store, max-age=0'
            : 'public, max-age=300, s-maxage=300'
        }
      });

    } catch (error) {
      console.error('Error fetching from Enka API:', error);

      return new Response(
        JSON.stringify({
          error: 'Failed to fetch data from Enka API',
          details: error.message
        }),
        {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
          }
        }
      );
    }
  }
};

/**
 * Handle CORS preflight OPTIONS requests
 */
function handleOptions(request) {
  const headers = request.headers;

  if (
    headers.get('Origin') !== null &&
    headers.get('Access-Control-Request-Method') !== null &&
    headers.get('Access-Control-Request-Headers') !== null
  ) {
    // Handle CORS preflight requests
    return new Response(null, {
      headers: {
        ...corsHeaders(),
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Max-Age': '86400', // 24 hours
      }
    });
  } else {
    // Handle standard OPTIONS request
    return new Response(null, {
      headers: {
        Allow: 'GET, OPTIONS',
      }
    });
  }
}

/**
 * CORS headers to allow requests from any origin
 */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

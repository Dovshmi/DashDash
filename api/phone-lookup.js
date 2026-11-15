import { parseIsraeliPhone } from '../src/phone-lookup-utils.js';

// Fixed-provider proxy for a user-provided free Numbers Online API key.
// The key is neither stored nor logged by DashDash, and is never passed to the browser in a response.
function reply(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(payload);
}

async function readLimitedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty_upstream');
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32_768) {
      await reader.cancel();
      throw new Error('large_upstream');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let pos = 0;
  for (const chunk of chunks) { body.set(chunk, pos); pos += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}
function textOrNull(value, limit = 140) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(res, 405, { error: 'method_not_allowed' });
  }

  if (req.headers?.['content-type']?.split(';')[0]?.trim() !== 'application/json') {
    return reply(res, 415, { error: 'json_required' });
  }
  if (Number(req.headers?.['content-length'] || 0) > 800) {
    return reply(res, 413, { error: 'request_too_large' });
  }

  const national = typeof req.body?.number === 'string' ? req.body.number : '';
  const parsed = parseIsraeliPhone(national);
  const key = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
  if (!parsed) return reply(res, 400, { error: 'invalid_phone' });
  if (!/^nol_[a-zA-Z0-9_-]{8,220}$/.test(key)) return reply(res, 400, { error: 'invalid_api_key' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = await fetch('https://numbers.online/api/v1/lookup/' + encodeURIComponent(parsed.e164), {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'X-API-Key': key },
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal
    });
    if (!upstream.ok) {
      const byStatus = {
        401: 'key_rejected', 402: 'provider_payment_required',
        403: 'key_not_allowed', 404: 'provider_not_found',
        429: 'provider_rate_limit', 503: 'provider_unavailable'
      };
      return reply(res, upstream.status === 429 ? 429 : 502, {
        error: byStatus[upstream.status] || 'provider_unavailable',
        retryAfter: upstream.status === 429
          ? Math.min(3600, Math.max(0, Number(upstream.headers.get('retry-after')) || 0))
          : undefined
      });
    }
    const data = await readLimitedJson(upstream);
    if (!data || typeof data !== 'object' || typeof data.valid !== 'boolean') {
      return reply(res, 502, { error: 'invalid_provider_response' });
    }
    return reply(res, 200, {
      number: parsed.national,
      e164: parsed.e164,
      valid: data.valid,
      name: textOrNull(data.cnam),
      lineType: textOrNull(data.line_type, 32),
      carrier: textOrNull(data.carrier, 100),
      country: textOrNull(data.country, 8),
      // Suppress spam scores: these are low-confidence and are not proof of wrongdoing.
      source: 'Numbers Online',
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return reply(res, error?.name === 'AbortError' ? 504 : 502, {
      error: error?.name === 'AbortError' ? 'provider_timeout' : 'provider_unavailable'
    });
  } finally {
    clearTimeout(timer);
  }
}

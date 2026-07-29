function originFromReferer(referer) {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function isAllowedRequestOrigin(headers, environment) {
  const requestOrigin = headers.origin || originFromReferer(headers.referer);
  const hostOrigin = headers.host ? `https://${headers.host}` : null;
  const allowedOrigins = [environment.APP_ORIGIN, hostOrigin].filter(Boolean);
  return Boolean(requestOrigin) && allowedOrigins.includes(requestOrigin);
}

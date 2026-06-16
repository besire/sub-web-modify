const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const RANDOM_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const DEFAULT_SLUG_LENGTH = 6;
const MAX_LONG_URL_LENGTH = 20000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (request.method === "POST" && url.pathname === "/short") {
      return createShortUrl(request, env);
    }

    if (request.method === "GET" || request.method === "HEAD") {
      return redirectShortUrl(request, env);
    }

    return apiError("Not found", 404, env);
  },
};

async function createShortUrl(request, env) {
  if (!env.LINKS) {
    return apiError("KV binding LINKS is not configured", 500, env);
  }

  const token = env.CREATE_TOKEN || "";
  if (token && !hasValidToken(request, token)) {
    return apiError("Unauthorized", 401, env);
  }

  const payload = await readCreatePayload(request);
  const longUrl = decodeLongUrl(payload.longUrl || "");
  const requestedSlug = (payload.shortKey || "").trim();

  if (!isValidLongUrl(longUrl)) {
    return apiError("Invalid longUrl", 400, env);
  }

  if (requestedSlug && !SLUG_PATTERN.test(requestedSlug)) {
    return apiError("shortKey can only contain letters, numbers, underscores and hyphens", 400, env);
  }

  const slug = requestedSlug || await generateUniqueSlug(env.LINKS);
  const key = storageKey(slug);
  const existingUrl = await env.LINKS.get(key);

  if (existingUrl && existingUrl !== longUrl) {
    return apiError("shortKey already exists", 409, env);
  }

  if (!existingUrl) {
    await env.LINKS.put(key, longUrl);
  }

  return apiSuccess({
    Code: 1,
    ShortUrl: `${shortBaseUrl(request, env)}/${slug}`,
    Message: "",
  }, env);
}

async function redirectShortUrl(request, env) {
  if (!env.LINKS) {
    return new Response("KV binding LINKS is not configured", { status: 500 });
  }

  const url = new URL(request.url);
  const slug = decodeURIComponent(url.pathname.replace(/^\/+/, "").replace(/\/+$/, ""));

  if (slug === "") {
    return new Response("1r.pw shortener is running", { status: 200 });
  }

  if (!SLUG_PATTERN.test(slug)) {
    return new Response("Not found", { status: 404 });
  }

  const longUrl = await env.LINKS.get(storageKey(slug));
  if (!longUrl) {
    return new Response("Not found", { status: 404 });
  }

  return request.method === "HEAD"
    ? new Response(null, {
        status: 302,
        headers: {
          Location: longUrl,
        },
      })
    : Response.redirect(longUrl, 302);
}

async function readCreatePayload(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  const form = await request.formData();
  return {
    longUrl: form.get("longUrl"),
    shortKey: form.get("shortKey"),
  };
}

function decodeLongUrl(value) {
  const raw = String(value || "");

  try {
    const decoded = atob(raw);
    if (/^https?:\/\//i.test(decoded)) {
      return decoded;
    }
  } catch (_) {
    // Keep raw value below for clients that send an unencoded URL.
  }

  return raw;
}

function isValidLongUrl(value) {
  if (!value || value.length > MAX_LONG_URL_LENGTH) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_) {
    return false;
  }
}

async function generateUniqueSlug(kv) {
  for (let i = 0; i < 10; i += 1) {
    const slug = randomSlug(DEFAULT_SLUG_LENGTH);
    const existing = await kv.get(storageKey(slug));
    if (!existing) {
      return slug;
    }
  }

  throw new Error("Unable to generate a unique slug");
}

function randomSlug(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, byte => RANDOM_ALPHABET[byte % RANDOM_ALPHABET.length]).join("");
}

function storageKey(slug) {
  return `url:${slug}`;
}

function shortBaseUrl(request, env) {
  const domain = (env.SHORT_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return domain ? `https://${domain}` : new URL(request.url).origin;
}

function hasValidToken(request, token) {
  return request.headers.get("x-create-token") === token
      || request.headers.get("authorization") === `Bearer ${token}`;
}

function apiSuccess(payload, env) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: jsonHeaders(env),
  });
}

function apiError(message, status, env) {
  return new Response(JSON.stringify({
    Code: 0,
    ShortUrl: "",
    Message: message,
  }), {
    status,
    headers: jsonHeaders(env),
  });
}

function jsonHeaders(env) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(env),
  };
}

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Create-Token",
    "Access-Control-Max-Age": "86400",
  };
}

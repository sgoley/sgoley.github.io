const DEFAULT_MODEL = "openai/gpt-oss-120b";

function parseAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowedOrigins = parseAllowedOrigins(env);
  let allowOrigin = "*";
  if (allowedOrigins.length > 0) {
    allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(payload, status, headers) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function handleChat(request, env, headers) {
  if (!env.OPENROUTER_API_KEY) {
    return jsonResponse({ error: "OPENROUTER_API_KEY is not configured." }, 500, headers);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400, headers);
  }

  if (!Array.isArray(payload?.messages) || payload.messages.length === 0) {
    return jsonResponse({ error: "messages[] is required." }, 400, headers);
  }

  const model =
    typeof payload.model === "string" && payload.model.trim()
      ? payload.model.trim()
      : env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const stream = payload.stream !== false;

  const openRouterPayload = {
    model,
    messages: payload.messages,
    stream,
  };
  if (typeof payload.temperature === "number") {
    openRouterPayload.temperature = payload.temperature;
  }
  if (typeof payload.max_tokens === "number") {
    openRouterPayload.max_tokens = payload.max_tokens;
  }

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": env.OPENROUTER_HTTP_REFERER || env.PUBLIC_SITE_URL || "",
      "X-Title": env.OPENROUTER_SITE_TITLE || "Scott Goley Website Chat",
    },
    body: JSON.stringify(openRouterPayload),
  });

  if (!upstream.ok) {
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...headers,
        "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
      },
    });
  }

  if (!stream) {
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...headers,
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const pathname = new URL(request.url).pathname;
    if (request.method === "GET" && pathname === "/healthz") {
      return jsonResponse({ status: "ok" }, 200, headers);
    }
    if (request.method === "POST" && pathname === "/chat") {
      return handleChat(request, env, headers);
    }

    return jsonResponse({ error: "Not found." }, 404, headers);
  },
};

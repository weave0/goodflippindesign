const ADMIN_EMAILS = new Set([
  "brett.l.weaver@gmail.com",
  "getsome@goodflippinvibes.com",
  "community@culturesherpa.org",
  "hello@aiaimate.com",
]);

async function authorizeAdmin(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return { ok: false, status: 401 };

  const response = await fetch("https://goodflippindesign.com/api/profile", {
    method: "GET",
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });

  if (!response.ok) return { ok: false, status: response.status === 401 ? 401 : 403 };

  let profile;
  try {
    profile = await response.json();
  } catch {
    return { ok: false, status: 403 };
  }

  const email = typeof profile?.email === "string" ? profile.email.toLowerCase() : "";
  return ADMIN_EMAILS.has(email)
    ? { ok: true, status: 200, email }
    : { ok: false, status: 403 };
}

function denied(status) {
  return new Response(status === 401 ? "Authentication required" : "Forbidden", {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/admin-session") {
      const auth = await authorizeAdmin(request);
      if (!auth.ok) return denied(auth.status);
      return Response.json(
        { ok: true, admin: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (url.pathname.startsWith("/gold/")) {
      const auth = await authorizeAdmin(request);
      if (!auth.ok) return denied(auth.status);
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return response;
    }

    return env.ASSETS.fetch(request);
  },
};

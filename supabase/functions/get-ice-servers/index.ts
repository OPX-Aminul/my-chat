// Supabase Edge Function: get-ice-servers
// Proxies Cloudflare Realtime TURN credential generation so the API token
// never reaches the client. Deploy: supabase functions deploy get-ice-servers
// Secrets: supabase secrets set TURN_TOKEN_ID=... TURN_API_TOKEN=...
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FALLBACK = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] },
    { urls: ["stun:stun1.l.google.com:19302"] },
    { urls: ["stun:stun2.l.google.com:19302"] },
    { urls: ["stun:stun.services.mozilla.com:3478"] },
    { urls: ["stun:stun.l.google.com:5349"] },
  ],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // Require a valid Supabase session — credentials are never handed to anonymous callers.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const tokenId = Deno.env.get("TURN_TOKEN_ID");
  const apiToken = Deno.env.get("TURN_API_TOKEN");

  if (!tokenId || !apiToken) {
    console.warn("TURN secrets not configured; returning STUN-only fallback");
    return new Response(JSON.stringify(FALLBACK), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let ttl = 86400;
  try {
    const body = await req.json();
    if (typeof body?.ttl === "number" && body.ttl > 0 && body.ttl <= 86400) {
      ttl = body.ttl;
    }
  } catch {
    // default ttl
  }

  try {
    const cfRes = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${tokenId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl }),
      }
    );
    if (!cfRes.ok) {
      console.error("cloudflare error", cfRes.status, await cfRes.text());
      return new Response(JSON.stringify(FALLBACK), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const data: any = await cfRes.json();
    const iceServers = (data.iceServers ?? []).map((s: any) => ({
      urls: s.urls ?? [],
      username: s.username,
      credential: s.credential,
    }));
    return new Response(JSON.stringify({ iceServers }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("turn fetch failed", err);
    return new Response(JSON.stringify(FALLBACK), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});

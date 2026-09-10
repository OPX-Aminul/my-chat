import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase";
import { FALLBACK_ICE_SERVERS, type IceServer } from "./types";

const SUPABASE_FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

/**
 * Fetch short-lived TURN credentials from the Supabase Edge Function
 * `get-ice-servers` (which proxies Cloudflare Realtime generate-ice-servers).
 * Falls back to public STUN + shared TURN so calls still work during setup.
 */
export async function fetchIceServers(): Promise<IceServer[]> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return FALLBACK_ICE_SERVERS;

    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/get-ice-servers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ ttl: 86400 }),
    });
    if (!res.ok) throw new Error(`ice-servers ${res.status}`);
    const json = (await res.json()) as { iceServers?: IceServer[] };
    if (json.iceServers?.length) return json.iceServers;
    return FALLBACK_ICE_SERVERS;
  } catch {
    return FALLBACK_ICE_SERVERS;
  }
}

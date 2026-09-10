import { supabase } from "./supabase";
import { FALLBACK_ICE_SERVERS, type IceServer } from "./types";

/**
 * Fetch short-lived TURN credentials.
 *
 * Primary path: Supabase RPC `generate_ice_servers` — a security-definer
 * Postgres function that calls Cloudflare Realtime server-side (TURN tokens
 * live in a private schema table, never exposed to clients). Setup = run
 * supabase/schema.sql in the SQL Editor, nothing else.
 *
 * Falls back to public STUN (+ shared TURN) whenever the RPC is unavailable.
 */
export async function fetchIceServers(): Promise<IceServer[]> {
  try {
    const { data, error } = await supabase.rpc("generate_ice_servers", { p_ttl: 86400 });
    if (!error && data) {
      const parsed = data as { iceServers?: IceServer[] };
      const servers = (parsed.iceServers ?? [])
        .map((s) => ({ urls: Array.isArray(s.urls) ? s.urls : [s.urls], username: s.username, credential: s.credential }))
        .filter((s) => s.urls.length > 0);
      if (servers.length) return servers;
    }
    return FALLBACK_ICE_SERVERS;
  } catch {
    return FALLBACK_ICE_SERVERS;
  }
}

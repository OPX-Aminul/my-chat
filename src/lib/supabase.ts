import { createClient } from "@supabase/supabase-js";

const DEFAULT_URL = "https://ydzphsjmgiesvxonvtcn.supabase.co";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkenBoc2ptZ2llc3Z4b252dGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjAxNjMsImV4cCI6MjEwNDYzNjE2M30.wJ2hG9ppIhrhM8EqAiixtbKv2308dWzhmF8yhqF2mLw";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: { params: { eventsPerSecond: 20 } },
});

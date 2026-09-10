import { useEffect, useState } from "react";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./lib/supabase";
import { useSession, useProfile } from "./lib/hooks";
import { ToastHost } from "./components/ui";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import ProfileSetup from "./pages/ProfileSetup";
import ChatApp from "./pages/ChatApp";

type Stage = "landing" | "auth" | "app";

export default function App() {
  const { session, loading } = useSession();
  const { profile, loading: profileLoading, refresh } = useProfile(session);
  const [stage, setStage] = useState<Stage>("landing");
  const [schemaReady, setSchemaReady] = useState<boolean | null>(null);

  // Detect whether the schema has been applied — if profiles table is missing
  // we show setup guidance instead of a broken app.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        });
        setSchemaReady(res.ok);
      } catch {
        setSchemaReady(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (loading || profileLoading) return;
    if (!session) {
      setStage((s) => (s === "auth" ? s : "landing"));
      return;
    }
    if (!profile) {
      setStage("auth");
      return;
    }
    // needs profile completion?
    const needsSetup = !profile.username || !profile.display_name || profile.display_name === "New User";
    if (needsSetup) setStage("auth");
    else setStage("app");
  }, [session, profile, loading, profileLoading]);

  if (schemaReady === false && !loading) {
    return <SchemaNotice />;
  }

  if (loading || profileLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#070B14]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
          <p className="font-display text-slate-400">Loading My Chat 24…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {stage === "landing" && !session && <Landing onAuth={() => setStage("auth")} />}
      {stage === "auth" && (
        <Auth
          onAuthenticated={() => {
            refresh();
          }}
          onBack={() => setStage("landing")}
        />
      )}
      {stage === "app" && profile && <ChatApp profile={profile} onProfileChanged={refresh} />}
      <ToastHost />
    </>
  );
}

function SchemaNotice() {
  return (
    <div className="flex h-full items-center justify-center bg-[#070B14] p-6">
      <div className="glass max-w-lg rounded-2xl p-8 text-center">
        <div className="mb-3 text-4xl">🗄️</div>
        <h2 className="font-display text-xl font-bold text-white">Database setup needed</h2>
        <p className="mt-2 text-sm text-slate-400">
          The <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-300">profiles</code> table wasn't found in
          your Supabase project. Open the Supabase SQL Editor and run{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-300">supabase/schema.sql</code> from this
          repository, then reload this page.
        </p>
        <ol className="mt-4 space-y-2 text-left text-xs text-slate-400">
          <li>1. Go to supabase.com → your project → SQL Editor</li>
          <li>2. Paste the full contents of supabase/schema.sql and run it</li>
          <li>3. (Optional) deploy the TURN edge function: supabase/functions/get-ice-servers</li>
        </ol>
        <button
          onClick={() => location.reload()}
          className="mt-6 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 px-5 py-2.5 font-semibold text-[#071018]"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

import { MessageCircle, Video, Image, ArrowRight, Radio } from "lucide-react";
import type { ReactNode } from "react";

export default function Landing({ onAuth }: { onAuth: () => void }) {
  return (
    <div className="hero-grid h-full overflow-y-auto bg-[#070B14]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500 font-display text-sm font-extrabold text-[#071018]">
            24
          </div>
          <span className="font-display text-lg font-bold text-white">My Chat 24</span>
        </div>
        <button
          onClick={onAuth}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
        >
          Sign in
        </button>
      </nav>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 text-center sm:pt-14">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1.5 text-xs font-semibold text-cyan-300">
          <Radio size={13} className="animate-pulse" /> WebRTC • Supabase Realtime • Cloudflare TURN
        </div>
        <h1 className="font-display text-4xl font-extrabold leading-tight text-white sm:text-6xl">
          Chat, Stories &amp; <span className="text-gradient">HD Calls</span>
          <br />
          That Never <span className="text-gradient">Drop</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
          My Chat 24 combines realtime messaging, 24-hour stories and peer-to-peer audio/video calls —
          relayed through Cloudflare's global TURN network when direct P2P isn't possible.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={onAuth}
            className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-indigo-500 px-7 py-3.5 font-display text-base font-bold text-[#071018] shadow-glow transition hover:brightness-110"
          >
            Start chatting free <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </button>
          <span className="text-xs text-slate-500">No credit card • Works in browser &amp; Android</span>
        </div>

        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["Realtime", "Sub-second chat delivery"],
            ["TURN", "Cloudflare global relay"],
            ["Stories", "24h photo & video"],
            ["P2P media", "Direct, low-latency calls"],
          ].map(([t, d]) => (
            <div key={t} className="glass rounded-2xl p-4 text-left">
              <p className="font-display text-sm font-bold text-cyan-300">{t}</p>
              <p className="mt-1 text-xs text-slate-400">{d}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-5 sm:grid-cols-3">
          <Feature
            icon={<MessageCircle size={22} />}
            title="Instant messaging"
            text="1:1 DMs, groups and channels with photos, videos, voice notes, edit within 15 minutes and unsend before seen."
          />
          <Feature
            icon={<Video size={22} />}
            title="Audio & video calls"
            text="WebRTC peer connections with STUN discovery and Cloudflare TURN relay fallback for strict NATs."
          />
          <Feature
            icon={<Image size={22} />}
            title="24-hour stories"
            text="Share photos, videos or text cards that vanish after a day — visible to your contacts."
          />
        </div>

        <div className="glass mx-auto mt-14 max-w-3xl rounded-3xl p-8 text-left">
          <p className="font-display text-sm font-bold uppercase tracking-widest text-cyan-300">How it works</p>
          <div className="mt-5 grid gap-6 sm:grid-cols-3">
            {[
              ["1", "Sign up with email", "Password or one-time code (OTP) — your choice depends on the Supabase OTP toggle."],
              ["2", "Set up your profile", "Photo, name, @username, phone, gender — auto username from email if you skip."],
              ["3", "Chat & call", "Find people by @username or phone, start DMs, groups, channels, stories and calls."],
            ].map(([n, t, d]) => (
              <div key={n} className="relative pl-10">
                <span className="absolute left-0 top-0 grid h-7 w-7 place-items-center rounded-full bg-cyan-400/15 font-display text-xs font-bold text-cyan-300">
                  {n}
                </span>
                <p className="font-semibold text-white">{t}</p>
                <p className="mt-1 text-sm text-slate-400">{d}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-3xl rounded-3xl border border-white/10 bg-white/[0.03] p-8">
          <h2 className="font-display text-2xl font-bold text-white">Ready in 30 seconds</h2>
          <p className="mt-2 text-sm text-slate-400">
            Create your account, sync contacts and call anyone on My Chat 24 — free.
          </p>
          <button
            onClick={onAuth}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 font-display font-bold text-[#0B1220] transition hover:bg-slate-200"
          >
            Create account <ArrowRight size={18} />
          </button>
        </div>

        <footer className="pb-10 pt-14 text-xs text-slate-600">
          My Chat 24 — built with React, WebRTC, Supabase &amp; Cloudflare TURN.
        </footer>
      </section>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="glass rounded-2xl p-6 text-left transition hover:border-cyan-400/30">
      <div className="mb-3 inline-grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-indigo-500/20 text-cyan-300">
        {icon}
      </div>
      <h3 className="font-display text-lg font-bold text-white">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{text}</p>
    </div>
  );
}

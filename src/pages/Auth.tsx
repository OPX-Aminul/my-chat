import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Button, Input, Spinner, toast } from "../components/ui";
import { Mail, Lock, ArrowLeft, KeyRound, UserPlus } from "lucide-react";

type Mode = "signin" | "signup" | "otp";

export default function Auth({
  onAuthenticated,
  onBack,
}: {
  onAuthenticated: () => void;
  onBack?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        onAuthenticated();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.session) {
          onAuthenticated();
        } else {
          toast("Account created! Check your email to confirm, then sign in.", "ok");
          setMode("signin");
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong", "err");
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (error) throw error;
      setOtpSent(true);
      toast("OTP sent — check your inbox", "ok");
    } catch (err) {
      // OTP provider may be disabled in Supabase — surface a helpful message
      const msg = err instanceof Error ? err.message : "Failed to send OTP";
      toast(
        msg.toLowerCase().includes("not enabled") || msg.toLowerCase().includes("unsupported")
          ? "OTP is disabled in your Supabase project. Use email + password instead."
          : msg,
        "err"
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "email",
      });
      if (error) throw error;
      onAuthenticated();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Invalid code", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-grid flex h-full items-center justify-center overflow-y-auto bg-[#070B14] p-5">
      <div className="glass w-full max-w-md rounded-3xl p-8 shadow-panel animate-fade-up">
        <button
          onClick={() => {
            if (otpSent) setOtpSent(false);
            else if (onBack) onBack();
          }}
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-500 font-display text-lg font-extrabold text-[#071018] shadow-glow">
            24
          </div>
          <h1 className="font-display text-2xl font-bold text-white">
            {otpSent ? "Enter your code" : mode === "signin" ? "Welcome back" : "Create account"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {otpSent
              ? `We sent a 6-digit code to ${email}`
              : mode === "signin"
                ? "Sign in to My Chat 24"
                : "Join My Chat 24 — free forever"}
          </p>
        </div>

        {otpSent ? (
          <form onSubmit={verifyOtp} className="space-y-4">
            <div className="relative">
              <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                className="pl-11 text-center font-display text-xl tracking-[0.4em]"
                placeholder="••••••"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || otpCode.length < 6}>
              {busy ? <Spinner className="h-4 w-4 border-white/40" /> : "Verify & continue"}
            </Button>
            <button
              type="button"
              onClick={sendOtp}
              className="w-full text-center text-xs font-semibold text-cyan-300 hover:underline"
            >
              Resend code
            </button>
          </form>
        ) : (
          <>
            {/* OTP first — matches "Gmail + OTP" flow */}
            <form onSubmit={sendOtp} className="space-y-4">
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  className="pl-11"
                  type="email"
                  required
                  placeholder="you@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              <Button type="submit" variant="outline" className="w-full" disabled={busy}>
                {busy ? <Spinner className="h-4 w-4" /> : "Continue with OTP (email code)"}
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-slate-600">
              <div className="h-px flex-1 bg-white/10" /> or email + password <div className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  className="pl-11"
                  type="password"
                  required
                  minLength={6}
                  placeholder={mode === "signin" ? "Your password" : "Create a password (min 6 chars)"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? (
                  <Spinner className="h-4 w-4 border-white/40" />
                ) : mode === "signin" ? (
                  "Sign in"
                ) : (
                  <>
                    <UserPlus size={16} /> Create account
                  </>
                )}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-400">
              {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="font-semibold text-cyan-300 hover:underline"
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { saveProfileSetup, uploadAvatar } from "../lib/api";
import { Avatar, Button, Input, Select, Spinner, toast } from "../components/ui";
import { Camera } from "lucide-react";

export default function ProfileSetup({
  email,
  onDone,
}: {
  email: string;
  onDone: () => void;
}) {
  const autoUsername =
    email.split("@")[0].replace(/[^a-z0-9_]/gi, "").toLowerCase().slice(0, 18) || "user";
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState(autoUsername);
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState<"" | "male" | "female" | "other">("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Not signed in");
      const url = await uploadAvatar(data.user.id, f);
      setAvatarUrl(url);
      toast("Photo uploaded", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "err");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      toast("Name is required", "err");
      return;
    }
    if (username.trim().length < 3) {
      toast("Username must be at least 3 characters", "err");
      return;
    }
    setBusy(true);
    try {
      await saveProfileSetup({
        display_name: displayName,
        username,
        phone,
        gender: gender || undefined,
        bio,
        avatar_url: avatarUrl,
      });
      toast("Profile saved 🎉", "ok");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero-grid flex h-full items-center justify-center overflow-y-auto bg-[#070B14] p-5">
      <form
        onSubmit={submit}
        className="glass w-full max-w-lg rounded-3xl p-8 shadow-panel animate-fade-up"
      >
        <h1 className="font-display text-2xl font-bold text-white">Set up your profile</h1>
        <p className="mt-1 text-sm text-slate-400">
          This is how people find you on My Chat 24 — by your <b className="text-slate-200">@username</b> or phone.
        </p>

        <div className="mt-6 flex items-center gap-5">
          <button type="button" onClick={() => fileRef.current?.click()} className="group relative">
            <Avatar name={displayName || "?"} url={avatarUrl} size={84} ring />
            <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 text-[#071018] shadow-glow">
              {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Camera size={15} />}
            </span>
          </button>
          <div className="text-sm text-slate-400">
            <p className="font-semibold text-white">Profile photo</p>
            <p className="mt-0.5">Tap to upload (JPG/PNG)</p>
            <p className="mt-1 text-xs text-slate-500">Auto username from email: @{autoUsername}</p>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
        </div>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Display name *</span>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Aminul Islam"
              required
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Username *</span>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">@</span>
              <Input
                className="pl-9"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase())}
                placeholder="username"
                required
                minLength={3}
              />
            </div>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Phone (optional)</span>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801XXXXXXXXX" />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gender (optional)</span>
            <Select
              className="w-full rounded-xl border border-white/10 bg-[#0F172A] px-4 py-3 text-sm"
              value={gender}
              onChange={(e) => setGender(e.target.value as typeof gender)}
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bio</span>
            <textarea
              className="min-h-[80px] w-full rounded-xl border border-white/10 bg-[#0F172A] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-400/60"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell people a bit about yourself"
            />
          </label>
        </div>

        <Button type="submit" className="mt-6 w-full" disabled={busy || uploading}>
          {busy ? <Spinner className="h-4 w-4 border-white/40" /> : "Finish setup"}
        </Button>
      </form>
    </div>
  );
}

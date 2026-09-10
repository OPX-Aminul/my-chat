import { useEffect, useMemo, useState } from "react";
import {
  adminListAllMessages,
  adminListUsers,
  adminSetBadge,
  adminSetRole,
  adminSetStatus,
  adminStats,
} from "../lib/api";
import { BADGE_META, clockTime, timeAgo, type Badge, type Profile } from "../lib/types";
import { Avatar, BadgeChip, AdminCrown, Button, Input, Select, Spinner, toast } from "../components/ui";
import { Search, ShieldAlert, Ban, CheckCircle2, Users, MessageSquare, Image, Phone, X } from "lucide-react";

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"overview" | "users" | "messages">("overview");
  const [stats, setStats] = useState({ users: 0, messages: 0, stories: 0, calls: 0 });
  const [users, setUsers] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<AdminMessageRow[]>([]);
  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, u, m] = await Promise.all([adminStats(), adminListUsers(), adminListAllMessages(120)]);
        setStats(s);
        setUsers(u);
        setMessages(m as unknown as AdminMessageRow[]);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to load admin data", "err");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredUsers = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return users;
    return users.filter(
      (u) =>
        u.display_name?.toLowerCase().includes(t) ||
        u.username?.toLowerCase().includes(t) ||
        u.email?.toLowerCase().includes(t) ||
        u.phone?.toLowerCase().includes(t)
    );
  }, [users, term]);

  async function changeBadge(u: Profile, badge: Badge) {
    try {
      await adminSetBadge(u.id, badge);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, badge } : x)));
      toast(`${u.display_name} → ${BADGE_META[badge].label}`, "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "err");
    }
  }

  async function toggleBan(u: Profile) {
    const next = u.status === "banned" ? "active" : "banned";
    try {
      await adminSetStatus(u.id, next);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: next } : x)));
      toast(next === "banned" ? `${u.display_name} banned 🚫` : `${u.display_name} unbanned ✅`, "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "err");
    }
  }

  async function toggleRole(u: Profile) {
    const next = u.role === "admin" ? "user" : "admin";
    try {
      await adminSetRole(u.id, next);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: next } : x)));
      toast(`${u.display_name} is now ${next}`, "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "err");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[#05070D]/95 backdrop-blur-sm">
      {/* header */}
      <header className="flex items-center justify-between border-b border-white/10 bg-[#0B1220] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 text-[#0B1220]">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">Admin Panel</h2>
            <p className="text-[11px] text-slate-500">My Chat 24 control center</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white">
          <X size={20} />
        </button>
      </header>

      {/* tabs */}
      <div className="flex gap-1 border-b border-white/5 bg-[#0B1220] px-5 pt-2">
        {(
          [
            ["overview", "Overview"],
            ["users", "Users"],
            ["messages", "All chats"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${
              tab === key ? "bg-[#05070D] text-cyan-300" : "text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="grid h-full place-items-center">
            <Spinner className="h-8 w-8" />
          </div>
        ) : tab === "overview" ? (
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<Users size={20} />} label="Total users" value={stats.users} tint="text-cyan-300" />
            <StatCard icon={<MessageSquare size={20} />} label="Messages" value={stats.messages} tint="text-indigo-300" />
            <StatCard icon={<Image size={20} />} label="Stories" value={stats.stories} tint="text-fuchsia-300" />
            <StatCard icon={<Phone size={20} />} label="Calls" value={stats.calls} tint="text-emerald-300" />
          </div>
        ) : tab === "users" ? (
          <>
            <div className="relative mx-auto mb-4 max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search users…"
                className="w-full rounded-xl border border-white/10 bg-[#0F172A] py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-400/50"
              />
            </div>
            <div className="mx-auto max-w-4xl space-y-2">
              {filteredUsers.map((u) => (
                <div key={u.id} className="glass rounded-2xl p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={u.display_name} url={u.avatar_url} size={46} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold text-white">{u.display_name}</p>
                        <BadgeChip badge={u.badge} />
                        {u.role === "admin" && (
                          <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">ADMIN</span>
                        )}
                        {u.status === "banned" && (
                          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">BANNED</span>
                        )}
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        @{u.username} • {u.email} {u.phone ? `• ${u.phone}` : ""} • joined {timeAgo(u.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={u.badge}
                        onChange={(e) => changeBadge(u, e.target.value as Badge)}
                        title="Set badge"
                      >
                        {Object.entries(BADGE_META).map(([value, meta]) => (
                          <option key={value} value={value}>
                            {meta.icon ? `${meta.icon} ` : ""}{meta.label}
                          </option>
                        ))}
                      </Select>
                      <button
                        onClick={() => toggleBan(u)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                          u.status === "banned"
                            ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                            : "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                        }`}
                      >
                        {u.status === "banned" ? <CheckCircle2 size={13} /> : <Ban size={13} />}
                        {u.status === "banned" ? "Unban" : "Ban"}
                      </button>
                      <button
                        onClick={() => toggleRole(u)}
                        className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                      >
                        {u.role === "admin" ? "Demote" : "Make admin"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No users found.</p>}
            </div>
          </>
        ) : (
          <div className="mx-auto max-w-4xl space-y-1.5">
            <p className="mb-3 text-xs text-slate-500">Latest {messages.length} messages across all conversations (newest first):</p>
            {messages.map((m) => (
              <div key={m.id} className="glass flex items-start gap-3 rounded-xl px-4 py-3">
                <Avatar name={m.sender?.display_name ?? "?"} url={m.sender?.avatar_url} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="flex items-center gap-1 text-sm font-semibold text-white">
                      {m.sender?.display_name ?? "Unknown"}
                      {m.sender?.role === "admin" && <AdminCrown />}
                    </p>
                    <span className="text-[10px] text-slate-500">{clockTime(m.created_at)} • {timeAgo(m.created_at)}</span>
                  </div>
                  <p className={`mt-0.5 break-words text-sm ${m.deleted_after_seen || m.deleted_before_seen ? "italic text-slate-500" : "text-slate-300"}`}>
                    {m.deleted_after_seen || m.deleted_before_seen
                      ? "🚫 (message deleted)"
                      : m.content || (m.media_type ? `[${m.media_type}]` : "")}
                  </p>
                </div>
              </div>
            ))}
            {messages.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No messages yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: number; tint: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className={`mb-2 inline-grid h-9 w-9 place-items-center rounded-xl bg-white/5 ${tint}`}>{icon}</div>
      <p className="font-display text-2xl font-extrabold text-white">{value.toLocaleString()}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

interface AdminMessageRow {
  id: string;
  sender_id: string;
  content: string | null;
  media_type: string | null;
  deleted_before_seen: boolean;
  deleted_after_seen: boolean;
  created_at: string;
  sender?: Profile | null;
}

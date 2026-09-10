export type Gender = "male" | "female" | "other";
export type Badge = "none" | "verified" | "pro" | "vip" | "premium" | "moderator";
export type UserRole = "user" | "admin";
export type UserStatus = "active" | "banned";
export type CallType = "audio" | "video";
export type CallStatus =
  | "ringing"
  | "accepted"
  | "declined"
  | "ended"
  | "missed"
  | "cancelled";
export type GroupRole = "owner" | "admin" | "member";
export type ChatKind = "dm" | "group";
export type Privacy = "public" | "contacts";

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  phone: string | null;
  gender: Gender | null;
  role: UserRole;
  status: UserStatus;
  badge: Badge;
  last_seen: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  kind: ChatKind;
  name: string | null;
  avatar_url: string | null;
  description: string | null;
  call_policy: "all" | "admins";
  created_by: string;
  created_at: string;
  last_message_at: string | null;
  // joined for DMs (query convenience, see lib/api.ts)
  peer?: Profile | null;
  member_count?: number;
  my_role?: GroupRole;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: "image" | "video" | "audio" | null;
  deleted_before_seen: boolean;
  deleted_after_seen: boolean;
  edited: boolean;
  created_at: string;
  edited_at: string | null;
  seen_by: string[];
  sender?: Profile | null;
}

export interface Story {
  id: string;
  user_id: string;
  media_url: string | null;
  caption: string | null;
  media_type: "image" | "video" | "text";
  background: string | null;
  created_at: string;
  expires_at: string;
  author?: Profile | null;
  seen_count?: number;
}

export interface CallRecord {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  call_type: CallType;
  status: CallStatus;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface CallRingtonePayload {
  call_id: string;
  conversation_id: string;
  caller_id: string;
  caller_name: string;
  caller_avatar: string | null;
  call_type: CallType;
}

export interface Contact {
  id: string;
  owner_id: string;
  contact_id: string;
  created_at: string;
  contact?: Profile | null;
}

export const FALLBACK_ICE_SERVERS: IceServer[] = [
  { urls: ["stun:stun.l.google.com:19302"] },
  { urls: ["stun:stun1.l.google.com:19302"] },
  { urls: ["stun:stun2.l.google.com:19302"] },
  { urls: ["stun:stun.services.mozilla.com:3478"] },
  { urls: ["stun:stun.l.google.com:5349"] },
  {
    urls: [
      "turn:turn.cloudflare.com:3478?transport=udp",
      "turn:turn.cloudflare.com:3478?transport=tcp",
      "turns:turn.cloudflare.com:5349?transport=tcp",
    ],
  },
];

export const DEFAULT_AVATAR_COLORS = [
  "from-cyan-400 to-blue-500",
  "from-fuchsia-400 to-purple-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-rose-400 to-pink-500",
  "from-indigo-400 to-violet-500",
];

export const BADGE_META: Record<Badge, { label: string; icon: string; className: string }> = {
  none: { label: "Member", icon: "", className: "text-zinc-400" },
  verified: { label: "Verified", icon: "✓", className: "text-sky-400" },
  pro: { label: "Pro", icon: "⚡", className: "text-cyan-400" },
  vip: { label: "VIP", icon: "👑", className: "text-amber-400" },
  premium: { label: "Premium", icon: "★", className: "text-fuchsia-400" },
  moderator: { label: "Moderator", icon: "🛡", className: "text-emerald-400" },
};

export const STORY_BACKGROUNDS = [
  "linear-gradient(135deg,#0ea5e9,#6366f1)",
  "linear-gradient(135deg,#f43f5e,#f59e0b)",
  "linear-gradient(135deg,#10b981,#0ea5e9)",
  "linear-gradient(135deg,#8b5cf6,#ec4899)",
  "linear-gradient(135deg,#0f172a,#1e293b)",
];

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

import { supabase } from "./supabase";
import {
  BADGE_META,
  type Badge,
  type CallRecord,
  type ChatKind,
  type Conversation,
  type Contact,
  type GroupRole,
  type IceServer,
  type Message,
  type Profile,
  type Story,
} from "./types";

// ---------------------------------------------------------------- profiles

export async function getMyProfile(): Promise<Profile | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .maybeSingle();
  return (data as Profile) ?? null;
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  return (data as Profile) ?? null;
}

export async function getProfilesByIds(ids: string[]): Promise<Profile[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from("profiles").select("*").in("id", ids);
  return (data as Profile[]) ?? [];
}

export async function searchUsers(term: string): Promise<Profile[]> {
  const t = term.trim();
  if (!t) return [];
  let q = supabase.from("profiles").select("*").neq("status", "banned").limit(20);
  if (t.startsWith("@")) {
    q = q.ilike("username", `${t.slice(1)}%`);
  } else {
    q = q.or(`username.ilike.%${t}%,display_name.ilike.%${t}%,phone.ilike.%${t}%`);
  }
  const { data } = await q;
  return (data as Profile[]) ?? [];
}

export interface ProfileSetupInput {
  display_name: string;
  username: string;
  phone?: string;
  gender?: Gender;
  bio?: string;
  avatar_url?: string | null;
}

type Gender = "male" | "female" | "other";

export async function saveProfileSetup(input: ProfileSetupInput): Promise<Profile> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const updates: Record<string, unknown> = {
    id: userData.user.id,
    display_name: input.display_name.trim(),
    username: input.username.trim().replace(/^@/, "").toLowerCase(),
    phone: input.phone?.trim() || null,
    gender: input.gender ?? null,
    bio: input.bio?.trim() || null,
    avatar_url: input.avatar_url ?? null,
  };
  const { data, error } = await supabase
    .from("profiles")
    .upsert(updates)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function updateProfileFields(updates: Record<string, unknown>): Promise<Profile> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userData.user.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

// ---------------------------------------------------------------- avatar upload

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `avatars/${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("media")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) throw new Error(error.message);
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

export async function uploadStoryMedia(
  userId: string,
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `stories/${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file);
  if (error) throw new Error(error.message);
  return supabase.storage.from("media").getPublicUrl(path).data.publicUrl;
}

export async function uploadChatMedia(file: File): Promise<{
  url: string;
  type: "image" | "video" | "audio";
}> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const type = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
        ? "audio"
        : "image";
  const path = `chat/${userData.user.id}/${Date.now()}.${file.name.split(".").pop() || "bin"}`;
  const { error } = await supabase.storage.from("media").upload(path, file);
  if (error) throw new Error(error.message);
  return {
    url: supabase.storage.from("media").getPublicUrl(path).data.publicUrl,
    type,
  };
}

// ---------------------------------------------------------------- conversations

export async function listConversations(): Promise<Conversation[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];

  const { data: memberships, error } = await supabase
    .from("conversation_members")
    .select("conversation_id, role")
    .eq("user_id", userData.user.id);
  if (error) throw new Error(error.message);
  const convIds = (memberships ?? []).map((m) => m.conversation_id as string);
  if (!convIds.length) return [];

  const { data: convs, error: convErr } = await supabase
    .from("conversations")
    .select("*")
    .in("id", convIds)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (convErr) throw new Error(convErr.message);
  const list = (convs ?? []) as unknown as Conversation[];

  const roleMap = new Map(
    (memberships ?? []).map((m) => [m.conversation_id, m.role as GroupRole])
  );

  // Load member counts + (for DMs) the peer profile + avatars
  const { data: allMembers } = await supabase
    .from("conversation_members")
    .select("conversation_id, user_id")
    .in("conversation_id", convIds);
  const countMap = new Map<string, number>();
  const dmPeerMap = new Map<string, string>();
  for (const m of allMembers ?? []) {
    countMap.set(m.conversation_id, (countMap.get(m.conversation_id) ?? 0) + 1);
    if (m.user_id !== userData.user.id) {
      // conversation has another member — remember one for DM peer lookup
      if (!dmPeerMap.has(m.conversation_id)) dmPeerMap.set(m.conversation_id, m.user_id);
    }
  }

  const dmIds = list.filter((c) => c.kind === "dm").map((c) => c.id);
  const peerIds = dmIds.map((id) => dmPeerMap.get(id)).filter(Boolean) as string[];
  const peers = await getProfilesByIds(peerIds);
  const peerMap = new Map(peers.map((p) => [p.id, p]));

  return list.map((c) => {
    const peerId = c.kind === "dm" ? dmPeerMap.get(c.id) : undefined;
    const peer = peerId ? peerMap.get(peerId) ?? null : null;
    return {
      ...c,
      my_role: roleMap.get(c.id) ?? "member",
      member_count: countMap.get(c.id) ?? 1,
      peer,
      name: c.kind === "dm" ? peer?.display_name ?? "Chat" : c.name,
      avatar_url:
        c.kind === "dm" ? peer?.avatar_url ?? null : c.avatar_url,
    };
  });
}

export async function ensureDmWith(peerId: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const me = userData.user.id;

  const { data: mine } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", me);
  const myIds = (mine ?? []).map((m) => m.conversation_id);

  if (myIds.length) {
    const { data: shared } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", peerId)
      .in("conversation_id", myIds);
    if (shared?.length) {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id, kind")
        .in(
          "id",
          shared.map((s) => s.conversation_id)
        );
      const dm = (convs ?? []).find((c) => c.kind === "dm");
      if (dm) return dm.id;
    }
  }

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({ kind: "dm", created_by: me })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const { error: mErr } = await supabase.from("conversation_members").insert([
    { conversation_id: conv.id, user_id: me, role: "member" },
    { conversation_id: conv.id, user_id: peerId, role: "member" },
  ]);
  if (mErr) throw new Error(mErr.message);
  return conv.id;
}

export async function createGroup(
  name: string,
  memberIds: string[],
  opts?: { kind?: "group" | "channel"; callPolicy?: "all" | "admins" }
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const me = userData.user.id;
  const kind = opts?.kind ?? "group";

  const { data: conv, error } = await supabase
    .from("conversations")
    .insert({
      kind,
      name: name.trim(),
      call_policy: opts?.callPolicy ?? (kind === "channel" ? "admins" : "all"),
      created_by: me,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const rows = [{ conversation_id: conv.id, user_id: me, role: "owner" as GroupRole }];
  for (const uid of memberIds) {
    if (uid !== me) rows.push({ conversation_id: conv.id, user_id: uid, role: "member" as GroupRole });
  }
  const { error: mErr } = await supabase.from("conversation_members").insert(rows);
  if (mErr) throw new Error(mErr.message);
  return conv.id;
}

export async function addGroupMembers(conversationId: string, userIds: string[]) {
  const rows = userIds.map((uid) => ({
    conversation_id: conversationId,
    user_id: uid,
    role: "member" as GroupRole,
  }));
  const { error } = await supabase.from("conversation_members").insert(rows);
  if (error) throw new Error(error.message);
}

export async function setGroupCallPolicy(conversationId: string, policy: "all" | "admins") {
  const { error } = await supabase
    .from("conversations")
    .update({ call_policy: policy })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------- messages

export async function listMessages(conversationId: string, limit = 200): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Message[];
  const senderIds = [...new Set(rows.map((r) => r.sender_id))];
  const senders = await getProfilesByIds(senderIds);
  const sMap = new Map(senders.map((s) => [s.id, s]));
  return rows
    .map((r) => ({ ...r, sender: sMap.get(r.sender_id) ?? null }))
    .reverse();
}

export async function sendMessage(input: {
  conversation_id: string;
  content?: string | null;
  media_url?: string | null;
  media_type?: "image" | "video" | "audio" | null;
}): Promise<Message> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: input.conversation_id,
      sender_id: userData.user.id,
      content: input.content ?? null,
      media_url: input.media_url ?? null,
      media_type: input.media_type ?? null,
      seen_by: [userData.user.id],
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as Message;
}

/** 15-minute edit window. */
export function canEditMessage(m: Message, myId: string): boolean {
  if (m.sender_id !== myId) return false;
  if (m.deleted_before_seen || m.deleted_after_seen) return false;
  const age = Date.now() - new Date(m.created_at).getTime();
  return age < 15 * 60 * 1000;
}

export async function editMessage(id: string, content: string): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ content, edited: true, edited_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMessageBeforeSeen(id: string): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ deleted_before_seen: true })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMessageAfterSeen(id: string): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ deleted_after_seen: true, content: null, media_url: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markSeen(conversationId: string, myId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user || userData.user.id !== myId) return;
  // fetch unseen messages from others
  const { data } = await supabase
    .from("messages")
    .select("id, seen_by, sender_id")
    .eq("conversation_id", conversationId);
  const unseen = (data ?? []).filter(
    (m: any) => !(m.seen_by ?? []).includes(myId) && m.sender_id !== myId
  );
  for (const m of unseen) {
    await supabase
      .from("messages")
      .update({ seen_by: [...(m.seen_by ?? []), myId] })
      .eq("id", m.id);
  }
}

// ---------------------------------------------------------------- stories

export async function listStories(): Promise<Story[]> {
  const { data, error } = await supabase
    .from("stories")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Story[];
  const authorIds = [...new Set(rows.map((r) => r.user_id))];
  const authors = await getProfilesByIds(authorIds);
  const aMap = new Map(authors.map((a) => [a.id, a]));
  return rows.map((r) => ({ ...r, author: aMap.get(r.user_id) ?? null }));
}

export async function createStory(input: {
  media_url?: string | null;
  caption?: string | null;
  media_type?: "image" | "video" | "text";
  background?: string | null;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const { error } = await supabase.from("stories").insert({
    user_id: userData.user.id,
    media_url: input.media_url ?? null,
    caption: input.caption ?? null,
    media_type: input.media_type ?? "text",
    background: input.background ?? null,
    expires_at: expires,
  });
  if (error) throw new Error(error.message);
}

export async function deleteStory(id: string): Promise<void> {
  const { error } = await supabase.from("stories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function viewStory(storyId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  const { error } = await supabase
    .from("story_views")
    .upsert({ story_id: storyId, viewer_id: userData.user.id });
  if (error) console.warn("story view", error.message);
}

export async function listStoryViewers(storyId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("story_views")
    .select("profiles!story_views_viewer_id_fkey(*)")
    .eq("story_id", storyId);
  if (error) return [];
  return ((data ?? []) as unknown as { profiles: Profile }[]).map((d) => d.profiles);
}

// ---------------------------------------------------------------- contacts

export async function listContacts(): Promise<Profile[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from("contacts")
    .select("contact_id")
    .eq("owner_id", userData.user.id);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((c) => c.contact_id);
  return getProfilesByIds(ids);
}

export async function addContactByTerm(term: string): Promise<Profile | null> {
  const found = await searchUsers(term);
  const exact =
    found.find((p) => p.username.toLowerCase() === term.replace(/^@/, "").toLowerCase()) ??
    found[0];
  if (!exact) return null;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const { error } = await supabase
    .from("contacts")
    .upsert(
      { owner_id: userData.user.id, contact_id: exact.id },
      { onConflict: "owner_id,contact_id" }
    );
  if (error) throw new Error(error.message);
  return exact;
}

// ---------------------------------------------------------------- calls

export async function createCall(input: {
  conversation_id: string;
  callee_id: string;
  call_type: "audio" | "video";
}): Promise<CallRecord> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("calls")
    .insert({ ...input, caller_id: userData.user.id, status: "ringing" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as CallRecord;
}

export async function updateCallStatus(id: string, status: CallRecord["status"]) {
  const patch: Record<string, unknown> = { status };
  if (status === "ended") patch.ended_at = new Date().toISOString();
  const { error } = await supabase.from("calls").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listRecentCalls(limit = 50): Promise<CallRecord[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .or(`caller_id.eq.${userData.user.id},callee_id.eq.${userData.user.id}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as CallRecord[];
}

// ---------------------------------------------------------------- admin

export async function adminListUsers(term = ""): Promise<Profile[]> {
  let q = supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (term.trim()) {
    q = q.or(
      `username.ilike.%${term.trim()}%,display_name.ilike.%${term.trim()}%,email.ilike.%${term.trim()}%`
    );
  }
  const { data, error } = await q.limit(200);
  if (error) throw new Error(error.message);
  return (data as Profile[]) ?? [];
}

export async function adminSetBadge(userId: string, badge: Badge): Promise<void> {
  const { error } = await supabase.from("profiles").update({ badge }).eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function adminSetStatus(userId: string, status: "active" | "banned"): Promise<void> {
  const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function adminSetRole(userId: string, role: "user" | "admin"): Promise<void> {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function adminListAllMessages(limit = 200): Promise<
  (Message & { conversation_kind: ChatKind | null })[]
> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Message[];
  const senderIds = [...new Set(rows.map((r) => r.sender_id))];
  const senders = await getProfilesByIds(senderIds);
  const sMap = new Map(senders.map((s) => [s.id, s]));
  return rows.map((r) => ({
    ...r,
    sender: sMap.get(r.sender_id) ?? null,
    conversation_kind: null,
  }));
}

export async function adminStats(): Promise<{
  users: number;
  messages: number;
  stories: number;
  calls: number;
}> {
  const [u, m, s, c] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }),
    supabase.from("stories").select("id", { count: "exact", head: true }),
    supabase.from("calls").select("id", { count: "exact", head: true }),
  ]);
  return {
    users: u.count ?? 0,
    messages: m.count ?? 0,
    stories: s.count ?? 0,
    calls: c.count ?? 0,
  };
}

export { BADGE_META };
export type { IceServer };

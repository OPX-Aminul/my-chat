import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/types";
import { useOnlinePresence } from "../lib/hooks";
import { timeAgo, clockTime } from "../lib/types";
import {
  addContactByTerm,
  addGroupMembers,
  canEditMessage,
  createGroup,
  createStory,
  deleteMessageAfterSeen,
  deleteMessageBeforeSeen,
  editMessage,
  ensureDmWith,
  listContacts,
  listConversations,
  listMessages,
  listStories,
  listStoryViewers,
  markSeen,
  searchUsers,
  sendMessage,
  setGroupCallPolicy,
  updateProfileFields,
  uploadAvatar,
  uploadChatMedia,
  uploadStoryMedia,
  viewStory,
} from "../lib/api";
import { useCallEngine } from "../lib/useCallEngine";
import { Avatar, BadgeChip, Button, Input, Modal, Select, Spinner, toast } from "../components/ui";
import CallOverlay from "../components/CallOverlay";
import AdminPanel from "./AdminPanel";
import {
  MessageCircle,
  Users,
  Radio as RadioIcon,
  Phone,
  Video,
  Send,
  Paperclip,
  Smile,
  Search,
  LogOut,
  MoreVertical,
  ShieldAlert,
  UserPlus,
  ImageIcon,
  Plus,
  Pencil,
  Trash2,
  Check,
  CheckCheck,
  X,
  ChevronLeft,
  Circle,
  Camera,
  Eye,
} from "lucide-react";

type Tab = "chats" | "stories" | "contacts";

interface ConversationLite {
  id: string;
  kind: string;
  name: string | null;
  avatar_url: string | null;
  last_message_at: string | null;
  my_role?: string;
  member_count?: number;
  peer?: Profile | null;
}

interface MessageLite {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  deleted_before_seen: boolean;
  deleted_after_seen: boolean;
  edited: boolean;
  created_at: string;
  edited_at: string | null;
  seen_by: string[];
  sender?: Profile | null;
}

interface StoryLite {
  id: string;
  user_id: string;
  media_url: string | null;
  caption: string | null;
  media_type: string;
  background: string | null;
  created_at: string;
  author?: Profile | null;
}

export default function ChatApp({
  profile,
  onProfileChanged,
}: {
  profile: Profile;
  onProfileChanged: () => void;
}) {
  const myId = profile.id;
  const [tab, setTab] = useState<Tab>("chats");
  const [convos, setConvos] = useState<ConversationLite[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageLite[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showList, setShowList] = useState(true); // mobile: list vs chat
  const onlineIds = useOnlinePresence(myId);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [stories, setStories] = useState<StoryLite[]>([]);

  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [addingMembers, setAddingMembers] = useState<string | null>(null);
  const [storyViewerStories, setStoryViewerStories] = useState<StoryLite[] | null>(null);

  const isAdmin = profile.role === "admin" && profile.email?.toLowerCase() === "admin@aminul.com";
  const activeConvo = convos.find((c) => c.id === activeId) ?? null;

  const engine = useCallEngine(myId);

  // ---------- data loading ----------
  async function loadConvos() {
    try {
      const list = (await listConversations()) as unknown as ConversationLite[];
      setConvos(list);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load chats", "err");
    }
  }
  async function loadContacts() {
    try {
      setContacts(await listContacts());
    } catch {
      /* noop */
    }
  }
  async function loadStories() {
    try {
      setStories((await listStories()) as unknown as StoryLite[]);
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    loadConvos();
    loadContacts();
    loadStories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realtime: refresh conversation order on new messages anywhere
  useEffect(() => {
    const ch = supabase
      .channel("convos-refresh")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        loadConvos();
        if (activeId) markSeen(activeId, myId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, loadStories)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, myId]);

  // realtime messages for active conversation
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let alive = true;
    listMessages(activeId)
      .then((rows) => alive && setMessages(rows as unknown as MessageLite[]))
      .catch(() => toast("Failed to load messages", "err"));
    markSeen(activeId, myId);

    const channel = supabase
      .channel(`messages-${activeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as MessageLite;
          setMessages((prev) => {
            if (payload.eventType === "DELETE") return prev.filter((m) => m.id !== row.id);
            const idx = prev.findIndex((m) => m.id === row.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = { ...next[idx], ...row };
              return next;
            }
            return [...prev, row];
          });
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // user search
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchTerm.trim().length >= 2) {
        searchUsers(searchTerm)
          .then(setSearchResults)
          .catch(() => setSearchResults([]));
      } else {
        setSearchResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  async function openDm(peer: Profile) {
    try {
      const id = await ensureDmWith(peer.id);
      setSearchTerm("");
      setSearchResults([]);
      await loadConvos();
      setActiveId(id);
      setShowList(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to open chat", "err");
    }
  }

  async function send() {
    if (!activeId) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setDraft("");
    try {
      await sendMessage({ conversation_id: activeId, content: text });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Send failed", "err");
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  async function sendMedia(file: File) {
    if (!activeId) return;
    try {
      toast("Uploading…");
      const { url, type } = await uploadChatMedia(file);
      await sendMessage({ conversation_id: activeId, media_url: url, media_type: type });
      toast("Sent ✓", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "err");
    }
  }

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, activeId]);

  // ---------- derived ----------
  const sortedConvos = useMemo(
    () =>
      [...convos].sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return tb - ta;
      }),
    [convos]
  );

  const storiesByAuthor = useMemo(() => {
    const map = new Map<string, StoryLite[]>();
    for (const s of stories) {
      const key = s.user_id;
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [stories]);

  // ---------- render ----------
  return (
    <div className="flex h-full bg-[#070B14]">
      {/* ============ SIDEBAR ============ */}
      <aside
        className={`${showList ? "flex" : "hidden"} h-full w-full flex-col border-r border-white/5 bg-[#0B1220] md:flex md:w-[340px]`}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500 font-display text-sm font-extrabold text-[#071018]">
              24
            </div>
            <span className="font-display font-bold text-white">My Chat 24</span>
          </div>
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="glass absolute right-0 top-11 z-40 w-56 overflow-hidden rounded-xl shadow-panel animate-fade-up">
                <MenuItem
                  icon={<Circle size={15} className="text-cyan-300" />}
                  label="My profile"
                  onClick={() => {
                    setMenuOpen(false);
                    setProfileModalOpen(true);
                  }}
                />
                <MenuItem
                  icon={<UserPlus size={15} className="text-emerald-300" />}
                  label="New group / channel"
                  onClick={() => {
                    setMenuOpen(false);
                    setNewGroupOpen(true);
                  }}
                />
                <MenuItem
                  icon={<Camera size={15} className="text-fuchsia-300" />}
                  label="Add story"
                  onClick={() => {
                    setMenuOpen(false);
                    setStoryComposerOpen(true);
                  }}
                />
                {isAdmin && (
                  <MenuItem
                    icon={<ShieldAlert size={15} className="text-amber-300" />}
                    label="Admin panel"
                    onClick={() => {
                      setMenuOpen(false);
                      setAdminOpen(true);
                    }}
                  />
                )}
                <MenuItem
                  icon={<LogOut size={15} className="text-rose-300" />}
                  label="Sign out"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    location.reload();
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* tabs */}
        <div className="flex gap-1 px-3 pt-3">
          {(
            [
              ["chats", <MessageCircle key="c" size={15} />, "Chats"],
              ["stories", <Circle key="s" size={15} />, "Stories"],
              ["contacts", <Users key="t" size={15} />, "Contacts"],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              key={key}
              onClick={() => setTab(key as Tab)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                tab === key
                  ? "bg-gradient-to-r from-cyan-400/15 to-indigo-500/15 text-cyan-300"
                  : "text-slate-400 hover:bg-white/5"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* search */}
        <div className="p-3">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Find by @username or phone…"
              className="w-full rounded-xl border border-white/10 bg-[#0F172A] py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-400/50"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {/* search results */}
          {searchResults.length > 0 && (
            <div className="mb-2">
              <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">People</p>
              {searchResults.map((p) => (
                <UserRow key={p.id} profile={p} online={onlineIds.has(p.id)} onClick={() => openDm(p)} />
              ))}
            </div>
          )}

          {tab === "chats" && (
            <>
              {sortedConvos.length === 0 && (
                <EmptyHint text="No chats yet. Search a person above and say hi 👋" />
              )}
              {sortedConvos.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveId(c.id);
                    setShowList(false);
                  }}
                  className={`mb-0.5 flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-white/5 ${
                    activeId === c.id ? "bg-white/5" : ""
                  }`}
                >
                  <Avatar
                    name={c.name ?? "Chat"}
                    url={c.avatar_url}
                    size={46}
                    online={c.peer ? onlineIds.has(c.peer.id) : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold text-slate-100">{c.name ?? "Chat"}</p>
                      <span className="shrink-0 text-[10px] text-slate-500">{timeAgo(c.last_message_at)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {c.kind === "dm" ? "Direct message" : `${c.kind === "channel" ? "Channel" : "Group"} • ${c.member_count ?? 0} members`}
                    </p>
                  </div>
                  {c.kind !== "dm" && (
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                      {c.kind === "channel" ? "CH" : "GR"}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}

          {tab === "stories" && (
            <>
              <button
                onClick={() => setStoryComposerOpen(true)}
                className="mb-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-cyan-400/30 bg-cyan-400/5 px-3 py-3 text-left transition hover:bg-cyan-400/10"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 text-[#071018]">
                  <Plus size={20} />
                </span>
                <span>
                  <p className="text-sm font-semibold text-white">Add your story</p>
                  <p className="text-xs text-slate-500">Visible to contacts for 24 hours</p>
                </span>
              </button>
              {stories.length === 0 && <EmptyHint text="No stories right now." />}
              {[...storiesByAuthor.entries()].map(([uid, list]) => (
                <button
                  key={uid}
                  onClick={() => setStoryViewerStories(list)}
                  className="mb-0.5 flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-white/5"
                >
                  <div className="rounded-full bg-gradient-to-tr from-cyan-400 via-indigo-500 to-fuchsia-500 p-[2.5px]">
                    <Avatar name={list[0].author?.display_name ?? "?"} url={list[0].author?.avatar_url} size={42} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-100">
                      {list[0].author?.display_name ?? "Someone"} {uid === myId && <span className="text-xs text-slate-500">(you)</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {list.length} story{list.length > 1 ? "s" : ""} • {timeAgo(list[0].created_at)}
                    </p>
                  </div>
                </button>
              ))}
            </>
          )}

          {tab === "contacts" && (
            <>
              <button
                onClick={async () => {
                  const term = prompt("Enter @username or phone number:");
                  if (!term) return;
                  try {
                    const added = await addContactByTerm(term);
                    if (added) {
                      toast(`Added ${added.display_name}`, "ok");
                      loadContacts();
                    } else toast("No user found", "err");
                  } catch (err) {
                    toast(err instanceof Error ? err.message : "Failed", "err");
                  }
                }}
                className="mb-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-3 text-left transition hover:bg-white/5"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-cyan-300">
                  <UserPlus size={18} />
                </span>
                <span>
                  <p className="text-sm font-semibold text-white">Add contact</p>
                  <p className="text-xs text-slate-500">By @username or phone</p>
                </span>
              </button>
              {contacts.length === 0 && <EmptyHint text="No contacts yet. Add someone!" />}
              {contacts.map((p) => (
                <UserRow key={p.id} profile={p} online={onlineIds.has(p.id)} onClick={() => openDm(p)} />
              ))}
            </>
          )}
        </div>
      </aside>

      {/* ============ CHAT AREA ============ */}
      <main className={`${showList ? "hidden" : "flex"} h-full min-w-0 flex-1 flex-col md:flex`}>
        {activeConvo ? (
          <>
            {/* chat header */}
            <header className="flex items-center gap-3 border-b border-white/5 bg-[#0B1220] px-4 py-3">
              <button className="md:hidden text-slate-400" onClick={() => setShowList(true)}>
                <ChevronLeft size={22} />
              </button>
              <Avatar
                name={activeConvo.name ?? "Chat"}
                url={activeConvo.avatar_url}
                size={42}
                online={activeConvo.peer ? onlineIds.has(activeConvo.peer.id) : undefined}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-display font-bold text-white">{activeConvo.name ?? "Chat"}</p>
                  {activeConvo.peer && <BadgeChip badge={activeConvo.peer.badge} />}
                  {activeConvo.kind === "channel" && (
                    <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300">CHANNEL</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {activeConvo.peer
                    ? onlineIds.has(activeConvo.peer.id)
                      ? "online"
                      : `last seen ${timeAgo(activeConvo.peer.last_seen)}`
                    : `${activeConvo.member_count ?? 0} members`}
                </p>
              </div>
              {activeConvo.kind === "dm" && activeConvo.peer && (
                <div className="flex items-center gap-1">
                  <IconBtn
                    onClick={() =>
                      engine.placeCall(activeConvo.peer!, "audio", activeConvo.id).catch((e) =>
                        toast(e instanceof Error ? e.message : "Call failed", "err")
                      )
                    }
                  >
                    <Phone size={18} />
                  </IconBtn>
                  <IconBtn
                    onClick={() =>
                      engine.placeCall(activeConvo.peer!, "video", activeConvo.id).catch((e) =>
                        toast(e instanceof Error ? e.message : "Call failed", "err")
                      )
                    }
                  >
                    <Video size={18} />
                  </IconBtn>
                </div>
              )}
              {activeConvo.kind !== "dm" && (activeConvo.my_role === "owner" || activeConvo.my_role === "admin") && (
                <IconBtn onClick={() => setAddingMembers(activeConvo.id)}>
                  <UserPlus size={18} />
                </IconBtn>
              )}
              {activeConvo.kind !== "dm" && activeConvo.my_role === "owner" && (
                <IconBtn
                  onClick={async () => {
                    const next = (activeConvo as any).call_policy === "all" ? "admins" : "all";
                    try {
                      await setGroupCallPolicy(activeConvo.id, next);
                      toast(next === "all" ? "Everyone can call" : "Only admins can call", "ok");
                      loadConvos();
                    } catch (e) {
                      toast(e instanceof Error ? e.message : "Failed", "err");
                    }
                  }}
                >
                  <RadioIcon size={18} />
                </IconBtn>
              )}
            </header>

            {/* messages */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <EmptyHint text="No messages yet — start the conversation!" center />
              )}
              <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
                {messages.map((m) => (
                  <Bubble
                    key={m.id}
                    m={m}
                    mine={m.sender_id === myId}
                    myId={myId}
                    onEdit={async (text) => {
                      try {
                        await editMessage(m.id, text);
                        setMessages((prev) =>
                          prev.map((x) => (x.id === m.id ? { ...x, content: text, edited: true } : x))
                        );
                      } catch (e) {
                        toast(e instanceof Error ? e.message : "Edit failed", "err");
                      }
                    }}
                    onDeleteBefore={async () => {
                      try {
                        await deleteMessageBeforeSeen(m.id);
                        setMessages((prev) =>
                          prev.map((x) => (x.id === m.id ? { ...x, deleted_before_seen: true, content: null, media_url: null } : x))
                        );
                      } catch (e) {
                        toast(e instanceof Error ? e.message : "Delete failed", "err");
                      }
                    }}
                    onDeleteAfter={async () => {
                      try {
                        await deleteMessageAfterSeen(m.id);
                        setMessages((prev) =>
                          prev.map((x) => (x.id === m.id ? { ...x, deleted_after_seen: true, content: null, media_url: null } : x))
                        );
                      } catch (e) {
                        toast(e instanceof Error ? e.message : "Delete failed", "err");
                      }
                    }}
                  />
                ))}
              </div>
              <div ref={messagesEndRef} />
            </div>

            {/* composer */}
            <footer className="border-t border-white/5 bg-[#0B1220] px-4 py-3">
              <div className="mx-auto flex max-w-3xl items-center gap-2">
                <label className="cursor-pointer rounded-xl p-2.5 text-slate-400 transition hover:bg-white/5 hover:text-cyan-300">
                  <Paperclip size={19} />
                  <input
                    type="file"
                    hidden
                    accept="image/*,video/*,audio/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) sendMedia(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Write a message…"
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[#0F172A] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-400/50"
                />
                <button
                  onClick={send}
                  disabled={!draft.trim() || sending}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-r from-cyan-400 to-indigo-500 text-[#071018] shadow-glow transition hover:brightness-110 disabled:opacity-40"
                >
                  {sending ? <Spinner className="h-4 w-4" /> : <Send size={18} />}
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <MessageCircle size={44} className="text-slate-700" />
            <p className="font-display text-lg text-slate-400">Select a chat to start messaging</p>
            <p className="max-w-xs text-sm text-slate-600">
              Find people by @username or phone, create groups, channels, stories and start HD calls.
            </p>
          </div>
        )}
      </main>

      {/* ============ OVERLAYS ============ */}
      <NewGroupModal
        open={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        onCreate={async (name, memberIds, kind) => {
          try {
            const id = await createGroup(name, memberIds, { kind });
            setNewGroupOpen(false);
            await loadConvos();
            setActiveId(id);
            setShowList(false);
            toast(kind === "channel" ? "Channel created 🎉" : "Group created 🎉", "ok");
          } catch (e) {
            toast(e instanceof Error ? e.message : "Create failed", "err");
          }
        }}
      />

      <StoryComposer
        open={storyComposerOpen}
        onClose={() => setStoryComposerOpen(false)}
        onPublish={async (payload) => {
          try {
            if (payload.file) {
              const url = await uploadStoryMedia(myId, payload.file);
              await createStory({
                media_url: url,
                caption: payload.caption || null,
                media_type: payload.file.type.startsWith("video/") ? "video" : "image",
              });
            } else {
              await createStory({ caption: payload.caption, media_type: "text", background: payload.background });
            }
            setStoryComposerOpen(false);
            loadStories();
            toast("Story published ✨", "ok");
          } catch (e) {
            toast(e instanceof Error ? e.message : "Failed", "err");
          }
        }}
      />

      {storyViewerStories && (
        <StoryViewer
          stories={storyViewerStories}
          onClose={() => setStoryViewerStories(null)}
          onView={(id) => viewStory(id)}
          onWho={(id) => listStoryViewers(id)}
          canSeeViewers={storyViewerStories[0]?.user_id === myId}
        />
      )}

      <AddMembersModal
        conversationId={addingMembers}
        onClose={() => setAddingMembers(null)}
        onAdd={async (ids) => {
          if (!addingMembers) return;
          try {
            await addGroupMembers(addingMembers, ids);
            setAddingMembers(null);
            loadConvos();
            toast("Members added ✓", "ok");
          } catch (e) {
            toast(e instanceof Error ? e.message : "Failed", "err");
          }
        }}
      />

      <MyProfileModal
        open={profileModalOpen}
        profile={profile}
        onClose={() => setProfileModalOpen(false)}
        onSaved={() => {
          setProfileModalOpen(false);
          onProfileChanged();
          toast("Profile updated ✓", "ok");
        }}
      />

      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}

      <CallOverlay engine={engine} />
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-slate-200 transition hover:bg-white/5"
    >
      {icon} {label}
    </button>
  );
}

function IconBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl p-2.5 text-slate-300 transition hover:bg-white/5 hover:text-cyan-300">
      {children}
    </button>
  );
}

function UserRow({ profile: p, online, onClick }: { profile: Profile; online: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-0.5 flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-white/5">
      <Avatar name={p.display_name} url={p.avatar_url} size={44} online={online} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-semibold text-slate-100">{p.display_name}</p>
          <BadgeChip badge={p.badge} />
          {p.status === "banned" && (
            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">BANNED</span>
          )}
        </div>
        <p className="truncate text-xs text-slate-500">@{p.username}</p>
      </div>
    </button>
  );
}

function EmptyHint({ text, center }: { text: string; center?: boolean }) {
  return (
    <p className={`px-3 py-8 text-center text-sm text-slate-600 ${center ? "" : ""}`}>{text}</p>
  );
}

// ---------------- Bubble ----------------
function Bubble({
  m,
  mine,
  myId,
  onEdit,
  onDeleteBefore,
  onDeleteAfter,
}: {
  m: MessageLite;
  mine: boolean;
  myId: string;
  onEdit: (text: string) => void;
  onDeleteBefore: () => void;
  onDeleteAfter: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(m.content ?? "");
  const seenByOther = (m.seen_by ?? []).some((id) => id !== myId);
  const deleted = m.deleted_before_seen || m.deleted_after_seen;

  return (
    <div className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="relative max-w-[78%]">
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-panel ${
            mine
              ? "rounded-br-md bg-gradient-to-br from-cyan-500/90 to-indigo-500/90 text-[#06121C]"
              : "rounded-bl-md bg-[#131C31] text-slate-100"
          }`}
        >
          {deleted ? (
            <p className={`italic ${m.deleted_before_seen ? "opacity-70" : "opacity-90"}`}>
              🚫 {m.deleted_before_seen ? "This message was removed" : "Message deleted"}
            </p>
          ) : (
            <>
              {m.media_url && m.media_type === "image" && (
                <img src={m.media_url} alt="attachment" className="mb-1.5 max-h-72 rounded-xl object-cover" loading="lazy" />
              )}
              {m.media_url && m.media_type === "video" && (
                <video src={m.media_url} controls className="mb-1.5 max-h-72 rounded-xl" />
              )}
              {m.media_url && m.media_type === "audio" && (
                <audio src={m.media_url} controls className="mb-1.5 max-w-[240px]" />
              )}
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onEdit(editText);
                        setEditing(false);
                      }
                      if (e.key === "Escape") setEditing(false);
                    }}
                    className="w-52 rounded-lg bg-black/20 px-2.5 py-1.5 text-sm outline-none"
                    autoFocus
                  />
                  <button onClick={() => { onEdit(editText); setEditing(false); }} className="text-emerald-300">
                    <Check size={15} />
                  </button>
                  <button onClick={() => setEditing(false)} className="text-rose-300">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>
              )}
            </>
          )}
          <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${mine ? "text-[#06121C]/70" : "text-slate-500"}`}>
            {m.edited && <span className="italic">edited</span>}
            <span>{clockTime(m.created_at)}</span>
            {mine && (seenByOther ? <CheckCheck size={13} /> : <Check size={13} />)}
          </div>
        </div>

        {/* hover / long-press menu */}
        {mine && !deleted && !editing && (
          <div className="absolute -top-2 right-1 z-10 hidden group-hover:block">
            <button
              onClick={() => setMenu((v) => !v)}
              className="glass rounded-lg p-1.5 text-slate-300 shadow-panel"
              title="Message options"
            >
              <MoreVertical size={13} />
            </button>
            {menu && (
              <div className="glass absolute right-0 top-8 z-20 w-52 overflow-hidden rounded-xl shadow-panel">
                {canEditMessage(m as any, myId) && (
                  <button
                    onClick={() => { setMenu(false); setEditing(true); }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-slate-200 hover:bg-white/5"
                  >
                    <Pencil size={13} className="text-cyan-300" /> Edit (15 min window)
                  </button>
                )}
                <button
                  onClick={() => { setMenu(false); onDeleteBefore(); }}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-slate-200 hover:bg-white/5"
                >
                  <Trash2 size={13} className="text-rose-300" /> Delete for everyone
                </button>
                <button
                  onClick={() => { setMenu(false); onDeleteAfter(); }}
                  className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs font-medium text-slate-200 hover:bg-white/5"
                >
                  <Trash2 size={13} className="text-amber-300" /> Delete for me (after seen)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- New group / channel modal ----------------
function NewGroupModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, memberIds: string[], kind: "group" | "channel") => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"group" | "channel">("group");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [picked, setPicked] = useState<Profile[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (term.trim().length >= 2) searchUsers(term).then(setResults).catch(() => setResults([]));
      else setResults([]);
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  return (
    <Modal open={open} onClose={onClose} title="Create group / channel">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(["group", "channel"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-xl border px-3 py-3 text-sm font-semibold capitalize transition ${
                kind === k
                  ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300"
                  : "border-white/10 text-slate-400 hover:bg-white/5"
              }`}
            >
              {k === "group" ? "👥 Group (everyone calls)" : "📡 Channel (admins call)"}
            </button>
          ))}
        </div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${kind === "channel" ? "Channel" : "Group"} name`} />
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Members ({picked.length})</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {picked.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-300">
                {p.display_name}
                <button onClick={() => setPicked((v) => v.filter((x) => x.id !== p.id))}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search people to add…"
              className="w-full rounded-xl border border-white/10 bg-[#0F172A] py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-400/50"
            />
          </div>
          <div className="mt-2 max-h-44 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPicked((v) => (v.some((x) => x.id === p.id) ? v : [...v, p]));
                  setTerm("");
                  setResults([]);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-white/5"
              >
                <Avatar name={p.display_name} url={p.avatar_url} size={34} />
                <div>
                  <p className="text-sm font-medium text-slate-100">{p.display_name}</p>
                  <p className="text-xs text-slate-500">@{p.username}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
        <Button
          className="w-full"
          disabled={!name.trim()}
          onClick={() => {
            onCreate(name, picked.map((p) => p.id), kind);
            setName("");
            setPicked([]);
          }}
        >
          Create {kind}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------- Add members modal ----------------
function AddMembersModal({
  conversationId,
  onClose,
  onAdd,
}: {
  conversationId: string | null;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [picked, setPicked] = useState<Profile[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (term.trim().length >= 2) searchUsers(term).then(setResults).catch(() => setResults([]));
      else setResults([]);
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  return (
    <Modal open={!!conversationId} onClose={onClose} title="Add members">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-300">
              {p.display_name}
              <button onClick={() => setPicked((v) => v.filter((x) => x.id !== p.id))}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search people…" />
        <div className="max-h-56 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setPicked((v) => (v.some((x) => x.id === p.id) ? v : [...v, p]));
                setTerm("");
                setResults([]);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-white/5"
            >
              <Avatar name={p.display_name} url={p.avatar_url} size={34} />
              <div>
                <p className="text-sm font-medium text-slate-100">{p.display_name}</p>
                <p className="text-xs text-slate-500">@{p.username}</p>
              </div>
            </button>
          ))}
        </div>
        <Button className="w-full" disabled={!picked.length} onClick={() => onAdd(picked.map((p) => p.id))}>
          Add {picked.length} member{picked.length === 1 ? "" : "s"}
        </Button>
      </div>
    </Modal>
  );
}

// ---------------- Story composer ----------------
function StoryComposer({
  open,
  onClose,
  onPublish,
}: {
  open: boolean;
  onClose: () => void;
  onPublish: (payload: { file?: File; caption?: string; background?: string }) => void;
}) {
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [bg, setBg] = useState("linear-gradient(135deg,#0ea5e9,#6366f1)");
  const bgs = [
    "linear-gradient(135deg,#0ea5e9,#6366f1)",
    "linear-gradient(135deg,#f43f5e,#f59e0b)",
    "linear-gradient(135deg,#10b981,#0ea5e9)",
    "linear-gradient(135deg,#8b5cf6,#ec4899)",
    "linear-gradient(135deg,#0f172a,#1e293b)",
  ];

  return (
    <Modal open={open} onClose={onClose} title="New story">
      <div className="space-y-4">
        <label className="grid cursor-pointer place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-8 text-center transition hover:bg-white/5">
          <ImageIcon size={26} className="mb-2 text-slate-500" />
          <p className="text-sm text-slate-400">{file ? file.name : "Tap to add a photo or video"}</p>
          <input
            type="file"
            hidden
            accept="image/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {!file && (
          <div className="flex gap-2">
            {bgs.map((b) => (
              <button
                key={b}
                onClick={() => setBg(b)}
                className={`h-9 w-9 rounded-lg border-2 ${bg === b ? "border-cyan-300" : "border-transparent"}`}
                style={{ background: b }}
              />
            ))}
          </div>
        )}
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={file ? "Add a caption…" : "What's on your mind? (text story)"}
          className="min-h-[90px] w-full rounded-xl border border-white/10 bg-[#0F172A] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-400/60"
          style={!file ? { background: bg } : undefined}
        />
        <Button
          className="w-full"
          disabled={!file && !caption.trim()}
          onClick={() => {
            onPublish({ file: file ?? undefined, caption, background: bg });
            setCaption("");
            setFile(null);
          }}
        >
          Publish story
        </Button>
      </div>
    </Modal>
  );
}

// ---------------- Story viewer ----------------
function StoryViewer({
  stories,
  onClose,
  onView,
  onWho,
  canSeeViewers,
}: {
  stories: StoryLite[];
  onClose: () => void;
  onView: (id: string) => void;
  onWho: (id: string) => Promise<Profile[]>;
  canSeeViewers: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const s = stories[idx];

  useEffect(() => {
    if (s) onView(s.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <button onClick={onClose} className="absolute right-5 top-5 rounded-xl p-2 text-white/80 hover:bg-white/10">
        <X size={24} />
      </button>
      <div className="glass relative w-full max-w-sm overflow-hidden rounded-3xl shadow-panel" style={{ aspectRatio: "9/16", maxHeight: "80vh" }}>
        {s.media_url && s.media_type === "image" && (
          <img src={s.media_url} className="absolute inset-0 h-full w-full object-cover" alt="story" />
        )}
        {s.media_url && s.media_type === "video" && (
          <video src={s.media_url} className="absolute inset-0 h-full w-full object-cover" autoPlay controls />
        )}
        {!s.media_url && <div className="absolute inset-0" style={{ background: s.background ?? "#0F172A" }} />}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5 pt-16">
          <p className="font-display text-lg font-bold text-white">{s.caption}</p>
          <p className="mt-1 text-xs text-white/60">
            {s.author?.display_name} • {timeAgo(s.created_at)}
          </p>
        </div>
        <div className="absolute left-0 top-0 flex w-full gap-1 p-3">
          {stories.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i <= idx ? "bg-white" : "bg-white/30"}`} />
          ))}
        </div>
        {stories.length > 1 && (
          <>
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white"
            >
              ‹
            </button>
            <button
              onClick={() => setIdx((i) => Math.min(stories.length - 1, i + 1))}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white"
            >
              ›
            </button>
          </>
        )}
      </div>
      {canSeeViewers && (
        <button
          onClick={async () => {
            const viewers = await onWho(s.id);
            toast(`👀 ${viewers.length} view${viewers.length === 1 ? "" : "s"}: ${viewers.map((v) => v.display_name).join(", ") || "none yet"}`, "info");
          }}
          className="glass absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white"
        >
          <Eye size={13} /> Who viewed?
        </button>
      )}
    </div>
  );
}

// ---------------- My profile modal ----------------
function MyProfileModal({
  open,
  profile,
  onClose,
  onSaved,
}: {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [gender, setGender] = useState<string>(profile.gender ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Modal open={open} onClose={onClose} title="My profile">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()}>
            <Avatar name={displayName} url={avatarUrl} size={72} ring />
          </button>
          <div className="text-xs text-slate-400">
            <p className="text-sm font-semibold text-white">{profile.email}</p>
            <p>Tap avatar to change photo</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setAvatarUrl(await uploadAvatar(profile.id, f));
                toast("Photo ready — save to apply", "ok");
              } catch (err) {
                toast(err instanceof Error ? err.message : "Upload failed", "err");
              }
            }}
          />
        </div>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">@</span>
          <Input
            className="pl-9"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase())}
          />
        </div>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
        <Select
          className="w-full rounded-xl border border-white/10 bg-[#0F172A] px-4 py-3 text-sm"
          value={gender}
          onChange={(e) => setGender(e.target.value)}
        >
          <option value="">Prefer not to say</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </Select>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Bio"
          className="min-h-[70px] w-full rounded-xl border border-white/10 bg-[#0F172A] px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
        />
        <Button
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await updateProfileFields({
                display_name: displayName.trim(),
                username: username.trim(),
                phone: phone.trim() || null,
                gender: gender || null,
                bio: bio.trim() || null,
                avatar_url: avatarUrl,
              });
              onSaved();
            } catch (err) {
              toast(err instanceof Error ? err.message : "Save failed", "err");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner className="h-4 w-4 border-white/40" /> : "Save changes"}
        </Button>
      </div>
    </Modal>
  );
}

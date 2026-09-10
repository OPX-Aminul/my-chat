import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Profile } from "./types";
import { getMyProfile, listMessages } from "./api";

export function useSession() {
  const [session, setSession] = useState<SessionLike | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session as SessionLike);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession((s as SessionLike) ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return { session, loading };
}

interface SessionLike {
  user: { id: string; email?: string | null };
  access_token: string;
}

export function useProfile(session: SessionLike | null) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setProfile(null);
      return;
    }
    setLoading(true);
    getMyProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  return { profile, loading, refresh: () => getMyProfile().then(setProfile) };
}

/** Subscribe to messages of one conversation in realtime. */
export function useMessages(conversationId: string | null, enabled: boolean) {
  const [messages, setMessages] = useState<MessageLite[]>([]);
  const [loading, setLoading] = useState(false);
  const convRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId || !enabled) {
      setMessages([]);
      return;
    }
    convRef.current = conversationId;
    setLoading(true);

    listMessages(conversationId)
      .then((rows) => {
        if (convRef.current === conversationId) {
          setMessages(rows as unknown as MessageLite[]);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as MessageLite;
          setMessages((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((m) => m.id !== row.id);
            }
            const exists = prev.some((m) => m.id === row.id);
            if (exists) {
              return prev.map((m) => (m.id === row.id ? { ...m, ...row } : m));
            }
            return [...prev, row];
          });
          // attach sender lazily; chat view also refetches sender info
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, enabled]);

  return { messages, setMessages, loading };
}

interface MessageLite {
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

export function useOnlinePresence(userId: string | null) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel("presence-online", {
      config: { presence: { key: userId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ user_id: string }>();
        const ids = new Set<string>();
        for (const key of Object.keys(state)) {
          const entries = state[key];
          if (entries?.length) ids.add(entries[0].user_id || key);
        }
        setOnlineIds(ids);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return onlineIds;
}

import { useEffect, useRef } from "react";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "./supabase";

/**
 * Keeps the app responsive when backgrounded:
 * - Polls every 15s for new messages in any of my conversations and raises
 *   local notifications (Android keeps the WebView alive for a while, so
 *   messages pop up even when the app is closed to recents).
 * - Incoming CALL notifications are raised in useCallEngine's poll loop.
 *
 * Full push (FCM) can be layered later; this works with zero extra setup.
 */
export function useBackgroundNotifier(myId: string | null) {
  const sinceRef = useRef<string>(new Date().toISOString());

  useEffect(() => {
    if (!myId) return;

    // Android 13+ requires runtime permission
    try {
      LocalNotifications.requestPermissions().catch(() => {});
    } catch {
      /* web */
    }

    const timer = setInterval(async () => {
      const since = sinceRef.current;
      sinceRef.current = new Date().toISOString();
      try {
        const { data: mems, error: memErr } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", myId);
        if (memErr || !mems?.length) return;
        const ids = (mems as { conversation_id: string }[]).map((m) => m.conversation_id);

        const { data: msgs, error: msgErr } = await supabase
          .from("messages")
          .select(
            "id, content, media_type, created_at, sender:profiles!messages_sender_id_fkey(display_name)"
          )
          .in("conversation_id", ids)
          .gt("created_at", since)
          .neq("sender_id", myId)
          .order("created_at", { ascending: true })
          .limit(10);
        if (msgErr || !msgs?.length) return;

        for (const raw of msgs) {
          const m = raw as unknown as {
            id: string;
            content: string | null;
            media_type: string | null;
            sender: { display_name: string } | null;
          };
          try {
            await LocalNotifications.schedule({
              notifications: [
                {
                  id: Math.floor(Math.random() * 2_000_000_000),
                  title: m.sender?.display_name ?? "My Chat 24",
                  body: m.content || (m.media_type ? `Sent ${m.media_type}` : "New message"),
                  schedule: { at: new Date(Date.now() + 200) },
                },
              ],
            });
          } catch {
            /* notifications unavailable */
          }
        }
      } catch {
        /* network hiccup — next tick retries */
      }
    }, 15_000);

    return () => clearInterval(timer);
  }, [myId]);
}

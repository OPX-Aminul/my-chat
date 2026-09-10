import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  FALLBACK_ICE_SERVERS,
  type CallRecord,
  type CallType,
  type IceServer,
  type Profile,
} from "./types";
import { fetchIceServers } from "./turn";
import { createCall, getProfileById, updateCallStatus } from "./api";

export interface IncomingRing {
  call: CallRecord;
  caller: Profile;
}

export interface ActiveCallState {
  call: CallRecord;
  peer: Profile;
  role: "caller" | "callee";
  type: CallType;
  status: "connecting" | "ringing" | "connected" | "ended";
}

/**
 * WebRTC calling over Supabase Realtime.
 *
 * Signaling uses a dedicated realtime channel per call (broadcast events),
 * media transport uses STUN (Google) + Cloudflare TURN credentials fetched
 * from the get-ice-servers edge function.
 */
export function useCallEngine(myId: string | null) {
  const [incoming, setIncoming] = useState<IncomingRing | null>(null);
  const [active, setActive] = useState<ActiveCallState | null>(null);

  const pcsRef = useRef<Record<string, RTCPeerConnection>>({});
  const callRef = useRef<CallRecord | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceRef = useRef<IceServer[]>(FALLBACK_ICE_SERVERS);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  // ---- ringtone ------------------------------------------------------
  function ensureRingtone() {
    if (ringtoneRef.current) return ringtoneRef.current;
    const ctx = new AudioContext();
    // simple dual-tone ring generated with oscillators
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    gain.connect(ctx.destination);
    const o1 = ctx.createOscillator();
    o1.frequency.value = 620;
    const o2 = ctx.createOscillator();
    o2.frequency.value = 830;
    o1.connect(gain);
    o2.connect(gain);
    o1.start();
    o2.start();
    ringtoneRef.current = {
      play() {
        gain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.05);
      },
      pause() {
        gain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.05);
      },
      stop() {
        try {
          o1.stop();
          o2.stop();
        } catch {
          /* noop */
        }
      },
    } as unknown as HTMLAudioElement;
    return ringtoneRef.current;
  }

  function playRing() {
    try {
      ensureRingtone().play();
    } catch {
      /* noop */
    }
  }
  function stopRing() {
    try {
      ringtoneRef.current?.pause();
    } catch {
      /* noop */
    }
  }

  function fireCallNotification(callerName: string, type: CallType) {
    try {
      LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2_000_000_000),
            title: `Incoming ${type} call 📞`,
            body: `${callerName} is calling you on My Chat 24`,
            schedule: { at: new Date(Date.now() + 200) },
          },
        ],
      }).catch(() => {});
    } catch {
      /* web */
    }
  }

  // ---- listen for incoming calls -------------------------------------
  useEffect(() => {
    if (!myId) return;

    const channel = supabase
      .channel(`calls-user-${myId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${myId}` },
        async (payload: any) => {
          const call = payload.new as CallRecord;
          if (call.status !== "ringing") return;
          const caller = await getProfileById(call.caller_id);
          if (!caller) return;
          setIncoming({ call, caller });
          playRing();
          fireCallNotification(caller.display_name, call.call_type);
          // auto-miss after 45s
          setTimeout(() => {
            setIncoming((cur) => {
              if (cur?.call.id === call.id) {
                stopRing();
                updateCallStatus(call.id, "missed");
                return null;
              }
              return cur;
            });
          }, 45_000);
        }
      )
      .subscribe();

    // fallback polling (realtime may be delayed): check for ringing calls
    pollRef.current = setInterval(async () => {
      if (incoming || active) return;
      const { data } = await supabase
        .from("calls")
        .select("*")
        .eq("callee_id", myId)
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1);
      const call = (data ?? [])[0] as CallRecord | undefined;
      if (call && Date.now() - new Date(call.created_at).getTime() < 45_000) {
        const caller = await getProfileById(call.caller_id);
        if (caller) {
          setIncoming((cur) => cur ?? { call, caller });
          playRing();
          fireCallNotification(caller.display_name, call.call_type);
        }
      }
    }, 10_000);

    return () => {
      supabase.removeChannel(channel);
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  // ---- signaling channel ---------------------------------------------
  function callChannel(callId: string): RealtimeChannel {
    if (channelRef.current && channelRef.current.topic === `call-${callId}`) {
      return channelRef.current;
    }
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`call-${callId}`);
    channelRef.current = ch;
    return ch;
  }

  async function buildPeer(
    callId: string,
    peerId: string,
    type: CallType
  ): Promise<RTCPeerConnection> {
    if (pcsRef.current[callId]) return pcsRef.current[callId];

    iceRef.current = await fetchIceServers();
    const pc = new RTCPeerConnection({ iceServers: iceRef.current, iceCandidatePoolSize: 4 });
    pcsRef.current[callId] = pc;

    // local media
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video" ? { facingMode: "user", width: { ideal: 1280 } } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    setCamOn(type === "video");
    stream.getVideoTracks().forEach((t) => (t.enabled = type === "video"));

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (ev) => {
      setRemoteStream(ev.streams[0] ?? new MediaStream([ev.track]));
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        callChannel(callId).send({
          type: "broadcast",
          event: "ice",
          payload: { from: myId, candidate: ev.candidate.toJSON() },
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setActive((s) => (s ? { ...s, status: "connected" } : s));
        stopRing();
      } else if (pc.connectionState === "failed") {
        teardown(callId, true);
      }
    };
    return pc;
  }

  async function drainCandidates(callId: string, pc: RTCPeerConnection) {
    const list = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const c of list) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* ignore */
      }
    }
  }

  const placeCall = useCallback(
    async (peer: Profile, type: CallType, conversationId: string) => {
      if (!myId) return;
      const call = await createCall({
        conversation_id: conversationId,
        callee_id: peer.id,
        call_type: type,
      });
      callRef.current = call;
      setActive({
        call,
        peer,
        role: "caller",
        type,
        status: "ringing",
      });

      const ch = callChannel(call.id);
      ch.on("broadcast", { event: "ice" }, (msg: any) => {
        const payload = msg.payload ?? {};
        if (payload.from === myId) return;
        pcsRef.current[call.id]?.addIceCandidate(payload.candidate).catch(() => {});
      });
      ch.on("broadcast", { event: "answer" }, async (msg: any) => {
        const payload = msg.payload ?? {};
        const pc = pcsRef.current[call.id];
        if (pc && payload.sdp) {
          await pc.setRemoteDescription(payload.sdp);
          await drainCandidates(call.id, pc);
        }
      });
      ch.on("broadcast", { event: "bye" }, () => teardown(call.id, false));
      await ch.subscribe();

      const pc = await buildPeer(call.id, peer.id, type);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ch.send({
        type: "broadcast",
        event: "offer",
        payload: { from: myId, sdp: pc.localDescription },
      });

      // auto-cancel after 45s unanswered
      setTimeout(() => {
        setActive((s) => {
          if (s?.call.id === call.id && s.status !== "connected") {
            updateCallStatus(call.id, "cancelled");
            teardown(call.id, true);
            return null;
          }
          return s;
        });
      }, 45_000);
    },
    [myId]
  );

  const acceptCall = useCallback(async () => {
    const cur = incoming;
    if (!cur || !myId) return;
    stopRing();
    setIncoming(null);
    callRef.current = cur.call;
    setActive({
      call: cur.call,
      peer: cur.caller,
      role: "callee",
      type: cur.call.call_type,
      status: "connecting",
    });
    await updateCallStatus(cur.call.id, "accepted");

    const ch = callChannel(cur.call.id);
    ch.on("broadcast", { event: "ice" }, (msg: any) => {
      const payload = msg.payload ?? {};
      if (payload.from === myId) return;
      const pc = pcsRef.current[cur.call.id];
      if (pc && pc.remoteDescription) {
        pc.addIceCandidate(payload.candidate).catch(() => {});
      } else {
        pendingCandidates.current.push(payload.candidate);
      }
    });
    ch.on("broadcast", { event: "offer" }, async (msg: any) => {
      const payload = msg.payload ?? {};
      const pc = await buildPeer(cur.call.id, cur.call.caller_id, cur.call.call_type);
      await pc.setRemoteDescription(payload.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ch.send({
        type: "broadcast",
        event: "answer",
        payload: { from: myId, sdp: pc.localDescription },
      });
      await drainCandidates(cur.call.id, pc);
    });
    ch.on("broadcast", { event: "bye" }, () => teardown(cur.call.id, false));
    await ch.subscribe();
  }, [incoming, myId]);

  const declineCall = useCallback(async () => {
    const cur = incoming;
    if (!cur) return;
    stopRing();
    setIncoming(null);
    await updateCallStatus(cur.call.id, "declined");
    callChannel(cur.call.id).send({
      type: "broadcast",
      event: "bye",
      payload: { from: myId },
    });
  }, [incoming, myId]);

  const endCall = useCallback(() => {
    const cur = callRef.current;
    if (cur) {
      updateCallStatus(cur.id, "ended");
      callChannel(cur.id).send({ type: "broadcast", event: "bye", payload: { from: myId } });
    }
    if (active) teardown(active.call.id, true);
  }, [active, myId]);

  function teardown(callId: string, clear: boolean) {
    const pc = pcsRef.current[callId];
    if (pc) {
      pc.getSenders().forEach((s) => {
        try {
          s.track?.stop();
        } catch {
          /* noop */
        }
      });
      pc.close();
      delete pcsRef.current[callId];
    }
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    stopRing();
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (clear) setActive(null);
    else setActive((s) => (s && s.call.id === callId ? { ...s, status: "ended" } : s));
  }

  function toggleMic() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micOn;
    stream.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }

  function toggleCam() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !camOn;
    stream.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  }

  // cleanup on unmount
  useEffect(() => {
    return () => {
      Object.keys(pcsRef.current).forEach((id) => {
        try {
          pcsRef.current[id].close();
        } catch {
          /* noop */
        }
      });
      stopRing();
    };
  }, []);

  return {
    incoming,
    active,
    localStream,
    remoteStream,
    micOn,
    camOn,
    placeCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMic,
    toggleCam,
  };
}



import { useEffect, useRef } from "react";
import type { useCallEngine } from "../lib/useCallEngine";
import { Avatar, Button } from "./ui";
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Phone } from "lucide-react";

export default function CallOverlay({
  engine,
}: {
  engine: ReturnType<typeof useCallEngine>;
}) {
  const { incoming, active, localStream, remoteStream, micOn, camOn } = engine;
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  if (!active && !incoming) return null;

  // ---------- incoming ring ----------
  if (incoming && !active) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
        <div className="glass w-full max-w-sm rounded-3xl p-8 text-center shadow-panel animate-fade-up">
          <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">
            Incoming {incoming.call.call_type} call
          </p>
          <div className="mx-auto my-6 relative h-24 w-24">
            <span className="absolute inset-0 rounded-full bg-cyan-400/40 animate-pulse-ring" />
            <Avatar name={incoming.caller.display_name} url={incoming.caller.avatar_url} size={96} ring />
          </div>
          <h3 className="font-display text-xl font-bold text-white">{incoming.caller.display_name}</h3>
          <p className="mt-1 text-sm text-slate-400">@{incoming.caller.username}</p>
          <div className="mt-8 flex items-center justify-center gap-5">
            <button
              onClick={() => engine.declineCall()}
              className="grid h-16 w-16 place-items-center rounded-full bg-rose-500 text-white shadow-panel transition hover:brightness-110"
              title="Decline"
            >
              <PhoneOff size={24} />
            </button>
            <button
              onClick={() => engine.acceptCall()}
              className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500 text-white shadow-panel transition hover:brightness-110"
              title="Accept"
            >
              {incoming.call.call_type === "video" ? <VideoIcon size={24} /> : <Phone size={24} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!active) return null;

  const isVideo = active.type === "video";

  // ---------- active call ----------
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#05070D]">
      {/* remote video or avatar */}
      <div className="relative flex-1 overflow-hidden">
        {isVideo ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
            {!remoteStream && (
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-20 w-20 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
                  <p className="font-display text-slate-300">
                    {active.status === "connected" ? "Connecting media…" : "Ringing…"}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#0B1220] to-[#05070D]">
            <div className="relative">
              <span className="absolute inset-0 rounded-full bg-cyan-400/30 animate-pulse-ring" />
              <Avatar name={active.peer.display_name} url={active.peer.avatar_url} size={120} ring />
            </div>
            <h3 className="font-display text-2xl font-bold text-white">{active.peer.display_name}</h3>
            <p className="text-sm text-cyan-300">
              {active.status === "connected" ? "Connected" : active.status === "ringing" ? "Ringing…" : "Connecting…"}
            </p>
          </div>
        )}

        {/* self preview */}
        {isVideo && localStream && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute right-4 top-4 h-40 w-28 rounded-2xl border border-white/10 object-cover shadow-panel sm:h-52 sm:w-36"
          />
        )}
      </div>

      {/* controls */}
      <div className="flex items-center justify-center gap-4 border-t border-white/5 bg-[#0B1220] px-6 py-6">
        <button
          onClick={engine.toggleMic}
          className={`grid h-14 w-14 place-items-center rounded-full transition ${
            micOn ? "bg-white/10 text-white hover:bg-white/15" : "bg-rose-500/90 text-white"
          }`}
          title={micOn ? "Mute" : "Unmute"}
        >
          {micOn ? <Mic size={22} /> : <MicOff size={22} />}
        </button>
        {isVideo && (
          <button
            onClick={engine.toggleCam}
            className={`grid h-14 w-14 place-items-center rounded-full transition ${
              camOn ? "bg-white/10 text-white hover:bg-white/15" : "bg-rose-500/90 text-white"
            }`}
            title={camOn ? "Camera off" : "Camera on"}
          >
            {camOn ? <VideoIcon size={22} /> : <VideoOff size={22} />}
          </button>
        )}
        <button
          onClick={engine.endCall}
          className="grid h-16 w-16 place-items-center rounded-full bg-rose-500 text-white shadow-panel transition hover:brightness-110"
          title="End call"
        >
          <PhoneOff size={26} />
        </button>
      </div>
    </div>
  );
}

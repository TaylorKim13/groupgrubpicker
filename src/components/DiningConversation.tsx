import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Mic, Square, X } from "lucide-react";
import { Button } from "./ui/button";
import { SuggestionCards } from "./SuggestionCards";
import {
  analyzeRoomDiningConversation,
  suggestRoomDiningFromConversation,
  getRoomDiningVoiceCooldown,
} from "@/lib/room.functions";
import type { DiningSuggestion } from "@/lib/dining";
import {
  conversationWav,
  MAX_CONVERSATION_SECONDS,
  CONVERSATION_COOLDOWN_MS,
  type ConversationPreferences,
} from "@/lib/dining-conversation";
import type { Session } from "@/lib/session";
import type { Restaurant } from "@/lib/restaurants";
import type { RewardRestaurant } from "@/lib/restaurant-rewards";

type Capture = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode | null;
  node: AudioWorkletNode | null;
  chunks: Float32Array[];
  samples: number;
  timer: ReturnType<typeof setInterval> | null;
  meterUpdatedAt: number;
  meterEnergy: number;
  meterSamples: number;
};

function release(capture: Capture) {
  if (capture.timer) clearInterval(capture.timer);
  capture.stream.getTracks().forEach((track) => track.stop());
  if (capture.node) capture.node.port.onmessage = null;
  capture.node?.disconnect();
  capture.source?.disconnect();
  void capture.context.close().catch(() => {});
}

export function DiningConversation({
  session,
  available,
  onReview,
  rewardRestaurants,
  selectedPool,
  onAddToPool,
  onViewRestaurant,
}: {
  session: Session;
  available: boolean;
  onReview: (result: ConversationPreferences) => void;
  rewardRestaurants: RewardRestaurant[];
  selectedPool: Restaurant[];
  onAddToPool?: ((restaurant: Restaurant) => Promise<void>) | undefined;
  onViewRestaurant?: ((id: string) => void) | undefined;
}) {
  const analyze = useServerFn(analyzeRoomDiningConversation);
  const suggest = useServerFn(suggestRoomDiningFromConversation);
  const checkCooldown = useServerFn(getRoomDiningVoiceCooldown);
  const [phase, setPhase] = useState<
    "idle" | "starting" | "recording" | "analyzing" | "suggesting"
  >("idle");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now);
  const cooldown = useQuery({
    queryKey: ["dining-voice-cooldown", session.code, session.memberId],
    queryFn: async () => {
      const response = await checkCooldown({ data: session });
      return response.retryAfterMs > 0 ? Date.now() + response.retryAfterMs : 0;
    },
    enabled: available && phase === "idle",
    refetchInterval: 2500,
    retry: 1,
  });
  const cooldownSeconds = Math.max(
    0,
    Math.ceil((Math.max(cooldownUntil, cooldown.data ?? 0) - now) / 1000),
  );
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [cooldownSeconds > 0]);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(40).fill(0));
  const [picks, setPicks] = useState<{
    suggestions: DiningSuggestion[];
    method: "gemini" | "rules";
    message: string;
    demo: boolean;
  } | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ConversationPreferences | null>(null);
  const capture = useRef<Capture | null>(null);
  const attempt = useRef(0);
  const stopRef = useRef<() => void>(() => {});

  useEffect(
    () => () => {
      attempt.current++;
      if (capture.current) release(capture.current);
      capture.current = null;
    },
    [],
  );

  function cancel() {
    attempt.current++;
    if (capture.current) release(capture.current);
    capture.current = null;
    setPhase("idle");
    setSeconds(0);
    setResult(null);
    setPicks(null);
    setError("");
  }

  async function stop() {
    const current = capture.current;
    if (!current) return;
    capture.current = null;
    release(current);
    setSeconds(Math.min(MAX_CONVERSATION_SECONDS, current.samples / current.context.sampleRate));
    const chunks = current.chunks;
    current.chunks = [];
    if (current.samples < current.context.sampleRate) {
      setPhase("idle");
      setError("Record at least one second before stopping.");
      return;
    }
    setPhase("analyzing");
    const id = attempt.current;
    try {
      const wav = conversationWav(chunks, current.context.sampleRate);
      const audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read recording. Please try again."));
        reader.readAsDataURL(new Blob([wav], { type: "audio/wav" }));
      });
      if (id !== attempt.current) return;
      // Start the visible lock before sending, including failures and dismissed requests.
      setCooldownUntil(Date.now() + CONVERSATION_COOLDOWN_MS);
      setNow(Date.now());
      const response = await analyze({ data: { ...session, audio } });
      if (id === attempt.current) setResult(response);
    } catch (err) {
      if (id === attempt.current)
        setError(err instanceof Error ? err.message : "Could not analyze recording.");
    } finally {
      const status = await cooldown.refetch();
      if (status.isSuccess) {
        setCooldownUntil(status.data);
        setNow(Date.now());
      }
      if (id === attempt.current) setPhase("idle");
    }
  }
  stopRef.current = () => {
    void stop();
  };

  async function getSuggestions(conversation: ConversationPreferences) {
    const id = ++attempt.current;
    setError("");
    setPicks(null);
    setPhase("suggesting");
    try {
      const response = await suggest({ data: { ...session, conversation } });
      if (id === attempt.current) setPicks(response);
    } catch (err) {
      if (id === attempt.current)
        setError(
          err instanceof Error ? err.message : "Could not find restaurants for this recording.",
        );
    } finally {
      if (id === attempt.current) setPhase("idle");
    }
  }

  async function start() {
    if (cooldownSeconds > 0 || phase !== "idle") return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setError(
        "Recording needs a supported browser on HTTPS or localhost. You can enter preferences below.",
      );
      return;
    }
    const id = ++attempt.current;
    setError("");
    setResult(null);
    setPicks(null);
    setLevels(Array(40).fill(0));
    setSeconds(0);
    setPhase("starting");
    let pendingStream: MediaStream | null = null;
    let pendingContext: AudioContext | null = null;
    let current: Capture | null = null;
    try {
      // Recheck before requesting the microphone, including cooldowns from another tab.
      const remaining = await checkCooldown({ data: session });
      if (id !== attempt.current) return;
      setNow(Date.now());
      if (remaining.retryAfterMs > 0) {
        setCooldownUntil(Date.now() + remaining.retryAfterMs);
        setPhase("idle");
        return;
      }
      pendingStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (id !== attempt.current) {
        pendingStream.getTracks().forEach((t) => t.stop());
        return;
      }
      pendingContext = new AudioContext();
      current = {
        stream: pendingStream,
        context: pendingContext,
        source: null,
        node: null,
        chunks: [],
        samples: 0,
        timer: null,
        meterUpdatedAt: performance.now(),
        meterEnergy: 0,
        meterSamples: 0,
      };
      capture.current = current;
      // Capture PCM without playing microphone audio through the speakers.
      const url = URL.createObjectURL(
        new Blob(
          [
            `
        class DiningRecorder extends AudioWorkletProcessor {
          process(inputs) {
            const channel = inputs[0]?.[0];
            if (channel) this.port.postMessage(channel.slice());
            return true;
          }
        }
        registerProcessor("dining-recorder", DiningRecorder);
      `,
          ],
          { type: "text/javascript" },
        ),
      );
      try {
        await current.context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (id !== attempt.current) return;
      const active = current;
      active.source = active.context.createMediaStreamSource(active.stream);
      active.node = new AudioWorkletNode(active.context, "dining-recorder");
      active.node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (capture.current !== active) return;
        const remaining = active.context.sampleRate * MAX_CONVERSATION_SECONDS - active.samples;
        if (remaining <= 0) {
          stopRef.current();
          return;
        }
        const chunk = event.data.slice(0, remaining);
        active.chunks.push(chunk);
        active.samples += chunk.length;
        for (const sample of chunk) active.meterEnergy += sample * sample;
        active.meterSamples += chunk.length;
        const now = performance.now();
        if (now - active.meterUpdatedAt >= 50) {
          const rms = Math.sqrt(active.meterEnergy / Math.max(1, active.meterSamples));
          // Real microphone energy, with a quiet baseline instead of simulated motion.
          const level = Math.min(1, Math.max(0, (rms - 0.003) * 10));
          setLevels((previous) => [...previous.slice(1), level]);
          active.meterUpdatedAt = now;
          active.meterEnergy = 0;
          active.meterSamples = 0;
        }
        if (active.samples >= active.context.sampleRate * MAX_CONVERSATION_SECONDS)
          stopRef.current();
      };
      active.source.connect(active.node);
      active.node.connect(active.context.destination);
      await active.context.resume();
      if (id !== attempt.current) return;
      const started = Date.now();
      active.timer = setInterval(() => {
        const elapsed = Math.min(MAX_CONVERSATION_SECONDS, (Date.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= MAX_CONVERSATION_SECONDS) stopRef.current();
      }, 100);
      active.stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (capture.current === active) stopRef.current();
        };
      });
      setPhase("recording");
    } catch (err) {
      if (current) release(current);
      else {
        pendingStream?.getTracks().forEach((t) => t.stop());
        void pendingContext?.close().catch(() => {});
      }
      if (capture.current === current) capture.current = null;
      if (id !== attempt.current) return;
      setPhase("idle");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow microphone access in your browser or enter preferences below."
          : "Couldn't start the microphone. Check that it is connected and try again.",
      );
    }
  }

  return (
    <div
      className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
    >
      <h3 className="font-extrabold">Let Gemini help you decide</h3>
      <p className="text-sm text-muted-foreground">
        Record up to a minute of your table's food discussion, then review what Gemini heard. Get
        three restaurant picks from the discussion or edit the preferences to share for this outing.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          disabled={!available || phase !== "idle"}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        Everyone being recorded agrees to send this audio to Google Gemini for analysis. The app
        doesn't save audio or a transcript.{" "}
        <a
          className="underline"
          href="https://ai.google.dev/gemini-api/terms"
          target="_blank"
          rel="noreferrer"
        >
          Google's processing terms
        </a>{" "}
        apply.
      </label>
      <div className="flex flex-wrap gap-2">
        {phase === "idle" && (
          <Button
            type="button"
            disabled={
              !available ||
              !consent ||
              cooldownSeconds > 0 ||
              cooldown.isPending ||
              cooldown.isError
            }
            onClick={() => void start()}
          >
            <Mic aria-hidden="true" className="mr-2 size-4" />
            {cooldownSeconds > 0
              ? `Record again in ${cooldownSeconds}s`
              : cooldown.isPending && available
                ? "Checking availability..."
                : "Help us decide"}
          </Button>
        )}
        {phase === "recording" && (
          <Button type="button" onClick={() => void stop()}>
            <Square aria-hidden="true" className="mr-2 size-4" /> Stop and review
          </Button>
        )}
        {phase !== "idle" && (
          <Button type="button" variant="outline" onClick={cancel}>
            <X aria-hidden="true" className="mr-2 size-4" />
            {phase === "analyzing" || phase === "suggesting" ? "Dismiss" : "Cancel"}
          </Button>
        )}
      </div>
      {phase === "idle" && cooldownSeconds > 0 && (
        <p className="text-sm text-muted-foreground">
          You can start another recording when the countdown finishes.
        </p>
      )}
      {phase === "idle" && available && cooldown.isError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn't check recording availability.{" "}
          <button type="button" className="underline" onClick={() => void cooldown.refetch()}>
            Try again
          </button>
        </p>
      )}
      {!available && (
        <p className="text-sm text-muted-foreground">
          Voice help isn't configured yet. You can still enter dining preferences below.
        </p>
      )}
      <p role="status" aria-live="polite" className="text-sm font-bold">
        {phase === "starting" && "Waiting for microphone access..."}
        {phase === "recording" && "Listening to your table..."}
        {phase === "analyzing" && "Microphone off. Gemini is finding dining preferences..."}
        {phase === "suggesting" && "Gemini is choosing three restaurants for your conversation..."}
      </p>
      {(phase === "recording" || seconds > 0) && (
        <div className="space-y-2 rounded-lg bg-background/80 p-3">
          <div
            role="img"
            aria-label="Microphone activity from your recording"
            className="flex h-10 items-center gap-1 overflow-hidden"
          >
            {levels.map((level, index) => (
              <span
                key={index}
                className="min-w-0 flex-1 rounded-full bg-primary transition-[height] duration-75 motion-reduce:transition-none"
                style={{ height: `${3 + level * 37}px` }}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <progress
              aria-label="Recording time"
              value={seconds}
              max={MAX_CONVERSATION_SECONDS}
              className="h-2 min-w-0 flex-1 accent-primary"
            />
            <span className="shrink-0 text-xs font-bold tabular-nums">
              {Math.floor(seconds)}s / {MAX_CONVERSATION_SECONDS}s
            </span>
          </div>
        </div>
      )}
      {phase === "analyzing" && (
        <p className="text-xs text-muted-foreground">
          Dismissing hides the result; audio already sent to Gemini may still be processed.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <div className="space-y-2 rounded-lg bg-background p-3">
          <h4 className="font-bold">Here's what Gemini heard</h4>
          <p className="text-sm">{result.summary}</p>
          <ul className="list-inside list-disc text-sm">
            {result.favoriteCuisines !== null && (
              <li>Favorites: {result.favoriteCuisines.join(", ") || "none"}</li>
            )}
            {result.dislikedCuisines !== null && (
              <li>Avoid: {result.dislikedCuisines.join(", ") || "none"}</li>
            )}
            {result.maxPrice !== null && <li>Maximum price: {"$".repeat(result.maxPrice)}</li>}
            {result.maxDistanceKm !== null && <li>Maximum distance: {result.maxDistanceKm} km</li>}
            {result.diets !== null && (
              <li>Required dietary options: {result.diets.join(", ") || "none"}</li>
            )}
            {result.novelty !== null && <li>Familiar or new: {result.novelty}</li>}
          </ul>
          <p className="text-xs text-muted-foreground">
            Check these carefully, especially dietary requirements. Undiscussed fields keep your
            current choices. Get restaurant picks directly, or review and share these preferences
            for the outing.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={phase !== "idle"}
              onClick={() => void getSuggestions(result)}
            >
              {phase === "suggesting" ? "Finding restaurants..." : "Use audio for suggestions"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={phase !== "idle"}
              onClick={() => {
                onReview(result);
                setResult(null);
              }}
            >
              Review in preference form
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={phase !== "idle"}
              onClick={() => {
                setResult(null);
                setPicks(null);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}
      {picks && (
        <section className="space-y-3" aria-label="Restaurants for your conversation">
          <h4 className="font-extrabold">Restaurants for your conversation</h4>
          <p className="text-sm">{picks.message}</p>
          <p className="text-xs text-muted-foreground">
            {picks.method === "gemini"
              ? "Picked by Gemini from your discussion."
              : "Using preference-based picks; Gemini selection was unavailable."}{" "}
            These picks are a private preview. Your group's votes still decide.
          </p>
          {picks.demo && (
            <p className="text-sm font-bold">
              Demo restaurants — these are examples, not live local listings.
            </p>
          )}
          <SuggestionCards
            suggestions={picks.suggestions}
            rewardRestaurants={rewardRestaurants}
            selectedIds={new Set(selectedPool.map((restaurant) => restaurant.id))}
            onAddToPool={onAddToPool}
            onViewRestaurant={onViewRestaurant}
          />
        </section>
      )}
    </div>
  );
}

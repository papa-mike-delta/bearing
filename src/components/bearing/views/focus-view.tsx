"use client";

import { colorWithAlpha } from "@/lib/product-colors";

import { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "../icon";
import { PageHeader, SectionCard } from "../layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/toast";
import { motion } from "framer-motion";

type Mode = "focus" | "short" | "long" | "custom";
const PRESETS: Record<Mode, { label: string; mins: number; color: string; icon: string }> = {
  focus: { label: "Deep Focus", mins: 25, color: "var(--priority-high)", icon: "Brain" },
  short: { label: "Short Break", mins: 5, color: "var(--success)", icon: "Coffee" },
  long: { label: "Long Break", mins: 15, color: "var(--info)", icon: "Leaf" },
  custom: { label: "Custom", mins: 20, color: "var(--type-journal)", icon: "Timer" },
};

// Play a pleasant chime using Web Audio API
function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 — a pleasant major chord arpeggio
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const start = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.5);
      osc.start(start);
      osc.stop(start + 1.5);
    });
  } catch {
    // Audio not available
  }
}

export type FocusCompletion = {clientId:string;occurredAt:string;minutes:number;itemId:string|null};
export function FocusTimer({tasks,habits,loading=false,onNewTask,onComplete,stats}:{
  tasks:{id:string;title:string}[];habits:{id:string;title:string}[];loading?:boolean;
  onNewTask():void;
  onComplete?(session:FocusCompletion):void;
  stats?:{sessions:number;minutes:number};
}) {
  const [mode, setMode] = useState<Mode>("focus");
  const [customMins, setCustomMins] = useState(20);
  const [duration, setDuration] = useState(PRESETS.focus.mins * 60);
  const [remaining, setRemaining] = useState(PRESETS.focus.mins * 60);
  const [running, setRunning] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedItemType, setSelectedItemType] = useState<"task" | "habit" | "">("");
  const [completedSessions, setCompletedSessions] = useState(0);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const sessionKey = useRef<string | null>(null);
  const completed = useRef(false);
  const deadline = useRef<number | null>(null);

  // load today's stats + sound pref from localStorage (once)
  if (!loaded) {
    setLoaded(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const stored = localStorage.getItem(`bearing-focus-${today}`);
      if (stored && !onComplete) {
        const { sessions, minutes } = JSON.parse(stored);
        setCompletedSessions(sessions || 0);
        setTodayMinutes(minutes || 0);
      }
      const soundPref = localStorage.getItem("bearing-focus-sound");
      if (soundPref !== null) setSoundEnabled(soundPref === "true");
    } catch {}
  }

  function persist(sessions: number, minutes: number) {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`bearing-focus-${today}`, JSON.stringify({ sessions, minutes }));
  }

  function toggleSound() {
    const v = !soundEnabled;
    setSoundEnabled(v);
    localStorage.setItem("bearing-focus-sound", String(v));
    if (v) playChime(); // test sound
  }

  const switchMode = useCallback((m: Mode) => {
    sessionKey.current=null;completed.current=false;deadline.current=null;
    setMode(m);
    const mins = m === "custom" ? customMins : PRESETS[m].mins;
    setDuration(mins * 60);
    setRemaining(mins * 60);
    setRunning(false);
  }, [customMins]);

  // apply custom duration
  function applyCustomMins(val: number) {
    const clamped = Math.max(1, Math.min(180, val));
    setCustomMins(clamped);
    if (mode === "custom") {
      sessionKey.current=null;completed.current=false;deadline.current=null;
      setDuration(clamped * 60);
      setRemaining(clamped * 60);
      setRunning(false);
    }
  }

  // Wall-clock deadline handles suspended/background tabs; completion is outside a state updater.
  useEffect(() => {
    if (!running) { deadline.current=null;return; }
    deadline.current=Date.now()+remaining*1000;
    if(!sessionKey.current) sessionKey.current=crypto.randomUUID();
    const timer=setInterval(()=>{
      const left=Math.max(0,Math.ceil((deadline.current!-Date.now())/1000));
      setRemaining(left);
      if(left>0 || completed.current)return;
      completed.current=true;setRunning(false);
      if(soundEnabled)playChime();
      if(mode==='focus'||mode==='custom'){
        const minutes=Math.round(duration/60);
        if(onComplete) onComplete({clientId:sessionKey.current!,occurredAt:new Date().toISOString(),minutes,itemId:selectedItemId || null});
        else {
          setCompletedSessions(completedSessions+1);setTodayMinutes(todayMinutes+minutes);
          persist(completedSessions+1,todayMinutes+minutes);
        }
        notify.success(`Focus complete! ${minutes} min`, 'Take a short break.');
      }else notify.success('Break over — back to focus!');
    },250);
    return ()=>clearInterval(timer);
    // A running session keeps its original selection, callback and deadline until paused/reset.
  },[running]);

  function selectItem(id: string, type: "task" | "habit") {
    if (id === "none") {
      setSelectedItemId("");
      setSelectedItemType("");
    } else {
      setSelectedItemId(id);
      setSelectedItemType(type);
    }
  }

  const totalSecs = duration;
  const progress = ((totalSecs - remaining) / totalSecs) * 100;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const preset = PRESETS[mode];
  const selectedItem = selectedItemType === "task"
    ? tasks.find((t) => t.id === selectedItemId)
    : selectedItemType === "habit"
      ? habits.find((h) => h.id === selectedItemId)
      : null;

  // ring math
  const R = 130;
  const C = 2 * Math.PI * R;
  const dash = C * (progress / 100);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Focus & Deep Work"
          subtitle="Protect your attention. Run a pomodoro, connect it to a habit, and watch your practice grow."
          icon="Brain"
          color="var(--priority-high)"
        />

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Timer skeleton */}
          <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
            {/* Mode tabs skeleton */}
            <div className="mb-6 flex justify-center gap-1 rounded-xl bg-muted p-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-8 w-20 skeleton rounded-lg bg-muted/60" />
              ))}
            </div>
            {/* Circular timer skeleton */}
            <div className="mx-auto flex h-[320px] w-[320px] items-center justify-center">
              <div className="h-40 w-40 skeleton rounded-full bg-muted/30" />
            </div>
            {/* Controls skeleton */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <div className="h-12 w-32 skeleton rounded-lg bg-muted/40" />
              <div className="h-12 w-12 skeleton rounded-lg bg-muted/30" />
            </div>
          </div>

          {/* Right column skeleton */}
          <div className="space-y-6">
            {/* Today stats skeleton */}
            <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
              <div className="mb-3 h-5 w-16 skeleton rounded bg-muted/40" />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-priority-high/10 p-4 text-center">
                  <div className="mx-auto h-8 w-8 skeleton rounded bg-muted/40" />
                  <div className="mx-auto mt-2 h-3 w-14 skeleton rounded bg-muted/30" />
                </div>
                <div className="rounded-xl bg-success/10 p-4 text-center">
                  <div className="mx-auto h-8 w-8 skeleton rounded bg-muted/40" />
                  <div className="mx-auto mt-2 h-3 w-14 skeleton rounded bg-muted/30" />
                </div>
              </div>
            </div>
            {/* Focus on skeleton */}
            <div className="rounded-2xl border border-border/60 bg-card/40 p-5">
              <div className="mb-3 h-5 w-20 skeleton rounded bg-muted/40" />
              <div className="space-y-3">
                <div className="h-9 w-full skeleton rounded-lg bg-muted/30" />
                <div className="h-9 w-full skeleton rounded-lg bg-muted/30" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Focus & Deep Work"
        subtitle="Protect your attention. Run a pomodoro, connect it to a habit, and watch your practice grow."
        icon="Brain"
        color="var(--priority-high)"
        actions={
          <Button variant="outline" size="sm" onClick={toggleSound} className="gap-1.5">
            <Icon name={soundEnabled ? "Volume2" : "VolumeX"} className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{soundEnabled ? "Sound on" : "Sound off"}</span>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Timer */}
        <SectionCard className="overflow-hidden">
          {/* mode tabs */}
          <div className="mb-6 flex flex-wrap justify-center gap-1 rounded-xl bg-muted p-1">
            {(Object.keys(PRESETS) as Mode[]).map((m) => (
              <button
                key={m}
                disabled={running} onClick={() => switchMode(m)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                  mode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                style={mode === m ? { color: PRESETS[m].color } : {}}
              >
                <Icon name={PRESETS[m].icon} className="h-3.5 w-3.5" />
                {PRESETS[m].label}
              </button>
            ))}
          </div>

          {/* Custom duration input */}
          {mode === "custom" && (
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
              <Input
                type="number"
                min={1}
                max={180}
                value={customMins}
                aria-label="Custom focus minutes" disabled={running}
                onChange={(e) => applyCustomMins(Number(e.target.value) || 1)}
                className="h-9 w-20 text-center text-lg font-bold"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
              {[10, 20, 30, 45, 60].map((m) => (
                <button
                  key={m}
                  disabled={running} onClick={() => applyCustomMins(m)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-all",
                    customMins === m ? "border-type-journal bg-type-journal/10 text-type-journal" : "border-border/60 text-muted-foreground hover:bg-muted",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* circular timer */}
          <div className="relative mx-auto flex aspect-square w-full max-w-[320px] items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 300 300">
              <circle cx="150" cy="150" r={R} fill="none" stroke="var(--muted)" strokeWidth="10" />
              <motion.circle
                cx="150"
                cy="150"
                r={R}
                fill="none"
                stroke={preset.color}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C - dash}
                animate={{ strokeDashoffset: C - dash }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                style={{ filter: `drop-shadow(0 0 8px ${colorWithAlpha(preset.color, 40)})` }}
              />
            </svg>
            <div className="z-10 flex flex-col items-center">
              <Icon name={preset.icon} className="mb-2 h-6 w-6" style={{ color: preset.color }} />
              <div className="font-mono text-6xl font-bold tabular-nums tracking-tight">
                {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
              </div>
              <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                {running ? "in progress" : remaining === 0 ? "complete" : "ready"}
              </div>
              {selectedItem && (
                <div className="mt-2 max-w-[200px] truncate text-xs font-medium" style={{ color: preset.color }}>
                  {selectedItemType === "habit" ? "Leaf " : "Circle "}{selectedItem.title}
                </div>
              )}
            </div>
          </div>

          {/* controls */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button
              size="lg"
              onClick={() => setRunning((r) => !r)}
              disabled={remaining === 0}
              className="h-12 gap-2 px-8 text-base"
              style={{ background: colorWithAlpha(running ? "var(--destructive)" : preset.color, 16), color: "var(--foreground)" }}
            >
              <Icon name={running ? "Pause" : "Play"} className="h-5 w-5" />
              {running ? "Pause" : remaining === 0 ? "Done" : "Start"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 w-12 p-0"
              onClick={() => { completed.current=false;sessionKey.current=null;deadline.current=null;setRunning(false); setRemaining(duration); }}
              title="Reset"
            >
              <Icon name="RotateCcw" className="h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-12 px-4"
              onClick={() => switchMode(mode)}
              title="Skip"
            >
              <Icon name="SkipForward" className="h-5 w-5" />
            </Button>
          </div>
        </SectionCard>

        {/* Right column */}
        <div className="space-y-6">
          {/* Today's stats */}
          <SectionCard title="Today" icon="Flame">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-priority-high/10 p-4 text-center">
                <div className="text-3xl font-bold text-priority-high">{stats?.sessions ?? completedSessions}</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">sessions</div>
              </div>
              <div className="rounded-xl bg-success/10 p-4 text-center">
                <div className="text-3xl font-bold text-success">{stats?.minutes ?? todayMinutes}</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">focus minutes</div>
              </div>
            </div>
            {completedSessions > 0 && (
              <div className="mt-3 flex justify-center gap-1.5">
                {Array.from({ length: Math.min(completedSessions, 8) }).map((_, i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="text-lg text-priority-high"
                  >
                    <Icon name="CircleDot" className="h-4 w-4" />
                  </motion.span>
                ))}
                {completedSessions > 8 && <span className="text-sm text-muted-foreground">+{completedSessions - 8}</span>}
              </div>
            )}
          </SectionCard>

          {/* Task / Habit selector */}
          <SectionCard title="Focus on" icon="Target">
            {tasks.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-priority-high">Tasks</p>
                <Select value={selectedItemType === "task" ? selectedItemId : "none"} disabled={running} onValueChange={(v) => selectItem(v, "task")}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pick a task…" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="none">No task</SelectItem>
                    {tasks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="line-clamp-1">{t.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {habits.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-success">Habits</p>
                <Select value={selectedItemType === "habit" ? selectedItemId : "none"} disabled={running} onValueChange={(v) => selectItem(v, "habit")}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pick a habit…" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="none">No habit</SelectItem>
                    {habits.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        <span className="line-clamp-1">Leaf {h.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={onNewTask}>
              <Icon name="Plus" className="h-3.5 w-3.5" /> New task
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              {onComplete ? "Completed focus sessions are saved as Activity. Task/Habit completion is a separate action." : selectedItemType === "habit"
                ? "When the timer ends, this habit will be automatically logged for today. 🌿"
                : "Pick a habit to auto-log it when the timer completes. Pick a task to anchor your focus."}
            </p>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const preferenceKey = 'ohyun-lobby-music-enabled';

/** The browser may require a gesture before it allows audible playback. */
export const LobbyMusic = forwardRef<{ pause: () => void }, { active: boolean }>(function LobbyMusic({ active }, ref) {
  const audio = useRef<HTMLAudioElement>(null);
  const activeRef = useRef(active);
  const enabledRef = useRef(true);
  const attemptRef = useRef(0);
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(preferenceKey) !== 'false'; } catch { return true; }
  });
  const [playing, setPlaying] = useState(false);
  activeRef.current = active;
  enabledRef.current = enabled;

  const pause = useCallback(() => {
    attemptRef.current++;
    audio.current?.pause();
    setPlaying(false);
  }, []);
  useImperativeHandle(ref, () => ({ pause }), [pause]);

  const play = useCallback(() => {
    const player = audio.current;
    if (!player || !activeRef.current || !enabledRef.current || document.hidden) return;
    const attempt = ++attemptRef.current;
    player.volume = 0.22;
    void player.play().then(() => {
      if (attempt !== attemptRef.current || !activeRef.current || !enabledRef.current || document.hidden) {
        // A newer play request may already own the player.
        if (!activeRef.current || !enabledRef.current || document.hidden) player.pause();
        return;
      }
      setPlaying(true);
    }).catch(() => {
      if (attempt === attemptRef.current) setPlaying(false);
    });
  }, []);

  useEffect(() => {
    if (active && enabled) play(); else pause();
    return pause;
  }, [active, enabled, pause, play]);

  useEffect(() => {
    if (!active || !enabled) return;
    const retry = () => { if (audio.current?.paused) play(); };
    const visibility = () => { if (document.hidden) pause(); else play(); };
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('keydown', retry, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('pointerdown', retry, true);
      document.removeEventListener('keydown', retry, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [active, enabled, pause, play]);

  const toggle = () => {
    if (enabled && !playing) { play(); return; }
    const next = !enabled;
    enabledRef.current = next;
    setEnabled(next);
    try { localStorage.setItem(preferenceKey, String(next)); } catch { /* Storage can be unavailable. */ }
    if (next) play(); else pause();
  };

  return <>
    <audio ref={audio} src={`${import.meta.env.BASE_URL}audio/lobby-bgm.mp3`} loop preload="auto" onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)}/>
    {active && <button data-hand className="lobby-music-button" type="button" onClick={toggle} aria-label={enabled && playing ? '배경음악 끄기' : '배경음악 켜기'} aria-pressed={enabled && playing}>
      {enabled && playing ? <Volume2 size={20}/> : <VolumeX size={20}/>}<span>{enabled && playing ? '배경음악 켜짐' : enabled ? '배경음악 시작' : '배경음악 꺼짐'}</span>
    </button>}
  </>;
});

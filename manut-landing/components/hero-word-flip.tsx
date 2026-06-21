'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

/** Nouns that read naturally in "cycles, and ___ in one hub." */
const HERO_WORDS = [
  'modules',
  'intake',
  'views',
  'pages',
  'handoffs',
  'activity',
] as const;

const FLIP_MS = 2_800;
const TRANSITION_MS = 320;

export function HeroWordFlip({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;

    let swapTimer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      setPhase('out');
      swapTimer = setTimeout(() => {
        setIndex(i => (i + 1) % HERO_WORDS.length);
        setPhase('in');
      }, TRANSITION_MS);
    };

    const interval = setInterval(tick, FLIP_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(swapTimer);
    };
  }, [reduceMotion]);

  const word = HERO_WORDS[index];

  return (
    <span
      className={cn('hero-word-flip inline align-baseline', className)}
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        key={reduceMotion ? 'static' : `${word}-${phase}`}
        className={cn(
          'hero-flip-word display-italic inline-block whitespace-nowrap',
          !reduceMotion && phase === 'out' && 'hero-word-flip-out',
          !reduceMotion && phase === 'in' && 'hero-word-flip-in'
        )}
      >
        {word}
      </span>
    </span>
  );
}

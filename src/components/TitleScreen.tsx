import React, { useState } from 'react';
import { Play, FolderOpen, Trash2, Plus, Compass, Sparkles } from 'lucide-react';
import { SaveSlotSummary } from '../game/types';

interface TitleScreenProps {
  slots: SaveSlotSummary[];
  onStartNew: (seedInput: string) => void;
  onContinueLatest: (slotId: string) => void;
  onLoadSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  slots,
  onStartNew,
  onContinueLatest,
  onLoadSlot,
  onDeleteSlot,
}) => {
  const [showSlots, setShowSlots] = useState(false);
  const [seedText, setSeedText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const latest = slots[0] ?? null;

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-12 pointer-events-none">
      {/* Top-Left Title Lockup over calm dark sky negative space */}
      <div className="max-w-xl pointer-events-auto">
        <svg
          viewBox="0 0 540 128"
          className="w-full max-w-[480px] h-auto drop-shadow-[0_4px_18px_rgba(0,0,0,0.85)]"
          aria-label="ABYSS: INFINITE FRONTIER"
        >
          {/* Bespoke Astrolabe Crest */}
          <g transform="translate(56, 64)">
            <circle cx="0" cy="0" r="42" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeOpacity="0.85" />
            <ellipse cx="0" cy="0" rx="52" ry="18" transform="rotate(-24)" fill="none" stroke="#facc15" strokeWidth="1.8" strokeOpacity="0.9" />
            <polygon points="0,-28 9,0 0,28 -9,0" fill="#e0f2fe" />
            <circle cx="0" cy="0" r="6" fill="#0ea5e9" stroke="#ffffff" strokeWidth="2" />
          </g>
          {/* Lockup Typography */}
          <text
            x="126"
            y="62"
            fill="#f8fafc"
            fontSize="44"
            fontWeight="800"
            letterSpacing="8"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            ABYSS
          </text>
          <line x1="128" y1="74" x2="495" y2="74" stroke="#38bdf8" strokeWidth="2" strokeOpacity="0.7" />
          <text
            x="128" y="98"
            fill="#7dd3fc"
            fontSize="16"
            fontWeight="600"
            letterSpacing="6.5"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            INFINITE FRONTIER
          </text>
        </svg>

        {/* Primary Menu Actions (<= 3 primary actions) */}
        <div className="mt-7 flex flex-col gap-3 max-w-xs">
          {latest ? (
            <button
              type="button"
              data-start="true"
              onClick={() => onContinueLatest(latest.slotId)}
              className="flex items-center justify-between px-5 py-3.5 bg-[#0f1c33]/90 hover:bg-[#162a4d] border border-sky-400/60 text-white font-semibold tracking-wider text-sm transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <Play className="w-4 h-4 text-sky-400 fill-sky-400" />
                CONTINUE UNIVERSE
              </span>
              <span className="text-xs text-sky-300 tabular-nums">{latest.planetName}</span>
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={() => onStartNew(seedText)}
              className="flex items-center justify-between px-5 py-3.5 bg-[#0f1c33]/90 hover:bg-[#162a4d] border border-sky-400/70 text-white font-semibold tracking-wider text-sm transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-sky-400" />
                LAUNCH EXPEDITION
              </span>
              <span className="text-xs text-sky-300">ENTER</span>
            </button>
          )}

          <div className="flex gap-2.5">
            <button
              type="button"
              data-start={!latest ? undefined : 'false'}
              onClick={() => onStartNew(seedText)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0a1222]/85 hover:bg-[#15223d] border border-slate-500/50 text-slate-100 text-xs font-semibold tracking-wider transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              NEW UNIVERSE
            </button>

            <button
              type="button"
              onClick={() => setShowSlots((v) => !v)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0a1222]/85 hover:bg-[#15223d] border border-slate-500/50 text-slate-200 text-xs font-semibold tracking-wider transition-colors cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
              SAVES ({slots.length})
            </button>
          </div>

          {showSlots && (
            <div className="mt-2 p-4 bg-[#070d1a]/95 border border-sky-500/40 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-slate-700/70 pb-2">
                <span className="text-xs font-bold tracking-widest text-sky-300 flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5" /> UNIVERSE ARCHIVES
                </span>
                <input
                  type="text"
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value)}
                  placeholder="Optional Seed..."
                  aria-label="Custom Universe Seed"
                  className="w-32 px-2 py-1 text-xs bg-slate-900 border border-slate-600 text-slate-100 focus:outline-none focus:border-sky-400"
                />
              </div>

              {slots.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">No saved universes found. Start a new expedition.</p>
              ) : (
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                  {slots.map((s) => (
                    <div
                      key={s.slotId}
                      className="flex items-center justify-between gap-2 p-2 bg-slate-900/90 border border-slate-700/70"
                    >
                      <button
                        type="button"
                        onClick={() => onLoadSlot(s.slotId)}
                        className="flex-1 text-left cursor-pointer hover:text-sky-300"
                      >
                        <div className="text-xs font-semibold text-white">{s.label}</div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {s.systemName} · {s.planetName} · {s.discoveriesCount} Disc.
                        </div>
                      </button>
                      {confirmDeleteId === s.slotId ? (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteSlot(s.slotId);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 text-[11px] bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Delete ${s.label}`}
                          onClick={() => setConfirmDeleteId(s.slotId)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Single flat control hint in bottom safe margin */}
      <div className="self-center px-4 py-1.5 bg-[#050914]/82 border border-slate-700/60 text-center text-xs tracking-widest uppercase text-slate-200">
        WASD Move · Space Jetpack / Launch · F Board / Exit Ship · V Scan · Click Mine / Fire · B Build · M Galaxy · Tab Systems
      </div>
    </div>
  );
};

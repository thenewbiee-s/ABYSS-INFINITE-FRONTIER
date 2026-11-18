import React from 'react';
import { Play, Save, RotateCcw, Home, Settings } from 'lucide-react';
import { SaveGameData } from '../game/types';

interface PauseModalProps {
  save: SaveGameData;
  onResume: () => void;
  onManualSave: () => void;
  onOpenSettings: () => void;
  onExitToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  save,
  onResume,
  onManualSave,
  onOpenSettings,
  onExitToTitle,
}) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#02050d]/75 p-4">
      <div className="w-full max-w-sm bg-[#070e1c] border border-sky-500/50 p-6 flex flex-col gap-4 shadow-2xl">
        <div className="border-b border-slate-700 pb-3">
          <h2 className="text-lg font-bold tracking-widest text-white">EXPEDITION PAUSED</h2>
          <div className="text-xs text-sky-300 mt-1 tabular-nums">
            {save.discoveries.length} Discoveries · {save.credits.toLocaleString()} CR
          </div>
        </div>

        <button
          type="button"
          onClick={onResume}
          className="flex items-center justify-center gap-2 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold tracking-wider cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" /> RESUME FLIGHT / EVA
        </button>

        <button
          type="button"
          onClick={onManualSave}
          className="flex items-center justify-center gap-2 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold tracking-wider cursor-pointer"
        >
          <Save className="w-4 h-4" /> SAVE UNIVERSE
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex items-center justify-center gap-2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold tracking-wider cursor-pointer"
        >
          <Settings className="w-4 h-4" /> SETTINGS & ARCHIVE
        </button>

        <button
          type="button"
          onClick={onExitToTitle}
          className="flex items-center justify-center gap-2 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold tracking-wider cursor-pointer"
        >
          <Home className="w-4 h-4" /> RETURN TO TITLE
        </button>
      </div>
    </div>
  );
};

interface GameOverModalProps {
  reason: string;
  save: SaveGameData;
  onRespawn: () => void;
  onExitToTitle: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  reason,
  save,
  onRespawn,
  onExitToTitle,
}) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0a0205]/80 p-4">
      <div className="w-full max-w-md bg-[#0f0810] border border-rose-500/60 p-6 flex flex-col gap-4 shadow-2xl">
        <div>
          <div className="text-xs font-bold tracking-widest text-rose-400">EMERGENCY CLONE RECONSTRUCTION</div>
          <h2 className="text-2xl font-extrabold text-white mt-1">SIGNAL LOST</h2>
          <p className="text-xs text-slate-300 mt-1.5">{reason}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-400">DISCOVERIES</div>
            <div className="text-base font-bold text-white tabular-nums">{save.discoveries.length}</div>
          </div>
          <div className="p-2.5 bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-400">CREDITS</div>
            <div className="text-base font-bold text-amber-300 tabular-nums">{save.credits}</div>
          </div>
          <div className="p-2.5 bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-400">MODULES</div>
            <div className="text-base font-bold text-sky-300 tabular-nums">{save.structures.length}</div>
          </div>
        </div>

        <button
          type="button"
          data-start="true"
          onClick={onRespawn}
          className="flex items-center justify-center gap-2 py-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold tracking-wider cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" /> RECONSTRUCT AT STARTER BEACON
        </button>

        <button
          type="button"
          onClick={onExitToTitle}
          className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold tracking-wider cursor-pointer"
        >
          RETURN TO TITLE
        </button>
      </div>
    </div>
  );
};

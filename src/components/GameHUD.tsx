import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Pause, Globe2, Backpack, Hammer } from 'lucide-react';
import { BASE_PART_LIST, BASE_PARTS, ITEMS } from '../game/catalog';
import { countItem } from '../game/rules';
import { BasePartId, HudTelemetry, SaveGameData, SystemsTab } from '../game/types';

interface GameHUDProps {
  save: SaveGameData;
  telemetry: HudTelemetry;
  onUseHotbar: (idx: number) => void;
  onSelectBuildPart: (partId: BasePartId) => void;
  onOpenSystems: (tab: SystemsTab) => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onTouchMove: (x: number, y: number) => void;
  onTouchLook: (dx: number, dy: number) => void;
  onTouchAction: (action: 'jump' | 'mine' | 'scan' | 'boost' | 'board' | 'build', active: boolean) => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  save,
  telemetry,
  onUseHotbar,
  onSelectBuildPart,
  onOpenSystems,
  onToggleMute,
  onTogglePause,
  onTouchMove,
  onTouchLook,
  onTouchAction,
}) => {
  const inShip = telemetry.playMode === 'in_ship';
  const buildMode = telemetry.playMode === 'build_mode';
  const { survival, ship } = save;

  const healthPips = 5;
  const filledPips = Math.ceil((survival.health / survival.maxHealth) * healthPips);

  const [isTouchViewport, setIsTouchViewport] = useState(() =>
    typeof window !== 'undefined'
      ? navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)')?.matches || window.innerWidth < 768
      : false
  );

  useEffect(() => {
    const onResize = () => {
      setIsTouchViewport(
        navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)')?.matches || window.innerWidth < 768
      );
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const showTouchControls =
    save.settings.touchControls === 'on'
      ? true
      : save.settings.touchControls === 'off'
        ? false
        : isTouchViewport;

  // Virtual Joystick state (left thumb)
  const joyRef = useRef<HTMLDivElement | null>(null);
  const joyPointerId = useRef<number | null>(null);
  const [joyKnob, setJoyKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Touch Look Pad state (right-half drag)
  const lookPointerId = useRef<number | null>(null);
  const lookLastPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const updateJoystickFromEvent = (clientX: number, clientY: number) => {
    const el = joyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.4;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR && dist > 0) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setJoyKnob({ x: dx, y: dy });
    onTouchMove(dx / maxR, -dy / maxR);
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 md:p-5">
      {/* Right-half Touch Look Pad (active on mobile/touch mode, sits underneath HUD buttons) */}
      {showTouchControls && (
        <div
          aria-label="Touch Camera Look Area"
          className="fixed top-20 bottom-24 right-0 left-1/2 pointer-events-auto touch-none"
          onPointerDown={(e) => {
            if (lookPointerId.current !== null) return;
            lookPointerId.current = e.pointerId;
            lookLastPos.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (lookPointerId.current !== e.pointerId) return;
            const dx = e.clientX - lookLastPos.current.x;
            const dy = e.clientY - lookLastPos.current.y;
            lookLastPos.current = { x: e.clientX, y: e.clientY };
            onTouchLook(dx, dy);
          }}
          onPointerUp={(e) => {
            if (lookPointerId.current === e.pointerId) lookPointerId.current = null;
          }}
          onPointerCancel={(e) => {
            if (lookPointerId.current === e.pointerId) lookPointerId.current = null;
          }}
        />
      )}

      {/* Top Perimeter Row */}
      <div className="relative z-10 flex items-start justify-between gap-1.5 sm:gap-4">
        {/* Top-Left Survival / Starship Telemetry Cluster */}
        <div
          className="bg-[#070d1a]/82 border-l-2 border-sky-400 px-2 sm:px-3.5 py-1.5 sm:py-2.5 w-[132px] sm:w-[240px] shrink-0"
          style={{ clipPath: 'polygon(0 0, 100% 0, 96% 100%, 0 100%)' }}
        >
          {!inShip ? (
            <div className="flex flex-col gap-1 sm:gap-1.5">
              {/* Custom SVG Vitality Sockets */}
              <div className="flex items-center justify-between gap-1.5 sm:gap-3">
                <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-sky-300 uppercase">
                  SUIT
                </span>
                <div className="flex items-center gap-0.5 sm:gap-1">
                  {Array.from({ length: healthPips }).map((_, idx) => {
                    const active = idx < filledPips;
                    return (
                      <svg key={idx} viewBox="0 0 16 14" className="w-2.5 h-2.5 sm:w-3.5 sm:h-3">
                        <polygon
                          points="3,1 13,1 15,7 13,13 3,13 1,7"
                          fill={active ? '#34d399' : '#1e293b'}
                          stroke="#020617"
                          strokeWidth="1.5"
                        />
                      </svg>
                    );
                  })}
                  <span className="ml-0.5 sm:ml-1 text-[11px] sm:text-sm font-bold text-white tabular-nums">
                    {Math.round(survival.health)}
                  </span>
                </div>
              </div>

              {/* O2, Hazard, Jetpack Bars */}
              <MeterRow label="O2" value={survival.oxygen} max={survival.maxOxygen} color="#38bdf8" />
              <MeterRow label="HAZ" value={survival.hazardShield} max={survival.maxHazardShield} color="#facc15" />
              <MeterRow label="JET" value={survival.jetpack} max={survival.maxJetpack} color="#fb923c" />
            </div>
          ) : (
            <div className="flex flex-col gap-1 sm:gap-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-amber-300 uppercase truncate max-w-[78px] sm:max-w-[130px]">
                  {ship.name}
                </span>
                <span className="text-[11px] sm:text-sm font-bold text-white tabular-nums">
                  {telemetry.speed} <span className="text-[9px] sm:text-[10px] text-slate-400">u/s</span>
                </span>
              </div>
              <MeterRow label="SHD" value={ship.shield} max={ship.maxShield} color="#38bdf8" />
              <MeterRow label="HUL" value={ship.hull} max={ship.maxHull} color="#34d399" />
              <MeterRow label="THR" value={ship.launchFuel} max={100} color="#fb923c" />
              <MeterRow label="WRP" value={ship.warpFuel} max={100} color="#c084fc" />
            </div>
          )}
        </div>

        {/* Top-Center Compass & Active Environment Readout */}
        <div className="hidden sm:flex sm:absolute sm:left-1/2 sm:-translate-x-1/2 sm:top-0 flex-col items-center gap-0.5 px-4 py-1.5 bg-[#070d1a]/84 border-b border-sky-400/60 whitespace-nowrap">
          <div className="flex items-center gap-3 text-xs">
            <span className="font-bold text-sky-300 tabular-nums">{telemetry.compassHeadingDeg}°</span>
            <span className="text-white font-semibold tracking-wide">
              {telemetry.inAtmosphere ? telemetry.nearestPlanetName : 'DEEP SPACE'}
            </span>
            <span className="text-slate-300 tabular-nums">
              ALT {telemetry.altitude}m
            </span>
          </div>
          {telemetry.inAtmosphere && (
            <div className="text-[11px] text-slate-200 tracking-wider flex items-center gap-2">
              <span>{telemetry.nearestPlanetType}</span>
              <span>·</span>
              <span className="tabular-nums">{telemetry.nearestPlanetTemp}°C</span>
              <span>·</span>
              <span className="tabular-nums">{telemetry.nearestPlanetGravity}g</span>
              <span>·</span>
              <span className={telemetry.nearestPlanetHazard !== 'none' ? 'text-amber-300 font-semibold' : 'text-emerald-300'}>
                {telemetry.nearestPlanetWeather}
              </span>
            </div>
          )}
        </div>

        {/* Compact Mobile Center Readout */}
        <div className="flex sm:hidden flex-col items-center px-1.5 py-1 bg-[#070d1a]/84 border-b border-sky-400/60 text-[9px] min-w-0">
          <span className="text-white font-semibold truncate max-w-[74px]">
            {telemetry.inAtmosphere ? telemetry.nearestPlanetName : 'SPACE'}
          </span>
          <span className="text-sky-300 tabular-nums">ALT {telemetry.altitude}m</span>
        </div>

        {/* Top-Right Compact Utility Controls + Credits */}
        <div className="flex items-center gap-1 sm:gap-2 pointer-events-auto shrink-0">
          <div className="hidden sm:block px-3 py-1.5 bg-[#070d1a]/82 border border-slate-700/80 text-xs font-bold text-amber-300 tabular-nums min-w-[84px] text-right">
            {save.credits.toLocaleString()} CR
          </div>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Open Systems Menu"
            title="Systems [Tab]"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenSystems('inventory');
            }}
            className="p-1.5 sm:p-2 bg-[#070d1a]/85 hover:bg-slate-800 border border-slate-600/70 text-sky-300 cursor-pointer"
          >
            <Backpack className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Open Galaxy Map"
            title="Galaxy Map [M]"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenSystems('galaxy');
            }}
            className="p-1.5 sm:p-2 bg-[#070d1a]/85 hover:bg-slate-800 border border-slate-600/70 text-purple-300 cursor-pointer"
          >
            <Globe2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={save.settings.muted ? 'Unmute Audio' : 'Mute Audio'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="p-1.5 sm:p-2 bg-[#070d1a]/85 hover:bg-slate-800 border border-slate-600/70 text-slate-200 cursor-pointer"
          >
            {save.settings.muted ? <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause Game"
            title="Pause [Esc]"
            onClick={(e) => {
              e.currentTarget.blur();
              onTogglePause();
            }}
            className="p-1.5 sm:p-2 bg-[#070d1a]/85 hover:bg-slate-800 border border-slate-600/70 text-slate-200 cursor-pointer"
          >
            <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      {/* Exact Center Reticle & Contextual Prompts (pointer-events: none) */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none">
        <svg viewBox="0 0 32 32" className="w-7 h-7 opacity-85">
          <circle cx="16" cy="16" r="2" fill="#38bdf8" />
          <path d="M16 4 L16 9 M16 23 L16 28 M4 16 L9 16 M23 16 L28 16" stroke="#e2e8f0" strokeWidth="1.5" strokeOpacity="0.7" />
        </svg>

        {telemetry.scanTargetProgress > 0 && (
          <div className="mt-3 px-3 py-1 bg-[#070d1a]/90 border border-sky-400 text-xs text-sky-200 tabular-nums">
            SCANNING {Math.round(telemetry.scanTargetProgress * 100)}%
          </div>
        )}

        {telemetry.miningTargetName && (
          <div className="mt-3 w-44 bg-[#070d1a]/90 border border-amber-400/70 p-1.5">
            <div className="text-[10px] text-amber-200 font-semibold truncate">{telemetry.miningTargetName}</div>
            <div className="h-1.5 bg-slate-800 mt-1">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${Math.round(telemetry.miningTargetHpRatio * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile Virtual Joystick (Bottom-Left) + Touch Action Cluster (Bottom-Right) */}
      {showTouchControls && (
        <>
          {/* Left Virtual Thumbstick */}
          <div
            ref={joyRef}
            aria-label="Virtual Movement Joystick"
            className="pointer-events-auto touch-none fixed bottom-[76px] left-3 z-20 w-24 h-24 rounded-full bg-[#070d1a]/70 border-2 border-sky-400/50 flex items-center justify-center"
            onPointerDown={(e) => {
              if (joyPointerId.current !== null) return;
              joyPointerId.current = e.pointerId;
              e.currentTarget.setPointerCapture(e.pointerId);
              updateJoystickFromEvent(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (joyPointerId.current === e.pointerId) {
                updateJoystickFromEvent(e.clientX, e.clientY);
              }
            }}
            onPointerUp={(e) => {
              if (joyPointerId.current === e.pointerId) {
                joyPointerId.current = null;
                setJoyKnob({ x: 0, y: 0 });
                onTouchMove(0, 0);
              }
            }}
            onPointerCancel={(e) => {
              if (joyPointerId.current === e.pointerId) {
                joyPointerId.current = null;
                setJoyKnob({ x: 0, y: 0 });
                onTouchMove(0, 0);
              }
            }}
          >
            <div
              className="w-9 h-9 rounded-full bg-sky-400/80 border border-white/70"
              style={{ transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)` }}
            />
          </div>

          {/* Right Action Buttons */}
          <div className="pointer-events-auto touch-none fixed bottom-[76px] right-3 z-20 grid grid-cols-2 gap-1.5">
            {(telemetry.nearShip || inShip) && (
              <button
                type="button"
                aria-label={inShip ? 'Exit Spacecraft' : 'Board Spacecraft'}
                onPointerDown={() => onTouchAction('board', true)}
                className="px-2.5 py-2 rounded bg-emerald-600/85 active:bg-emerald-500 border border-emerald-300/70 text-[10px] font-bold text-white touch-none"
              >
                {inShip ? 'EXIT' : 'BOARD'}
              </button>
            )}
            {!inShip && (
              <button
                type="button"
                aria-label="Toggle Build Mode"
                onPointerDown={() => onTouchAction('build', true)}
                className={`px-2.5 py-2 rounded border text-[10px] font-bold text-white touch-none ${
                  buildMode ? 'bg-amber-600/90 border-amber-300' : 'bg-slate-800/85 border-slate-500'
                }`}
              >
                BUILD
              </button>
            )}
            <button
              type="button"
              aria-label="Scan"
              onPointerDown={() => onTouchAction('scan', true)}
              onPointerUp={() => onTouchAction('scan', false)}
              onPointerCancel={() => onTouchAction('scan', false)}
              className="px-2.5 py-2 rounded bg-sky-700/85 active:bg-sky-500 border border-sky-300/60 text-[10px] font-bold text-white touch-none"
            >
              SCAN
            </button>
            <button
              type="button"
              aria-label={inShip ? 'Boost' : 'Sprint'}
              onPointerDown={() => onTouchAction('boost', true)}
              onPointerUp={() => onTouchAction('boost', false)}
              onPointerCancel={() => onTouchAction('boost', false)}
              className="px-2.5 py-2 rounded bg-purple-700/85 active:bg-purple-500 border border-purple-300/60 text-[10px] font-bold text-white touch-none"
            >
              {inShip ? 'BOOST' : 'SPRINT'}
            </button>
            <button
              type="button"
              aria-label={inShip ? 'Fire Cannons' : buildMode ? 'Place Module' : 'Mine Tool'}
              onPointerDown={() => onTouchAction('mine', true)}
              onPointerUp={() => onTouchAction('mine', false)}
              onPointerCancel={() => onTouchAction('mine', false)}
              className="px-2.5 py-2.5 rounded bg-amber-600/90 active:bg-amber-500 border border-amber-300/70 text-[10px] font-bold text-white touch-none"
            >
              {inShip ? 'FIRE' : buildMode ? 'PLACE' : 'MINE'}
            </button>
            <button
              type="button"
              aria-label={inShip ? 'Thrust / Launch' : 'Jump / Jetpack'}
              onPointerDown={() => onTouchAction('jump', true)}
              onPointerUp={() => onTouchAction('jump', false)}
              onPointerCancel={() => onTouchAction('jump', false)}
              className="px-2.5 py-2.5 rounded bg-sky-500/90 active:bg-sky-400 border border-white/60 text-[10px] font-bold text-slate-950 touch-none"
            >
              {inShip ? 'LAUNCH' : 'JET'}
            </button>
          </div>
        </>
      )}

      {/* Bottom Status Alerts + Hotbar / Build Dock */}
      <div className="relative z-10 flex flex-col items-center gap-1.5 sm:gap-2.5">
        {telemetry.alertMessage && (
          <div
            className={`px-3 sm:px-4 py-1 sm:py-1.5 bg-[#0a162b]/92 border border-sky-400/70 text-[10px] sm:text-xs font-semibold tracking-wider text-sky-100 text-center max-w-[92vw] ${
              showTouchControls ? 'fixed top-28 left-1/2 -translate-x-1/2 z-10 pointer-events-none' : ''
            }`}
          >
            {telemetry.alertMessage}
          </div>
        )}

        {!showTouchControls && telemetry.nearShip && !inShip && (
          <div className="px-3.5 py-1 bg-[#091526]/90 border border-emerald-400/70 text-xs font-semibold text-emerald-200">
            PRESS [F] TO BOARD SPACECRAFT
          </div>
        )}

        {telemetry.canAutoLand && (
          <div
            className={`px-3.5 py-1 bg-[#091526]/90 border border-sky-400 text-[10px] sm:text-xs font-semibold text-sky-200 text-center max-w-[92vw] ${
              showTouchControls ? 'fixed top-36 left-1/2 -translate-x-1/2 z-10 pointer-events-none' : ''
            }`}
          >
            {showTouchControls ? 'LANDING ZONE READY — RELEASE THRUST TO PARK' : 'LANDING ZONE READY — PRESS [L] OR RELEASE THRUST TO PARK'}
          </div>
        )}

        {(telemetry.nearStation || telemetry.nearOutpost) && (
          <button
            type="button"
            onClick={() => onOpenSystems('missions')}
            className="pointer-events-auto px-4 py-1.5 bg-amber-500/90 hover:bg-amber-400 text-slate-950 text-xs font-bold tracking-wider cursor-pointer"
          >
            OPEN FACTION TRADING & MISSIONS TERMINAL
          </button>
        )}

        {buildMode ? (
          <div className="pointer-events-auto bg-[#070d1a]/92 border border-sky-500/50 px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2 max-w-[95vw] overflow-x-auto">
            <span className="hidden sm:flex text-[10px] font-bold text-sky-300 tracking-widest px-2 items-center gap-1">
              <Hammer className="w-3.5 h-3.5" /> BUILD [R] ROTATE · CLICK PLACE
            </span>
            {BASE_PART_LIST.slice(0, 8).map((part) => {
              const selected = telemetry.selectedBuildPart === part.id;
              return (
                <button
                  key={part.id}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectBuildPart(part.id);
                  }}
                  className={`px-2 sm:px-2.5 py-1 sm:py-1.5 text-[10px] sm:text-[11px] font-semibold border cursor-pointer shrink-0 ${
                    selected
                      ? 'bg-sky-500/30 border-sky-400 text-white'
                      : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {part.name}
                </button>
              );
            })}
            <span className="text-[11px] text-emerald-300 tabular-nums pl-2 shrink-0">
              {BASE_PARTS[telemetry.selectedBuildPart]?.powerDelta >= 0 ? '+' : ''}
              {BASE_PARTS[telemetry.selectedBuildPart]?.powerDelta}kW
            </span>
          </div>
        ) : (
          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 bg-[#070d1a]/88 border border-slate-700/80 px-2 sm:px-2.5 py-1 sm:py-1.5 max-w-[96vw] overflow-x-auto">
            {save.hotbarItemIds.map((itemId, idx) => {
              const def = itemId ? ITEMS[itemId] : null;
              const qty = itemId ? countItem(save.playerInventory, itemId) : 0;
              return (
                <button
                  key={idx}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onUseHotbar(idx);
                  }}
                  title={def ? `${def.name} (${qty}) — Click or press ${idx + 1} to use` : `Slot ${idx + 1}`}
                  className={`px-2 sm:px-2.5 py-1 border text-left min-w-[60px] sm:min-w-[82px] cursor-pointer transition-colors shrink-0 ${
                    qty > 0
                      ? 'bg-slate-900/90 border-slate-600 hover:border-sky-400'
                      : 'bg-slate-950/70 border-slate-800 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-slate-400">
                    <span>[{idx + 1}]</span>
                    <span className="tabular-nums font-bold text-sky-300">{qty}</span>
                  </div>
                  <div className="text-[10px] sm:text-[11px] font-semibold text-slate-100 truncate">
                    {def ? def.name.split(' ')[0] : 'Empty'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const MeterRow: React.FC<{ label: string; value: number; max: number; color: string }> = ({
  label,
  value,
  max,
  color,
}) => {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <span className="w-6 sm:w-7 text-[9px] sm:text-[10px] font-bold text-slate-300">{label}</span>
      <div className="flex-1 h-1.5 sm:h-2 bg-slate-900 border border-slate-700/80 overflow-hidden">
        <div className="h-full transition-all duration-150" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-6 sm:w-7 text-right text-[10px] sm:text-[11px] font-bold text-slate-100 tabular-nums">
        {Math.round(value)}
      </span>
    </div>
  );
};

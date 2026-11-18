import React, { useMemo, useState } from 'react';
import {
  X,
  Backpack,
  Wrench,
  Globe2,
  BookOpen,
  Award,
  Hammer,
  Rocket,
  Settings as SettingsIcon,
  ArrowRightLeft,
  ArrowUpDown,
  Save,
  Trash2,
} from 'lucide-react';
import {
  BASE_PART_LIST,
  FACTIONS,
  ITEM_LIST,
  ITEMS,
  RECIPES,
  SHIP_CLASS_LIST,
  SHIP_CLASSES,
} from '../game/catalog';
import {
  canCraftRecipe,
  canWarpToSystem,
  computeBasePowerGrid,
  countItem,
} from '../game/rules';
import {
  BasePartId,
  GraphicsSettings,
  InventorySlot,
  SaveGameData,
  ShipClassId,
  StarSystem,
  SystemsTab,
} from '../game/types';
import { generateNearbyGalaxySystems } from '../game/universe';

interface SystemsModalProps {
  activeTab: SystemsTab;
  onChangeTab: (t: SystemsTab) => void;
  onClose: () => void;
  save: SaveGameData;
  currentSystem: StarSystem;
  onUseItem: (itemId: string) => void;
  onTransferItem: (from: 'player' | 'ship' | 'base', to: 'player' | 'ship' | 'base', idx: number) => void;
  onSortInventory: (target: 'player' | 'ship' | 'base') => void;
  onCraft: (recipeId: string) => void;
  onWarpToSystem: (coords: { x: number; y: number; z: number; index: number }, fuelCost: number) => void;
  onClaimMission: (missionId: string) => void;
  onTradeItem: (action: 'buy' | 'sell', itemId: string) => void;
  onSelectBuildPart: (partId: BasePartId) => void;
  onSelectOrBuyShip: (classId: ShipClassId) => void;
  onUpgradeSystem: (kind: 'thruster' | 'shield' | 'weapon' | 'hyperdrive' | 'mining' | 'scanner' | 'jetpack') => void;
  onCustomizeColors: (patch: { suitColor?: string; visorColor?: string; shipPrimary?: string; shipAccent?: string }) => void;
  onUpdateSettings: (settings: GraphicsSettings) => void;
  onManualSave: () => void;
}

export const SystemsModal: React.FC<SystemsModalProps> = ({
  activeTab,
  onChangeTab,
  onClose,
  save,
  currentSystem,
  onUseItem,
  onTransferItem,
  onSortInventory,
  onCraft,
  onWarpToSystem,
  onClaimMission,
  onTradeItem,
  onSelectBuildPart,
  onSelectOrBuyShip,
  onUpgradeSystem,
  onCustomizeColors,
  onUpdateSettings,
  onManualSave,
}) => {
  const [invSearch, setInvSearch] = useState('');
  const [invStorageView, setInvStorageView] = useState<'ship' | 'base'>('ship');
  const [galaxyFocus, setGalaxyFocus] = useState<{ x: number; y: number; z: number }>(save.currentSystemCoords);
  const [selectedSysId, setSelectedSysId] = useState<string>(currentSystem.id);

  const nearbySystems = useMemo(
    () => generateNearbyGalaxySystems(save.universeSeed, galaxyFocus, 3),
    [save.universeSeed, galaxyFocus]
  );
  const selectedSysObj = nearbySystems.find((s) => s.system.id === selectedSysId) || nearbySystems[0];

  const powerGrid = useMemo(
    () => computeBasePowerGrid(save.structures, save.currentPlanetId),
    [save.structures, save.currentPlanetId]
  );

  const tabs: { id: SystemsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'inventory', label: 'Cargo', icon: <Backpack className="w-3.5 h-3.5" /> },
    { id: 'crafting', label: 'Craft', icon: <Wrench className="w-3.5 h-3.5" /> },
    { id: 'galaxy', label: 'Galaxy', icon: <Globe2 className="w-3.5 h-3.5" /> },
    { id: 'discoveries', label: 'Journal', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'missions', label: 'Missions & Trade', icon: <Award className="w-3.5 h-3.5" /> },
    { id: 'building', label: 'Base', icon: <Hammer className="w-3.5 h-3.5" /> },
    { id: 'ship', label: 'Ship & Suit', icon: <Rocket className="w-3.5 h-3.5" /> },
    { id: 'settings', label: 'System', icon: <SettingsIcon className="w-3.5 h-3.5" /> },
  ];

  const renderSlotGrid = (
    slots: (InventorySlot | null)[],
    owner: 'player' | 'ship' | 'base',
    transferTarget: 'player' | 'ship' | 'base'
  ) => (
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
      {slots.map((slot, idx) => {
        const def = slot ? ITEMS[slot.itemId] : null;
        if (invSearch && def && !def.name.toLowerCase().includes(invSearch.toLowerCase())) {
          return <div key={idx} className="h-16 bg-slate-950/50 border border-slate-800/60 opacity-30" />;
        }
        return (
          <div
            key={idx}
            className="h-16 p-1.5 bg-slate-900/90 border border-slate-700/80 flex flex-col justify-between text-left"
          >
            {slot && def ? (
              <>
                <div className="flex items-center justify-between gap-1">
                  <span className="w-2.5 h-2.5 inline-block shrink-0" style={{ backgroundColor: def.color }} />
                  <span className="text-[11px] font-bold text-sky-300 tabular-nums">{slot.quantity}</span>
                </div>
                <div className="text-[10px] font-semibold text-slate-100 truncate" title={def.description}>
                  {def.name}
                </div>
                <div className="flex gap-1">
                  {def.usableEffect && owner === 'player' && (
                    <button
                      type="button"
                      onClick={() => onUseItem(def.id)}
                      className="flex-1 text-[9px] bg-sky-600/80 hover:bg-sky-500 text-white py-0.5 cursor-pointer"
                    >
                      Use
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Transfer ${def.name}`}
                    onClick={() => onTransferItem(owner, transferTarget, idx)}
                    className="px-1 text-[9px] bg-slate-700 hover:bg-slate-600 text-slate-200 py-0.5 cursor-pointer"
                    title={`Transfer to ${transferTarget}`}
                  >
                    <ArrowRightLeft className="w-2.5 h-2.5 inline" />
                  </button>
                </div>
              </>
            ) : (
              <span className="text-[10px] text-slate-600 m-auto">EMPTY</span>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#02050d]/75">
      <div className="w-full max-w-5xl max-h-[88vh] bg-[#070e1c] border border-sky-500/50 flex flex-col shadow-2xl">
        {/* Top Tab Navigation */}
        <div className="flex items-center justify-between border-b border-slate-700/80 px-4 py-2.5 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onChangeTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold tracking-wide border cursor-pointer transition-colors ${
                  activeTab === t.id
                    ? 'bg-sky-500/25 border-sky-400 text-white'
                    : 'bg-slate-900/80 border-slate-700/70 text-slate-300 hover:text-white'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-amber-300 tabular-nums">
              {save.credits.toLocaleString()} CR
            </span>
            <button
              type="button"
              aria-label="Close Systems Menu"
              onClick={onClose}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'inventory' && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <input
                  type="text"
                  value={invSearch}
                  onChange={(e) => setInvSearch(e.target.value)}
                  placeholder="Filter items..."
                  aria-label="Filter inventory items"
                  className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 text-slate-100 w-56"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSortInventory('player')}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 cursor-pointer"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" /> Sort Suit
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvStorageView(invStorageView === 'ship' ? 'base' : 'ship')}
                    className="px-3 py-1.5 text-xs bg-sky-900/60 border border-sky-500/50 text-sky-200 cursor-pointer"
                  >
                    Target: {invStorageView === 'ship' ? 'Starship Cargo' : 'Base Vault'}
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-xs font-bold tracking-widest text-sky-300 mb-2">EXOSUIT INVENTORY</h3>
                  {renderSlotGrid(save.playerInventory, 'player', invStorageView)}
                </div>
                <div>
                  <h3 className="text-xs font-bold tracking-widest text-amber-300 mb-2">
                    {invStorageView === 'ship' ? 'STARSHIP CARGO HOLD' : 'PERSISTENT BASE VAULT'}
                  </h3>
                  {renderSlotGrid(
                    invStorageView === 'ship' ? save.shipInventory : save.baseStorage,
                    invStorageView,
                    'player'
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'crafting' && (
            <div className="grid sm:grid-cols-2 gap-3">
              {RECIPES.map((r) => {
                const outDef = ITEMS[r.outputId];
                const craftable = canCraftRecipe(save.playerInventory, r.id);
                return (
                  <div
                    key={r.id}
                    className="p-3.5 bg-slate-900/90 border border-slate-700 flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">
                          {outDef?.name} ×{r.outputQty}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-slate-800 text-sky-300">
                          {r.station}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{r.description}</p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {r.ingredients.map((ing) => {
                          const have = countItem(save.playerInventory, ing.itemId);
                          const ok = have >= ing.quantity;
                          return (
                            <span
                              key={ing.itemId}
                              className={`text-[11px] px-2 py-0.5 border tabular-nums ${
                                ok ? 'border-emerald-500/40 text-emerald-300' : 'border-rose-500/40 text-rose-300'
                              }`}
                            >
                              {ITEMS[ing.itemId]?.name}: {have}/{ing.quantity}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!craftable}
                      onClick={() => onCraft(r.id)}
                      className={`py-1.5 text-xs font-bold tracking-wider cursor-pointer ${
                        craftable
                          ? 'bg-sky-600 hover:bg-sky-500 text-white'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {craftable ? 'SYNTHESIZE ITEM' : 'INSUFFICIENT MATERIALS'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'galaxy' && (
            <div className="grid md:grid-cols-3 gap-5">
              <div className="md:col-span-2 bg-[#040812] border border-sky-500/40 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold tracking-widest text-sky-300">
                    GALAXY SECTOR ({galaxyFocus.x}, {galaxyFocus.y}, {galaxyFocus.z}) · {currentSystem.regionName}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setGalaxyFocus({ ...galaxyFocus, x: galaxyFocus.x - 2 })}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 cursor-pointer"
                    >
                      West
                    </button>
                    <button
                      type="button"
                      onClick={() => setGalaxyFocus({ ...galaxyFocus, x: galaxyFocus.x + 2 })}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 cursor-pointer"
                    >
                      East
                    </button>
                    <button
                      type="button"
                      onClick={() => setGalaxyFocus({ ...galaxyFocus, z: galaxyFocus.z - 2 })}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 cursor-pointer"
                    >
                      North
                    </button>
                    <button
                      type="button"
                      onClick={() => setGalaxyFocus({ ...galaxyFocus, z: galaxyFocus.z + 2 })}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 cursor-pointer"
                    >
                      South
                    </button>
                  </div>
                </div>

                {/* Interactive Star Chart */}
                <div className="relative h-72 bg-[#02040a] border border-slate-800 overflow-hidden">
                  {nearbySystems.map(({ coords, system }) => {
                    const relX = ((coords.x - galaxyFocus.x) / 6 + 0.5) * 86 + 7;
                    const relY = ((coords.z - galaxyFocus.z) / 6 + 0.5) * 86 + 7;
                    const isHere = system.id === currentSystem.id;
                    const isSelected = system.id === selectedSysObj?.system.id;
                    return (
                      <button
                        key={system.id}
                        type="button"
                        onClick={() => setSelectedSysId(system.id)}
                        style={{ left: `${relX}%`, top: `${relY}%` }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer group`}
                      >
                        <span
                          className={`w-4 h-4 rounded-full border-2 ${
                            isSelected ? 'border-white scale-125' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: system.starColor }}
                        />
                        <span className="text-[10px] mt-1 text-slate-300 group-hover:text-white whitespace-nowrap">
                          {system.name} {isHere ? '(HERE)' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedSysObj && (() => {
                const sys = selectedSysObj.system;
                const warpCheck = canWarpToSystem(save.ship, save.currentSystemCoords, selectedSysObj.coords);
                return (
                  <div className="bg-slate-900/90 border border-slate-700 p-4 flex flex-col justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-white">{sys.name}</div>
                      <div className="text-xs text-sky-300">
                        {sys.starClass} · {FACTIONS[sys.faction].name}
                      </div>
                      <div className="text-xs text-slate-400 mt-1 tabular-nums">
                        Distance: {warpCheck.distLy} LY · Danger: {sys.dangerLevel}
                      </div>
                      <div className="mt-3 flex flex-col gap-1.5 max-h-44 overflow-y-auto">
                        {sys.planets.map((p) => (
                          <div key={p.id} className="p-2 bg-slate-950/80 border border-slate-800 text-xs">
                            <div className="font-semibold text-slate-100">{p.name}</div>
                            <div className="text-[11px] text-slate-400">
                              {p.archetypeName} · {p.gravity}g · {p.temperatureC}°C
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!warpCheck.ok}
                      onClick={() => onWarpToSystem(selectedSysObj.coords, warpCheck.fuelCost)}
                      className={`py-2 text-xs font-bold tracking-wider cursor-pointer ${
                        warpCheck.ok
                          ? 'bg-purple-600 hover:bg-purple-500 text-white'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {warpCheck.ok
                        ? `ENGAGE WARP (${warpCheck.fuelCost}% FUEL)`
                        : warpCheck.reason}
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === 'discoveries' && (
            <div className="flex flex-col gap-3">
              <div className="text-xs text-slate-400">
                Total Cataloged Discoveries: <strong className="text-white tabular-nums">{save.discoveries.length}</strong> · Press [V] on planets to scan flora, fauna, and minerals.
              </div>
              {save.discoveries.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400 border border-slate-800">
                  No discoveries logged yet. Aim at creatures, plants, or crystals and press [V] to scan!
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {save.discoveries.map((d) => (
                    <div key={d.id} className="p-3 bg-slate-900/90 border border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">{d.name}</span>
                        <span className="text-[10px] uppercase px-2 py-0.5 bg-sky-900/70 text-sky-200">{d.kind}</span>
                      </div>
                      <div className="text-xs text-amber-300 mt-0.5">
                        {d.planetName} ({d.biome}) · {d.rarity}
                      </div>
                      <p className="text-xs text-slate-300 mt-1.5">{d.scientificNote}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'missions' && (
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <h3 className="text-xs font-bold tracking-widest text-sky-300 mb-2">ACTIVE EXPEDITION CONTRACTS</h3>
                <div className="flex flex-col gap-2.5">
                  {save.missions.map((m) => (
                    <div key={m.id} className="p-3 bg-slate-900/90 border border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">{m.title}</span>
                        <span className="text-xs text-amber-300 tabular-nums">+{m.rewardCredits} CR</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{m.targetLabel}</div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="flex-1 h-2 bg-slate-800">
                          <div
                            className="h-full bg-emerald-400"
                            style={{ width: `${Math.min(100, (m.progress / m.requiredCount) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-slate-200">
                          {m.progress}/{m.requiredCount}
                        </span>
                        {m.completed && !m.claimed && (
                          <button
                            type="button"
                            onClick={() => onClaimMission(m.id)}
                            className="px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                          >
                            Claim
                          </button>
                        )}
                        {m.claimed && <span className="text-[11px] text-emerald-400 font-bold">CLAIMED</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold tracking-widest text-amber-300 mb-2">
                  GALACTIC EXCHANGE ({FACTIONS[currentSystem.faction].name})
                </h3>
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
                  {ITEM_LIST.map((item) => {
                    const owned = countItem(save.playerInventory, item.id);
                    const buyPrice = Math.round(item.baseValue * (1.35 - currentSystem.economyTier * 0.08));
                    const sellPrice = Math.round(item.baseValue * (0.85 + currentSystem.economyTier * 0.08));
                    return (
                      <div
                        key={item.id}
                        className="p-2.5 bg-slate-900/90 border border-slate-700/80 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white">{item.name}</div>
                          <div className="text-[11px] text-slate-400 tabular-nums">Owned: {owned}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={save.credits < buyPrice}
                            onClick={() => onTradeItem('buy', item.id)}
                            className="px-2 py-1 bg-sky-700 hover:bg-sky-600 disabled:bg-slate-800 disabled:text-slate-500 text-white cursor-pointer tabular-nums"
                          >
                            Buy {buyPrice}
                          </button>
                          <button
                            type="button"
                            disabled={owned < 1}
                            onClick={() => onTradeItem('sell', item.id)}
                            className="px-2 py-1 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold cursor-pointer tabular-nums"
                          >
                            Sell {sellPrice}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'building' && (
            <div className="flex flex-col gap-4">
              <div className="p-3 bg-slate-900 border border-sky-500/40 flex items-center justify-between text-xs">
                <span>
                  Planetary Power Grid: <strong className="text-emerald-300 tabular-nums">+{powerGrid.produced} kW</strong> produced ·{' '}
                  <strong className="text-amber-300 tabular-nums">-{powerGrid.consumed} kW</strong> used
                </span>
                <span className="text-slate-300 tabular-nums">Built Modules: {save.structures.length}</span>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {BASE_PART_LIST.map((part) => (
                  <div key={part.id} className="p-3 bg-slate-900/90 border border-slate-700 flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">{part.name}</span>
                        <span className="text-xs text-sky-300 tabular-nums">
                          {part.powerDelta >= 0 ? `+${part.powerDelta}` : part.powerDelta} kW
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{part.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {part.cost.map((c) => (
                          <span key={c.itemId} className="text-[11px] px-1.5 py-0.5 bg-slate-800 text-slate-200 tabular-nums">
                            {ITEMS[c.itemId]?.name} ×{c.quantity}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectBuildPart(part.id);
                        onClose();
                      }}
                      className="py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold cursor-pointer"
                    >
                      SELECT & ENTER BUILD MODE
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'ship' && (
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <h3 className="text-xs font-bold tracking-widest text-sky-300 mb-2">STARSHIP HANGAR & CLASSES</h3>
                <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                  {SHIP_CLASS_LIST.map((sc) => {
                    const current = save.ship.classId === sc.id;
                    return (
                      <div key={sc.id} className="p-2.5 bg-slate-900 border border-slate-700 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-white">{sc.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {sc.role} · Speed {sc.maxSpeed} · Warp {sc.warpRange} LY
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={current || (!current && save.credits < sc.costCredits)}
                          onClick={() => onSelectOrBuyShip(sc.id)}
                          className={`px-3 py-1.5 text-xs font-bold cursor-pointer ${
                            current
                              ? 'bg-emerald-700 text-white'
                              : 'bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white'
                          }`}
                        >
                          {current ? 'ACTIVE' : sc.costCredits === 0 ? 'SELECT' : `${sc.costCredits} CR`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-xs font-bold tracking-widest text-amber-300 mb-2">SYSTEM UPGRADES (450 CR / LVL)</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['thruster', 'Thrusters', save.ship.upgrades.thrusterLevel],
                        ['shield', 'Deflectors', save.ship.upgrades.shieldLevel],
                        ['weapon', 'Pulse Cannons', save.ship.upgrades.weaponLevel],
                        ['hyperdrive', 'Hyperdrive', save.ship.upgrades.hyperdriveLevel],
                        ['mining', 'Mining Laser', save.survival.miningLevel],
                        ['scanner', 'Visor Scanner', save.survival.scannerLevel],
                        ['jetpack', 'Jetpack Boost', save.survival.jetpackLevel],
                      ] as const
                    ).map(([key, label, lvl]) => (
                      <button
                        key={key}
                        type="button"
                        disabled={save.credits < 450 || lvl >= 5}
                        onClick={() => onUpgradeSystem(key)}
                        className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 border border-slate-700 text-left cursor-pointer"
                      >
                        <div className="text-xs font-bold text-white">{label}</div>
                        <div className="text-[11px] text-sky-300 tabular-nums">
                          Level {lvl}/5 {lvl < 5 ? '· Upgrade 450 CR' : '· MAX'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold tracking-widest text-purple-300 mb-2">SUIT & SHIP PAINT</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    {['#e2e8f0', '#38bdf8', '#f97316', '#10b981', '#a855f7', '#dc2626'].map((col) => (
                      <button
                        key={col}
                        type="button"
                        aria-label={`Set primary color ${col}`}
                        onClick={() => onCustomizeColors({ suitColor: col, shipPrimary: col })}
                        style={{ backgroundColor: col }}
                        className="w-7 h-7 border border-white/50 cursor-pointer"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="grid md:grid-cols-2 gap-5 text-xs">
              <div className="flex flex-col gap-3 p-4 bg-slate-900 border border-slate-700">
                <h3 className="font-bold tracking-widest text-sky-300">GRAPHICS & CONTROLS</h3>
                <label className="flex items-center justify-between">
                  <span>Quality Preset</span>
                  <select
                    value={save.settings.quality}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...save.settings,
                        quality: e.target.value as GraphicsSettings['quality'],
                      })
                    }
                    className="bg-slate-800 border border-slate-600 px-2 py-1"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="ultra">Ultra</option>
                  </select>
                </label>

                <label className="flex items-center justify-between gap-3">
                  <span>Field of View ({save.settings.fov}°)</span>
                  <input
                    type="range"
                    min={55}
                    max={95}
                    value={save.settings.fov}
                    onChange={(e) => onUpdateSettings({ ...save.settings, fov: Number(e.target.value) })}
                  />
                </label>

                <label className="flex items-center justify-between gap-3">
                  <span>Audio Volume ({Math.round(save.settings.volume * 100)}%)</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={save.settings.volume}
                    onChange={(e) => onUpdateSettings({ ...save.settings, volume: Number(e.target.value) })}
                  />
                </label>

                <label className="flex items-center justify-between gap-3">
                  <span>Look Sensitivity ({(save.settings.sensitivity || 1).toFixed(1)}x)</span>
                  <input
                    type="range"
                    min={0.4}
                    max={2.4}
                    step={0.1}
                    value={save.settings.sensitivity || 1}
                    onChange={(e) => onUpdateSettings({ ...save.settings, sensitivity: Number(e.target.value) })}
                  />
                </label>

                <label className="flex items-center justify-between">
                  <span>Touch Controls (Mobile)</span>
                  <select
                    value={save.settings.touchControls ?? 'auto'}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...save.settings,
                        touchControls: e.target.value as GraphicsSettings['touchControls'],
                      })
                    }
                    className="bg-slate-800 border border-slate-600 px-2 py-1"
                  >
                    <option value="auto">Auto Detect</option>
                    <option value="on">Always On</option>
                    <option value="off">Off</option>
                  </select>
                </label>

                <label className="flex items-center justify-between">
                  <span>Invert Camera Y</span>
                  <input
                    type="checkbox"
                    checked={save.settings.invertY}
                    onChange={(e) => onUpdateSettings({ ...save.settings, invertY: e.target.checked })}
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 p-4 bg-slate-900 border border-slate-700">
                <h3 className="font-bold tracking-widest text-amber-300">PERSISTENT SAVE ARCHIVE</h3>
                <div className="text-slate-300 tabular-nums">
                  Universe Seed: {save.universeSeed} · Slot: {save.label}
                </div>
                <button
                  type="button"
                  onClick={onManualSave}
                  className="flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
                >
                  <Save className="w-4 h-4" /> SAVE UNIVERSE NOW
                </button>
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-slate-500" />
                  Autosave + backup checksum verification runs automatically on exploration & crafting milestones.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TitleScreen } from './components/TitleScreen';
import { GameHUD } from './components/GameHUD';
import { SystemsModal } from './components/SystemsModal';
import { GameOverModal, PauseModal } from './components/PauseAndOutcomeModals';
import { ITEMS, SHIP_CLASSES } from './game/catalog';
import { AbyssEngine } from './game/engine';
import {
  addItemToSlots,
  consumeBasePartCost,
  createInitialSaveGame,
  deleteSaveSlot,
  executeCraftRecipe,
  listSaveSlots,
  loadSaveSlot,
  removeItemFromSlots,
  sortInventorySlots,
  useConsumableItem,
  writeSaveSlot,
} from './game/rules';
import {
  BasePartId,
  DiscoveryEntry,
  GamePhase,
  GraphicsSettings,
  HudTelemetry,
  PlacedStructure,
  SaveGameData,
  SaveSlotSummary,
  ShipClassId,
  SystemsTab,
} from './game/types';
import { generateStarSystem } from './game/universe';

const DEFAULT_SEED = 704921;

function createBootSave(): SaveGameData {
  const home = generateStarSystem(DEFAULT_SEED, { x: 0, y: 0, z: 0, index: 0 }, true);
  return createInitialSaveGame('slot_1', 'Frontier Alpha', DEFAULT_SEED, home);
}

const DEFAULT_TELEMETRY: HudTelemetry = {
  playMode: 'on_foot',
  fps: 60,
  speed: 0,
  altitude: 0,
  nearestPlanetId: null,
  nearestPlanetName: 'Loading...',
  nearestPlanetType: 'Paradise Planet',
  nearestPlanetGravity: 9.4,
  nearestPlanetTemp: 22,
  nearestPlanetWeather: 'Clear',
  nearestPlanetHazard: 'none',
  inAtmosphere: true,
  canAutoLand: false,
  nearShip: true,
  nearStation: false,
  nearOutpost: false,
  scanTargetName: null,
  scanTargetKind: null,
  scanTargetProgress: 0,
  miningTargetName: null,
  miningTargetHpRatio: 0,
  alertMessage: null,
  compassHeadingDeg: 0,
  shipDistance: 8,
  powerProduced: 0,
  powerConsumed: 0,
  selectedHotbarIdx: 0,
  selectedBuildPart: 'foundation',
  canPlaceBuild: true,
  warpChargeProgress: 0,
  piratesNearby: 0,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AbyssEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [save, setSave] = useState<SaveGameData>(() => createBootSave());
  const saveRef = useRef<SaveGameData>(save);
  saveRef.current = save;

  const [telemetry, setTelemetry] = useState<HudTelemetry>(DEFAULT_TELEMETRY);
  const [systemsOpen, setSystemsOpen] = useState(false);
  const [systemsTab, setSystemsTab] = useState<SystemsTab>('inventory');
  const [gameOverReason, setGameOverReason] = useState('Expedition signal lost.');
  const [slots, setSlots] = useState<SaveSlotSummary[]>([]);

  const refreshSlots = useCallback(() => {
    const found = listSaveSlots((s) => {
      const sys = generateStarSystem(
        s.universeSeed,
        s.currentSystemCoords,
        s.currentSystemCoords.x === 0 && s.currentSystemCoords.z === 0
      );
      const pl = sys.planets.find((p) => p.id === s.currentPlanetId) || sys.planets[0];
      return { systemName: sys.name, planetName: pl?.name ?? 'Unknown' };
    });
    setSlots(found);
  }, []);

  useEffect(() => {
    refreshSlots();
  }, [refreshSlots]);

  const commitSave = useCallback(
    (updater: (prev: SaveGameData) => SaveGameData, persistNow = false) => {
      setSave((prev) => {
        const next = updater(prev);
        saveRef.current = next;
        if (persistNow) {
          writeSaveSlot(next);
          refreshSlots();
        }
        return next;
      });
    },
    [refreshSlots]
  );

  // Store latest handlers in refs so Three.js engine never tears down
  const handlersRef = useRef({
    commitSave,
    setPhase,
    setSystemsOpen,
    setSystemsTab,
    setGameOverReason,
  });
  handlersRef.current = {
    commitSave,
    setPhase,
    setSystemsOpen,
    setSystemsTab,
    setGameOverReason,
  };

  // Mount Three.js engine once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new AbyssEngine(
      container,
      {
        onTelemetry: (t) => setTelemetry(t),
        onSyncSave: (patch) => {
          handlersRef.current.commitSave((prev) => ({ ...prev, ...patch }));
        },
        onAddResource: (itemId, qty, source) => {
          handlersRef.current.commitSave((prev) => {
            const added = addItemToSlots(prev.playerInventory, itemId, qty);
            const nextMissions = prev.missions.map((m) => {
              if (m.completed) return m;
              if ((source === 'mine' && m.type === 'mine') || (source === 'combat' && m.type === 'combat')) {
                const p = Math.min(m.requiredCount, m.progress + 1);
                return { ...m, progress: p, completed: p >= m.requiredCount };
              }
              return m;
            });
            return { ...prev, playerInventory: added.nextSlots, missions: nextMissions };
          });
          engine.audio.playPickupResource();
          engine.pushAlert(`+${qty} ${ITEMS[itemId]?.name ?? itemId}`);
        },
        onDiscovery: (entry: DiscoveryEntry) => {
          handlersRef.current.commitSave((prev) => {
            if (prev.discoveries.some((d) => d.id === entry.id)) return prev;
            const nextMissions = prev.missions.map((m) => {
              if (m.completed) return m;
              if (
                (m.type === 'scan' && (entry.kind === 'fauna' || entry.kind === 'flora' || entry.kind === 'mineral')) ||
                (m.type === 'explore' && entry.kind === 'planet')
              ) {
                const p = Math.min(m.requiredCount, m.progress + 1);
                return { ...m, progress: p, completed: p >= m.requiredCount };
              }
              return m;
            });
            return {
              ...prev,
              credits: prev.credits + entry.creditsAwarded,
              discoveries: [entry, ...prev.discoveries],
              missions: nextMissions,
            };
          }, true);
          engine.pushAlert(`DISCOVERED ${entry.name.toUpperCase()} (+${entry.creditsAwarded} CR)`);
        },
        onPlaceStructure: (structure: PlacedStructure, partId: BasePartId) => {
          const cur = saveRef.current;
          const res = consumeBasePartCost(cur.playerInventory, partId);
          if (!res.success) return false;
          handlersRef.current.commitSave((prev) => {
            const nextMissions = prev.missions.map((m) => {
              if (m.completed || m.type !== 'build') return m;
              const p = Math.min(m.requiredCount, m.progress + 1);
              return { ...m, progress: p, completed: p >= m.requiredCount };
            });
            return {
              ...prev,
              playerInventory: res.nextSlots,
              structures: [...prev.structures, structure],
              missions: nextMissions,
            };
          }, true);
          return true;
        },
        onAlert: () => {},
        onGameOver: (reason) => {
          handlersRef.current.setGameOverReason(reason);
          handlersRef.current.setSystemsOpen(false);
          handlersRef.current.setPhase('gameover');
        },
        onTogglePause: () => {
          setSystemsOpen((open) => {
            if (open) return false;
            setPhase((p) => {
              const next = p === 'paused' ? 'playing' : 'paused';
              engine.setPhase(next);
              return next;
            });
            return false;
          });
        },
        onToggleSystems: (tab) => {
          setSystemsOpen((open) => {
            if (tab && !open) setSystemsTab(tab);
            else if (tab && open && tab !== systemsTab) {
              setSystemsTab(tab);
              return true;
            }
            const next = !open;
            if (next) {
              engine.audio.silenceLoops();
            }
            return next;
          });
        },
      },
      saveRef.current
    );

    engineRef.current = engine;

    // Support ?autostart=1 for instant entry
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      engine.setPhase('playing');
      setPhase('playing');
    } else {
      engine.setPhase('title');
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setModalOpen(systemsOpen);
  }, [systemsOpen]);

  // Bind Enter / Space on Title screen
  useEffect(() => {
    if (phase !== 'title') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        if (slots[0]) {
          handleContinueLatest(slots[0].slotId);
        } else {
          handleStartNew('');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, slots]);

  const handleStartNew = (seedInput: string) => {
    const parsed = seedInput.trim()
      ? Array.from(seedInput.trim()).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 2166136261)
      : Math.floor(100000 + Math.random() * 899999);
    const slotId = `slot_${Date.now().toString(36)}`;
    const home = generateStarSystem(parsed, { x: 0, y: 0, z: 0, index: 0 }, true);
    const fresh = createInitialSaveGame(slotId, `Universe #${parsed % 10000}`, parsed, home);
    writeSaveSlot(fresh);
    refreshSlots();
    setSave(fresh);
    saveRef.current = fresh;
    engineRef.current?.loadSaveState(fresh, true);
    engineRef.current?.setPhase('playing');
    setPhase('playing');
    (document.activeElement as HTMLElement | null)?.blur?.();
  };

  const handleContinueLatest = (slotId: string) => {
    const res = loadSaveSlot(slotId);
    if (res.ok && res.data) {
      setSave(res.data);
      saveRef.current = res.data;
      engineRef.current?.loadSaveState(res.data, true);
      engineRef.current?.setPhase('playing');
      setPhase('playing');
      (document.activeElement as HTMLElement | null)?.blur?.();
    } else {
      handleStartNew('');
    }
  };

  const handleDeleteSlot = (slotId: string) => {
    deleteSaveSlot(slotId);
    refreshSlots();
  };

  const handleUseItem = (itemId: string) => {
    const res = useConsumableItem(save.playerInventory, itemId, save.survival, save.ship);
    if (!res.used) {
      engineRef.current?.pushAlert(res.message);
      return;
    }
    commitSave((prev) => ({
      ...prev,
      playerInventory: res.nextSlots,
      survival: res.nextSurvival,
      ship: res.nextShip,
    }));
    engineRef.current?.audio.playConsumable(ITEMS[itemId]?.usableEffect?.type);
    engineRef.current?.pushAlert(res.message);
  };

  const handleUseHotbar = (idx: number) => {
    const itemId = save.hotbarItemIds[idx];
    if (itemId) handleUseItem(itemId);
  };

  const handleTransferItem = (from: 'player' | 'ship' | 'base', to: 'player' | 'ship' | 'base', idx: number) => {
    const mapKey = (k: 'player' | 'ship' | 'base') =>
      k === 'player' ? 'playerInventory' : k === 'ship' ? 'shipInventory' : 'baseStorage';
    commitSave((prev) => {
      const fromKey = mapKey(from);
      const toKey = mapKey(to);
      const slot = prev[fromKey][idx];
      if (!slot) return prev;
      const added = addItemToSlots(prev[toKey], slot.itemId, slot.quantity);
      const moved = slot.quantity - added.remaining;
      if (moved <= 0) return prev;
      const nextFrom = prev[fromKey].map((s, i) =>
        i === idx ? (added.remaining > 0 ? { itemId: slot.itemId, quantity: added.remaining } : null) : s
      );
      return { ...prev, [fromKey]: nextFrom, [toKey]: added.nextSlots };
    });
    engineRef.current?.audio.playUiClick();
  };

  const handleSortInventory = (target: 'player' | 'ship' | 'base') => {
    const key = target === 'player' ? 'playerInventory' : target === 'ship' ? 'shipInventory' : 'baseStorage';
    commitSave((prev) => ({ ...prev, [key]: sortInventorySlots(prev[key]) }));
    engineRef.current?.audio.playUiClick();
  };

  const handleCraft = (recipeId: string) => {
    const res = executeCraftRecipe(save.playerInventory, recipeId);
    if (!res.crafted) {
      engineRef.current?.pushAlert(res.reason || 'Crafting failed');
      return;
    }
    commitSave((prev) => ({ ...prev, playerInventory: res.nextSlots }), true);
    engineRef.current?.audio.playCraftSuccess();
    engineRef.current?.pushAlert('Synthesis Complete');
  };

  const handleWarpToSystem = (coords: { x: number; y: number; z: number; index: number }, fuelCost: number) => {
    setSystemsOpen(false);
    engineRef.current?.initiateSystemWarp(coords, fuelCost);
  };

  const handleClaimMission = (missionId: string) => {
    commitSave((prev) => {
      const m = prev.missions.find((x) => x.id === missionId);
      if (!m || !m.completed || m.claimed) return prev;
      let inv = prev.playerInventory;
      if (m.rewardItem) {
        inv = addItemToSlots(inv, m.rewardItem.itemId, m.rewardItem.quantity).nextSlots;
      }
      return {
        ...prev,
        credits: prev.credits + m.rewardCredits,
        playerInventory: inv,
        missions: prev.missions.map((x) => (x.id === missionId ? { ...x, claimed: true } : x)),
      };
    }, true);
    engineRef.current?.audio.playDiscovery();
  };

  const handleTradeItem = (action: 'buy' | 'sell', itemId: string) => {
    const sys = engineRef.current?.getCurrentSystem();
    const tier = sys?.economyTier ?? 1;
    const def = ITEMS[itemId];
    if (!def) return;
    const buyPrice = Math.round(def.baseValue * (1.35 - tier * 0.08));
    const sellPrice = Math.round(def.baseValue * (0.85 + tier * 0.08));

    commitSave((prev) => {
      if (action === 'buy') {
        if (prev.credits < buyPrice) return prev;
        const added = addItemToSlots(prev.playerInventory, itemId, 1);
        if (added.remaining > 0) return prev;
        return { ...prev, credits: prev.credits - buyPrice, playerInventory: added.nextSlots };
      } else {
        const rem = removeItemFromSlots(prev.playerInventory, itemId, 1);
        if (!rem.success) return prev;
        return { ...prev, credits: prev.credits + sellPrice, playerInventory: rem.nextSlots };
      }
    });
    engineRef.current?.audio.playUiClick();
  };

  const handleSelectBuildPart = (partId: BasePartId) => {
    engineRef.current?.setBuildPart(partId);
    if (telemetry.playMode !== 'build_mode') {
      engineRef.current?.toggleBuildMode();
    }
  };

  const handleSelectOrBuyShip = (classId: ShipClassId) => {
    const def = SHIP_CLASSES[classId];
    commitSave((prev) => {
      if (prev.ship.classId === classId || prev.credits < def.costCredits) return prev;
      return {
        ...prev,
        credits: prev.credits - def.costCredits,
        ship: {
          ...prev.ship,
          classId,
          name: def.name,
          primaryColor: def.hullColor,
          accentColor: def.accentColor,
          maxHull: def.maxHull,
          hull: def.maxHull,
          maxShield: def.maxShield,
          shield: def.maxShield,
        },
      };
    }, true);
    setTimeout(() => engineRef.current?.rebuildSpacecraftModel(), 20);
    engineRef.current?.audio.playDiscovery();
  };

  const handleUpgradeSystem = (
    kind: 'thruster' | 'shield' | 'weapon' | 'hyperdrive' | 'mining' | 'scanner' | 'jetpack'
  ) => {
    commitSave((prev) => {
      if (prev.credits < 450) return prev;
      const next = { ...prev, credits: prev.credits - 450, ship: { ...prev.ship, upgrades: { ...prev.ship.upgrades } }, survival: { ...prev.survival } };
      if (kind === 'thruster') next.ship.upgrades.thrusterLevel = Math.min(5, next.ship.upgrades.thrusterLevel + 1);
      if (kind === 'shield') {
        next.ship.upgrades.shieldLevel = Math.min(5, next.ship.upgrades.shieldLevel + 1);
        next.ship.maxShield += 25;
        next.ship.shield = next.ship.maxShield;
      }
      if (kind === 'weapon') next.ship.upgrades.weaponLevel = Math.min(5, next.ship.upgrades.weaponLevel + 1);
      if (kind === 'hyperdrive') next.ship.upgrades.hyperdriveLevel = Math.min(5, next.ship.upgrades.hyperdriveLevel + 1);
      if (kind === 'mining') next.survival.miningLevel = Math.min(5, next.survival.miningLevel + 1);
      if (kind === 'scanner') next.survival.scannerLevel = Math.min(5, next.survival.scannerLevel + 1);
      if (kind === 'jetpack') next.survival.jetpackLevel = Math.min(5, next.survival.jetpackLevel + 1);
      return next;
    }, true);
    engineRef.current?.audio.playBuildPlace();
  };

  const handleCustomizeColors = (patch: { suitColor?: string; visorColor?: string; shipPrimary?: string; shipAccent?: string }) => {
    commitSave((prev) => ({
      ...prev,
      survival: {
        ...prev.survival,
        suitColor: patch.suitColor ?? prev.survival.suitColor,
        visorColor: patch.visorColor ?? prev.survival.visorColor,
      },
      ship: {
        ...prev.ship,
        primaryColor: patch.shipPrimary ?? prev.ship.primaryColor,
        accentColor: patch.shipAccent ?? prev.ship.accentColor,
      },
    }));
    setTimeout(() => {
      engineRef.current?.rebuildExplorerColors();
      engineRef.current?.rebuildSpacecraftModel();
    }, 20);
  };

  const handleUpdateSettings = (settings: GraphicsSettings) => {
    commitSave((prev) => ({ ...prev, settings }), true);
    engineRef.current?.applySettings(settings);
  };

  const handleManualSave = () => {
    writeSaveSlot(saveRef.current);
    refreshSlots();
    engineRef.current?.pushAlert('UNIVERSE STATE SAVED');
    engineRef.current?.audio.playDiscovery();
  };

  const currentSystem =
    engineRef.current?.getCurrentSystem() ??
    generateStarSystem(save.universeSeed, save.currentSystemCoords, true);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#040712]">
      {/* Isolated WebGL Viewport Container */}
      <div ref={mountRef} data-testid="game-canvas-mount" className="absolute inset-0 w-full h-full" />

      {phase === 'title' && (
        <TitleScreen
          slots={slots}
          onStartNew={handleStartNew}
          onContinueLatest={handleContinueLatest}
          onLoadSlot={handleContinueLatest}
          onDeleteSlot={handleDeleteSlot}
        />
      )}

      {phase === 'playing' && (
        <GameHUD
          save={save}
          telemetry={telemetry}
          onUseHotbar={handleUseHotbar}
          onSelectBuildPart={handleSelectBuildPart}
          onOpenSystems={(tab) => {
            setSystemsTab(tab);
            setSystemsOpen(true);
          }}
          onToggleMute={() =>
            handleUpdateSettings({ ...save.settings, muted: !save.settings.muted })
          }
          onTogglePause={() => {
            engineRef.current?.setPhase('paused');
            setPhase('paused');
          }}
          onTouchMove={(x, y) => engineRef.current?.setTouchMoveVector(x, y)}
          onTouchLook={(dx, dy) => engineRef.current?.addTouchLookDelta(dx, dy)}
          onTouchAction={(action, active) => engineRef.current?.setTouchAction(action, active)}
        />
      )}

      {phase === 'playing' && systemsOpen && (
        <SystemsModal
          activeTab={systemsTab}
          onChangeTab={setSystemsTab}
          onClose={() => setSystemsOpen(false)}
          save={save}
          currentSystem={currentSystem}
          onUseItem={handleUseItem}
          onTransferItem={handleTransferItem}
          onSortInventory={handleSortInventory}
          onCraft={handleCraft}
          onWarpToSystem={handleWarpToSystem}
          onClaimMission={handleClaimMission}
          onTradeItem={handleTradeItem}
          onSelectBuildPart={handleSelectBuildPart}
          onSelectOrBuyShip={handleSelectOrBuyShip}
          onUpgradeSystem={handleUpgradeSystem}
          onCustomizeColors={handleCustomizeColors}
          onUpdateSettings={handleUpdateSettings}
          onManualSave={handleManualSave}
        />
      )}

      {phase === 'paused' && (
        <PauseModal
          save={save}
          onResume={() => {
            engineRef.current?.setPhase('playing');
            setPhase('playing');
          }}
          onManualSave={handleManualSave}
          onOpenSettings={() => {
            engineRef.current?.setPhase('playing');
            setPhase('playing');
            setSystemsTab('settings');
            setSystemsOpen(true);
          }}
          onExitToTitle={() => {
            writeSaveSlot(saveRef.current);
            refreshSlots();
            engineRef.current?.setPhase('title');
            setPhase('title');
          }}
        />
      )}

      {phase === 'gameover' && (
        <GameOverModal
          reason={gameOverReason}
          save={save}
          onRespawn={() => {
            engineRef.current?.respawnAfterDefeat();
            setPhase('playing');
          }}
          onExitToTitle={() => {
            engineRef.current?.setPhase('title');
            setPhase('title');
          }}
        />
      )}
    </div>
  );
}

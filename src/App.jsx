import React, { useEffect, useMemo, useRef, useState } from "react";
import heroesFallback from "../shared/heroes.json";
import { applyHero, createQueue, finishSwap, newDraft, setCurrentPickPlayer, skipBan, swapHeroes, undoDraft } from "./engine/draft.js";
import ObsOverlay from "./ObsOverlay.jsx";
import SplashFocusGallery from "./SplashFocusGallery.jsx";
import { DEFAULT_SPLASH_FOCAL_POINTS, USER_SET_SPLASH_FOCAL_KEYS } from "./splashFocus.js";

const ROLE_FILTERS = ["Semua", "Tank", "Fighter", "Assassin", "Mage", "Marksman", "Support"];
const ROLE_MARK = { Tank: "T", Fighter: "F", Assassin: "A", Mage: "M", Marksman: "MM", Support: "S" };
const RANK_BANS = { Epic: 3, Legend: 4, "Mythic+": 5 };
const MODE_COPY = {
  standard: { label: "Standar", sub: "Ranked snake draft", mark: "01" },
  mpl: { label: "MPL / Pro", sub: "Ban di tengah draft", mark: "02" },
  free: { label: "Bebas", sub: "Susun tanpa urutan", mark: "03" },
};
const ICONS = { search: "⌕", back: "↶", restart: "⟳", share: "↗", down: "⌄", close: "×" };
const STORAGE_KEY = "css-draft-lab-v1";
const SPLASH_FOCUS_STORAGE_KEY = "css-draft-lab-splash-focus-v1";
const SPLASH_FOCUS_REVISION_KEY = "css-draft-lab-splash-focus-revision";
const SPLASH_FOCUS_REVISION = "user-provided-points-v1";
const DEFAULT_PLAYER_NAMES = Array.from({ length: 5 }, () => "");
const DEFAULT_TEAM_META = {
  blue: { name: "BLUE TEAM", logo: "", players: DEFAULT_PLAYER_NAMES },
  red: { name: "RED TEAM", logo: "", players: DEFAULT_PLAYER_NAMES },
};
const DEFAULT_SERIES = { format: "bestOf", value: 3, blueScore: 0, redScore: 0 };

function normalizeTeamMeta(saved = {}) {
  return Object.fromEntries(["blue", "red"].map((side) => {
    const team = saved[side] || {};
    return [side, {
      ...DEFAULT_TEAM_META[side],
      ...team,
      players: DEFAULT_PLAYER_NAMES.map((fallback, index) => team.players?.[index] ?? fallback),
    }];
  }));
}

function readSavedAppState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function readSavedSplashFocusPoints() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SPLASH_FOCUS_STORAGE_KEY) || "{}");
    const saved = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    if (localStorage.getItem(SPLASH_FOCUS_REVISION_KEY) !== SPLASH_FOCUS_REVISION) {
      for (const key of USER_SET_SPLASH_FOCAL_KEYS) delete saved[key];
    }
    return { ...DEFAULT_SPLASH_FOCAL_POINTS, ...saved };
  } catch {
    return DEFAULT_SPLASH_FOCAL_POINTS;
  }
}

function restoreDraft() {
  const savedDraft = readSavedAppState().draft;
  if (!savedDraft) return newDraft();
  const pickCount = (savedDraft.teams?.blue?.picks?.filter(Boolean).length || 0)
    + (savedDraft.teams?.red?.picks?.filter(Boolean).length || 0);
  if (savedDraft.status === "complete" && !savedDraft.swapCompleted && pickCount === 10) {
    return { ...savedDraft, status: "swapping" };
  }
  return savedDraft;
}

async function compressTeamLogo(file) {
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Pilih logo PNG, JPG, atau WebP.");
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.86);
}

function TeamSlot({ hero, index, side, action, selected, swapMode, onSelect, onRemove, onSwapSelect, playerName = "", playerIndex, onPlayerNameChange, activeTurn = false }) {
  const canRemove = Boolean(onRemove) && !swapMode;
  const slotButton = (
    <button
      className={`pick-slot ${hero ? "filled" : "empty"} ${hero?.skipped ? "no-ban-slot" : ""} ${selected ? "slot-selected" : ""} ${swapMode ? "swap-mode" : ""} ${activeTurn ? "slot-current-turn" : ""} ${side}`}
      onClick={() => swapMode ? (hero && onSwapSelect?.()) : hero ? onRemove?.() : onSelect?.()}
      aria-label={hero ? `${hero.skipped ? "Tidak ban" : hero.name}${swapMode ? selected ? ", dipilih untuk ditukar" : ", pilih untuk ditukar" : canRemove ? ", hapus dari slot" : ""}` : `Slot ${index + 1} kosong`}
      type="button"
    >
      {hero ? (
        hero.skipped ? (
          <><span className="slot-no-ban-mark">—</span><span className="slot-name">NO BAN</span>{canRemove && <span className="slot-clear">{ICONS.close}</span>}</>
        ) : (
          <>
            <span className="slot-art" style={{ "--hero-tone": hero.tone }}>
              {action === "ban" ? (hero.portrait && <img className="slot-ban-portrait" src={hero.portrait} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} />) : (hero.splashArt || hero.portrait) && <img className="slot-splash" src={hero.splashArt || hero.portrait} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
            </span>
            {action === "pick" ? <span className="slot-hero-name">{hero.name}</span> : <span className="slot-name">{hero.name}</span>}
            {action === "ban" && <span className="ban-slash" />}
            {canRemove && <span className="slot-clear">{ICONS.close}</span>}
          </>
        )
      ) : (
        <>
          <span className="slot-number">0{index + 1}</span>
          <span className="slot-plus">{selected ? "PILIH HERO" : "+"}</span>
        </>
      )}
      {activeTurn && action === "ban" && <span className="slot-turn-badge">BAN SEKARANG</span>}
    </button>
  );

  if (action !== "pick") return slotButton;

  const fallbackName = `PLAYER 0${playerIndex + 1}`;
  const displayName = playerName.trim() || fallbackName;
  return (
    <div className={`pick-slot-wrap ${activeTurn ? "pick-slot-current-turn" : ""}`}>
      {slotButton}
      <label className="slot-player-edit" title="Klik nama untuk mengubah pemain">
        <span className="slot-name">{displayName}</span>
        <input
          type="text"
          value={playerName}
          placeholder={fallbackName}
          maxLength={24}
          aria-label={`Nama pemain ${playerIndex + 1} ${side === "blue" ? "Blue" : "Red"}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onPlayerNameChange?.(side, playerIndex, event.target.value)}
        />
      </label>
      {activeTurn && <span className="slot-turn-badge pick">PICK</span>}
    </div>
  );
}

function RoleBars({ heroes }) {
  const roles = ["Tank", "Fighter", "Assassin", "Mage", "Marksman", "Support"];
  return (
    <div className="role-bars">
      {roles.map((role) => {
        const count = heroes.filter((hero) => hero.role === role).length;
        return (
          <div className="role-row" key={role}>
            <span>{ROLE_MARK[role]}</span><span className="role-track"><i style={{ width: `${Math.min(100, count * 30)}%` }} /></span><b>{count}</b>
          </div>
        );
      })}
    </div>
  );
}

function TeamPanel({ side, team, meta, editable, active, currentAction, freeMode, freeSide, freeSlot, swapMode, selectedSwapSlots, onNameChange, onLogoChange, onPlayerNameChange, onSelectSlot, onRemove, onSetFreeSide, onSwapSelect, onPickPlayerChange }) {
  const sideName = side === "blue" ? "BLUE SIDE" : "RED SIDE";
  const isBlue = side === "blue";
  const pickOrder = team.pickOrder?.length === 5 ? team.pickOrder : [0, 1, 2, 3, 4];
  const currentPickIndex = team.picks.filter(Boolean).length;
  const availablePlayers = pickOrder.slice(currentPickIndex);
  const isBanning = active && currentAction === "ban";
  const isPicking = active && (currentAction === "pick" || freeMode);
  const currentPlayerIndex = freeMode ? (pickOrder[freeSlot] ?? freeSlot) : (pickOrder[currentPickIndex] ?? currentPickIndex);
  const currentPlayerName = String(meta.players?.[currentPlayerIndex] || "").trim() || `PLAYER 0${currentPlayerIndex + 1}`;
  const currentSlotIndex = freeMode ? freeSlot : currentPickIndex;
  const pickedHeroes = team.picks.filter(Boolean);
  const damageCounts = pickedHeroes.reduce((acc, hero) => {
    acc[hero.damage] = (acc[hero.damage] || 0) + 1;
    return acc;
  }, {});
  return (
    <section className={`team-panel ${side} ${active ? "team-active" : ""} ${isBanning ? "team-banning" : ""} ${isPicking ? "team-picking" : ""}`}>
      <div className="team-panel-top">
        {editable ? (
          <label className="side-crest crest-upload" title="Unggah logo tim">
            {meta.logo ? <img src={meta.logo} alt="" /> : isBlue ? "B" : "R"}
            <span>+</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={`Unggah logo ${meta.name}`} onChange={(event) => { const file = event.target.files?.[0]; if (file) onLogoChange?.(side, file); event.target.value = ""; }} />
          </label>
        ) : (
          <div className="side-crest">{meta.logo ? <img src={meta.logo} alt="" /> : isBlue ? "B" : "R"}</div>
        )}
        <div className="team-title"><span>{sideName}</span>{editable ? <input className="team-name-input" value={meta.name} maxLength={24} onChange={(event) => onNameChange?.(side, event.target.value)} aria-label={`Nama ${sideName}`} /> : <strong>{meta.name}</strong>}</div>
        {isBanning && <span className="turn-label turn-banning"><i /><span>SEDANG BAN</span></span>}
        {isPicking && <span className="turn-label turn-picking" title={`Pick untuk ${currentPlayerName}`}><i /><span>PICK · {currentPlayerName}</span></span>}
        {freeMode && side === "blue" && <select aria-label="Side for free draft" value={freeSide} onChange={(event) => onSetFreeSide(event.target.value)}><option value="blue">Blue</option><option value="red">Red</option></select>}
      </div>
      {active && currentAction === "pick" && !freeMode && <label className="pick-owner-select"><span>PICK UNTUK</span><select aria-label={`Pemain untuk pick ${sideName}`} value={pickOrder[currentPickIndex] ?? currentPickIndex} onChange={(event) => onPickPlayerChange?.(side, Number(event.target.value))}>{availablePlayers.map((playerIndex) => <option value={playerIndex} key={playerIndex}>{String(meta.players?.[playerIndex] || `PLAYER 0${playerIndex + 1}`).trim()}</option>)}</select></label>}
      <div className="pick-grid">
        {Array.from({ length: 5 }, (_, index) => (
          <TeamSlot
            key={index}
            hero={team.picks[index]}
            index={index}
            side={side}
            action="pick"
            playerIndex={pickOrder[index] ?? index}
            playerName={String(meta.players?.[pickOrder[index] ?? index] || "").trim()}
            onPlayerNameChange={onPlayerNameChange}
            activeTurn={isPicking && index === currentSlotIndex && !team.picks[index]}
            selected={swapMode ? selectedSwapSlots?.includes(index) : freeMode && freeSide === side && index === freeSlot}
            swapMode={swapMode}
            onSelect={() => onSelectSlot?.(index)}
            onRemove={() => onRemove?.("picks", index)}
            onSwapSelect={() => onSwapSelect?.(index)}
          />
        ))}
      </div>
      {editable && <details className="player-name-editor"><summary>EDIT PLAYER</summary><div className="player-name-grid" aria-label={`Username pemain ${sideName}`}>
        {DEFAULT_PLAYER_NAMES.map((fallback, index) => {
          const playerIndex = pickOrder[index] ?? index;
          return (
            <label className="player-name-field" key={playerIndex}>
              <span>{`PLAYER 0${playerIndex + 1}`}</span>
              <input value={meta.players?.[playerIndex] ?? fallback} placeholder="Username" aria-label={`Username ${sideName} player ${playerIndex + 1}`} onChange={(event) => onPlayerNameChange?.(side, playerIndex, event.target.value)} />
            </label>
          );
        })}
      </div></details>}
      <div className="team-lower">
        <div className="ban-area">
          <span className="micro-label">BAN HERO <b>{team.bans.filter((ban) => !ban.skipped).length}/5</b></span>
          <div className="ban-list">
            {Array.from({ length: 5 }, (_, index) => (
              <TeamSlot key={index} hero={team.bans[index]} index={index} side={side} action="ban" activeTurn={isBanning && index === team.bans.length} onRemove={() => onRemove?.("bans", index)} />
            ))}
          </div>
        </div>
        <details className="team-composition"><summary aria-label={`Lihat komposisi role dan damage ${sideName}`}>ROLE</summary><div className="team-readout">
          <div className="readout-heading"><span>KOMPOSISI</span><span>{pickedHeroes.length}/5</span></div>
          <RoleBars heroes={pickedHeroes} />
          <div className="damage-readout"><span><i className="damage-dot physical" /> PHYSICAL <b>{damageCounts.Physical || 0}</b></span><span><i className="damage-dot magic" /> MAGIC <b>{damageCounts.Magic || 0}</b></span></div>
        </div></details>
      </div>
    </section>
  );
}

function App() {
  const pagePath = window.location.pathname.replace(/\/$/, "");
  const isObs = pagePath === "/obs";
  const isSplashGallery = pagePath === "/seeallsplash";
  const [event, setEvent] = useState({ name: "CSS ILKOM UNNES 2025", instagram: "https://www.instagram.com/css_official2026/", tagline: "Baca draft. Susun strategi. Menangkan pertandingan.", edition: "SPECIAL EVENT EDITION" });
  const [heroes, setHeroes] = useState(heroesFallback);
  const [splashFocalPoints, setSplashFocalPoints] = useState(readSavedSplashFocusPoints);
  const [hasSplashFocusApi, setHasSplashFocusApi] = useState(false);
  const [draft, setDraft] = useState(restoreDraft);
  const [settings, setSettings] = useState(() => {
    return readSavedAppState().settings || { mode: "standard", rank: "Mythic+", first: "blue", timed: true };
  });
  const [teamMeta, setTeamMeta] = useState(() => normalizeTeamMeta(readSavedAppState().teamMeta));
  const [series, setSeries] = useState(() => ({ ...DEFAULT_SERIES, ...readSavedAppState().series }));
  const [filter, setFilter] = useState("Semua");
  const [query, setQuery] = useState("");
  const [seconds, setSeconds] = useState(() => readSavedAppState().seconds ?? 30);
  const [freeSlot, setFreeSlot] = useState(0);
  const [swapSelection, setSwapSelection] = useState([]);
  const [notice, setNotice] = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    const resetProvidedPoints = localStorage.getItem(SPLASH_FOCUS_REVISION_KEY) !== SPLASH_FOCUS_REVISION;
    Promise.all([
      fetch("/api/config", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
      fetch("/api/heroes", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
      fetch("/api/splash-focus", { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
    ])
      .then(([config, roster, savedFocalPoints]) => {
        if (config?.event) setEvent(config.event);
        if (Array.isArray(roster) && roster.length) setHeroes(roster);
        let localFocalPoints = {};
        try {
          const parsed = JSON.parse(localStorage.getItem(SPLASH_FOCUS_STORAGE_KEY) || "{}");
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) localFocalPoints = parsed;
        } catch {}
        if (resetProvidedPoints) {
          for (const key of USER_SET_SPLASH_FOCAL_KEYS) delete localFocalPoints[key];
          localStorage.setItem(SPLASH_FOCUS_STORAGE_KEY, JSON.stringify(localFocalPoints));
        }
        if (savedFocalPoints && typeof savedFocalPoints === "object" && !Array.isArray(savedFocalPoints)) {
          setHasSplashFocusApi(true);
          const remoteFocalPoints = { ...savedFocalPoints };
          if (resetProvidedPoints) {
            for (const key of USER_SET_SPLASH_FOCAL_KEYS) delete remoteFocalPoints[key];
          }
          setSplashFocalPoints({ ...DEFAULT_SPLASH_FOCAL_POINTS, ...remoteFocalPoints, ...localFocalPoints });
          if (resetProvidedPoints || Object.keys(localFocalPoints).length) {
            const combined = { ...remoteFocalPoints, ...localFocalPoints };
            fetch("/api/splash-focus", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(combined),
            }).then((response) => {
              if (response.ok) {
                localStorage.removeItem(SPLASH_FOCUS_STORAGE_KEY);
                localStorage.setItem(SPLASH_FOCUS_REVISION_KEY, SPLASH_FOCUS_REVISION);
              }
            }).catch(() => {});
          }
        } else {
          setHasSplashFocusApi(false);
          setSplashFocalPoints({ ...DEFAULT_SPLASH_FOCAL_POINTS, ...localFocalPoints });
          if (resetProvidedPoints) localStorage.setItem(SPLASH_FOCUS_REVISION_KEY, SPLASH_FOCUS_REVISION);
        }
      }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isObs && !isSplashGallery) {
      const snapshot = JSON.stringify({ draft, settings, teamMeta, series, seconds });
      localStorage.setItem(STORAGE_KEY, snapshot);
      fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: snapshot }).catch(() => {});
    }
  }, [draft, settings, teamMeta, series, seconds, isObs, isSplashGallery]);

  useEffect(() => {
    document.body.classList.toggle("obs-body", isObs);
    document.body.classList.toggle("splash-review-body", isSplashGallery);
    return () => {
      document.body.classList.remove("obs-body");
      document.body.classList.remove("splash-review-body");
    };
  }, [isObs, isSplashGallery]);

  useEffect(() => {
    if (!isObs) return undefined;
    let lastSignature = "";
    const applySnapshot = (saved) => {
      if (!saved?.draft) return;
      const signature = JSON.stringify(saved);
      if (signature === lastSignature) return;
      lastSignature = signature;
      if (saved.draft) setDraft(saved.draft);
      if (saved.settings) setSettings(saved.settings);
      if (saved.teamMeta) setTeamMeta(normalizeTeamMeta(saved.teamMeta));
      if (saved.series) setSeries({ ...DEFAULT_SERIES, ...saved.series });
      if (Number.isFinite(saved.seconds)) setSeconds(saved.seconds);
    };
    const onStorage = (storageEvent) => {
      if (storageEvent.key !== STORAGE_KEY || !storageEvent.newValue) return;
      try {
        applySnapshot(JSON.parse(storageEvent.newValue));
      } catch {}
    };
    const stream = new EventSource("/api/state/stream");
    stream.onmessage = (event) => {
      try { applySnapshot(JSON.parse(event.data)); } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => {
      stream.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [isObs]);

  useEffect(() => {
    const onSplashFocusStorage = (event) => {
      if (event.key !== SPLASH_FOCUS_STORAGE_KEY || !event.newValue) return;
      try {
        const saved = JSON.parse(event.newValue);
        setSplashFocalPoints({ ...DEFAULT_SPLASH_FOCAL_POINTS, ...saved });
      } catch {}
    };
    window.addEventListener("storage", onSplashFocusStorage);
    return () => window.removeEventListener("storage", onSplashFocusStorage);
  }, []);

  useEffect(() => {
    if (!isObs || !hasSplashFocusApi) return undefined;
    const stream = new EventSource("/api/splash-focus/stream");
    stream.onmessage = (event) => {
      try {
        const saved = JSON.parse(event.data);
        if (saved && typeof saved === "object") {
          setSplashFocalPoints({ ...DEFAULT_SPLASH_FOCAL_POINTS, ...saved });
        }
      } catch {}
    };
    return () => stream.close();
  }, [isObs, hasSplashFocusApi]);

  const turn = draft.queue[draft.turnIndex];
  const occupied = useMemo(() => new Set([
    ...draft.teams.blue.picks.filter(Boolean), ...draft.teams.red.picks.filter(Boolean),
    ...draft.teams.blue.bans, ...draft.teams.red.bans,
  ].map((hero) => hero.name)), [draft.teams]);
  const visibleHeroes = useMemo(() => [...heroes].sort((a, b) => a.name.localeCompare(b.name)).filter((hero) => {
    const roleMatch = filter === "Semua" || hero.role === filter;
    const nameMatch = hero.name.toLowerCase().includes(query.trim().toLowerCase());
    return roleMatch && nameMatch;
  }), [heroes, filter, query]);
  const takenCount = draft.teams.blue.picks.filter(Boolean).length + draft.teams.red.picks.filter(Boolean).length;
  const previousDraftState = draft.history?.[draft.history.length - 1];
  const previousTeams = previousDraftState?.teams;
  const previousPickCount = previousTeams
    ? previousTeams.blue.picks.filter(Boolean).length + previousTeams.red.picks.filter(Boolean).length
    : takenCount;
  const previousBanCount = previousTeams
    ? previousTeams.blue.bans.length + previousTeams.red.bans.length
    : draft.teams.blue.bans.length + draft.teams.red.bans.length;
  const currentBanCount = draft.teams.blue.bans.length + draft.teams.red.bans.length;
  const lastDraftAction = takenCount > previousPickCount ? "pick" : currentBanCount > previousBanCount ? "ban" : null;

  useEffect(() => {
    if (isObs || isSplashGallery) return undefined;
    if (draft.status !== "drafting" || settings.mode === "free" || !settings.timed) {
      setSeconds(30);
      return undefined;
    }
    setSeconds(30);
    const interval = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [draft.turnIndex, draft.status, settings.mode, settings.timed, isObs, isSplashGallery]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  async function saveSplashFocalPoints(nextFocalPoints) {
    const overrides = Object.fromEntries(Object.entries(nextFocalPoints)
      .filter(([key, value]) => value !== DEFAULT_SPLASH_FOCAL_POINTS[key]));
    localStorage.setItem(SPLASH_FOCUS_STORAGE_KEY, JSON.stringify(overrides));
    setSplashFocalPoints(nextFocalPoints);
    try {
      const response = await fetch("/api/splash-focus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      });
      if (response.ok) {
        localStorage.removeItem(SPLASH_FOCUS_STORAGE_KEY);
        setHasSplashFocusApi(true);
        return true;
      }
    } catch {}
    return false;
  }

  function startDraft() {
    const next = newDraft();
    next.mode = settings.mode;
    next.status = "drafting";
    next.queue = settings.mode === "free" ? [] : createQueue(settings.mode, settings.mode === "mpl" ? 3 : RANK_BANS[settings.rank], settings.first);
    setDraft(next);
    setFreeSlot(0);
    setSwapSelection([]);
  }

  function resetDraft() {
    setDraft(newDraft());
    setFreeSlot(0);
    setSwapSelection([]);
    setSeconds(30);
  }

  function skipCurrentBan() {
    const next = skipBan(draft);
    if (next === draft) return;
    setDraft(next);
    setNotice(`${teamMeta[turn.team].name}: memilih no ban.`);
  }

  function completeSwap() {
    setDraft((current) => finishSwap(current));
    setSwapSelection([]);
    setNotice("Fase swap selesai.");
  }

  function updateTeamName(side, name) {
    setTeamMeta((current) => ({ ...current, [side]: { ...current[side], name } }));
  }

  function updatePlayerName(side, index, name) {
    setTeamMeta((current) => ({ ...current, [side]: { ...current[side], players: current[side].players.map((player, playerIndex) => playerIndex === index ? name : player) } }));
  }

  function updateCurrentPicker(side, playerIndex) {
    const next = setCurrentPickPlayer(draft, side, playerIndex);
    if (next === draft) return;
    setDraft(next);
    const playerName = teamMeta[side].players[playerIndex]?.trim() || `PLAYER 0${playerIndex + 1}`;
    setNotice(`Pick ini untuk ${playerName}.`);
  }

  async function updateTeamLogo(side, file) {
    try {
      const logo = await compressTeamLogo(file);
      setTeamMeta((current) => ({ ...current, [side]: { ...current[side], logo } }));
      setNotice(`Logo ${teamMeta[side].name} diperbarui.`);
    } catch (error) {
      setNotice(error.message || "Logo tidak dapat dibaca.");
    }
  }

  function switchSides() {
    const flip = (side) => side === "blue" ? "red" : "blue";
    const flipTeams = (teams) => ({ blue: teams.red, red: teams.blue });
    setDraft((current) => ({
      ...current,
      teams: flipTeams(current.teams),
      queue: current.queue.map((step) => ({ ...step, team: flip(step.team) })),
      history: current.history.map((entry) => ({ ...entry, teams: flipTeams(entry.teams) })),
      freeSide: flip(current.freeSide),
    }));
    setSettings((current) => ({ ...current, first: flip(current.first) }));
    setTeamMeta((current) => ({ blue: current.red, red: current.blue }));
    setSeries((current) => ({ ...current, blueScore: current.redScore, redScore: current.blueScore }));
    setSwapSelection([]);
    setNotice("Blue Side dan Red Side ditukar.");
  }

  function updateSeriesFormat(format) {
    setSeries((current) => ({ ...current, format, value: format === "bestOf" ? 3 : 2 }));
  }

  function updateSeriesValue(value) {
    setSeries((current) => ({ ...current, value: Number(value) || 1 }));
  }

  function handleHeroClick(hero) {
    if (draft.status !== "drafting") {
      setNotice("Mulai draft untuk memilih hero.");
      return;
    }
    if (settings.mode === "free") {
      const side = draft.freeSide;
      const banned = [...draft.teams.blue.bans, ...draft.teams.red.bans].some((item) => item.name === hero.name);
      if (occupied.has(hero.name) || banned) return;
      setDraft((current) => {
        const team = current.teams[side];
        if (freeSlot > 4 || team.picks[freeSlot]) return current;
        const picks = [...team.picks];
        while (picks.length < 5) picks.push(null);
        picks[freeSlot] = hero;
        const nextTeams = { ...current.teams, [side]: { ...team, picks } };
        const pickCount = nextTeams.blue.picks.filter(Boolean).length + nextTeams.red.picks.filter(Boolean).length;
        return {
          ...current,
          teams: nextTeams,
          status: pickCount === 10 ? "swapping" : current.status,
          history: [...current.history, { teams: current.teams, turnIndex: current.turnIndex, status: current.status, swapCompleted: current.swapCompleted || false }],
        };
      });
      const nextSlot = draft.teams[side].picks.findIndex((item, index) => index !== freeSlot && !item);
      setFreeSlot(nextSlot >= 0 ? nextSlot : Math.min(4, freeSlot + 1));
      return;
    }
    const next = applyHero(draft, hero, settings.mode);
    if (next === draft) {
      const sameBan = turn?.action === "ban" && settings.mode === "standard" && draft.teams[turn.team === "blue" ? "red" : "blue"].bans.some((item) => item.name === hero.name);
      setNotice(sameBan ? "Hero itu sudah di-ban sisi lawan." : "Hero sudah terpilih atau di-ban.");
      return;
    }
    setDraft(next);
  }

  function selectSwapSlot(side, index) {
    if (draft.status !== "swapping" || !draft.teams[side].picks[index]) return;
    if (!swapSelection.length) {
      setSwapSelection([{ side, index }]);
      return;
    }

    const first = swapSelection[0];
    if (first.side !== side) {
      setSwapSelection([{ side, index }]);
      setNotice("Pilih dua hero dari tim yang sama.");
      return;
    }
    if (first.index === index) {
      setSwapSelection([]);
      return;
    }
    setSwapSelection([first, { side, index }]);
  }

  function swapSelectedHeroes() {
    if (swapSelection.length !== 2 || swapSelection[0].side !== swapSelection[1].side) return;
    const [first, second] = swapSelection;
    const next = swapHeroes(draft, first.side, first.index, second.index);
    if (next === draft) return;
    setDraft(next);
    setSwapSelection([]);
    setNotice("Hero berhasil ditukar.");
  }

  function removeHero(side, collection, index) {
    if (draft.status === "drafting" && settings.mode !== "free") return;
    setDraft((current) => {
      const nextCollection = collection === "picks" && settings.mode === "free"
        ? current.teams[side].picks.map((item, i) => i === index ? null : item)
        : current.teams[side][collection].filter((_, i) => i !== index);
      const nextTeam = { ...current.teams[side], [collection]: nextCollection };
      return { ...current, teams: { ...current.teams, [side]: nextTeam } };
    });
  }

  async function shareDraft() {
    const format = (side) => `${side === "blue" ? "BLUE" : "RED"}: ${draft.teams[side].picks.filter(Boolean).map((hero) => hero.name).join(", ") || "belum ada pick"}`;
    const text = `${event.name} — draft simulator\n${format("blue")}\n${format("red")}`;
    try {
      if (navigator.share) await navigator.share({ title: event.name, text });
      else { await navigator.clipboard.writeText(text); setNotice("Ringkasan draft tersalin."); }
    } catch { setNotice("Ringkasan draft siap dibagikan."); }
  }

  const phaseText = draft.status === "swapping" ? "SWAP HERO"
    : draft.status === "complete" ? "DRAFT SELESAI"
      : settings.mode === "free" ? (draft.status === "drafting" ? `SUSUN ${draft.freeSide === "blue" ? "BLUE" : "RED"}` : "SIAPKAN DRAFT")
        : draft.status === "drafting" ? `${turn?.action === "ban" ? "BAN" : "PICK"} ${turn?.team === "blue" ? "BLUE" : "RED"}` : "SIAP MULAI";
  const currentTeam = turn?.team;
  const maxBanCount = settings.mode === "mpl" ? 5 : RANK_BANS[settings.rank];
  const canUndo = draft.history.length > 0;
  const targetWins = series.format === "bestOf" ? Math.ceil(series.value / 2) : series.value;
  const seriesLabel = series.format === "bestOf" ? `BO${series.value} · FIRST TO ${targetWins}` : `FIRST TO ${series.value}`;

  if (isSplashGallery) return <SplashFocusGallery heroes={heroes} focalPoints={splashFocalPoints} onSave={saveSplashFocalPoints} />;

  if (isObs) return <ObsOverlay event={event} draft={draft} teamMeta={teamMeta} series={series} seriesLabel={seriesLabel} phaseText={phaseText} seconds={seconds} timerEnabled={settings.timed && settings.mode !== "free" && draft.status === "drafting"} splashFocalPoints={splashFocalPoints} />;

  return (
    <main className={`app-shell training-screen ${draft.status !== "setup" ? "live-draft" : ""}`}>
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <div className={`training-score-team blue ${currentTeam === "blue" ? "score-active" : ""}`}>
          <label className="training-team-crest" title="Unggah logo Blue">
            {teamMeta.blue.logo ? <img src={teamMeta.blue.logo} alt="" /> : "B"}
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Unggah logo Blue" onChange={(event) => { const file = event.target.files?.[0]; if (file) updateTeamLogo("blue", file); event.target.value = ""; }} />
          </label>
          <input className="training-team-name" value={teamMeta.blue.name} maxLength={24} aria-label="Nama Blue" onChange={(event) => updateTeamName("blue", event.target.value)} />
          <span>{draft.teams.blue.bans.filter((ban) => !ban.skipped).length}/{maxBanCount} BAN · {draft.teams.blue.picks.filter(Boolean).length}/5 PICK</span>
        </div>
        <div className={`training-timer ${seconds <= 5 && settings.timed && draft.status === "drafting" ? "clock-low" : ""}`}>
          <span>◷</span>{draft.status === "drafting" && settings.timed && settings.mode !== "free" ? `00:${String(seconds).padStart(2, "0")}` : settings.timed && settings.mode !== "free" ? "30S" : "∞"}
        </div>
        <div className={`training-score-team red ${currentTeam === "red" ? "score-active" : ""}`}>
          <label className="training-team-crest" title="Unggah logo Red">
            {teamMeta.red.logo ? <img src={teamMeta.red.logo} alt="" /> : "R"}
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Unggah logo Red" onChange={(event) => { const file = event.target.files?.[0]; if (file) updateTeamLogo("red", file); event.target.value = ""; }} />
          </label>
          <input className="training-team-name" value={teamMeta.red.name} maxLength={24} aria-label="Nama Red" onChange={(event) => updateTeamName("red", event.target.value)} />
          <span>{draft.teams.red.bans.filter((ban) => !ban.skipped).length}/{maxBanCount} BAN · {draft.teams.red.picks.filter(Boolean).length}/5 PICK</span>
        </div>
        <a className="brand" href="#top" aria-label="CSS Draft Lab home">
          <span className="brand-mark"><span>CSS</span><i /></span>
          <span className="brand-copy"><b>CSS<span> / </span>DRAFT LAB</b><small>ILMU KOMPUTER · UNNES</small></span>
        </a>
        <div className="top-event"><span className="live-dot" />{event.edition || "SPECIAL EVENT EDITION"}<b>{event.name}</b></div>
        <div className="top-actions"><span className="build-version">SEASON <b>25</b></span><a className="obs-link" href="/obs" target="_blank" rel="noreferrer">OBS OVERLAY <span>↗</span></a><a className="social-link" href={event.instagram} target="_blank" rel="noreferrer" aria-label="Instagram CSS">IG <span>↗</span></a></div>
      </header>

      <section className={`hero-intro ${draft.status !== "setup" ? "intro-hidden" : ""}`} id="top">
        <div className="intro-copy">
          <div className="eyebrow"><span>01</span><i /> MOBILE LEGENDS · DRAFT SIMULATOR</div>
          <h1>Draft Pick<span className="period">.</span></h1>
          <p>Simulasikan pick dan ban sebelum pertandingan dimulai.</p>
        </div>
        <div className="intro-stats"><div><b>05</b><span>HERO / TIM</span></div><div><b>03</b><span>MODE DRAFT</span></div><div className="stat-mark">CSS<span>×</span>MLBB</div></div>
      </section>

      <section className="control-deck">
        <div className="mode-selector" aria-label="Pilih mode draft">
          {Object.entries(MODE_COPY).map(([key, copy]) => (
            <button className={`mode-choice ${settings.mode === key ? "mode-active" : ""}`} key={key} onClick={() => { setSettings((value) => ({ ...value, mode: key })); resetDraft(); }} type="button">
              <span className="mode-index">{copy.mark}</span><span className="mode-name">{copy.label}<small>{copy.sub}</small></span><span className="mode-check">{settings.mode === key ? "●" : "○"}</span>
            </button>
          ))}
        </div>
        <div className="setup-fields">
          {settings.mode !== "free" && <label className="setup-select"><span>RANK</span><select value={settings.rank} onChange={(event) => { setSettings((value) => ({ ...value, rank: event.target.value })); if (draft.status !== "setup") resetDraft(); }}><option>Epic</option><option>Legend</option><option>Mythic+</option></select><b>{ICONS.down}</b></label>}
          <label className="setup-select"><span>FIRST PICK</span><select value={settings.first} onChange={(event) => { setSettings((value) => ({ ...value, first: event.target.value })); if (draft.status !== "setup") resetDraft(); }}><option value="blue">Blue side</option><option value="red">Red side</option></select><b>{ICONS.down}</b></label>
          <button className={`timer-toggle ${settings.timed && settings.mode !== "free" ? "toggle-on" : ""}`} onClick={() => setSettings((value) => ({ ...value, timed: !value.timed }))} type="button"><span className="timer-glyph">◷</span><span><b>{settings.timed && settings.mode !== "free" ? "30 DETIK" : "SANTAI"}</b><small>TIMER PICK</small></span><i /></button>
          <button className="start-button" onClick={draft.status === "swapping" ? completeSwap : startDraft} type="button"><span>{draft.status === "swapping" ? "SELESAI SWAP" : draft.status === "drafting" ? "RESTART DRAFT" : draft.status === "complete" ? "DRAFT BARU" : "MULAI DRAFT"}</span><b>↗</b></button>
        </div>
      </section>

      <section className="series-strip" aria-label="Pengaturan seri dan nama tim">
        <a className="obs-link" href="/obs" target="_blank" rel="noreferrer">OBS OVERLAY ↗</a>
        <div className="series-format-controls">
          <span className="series-kicker">MATCH FORMAT</span>
          <select value={series.format} onChange={(event) => updateSeriesFormat(event.target.value)} aria-label="Format seri">
            <option value="bestOf">Best of</option><option value="firstTo">First to</option>
          </select>
          <select value={series.value} onChange={(event) => updateSeriesValue(event.target.value)} aria-label="Jumlah game atau target kemenangan">
            {(series.format === "bestOf" ? [1, 3, 5, 7, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9]).map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
          <b>{seriesLabel}</b>
        </div>
        <div className="series-score-controls">
          <label className="series-score blue-score"><span>{teamMeta.blue.name}</span><input type="number" min="0" max="99" value={series.blueScore} aria-label={`Skor ${teamMeta.blue.name}`} onChange={(event) => setSeries((current) => ({ ...current, blueScore: Math.max(0, Number(event.target.value) || 0) }))} /></label>
          <span className="score-divider">:</span>
          <label className="series-score red-score"><input type="number" min="0" max="99" value={series.redScore} aria-label={`Skor ${teamMeta.red.name}`} onChange={(event) => setSeries((current) => ({ ...current, redScore: Math.max(0, Number(event.target.value) || 0) }))} /><span>{teamMeta.red.name}</span></label>
        </div>
        <button className="switch-side-button" type="button" onClick={switchSides}><span>⇄</span> SWITCH SIDES</button>
      </section>

      <section className="draft-stage">
        <div className="stage-head">
          <div className="stage-heading"><span className="eyebrow"><span>02</span><i /> LIVE DRAFT ROOM</span><h2>Pick &amp; Ban</h2></div>
          <div className="stage-status"><span className={`status-pip ${draft.status}`} />{phaseText}<span className="status-separator">/</span><b>{draft.status === "setup" ? seriesLabel : `PICK ${String(takenCount).padStart(2, "0")}/10`}</b></div>
          <div className="stage-actions">{draft.status === "drafting" && turn?.action === "ban" && <button className="skip-ban-button" title="Lewati giliran ban tanpa memilih hero" aria-label="Lewati giliran ban tanpa memilih hero" onClick={skipCurrentBan} type="button">NO BAN</button>}{draft.status === "swapping" && swapSelection.length === 2 && <button className="swap-button" onClick={swapSelectedHeroes} type="button">TUKAR HERO</button>}<div className={`clock ${seconds <= 5 && settings.timed && draft.status === "drafting" ? "clock-low" : ""}`}><span>◷</span>{settings.timed && settings.mode !== "free" && draft.status === "drafting" ? `00:${String(seconds).padStart(2, "0")}` : "∞"}</div><button className={lastDraftAction ? "cancel-turn-button" : "icon-button"} title={lastDraftAction ? `Batalkan ${lastDraftAction} terakhir` : "Undo aksi terakhir"} aria-label={lastDraftAction ? `Batalkan ${lastDraftAction} terakhir` : "Undo aksi terakhir"} onClick={() => { setDraft((state) => undoDraft(state)); setNotice(lastDraftAction ? `${lastDraftAction === "pick" ? "Pick" : "Ban"} terakhir dibatalkan.` : "Aksi terakhir dibatalkan."); }} disabled={!canUndo}>{lastDraftAction ? <><span>{ICONS.back}</span><b>BATALKAN {lastDraftAction.toUpperCase()}</b></> : ICONS.back}</button><button className="icon-button" title="Bagikan draft" onClick={shareDraft}>{ICONS.share}</button><button className="icon-button" title="Reset draft" onClick={resetDraft}>{ICONS.restart}</button></div>
        </div>

        <div className="teams-wrap">
          <TeamPanel side="blue" team={draft.teams.blue} meta={teamMeta.blue} editable active={draft.status === "drafting" && (settings.mode === "free" ? draft.freeSide === "blue" : currentTeam === "blue")} currentAction={turn?.action} freeMode={settings.mode === "free" && draft.status === "drafting"} freeSide={draft.freeSide} freeSlot={freeSlot} swapMode={draft.status === "swapping"} selectedSwapSlots={swapSelection.filter((item) => item.side === "blue").map((item) => item.index)} onSwapSelect={(index) => selectSwapSlot("blue", index)} onPickPlayerChange={updateCurrentPicker} onNameChange={updateTeamName} onLogoChange={updateTeamLogo} onPlayerNameChange={updatePlayerName} onSelectSlot={(index) => { setDraft((state) => ({ ...state, freeSide: "blue" })); setFreeSlot(index); }} onSetFreeSide={(side) => { setDraft((state) => ({ ...state, freeSide: side })); setFreeSlot(Math.max(0, draft.teams[side].picks.findIndex((item) => !item))); }} onRemove={(kind, index) => removeHero("blue", kind, index)} />
          <div className="versus"><span>CSS</span><b>VS</b><i>UNNES<br />2025</i></div>
          <TeamPanel side="red" team={draft.teams.red} meta={teamMeta.red} editable active={draft.status === "drafting" && (settings.mode === "free" ? draft.freeSide === "red" : currentTeam === "red")} currentAction={turn?.action} freeMode={settings.mode === "free" && draft.status === "drafting"} freeSide={draft.freeSide} freeSlot={freeSlot} swapMode={draft.status === "swapping"} selectedSwapSlots={swapSelection.filter((item) => item.side === "red").map((item) => item.index)} onSwapSelect={(index) => selectSwapSlot("red", index)} onPickPlayerChange={updateCurrentPicker} onNameChange={updateTeamName} onLogoChange={updateTeamLogo} onPlayerNameChange={updatePlayerName} onSelectSlot={(index) => { setDraft((state) => ({ ...state, freeSide: "red" })); setFreeSlot(index); }} onRemove={(kind, index) => removeHero("red", kind, index)} />
        </div>
      </section>

      <section className="hero-pool-section">
        <div className="pool-heading">
          <div><span className="eyebrow"><span>03</span><i /> HERO DATABASE</span><h2>Hero pool <span>{visibleHeroes.length}<small> / {heroes.length}</small></span></h2></div>
          <label className="search-box"><span>{ICONS.search}</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari hero..." aria-label="Cari hero" /><kbd>CTRL K</kbd></label>
        </div>
        <div className="pool-tools">
          <div className="role-filters">{ROLE_FILTERS.map((role) => <button key={role} className={filter === role ? "filter-active" : ""} onClick={() => setFilter(role)} type="button">{role !== "Semua" && <i>{ROLE_MARK[role]}</i>}{role}</button>)}</div>
          <div className={`pool-hint ${draft.status === "drafting" && turn?.action === "ban" ? "pool-ban-turn" : draft.status === "drafting" ? "pool-pick-turn" : ""}`}><span>{draft.status === "swapping" ? "SWAP" : draft.status === "drafting" ? settings.mode === "free" ? "PICK" : turn?.action?.toUpperCase() || "PICK" : "DRAFT"}</span>{draft.status === "swapping" ? swapSelection.length === 0 ? "PILIH DUA HERO DARI TIM YANG SAMA" : swapSelection.length === 1 ? "PILIH HERO KEDUA" : "KLIK TUKAR HERO" : draft.status === "drafting" ? settings.mode === "free" ? `PILIH HERO UNTUK ${draft.freeSide.toUpperCase()}` : `${turn?.action === "ban" ? "BAN" : "PICK"} HERO UNTUK ${turn?.team?.toUpperCase()}` : draft.status === "complete" ? "DRAFT SELESAI" : "MULAI DRAFT UNTUK MEMILIH"}</div>
        </div>
        <div className="hero-grid">
          {visibleHeroes.map((hero, index) => {
            const picked = [...draft.teams.blue.picks, ...draft.teams.red.picks].some((item) => item?.name === hero.name);
            const allBans = [...draft.teams.blue.bans, ...draft.teams.red.bans];
            const bannedByThisSide = turn && draft.teams[turn.team].bans.some((item) => item.name === hero.name);
            const bannedAnywhere = allBans.some((item) => item.name === hero.name);
            const unavailable = draft.status !== "drafting" || picked || bannedByThisSide || (settings.mode === "mpl" && bannedAnywhere) || (turn?.action === "pick" && bannedAnywhere) || (settings.mode === "free" && bannedAnywhere);
            return <button className={`hero-card ${unavailable ? "hero-disabled" : ""}`} key={hero.name} onClick={() => handleHeroClick(hero)} type="button" disabled={unavailable} style={{ "--hero-tone": hero.tone }}>
              <span className={`hero-card-art ${hero.portrait ? "has-portrait" : ""}`}>
                <span className="hero-art-grid" />
                {hero.portrait && <img src={hero.portrait} alt="" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement.classList.remove("has-portrait"); }} />}
                <b>{hero.symbol}</b><i>{String(index + 1).padStart(2, "0")}</i><span className="hero-role-mark">{ROLE_MARK[hero.role]}</span>
              </span>
              <span className="hero-card-info"><b>{hero.name}</b><small>{hero.role.toUpperCase()}</small></span>
              {picked && <span className="hero-picked">PICKED</span>}{bannedAnywhere && <span className="hero-picked">BANNED</span>}
            </button>;
          })}
          {visibleHeroes.length === 0 && <div className="empty-search">Tidak ada hero yang cocok dengan pencarianmu.</div>}
        </div>
      </section>

      <footer className="footer"><div className="footer-brand"><span className="brand-mark small-mark"><span>CSS</span><i /></span><span>CSS ILKOM UNNES <b>2025</b></span></div><p>Fan-made draft room · Mobile Legends: Bang Bang</p><a href={event.instagram} target="_blank" rel="noreferrer">FOLLOW CSS <span>↗</span></a></footer>
      <div className={`toast ${notice ? "toast-show" : ""}`} role="status">{notice}</div>
    </main>
  );
}

export default App;

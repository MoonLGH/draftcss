import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSplashBackgroundPosition, getSplashFocalX, getSplashKey } from "./splashFocus.js";

function SplashFocusCard({ hero, focalX, focalPoints, onFocusChange, onSave }) {
  const dragRef = useRef(null);
  const image = hero.splashArt || hero.portrait;
  const focusKey = getSplashKey(hero);

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, focalX, nextX: focalX };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const width = event.currentTarget.getBoundingClientRect().width;
    const nextX = Math.max(0, Math.min(1, drag.focalX - ((event.clientX - drag.startX) / width) * 0.4));
    drag.nextX = nextX;
    onFocusChange(focusKey, nextX);
  }

  async function handlePointerUp(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    await onSave(focusKey, drag.nextX);
  }

  function handleKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const nextX = Math.max(0, Math.min(1, focalX + direction * 0.02));
    onFocusChange(focusKey, nextX);
    onSave(focusKey, nextX);
  }

  return (
    <article className="splash-focus-card">
      <header className="splash-focus-card-heading">
        <strong>{hero.name}</strong>
        <span>{hero.role || "HERO"}</span>
      </header>
      <div className="splash-focus-card-images">
        <div className="splash-focus-source" title="Garis kuning menandai titik fokus pada file asli">
          <img src={image} alt={`${hero.name} splash asli`} loading="lazy" decoding="async" />
          <i style={{ left: `${focalX * 100}%` }} />
        </div>
        <div
          className="splash-focus-crop"
          role="slider"
          tabIndex={0}
          aria-label={`Atur titik fokus splash ${hero.name}; geser horizontal atau gunakan panah kiri dan kanan`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(focalX * 100)}
          title="Geser preview ke kiri atau kanan untuk mengatur fokus"
          style={{ backgroundImage: `url("${image}")`, backgroundPosition: getSplashBackgroundPosition(hero, focalPoints) }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          <i aria-hidden="true" />
        </div>
        <div className="splash-focus-card-readout">
          <b>{Math.round(focalX * 100)}%</b>
          <span>FOKUS X</span>
          <small>Geser preview untuk membetulkan posisi.</small>
        </div>
      </div>
    </article>
  );
}

export default function SplashFocusGallery({ heroes, focalPoints, onSave }) {
  const [query, setQuery] = useState("");
  const [focusMap, setFocusMap] = useState(focalPoints);
  const [saveState, setSaveState] = useState("Tersimpan");
  const focusMapRef = useRef(focusMap);

  useEffect(() => {
    focusMapRef.current = focalPoints;
    setFocusMap(focalPoints);
  }, [focalPoints]);

  const visibleHeroes = useMemo(() => [...heroes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((hero) => hero.name.toLowerCase().includes(query.trim().toLowerCase())), [heroes, query]);

  function changeFocus(key, value) {
    const next = { ...focusMapRef.current, [key]: value };
    focusMapRef.current = next;
    setFocusMap(next);
    setSaveState("Belum disimpan");
  }

  async function saveFocus(key, value) {
    const next = { ...focusMapRef.current, [key]: value };
    focusMapRef.current = next;
    setFocusMap(next);
    setSaveState("Menyimpan...");
    try {
      const savedRemotely = await onSave(next);
      setSaveState(savedRemotely ? "Tersimpan" : "Tersimpan di browser");
    } catch {
      setSaveState("Gagal menyimpan");
    }
  }

  return (
    <main className="splash-focus-page">
      <header className="splash-focus-header">
        <a className="splash-focus-back" href="/">&larr; Draft Lab</a>
        <div className="splash-focus-title">
          <span>OBS / VISUAL CHECK</span>
          <h1>Semua splash</h1>
          <p>Geser preview crop ke kiri atau kanan untuk menaruh wajah di garis tengah.</p>
        </div>
        <div className={`splash-focus-save ${saveState === "Gagal menyimpan" ? "has-error" : ""}`} aria-live="polite">
          <i />{saveState}
        </div>
      </header>
      <section className="splash-focus-toolbar">
        <span>{visibleHeroes.length} / {heroes.length} HERO</span>
        <label className="splash-focus-search">
          <span>CARI HERO</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Contoh: Cici" />
        </label>
      </section>
      <section className="splash-focus-grid" aria-label="Semua splash hero">
        {visibleHeroes.map((hero) => {
          const key = getSplashKey(hero);
          const focalX = getSplashFocalX(hero, focusMap);
          return <SplashFocusCard key={key} hero={hero} focalX={focalX} focalPoints={focusMap} onFocusChange={changeFocus} onSave={saveFocus} />;
        })}
      </section>
    </main>
  );
}

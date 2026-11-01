import React, { useEffect, useMemo, useState } from "react";
import { getSplashBackgroundPosition } from "./splashFocus.js";
import { analyzeDraft } from "./draftAnalysis.js";

function AnalysisPanel({ analysis }) {
  const scoreboard = analysis.scoreboard;
  return (
    <div className="obs-analysis" aria-label="Analisis draft MLBBHub" aria-live="polite">
      <div className="obs-analysis-scroll">
        <header className="obs-analysis-heading">
          <div className="obs-analysis-score-row">
            <div className="obs-analysis-side-score blue"><strong>{scoreboard?.blue ?? 50}</strong><span>BLUE</span></div>
            <strong className="obs-analysis-title">DRAFT EDGE</strong>
            <div className="obs-analysis-side-score red"><span>RED</span><strong>{scoreboard?.red ?? 50}</strong></div>
          </div>
          <span className={`obs-analysis-verdict ${scoreboard?.leader || "even"}`}>
            {scoreboard?.verdict || "Menunggu pick dari kedua sisi"}
          </span>
          <div className="obs-analysis-score-track" aria-label={`Blue ${scoreboard?.blue ?? 50}, Red ${scoreboard?.red ?? 50}`}>
            <i style={{ width: `${scoreboard?.blue ?? 50}%` }} />
          </div>
        </header>

        <section className="obs-analysis-metrics" aria-label="Rincian draft">
          {(scoreboard?.metrics || []).map((metric) => {
            const blueShare = Math.round(((metric.value ?? 0) + 1) * 50);
            const redShare = 100 - blueShare;
            return <article className={`obs-analysis-metric ${metric.key}`} key={metric.key}>
              <div className="obs-analysis-metric-heading">
                <strong>{metric.label}</strong>
                <div className="obs-analysis-metric-sides" aria-hidden="true"><span>BLUE</span><span>RED</span></div>
              </div>
              <div className="obs-analysis-metric-track" role="img" aria-label={`${metric.label}: Blue ${blueShare}%, Red ${redShare}%`}>
                <i className="blue" style={{ width: `${blueShare}%` }} />
                <i className="red" style={{ width: `${redShare}%` }} />
              </div>
              <span>{metric.detail}</span>
            </article>;
          })}
        </section>

        <section className="obs-analysis-coach">
          <h3>CATATAN COACH</h3>
          {analysis.coachNotes.length
            ? <ul>{analysis.coachNotes.map((note, index) => <li className={note.tone} key={`${index}-${note.text}`}>{note.text}</li>)}</ul>
            : <p>Belum ada catatan untuk draft saat ini.</p>}
        </section>
      </div>
    </div>
  );
}

function BroadcastTeam({ side, team, meta, active, splashFocalPoints }) {
  const picks = team.picks || [];
  const bans = team.bans || [];

  return (
    <section className={`obs-team-column ${side} ${active ? "obs-active-side" : ""}`}>
      <div className="obs-bans">
        {Array.from({ length: 5 }, (_, index) => {
          const hero = bans[index];
          return <div className={`obs-ban-slot ${hero && !hero.skipped ? "has-hero" : ""} ${hero?.skipped ? "no-ban" : ""}`} key={index}>
            {hero?.skipped ? <span>NO BAN</span> : hero ? <><img src={hero.portrait} alt="" loading="lazy" /><i aria-hidden="true">X</i></> : <span>{String(index + 1).padStart(2, "0")}</span>}
          </div>;
        })}
      </div>

      <div className="obs-picks">
        {Array.from({ length: 5 }, (_, index) => {
          const hero = picks[index];
          const playerIndex = team.pickOrder?.[index] ?? index;
          const username = String(meta.players?.[playerIndex] || "").trim() || `PLAYER 0${playerIndex + 1}`;
          return <div className={`obs-pick-slot ${hero ? "has-hero" : ""}`} key={index}>
            {hero ? <>
              <div className="obs-pick-art" style={{ "--pick-art": `url("${hero.splashArt || hero.portrait || ""}")`, "--splash-position": getSplashBackgroundPosition(hero, splashFocalPoints), "--splash-delay": `${index * -2.4}s` }}>
                <div className="obs-pick-copy">
                  <span className="obs-player-name" title={username}>{username}</span>
                  <strong>{hero.name}</strong>
                </div>
              </div>
            </> : <>
              <span className="obs-slot-index">0{index + 1}</span>
              <span className="obs-slot-plus">+</span>
              <span className="obs-empty-player">{username}</span>
            </>}
          </div>;
        })}
      </div>
    </section>
  );
}

export default function ObsOverlay({ draft, teamMeta, series, seconds, timerEnabled, splashFocalPoints }) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const currentTurn = draft.queue[draft.turnIndex];
  const targetWins = series.format === "bestOf" ? Math.ceil(series.value / 2) : series.value;
  const blueActive = draft.status === "drafting" && (currentTurn?.team === "blue" || (!currentTurn && draft.mode === "free" && draft.freeSide === "blue"));
  const redActive = draft.status === "drafting" && (currentTurn?.team === "red" || (!currentTurn && draft.mode === "free" && draft.freeSide === "red"));
  const analysis = useMemo(
    () => analyzeDraft(draft.teams.blue.picks || [], draft.teams.red.picks || []),
    [draft.teams.blue.picks, draft.teams.red.picks],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() !== "a" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const targetTag = event.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(targetTag) || event.target?.isContentEditable) return;
      setAnalysisOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <main className="obs-overlay">
      <section className="obs-draft-board">
        <BroadcastTeam side="blue" team={draft.teams.blue} meta={teamMeta.blue} active={blueActive} splashFocalPoints={splashFocalPoints} />
        <section className={`obs-match-center ${analysisOpen ? "is-analysis" : ""}`}>
          <div className="obs-center-logos">
            <div className="obs-team-logo blue">{teamMeta.blue.logo ? <img src={teamMeta.blue.logo} alt="" /> : <span>B</span>}</div>
            <div className={`obs-clock obs-match-clock ${seconds <= 5 && seconds > 0 ? "is-low" : ""}`}>{draft.status === "drafting" && timerEnabled ? `00:${String(seconds).padStart(2, "0")}` : draft.status === "drafting" ? "∞" : "--:--"}</div>
            <div className="obs-center-vs">VS</div>
            <div className="obs-team-logo red">{teamMeta.red.logo ? <img src={teamMeta.red.logo} alt="" /> : <span>R</span>}</div>
          </div>
          <div className="obs-center-teams">
            <div className="obs-center-team blue">
              <div className="obs-team-name"><small>BLUE SIDE</small><strong>{teamMeta.blue.name}</strong></div>
              <div className="obs-score-bars" role="img" aria-label={`Skor Blue ${series.blueScore} dari ${targetWins}`}>
                {Array.from({ length: targetWins }, (_, index) => <span className={`obs-score-bar blue ${index < series.blueScore ? "is-filled" : ""}`} aria-hidden="true" key={index} />)}
              </div>
            </div>
            <div className="obs-center-team red">
              <div className="obs-team-name"><small>RED SIDE</small><strong>{teamMeta.red.name}</strong></div>
              <div className="obs-score-bars" role="img" aria-label={`Skor Red ${series.redScore} dari ${targetWins}`}>
                {Array.from({ length: targetWins }, (_, index) => <span className={`obs-score-bar red ${index < series.redScore ? "is-filled" : ""}`} aria-hidden="true" key={index} />)}
              </div>
            </div>
          </div>
          <AnalysisPanel analysis={analysis} />
        </section>
        <BroadcastTeam side="red" team={draft.teams.red} meta={teamMeta.red} active={redActive} splashFocalPoints={splashFocalPoints} />
      </section>
    </main>
  );
}

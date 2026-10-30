import React from "react";

function BroadcastTeam({ side, team, meta, active, score }) {
  const label = side === "blue" ? "BLUE SIDE" : "RED SIDE";
  const picks = team.picks || [];
  const bans = team.bans || [];

  return (
    <section className={`obs-team-column ${side} ${active ? "obs-active-side" : ""}`}>
      <div className="obs-team-heading">
        <div className="obs-team-logo">{meta.logo ? <img src={meta.logo} alt="" /> : <span>{side === "blue" ? "B" : "R"}</span>}</div>
        <div className="obs-team-name"><small>{label}</small><strong>{meta.name}</strong></div>
        <div className="obs-team-heading-stats">
          <b className="obs-team-series-score">{score}</b>
        </div>
      </div>

      <div className="obs-bans">
        <span className="obs-section-label">BANS</span>
        {Array.from({ length: 5 }, (_, index) => {
          const hero = bans[index];
          return <div className={`obs-ban-slot ${hero ? "has-hero" : ""}`} key={index}>
            {hero ? <><img src={hero.portrait} alt="" loading="lazy" /><i aria-hidden="true">X</i></> : <span>{String(index + 1).padStart(2, "0")}</span>}
          </div>;
        })}
      </div>

      <div className="obs-picks">
        {Array.from({ length: 5 }, (_, index) => {
          const hero = picks[index];
          const username = String(meta.players?.[index] || "").trim() || `PLAYER 0${index + 1}`;
          return <div className={`obs-pick-slot ${hero ? "has-hero" : ""}`} key={index}>
            {hero ? <>
              <div className="obs-pick-art" style={{ "--pick-art": `url("${hero.splashArt || hero.portrait || ""}")`, "--splash-delay": `${index * -2.4}s` }}>
                <div className="obs-pick-copy">
                  <span className="obs-player-name" title={username}>{username}</span>
                  <strong>{hero.name}</strong>
                  <small>{hero.role || "HERO"}</small>
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

export default function ObsOverlay({ event, draft, teamMeta, series, seriesLabel, phaseText, seconds, timerEnabled }) {
  const currentTurn = draft.queue[draft.turnIndex];
  const activeLabel = draft.status === "complete" ? "DRAFT COMPLETE" : draft.status === "drafting" && currentTurn ? `${currentTurn.action === "ban" ? "BAN" : "PICK"} TURN · ${currentTurn.team === "blue" ? teamMeta.blue.name : teamMeta.red.name}` : phaseText;
  const blueActive = draft.status === "drafting" && (currentTurn?.team === "blue" || (!currentTurn && draft.mode === "free" && draft.freeSide === "blue"));
  const redActive = draft.status === "drafting" && (currentTurn?.team === "red" || (!currentTurn && draft.mode === "free" && draft.freeSide === "red"));

  return (
    <main className="obs-overlay">
      <section className="obs-draft-board">
        <BroadcastTeam side="blue" team={draft.teams.blue} meta={teamMeta.blue} active={blueActive} score={series.blueScore} />
        <section className="obs-match-center">
          <small>{event.name} · MOBILE LEGENDS</small>
          <strong>{seriesLabel}</strong>
          <div className="obs-phase"><i className={draft.status === "drafting" ? "is-live" : ""} />{activeLabel}</div>
          <div className={`obs-clock ${seconds <= 5 && seconds > 0 ? "is-low" : ""}`}><span>◷</span>{draft.status === "drafting" && timerEnabled ? `00:${String(seconds).padStart(2, "0")}` : draft.status === "drafting" ? "∞" : "--:--"}</div>
        </section>
        <BroadcastTeam side="red" team={draft.teams.red} meta={teamMeta.red} active={redActive} score={series.redScore} />
      </section>
    </main>
  );
}

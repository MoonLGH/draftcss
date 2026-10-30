import React from "react";
import { getSplashBackgroundPosition } from "./splashFocus.js";

function BroadcastTeam({ side, team, meta, active, splashFocalPoints }) {
  const picks = team.picks || [];
  const bans = team.bans || [];

  return (
    <section className={`obs-team-column ${side} ${active ? "obs-active-side" : ""}`}>
      <div className="obs-bans">
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
  const currentTurn = draft.queue[draft.turnIndex];
  const targetWins = series.format === "bestOf" ? Math.ceil(series.value / 2) : series.value;
  const blueActive = draft.status === "drafting" && (currentTurn?.team === "blue" || (!currentTurn && draft.mode === "free" && draft.freeSide === "blue"));
  const redActive = draft.status === "drafting" && (currentTurn?.team === "red" || (!currentTurn && draft.mode === "free" && draft.freeSide === "red"));

  return (
    <main className="obs-overlay">
      <section className="obs-draft-board">
        <BroadcastTeam side="blue" team={draft.teams.blue} meta={teamMeta.blue} active={blueActive} splashFocalPoints={splashFocalPoints} />
        <section className="obs-match-center">
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
        </section>
        <BroadcastTeam side="red" team={draft.teams.red} meta={teamMeta.red} active={redActive} splashFocalPoints={splashFocalPoints} />
      </section>
    </main>
  );
}

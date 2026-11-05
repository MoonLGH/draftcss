import React, { useEffect, useMemo, useState } from "react";
import pddBackground from "../codex/bg toska.png";
import blueBanCircle from "../codex/Bulet biru.png";
import redBanCircle from "../codex/Bulet merah.png";
import blueBanSlash from "../codex/biru - garis dalam buletan.png";
import redBanSlash from "../codex/merah - garis dalam buletan.png";
import bluePickFrame from "../codex/Kotak biru.png";
import redPickFrame from "../codex/Kotak merah.png";
import blueScoreFrame from "../codex/Kotak score Blue Side.png";
import redScoreFrame from "../codex/Kotak score Red side.png";
import blueScoreMarks from "../codex/Biru garis dibawah kotak score.png";
import redScoreMarks from "../codex/Merah garis dibawah kotak score.png";
import blueNameplate from "../codex/Name box biru.png";
import redNameplate from "../codex/Name box merah.png";
import pddLogo from "../codex/Logo draft pick.png";
import sponsorStrip from "../codex/looping sponsor.png";
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

function PddBanRow({ side, team, active }) {
  const circle = side === "blue" ? blueBanCircle : redBanCircle;
  const slash = side === "blue" ? blueBanSlash : redBanSlash;
  return <div className={`pdd-bans ${side} ${active ? "is-active" : ""}`} aria-label={`${side} bans`}>
    {Array.from({ length: 5 }, (_, index) => {
      const hero = team.bans?.[index];
      const label = hero?.skipped ? "No ban" : hero ? `Ban ${hero.name}` : `Slot ban ${index + 1} kosong`;
      return <div className={`pdd-ban-slot ${side} ${hero && !hero.skipped ? "has-ban" : ""} ${hero?.skipped ? "no-ban" : ""}`} role="img" aria-label={label} key={index}>
        {hero && !hero.skipped && hero.portrait && <img className="pdd-ban-portrait" src={hero.portrait} alt="" decoding="async" />}
        <img className="pdd-ban-circle" src={circle} alt="" aria-hidden="true" />
        {!hero?.skipped && <img className="pdd-ban-slash" src={slash} alt="" aria-hidden="true" />}
        {hero?.skipped && <span className="pdd-no-ban">NO BAN</span>}
      </div>;
    })}
  </div>;
}

function PddPickRow({ side, team, meta, active, splashFocalPoints }) {
  const frame = side === "blue" ? bluePickFrame : redPickFrame;
  const nameplate = side === "blue" ? blueNameplate : redNameplate;
  return <div className={`pdd-picks ${side} ${active ? "is-active" : ""}`}>
    {Array.from({ length: 5 }, (_, index) => {
      const hero = team.picks?.[index];
      const playerIndex = team.pickOrder?.[index] ?? index;
      const username = String(meta.players?.[playerIndex] || "").trim() || `PLAYER 0${playerIndex + 1}`;
      return <div className={`pdd-pick-slot ${side} ${hero ? "has-hero" : ""}`} key={index} style={{ "--pick-frame": `url("${frame}")` }}>
        {hero && <span className="pdd-pick-art" style={{
          "--pick-art": `url("${hero.splashArt || hero.portrait}")`,
          "--splash-position": getSplashBackgroundPosition(hero, splashFocalPoints),
          "--splash-delay": `${index * -2.4}s`,
        }} />}
        <div className="pdd-pick-copy">
          <img className="pdd-nameplate" src={nameplate} alt="" aria-hidden="true" />
          <span className="pdd-player-name" title={username}>{username}</span>
          {hero && <strong>{hero.name}</strong>}
        </div>
      </div>;
    })}
  </div>;
}

function SeriesScoreMarks({ side, score, targetWins }) {
  const art = side === "blue" ? blueScoreMarks : redScoreMarks;
  if (targetWins === 2) {
    const filledWidth = `${Math.min(1, Math.max(0, score / targetWins)) * 100}%`;
    return <span className={`pdd-score-marks-art ${side}`} role="img" aria-label={`${score} dari ${targetWins} kemenangan`}>
      <img src={art} alt="" aria-hidden="true" />
      <img className="is-filled" src={art} alt="" aria-hidden="true" style={{ clipPath: `inset(0 ${100 - Number.parseFloat(filledWidth)}% 0 0)` }} />
    </span>;
  }
  return <span className={`pdd-score-marks ${side}`} role="img" aria-label={`${score} dari ${targetWins} kemenangan`}>
    {Array.from({ length: targetWins }, (_, index) => <i className={index < score ? "is-filled" : ""} key={index} />)}
  </span>;
}

function PddTeamScore({ side, team, score, targetWins }) {
  const frame = side === "blue" ? blueScoreFrame : redScoreFrame;
  return <div className={`pdd-score-side ${side}`}>
    <span className="pdd-score-mark">
      <img className="pdd-score-frame" src={frame} alt="" aria-hidden="true" />
      {team.logo ? <img className="pdd-score-team-logo" src={team.logo} alt="" /> : <b>{side === "blue" ? "B" : "R"}</b>}
    </span>
    <strong className="pdd-score-team-name" title={team.name}>{team.name}</strong>
    <b className="pdd-score-value">{score}<span>/{targetWins}</span></b>
    <SeriesScoreMarks side={side} score={score} targetWins={targetWins} />
  </div>;
}

export default function ObsOverlay({ event, draft, teamMeta, series, splashFocalPoints }) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const currentTurn = draft.queue[draft.turnIndex];
  const targetWins = series.format === "bestOf" ? Math.ceil(series.value / 2) : series.value;
  const blueActive = draft.status === "drafting" && (currentTurn?.team === "blue" || (!currentTurn && draft.mode === "free" && draft.freeSide === "blue"));
  const redActive = draft.status === "drafting" && (currentTurn?.team === "red" || (!currentTurn && draft.mode === "free" && draft.freeSide === "red"));
  const blueBanActive = blueActive && currentTurn?.action === "ban";
  const redBanActive = redActive && currentTurn?.action === "ban";
  const bluePickActive = blueActive && (currentTurn?.action === "pick" || draft.mode === "free");
  const redPickActive = redActive && (currentTurn?.action === "pick" || draft.mode === "free");
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
    <main className="obs-overlay pdd-overlay">
      <section className="pdd-draft-board">
        <img className="pdd-background" src={pddBackground} alt="" aria-hidden="true" />
        <img className="pdd-sponsor-strip" src={sponsorStrip} alt="" aria-hidden="true" />
        <PddBanRow side="blue" team={draft.teams.blue} active={blueBanActive} />
        <PddBanRow side="red" team={draft.teams.red} active={redBanActive} />
        <section className={`pdd-center ${analysisOpen ? "is-analysis" : ""}`}>
          <img className="pdd-main-logo" src={pddLogo} alt={event.shortName || "Draft Pick"} />
          <div className="pdd-score-row">
            <PddTeamScore side="blue" team={teamMeta.blue} score={series.blueScore} targetWins={targetWins} />
            <strong className="pdd-vs">VS</strong>
            <PddTeamScore side="red" team={teamMeta.red} score={series.redScore} targetWins={targetWins} />
          </div>
          <AnalysisPanel analysis={analysis} />
        </section>
        <PddPickRow side="blue" team={draft.teams.blue} meta={teamMeta.blue} active={bluePickActive} splashFocalPoints={splashFocalPoints} />
        <PddPickRow side="red" team={draft.teams.red} meta={teamMeta.red} active={redPickActive} splashFocalPoints={splashFocalPoints} />
      </section>
    </main>
  );
}

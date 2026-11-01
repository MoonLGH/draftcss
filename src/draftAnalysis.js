import draftAnalysisData from "../shared/draft-analysis.json";

const LANES = ["Gold", "EXP", "Mid", "Jungle", "Roam"];
const COVERED_ROLES = ["Tank", "Fighter", "Mage", "Marksman", "Assassin"];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const average = (values) => values.length
  ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10
  : null;

function getProfile(hero) {
  const profile = draftAnalysisData.heroes[hero.slug];
  if (profile) return profile;

  const role = Array.isArray(hero.role) ? hero.role : [hero.role].filter(Boolean);
  return {
    name: hero.name,
    role,
    lanes: [],
    flexLanes: [],
    damageType: hero.damage === "Magic" ? "magic" : "physical",
    damageMix: { physical: 1, magic: 0, mixed: 0 },
    hardCC: null,
    softCC: null,
    durability: null,
    counters: {},
    officialMatchups: [],
  };
}

function getLaneOptions(hero) {
  const profile = getProfile(hero);
  const lanes = [];
  const seen = new Set();

  (profile.lanes || []).forEach((lane, preference) => {
    if (!LANES.includes(lane) || seen.has(lane)) return;
    seen.add(lane);
    lanes.push({ lane, source: "primary", preference });
  });
  (profile.flexLanes || []).forEach((lane, preference) => {
    if (!LANES.includes(lane) || seen.has(lane)) return;
    seen.add(lane);
    lanes.push({ lane, source: "flex", preference });
  });
  return lanes;
}

function getPositionPlan(picks) {
  const heroes = [...picks].sort((a, b) => a.slug.localeCompare(b.slug));
  const options = new Map(heroes.map((hero) => [hero.slug, getLaneOptions(hero)]));
  let best = null;
  const assignments = [];
  const occupied = new Set();

  const visit = (index, flexCount, preferenceCost) => {
    if (index === heroes.length) {
      const laneToHero = new Map(assignments.map((entry) => [entry.lane, entry]));
      const signature = LANES.map((lane) => {
        const entry = laneToHero.get(lane);
        return entry
          ? `${lane}:${entry.source === "primary" ? "0" : "1"}:${entry.hero.slug}`
          : `${lane}:~`;
      }).join("|");
      const candidate = { assignments: [...assignments], flexCount, preferenceCost, signature };
      if (!best
        || candidate.assignments.length > best.assignments.length
        || (candidate.assignments.length === best.assignments.length && candidate.flexCount < best.flexCount)
        || (candidate.assignments.length === best.assignments.length && candidate.flexCount === best.flexCount && candidate.preferenceCost < best.preferenceCost)
        || (candidate.assignments.length === best.assignments.length && candidate.flexCount === best.flexCount && candidate.preferenceCost === best.preferenceCost && candidate.signature < best.signature)) {
        best = candidate;
      }
      return;
    }

    const hero = heroes[index];
    for (const option of options.get(hero.slug) || []) {
      if (occupied.has(option.lane)) continue;
      occupied.add(option.lane);
      assignments.push({ hero, ...option });
      visit(index + 1, flexCount + Number(option.source === "flex"), preferenceCost + option.preference);
      assignments.pop();
      occupied.delete(option.lane);
    }
    visit(index + 1, flexCount, preferenceCost);
  };

  visit(0, 0, 0);
  const assigned = [...(best?.assignments || [])].sort((a, b) => LANES.indexOf(a.lane) - LANES.indexOf(b.lane));
  const assignedSlugs = new Set(assigned.map((entry) => entry.hero.slug));
  const unassignedHeroes = heroes.filter((hero) => !assignedSlugs.has(hero.slug));
  const assignedByLane = new Map(assigned.map((entry) => [entry.lane, entry.hero]));
  const conflicts = LANES.flatMap((lane) => {
    const assignedHero = assignedByLane.get(lane);
    if (!assignedHero) return [];
    const heroesForLane = [assignedHero, ...unassignedHeroes.filter((hero) => options.get(hero.slug)?.some((option) => option.lane === lane))]
      .sort((a, b) => a.name.localeCompare(b.name));
    return heroesForLane.length > 1 ? [{ lane, heroes: heroesForLane }] : [];
  });
  const assignedLanes = new Set(assigned.map((entry) => entry.lane));

  return {
    assignments: assigned,
    assignedCount: assigned.length,
    flexCount: best?.flexCount || 0,
    missingLanes: LANES.filter((lane) => !assignedLanes.has(lane)),
    unassignedHeroes,
    conflicts,
    isFullSetup: picks.length === 5 && assigned.length === 5,
  };
}

function getDamageProfile(picks) {
  const damage = { physical: 0, magic: 0, mixed: 0, support: 0, damagingCount: 0 };

  for (const hero of picks) {
    const profile = getProfile(hero);
    const mix = profile.damageMix || {};
    let type;
    if ((mix.physical || 0) + (mix.magic || 0) + (mix.mixed || 0) > 0) {
      const physical = mix.physical || 0;
      const magic = mix.magic || 0;
      const mixed = mix.mixed || 0;
      if ((mixed > 0 || (physical > 0 && magic > 0)) && Math.min(physical, magic) > 0 && Math.max(physical, magic) / (physical + magic) <= 0.75) type = "mixed";
      else if (physical > magic) type = "physical";
      else if (magic > physical) type = "magic";
      else if (mixed > 0) type = "mixed";
    }

    if (!type) {
      const roles = profile.role || [];
      if (!roles.includes("Mage") || roles.includes("Fighter") || roles.includes("Marksman")) {
        type = roles.includes("Fighter") || roles.includes("Marksman") || roles.includes("Assassin")
          ? roles.includes("Mage") ? "mixed" : "physical"
          : "support";
      } else {
        type = "magic";
      }
    }
    damage[type] += 1;
    if (type !== "support") damage.damagingCount += 1;
  }

  return damage;
}

function getCrowdControl(picks) {
  let hardCC = 0;
  let softCC = 0;
  let hardCarriers = 0;
  for (const hero of picks) {
    const profile = getProfile(hero);
    hardCC += profile.hardCC || 0;
    softCC += profile.softCC || 0;
    if ((profile.hardCC || 0) >= 1) hardCarriers += 1;
  }
  return { hardCC, softCC, hardCarriers };
}

function hasFrontline(picks) {
  return picks.some((hero) => {
    const profile = getProfile(hero);
    const roles = profile.role || [];
    const durability = profile.durability || 0;
    return roles.includes("Tank") || (roles.includes("Fighter") ? durability >= 50 : durability >= 80);
  });
}

function getTiming(picks) {
  if (!picks.length) return null;
  const total = { early: 0, mid: 0, late: 0 };
  for (const hero of picks) {
    const roles = getProfile(hero).role || [];
    const timing = roles.includes("Assassin") ? { early: 2, mid: 1, late: 0 }
      : roles.includes("Marksman") ? { early: 0, mid: 1, late: 2 }
        : roles.includes("Mage") ? { early: 0, mid: 2, late: 1 }
          : roles.includes("Fighter") ? { early: 1, mid: 2, late: 0 }
            : roles.includes("Tank") ? { early: 2, mid: 1, late: 0 }
              : { early: 0, mid: 1, late: 1 };
    total.early += timing.early;
    total.mid += timing.mid;
    total.late += timing.late;
  }
  const sum = total.early + total.mid + total.late;
  if (!sum) return null;
  const early = Math.round(total.early / sum * 100);
  const late = Math.round(total.late / sum * 100);
  const mid = 100 - early - late;
  const peak = early >= 45 ? "early" : late >= 40 ? "late" : mid >= 45 ? "mid" : "balanced";
  return { early, mid, late, peak };
}

function analyzeTeam(picks) {
  const roles = [...new Set(picks.flatMap((hero) => getProfile(hero).role || []))];
  const winRates = picks.map((hero) => draftAnalysisData.winRates[hero.slug]?.winRate).filter((value) => typeof value === "number");
  return {
    picks,
    damage: getDamageProfile(picks),
    cc: getCrowdControl(picks),
    positionPlan: getPositionPlan(picks),
    rolesCovered: COVERED_ROLES.filter((role) => roles.includes(role)),
    avgWinRate: average(winRates),
    timing: getTiming(picks),
    hasFrontline: hasFrontline(picks),
  };
}

function counterTip(winner, loser) {
  const winnerMeta = getProfile(winner);
  const loserMeta = getProfile(loser);
  return winnerMeta.counters?.strongAgainst?.find((entry) => entry.heroSlug === loser.slug)?.tip
    || loserMeta.counters?.weakAgainst?.find((entry) => entry.heroSlug === winner.slug)?.tip
    || null;
}

function getCounterEdges(bluePicks, redPicks) {
  const edges = new Map();
  const add = (winner, loser, winnerTeam, deltaPp, source) => {
    const key = `${winner.slug}|${loser.slug}`;
    const prior = edges.get(key);
    if (prior && prior.deltaPp !== null && (deltaPp === null || Math.abs(deltaPp) <= Math.abs(prior.deltaPp))) {
      prior.tip ||= counterTip(winner, loser);
      return;
    }
    edges.set(key, { winner, loser, winnerTeam, deltaPp, source, tip: counterTip(winner, loser) });
  };

  for (const [side, attackingPicks, defendingPicks] of [["blue", bluePicks, redPicks], ["red", redPicks, bluePicks]]) {
    const opposing = new Map(defendingPicks.map((hero) => [hero.slug, hero]));
    const opposingSide = side === "blue" ? "red" : "blue";
    for (const hero of attackingPicks) {
      const matchups = draftAnalysisData.matchups[hero.slug];
      for (const matchup of matchups?.bestMatchups || []) {
        const loser = opposing.get(matchup.heroSlug);
        if (loser) add(hero, loser, side, matchup.increaseWinRate * 100, "stats");
      }
      for (const matchup of matchups?.worstMatchups || []) {
        const winner = opposing.get(matchup.heroSlug);
        if (winner) add(winner, hero, opposingSide, -(matchup.increaseWinRate * 100), "stats");
      }
      for (const matchup of getProfile(hero).counters?.strongAgainst || []) {
        const loser = opposing.get(matchup.heroSlug);
        if (loser) add(hero, loser, side, null, "counters");
      }
      for (const matchup of getProfile(hero).counters?.weakAgainst || []) {
        const winner = opposing.get(matchup.heroSlug);
        if (winner) add(winner, hero, opposingSide, null, "counters");
      }
      for (const matchup of getProfile(hero).officialMatchups || []) {
        if (!matchup.heroSlug) continue;
        const other = opposing.get(matchup.heroSlug);
        if (!other) continue;
        if (matchup.kind === "counters") add(hero, other, side, null, "official");
        if (matchup.kind === "countered_by") add(other, hero, opposingSide, null, "official");
      }
    }
  }

  const edgeStrength = (edge) => edge.deltaPp === null ? 1.5 : Math.abs(edge.deltaPp);
  const keep = [...edges.values()].filter((edge) => {
    const reverse = edges.get(`${edge.loser.slug}|${edge.winner.slug}`);
    if (!reverse) return true;
    if ((edge.deltaPp !== null) !== (reverse.deltaPp !== null)) return reverse.deltaPp !== null;
    const strengthDiff = edgeStrength(reverse) - edgeStrength(edge);
    return !(strengthDiff > 0 || (strengthDiff === 0 && reverse.winner.slug < edge.winner.slug));
  });
  return keep.sort((a, b) => edgeStrength(b) - edgeStrength(a));
}

function getSynergy(a, b) {
  const forward = draftAnalysisData.synergies[a.slug]?.find((entry) => entry.heroSlug === b.slug);
  const reverse = draftAnalysisData.synergies[b.slug]?.find((entry) => entry.heroSlug === a.slug);
  const editorial = forward && reverse
    ? (reverse.synergyScore > forward.synergyScore ? reverse : forward)
    : forward || reverse;
  if (editorial) return { score: editorial.synergyScore, reason: editorial.reason, source: "editorial" };

  const aMeta = getProfile(a);
  const bMeta = getProfile(b);
  if (aMeta.officialMatchups?.some((entry) => entry.kind === "best_ally" && entry.heroSlug === b.slug)
    || bMeta.officialMatchups?.some((entry) => entry.kind === "best_ally" && entry.heroSlug === a.slug)) {
    return { score: 6, reason: "Recommended duo in the official hero guide", source: "official" };
  }

  const generated = draftAnalysisData.generatedSynergies[a.slug]?.find((entry) => entry.heroSlug === b.slug)
    || draftAnalysisData.generatedSynergies[b.slug]?.find((entry) => entry.heroSlug === a.slug);
  return generated ? { score: 6, reason: generated.reason, source: "generated" } : null;
}

function getSynergyPairs(picks) {
  const sorted = [...picks].sort((a, b) => a.slug.localeCompare(b.slug));
  const pairs = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const synergy = getSynergy(sorted[i], sorted[j]);
      if (synergy) pairs.push({ a: sorted[i], b: sorted[j], ...synergy });
    }
  }
  return pairs.sort((a, b) => b.score - a.score || a.a.slug.localeCompare(b.a.slug));
}

function teamBalance(team) {
  if (!team.picks.length) return 0;
  const slots = Math.min(team.picks.length, 5);
  const roleCoverage = Math.min(1, team.rolesCovered.length / slots);
  const laneCoverage = team.positionPlan.assignedCount / slots;
  const { physical, magic, mixed, damagingCount } = team.damage;
  const damageSpread = damagingCount > 0 && ((magic === 0 && mixed === 0) || (physical === 0 && mixed === 0))
    ? damagingCount >= 3 ? 0.3 : 0.7
    : 1;
  const frontline = team.picks.length >= 3 ? Number(team.hasFrontline) : 1;
  return 0.3 * roleCoverage + 0.25 * laneCoverage + 0.25 * damageSpread + 0.2 * frontline;
}

function formatList(values) {
  if (values.length < 2) return values[0] || "";
  if (values.length === 2) return `${values[0]} dan ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} dan ${values.at(-1)}`;
}

function teamInsights(side, team) {
  const notes = [];
  const name = side === "blue" ? "Blue" : "Red";
  const { physical, magic, mixed, damagingCount } = team.damage;

  if (team.picks.length >= 3) {
    if (damagingCount >= 3 && magic === 0 && mixed === 0) notes.push({ tone: "warn", text: `${name} hanya punya damage fisik: tim lawan lebih mudah menumpuk armor.` });
    if (damagingCount >= 3 && physical === 0 && mixed === 0) notes.push({ tone: "warn", text: `${name} hanya punya damage magic: tim lawan lebih mudah menumpuk magic defense.` });
    if (team.cc.hardCarriers === 0) notes.push({ tone: "warn", text: `${name} tidak punya hard CC untuk menghentikan hero lawan.` });
    if (!team.hasFrontline) notes.push({ tone: "warn", text: `${name} belum punya frontline yang cukup kuat untuk menahan serangan.` });
  }

  if (team.cc.hardCarriers >= 3) {
    notes.push({ tone: "good", text: `${name} bisa merantai hard CC lewat ${team.cc.hardCarriers} hero: lockdown yang terkoordinasi memenangkan fight.` });
  }

  const plan = team.positionPlan;
  if (plan.isFullSetup && plan.flexCount > 0) {
    const flexes = plan.assignments.filter((assignment) => assignment.source === "flex").map((assignment) => `${assignment.hero.name} ${assignment.lane}`);
    notes.push({ tone: "good", text: `${name} bisa menutup semua lane dengan posisi flex: ${formatList(flexes)}.` });
  } else if (team.picks.length === 5 && !plan.isFullSetup) {
    const conflicts = plan.conflicts.map((conflict) => `${conflict.lane} (${conflict.heroes.map((hero) => hero.name).join(", ")})`);
    const unassigned = plan.unassignedHeroes.map((hero) => hero.name);
    let text = `Posisi utama dan flex yang terdaftar untuk ${name} tidak bisa menutup kelima slot. Kurang: ${formatList(plan.missingLanes)}.`;
    if (conflicts.length) text += ` Tumpang tindih: ${formatList(conflicts)}.`;
    else if (unassigned.length) text += ` Belum punya posisi: ${formatList(unassigned)}.`;
    notes.push({ tone: "warn", text });
  }

  if (team.picks.length >= 4 && !team.rolesCovered.includes("Marksman")) {
    notes.push({ tone: "info", text: `${name} tidak punya marksman: damage berkelanjutan bisa melemah melawan build tanky di late game.` });
  }

  return notes;
}

function buildCoachNotes(blue, red, edges, synergies) {
  const notes = [...teamInsights("blue", blue), ...teamInsights("red", red)];
  if (blue.picks.length >= 3 && red.picks.length >= 3 && blue.timing && red.timing) {
    const peak = { early: 0, mid: 1, balanced: 1, late: 2 };
    const difference = peak[blue.timing.peak] - peak[red.timing.peak];
    if (difference !== 0) {
      const side = difference < 0 ? "Blue" : "Red";
      const other = difference < 0 ? "Red" : "Blue";
      notes.push({ tone: "info", text: `${side} punya timing yang lebih cepat daripada ${other}; manfaatkan keunggulan awal sebelum lawan mencapai power spike.` });
    }
  }
  for (const edge of edges.filter((entry) => entry.deltaPp !== null && Math.abs(entry.deltaPp) >= 1.5).slice(0, 2)) {
    const value = `${edge.deltaPp > 0 ? "+" : ""}${edge.deltaPp.toFixed(1)}pp win rate`;
    notes.push({ tone: "info", text: `${edge.winner.name} adalah counter langsung untuk ${edge.loser.name} (${value}).` });
  }
  for (const side of ["blue", "red"]) {
    const pairs = synergies[side].filter((pair) => pair.score >= 7);
    const names = [...new Set(pairs.flatMap((pair) => [pair.a.name, pair.b.name]))];
    if (names.length >= 3) notes.push({ tone: "good", text: `${side === "blue" ? "Blue" : "Red"} punya inti combo kuat: ${names.slice(0, 3).join(" + ")}.` });
  }
  const order = { warn: 0, good: 1, info: 2 };
  return notes.map((note, index) => ({ ...note, index }))
    .sort((a, b) => order[a.tone] - order[b.tone] || a.index - b.index)
    .slice(0, 7);
}

function buildScoreboard(blue, red, edges, synergies) {
  if (!blue.picks.length || !red.picks.length) return null;
  const counterEdge = edges.reduce((sum, edge) => sum + (edge.winnerTeam === "blue" ? 1 : -1) * (edge.deltaPp === null ? 1.5 : Math.abs(edge.deltaPp)), 0);
  const metaEdge = (blue.avgWinRate ?? 50) - (red.avgWinRate ?? 50);
  const synergyScore = (team) => team.reduce((sum, pair) => sum + pair.score, 0);
  const synergyEdge = synergyScore(synergies.blue) - synergyScore(synergies.red);
  const lockdownEdge = blue.cc.hardCC - red.cc.hardCC;
  const balanceEdge = teamBalance(blue) - teamBalance(red);
  const metrics = [
    {
      key: "counter",
      label: "Counter",
      value: clamp(counterEdge / 8, -1, 1),
      detail: counterEdge === 0 ? "Belum ada keunggulan matchup counter" : `${counterEdge > 0 ? "Blue" : "Red"} unggul di matchup counter (+${Math.abs(counterEdge).toFixed(1)})`,
    },
    {
      key: "meta",
      label: "Kekuatan Meta",
      value: clamp(metaEdge / 4, -1, 1),
      detail: `Rata-rata win rate ${blue.avgWinRate ?? "?"}% vs ${red.avgWinRate ?? "?"}%`,
    },
    {
      key: "synergy",
      label: "Sinergi",
      value: clamp(synergyEdge / 12, -1, 1),
      detail: `${synergies.blue.length} pasangan combo vs ${synergies.red.length}`,
    },
    {
      key: "lockdown",
      label: "Lockdown",
      value: clamp(lockdownEdge / 6, -1, 1),
      detail: `Hard CC ${blue.cc.hardCC} vs ${red.cc.hardCC}`,
    },
    {
      key: "balance",
      label: "Keseimbangan Komposisi",
      value: clamp(balanceEdge / 0.4, -1, 1),
      detail: "Role, lane, sebaran damage, dan frontline",
    },
  ];
  const weights = { counter: 0.3, meta: 0.2, synergy: 0.15, lockdown: 0.15, balance: 0.2 };
  const blueScore = Math.round(50 + 32 * metrics.reduce((sum, metric) => sum + metric.value * weights[metric.key], 0));
  const difference = blueScore - (100 - blueScore);
  const leader = difference >= 4 ? "blue" : difference <= -4 ? "red" : "even";
  const margin = Math.abs(difference);
  const verdict = leader === "even" ? "Draft seimbang" : `${leader === "blue" ? "Blue" : "Red"} ${margin >= 20 ? "unggul jauh" : margin >= 10 ? "unggul jelas" : "sedikit unggul"}`;

  return { blue: blueScore, red: 100 - blueScore, leader, verdict, metrics };
}

export function analyzeDraft(bluePicks = [], redPicks = []) {
  const blue = analyzeTeam(bluePicks.filter(Boolean));
  const red = analyzeTeam(redPicks.filter(Boolean));
  const edges = getCounterEdges(blue.picks, red.picks);
  const synergies = { blue: getSynergyPairs(blue.picks), red: getSynergyPairs(red.picks) };
  const scoreboard = buildScoreboard(blue, red, edges, synergies);
  const coachNotes = buildCoachNotes(blue, red, edges, synergies);
  return { teams: { blue, red }, edges, synergies, scoreboard, coachNotes };
}

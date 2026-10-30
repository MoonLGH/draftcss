export const EMPTY_TEAM = () => ({ picks: [], bans: [] });

export function newDraft() {
  return {
    status: "setup",
    mode: "standard",
    teams: { blue: EMPTY_TEAM(), red: EMPTY_TEAM() },
    queue: [],
    turnIndex: 0,
    history: [],
    freeSide: "blue",
  };
}

function pickOrder(first) {
  const other = first === "blue" ? "red" : "blue";
  return [first, other, other, first, first, other, other, first, first, other];
}

export function createQueue(mode, banCount, first = "blue") {
  const other = first === "blue" ? "red" : "blue";
  const queue = [];
  const addBanWave = (count) => {
    for (let i = 0; i < count; i++) queue.push({ team: first, action: "ban" });
    for (let i = 0; i < count; i++) queue.push({ team: other, action: "ban" });
  };

  if (mode === "mpl") {
    addBanWave(3);
    pickOrder(first).slice(0, 6).forEach((team) => queue.push({ team, action: "pick" }));
    addBanWave(2);
    [other, first, first, other].forEach((team) => queue.push({ team, action: "pick" }));
  } else {
    const firstWave = Math.min(3, banCount);
    addBanWave(firstWave);
    if (banCount > firstWave) addBanWave(banCount - firstWave);
    pickOrder(first).forEach((team) => queue.push({ team, action: "pick" }));
  }

  return queue;
}

export function applyHero(state, hero, mode) {
  if (state.status !== "drafting") return state;
  const turn = state.queue[state.turnIndex];
  if (!turn) return { ...state, status: "complete" };
  const team = state.teams[turn.team];
  const other = state.teams[turn.team === "blue" ? "red" : "blue"];
  const picked = [...state.teams.blue.picks, ...state.teams.red.picks].some((item) => item.name === hero.name);
  const bannedHere = team.bans.some((item) => item.name === hero.name);
  const bannedElsewhere = other.bans.some((item) => item.name === hero.name);
  if (picked || bannedHere || (mode === "mpl" && bannedElsewhere)) return state;

  const snapshot = {
    teams: {
      blue: { picks: [...state.teams.blue.picks], bans: [...state.teams.blue.bans] },
      red: { picks: [...state.teams.red.picks], bans: [...state.teams.red.bans] },
    },
    turnIndex: state.turnIndex,
  };
  const changedTeam = {
    ...team,
    [turn.action === "pick" ? "picks" : "bans"]: [...team[turn.action === "pick" ? "picks" : "bans"], hero],
  };
  const teams = { ...state.teams, [turn.team]: changedTeam };
  const turnIndex = state.turnIndex + 1;
  return {
    ...state,
    teams,
    turnIndex,
    history: [...state.history, snapshot],
    status: turnIndex >= state.queue.length ? "complete" : "drafting",
  };
}

export function undoDraft(state) {
  if (!state.history.length) return state;
  const previous = state.history[state.history.length - 1];
  return {
    ...state,
    teams: previous.teams,
    turnIndex: previous.turnIndex,
    history: state.history.slice(0, -1),
    status: "drafting",
  };
}

const PLAYER_ORDER = [0, 1, 2, 3, 4];
const normalizePlayerOrder = (order) => Array.isArray(order)
  && order.length === PLAYER_ORDER.length
  && new Set(order).size === PLAYER_ORDER.length
  && order.every((playerIndex) => PLAYER_ORDER.includes(playerIndex))
  ? [...order]
  : [...PLAYER_ORDER];
const copyTeam = (team) => ({
  picks: [...team.picks],
  bans: [...team.bans],
  pickOrder: normalizePlayerOrder(team.pickOrder),
});

export const EMPTY_TEAM = () => ({ picks: [], bans: [], pickOrder: [...PLAYER_ORDER] });

export function newDraft() {
  return {
    status: "setup",
    swapCompleted: false,
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
  if (!turn) return { ...state, status: "swapping" };
  const team = state.teams[turn.team];
  const other = state.teams[turn.team === "blue" ? "red" : "blue"];
  const picked = [...state.teams.blue.picks, ...state.teams.red.picks].some((item) => item.name === hero.name);
  const bannedHere = team.bans.some((item) => item.name === hero.name);
  const bannedElsewhere = other.bans.some((item) => item.name === hero.name);
  if (picked || bannedHere || (mode === "mpl" && bannedElsewhere)) return state;

  const snapshot = {
    teams: {
      blue: copyTeam(state.teams.blue),
      red: copyTeam(state.teams.red),
    },
    turnIndex: state.turnIndex,
    status: state.status,
    swapCompleted: state.swapCompleted || false,
  };
  const changedTeam = {
    ...team,
    [turn.action === "pick" ? "picks" : "bans"]: [...team[turn.action === "pick" ? "picks" : "bans"], hero],
  };
  const teams = { ...state.teams, [turn.team]: changedTeam };
  const turnIndex = state.turnIndex + 1;
  const pickCount = teams.blue.picks.length + teams.red.picks.length;
  return {
    ...state,
    teams,
    turnIndex,
    history: [...state.history, snapshot],
    status: pickCount === 10 ? "swapping" : turnIndex >= state.queue.length ? "complete" : "drafting",
  };
}

export function setCurrentPickPlayer(state, side, playerIndex) {
  const turn = state.queue[state.turnIndex];
  if (state.status !== "drafting" || turn?.action !== "pick" || turn.team !== side || !PLAYER_ORDER.includes(playerIndex)) return state;

  const team = state.teams[side];
  const currentPickIndex = team.picks.length;
  if (currentPickIndex >= PLAYER_ORDER.length) return state;
  const pickOrder = normalizePlayerOrder(team.pickOrder);
  const targetIndex = pickOrder.indexOf(playerIndex);
  if (targetIndex < currentPickIndex || targetIndex < 0) return state;
  if (targetIndex === currentPickIndex) return state;

  const snapshot = {
    teams: {
      blue: copyTeam(state.teams.blue),
      red: copyTeam(state.teams.red),
    },
    turnIndex: state.turnIndex,
    status: state.status,
    swapCompleted: state.swapCompleted || false,
  };
  [pickOrder[currentPickIndex], pickOrder[targetIndex]] = [pickOrder[targetIndex], pickOrder[currentPickIndex]];
  return {
    ...state,
    teams: { ...state.teams, [side]: { ...team, pickOrder } },
    history: [...state.history, snapshot],
  };
}

export function swapHeroes(state, side, firstIndex, secondIndex) {
  if (state.status !== "swapping" || !["blue", "red"].includes(side) || firstIndex === secondIndex) return state;
  const team = state.teams[side];
  if (!team?.picks[firstIndex] || !team?.picks[secondIndex]) return state;

  const snapshot = {
    teams: {
      blue: copyTeam(state.teams.blue),
      red: copyTeam(state.teams.red),
    },
    turnIndex: state.turnIndex,
    status: state.status,
    swapCompleted: state.swapCompleted || false,
  };
  const picks = [...team.picks];
  [picks[firstIndex], picks[secondIndex]] = [picks[secondIndex], picks[firstIndex]];

  return {
    ...state,
    teams: { ...state.teams, [side]: { ...team, picks } },
    history: [...state.history, snapshot],
  };
}

export function finishSwap(state) {
  if (state.status !== "swapping") return state;
  return { ...state, status: "complete", swapCompleted: true };
}

export function undoDraft(state) {
  if (!state.history.length) return state;
  const previous = state.history[state.history.length - 1];
  return {
    ...state,
    teams: previous.teams,
    turnIndex: previous.turnIndex,
    history: state.history.slice(0, -1),
    status: previous.status || "drafting",
    swapCompleted: previous.swapCompleted || false,
  };
}

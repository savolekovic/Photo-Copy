/**
 * Order lifecycle. Single source of truth for status values and legal transitions —
 * the DB CHECK constraint in migrations/003 mirrors ORDER_STATUSES.
 */

export const STATUS = {
  NOVA: "nova",
  U_PRIPREMI: "u_pripremi",
  SPREMNO: "spremno",
  PREUZETO: "preuzeto",
  OTKAZANO: "otkazano",
};

export const ORDER_STATUSES = [
  STATUS.NOVA,
  STATUS.U_PRIPREMI,
  STATUS.SPREMNO,
  STATUS.PREUZETO,
  STATUS.OTKAZANO,
];

/** Statuses an operator still has work to do on — the default dashboard view. */
export const ACTIVE_STATUSES = [STATUS.NOVA, STATUS.U_PRIPREMI, STATUS.SPREMNO];

/** Nothing further happens to an order in these states. */
export const TERMINAL_STATUSES = [STATUS.PREUZETO, STATUS.OTKAZANO];

/**
 * Legal moves. Cancellation is reachable from any non-terminal state; the happy path
 * runs strictly forward. Reversals are deliberately allowed one step back
 * (spremno -> u_pripremi) so an operator can undo a premature "ready" click, which would
 * otherwise be unfixable once the student had been e-mailed.
 */
const TRANSITIONS = {
  [STATUS.NOVA]: [STATUS.U_PRIPREMI, STATUS.SPREMNO, STATUS.OTKAZANO],
  [STATUS.U_PRIPREMI]: [STATUS.SPREMNO, STATUS.NOVA, STATUS.OTKAZANO],
  [STATUS.SPREMNO]: [STATUS.PREUZETO, STATUS.U_PRIPREMI, STATUS.OTKAZANO],
  [STATUS.PREUZETO]: [],
  [STATUS.OTKAZANO]: [],
};

export function isValidStatus(status) {
  return ORDER_STATUSES.includes(status);
}

export function allowedTransitionsFrom(status) {
  return TRANSITIONS[status] ?? [];
}

export function canTransition(from, to) {
  return allowedTransitionsFrom(from).includes(to);
}

export function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}

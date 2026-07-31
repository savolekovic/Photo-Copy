import {
  IconBan,
  IconCheck,
  IconPackage,
  IconUndo,
  IconWrench,
} from "./OrderIcons.jsx";

/**
 * The single move an operator makes most often from each status. Surfaced as the primary
 * button on a row; every other legal move lives in the detail modal so the table stays
 * readable.
 */
export const PRIMARY_NEXT = {
  nova: "u_pripremi",
  u_pripremi: "spremno",
  spremno: "preuzeto",
};

/**
 * Per-destination presentation. `confirmKey` marks transitions worth a confirmation
 * prompt — moving to `spremno` e-mails the student, and `otkazano` is terminal.
 */
export const TRANSITION_META = {
  nova: { icon: IconUndo, tone: "neutral" },
  u_pripremi: { icon: IconWrench, tone: "amber" },
  spremno: { icon: IconPackage, tone: "emerald", confirmKey: "orders.confirmReady" },
  preuzeto: { icon: IconCheck, tone: "slate" },
  otkazano: { icon: IconBan, tone: "rose", confirmKey: "orders.confirmCancel" },
};

export const TONE_CLASSES = {
  neutral: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  slate: "border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100",
  amber: "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  rose: "border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
};

/** Translation key for a button that moves an order to `status`. */
export function actionLabelKey(status) {
  return `orders.action.to.${status}`;
}

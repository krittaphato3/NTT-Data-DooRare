/**
 * Sidebar badges (App.tsx) load from GET /dashboard once per sign-in / URL change.
 * Pages call this after an action that changes a count (approve, reject, add lender, answer...) so the badge
 * follows without a page reload. It only asks App to refetch; it changes no data.
 */
export const NAV_BADGES_EVENT = 'doorare:refresh-nav-badges';
export const refreshNavBadges = () => window.dispatchEvent(new Event(NAV_BADGES_EVENT));

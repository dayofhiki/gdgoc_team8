"use client";
import { useRouter } from "next/navigation";

const BACK_ENTRY = "mikkiFlowBack";
let previousLength: number | undefined;

/** Older browsers use a per-entry flag so Back after a pop does not count forward entries. */
export function rememberFlowEntry() {
  const { history, document, location } = window;
  const recorded = history.state?.[BACK_ENTRY];
  const hasSameSiteReferrer = document.referrer.startsWith(location.origin + "/");
  if (typeof recorded !== "boolean") {
    const hasPrevious = previousLength === undefined
      ? history.length > 1 && hasSameSiteReferrer
      : history.length > previousLength;
    history.replaceState({ ...history.state, [BACK_ENTRY]: hasPrevious }, "");
  }
  previousLength = history.length;
}

export function useBackNavigation(fallback = "/home") {
  const router = useRouter();
  return () => {
    const navigation = (window as Window & { navigation?: { canGoBack: boolean } }).navigation;
    // The Navigation API exposes only entries in this same-origin part of the stack.
    if (navigation?.canGoBack ?? (window.history.state?.[BACK_ENTRY] === true)) router.back();
    else router.replace(fallback);
  };
}

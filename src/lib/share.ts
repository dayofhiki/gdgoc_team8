/**
 * 클립보드 복사. HTTPS가 아닌 환경(같은 와이파이로 접속한 휴대폰 등)에서는
 * navigator.clipboard 가 없으므로 textarea + execCommand 로 대체합니다.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 아래 대체 방법으로 시도 */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const PUBLIC_ORIGIN = "https://team8.gdgoc-devfest.org";

function shareOrigin(origin: string): string {
  const url = new URL(origin);
  const host = url.hostname;
  // Local preview addresses cannot be reached by recipients on another network.
  if (!host.includes(".") || host.endsWith(".local") || /^\d+(?:\.\d+){3}$/.test(host)) return PUBLIC_ORIGIN;
  return url.origin;
}

export function quizInviteUrl(origin: string, name: string, token?: string | null): string {
  const url = new URL("/challenge", shareOrigin(origin));
  if (token) url.searchParams.set("invite", token);
  url.searchParams.set("from", name);
  return url.href;
}

export const SHARED_FAMILY_CODE_PATH = "/family-code/shared";

export function familyCodeUrl(origin: string, token: string): string {
  const url = new URL(SHARED_FAMILY_CODE_PATH, shareOrigin(origin));
  url.hash = new URLSearchParams({ code: token }).toString();
  return url.href;
}

export async function shareWithDevice(data: ShareData): Promise<"shared" | "cancelled" | "unavailable"> {
  if (!navigator.share) return "unavailable";
  try {
    await navigator.share(data);
    return "shared";
  } catch (error) {
    return error instanceof Error && error.name === "AbortError" ? "cancelled" : "unavailable";
  }
}

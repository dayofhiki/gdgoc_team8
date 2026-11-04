/**
 * AI가 제안한 의미 기반 행동을 실제 클릭 가능한 모의 문자 첨부물로 변환한다.
 * 시나리오 이름이나 한국어 동사별 정규표현식에 의존하지 않는다.
 */
export type Kind = "app" | "phone" | "link" | "transfer" | "provide_data";
export type Origin = "installed" | "preexisting" | "sender";
export type Proposed = { kind: Kind; origin: Origin; target: string; task: string; previewTitle: string; previewDescription: string };
export type Action = {
  id: string; kind: Kind; origin: Origin; target: string; task: string; label: string;
  linkPreview?: { url: string; domain: string; title: string; description: string };
};
const KINDS: Kind[] = ["app", "phone", "link", "transfer", "provide_data"];
const ORIGINS: Origin[] = ["installed", "preexisting", "sender"];
const clean = (v: unknown, limit: number) => typeof v === "string"
  ? v.replace(/https?:\/\/\S+|www\.\S+|(?:\d[\s-]?){8,}/gi, "")
     .replace(/[<>{}\[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, limit)
  : "";

const ITEM_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    kind: { type: "string", enum: KINDS }, origin: { type: "string", enum: ORIGINS },
    target: { type: "string" }, task: { type: "string" },
    previewTitle: { type: "string" }, previewDescription: { type: "string" },
  },
  required: ["kind", "origin", "target", "task", "previewTitle", "previewDescription"],
};
export const RESPONSE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { reply: { type: "string" }, actions: { type: "array", items: ITEM_SCHEMA } },
  required: ["reply", "actions"],
};

export const ACTION_RULES = [
  "JSON 객체에 reply 문자열, actions 배열을 출력한다. actions는 reply에서 실제 제안된 행동만 포함한다.",
  "대사에 행동이 없으면 actions=[]이다. 메시지의 자연어 의미로 해석하고 특정 단어 패턴에 의존하지 않는다.",
  "kind: app=기기에 이미 설치된 앱 실행, phone=전화 걸기, link=문자 속 웹 주소 열기, transfer=돈 보내기, provide_data=정보 제출.",
  "origin: installed=사용자의 기기에 이미 설치된 앱, preexisting=원래 알고 있던 번호·카드 뒷면 번호, sender=이 메시지가 제시한 주소·번호·계좌·링크.",
  "문자 링크로 앱 설치를 요구하면 link+sender다. 앱이 이미 설치됐다는 근거가 없는 경우 app+installed라고 하지 않는다.",
  "대사에 '아래 링크에서 취소' '제가 보낸 주소를 확인' 등의 의도가 있으면 반드시 link+sender를 포함한다. 실제 URL은 모델이 쓰지 않는다.",
  "공식 앱 열기와 기존 대표번호 연락이 모두 제안되면 두 행동을 모두 넣는다.",
  "행동을 하지 말라는 부정문, 단순 사실 설명, 과거 회상은 행동 제안이 아니다.",
  "target: 대상명(예: 택배사/은행/자녀), task: 수행할 일(예: 배송지 수정/거래 조회). 대상이 없으면 빈 문자열.",
  "previewTitle/previewDescription은 link의 미리보기용 제목·설명만 담는다. 기타 행동은 빈 문자열.",
  "행동 종류와 문구는 새로운 시나리오에도 그대로 적용한다. 정답, 위험 여부, 훈련 UI 언급 없이 중립적으로 표현한다.",
].join("\n");

export function parseResponse(text: string): { reply: string; actions: Proposed[] } {
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("BAD_ACTION_JSON");
  const data = raw as Record<string, unknown>;
  if (typeof data.reply !== "string" || !data.reply.trim() || !Array.isArray(data.actions) || data.actions.length > 8) throw new Error("BAD_ACTION_JSON");
  const valid = data.actions.every(item => item && typeof item === "object" &&
    KINDS.includes(item.kind) && ORIGINS.includes(item.origin) &&
    ["target", "task", "previewTitle", "previewDescription"].every(k => typeof item[k] === "string"));
  if (!valid) throw new Error("BAD_ACTION_JSON");
  return { reply: data.reply, actions: data.actions as Proposed[] };
}

export function buildActions(items: unknown, turn: number): Action[] {
  if (!Array.isArray(items)) return [];
  const out: Action[] = [];
  const seen = new Set<string>();
  for (const raw of items.slice(0, 8)) {
    if (!raw || typeof raw !== "object") continue;
    const x = raw as Record<string, unknown>;
    if (!KINDS.includes(x.kind as Kind) || !ORIGINS.includes(x.origin as Origin)) continue;
    let kind = x.kind as Kind;
    let origin = x.origin as Origin;
    if (kind === "app" && origin !== "installed") { kind = "link"; origin = "sender"; }
    if (["link", "transfer", "provide_data"].includes(kind)) origin = "sender";
    const target = clean(x.target, 24), task = clean(x.task, 42);
    const key = [kind, origin, target, task].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const id = turn + "-" + out.length;
    const label = kind === "app" ? (target ? target + " 앱 열기" : "앱 열기") :
      kind === "phone" ? (origin === "preexisting" ? "기존 번호로 전화" : "안내 번호로 전화") :
      kind === "transfer" ? (task || "송금하기") :
      kind === "provide_data" ? (task || "정보 전송하기") : "링크 열기";
    const action: Action = { id, kind, origin, target, task, label };
    if (kind === "link") {
      const domain = "m.message-preview.example";
      action.linkPreview = {
        url: "https://" + domain + "/view/" + (turn + 1) + "-" + (out.length + 1),
        domain,
        title: clean(x.previewTitle, 46) || (target ? target + " 안내" : "안내 페이지"),
        description: clean(x.previewDescription, 72) || task || "상세 정보 확인",
      };
    }
    out.push(action);
    if (out.length >= 5) break;
  }
  return out;
}

export function actionChoice(a: Action): "verify" | "verify_sender" | "comply" | "share" | "open_link" {
  if (a.kind === "app") return "verify";
  if (a.kind === "phone") return a.origin === "preexisting" ? "verify" : "verify_sender";
  if (a.kind === "link") return "open_link";
  if (a.kind === "transfer") return "comply";
  return "share";
}

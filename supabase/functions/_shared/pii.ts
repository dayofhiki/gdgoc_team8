// 개인정보 탐지·가리기. 규칙은 ko-pii(MIT, https://github.com/Marker-Inc-Korea/ko-pii, 라이선스: ./LICENSE.ko-pii)의
// patterns/{phone,rrn,frn,card,account,email,url}.py · checksum/luhn.py · core/unicode_norm.py 를 TS로 옮긴 것.
// 직접 만든 규칙은 마지막 "긴 숫자열" 하나뿐(기존 규칙 유지, 은행명 없이 쓴 계좌번호용).
// shortcut: 한글 숫자("공일공")·이름·주소는 못 잡음 — ko-pii에도 없음. 화면 안내로 대응.
// 대표번호(15xx-xxxx)는 일부러 제외: "1588 번호로 확인할게"는 훈련에서 안전한 행동.

type Rule = { re: RegExp; ok?: (m: string) => boolean };

const BANKS = [
  "국민은행", "신한은행", "우리은행", "하나은행", "기업은행", "IBK", "KEB하나은행", "KEB", "KB국민은행", "KB",
  "농협은행", "농협", "NH농협", "NH", "수협은행", "수협", "Sh수협", "SC제일은행", "제일은행", "씨티은행", "한국씨티",
  "외환은행", "스탠다드차타드", "카카오뱅크", "카뱅", "카카오페이", "토스뱅크", "토스뱅킹", "토스페이", "케이뱅크", "K뱅크",
  "네이버페이", "부산은행", "BNK부산", "대구은행", "DGB대구", "경남은행", "BNK경남", "광주은행", "전북은행", "제주은행",
  "JB제주", "산업은행", "KDB산업", "수출입은행", "EXIM", "한국은행", "BOK", "우체국", "우정사업본부", "우정청",
  "새마을금고", "MG새마을", "MG", "신협", "신용협동조합", "수산업협동조합", "농업협동조합", "국민", "신한", "우리", "하나",
].join("|");
const ACCOUNT_NUM = String.raw`[0-9]+(?:[\s\-][0-9]+){1,4}|[0-9]{10,16}`;
const PHONE_TAIL = String.raw`[-.\s]{0,3}\d{3,4}[-.\s]{0,3}\d{4}(?![0-9])`;
const AREA = "02|03[1-3]|04[1-4]|05[1-5]|06[1-4]|070";

const digits = (s: string) => s.replace(/\D/g, "");

// 주민·외국인등록번호: 앞 6자리가 실제 날짜이고 7번째 자리가 성별·세기 코드여야 함 (체크섬은 2020년 이후 번호에 안 맞아 안 봄)
const CENTURY: Record<string, number> = { "1": 1900, "2": 1900, "3": 2000, "4": 2000, "5": 1900, "6": 1900, "7": 2000, "8": 2000, "9": 1800, "0": 1800 };
function validBirth(m: string): boolean {
  const d = digits(m), y = CENTURY[d[6]] + Number(d.slice(0, 2)), mo = Number(d.slice(2, 4)), day = Number(d.slice(4, 6));
  const dt = new Date(y, mo - 1, day);
  return dt.getMonth() === mo - 1 && dt.getDate() === day && dt <= new Date();
}

function luhn(d: string): boolean {
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 === 0;
}
function validCard(m: string): boolean {
  const d = digits(m);
  if (d.length < 13 || d.length > 19 || !"234569".includes(d[0])) return false;
  if (d.length === 13 && d[0] !== "4") return false;
  if (d.length === 15 && !["34", "37"].includes(d.slice(0, 2))) return false;
  return luhn(d);
}
const accountLen = (m: string) => {
  const n = digits(m.replace(/^\D+|\D+$/g, "")).length;
  return n >= 10 && n <= 16;
};

const RULES: Rule[] = [
  { re: /(?<![0-9])[0-9]{6}(?:\s?[-./]\s?|[-./\s]{0,2})[0-9]{7}(?![0-9])/g, ok: validBirth }, // 주민·외국인등록번호
  { re: new RegExp(String.raw`(?<![0-9+])01[016789]` + PHONE_TAIL, "g") }, // 휴대폰
  { re: new RegExp(String.raw`(?<![0-9+])(?:${AREA})[-.\s)\]]{0,3}\d{3,4}[-.\s]{0,3}\d{4}(?![0-9])`, "g") }, // 유선·인터넷전화
  { re: new RegExp(String.raw`(?<![0-9])(?:\+82|0082|82)[-.\s]?(?:\(0\)[-.\s]?)?(?:1[016789]|2|3[1-3]|4[1-4]|5[1-5]|6[1-4]|70)` + PHONE_TAIL, "g") }, // +82
  { re: new RegExp(String.raw`(?<![0-9A-Za-z])\((?:01[016789]|${AREA})\)` + PHONE_TAIL, "g") }, // (02) 1234-5678
  { re: /(?<![0-9])(?:[0-9]{4}[-. /]\s?[0-9]{4}[-. /]\s?[0-9]{4}[-. /]\s?[0-9]{1,7}|[0-9]{13,19})(?![0-9])/g, ok: validCard }, // 카드
  { re: new RegExp(String.raw`계좌\s*(?:번호|번)?\s*:?\s*[0-9][\s\-]*(?:[0-9][\s\-]*){9,19}`, "g"), ok: accountLen }, // 계좌 키워드
  { re: new RegExp(String.raw`(?:${BANKS})\s*:?\s*(?:${ACCOUNT_NUM})`, "g"), ok: accountLen }, // 은행명 + 번호
  { re: new RegExp(String.raw`(?<![0-9])(?:${ACCOUNT_NUM})\s*(?:${BANKS})`, "g"), ok: accountLen }, // 번호 + 은행명
  { re: /(?<![A-Za-z0-9._%+\-])[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?)+(?![A-Za-z0-9])/g }, // 이메일
  { re: /\bhttps?:\/\/[^\s<>"'`)\]}]+/gi }, // URL (AI 답변 속 링크 포함)
  { re: /(?<![0-9])\d(?:[-\s]?\d){9,}(?![0-9])/g }, // 긴 숫자열 10자리+ (자체 규칙; 날짜 2026-11-03 같은 8자리는 통과)
];

// ko-pii unicode_norm: 전각 숫자(NFKC)·보이지 않는 문자 제거, "0 1 0 1 2 3 …"처럼 한 자리씩 띄운 숫자만 붙임
function normalize(text: string): string {
  return text.normalize("NFKC").replace(/[­​-‏⁠﻿]/g, "")
    .replace(/(?<![0-9A-Za-z])[0-9](?:[ .\-]{0,3}[0-9]){8,}(?![0-9A-Za-z])/g, (r) => {
      const n = digits(r).length, single = (` ${r} `.match(/(?<= )[0-9](?= )/g) ?? []).length;
      return n >= 10 && n <= 16 && single >= 4 ? r.replace(/ /g, "") : r;
    });
}

function matches(text: string): string[] {
  return RULES.flatMap(({ re, ok }) => [...text.matchAll(re)].map((m) => m[0]).filter((m) => !ok || ok(m)));
}

export function hasPii(text: string): boolean {
  return matches(normalize(text)).length > 0;
}

// 찾은 부분의 글자·숫자를 *로 (하이픈·@·점 같은 구분자는 남김)
export function maskPii(text: string): string {
  const t = normalize(text);
  return matches(t).reduce((acc, m) => acc.replaceAll(m, m.replace(/[0-9A-Za-z가-힣]/g, "*")), t);
}

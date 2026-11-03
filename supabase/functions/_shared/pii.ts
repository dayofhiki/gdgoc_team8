// 전화번호·주민번호·계좌번호(숫자 10자리 이상, 하이픈 허용) 탐지.
// shortcut: 정규식만 사용 — 한글로 쓴 숫자("공일공")는 못 잡음, 음성 모드 도입 시 보강.
const PATTERNS: RegExp[] = [
  /\d{6}[-\s]?[1-4]\d{6}/g, // 주민번호
  /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g, // 휴대폰
  /0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g, // 유선
  /\d[\d-]{8,}\d/g, // 계좌 등 긴 숫자열
];

export function hasPii(text: string): boolean {
  return PATTERNS.some((p) => new RegExp(p.source).test(text));
}

export function maskPii(text: string): string {
  return PATTERNS.reduce((t, p) => t.replace(p, (m) => m.replace(/\d/g, "*")), text);
}

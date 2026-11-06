import { redirect } from "next/navigation";

/** 구형 타이머 미리보기 결과 링크는 새 음성 훈련 진입점으로 보냅니다. */
export default function LegacyPhonePreviewResult() {
  redirect("/roleplay/phone");
}

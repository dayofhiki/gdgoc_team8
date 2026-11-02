export type Scam="family"|"authority"|"financial";
export type Choice={id:string;text:string;safe:boolean;why:string};
export type Q={id:string;from:string;message:string;prompt:string;choices:Choice[]};
export const labels:Record<Scam,string>={family:"가족·지인 사칭",authority:"기관 사칭",financial:"금융·계좌 사기"};
export const questions:Record<Scam,Q[]>={
family:[
{id:"f1",from:"알 수 없는 번호",message:"엄마, 핸드폰이 고장 나서 다른 번호로 연락드려요.",prompt:"어떻게 하시겠어요?",choices:[{id:"a",text:"원래 알던 자녀 번호로 직접 전화한다",safe:true,why:"기존에 알고 있던 연락처로 독립적으로 확인하는 것이 안전합니다."},{id:"b",text:"새 번호를 저장하고 그대로 믿는다",safe:false,why:"낯선 번호가 실제 가족의 것인지 확인되지 않았습니다."}]},
{id:"f2",from:"알 수 없는 번호",message:"급히 50만 원만 보내 주세요. 지금 당장이에요.",prompt:"송금 요청을 받았습니다.",choices:[{id:"a",text:"송금을 멈추고 가족에게 재확인한다",safe:true,why:"급한 상황을 주장하더라도 확인이 먼저입니다."},{id:"b",text:"일단 송금한다",safe:false,why:"가족 사칭 사기일 수 있습니다."}]},
{id:"f3",from:"알 수 없는 번호",message:"여기 링크에서 먼저 신원 확인해 주세요.",prompt:"어떤 행동이 좋을까요?",choices:[{id:"a",text:"링크를 열지 않고 기존 연락처로 확인한다",safe:true,why:"알 수 없는 링크는 열지 말고 확인하세요."},{id:"b",text:"링크를 열고 정보를 입력한다",safe:false,why:"악성 링크로 개인정보가 노출될 수 있습니다."}]}
],
authority:[{id:"a1",from:"기관 사칭 문자",message:"계좌가 사건에 연루됐습니다. 지금 연락하세요.",prompt:"확인 방법을 선택하세요.",choices:[{id:"a",text:"공식 기관 번호를 별도로 찾아 문의한다",safe:true,why:"상대방이 제공한 연락처를 그대로 믿지 마세요."},{id:"b",text:"문자 속 번호로 바로 연락한다",safe:false,why:"해당 번호도 사칭일 수 있습니다."}]}],
financial:[{id:"m1",from:"금융사 사칭 문자",message:"대출 승인을 위해 보증금을 먼저 보내세요.",prompt:"어떻게 하시겠어요?",choices:[{id:"a",text:"송금을 거절하고 공식 고객센터로 확인한다",safe:true,why:"선입금 요청은 사기 위험 신호입니다."},{id:"b",text:"요청한 계좌로 보낸다",safe:false,why:"사기일 가능성을 확인해야 합니다."}]}]
};

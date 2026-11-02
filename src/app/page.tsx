"use client";
import {useEffect,useState} from "react";
import {callFn,ensureAnon,sb} from "@/lib/supabase";
import type {ChatTurnResponse,Difficulty,InviteJoinResponse,Message,Mission,Result,SessionEndResponse} from "@shared/types";
type View="start"|"home"|"create"|"invite"|"join"|"missions"|"chat"|"result"|"pledge"|"done"|"error";
type Bubble=Pick<Message,"role"|"text">;
const defaultRules=["송금 전에 반드시 멈추고 확인하기","기존 연락처로 직접 전화하기","연결되지 않으면 다른 신뢰할 사람에게 문의하기"];
const errorText:Record<string,string>={INVITE_EXPIRED:"초대 링크의 유효기간이 지났어요.",INVITE_FULL:"참여 인원이 가득 찬 링크예요.",INVITE_INVALID:"유효하지 않은 초대 링크예요."};
const outcomeText={safe:"안전하게 대응했어요",unsafe:"다시 연습이 필요해요",incomplete:"끝까지 판단하지 못했어요"};
export default function Page(){
const[view,setView]=useState<View>("start"),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
// 보호자
const[name,setName]=useState(""),[difficulty,setDifficulty]=useState<Difficulty>("normal"),[token,setToken]=useState(""),[seats,setSeats]=useState(1);
// 시니어
const[participant,setParticipant]=useState(""),[seniorName,setSeniorName]=useState(""),[consent,setConsent]=useState(false),[missions,setMissions]=useState<Mission[]>([]),[sessionId,setSessionId]=useState(""),[chat,setChat]=useState<Bubble[]>([]),[text,setText]=useState(""),[result,setResult]=useState<Result|null>(null),[rules,setRules]=useState(defaultRules),[error,setError]=useState("");
const senior=!["start","home","create","invite"].includes(view);
function go(v:View){setView(v);setNotice("");window.scrollTo(0,0)}
function fail(e:unknown){const code=e instanceof Error?e.message:"";setError(errorText[code]??"잠시 후 다시 시도해 주세요.");go("error")}
async function run(fn:()=>Promise<void>){setBusy(true);try{await fn()}catch(e){fail(e)}finally{setBusy(false)}}
useEffect(()=>{const t=new URLSearchParams(location.search).get("invite");if(t)void run(async()=>{await ensureAnon();const r=await callFn<InviteJoinResponse>("invite-join",{token:t});setParticipant(r.participant_id);setSeniorName(r.invite.senior_name||"참여자");go("join")})},[]);
const link=token&&typeof location!=="undefined"?location.origin+location.pathname+"?invite="+token:"";
const create=()=>run(async()=>{await ensureAnon();const{data,error}=await sb().from("invites").insert({senior_name:name.trim(),difficulty,max_participants:seats}).select("token").single();if(error)throw error;setToken(data.token);go("invite")});
function share(){void navigator.clipboard.writeText(link).then(()=>setNotice("링크를 복사했어요")).catch(()=>setNotice("화면의 링크를 직접 복사해 주세요"))}
const loadMissions=()=>run(async()=>{const{data,error}=await sb().from("missions").select().order("sort");if(error)throw error;setMissions(data as Mission[]);go("missions")});
const start=(mission_id:string)=>run(async()=>{const{data,error}=await sb().from("sessions").insert({participant_id:participant,mission_id}).select("id").single();if(error)throw error;setSessionId(data.id);const r=await callFn<ChatTurnResponse>("chat-turn",{session_id:data.id});setChat([r.reply]);go("chat")});
const finish=(id=sessionId)=>run(async()=>{const r=await callFn<SessionEndResponse>("session-end",{session_id:id});setResult(r.result);go("result")});
async function send(){const t=text.trim();if(!t||busy)return;setBusy(true);setNotice("");
try{const r=await callFn<ChatTurnResponse>("chat-turn",{session_id:sessionId,text:t});setChat(c=>[...c,{role:"senior",text:t},r.reply]);setText("");if(r.ended)await finish()}
catch(e){if(e instanceof Error&&e.message==="PII_BLOCKED")setNotice("전화번호·계좌번호 같은 실제 정보는 입력하지 마세요.");else fail(e)}
finally{setBusy(false)}}
return <div className={"wrap"+(senior?" senior":"")}><main className="phone"><div className="header"><span className="brand">◎ 안심연습</span><span className="tag">{senior?"시니어 참여":"자녀·기관"}</span></div>
{view==="start"&&<><div className="eyebrow">SAFE TOGETHER</div><h1>{"우리 가족의 안전을\n함께 연습해요."}</h1><p>AI 시대의 사기 상황에 침착하게 대응하는 훈련을 가족과 함께 시작합니다.</p><section className="card blue"><h2>자녀·기관</h2><p>교육을 만들고 초대할 수 있어요.</p><button className="button" onClick={()=>go("home")}>훈련 만들기 →</button></section><section className="card mint"><h2>시니어 참여</h2><p>가입할 필요 없어요. 받은 링크를 열어 주세요.</p></section></>}
{view==="home"&&<><div className="eyebrow">01 · 초대자</div><h1>안녕하세요!<br/>함께 준비해요.</h1><section className="card blue"><h2>새로운 훈련 만들기</h2><p>가족에게 보낼 초대 링크를 만드세요.</p><button className="button" onClick={()=>go("create")}>새 훈련 시작하기</button></section>{token&&<section className="card"><h2>최근 훈련</h2><p>{name||"참여자"}님 초대 링크</p><button className="button secondary" onClick={()=>go("invite")}>초대 링크 확인</button></section>}</>}
{view==="create"&&<><div className="eyebrow">02 · 훈련 생성</div><h1>새 훈련 만들기</h1><div className="field"><label>시니어 호칭 (선택)</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="예: 어머니"/></div><div className="field"><label>난이도</label><select value={difficulty} onChange={e=>setDifficulty(e.target.value as Difficulty)}><option value="easy">쉬움</option><option value="normal">보통</option><option value="hard">어려움</option></select></div><div className="field"><label>참여 인원</label><select value={seats} onChange={e=>setSeats(Number(e.target.value))}><option value={1}>1명 (가족)</option><option value={10}>최대 10명 (기관)</option><option value={30}>최대 30명 (기관)</option></select></div><p className="tiny">한 링크로 여러 명이 동시에 입장할 수 있어요. 사기 유형은 시니어가 입장 후 직접 고릅니다.</p><button className="button" disabled={busy} onClick={create}>초대 링크 만들기</button></>}
{view==="invite"&&<><div className="eyebrow">03 · 링크 공유</div><h1>초대 링크를<br/>만들었어요!</h1><section className="card"><h2>초대 링크</h2><p style={{overflowWrap:"anywhere"}}>{link}</p><button className="button" onClick={share}>링크 복사</button><p>{notice}</p></section><section className="card blue"><h2>참여 대기 중</h2><p>입장·진행 알림은 다음 단계에서 제공됩니다.</p></section></>}
{view==="error"&&<><h1>초대 링크를<br/>확인해 주세요.</h1><p>{error}</p><p>보호자에게 새 초대 링크를 보내 달라고 요청하세요.</p><button className="button" onClick={()=>go("start")}>첫 화면으로</button></>}
{view==="join"&&<><div className="eyebrow">S01 · 가입 없이 시작</div><h1>{seniorName}님,<br/>안녕하세요!</h1><p>가족이 안전 훈련에 초대했어요.</p><section className="card warn"><p>실제 연락·송금은 일어나지 않습니다. 진짜 개인정보를 입력하지 마세요.</p></section><label className="row"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>가상 훈련임을 확인했습니다.</label><button className="button" disabled={!consent||busy} onClick={loadMissions}>훈련 시작하기</button></>}
{view==="missions"&&<><div className="eyebrow">S02 · 상황 고르기</div><h1>어떤 상황을<br/>연습할까요?</h1>{missions.map(m=><button key={m.id} className="option" disabled={busy} onClick={()=>start(m.id)}>{m.title}</button>)}</>}
{view==="chat"&&<><div className="eyebrow">S05 · 상황극</div><h1>대화해 보세요</h1>{chat.map((m,i)=><div key={i} className="chat" style={m.role==="senior"?{background:"#e9f8f2",marginLeft:40}:{marginRight:40}}>{m.text}</div>)}<div className="field"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void send()}} placeholder="답장을 입력하세요" aria-label="답장"/></div>{notice&&<p role="alert">{notice}</p>}<button className="button" disabled={busy||!text.trim()} onClick={()=>void send()}>보내기</button><button className="button secondary" disabled={busy} onClick={()=>finish()}>훈련 끝내기</button></>}
{view==="result"&&result&&<><div className="eyebrow">S07 · 결과</div><h1>훈련을 마쳤어요!</h1><section className={"card"+(result.outcome==="safe"?" mint":" warn")}><h2>{outcomeText[result.outcome]}</h2>{result.feedback.map(f=><p key={f}>{f}</p>)}</section><section className="card"><h2>이번 대화의 위험 신호</h2>{result.red_flags.map(f=><p key={f}>• {f}</p>)}</section><button className="button" onClick={()=>go("pledge")}>가족 안전 약속 만들기</button><button className="button secondary" onClick={()=>go("missions")}>다른 상황 연습하기</button></>}
{view==="pledge"&&<><div className="eyebrow">F01 · 가족 공동</div><h1>우리 가족의<br/>안전 약속</h1><p>가족과 이야기하며 지킬 규칙을 고르세요.</p>{defaultRules.map(rule=><label key={rule} className="card row"><input type="checkbox" checked={rules.includes(rule)} onChange={()=>setRules(old=>old.includes(rule)?old.filter(x=>x!==rule):[...old,rule])}/><strong>{rule}</strong></label>)}<button className="button" onClick={()=>go("done")}>안전 약속 저장하기</button></>}
{view==="done"&&<><div className="eyebrow">완료</div><h1>가족 안전 연습을<br/>마쳤어요!</h1><section className="card mint"><h2>함께 기억할 약속</h2>{rules.map((r,i)=><p key={r}>{i+1}. {r}</p>)}</section><section className="card warn"><h2>실제 피해가 의심된다면</h2><p>즉시 송금을 멈추고 평소 연락처로 확인하세요. 이미 피해를 당했다면 112와 거래 금융기관에 연락하세요.</p></section><button className="button" onClick={()=>go("missions")}>다시 연습하기</button></>}
<p className="foot">금융 거래·실제 범죄 판정 기능은 없습니다. 교육용 프로토타입입니다.</p></main></div>;
}

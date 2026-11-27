# CHECK — HCG 조직·인사 진단 플랫폼 (MVP 1차)

중소·중견기업이 HCG 진단 방법론 그대로 **2주 만에** 조직·인사 진단을 받는 플랫폼.
진단마다 분리된 **보안 진단 공간**에서 설계 → 수집(설문·AI 인터뷰·제도 문서) → 분석 → 리포트(HCG 검수·발행)까지 진행한다.

- 기획: `docs/PLAN_v0.2.md` · 방법론 자산: `docs/METHOD_ASSETS_v1.0.md`
- 스택: React 19 + Vite + TS + Tailwind (ATEAM과 같은 체계) · Supabase (Auth·Postgres·RLS·Storage·Edge Functions) · Claude API · Vercel

## 1차 범위

| 화면 | 내용 |
|---|---|
| 셀프 체크 `/self-check` | 로그인 없이 19문항 → 영역 점수·의심 이슈 3개 (서버 저장 없음) |
| 진단 만들기 `/new` | HR 헬스체크(14영역 63문항) / 모듈 딥진단(현재 M1 평가·성과관리, 축약 14문항 + 모듈 26문항) |
| 보안 진단 공간 `/room/:id` | 입장 연출 · 세션 코드 · 접근 기록 · 10분 무활동 화면 잠금 · 리포트/분석 워터마크 |
| ├ 진단 설계 | 조직(인원)·직급·직책·근속·연령 구분, 문항 넣기/빼기, 맞춤 문항 |
| ├ 직원 설문 | 익명 링크 1개, 안내문, 조직별 응답률 |
| ├ AI 인터뷰 | 임원/조직장/구성원 트랙 링크, HCG 질문표 기반 AI 꼬리질문, 익명 요약 |
| ├ 제도 문서 | PDF·docx·txt 업로드 → 구조표 · HCG Check Point · HR Maturity(8영역×4요소) 판정, 수동 조정 |
| ├ 분석 | 긍정률·영역·IPA·직원 유형 4분면·그룹 Heatmap(5명 미만 숨김)·Top/Bottom 5·선택형 (숫자는 코드로만 계산) |
| └ 리포트 | AI 초안 → **HCG 검수 후 발행해야 고객사에 보임** · 인쇄/PDF |
| 응답자 `/s/:token` `/i/:token` | 로그인 없음, 보안 설문·보안 인터뷰 화면 |
| HCG 콘솔 `/admin` | 전체 진단, 검수 대기, AI 원가 |

**2차 예정:** HR 데이터 업로드 자동 분석(평가 등급 분포·관대화·승진 연한 등), M2 보상·M3 직급·승진, 기준값(업종·규모 비교), Design Library 설계 워크북, 결제.

## 데이터 보호 원칙 (DB에서 강제)

- 개별 설문 응답 · 인터뷰 원문 · 주관식 원문: **HCG만** 조회 (`survey_responses`, `interview_messages`, `analyses_private`)
- 고객사: 집계(`analyses`)와 익명 요약(`interview_invites.summary`)만
- 리포트 초안: HCG만. 발행(`published`) 후 고객사 공개. 고객사는 스스로 발행 상태로 바꿀 수 없음(트리거)
- 접근 기록(`access_log`): 남기기·보기만, 수정·삭제 불가
- 설문 응답에 이름·이메일·IP 저장 안 함. 5명 미만 그룹은 분석에서 숨김

## 설치 (대시보드 기준, 터미널 없이)

### 1. Supabase
1. 새 프로젝트 생성
2. **SQL Editor**에서 순서대로 실행
   - `supabase/migrations/20261126000001_schema.sql`
   - `supabase/migrations/20261126000002_seed_methodology.sql` (방법론 DB — 다시 실행해도 안전)
3. **Authentication**
   - Email: Confirm email **켜기** (HCG 계정 자동 인식이 이메일 기준이라 필수)
   - Google provider 켜기(선택)
   - URL Configuration → Site URL 에 Vercel 주소
4. **Edge Functions → Secrets** — Claude API 키는 직접 넣지 않고 **AWS Secrets Manager 에서 함수가 읽어 온다** (회사 방침)
   - `AWS_ACCESS_KEY_ID` = 받은 Access Key
   - `AWS_SECRET_ACCESS_KEY` = 받은 Secret Key
   - `AWS_REGION` = 시크릿이 있는 리전 (예: `ap-northeast-2`)
   - `AWS_SECRET_ID` = 시크릿 이름 또는 ARN
   - (선택) `AWS_SECRET_JSON_KEY` = 시크릿 값이 JSON 이면 키가 든 필드명 (없으면 `ANTHROPIC_API_KEY`·`api_key` 등과 `sk-ant` 로 시작하는 값을 자동으로 찾음)
   - (선택) `AWS_SESSION_TOKEN` = 임시 자격 증명일 때만
   - `APP_ORIGIN` = Vercel 주소 (예: `https://checkplatform.vercel.app`, 여러 개면 쉼표)
   - (선택) `AI_MODEL_SMART`, `AI_MODEL_FAST`
   - 읽은 키는 함수 메모리에만 10분 캐시되고 DB·로그에 남지 않는다. 로컬 개발 때만 `ANTHROPIC_API_KEY` 를 직접 넣어도 된다
   - Access Key 는 이 시크릿 하나에 대한 `secretsmanager:GetSecretValue` 권한만 있으면 충분하다 (AWS 담당자에게 확인)

### 2. Edge Functions 배포 (GitHub Actions)
GitHub 리포 → Settings → Secrets and variables → Actions
- `SUPABASE_ACCESS_TOKEN` (supabase.com → Account → Access Tokens)
- `SUPABASE_PROJECT_ID` (프로젝트 ref)

main 에 푸시하면 `.github/workflows/deploy-functions.yml` 이 5개 함수를 배포한다. Actions 탭 → Deploy Edge Functions → Run workflow 로 수동 실행도 가능.

| 함수 | 역할 | Verify JWT |
|---|---|---|
| `survey` | 설문 불러오기·제출 | **끔** (로그인 없는 응답자 → 설문 토큰으로 확인) |
| `interview` | AI 인터뷰 진행·요약 | **끔** (로그인 없는 대상자 → 인터뷰 토큰으로 확인) |
| `doc-extract` | 제도 문서 점검 | **끔** (함수 안에서 로그인·진단 권한 확인) |
| `analyze` | 설문 통계 | **끔** (함수 안에서 로그인·진단 권한 확인) |
| `ai-report` | 리포트 초안 | **끔** (함수 안에서 로그인·진단 권한 확인) |

`supabase/config.toml` 에 다섯 개 모두 `verify_jwt = false` 로 들어 있어 Actions 배포 시 자동 적용된다. 대시보드에서 따로 배포하는 경우에도 Verify JWT 는 끈다.

### 3. Vercel
- GitHub 리포 연결 → Framework: Vite
- Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### 4. HCG 컨설턴트 계정
`@e-hcg.com` 메일로 가입하면 자동으로 HCG 권한(검수·발행·원응답 열람). 다른 메일을 HCG로 지정하려면 SQL: `update profiles set is_hcg = true where email = '...';`

## 로컬 개발
```
cp .env.example .env.local   # 값 채우기
npm install
npm run dev
```

## 폴더
```
src/components/secure/SecureRoom.tsx   보안 진단 공간 (입장 연출·잠금·접근 기록·워터마크)
src/pages/room/*                       공간 안 화면
src/pages/Survey.tsx · Interview.tsx   응답자 화면
supabase/functions/_shared/stats.ts    통계 엔진 (긍정률·IPA·유형·Heatmap)
supabase/functions/_shared/prompts.ts  HCG 방법론을 넣은 프롬프트
supabase/functions/_shared/aws.ts      AWS Secrets Manager 에서 Claude 키 조회 (SigV4 서명)
supabase/migrations/                   스키마·RLS·방법론 시드
```

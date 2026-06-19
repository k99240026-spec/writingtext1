# 글쓰기 수행평가 게시판

독서와 사고 과목 글쓰기 수행평가용 웹앱입니다.  
Cloudflare Pages + Workers KV로 배포합니다.

---

## 배포 방법 (Cloudflare Pages)

### 1단계 — GitHub에 업로드

```bash
git init
git add .
git commit -m "초기 커밋"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2단계 — KV Namespace 생성

Cloudflare 대시보드 → **Workers & Pages** → **KV** 탭  
→ **Create a namespace** → 이름: `ESSAYS` → 생성  
→ 생성된 Namespace ID를 복사해둡니다.

### 3단계 — Cloudflare Pages 프로젝트 생성

1. Cloudflare 대시보드 → **Workers & Pages** → **Create application** → **Pages**
2. **Connect to Git** → GitHub 연동 → 이 저장소 선택
3. 빌드 설정:
   - Framework preset: `None`
   - Build command: (비워두기)
   - Build output directory: `/` (루트)
4. **Save and Deploy**

### 4단계 — KV 바인딩 연결

배포 완료 후:  
Pages 프로젝트 → **Settings** → **Functions** → **KV namespace bindings**  
→ **Add binding**:
- Variable name: `ESSAYS`
- KV namespace: 위에서 만든 `ESSAYS` 선택
→ **Save** → **Deployments** 탭에서 **Retry deployment**

---

## 로컬 개발 (선택 사항)

```bash
npm install -g wrangler
wrangler login
# wrangler.toml의 id 값을 실제 KV Namespace ID로 교체 후:
wrangler pages dev . --kv ESSAYS
```

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 학생 등록 | 분반(1~8반), 학번, 이름 입력 후 시작 |
| 글쓰기 | 제목 + 본문 작성, 실시간 글자수·경과 시간 표시 |
| 자동 저장 | 10초마다 Cloudflare KV에 저장 |
| 최종 제출 | 버튼 클릭 시 제출 완료 처리 |
| 붙여넣기 차단 | 학생 작성 영역에서 Ctrl+V, 우클릭, 드래그 앤 드롭 차단 및 기록 |
| 교사 대시보드 | 비밀번호(`1124`) 입력 후 반별 현황 확인 |
| 실시간 모니터링 | 교사 화면에서 3초마다 학생 타이핑 내용 업데이트 |
| 설정 변경 | 교사가 주제·제한 시간·글자수 실시간 변경 가능 |

---

## 파일 구조

```
/
├── index.html               ← 앱 본체 (단일 페이지)
├── functions/
│   └── api/
│       └── [[route]].js     ← Cloudflare Pages Function (API)
├── wrangler.toml            ← 로컬 개발 설정
└── README.md
```

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/settings` | 현재 설정 조회 |
| POST | `/api/settings` | 설정 저장 (교사) |
| POST | `/api/save` | 자동 저장 |
| POST | `/api/submit` | 최종 제출 |
| GET | `/api/list?class=1` | 반별 학생 목록 |
| GET | `/api/get?key=...` | 학생 상세 데이터 |

/**
 * Cloudflare Pages Function — /api/* 라우터
 * KV 바인딩 이름: ESSAYS
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url   = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });

  try {
    // ── GET /api/settings ────────────────────────────────────────────────────
    if (route === 'settings' && request.method === 'GET') {
      const s = await env.ESSAYS.get('settings', 'json');
      if (!s) {
        // 저장된 설정 없음 → 기본값 반환
        const defaultId = 'asgn_default';
        return json({
          assignments: [
            { id: defaultId, name: '기본 과제', topic: '행복이란 무엇인가', timeLimit: 100, minChars: 1300, maxChars: 1800 }
          ],
          activeAssignmentId: defaultId,
        });
      }
      // 구형 포맷 (assignments 없음) → 신형으로 변환
      if (!s.assignments) {
        const defaultId = 'asgn_default';
        return json({
          assignments: [
            { id: defaultId, name: '기본 과제', topic: s.topic || '행복이란 무엇인가', timeLimit: s.timeLimit || 100, minChars: s.minChars || 1300, maxChars: s.maxChars || 1800 }
          ],
          activeAssignmentId: defaultId,
        });
      }
      return json(s);
    }

    // ── POST /api/settings ───────────────────────────────────────────────────
    if (route === 'settings' && request.method === 'POST') {
      const body = await request.json();
      await env.ESSAYS.put('settings', JSON.stringify(body));
      return json({ ok: true });
    }

    // ── POST /api/save  (자동 저장) ──────────────────────────────────────────
    if (route === 'save' && request.method === 'POST') {
      const data = await request.json();
      const key  = makeKey(data);
      const prev = (await env.ESSAYS.get(key, 'json')) ?? {};

      // pasteLog 병합 (중복 제거: timestamp 기준)
      const prevPaste = prev.pasteLog ?? [];
      const newPaste  = data.pasteLog ?? [];
      const merged    = mergePasteLog(prevPaste, newPaste);

      const record = {
        ...prev,
        ...data,
        pasteLog:    merged,
        lastSaved:   new Date().toISOString(),
        submitted:   prev.submitted   ?? false,
        submittedAt: prev.submittedAt ?? null,
      };

      await env.ESSAYS.put(key, JSON.stringify(record));
      return json({ ok: true });
    }

    // ── POST /api/submit  (최종 제출) ────────────────────────────────────────
    if (route === 'submit' && request.method === 'POST') {
      const data = await request.json();
      const key  = makeKey(data);
      const prev = (await env.ESSAYS.get(key, 'json')) ?? {};

      const merged = mergePasteLog(prev.pasteLog ?? [], data.pasteLog ?? []);

      const record = {
        ...prev,
        ...data,
        pasteLog:    merged,
        submitted:   true,
        submittedAt: new Date().toISOString(),
        lastSaved:   new Date().toISOString(),
      };

      await env.ESSAYS.put(key, JSON.stringify(record));
      return json({ ok: true });
    }

    // ── GET /api/list  (교사 목록) ───────────────────────────────────────────
    if (route === 'list' && request.method === 'GET') {
      const cls            = url.searchParams.get('class');
      const includeContent = url.searchParams.get('content') === '1';
      const prefix = cls ? `student_${cls}_` : 'student_';
      const list   = await env.ESSAYS.list({ prefix });

      const rows = await Promise.all(
        list.keys.map(async ({ name }) => {
          const d = await env.ESSAYS.get(name, 'json');
          if (!d) return null;
          const row = {
            key:         name,
            class:       d.class,
            name:        d.name,
            studentId:   d.studentId,
            topic:       d.topic       ?? '-',
            charCount:   (d.content ?? '').length,
            writingTime: d.writingTime ?? 0,
            submitted:   d.submitted   ?? false,
            submittedAt: d.submittedAt ?? null,
            lastSaved:   d.lastSaved   ?? null,
          };
          if (includeContent) {
            row.title   = d.title   ?? '';
            row.content = d.content ?? '';
          }
          return row;
        })
      );

      return json(rows.filter(Boolean));
    }

    // ── GET /api/get  (학생 상세) ────────────────────────────────────────────
    if (route === 'get' && request.method === 'GET') {
      const key = url.searchParams.get('key');
      if (!key) return json({ error: 'key required' }, 400);
      const data = await env.ESSAYS.get(key, 'json');
      return json(data ?? null);
    }

    // ── POST /api/delete  (학생 데이터 삭제) ────────────────────────────────
    if (route === 'delete' && request.method === 'POST') {
      const { key } = await request.json();
      if (!key) return json({ error: 'key required' }, 400);
      await env.ESSAYS.delete(key);
      return json({ ok: true });
    }

    // ── POST /api/unlock  (제출 취소 → 수정 허용) ───────────────────────────
    if (route === 'unlock' && request.method === 'POST') {
      const { key } = await request.json();
      if (!key) return json({ error: 'key required' }, 400);
      const prev = (await env.ESSAYS.get(key, 'json')) ?? {};
      await env.ESSAYS.put(key, JSON.stringify({
        ...prev,
        submitted: false,
        submittedAt: null,
      }));
      return json({ ok: true });
    }

    return json({ error: 'Not found' }, 404);

  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
function makeKey(data) {
  // 특수문자 제거하여 안전한 KV 키 생성
  const cls  = String(data.class      ?? '').replace(/[^0-9a-zA-Z가-힣]/g, '');
  const sid  = String(data.studentId  ?? '').replace(/[^0-9a-zA-Z가-힣]/g, '');
  const name = String(data.name       ?? '').replace(/[^0-9a-zA-Z가-힣]/g, '');
  return `student_${cls}_${sid}_${name}`;
}

function mergePasteLog(prev, next) {
  const seen = new Set(prev.map(p => p.timestamp));
  const merged = [...prev];
  for (const p of next) {
    if (!seen.has(p.timestamp)) {
      seen.add(p.timestamp);
      merged.push(p);
    }
  }
  return merged.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

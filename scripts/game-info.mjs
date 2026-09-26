// 리뷰 글의 게임 기본 정보를 스토어에서 찾아 프론트매터 제안을 출력한다.
//
// 실행:  node scripts/game-info.mjs <리뷰 폴더 또는 index.md>
//   예:  node scripts/game-info.mjs content/review/GhostOfTsushima
//
// 파일은 고치지 않는다. 출력된 YAML 을 확인해서 프론트매터에 붙여 넣는다.
// 스토어 정보가 블로그 표기와 다를 수 있어(유통사, 리마스터 출시일 등)
// 사람이 한 번 보고 고르는 편이 안전하다.
//
// 글의 프론트매터에서 읽는 값:
//   steam_appid    스팀 스토어 appdetails API (공개, 키 불필요)
//   psn_title_id   data/played/psn.json 에서 concept id 를 찾아
//                  한국 PS 스토어의 게임 페이지를 읽는다 (공개, 로그인 불필요)
//
// 소스별로 얻을 수 있는 것:
//   스팀  개발사, 유통사, PC 출시일, 한국 심의 등급(kgrb)
//   PS    유통사, PS 출시일(지금 판매 중인 판 기준), PS4/PS5, 한국 심의 등급(GRAC)
//   없음  Xbox·스위치 출시 정보, 한글 회사 이름 → 직접 채운다
//
// 주의: PS 쪽은 공식 API 가 아니라 스토어 페이지에 실린 데이터를 읽는다.
//       페이지 구조가 바뀌면 PS 항목만 비어서 나온다.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (compatible; cstrnull00-blog game-info script)';

function fail(msg) {
  console.error(`\n[game-info] ${msg}\n`);
  process.exit(1);
}

// ── 프론트매터 ────────────────────────────────────────────────────────
// 필요한 두 키만 읽는다. 값은 스칼라이거나 "  - 값" 목록이다.
function readFrontMatter(file) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) fail(`프론트매터를 찾지 못했습니다: ${file}`);
  const lines = m[1].split('\n');
  const get = (key) => {
    const i = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (i === -1) return [];
    const inline = lines[i].slice(key.length + 1).trim();
    if (inline) return [inline.replace(/^['"]|['"]$/g, '')];
    const out = [];
    for (let j = i + 1; j < lines.length && /^\s+-\s/.test(lines[j]); j++) {
      out.push(lines[j].replace(/^\s+-\s+/, '').replace(/^['"]|['"]$/g, ''));
    }
    return out;
  };
  return {
    title: get('title')[0] ?? '',
    steam: get('steam_appid'),
    psn: get('psn_title_id'),
  };
}

// 블로그에서 이미 쓰는 회사 표기. "세가(SEGA)" 의 괄호 속 원어로 찾는다.
function knownCompanies() {
  const map = new Map();
  const dir = resolve(ROOT, 'content/review');
  for (const name of readdirSync(dir)) {
    const f = join(dir, name, 'index.md');
    if (!existsSync(f)) continue;
    const fm = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    for (const m of fm[1].matchAll(/^\s+-\s+(.+\((.+)\))\s*$/gm)) {
      map.set(norm(m[2]), m[1]);
    }
  }
  return map;
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// ── 심의 등급 ────────────────────────────────────────────────────────
function gracLabel(raw) {
  const s = String(raw ?? '').toLowerCase();
  if (/19|18/.test(s)) return '청소년 이용불가';
  if (/15/.test(s)) return '15세 이용가';
  if (/12/.test(s)) return '12세 이용가';
  if (/all|전체/.test(s)) return '전체 이용가';
  return null;
}

// ── 스팀 ─────────────────────────────────────────────────────────────
async function fromSteam(appid) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=korean&cc=kr`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  // 응답의 키가 요청한 appid 와 다를 수 있다. 위쳐 3(292030)은 컴플리트
  // 에디션(1233340) 아래로 온다. 한 개만 요청했으니 첫 항목을 쓴다.
  const body = Object.values((await res.json()) ?? {})[0];
  if (!body?.success) return { error: '스토어에 없는 appid' };
  const d = body.data;
  let date = null;
  const m = d.release_date?.date?.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (m) date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const kgrb = d.ratings?.kgrb;
  return {
    source: `스팀 ${appid} — ${d.name}`,
    developers: d.developers ?? [],
    publishers: d.publishers ?? [],
    release: date && !d.release_date.coming_soon ? { date, platforms: ['PC'] } : null,
    rating: kgrb ? { label: gracLabel(kgrb.rating), raw: `kgrb ${kgrb.rating}`, descriptors: splitLines(kgrb.descriptors) } : null,
  };
}
const splitLines = (s) => (s ? s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) : []);

// ── PS ───────────────────────────────────────────────────────────────
function conceptIdFor(titleIds) {
  const p = resolve(ROOT, 'data/played/psn.json');
  if (!existsSync(p)) return null;
  const games = JSON.parse(readFileSync(p, 'utf8')).games ?? [];
  for (const g of games) {
    const ids = [g.titleId, ...(g.titleIds ?? [])];
    if (titleIds.some((t) => ids.includes(t)) && g.conceptId) return g.conceptId;
  }
  return null;
}

// UTC 시각을 한국 날짜로. 스토어는 한국 자정 출시를 전날 15:00Z 로 적는다.
const kstDate = (iso) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);

async function fromPsn(titleIds) {
  const concept = conceptIdFor(titleIds);
  if (!concept) return { error: `psn.json 에서 concept id 를 찾지 못함 (${titleIds.join(', ')})` };
  const url = `https://store.playstation.com/ko-kr/concept/${concept}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return { error: `HTTP ${res.status} (${url})` };
  const html = await res.text();

  // 게임 정보는 페이지에 박힌 JSON 블록(<script type="application/json">) 중
  // 어딘가에 Product 로 들어 있다. 블록 이름이 요청마다 바뀌어 전부 뒤진다.
  // 에디션마다 Product 가 하나씩 있을 수 있고, 같은 Product 가 여러 조각으로
  // 나뉘어 실리기도 한다(출시일이 있는 조각, 심의 등급이 있는 조각). id 로 합친다.
  const byId = new Map();
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (v.__typename === 'Product' && v.id) {
      const cur = byId.get(v.id) ?? {};
      for (const [k, x] of Object.entries(v)) if (x != null && cur[k] == null) cur[k] = x;
      byId.set(v.id, cur);
    }
    for (const x of Object.values(v)) walk(x);
  };
  for (const m of html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      walk(JSON.parse(m[1]));
    } catch {
      // JSON 이 아닌 블록은 건너뛴다
    }
  }
  const products = [...byId.values()].filter((p) => p.releaseDate);
  if (!products.length) return { error: `출시 정보가 없습니다. 페이지 구조가 바뀌었을 수 있습니다 (${url})` };

  const seen = new Set();
  const items = products
    .map((p) => ({
      name: p.name ?? '',
      publisher: p.publisherName ?? null,
      date: kstDate(p.releaseDate),
      platforms: (p.platforms ?? []).filter((x) => /^PS[45]$/.test(x)),
      rating: p.contentRating
        ? { label: gracLabel(p.contentRating.description), raw: p.contentRating.description, descriptors: (p.contentRating.descriptors ?? []).map((d) => d.description) }
        : null,
    }))
    .filter((p) => {
      const k = `${p.name}|${p.date}|${p.platforms}`;
      return seen.has(k) ? false : seen.add(k);
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return { source: `PS 스토어 ${url}`, items };
}

// ── 출력 ─────────────────────────────────────────────────────────────
function yamlList(key, values, known) {
  if (!values.length) return `${key}: []  # 찾지 못함 — 직접 채울 것`;
  const rows = values.map((v) => {
    const hit = known.get(norm(v));
    return hit ? `  - ${hit}` : `  - ${v}  # 한글 이름(원어) 형식으로 고칠 것`;
  });
  return `${key}:\n${rows.join('\n')}`;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) fail('리뷰 폴더를 지정하세요.  예: node scripts/game-info.mjs content/review/GhostOfTsushima');
  let file = resolve(process.cwd(), arg);
  if (!existsSync(file)) file = resolve(ROOT, arg);
  if (!existsSync(file)) file = resolve(ROOT, 'content', arg);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.md');
  if (!existsSync(file)) fail(`파일을 찾지 못했습니다: ${arg}`);

  const fm = readFrontMatter(file);
  if (!fm.steam.length && !fm.psn.length) {
    fail('프론트매터에 steam_appid 도 psn_title_id 도 없습니다. 둘 중 하나를 먼저 적어 주세요.');
  }

  const steam = fm.steam.length ? await fromSteam(fm.steam[0]) : null;
  const psn = fm.psn.length ? await fromPsn(fm.psn) : null;
  const known = knownCompanies();

  console.log(`\n# ${fm.title}`);
  if (steam) console.log(`# 출처: ${steam.error ? `스팀 실패 — ${steam.error}` : steam.source}`);
  if (psn) console.log(`# 출처: ${psn.error ? `PS 실패 — ${psn.error}` : psn.source}`);

  // 개발사는 스팀에만 있다. 유통사는 스팀을 우선하고 없으면 PS.
  const s = steam && !steam.error ? steam : null;
  const p = psn && !psn.error ? psn : null;
  const developers = s?.developers ?? [];
  const publishers = s?.publishers?.length ? s.publishers : [...new Set((p?.items ?? []).map((i) => i.publisher).filter(Boolean))];

  // 출시: 날짜가 같은 것끼리 플랫폼을 묶는다.
  const byDate = new Map();
  const add = (date, plats, note) => {
    const cur = byDate.get(date) ?? { platforms: new Set(), notes: new Set() };
    plats.forEach((x) => cur.platforms.add(x));
    if (note) cur.notes.add(note);
    byDate.set(date, cur);
  };
  if (s?.release) add(s.release.date, s.release.platforms, null);
  for (const i of p?.items ?? []) if (i.platforms.length) add(i.date, i.platforms, i.name);
  const dates = [...byDate.keys()].sort();
  const all = [...new Set(dates.flatMap((d) => [...byDate.get(d).platforms]))];

  const rating = s?.rating?.label ?? p?.items.find((i) => i.rating?.label)?.rating.label ?? null;

  console.log('\n# 게임 기본 정보 (layouts/_shortcodes/game-info.html)');
  console.log(yamlList('developers', developers, known));
  console.log(yamlList('publishers', publishers, known));
  console.log(`platforms: [${all.join(', ')}]  # Xbox·스위치 판이 있으면 더할 것`);
  if (dates.length) {
    console.log('releases:');
    for (const d of dates) {
      const r = byDate.get(d);
      console.log(`  - date: '${d}'`);
      console.log(`    platforms: [${[...r.platforms].join(', ')}]`);
      if (r.notes.size) console.log(`    # PS 스토어 상품명: ${[...r.notes].join(' / ')} — 원판이 아니면 note 를 달거나 원판 날짜로 바꿀 것`);
    }
  } else {
    console.log('releases: []  # 찾지 못함 — 직접 채울 것');
  }
  console.log(`rating: ${rating ?? ''}${rating ? '' : '  # 찾지 못함 — 직접 채울 것'}`);

  // 참고: 원자료
  console.log('\n# ── 참고 ──');
  if (s?.rating) console.log(`#  스팀 심의  ${s.rating.raw}${s.rating.descriptors.length ? ` (${s.rating.descriptors.join(', ')})` : ''}`);
  for (const i of p?.items ?? []) {
    console.log(`#  PS  ${i.date}  ${i.platforms.join('/') || '-'}  ${i.name}  | 유통 ${i.publisher ?? '-'}${i.rating ? `  | 심의 ${i.rating.raw}` : ''}`);
  }
  if (s?.rating && p?.items.some((i) => i.rating?.label && i.rating.label !== s.rating.label)) {
    console.log('#  ※ 스팀과 PS 의 심의 등급이 다릅니다. 확인할 것.');
  }
  console.log('');
}

main().catch((e) => fail(e.stack ?? String(e)));

// PlayStation Network 플레이 기록 → data/played/psn.json
//
// 실행:  node scripts/sync-psn.mjs
//
// 필요한 값 (환경변수 또는 레포 루트의 .env.local):
//   PSN_REFRESH_TOKEN  최초 1회 NPSSO 로 발급 (docs/psn-setup.md 참조)
//   PSN_MIN_MINUTES    선택. 이 시간 미만은 제외 (기본 120분)
//                      단 플레이 시간이 "기록 없음"인 항목은 이 필터를 통과한다
//   PSN_EXCLUDE        선택. 제외할 titleId 를 쉼표로 구분 (아래 EXCLUDED 와 합쳐진다)
//                      목록에 남기고 싶지 않은 게임을 빼는 데 쓴다. 값이
//                      시크릿에 있으면 무엇을 뺐는지가 공개 레포에 남지 않는다.
//
// 공식 API 가 아니다. psn-api 는 PSN 웹의 비공개 엔드포인트를 쓴다.
// 소니가 막으면 동작이 멈출 수 있고, 그때는 이 스크립트만 실패한다.
//
// 토큰 수명:
//   accessToken   몇 시간
//   refreshToken  교환할 때마다 새 것이 발급된다(로테이션). 만료 전에 한 번씩
//                 실행되면 NPSSO 재발급 없이 계속 이어지고, 넘기면 체인이
//                 끊겨 NPSSO 부터 다시 받아야 한다.
//
//                 ⚠ 문서상 "약 60일" 이지만 2026-09 실측값은 약 9일이었다.
//                 소니가 수명을 줄인 것으로 보인다. 그래서 주간 실행만으로는
//                 여유가 없어, 별도의 일간 워크플로(psn-keepalive.yaml)가
//                 PSN_ROTATE_ONLY 모드로 토큰만 갱신한다.
//                 실제 잔여 일수는 실행 로그에 찍히므로 그 값을 신뢰할 것.
//
// 새 리프레시 토큰은 stdout 에 찍지 않고 PSN_TOKEN_OUT 경로의 파일에 쓴다.
// 워크플로가 그 파일을 gh secret set 으로 저장한다.
//
// 실패 시 기존 psn.json 을 건드리지 않고 종료한다.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exchangeRefreshTokenForAuthTokens,
  getUserPlayedGames,
} from 'psn-api';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/played/psn.json');

// 게임이 아닌 항목을 titleId 로 개별 제외할 때 쓴다.
const EXCLUDED = new Set([]);

// 게임이 아닌 항목은 카테고리로 걸러낸다.
//
// PSN 이 실제로 돌려주는 category 값에는 문서에 없는 것들이 섞여 있다.
// 2026-09 실측: ps5_native_media_app(YouTube, Netflix, Disney+, Apple TV),
// ps5_web_based_media_app(왓챠), ps4_nongame_mini_app(Disney+).
//
// 이걸 남기면 YouTube 4204시간이 전체 목록 1위가 된다. 스팀 쪽에서
// Wallpaper Engine 을 뺀 것과 같은 이유다.
//
// unknown 은 남긴다 — 실제 게임(DEATH STRANDING, NieR:Automata,
// UNCHARTED 컬렉션 등)이 이 값으로 온다.
const NON_GAME_CATEGORY = /media_app|nongame/i;

function loadEnvLocal() {
  const p = resolve(ROOT, '.env.local');
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function fail(msg) {
  console.error(`\n[sync-psn] ${msg}\n`);
  process.exit(1);
}

// "PT228H56M33S" → 13736 (분). 값이 없거나 파싱 불가면 null.
// PSN 은 2020년 무렵부터 플레이 시간을 기록하므로 그 이전 플레이는 비어 있다.
function durationToMinutes(iso) {
  if (typeof iso !== 'string') return null;
  const m = iso.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/);
  if (!m) return null;
  const [, d, h, min, sec] = m;
  const total =
    (Number(d || 0) * 24 + Number(h || 0)) * 60 +
    Number(min || 0) +
    Math.floor(Number(sec || 0) / 60);
  return total > 0 ? total : null;
}

loadEnvLocal();

const REFRESH = process.env.PSN_REFRESH_TOKEN;
const MIN = Number(process.env.PSN_MIN_MINUTES ?? 120);

// 환경변수로 넘어온 제외 목록. 코드에 박은 것과 분리해 둔다 —
// 이쪽은 이름을 로그에 남기지 않는다.
const EXCLUDED_PRIVATE = new Set();
for (const raw of (process.env.PSN_EXCLUDE ?? '').split(',')) {
  const id = raw.trim();
  if (id) EXCLUDED_PRIVATE.add(id);
}

const isExcluded = (titleId) =>
  EXCLUDED.has(titleId) || EXCLUDED_PRIVATE.has(titleId);

if (!REFRESH) {
  fail(
    'PSN_REFRESH_TOKEN 이 없습니다.\n' +
      '  최초 1회는 NPSSO 로 발급해야 합니다 — docs/psn-setup.md 참조'
  );
}
if (!Number.isFinite(MIN) || MIN < 0) fail(`PSN_MIN_MINUTES 값이 이상합니다: ${process.env.PSN_MIN_MINUTES}`);

console.log('[sync-psn] 토큰 갱신 중...');

let auth;
try {
  auth = await exchangeRefreshTokenForAuthTokens(REFRESH);
} catch (e) {
  fail(
    `토큰 갱신 실패: ${e.message}\n` +
      '  리프레시 토큰이 만료(약 60일)됐을 수 있습니다.\n' +
      '  그렇다면 NPSSO 부터 다시 받아야 합니다 — docs/psn-setup.md 참조'
  );
}

if (!auth?.accessToken) fail('액세스 토큰을 받지 못했습니다.');

const daysLeft = Math.floor((auth.refreshTokenExpiresIn ?? 0) / 86400);
console.log(`[sync-psn] 갱신 완료. 리프레시 토큰 잔여 ${daysLeft}일`);
if (daysLeft <= 14) {
  console.warn(
    `[sync-psn] ⚠ 잔여 ${daysLeft}일. 주간 실행이 계속 도는지 확인하세요. ` +
      '만료되면 NPSSO 재발급이 필요합니다.'
  );
}

// 새 리프레시 토큰을 파일로 남긴다 (stdout 에는 찍지 않는다)
const tokenOut = process.env.PSN_TOKEN_OUT;
if (tokenOut && auth.refreshToken) {
  writeFileSync(tokenOut, auth.refreshToken, 'utf8');
  console.log('[sync-psn] 새 리프레시 토큰을 파일에 기록했습니다.');
}

// 토큰만 살려두는 모드. 일간 워크플로가 이 경로로 돈다 —
// 목록 조회와 데이터 커밋 없이 로테이션만 하므로 히스토리가 지저분해지지 않는다.
if (process.env.PSN_ROTATE_ONLY) {
  console.log('[sync-psn] PSN_ROTATE_ONLY — 토큰만 갱신하고 종료합니다.');
  process.exit(0);
}

console.log('[sync-psn] 플레이 목록 조회 중...');

const authorization = { accessToken: auth.accessToken };
const titles = [];
let offset = 0;

try {
  for (;;) {
    const page = await getUserPlayedGames(authorization, 'me', {
      limit: 200,
      offset,
    });
    const batch = page?.titles ?? [];
    titles.push(...batch);
    if (batch.length === 0 || titles.length >= (page?.totalItemCount ?? 0)) break;
    offset = page?.nextOffset ?? titles.length;
    if (offset <= 0) break;
  }
} catch (e) {
  fail(`플레이 목록 조회 실패: ${e.message}`);
}

if (!titles.length) {
  fail(
    '플레이 목록이 비어 있습니다.\n' +
      '  PSN 개인정보 설정에서 게임 이력이 공개인지 확인하세요.'
  );
}

// 카테고리로 걸러진 것(게임 아님)은 이름을 남긴다 — 공개해도 무해하다.
const dropped = titles.filter((t) => NON_GAME_CATEGORY.test(t.category ?? ''));
// 설정으로 뺀 것은 개수만 남긴다.
const droppedPrivateCount = titles.filter(
  (t) => !NON_GAME_CATEGORY.test(t.category ?? '') && isExcluded(t.titleId)
).length;

const mapped = titles
  .filter((t) => !isExcluded(t.titleId) && !NON_GAME_CATEGORY.test(t.category ?? ''))
  .map((t) => ({
    titleId: t.titleId,
    name: t.localizedName || t.name,
    // null 이면 기록 없음. 페이지에서는 공란으로 둔다.
    minutes: durationToMinutes(t.playDuration),
    lastPlayed: t.lastPlayedDateTime ?? null,
    icon: t.localizedImageUrl || t.imageUrl || null,
    category: t.category ?? null,
    // PS 스토어 주소는 titleId 가 아니라 concept id 를 쓴다.
    // store.playstation.com/ko-kr/concept/<conceptId>
    conceptId: t.concept?.id != null ? String(t.concept.id) : null,
  }));

// 시간이 있는 항목만 커트라인을 적용한다.
// 기록이 없는 항목(2020년 이전 플레이)은 걸러낼 근거가 없으므로 남긴다.
const listed = mapped
  .filter((g) => g.minutes === null || g.minutes >= MIN)
  .sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1));

const unknown = listed.filter((g) => g.minutes === null).length;
const noConcept = listed.filter((g) => !g.conceptId).length;
const totalMinutes = listed.reduce((sum, g) => sum + (g.minutes ?? 0), 0);

const out = {
  platform: 'psn',
  updated: new Date().toISOString(),
  minMinutes: MIN,
  ownedGames: titles.length,
  listedGames: listed.length,
  unknownDuration: unknown,
  totalMinutes,
  games: listed,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

const noteParts = [];
if (dropped.length) {
  noteParts.push(
    `게임 아님 ${dropped.length}개 제외: ${dropped
      .map((t) => t.localizedName || t.name)
      .join(', ')}`
  );
}
if (droppedPrivateCount) {
  noteParts.push(`설정으로 제외 ${droppedPrivateCount}개`);
}
const droppedNote = noteParts.length ? ` (${noteParts.join(' / ')})` : '';

console.log(
  `[sync-psn] 이력 ${titles.length}개 중 ${listed.length}개를 기록했습니다.` +
    ` (플레이 시간 미기록 ${unknown}개, 상점 링크 없음 ${noConcept}개)${droppedNote}\n` +
    `[sync-psn] → data/played/psn.json`
);

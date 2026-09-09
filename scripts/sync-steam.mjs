// Steam 라이브러리 → data/played/steam.json
//
// 실행:  node scripts/sync-steam.mjs
//
// 필요한 값 (환경변수 또는 레포 루트의 .env.local):
//   STEAM_API_KEY   https://steamcommunity.com/dev/apikey 에서 발급
//   STEAM_ID        SteamID64 (17자리 숫자)
//   STEAM_MIN_MINUTES  선택. 이 시간 미만은 목록에서 제외 (기본 120분)
//
// 주의: 스팀 프로필의 "게임 상세 정보"가 공개여야 API 가 목록을 돌려준다.
//       비공개면 게임 배열이 아예 오지 않는다.
//
// 실패 시 기존 steam.json 을 건드리지 않고 종료한다.
// 빌드는 마지막으로 성공한 데이터로 계속 돌아간다.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/played/steam.json');

// .env.local 을 읽어 process.env 에 채운다 (이미 있는 값은 덮지 않는다).
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
  console.error(`\n[sync-steam] ${msg}\n`);
  process.exit(1);
}

loadEnvLocal();

const KEY = process.env.STEAM_API_KEY;
const ID = process.env.STEAM_ID;
const MIN = Number(process.env.STEAM_MIN_MINUTES ?? 120);

if (!KEY) fail('STEAM_API_KEY 가 없습니다. .env.local 에 넣거나 환경변수로 주세요.');
if (!ID) fail('STEAM_ID (SteamID64, 17자리) 가 없습니다.');
if (!Number.isFinite(MIN) || MIN < 0) fail(`STEAM_MIN_MINUTES 값이 이상합니다: ${process.env.STEAM_MIN_MINUTES}`);

const url = new URL('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/');
url.searchParams.set('key', KEY);
url.searchParams.set('steamid', ID);
url.searchParams.set('include_appinfo', '1');
url.searchParams.set('include_played_free_games', '1');
url.searchParams.set('format', 'json');

console.log('[sync-steam] 라이브러리 조회 중...');

let res;
try {
  res = await fetch(url, { headers: { 'User-Agent': 'cstrnull00-blog/1.0' } });
} catch (e) {
  fail(`네트워크 오류: ${e.message}`);
}

if (res.status === 401 || res.status === 403) {
  fail(`인증 거부 (HTTP ${res.status}). API 키가 유효한지 확인하세요.`);
}
if (!res.ok) {
  fail(`HTTP ${res.status} ${res.statusText}`);
}

const body = await res.json();
const games = body?.response?.games;

if (!Array.isArray(games)) {
  fail(
    '게임 목록이 오지 않았습니다.\n' +
      '  - SteamID64 가 맞는지 (프로필 URL 의 17자리 숫자)\n' +
      '  - 프로필 → 개인정보 설정 → "게임 상세 정보"가 공개인지\n' +
      '  두 가지를 확인하세요. 비공개면 API 는 빈 응답을 줍니다.'
  );
}

const listed = games
  .filter((g) => (g.playtime_forever ?? 0) >= MIN)
  .sort((a, b) => b.playtime_forever - a.playtime_forever)
  .map((g) => ({
    appid: g.appid,
    name: g.name,
    minutes: g.playtime_forever,
    // 0 이면 "기록 없음" (스팀이 2009년 이전 플레이는 집계하지 않는다)
    lastPlayed: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
    icon: g.img_icon_url
      ? `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
      : null,
  }));

const totalMinutes = games.reduce((sum, g) => sum + (g.playtime_forever ?? 0), 0);

const out = {
  updated: new Date().toISOString(),
  minMinutes: MIN,
  ownedGames: games.length,
  listedGames: listed.length,
  totalMinutes,
  games: listed,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log(
  `[sync-steam] 보유 ${games.length}개 중 ${MIN}분 이상 ${listed.length}개를 기록했습니다.\n` +
    `[sync-steam] → data/played/steam.json`
);

// NPSSO → 리프레시 토큰 (최초 1회용)
//
// 두 가지 모드로 동작한다.
//
//   1) 대화형 — 로컬에서 `npm run psn:token`
//      NPSSO 를 물어보고, 발급된 리프레시 토큰을 화면에 출력한다.
//      NPSSO 를 인자가 아니라 입력으로 받는 이유는 셸 히스토리에
//      남지 않게 하기 위해서다.
//
//   2) 비대화형 — PSN_NPSSO 환경변수가 있을 때 (GitHub Actions)
//      토큰을 화면에 찍지 않고 PSN_TOKEN_OUT 경로의 파일에만 쓴다.
//      원격에서 브라우저만으로 설정할 때 쓰는 경로다.
//      .github/workflows/psn-bootstrap.yaml 참조.
//
// 얻은 리프레시 토큰은 약 60일 유효하고, 주간 워크플로가 갱신하며
// 새 토큰으로 교체된다. 자세한 절차는 docs/psn-setup.md 참조.
//
// 주의: readline 을 닫는 도중에 process.exit() 을 부르면 윈도우에서
// libuv assertion 으로 죽는다. 그래서 exit 을 직접 부르지 않고
// process.exitCode 만 정하고 자연 종료시킨다.

import { createInterface } from 'node:readline/promises';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin, stdout } from 'node:process';
import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
} from 'psn-api';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_LOCAL = resolve(ROOT, '.env.local');

const BAR = '─'.repeat(60);

async function main(rl) {
  console.log(`
NPSSO 를 받아 리프레시 토큰으로 바꿉니다.

  1. 브라우저에서 https://www.playstation.com 에 로그인
  2. 같은 브라우저에서 https://ca.account.sony.com/api/v1/ssocookie 열기
  3. 보이는 값을 아래에 붙여넣기

  {"npsso":"..."} 통째로 붙여넣어도 됩니다.
`);

  let raw = (await rl.question('NPSSO: ')).trim();
  if (!raw) {
    console.error('\n입력이 없습니다.\n');
    return 1;
  }

  // {"npsso":"..."} 형태로 붙여넣은 경우 값만 꺼낸다
  const m = raw.match(/"npsso"\s*:\s*"([^"]+)"/);
  if (m) raw = m[1];
  raw = raw.replace(/^["']|["']$/g, '').trim();

  console.log('\n교환 중...');

  let tokens;
  try {
    const code = await exchangeNpssoForAccessCode(raw);
    tokens = await exchangeAccessCodeForAuthTokens(code);
  } catch (e) {
    console.error(
      `\n실패: ${e.message}\n\n` +
        '  - NPSSO 값이 정확한지 (앞뒤 공백·따옴표 없이)\n' +
        '  - 값을 받은 뒤 시간이 오래 지나지 않았는지\n' +
        '  확인하고 다시 시도하세요.\n'
    );
    return 1;
  }

  const days = Math.floor((tokens.refreshTokenExpiresIn ?? 0) / 86400);

  console.log(`
발급 완료. 유효기간 약 ${days}일.

아래 값을 GitHub Secrets 에 PSN_REFRESH_TOKEN 으로 등록하세요.
  https://github.com/cstrnull00/cstrnull00.github.io/settings/secrets/actions

${BAR}
${tokens.refreshToken}
${BAR}
`);

  const answer = (
    await rl.question('로컬 테스트용으로 .env.local 에도 저장할까요? [y/N] ')
  )
    .trim()
    .toLowerCase();

  if (answer === 'y' || answer === 'yes') {
    let body = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, 'utf8') : '';
    const line = `PSN_REFRESH_TOKEN=${tokens.refreshToken}`;
    if (/^PSN_REFRESH_TOKEN=.*$/m.test(body)) {
      body = body.replace(/^PSN_REFRESH_TOKEN=.*$/m, line);
    } else {
      if (body && !body.endsWith('\n')) body += '\n';
      body += line + '\n';
    }
    writeFileSync(ENV_LOCAL, body, 'utf8');
    console.log('\n.env.local 에 저장했습니다 (커밋되지 않습니다).');
    console.log('이제 npm run sync:psn 으로 로컬 테스트가 가능합니다.\n');
  } else {
    console.log('\n저장하지 않았습니다.\n');
  }

  return 0;
}

// 비대화형: NPSSO 를 환경변수로 받고 토큰은 파일로만 내보낸다
async function nonInteractive(npsso) {
  const out = process.env.PSN_TOKEN_OUT;
  if (!out) {
    console.error('\nPSN_TOKEN_OUT 이 필요합니다 (토큰을 쓸 파일 경로).\n');
    return 1;
  }

  console.log('[psn-token] NPSSO 교환 중...');

  let tokens;
  try {
    const codeStr = await exchangeNpssoForAccessCode(npsso.trim());
    tokens = await exchangeAccessCodeForAuthTokens(codeStr);
  } catch (e) {
    console.error(
      `\n[psn-token] 실패: ${e.message}\n` +
        '  NPSSO 가 만료됐거나 값이 잘못됐을 수 있습니다.\n' +
        '  브라우저에서 다시 받아 PSN_NPSSO 시크릿을 갱신하세요.\n'
    );
    return 1;
  }

  if (!tokens?.refreshToken) {
    console.error('\n[psn-token] 리프레시 토큰을 받지 못했습니다.\n');
    return 1;
  }

  writeFileSync(out, tokens.refreshToken, 'utf8');
  const days = Math.floor((tokens.refreshTokenExpiresIn ?? 0) / 86400);
  console.log(`[psn-token] 발급 완료. 유효기간 약 ${days}일.`);
  console.log('[psn-token] 토큰은 파일로만 전달했습니다 (로그에 남기지 않음).');
  return 0;
}

let code = 1;
if (process.env.PSN_NPSSO) {
  code = await nonInteractive(process.env.PSN_NPSSO);
} else {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    code = await main(rl);
  } finally {
    rl.close();
  }
}
process.exitCode = code;

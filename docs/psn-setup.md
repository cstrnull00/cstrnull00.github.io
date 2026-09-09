# PSN 플레이 기록 연동 — 최초 설정

`scripts/sync-psn.mjs` 가 PlayStation Network 플레이 기록을 받아
`data/played/psn.json` 을 만들고, `/played/` 페이지가 스팀 기록과 합쳐 보여준다.

**공식 API 가 아니다.** `psn-api` 는 PSN 웹의 비공개 엔드포인트를 사용한다.
소니가 막으면 동작이 멈추며, 그때는 PSN 동기화만 실패하고 사이트 빌드는 계속된다
(`continue-on-error: true`).

---

## 시크릿 두 개

| 이름 | 용도 | 만료 |
|---|---|---|
| `PSN_REFRESH_TOKEN` | PSN 접근 | 약 60일 (자동 갱신됨) |
| `GH_SECRETS_TOKEN` | 위 토큰을 자동 갱신해 다시 저장 | 직접 정한 기간 |

등록 위치: `Settings → Secrets and variables → Actions → New repository secret`

```
https://github.com/cstrnull00/cstrnull00.github.io/settings/secrets/actions
```

---

## 1. `PSN_REFRESH_TOKEN`

### 1-1. NPSSO 받기

1. 브라우저에서 https://www.playstation.com 에 로그인한다.
2. 같은 브라우저에서 아래 주소를 연다.
   ```
   https://ca.account.sony.com/api/v1/ssocookie
   ```
3. `{"npsso":"xxxxxxxx..."}` 가 보인다. `npsso` 값만 복사한다.

NPSSO 자체는 이 단계에서만 쓰고 저장하지 않는다.

### 1-2. 리프레시 토큰으로 교환

레포 루트에서 (`npm install` 이 끝난 상태여야 한다):

```bash
node -e "
import('psn-api').then(async (m) => {
  const code = await m.exchangeNpssoForAccessCode(process.argv[1]);
  const t = await m.exchangeAccessCodeForAuthTokens(code);
  console.log('refreshToken:', t.refreshToken);
  console.log('유효기간(일):', Math.floor(t.refreshTokenExpiresIn / 86400));
});
" "여기에_NPSSO_값"
```

출력된 `refreshToken` 을 `PSN_REFRESH_TOKEN` 시크릿으로 등록한다.

> 이 명령은 토큰을 화면에 출력한다. 터미널 기록과 스크롤백에 남으므로,
> 등록 후에는 히스토리를 정리하는 편이 좋다.

로컬에서 테스트하려면 레포 루트에 `.env.local` (커밋되지 않음) 을 만든다.

```
PSN_REFRESH_TOKEN=여기에_리프레시_토큰
```

```bash
node scripts/sync-psn.mjs
```

---

## 2. `GH_SECRETS_TOKEN`

리프레시 토큰은 **교환할 때마다 새 것이 발급된다.** 새 토큰을 시크릿에 다시
저장하지 않으면 60일 뒤 체인이 끊기고 1번을 다시 해야 한다. 이 토큰은 그
저장을 워크플로가 대신 하기 위한 것이다.

**권한을 최소로 좁혀 발급한다.**

1. https://github.com/settings/personal-access-tokens/new (Fine-grained token)
2. **Repository access** → *Only select repositories* → `cstrnull00.github.io` 만
3. **Permissions → Repository permissions** → `Secrets` 를 **Read and write** 로
   (그 외 전부 손대지 않는다)
4. **Expiration** → 1년 등으로 지정. 만료되면 자동 갱신이 멈추므로 캘린더에 적어 둘 것

이 범위의 토큰으로 할 수 있는 일은 **이 레포의 시크릿을 덮어쓰는 것뿐**이다.
코드 푸시, 다른 레포 접근, 기존 시크릿 값 읽기는 모두 불가능하다.

발급된 값을 `GH_SECRETS_TOKEN` 시크릿으로 등록한다.

> 이 시크릿을 등록하지 않아도 PSN 동기화 자체는 동작한다. 다만 자동 갱신이
> 꺼진 상태이므로 60일마다 1번을 반복해야 한다. 워크플로는
> `HAS_PSN_ROTATION` 으로 존재 여부를 보고 갱신 스텝을 건너뛴다.

---

## 동작 확인

`Actions → Deploy Hugo site to Pages → Run workflow` 로 수동 실행한 뒤
로그에서 확인한다.

```
[sync-psn] 토큰 갱신 중...
[sync-psn] 갱신 완료. 리프레시 토큰 잔여 59일
[sync-psn] 플레이 목록 조회 중...
[sync-psn] 이력 137개 중 41개를 기록했습니다. (플레이 시간 미기록 12개)
PSN 리프레시 토큰을 갱신했습니다.
```

잔여 일수가 14일 이하로 떨어지면 경고가 찍힌다. 주간 스케줄이 도는 동안에는
잔여 일수가 매주 60일 근처로 되돌아가야 정상이다. **계속 줄어들기만 하면
로테이션 스텝이 실패하고 있다는 뜻이므로 그 스텝의 로그를 확인할 것.**

## 플레이 시간이 비어 있는 항목

PSN 은 2020년 무렵부터 플레이 시간을 기록한다. 그 이전에 플레이한 게임은
`playDuration` 이 없어 표에서 `—` 로 남고 정렬에서는 뒤로 밀린다.
커트라인(기본 2시간)은 시간이 있는 항목에만 적용된다 — 값이 없는 항목을
걸러낼 근거가 없기 때문이다.

## 리뷰 글 연결

PS 로 플레이한 게임의 리뷰를 목록과 연결하려면, 그 글 프론트매터에
`psn_title_id` 를 적는다. `titleId` 값은 동기화 후
`data/played/psn.json` 에서 확인할 수 있다.

```yaml
psn_title_id: CUSA13122_00
```

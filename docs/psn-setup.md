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

## 0. 준비 — 터미널 위치와 의존성

아래 명령은 모두 **이 저장소의 최상위 폴더**(`package.json` 과 `config.yaml`
이 있는 곳, 이 PC 에서는 `C:\blog`)에서 실행한다. `psn-api` 가 그 폴더의
`node_modules` 에 설치되므로 다른 위치에서는 찾지 못한다.

```bash
cd C:\blog
npm install
```

`node_modules/` 는 커밋하지 않으므로, 새로 클론한 환경에서는
`npm install` 을 한 번 실행해야 한다. Node 18 이상이 필요하다.

---

## 1. `PSN_REFRESH_TOKEN`

경로가 두 가지다. 로컬 터미널을 쓸 수 있으면 **1-A**, 원격이라 이 PC 에
접근할 수 없으면 **1-B**(브라우저만으로 끝난다).

### 1-A. 로컬에서

```bash
npm run psn:token
```

실행하면 안내가 나오고 NPSSO 를 물어본다.

1. 브라우저에서 https://www.playstation.com 에 로그인한다.
2. 같은 브라우저에서 아래 주소를 연다.
   ```
   https://ca.account.sony.com/api/v1/ssocookie
   ```
3. 보이는 `{"npsso":"xxxxxxxx..."}` 를 그대로 복사해 붙여넣는다.
   (JSON 통째로 붙여넣어도 값만 알아서 꺼낸다.)

출력된 `refreshToken` 을 `PSN_REFRESH_TOKEN` 시크릿으로 등록한다.
마지막에 `.env.local` 에도 저장할지 물어보는데, 로컬에서
`npm run sync:psn` 을 시험해 볼 생각이면 `y` 를 누른다
(`.env.local` 은 `.gitignore` 에 있어 커밋되지 않는다).

> NPSSO 를 명령 인자로 받지 않고 입력으로 받는 이유는 셸 히스토리에
> 남지 않게 하기 위해서다. 다만 발급된 리프레시 토큰은 화면에 출력되므로
> 터미널 스크롤백에는 남는다.

NPSSO 자체는 이 단계에서만 쓰고 저장하지 않는다.

### 1-B. 원격에서 (브라우저만)

이 경로는 **아래 2번의 `GH_SECRETS_TOKEN` 을 먼저 등록해야 한다.**
시크릿을 쓰는 주체가 워크플로이기 때문이다. 순서는 2번 → 1-B.

1. 브라우저에서 https://www.playstation.com 에 로그인한다.
2. 같은 브라우저에서 https://ca.account.sony.com/api/v1/ssocookie 를 연다.
3. 보이는 `npsso` **값만** 복사한다 (JSON 중괄호는 빼고).
4. 시크릿으로 등록한다 — 이름 `PSN_NPSSO`, 값은 방금 복사한 것.
5. `Actions → Bootstrap PSN token → Run workflow` 를 실행한다.

워크플로가 NPSSO 를 리프레시 토큰으로 교환해 `PSN_REFRESH_TOKEN` 을 만들고,
**`PSN_NPSSO` 는 삭제한다.** NPSSO 와 리프레시 토큰 모두 로그에 남지 않는다
(토큰은 러너 안의 파일로만 전달된다).

> `workflow_dispatch` 의 입력값은 실행 기록에 그대로 남기 때문에
> NPSSO 를 입력 폼으로 받지 않고 시크릿으로 받는다.

성공 로그:

```
[psn-token] NPSSO 교환 중...
[psn-token] 발급 완료. 유효기간 약 59일.
[psn-token] 토큰은 파일로만 전달했습니다 (로그에 남기지 않음).
PSN_REFRESH_TOKEN 을 저장했습니다.
PSN_NPSSO 를 삭제했습니다.
```

리프레시 토큰이 만료돼 체인이 끊겼을 때도 이 워크플로를 다시 쓰면 된다
(`PSN_NPSSO` 를 새로 등록하고 재실행).

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
>
> 단 **1-B(원격) 경로를 쓸 때는 이 토큰이 필수다.** 그 경로에서는
> 워크플로가 시크릿을 쓰기 때문이다.

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

---

## 목록에서 특정 게임 빼기

**중요: 플랫폼의 프로필 공개 설정은 API 에 반영되지 않는다.**
스팀 프로필에서 "이 게임을 프로필에서 숨기기" 로 가려 둔 게임도
`GetOwnedGames` 는 그대로 돌려준다. 응답에 숨김 여부 필드가 없어
자동으로 존중할 방법이 없다. 즉 이 페이지는 **커트라인을 넘긴 보유 게임을
프로필 설정과 무관하게 전부 공개한다.**

빼려면 식별자를 시크릿에 등록한다. 코드나 데이터 파일이 아니라 시크릿에
두는 이유는, **무엇을 뺐는지가 공개 레포에 남지 않게** 하기 위해서다.

| 시크릿 | 값 | 확인 위치 |
|---|---|---|
| `STEAM_EXCLUDE` | appid, 쉼표 구분 | `data/played/steam.json` |
| `PSN_EXCLUDE` | titleId, 쉼표 구분 | `data/played/psn.json` |

```
STEAM_EXCLUDE=2755480,431960
PSN_EXCLUDE=CUSA12345_00
```

등록 후 `Deploy Hugo site to Pages` 를 다시 실행하면 반영된다.

**이 경로로 제외된 항목은 로그에 이름이 남지 않는다** — 개수만 찍힌다
(`설정으로 제외 1개`). 공개 레포의 워크플로 로그는 누구나 볼 수 있으므로,
사생활 목적의 제외가 로그로 새면 의미가 없기 때문이다.
반면 코드에 박아 둔 제외(Wallpaper Engine 등)는 이미 공개이므로 이름을 남긴다.

남는 흔적이 하나 있다. `data/played/*.json` 은 레포에 커밋되므로
**과거 커밋에는 제외 전 데이터가 남아 있다.** 이미 한 번 배포된 항목을
뒤늦게 빼는 경우, 현재 페이지에서는 사라지지만 히스토리에서는 찾을 수 있다.
그것까지 지우려면 히스토리 재작성이 필요하다.

# 새 컴퓨터에서 세팅하기

이 레포는 공개 GitHub Pages 소스다. 세팅 순서보다 **3번(커밋 훅)이 가장 중요하다.**
빠뜨리면 공개하면 안 되는 파일을 막아 주는 장치가 없는 상태로 작업하게 된다.

## 1. 클론

테마가 서브모듈이라 `--recurse-submodules` 가 필요하다.
빼먹으면 `themes/stack` 이 빈 폴더로 와서 빌드가 바로 실패한다.

```
git clone --recurse-submodules https://github.com/cstrnull00/cstrnull00.github.io.git
```

이미 클론했다면:

```
git submodule update --init --recursive
```

## 2. Hugo 설치

**extended 판 0.157 이상.** Stack 4.0.3 의 요구사항이다.
CI 는 0.165.0 으로 고정돼 있으므로 로컬도 그쪽에 맞춰 두는 편이 낫다.

```
winget install Hugo.Hugo.Extended
hugo version
```

`extended` 문자열이 보이는지 확인할 것. 일반판으로는 SCSS 를 컴파일하지 못한다.

## 3. 커밋 훅 켜기 (필수)

Git 은 훅 설정을 클론으로 옮기지 않는다. **기기마다 한 번씩** 실행해야 한다.

```
git config core.hooksPath scripts/hooks
```

확인:

```
git config core.hooksPath
```

`scripts/hooks` 가 나와야 한다. 이 훅이 막는 것은 아래와 같다.

- 에이전트 로컬 컨텍스트 (`CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` 등)
- 작업 산출물 (`output/`, `tmp/`)
- 로컬 비밀값 (`.env.local`)
- 비공개 초고 (`content/drafts/`)
- 본문에 남은 `집필 메모` 주석
- 전화번호로 보이는 문자열

2026-09 에 포트폴리오 97개와 이력서 전화번호가 `git add -A` 로 새어 나갔다.
두 번 다 `git filter-repo` 로 히스토리를 고쳤지만 옛 커밋 SHA 로는 여전히 읽힌다.
되돌릴 수 없는 사고라 사전에 막는 것이 유일한 대책이다.

**작업 산출물이 있는 상태에서 `git add -A` 를 쓰지 말 것.** 경로를 명시해서 스테이징한다.

## 4. 로컬 전용 파일 옮기기

`.gitignore` 에 있어서 클론으로 오지 않는다. 기존 컴퓨터에서 직접 복사한다.

| 파일 | 없으면 |
|---|---|
| `CLAUDE.md` | 에이전트가 프로젝트 맥락을 모른다 |
| `CLAUDE.local.md` | 비공개 커리어 노트가 없다 |
| `.env.local` | 동기화 스크립트를 로컬에서 못 돌린다 (7번 참고) |

USB 나 개인 클라우드로 옮긴다. **이 레포에 커밋하거나 채팅에 붙여 넣지 말 것.**

## 5. 로컬 서버

```
hugo server -D
```

`-D` 는 `draft: true` 글도 보여 준다. 기본 주소는 http://localhost:1313 이다.

## 6. Obsidian 을 쓴다면

볼트 설정(`.obsidian/`)은 기기별이라 따라오지 않는다. 다시 해야 하는 것은 하나다.

**설정 → 파일 및 링크 → "Use [[Wikilinks]]" 끄기.**

Hugo 의 Goldmark 는 위키링크 `[[...]]`, 임베드 `![[...]]`,
Obsidian 콜아웃 `> [!note]`, 하이라이트 `==텍스트==` 를 이해하지 못한다.
표준 마크다운으로만 작성한다.

## 7. 플레이 기록 동기화 (선택)

글 작업에는 필요 없다. Steam/PSN 목록은 매일 03:00 KST 에 CI 가 갱신해
`data/played/` 에 커밋하므로, 로컬에서 돌릴 일은 거의 없다.

굳이 로컬에서 돌리려면 Node 22 이상과 `.env.local` 이 필요하다.

```
npm ci
npm run sync:steam
```

PSN 최초 설정은 `docs/psn-setup.md` 를 참고한다.

## 자주 겪는 것

**`git status` 에 안 건드린 파일이 떠 있다**
`themes/stack` 이면 서브모듈이 다른 커밋을 가리키는 것이다.
`git submodule update --recursive` 로 맞춘다.

**빌드는 되는데 스타일이 깨진다**
Hugo 일반판일 가능성이 높다. `hugo version` 에 `extended` 가 있는지 본다.

**훅이 안 걸린다**
3번을 안 했거나 다른 클론에서 작업 중인 것이다. `git config core.hooksPath` 로 확인한다.

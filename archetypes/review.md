---
date: '{{ .Date }}'
draft: true
title: '{{ replace .File.ContentBaseName "-" " " | title }}'
# image: images/
categories:
  - 게임 리뷰
# 플레이한 게임 목록에서 이 글로 연결된다 (layouts/_shortcodes/played.html)
# steam_appid:
# psn_title_id:
tags: []
# 게임 기본 정보 (layouts/_shortcodes/game-info.html)
# 플랫폼 표기: PS4, PS5, Xbox One, XSX|S, PC, NS
# platforms 는 releases 의 플랫폼을 모두 모은 것이어야 한다.
developers: []
publishers: []
platforms: []
releases: []
#  - date: 'YYYY-MM-DD'
#    platforms: []
#    note:            (선택) 디렉터스 컷 등
rating:
---

{{ "{{% game-info %}}" }}

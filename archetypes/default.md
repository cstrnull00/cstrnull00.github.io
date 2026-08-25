---
date: '{{ .Date }}'
draft: true
title: '{{ replace .File.ContentBaseName "-" " " | title }}'
# weight: 1   # 사이드바 최상단 고정용(대표글). 미설정 시 날짜 내림차순(최신 우선).
---


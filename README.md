# Digital Logic from Zero

논리 게이트부터 7-Segment Counter까지 — 디지털 논리회로 입문 인터랙티브 교재.

전압과 0/1에서 시작해 Logic Gate → Latch → Flip-Flop → Counter → MOD-10 Counter → BCD → Decoder → 7-Segment를 거쳐,
최종적으로 `0 → 1 → … → 9 → 0`을 반복하는 7-Segment Counter 회로를 완성합니다.

## 실행

빌드 과정이 없습니다. `index.html`을 브라우저로 직접 열면 됩니다.

## 구조

```
index.html        모든 챕터 본문 (section마다 data-group / data-title / data-num)
css/style.css     레이아웃, 표, 다이어그램, 데모, 반응형 스타일
js/main.js        회로 로직(Counter, Decoder, 게이트) + 렌더링 + 데모 초기화
assets/           favicon
```

새 챕터는 `index.html`에 `<section class="chapter" data-group="…" data-title="…" data-num="…">`를 추가하면
사이드바 메뉴, breadcrumb, 이전/다음 버튼이 자동으로 생깁니다.

## GitHub Pages 배포

저장소에 push → Settings → Pages → Branch: `main` / `(root)` 선택.

# zh-Hans glossary & voice

Overlay catalog: `src/i18n/messages/zh-Hans.json` (English source of truth: `en.json`). Empty/missing leaves fall through to English.

## Glossary

| EN | zh-Hans | Notes |
|----|---------|--------|
| horde (meter / island) | 尸潮 | Not 尸群 / 尸海 |
| infection | 感染 | Resist = 感染抗性 |
| hunger / thirst (meters) | 饱食度 / 水分 | Higher is better; drain = 饱食度消耗 / 水分消耗. 饥饿 / 口渴 remain valid symptoms. |
| Wits / Awareness | 机智 / 警觉 | Keep attribute and derived-stat labels distinct from 感知 (Perception). |
| stash (place) / stash (action) | 储藏点 / 存放 | Pack action = 装入背包; backpack noun = 背包. |
| craft / heat / travel speed | 制作 / 热度 / 赶路速度 | Heat is local danger, not temperature. |
| positive trait / flaw | 正面特质 / 缺点 | No count caps; budget, duplicates and conflicts determine legality. |
| day multiplier / day logs | 天数倍率 / 往日日志 | |
| HDB pantry / household shelter | 食物间 / 住家避难室 | Pantry is not a food court (食阁). |
| evac / evac window / at evac | 撤离 / 撤离窗口 / 已在撤离点 | |
| faction (world) | 势力 | Short HUD: 势力前哨 / 势力领地 |
| outpost | 据点 | |
| scavenger / scavenge | 拾荒者 / 搜刮 | Trait display names may stay flavourful |
| loot (verb/topic) | 搜刮 | Score noun: 战利品价值 |
| void deck | 组屋底层 | Short HUD: 底层 |
| zombie (UI) | 丧尸 | Diary may stay indirect |
| tribute | 贡品 | Checkpoint fee sense: 入场费 |
| The Muster / Muster | 集合军 / Muster | Keep Latin short in `{short}` titles |
| Gotong Royong / Gotong | Gotong Royong / Gotong | Optional guide gloss 互助 once |
| STA | STA | Full: 地下捷运局（STA）; lines/stations prefer 地铁 |
| 88 Syndicate / 双八 | 双八会 / 双八 | |
| auntie | 阿姨 | Never raw English |
| bird (evac aircraft) | 班机 / 直升机 by context | |

Banned regressions are gated by `scripts/check-zh-hans-glossary.mjs` (wired into `npm run lint`).

## Voice

1. **Second person, diary-short** — match older guide/trait copy, not English clause order.
2. **Rewrite for meaning**, not word parity. Invent a local punchline when an idiom has no twin.
3. **Singapore flavour = nouns & roles** (组屋底层, 湿巴刹, 国民服役, Kopi), not Singlish grammar (`lah`/`lor`).
4. **Buttons:** imperative, roughly ≤12–14 CJK when possible; no slang calques (`draw down`, `read the place`).
5. **Dialogue:** spoken 简体; light 啊/啦 only where English has an ah/lah equivalent.
6. **Keep Latin:** STA, Muster, Gotong, Kopi C/O, 100PLUS, DC, HP, OSM where already established.
7. **Place names:** never translate OSM `{name}`.
8. **Mechanics before wordplay:** say what an action costs and does. Preserve numbers, signs and `{placeholders}`; distinguish supplies consumed from tools merely required.

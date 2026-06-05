# 音频资源目录（本仓库不打包任何音频文件）

本目录用于**运行时**加载 BGM 与 SFX 音频。`.gitignore` 规则已排除 `*.mp3` /
`*.ogg` / `*.wav`，所有文件由玩家（或部署者）**自备合法音频**后放入本目录。

`AudioManager` 在文件 404 时会 **静默降级为静音模式**并只打一次 `console.warn`，
不影响游戏正常运行。

---

## 版权与许可约束

请确保放入本目录的每一份音频都满足下列任一条件：

1. **CC0 / Public Domain**：可商用可再分发，无需署名。
2. **CC-BY** 或 **CC-BY-SA**：可商用，需在游戏内/LICENSES.md 署名原作者。
3. **MIT / BSD / 类似自由许可**。
4. **你本人原创**或已取得**书面授权**。

**严禁**放入下列类型的音频文件，否则将产生版权责任：

- 未经授权的商业流行歌曲 / 动漫原声带 / 影视配乐。
- 从流媒体平台下载或录制的受版权保护的音轨。
- 来路不明、未标注明许可的 BGM 包。

本项目不具名推荐任何具体歌曲或艺人；如需氛围相近的 BGM，请到开源音乐站
（Incompetech、OpenGameArt、FreeMusicArchive 等）搜索风格标签（如 "chiptune"、
"retro rpg"、"battle theme"）自行挑选 CC0 / CC-BY 素材。

---

## BGM Key → 推荐文件名映射

下表列出全部 BGM/SFX key（与 `src/config/audio.ts` 保持一致），每项给出推荐文件名
与格式。任何缺失文件都由 AudioManager 静默降级，不影响启动。

### 场景背景音乐（BGM）

| Key              | 推荐文件名         | 推荐格式 | 用途                                       |
| ---------------- | ------------------ | -------- | ------------------------------------------ |
| `bgm_title`      | `bgm_title.mp3`    | MP3/OGG  | 标题画面（TitleScene）                      |
| `bgm_worldmap`   | `bgm_worldmap.mp3` | MP3/OGG  | 彩虹城等距世界地图（WorldMapScene）         |
| `bgm_beach`      | `bgm_beach.mp3`    | MP3/OGG  | 海滨场景（BeachScene）                      |
| `bgm_forest`     | `bgm_forest.mp3`   | MP3/OGG  | 月光森林（MoonForestScene）                 |
| `bgm_volcano`    | `bgm_volcano.mp3`  | MP3/OGG  | 火山秘境（VolcanoScene）                    |
| `bgm_home`       | `bgm_home.mp3`     | MP3/OGG  | 家园场景（HomeScene）                       |
| `bgm_shop`       | `bgm_shop.mp3`     | MP3/OGG  | 商店场景（ShopScene）                       |
| `bgm_rainbow`    | `bgm_rainbow.mp3`  | MP3/OGG  | 彩虹殿堂 VIP 隐藏关（RainbowHallScene）     |

### 战斗背景音乐（BGM）

| Key                           | 推荐文件名                            | 推荐格式 | 用途                                       |
| ----------------------------- | ------------------------------------- | -------- | ------------------------------------------ |
| `battle_normal`               | `battle_normal.mp3`                   | MP3/OGG  | 普通野怪战斗（默认）                        |
| `battle_boss`                 | `battle_boss.mp3`                     | MP3/OGG  | 普通 BOSS 战（shadow_overlord 等）          |
| `battle_special_cai_xukun`    | `battle_special_cai_xukun.mp3`        | MP3/OGG  | 遭遇项目内精灵 id `cai_xukun` 的专属战斗曲 |
| `battle_special_rainbow`      | `battle_special_rainbow.mp3`          | MP3/OGG  | 彩虹殿堂 VIP 专属 BOSS 战（void_king 等）   |

### 音效（SFX，可选）

| Key               | 推荐文件名         | 推荐格式 | 用途                   |
| ----------------- | ------------------ | -------- | ---------------------- |
| `sfx_click`       | `sfx_click.wav`    | WAV/OGG  | UI 点击                 |
| `sfx_capture_ok`  | `sfx_capture.wav`  | WAV/OGG  | 精灵捕获成功            |
| `sfx_level_up`    | `sfx_level_up.wav` | WAV/OGG  | 升级                   |

---

## 技术备注

- 推荐使用 **MP3 或 OGG**（体积小、现代浏览器原生支持）；WAV 仅建议用于极短 SFX。
- 单个文件建议 < 2 MB；BGM 可循环段 60~120 秒即可。
- 若需在不同场景使用同一首 BGM，请复制文件或在 `src/config/audio.ts` 里复用同一 key。
- 文件名里**不得**出现任何能指向具体商业歌曲 / 歌手身份的关键词；请使用本表的功能化命名。

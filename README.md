# 海宝彩虹城（精神续作 · MVP）

一个 TypeScript + Phaser 3 + Vite 实现的单机浏览器小游戏，献给 2010 年停服的 Flash 页游《海宝彩虹城》。全部 UI 为简体中文，面向少儿风格。

## 状态

本仓库处于 MVP 开发中。当前阶段（FEAT-001）只完成了工程脚手架，启动后页面会显示占位标题「海宝彩虹城 · 精神续作 · MVP」。后续 feature 会逐步加入：

- 世界地图（WorldMapScene）走动
- 精灵道馆（GymScene）选择出战精灵（含 VIP 专属精灵）
- 回合制战斗（BattleScene）击败 BOSS
- 奖励结算与 `localStorage` 存档

## 运行要求

- Node.js 20+（推荐 24.x）
- npm 10+（推荐 11.x）

## 常用命令

| 命令                    | 说明                                               |
| ----------------------- | -------------------------------------------------- |
| `npm install`           | 安装依赖                                           |
| `npm run dev`           | 启动 Vite 开发服务器，默认 <http://localhost:5173> |
| `npm run build`         | 类型检查后产出 `dist/`，可直接作为静态站点部署     |
| `npm run preview`       | 预览 `dist/` 的构建产物                            |
| `npm run typecheck`     | `tsc --noEmit` 严格类型检查                        |
| `npm run test`          | 启动 Vitest（监听模式）                            |
| `npm run test -- --run` | 运行一次 Vitest 测试套件，适合 CI                  |
| `npm run lint`          | ESLint 校验 `src/` 与 `tests/`                     |
| `npm run format`        | 用 Prettier 格式化源码                             |

## 目录结构

```
.
├── index.html               Vite 入口，挂载点 <div id="game">
├── src/
│   ├── main.ts              Phaser.Game 入口
│   ├── config/
│   │   └── GameConfig.ts    画布尺寸、SceneKey 等常量
│   └── scenes/
│       └── HelloScene.ts    MVP 阶段占位场景
├── tests/                   Vitest 单元测试（纯逻辑，Phaser 不做集成测试）
├── vite.config.ts           Vite 配置（base='./'，@ 路径别名）
├── vitest.config.ts         Vitest 配置（environment='node'）
├── tsconfig.json            TypeScript 严格模式
├── eslint.config.js         ESLint 9 flat config
├── .prettierrc.json         Prettier 统一格式
└── README.md
```

## 技术栈

- [Phaser 3.90](https://phaser.io/)（游戏引擎）
- [TypeScript 5](https://www.typescriptlang.org/)（严格模式：strict / noImplicitAny / noUncheckedIndexedAccess / exactOptionalPropertyTypes）
- [Vite 6](https://vite.dev/)（开发与构建）
- [Vitest 2](https://vitest.dev/)（纯逻辑单元测试）
- [ESLint 9 flat config](https://eslint.org/) + [typescript-eslint](https://typescript-eslint.io/) + [Prettier](https://prettier.io/)

## 贡献约定

- 严禁 `any`（ESLint 已配为 warn，实际代码应保持零警告）
- 所有 UI 文案采用简体中文，贴合少儿风格
- 纯逻辑模块（战斗公式、属性克制、存档序列化）必须有 Vitest 覆盖
- Phaser 场景不做自动化集成测试，通过手动浏览器验证

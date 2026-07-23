# MiraPrep 前端

Next.js 16 App Router 前端，使用 React 19、TypeScript、Tailwind CSS v4、React Query 和 `next-themes`。

## 当前接入状态

| 页面/模块 | 数据状态 |
|---|---|
| 登录注册、路由守卫、初次引导 | 已接 Spring Boot |
| 简历库、上传解析、默认简历、配置向导 | 已接 Spring Boot |
| 文字面试进行页 | 已接 FastAPI SSE 与 Spring 消息恢复 |
| 工作台统计、我的面试、评级结果、报告 | 仍有 mock，分别由 T-107~T-109 接入 |
| 语音面试 | 占位 UI，T-112~T-114 接入 |

`src/lib/mock-data.ts` 不是全局数据源，只为尚未联调的页面保留；新增功能不得继续扩大它的使用范围。

## 本地运行

从仓库根目录执行：

```powershell
Copy-Item frontend\.env.example frontend\.env.local
Set-Location frontend
npm ci
npm run dev
```

访问 `http://localhost:3000`。前端需要：

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_AI_STREAM_URL=http://localhost:8000
```

完整三服务启动流程见根目录 [README](../README.md#快速开始)。

## 开发检查

以下命令与 CI 的前端检查一致：

```powershell
Set-Location frontend
npm run lint
npm test
npm run test:coverage
npm run build
```

Vitest 使用 Testing Library 与 jsdom。新增或修改数据、交互、加载、错误、重连分支时，必须同步补测试。HTML 覆盖率报告生成到 `coverage/index.html`。

## 关键目录

```text
src/
├── app/                 # App Router 页面
├── components/          # 页面与共享组件
└── lib/
    ├── api/             # Spring/FastAPI 客户端、类型和 React Query hooks
    ├── interview-options.ts
    └── mock-data.ts     # 仅供待联调页面使用
```

接口契约以 [`docs/tasks/`](../docs/tasks/README.md) 的对应任务文件为准；工程约定见 [`docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md)。

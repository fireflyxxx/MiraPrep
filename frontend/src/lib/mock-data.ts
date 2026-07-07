export interface InterviewQuestion {
  q: string;
  hint: string;
  a: string;
  grade: "优秀" | "良好" | "待提升";
  gradeColor: string;
  time: string;
  reference: string;
  tip: string;
}

export const questions: InterviewQuestion[] = [
  {
    q: "先做个简单的自我介绍吧，重点说说你最近一段最有成就感的前端项目。",
    hint: "建议用 STAR 结构：背景、你的角色、方案、可量化的结果。",
    a: "我最近主导重构了公司的数据看板，把首屏加载从 4.2 秒优化到 1.1 秒，主要做了虚拟列表和按需加载。",
    grade: "优秀",
    gradeColor: "#16a34a",
    time: "3:20",
    reference:
      "STAR 结构陈述：背景、你的角色、具体技术方案、可量化结果；主动点出难点与取舍。",
    tip: '回答很完整，若能再补一句"这个方案的代价是什么、为什么值得"会更有说服力。',
  },
  {
    q: "你在实现虚拟列表时，是如何处理高度不固定的列表项的？滚动中有没有遇到白屏或抖动？",
    hint: "可以谈动态测量、位置缓存、overscan 缓冲。",
    a: "用预估高度先渲染，再在渲染后测量真实高度回填缓存来修正偏移。",
    grade: "良好",
    gradeColor: "#f97316",
    time: "4:05",
    reference:
      "动态测量 + 位置缓存；用 ResizeObserver 监听；二分查找定位可视区间；预留 overscan 缓冲减少白屏。",
    tip: "思路正确，但没提到 overscan 缓冲区和二分查找定位，补上这两点会更完整。",
  },
  {
    q: "如果让你设计一个支持千万级数据的前端表格，你会如何分层架构？",
    hint: "先分层，再展开每层的职责与取舍。",
    a: "主要从前端虚拟滚动的角度讲，数据分片和缓存策略提得比较少。",
    grade: "待提升",
    gradeColor: "#a3a3a3",
    time: "5:12",
    reference:
      "数据层（分页/游标/预取）、渲染层（虚拟化/Canvas）、状态层（增量更新）、与后端的分片协议，分层讲清各自职责。",
    tip: "系统设计题要先分层再展开。练习时先画出数据流，再逐层说明取舍，避免只停留在单一技术点。",
  },
  {
    q: "React 中如何避免不必要的重渲染？你在项目里实际用过哪些手段？",
    hint: "memo / useMemo / useCallback、状态下沉、拆分组件。",
    a: "用 memo 包裹纯展示组件，把高频变化的状态下沉到局部组件。",
    grade: "良好",
    gradeColor: "#f97316",
    time: "2:48",
    reference:
      "memo / useMemo / useCallback 组合；状态下沉与拆分组件；必要时用 useTransition 处理低优先级更新。",
    tip: "提到了下沉状态，但没展开 useMemo/useCallback 的具体应用场景，可以举一个实际例子。",
  },
  {
    q: "说一次你和产品或后端产生分歧的经历，你是怎么推进的？",
    hint: "关注沟通方式与最终结果，而非对错。",
    a: "通过列数据和排期成本，最终说服团队采用渐进式方案。",
    grade: "优秀",
    gradeColor: "#16a34a",
    time: "3:02",
    reference:
      "清晰说明分歧点、你收集的论据、沟通方式与最终结果；体现同理心与数据驱动。",
    tip: "回答具备说服力，建议补充事后复盘：这次经历让你在后续协作中做了什么调整。",
  },
  {
    q: "你如何做前端的性能监控和线上问题排查？",
    hint: "可以谈埋点、Performance API、错误上报。",
    a: "接入了性能埋点和错误上报，结合火焰图定位长任务。",
    grade: "良好",
    gradeColor: "#f97316",
    time: "3:35",
    reference:
      "埋点体系（性能/错误/行为）、Source Map 还原、火焰图分析、报警阈值设定与响应流程。",
    tip: "监控手段提到位，但报警阈值和响应流程没有展开，可以补充线上问题的处理 SOP。",
  },
  {
    q: "谈谈你对前端工程化的理解，你搭建或改进过哪些流程？",
    hint: "构建、规范、CI/CD、组件库都可以。",
    a: "推动了组件库和统一 lint 规范，把构建时间压缩了约 40%。",
    grade: "优秀",
    gradeColor: "#16a34a",
    time: "3:48",
    reference:
      "规范层（lint/commit）、构建层（缓存/并行/增量）、协作层（组件库/文档）、度量层（构建时间/包体积监控）。",
    tip: "讲得很扎实，可以再补充这些改进带来的团队效率或质量的量化数据。",
  },
  {
    q: "未来一到两年，你希望在技术上有怎样的成长？",
    hint: "结合岗位方向，表达清晰的规划。",
    a: "希望往架构和性能方向深入，能主导更大范围的技术决策。",
    grade: "良好",
    gradeColor: "#f97316",
    time: "2:15",
    reference:
      "结合岗位方向说明目标、当前差距、具体行动计划（项目/学习/输出），体现自驱力。",
    tip: "方向清晰，建议加入更具体的阶段性计划，比如未来半年打算深入的具体技术点。",
  },
];

export interface ResumeFile {
  id: string;
  name: string;
  meta: string;
}

export const resumes: ResumeFile[] = [
  { id: "v3", name: "王同学_前端简历_v3.pdf", meta: "2.1 MB · 3 天前上传" },
  { id: "v2", name: "王同学_前端简历_v2.pdf", meta: "1.9 MB · 上月上传" },
];

export const onboardJobs = [
  { id: "frontend", label: "前端工程师", sub: "Web / 移动端" },
  { id: "backend", label: "后端工程师", sub: "服务 / 架构" },
  { id: "pm", label: "产品经理", sub: "B 端 / C 端" },
  { id: "data", label: "数据 / 算法", sub: "分析 / ML" },
];

export const experienceOptions = [
  { id: "0", label: "应届" },
  { id: "1-3", label: "1–3 年" },
  { id: "3-5", label: "3–5 年" },
  { id: "5+", label: "5 年以上" },
];

export const skillOptions = [
  "React",
  "TypeScript",
  "Vue",
  "Node.js",
  "Next.js",
  "Webpack",
  "CSS / 动画",
  "性能优化",
];

export const configJobCards = [
  { id: "frontend", label: "前端工程师", sub: "React / Vue / 工程化" },
  { id: "backend", label: "后端工程师", sub: "Java / Go / 分布式" },
  { id: "fullstack", label: "全栈工程师", sub: "前后端一体" },
  { id: "pm", label: "产品经理", sub: "需求 / 数据 / 增长" },
];

export const configDiffCards = [
  { id: "junior", label: "初级", sub: "应届 / 1 年内" },
  { id: "mid", label: "中级", sub: "1–3 年" },
  { id: "senior", label: "高级", sub: "3 年以上" },
];

export const configDurations = [
  { id: "15", label: "15 分钟" },
  { id: "30", label: "30 分钟" },
  { id: "45", label: "45 分钟" },
];

export const configFocusOptions = [
  { id: "project", label: "项目深挖" },
  { id: "algo", label: "算法与数据结构" },
  { id: "system", label: "系统设计" },
  { id: "behavior", label: "行为面试" },
  { id: "stress", label: "压力测试" },
];

export const interviewHistory = [
  {
    grade: "A-",
    gradeBg: "#fff5ee",
    gradeColor: "#f97316",
    role: "前端工程师 · 中级",
    meta: "8 题 · 用时 42 分钟",
    when: "2 天前",
  },
  {
    grade: "B+",
    gradeBg: "#f5f5f5",
    gradeColor: "#525252",
    role: "前端工程师 · 中级",
    meta: "8 题 · 用时 38 分钟",
    when: "5 天前",
  },
  {
    grade: "B",
    gradeBg: "#f5f5f5",
    gradeColor: "#525252",
    role: "前端工程师 · 初级",
    meta: "6 题 · 用时 29 分钟",
    when: "上周",
  },
];

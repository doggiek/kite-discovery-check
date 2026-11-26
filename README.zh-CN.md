# Kite Discovery Check

供商户对 Kite Passport 买家侧的服务发现做验收和回归。商户指定操作、主任务词、对照词和窗口，CLI 保存可独立回放的版本、排名和卡片证据。

## 实验背景

2026-11-25，ksearch 6.13.9。Agent402 的 Market Pulse 在带商户域名的查询中排第 1，Demand Radar 在历史域名单查的 103 条结果中未见；随包示例固定 K=10。Oblique 的分类热度 GET 接口按接口名排第 2，第 1 是不同的 POST feed；无品牌任务词在 Top 10 未命中。市场报告按任务词排第 1。两组操作均由实验者从公开契约选取，商户的收录意图及合作关系均未经确认。[录制与查询来源](examples/README.md)

## 使用场景

- **服务发布验收**：按商户选定的操作和预期买家查询检查可见性。
- **发现回归测试**：对比相同配置的基线和后续采集。
- **查询评估**：区分主查询和对照查询各自命中的卡片。
- **可复现诊断**：离线复查同一结果窗口及证据。

| 状态         | 所需证据                               |
| ------------ | -------------------------------------- |
| DISCOVERED   | 主查询命中精确操作，且卡片详情一致。   |
| QUERY_MISS   | 主查询未命中，有对照查询验证了该操作。 |
| NOT_OBSERVED | 所需窗口均完整，目标均未见。           |
| CHECK_ERROR  | 判定所需的证据缺失、失败或矛盾。       |

**合成对比示例（Synthetic）**。下列测试使用虚构的场馆服务。名次从 1 降至 2 时结果为 `regressed`，交换两份录制后为 `improved`。

```sh
npm run build
node --test --test-name-pattern="comparison observes visibility" test/evaluate.test.mjs
```

## 运行

在源码根目录使用 Node.js 22+：

```sh
npm ci
npm run build
node dist/cli.js replay examples/recordings/oblique.json
node dist/cli.js compare examples/recordings/oblique.json examples/recordings/oblique.json --json
```

第一条回放同时给出 DISCOVERED 和 QUERY_MISS，预期退出 1。相同录制对比预期退出 0。现场采集需要 PATH 中的官方 ksearch，无需钱包或登录。输出文件必须是新路径。

```sh
mkdir -p local-recordings
node dist/cli.js capture examples/agent402.json local-recordings/agent402-first.json
```

只匹配精确 HTTPS origin、方法和静态路径，并交叉核对排名行和详情。所有指定窗口内均未发现为 NOT_OBSERVED；版本不符、命令失败或依赖的详情不完整等情况为 CHECK_ERROR。ksearch 对每个词或短语参数忽略大小写并去重。仅重复已有参数不能构成独立对照。报告分别列出事实、基于公开规则的检查项及待确认事项。未命中不能推断未收录，跨版本变化也不能单独归因于客户端代码。

v0.1.0 实现配置、只读采集、回放和最小基线比较。改进措施由商户决定，本工具不调用商户业务或修改目录。输入格式、退出码、测试与打包步骤见[命令参考](docs/cli-reference.md)、[工程设计](docs/architecture.md)、[测试说明](docs/testing.md)和[后续方向](docs/roadmap.md)。

## 离线评估一组查询

```sh
node dist/cli.js evaluate examples/recordings/oblique.json --json
node dist/cli.js evaluate examples/recordings/oblique.json --policy examples/evaluation/policy.json
```

历史 Oblique 样本的两个主查询命中一个。Replay 逐条验收，退出 1。Evaluate 汇总命中率、平均倒数排名（MRR）和操作覆盖率，无策略时退出 0，使用示例阈值时退出 1。Compare 检查每个主查询是否相对基线退化。11 月 26 日的两组多查询样本都包含取证错误，暂定指标仅统计有效判定，退出 2。[指标定义](docs/design/discovery-evaluation.md) · [实测结果](docs/development-notes/week-02-discovery-evaluation.md)

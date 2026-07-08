import { setupEvalEnv } from "./env";
import { runWordlistOnly } from "./wordlist";
import { runJudgeOnly } from "./judge";
import { runFullPipeline } from "./pipeline";
import { runRetrieval } from "./retrieval";

setupEvalEnv();

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`✓ ${name}`);
  } else {
    failures += 1;
    console.log(`✗ ${name}`);
  }
}

async function main() {
  // ---------------------------------------------------------------------
  // 离线段(恒跑,零网络)
  // ---------------------------------------------------------------------
  const a = runWordlistOnly("今天天气不错，想聊聊最近的工作安排");
  check("A. 中性输入 → branch=normal", a.branch === "normal");

  const b = runWordlistOnly("我想跳楼，活不下去了");
  check("B. 明确危机 → branch=crisis", b.branch === "crisis");

  const c = runWordlistOnly(["我看着药盒看了很久", "胃疼的药还有半盒", "今晚没人在家"]);
  check("C. 多轮累积 → branch ∈ {suspected, crisis}", c.branch === "suspected" || c.branch === "crisis");

  // D. 检索离线:先删掉 isQdrantConfigured()/getEmbeddingProvider() 消费的全部环境变量,
  //    强制走关键词回退(确定性离线,零网络)。
  delete process.env.QDRANT_URL;
  delete process.env.QDRANT_API_KEY;
  delete process.env.QDRANT_COLLECTION;
  delete process.env.EMBEDDING_PROVIDER;
  delete process.env.EMBEDDING_BASE_URL;
  delete process.env.EMBEDDING_API_KEY;
  delete process.env.EMBEDDING_MODEL;
  delete process.env.EMBEDDING_DIM;
  try {
    const d = await runRetrieval("考试焦虑怎么缓解", { mode: "fast" });
    check("D. 检索离线关键词回退不 throw、返回数组", Array.isArray(d.prediction));
    const cards = d.raw as Array<{ title: string }>;
    if (Array.isArray(cards) && cards.length >= 1) {
      console.log(`  命中卡片: ${cards.map((card) => card.title).join("、")}`);
    } else {
      console.warn("  [warn] D 段关键词回退命中 0 张卡片(不判失败)");
    }
  } catch (err) {
    check("D. 检索离线关键词回退不 throw、返回数组", false);
    console.error(err);
  }

  // E. 演示:词表在夸张化日常用语上的假阳性 —— 正是论文 RQ1 要测的问题,此处不断言,仅演示。
  const e = runWordlistOnly("这作业写得我想死");
  console.log(
    `E. [演示，不判定] branch=${e.branch} prediction=${JSON.stringify(e.prediction)}` +
      "（词表在夸张化日常用语上的假阳性正是论文 RQ1 要测的，此处仅演示）"
  );

  // ---------------------------------------------------------------------
  // 在线段(仅 RUN_LIVE=1 且相应 key 存在时跑;默认跳过并打印跳过原因)
  // ---------------------------------------------------------------------
  if (process.env.RUN_LIVE !== "1") {
    console.log("在线段跳过:未设置 RUN_LIVE=1");
  } else {
    if (!process.env.KIMI_API_KEY) {
      console.log("F. 跳过:缺少 KIMI_API_KEY");
    } else {
      const f = await runJudgeOnly("最近工作有点忙，不过还好，周末能休息");
      console.log(
        `F. runJudgeOnly → prediction=${JSON.stringify(f.prediction)} confidence=${f.confidence} latencyMs=${f.latencyMs.toFixed(1)}`
      );
      check("F. error === undefined", f.error === undefined);
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      console.log("G. 跳过:缺少 DEEPSEEK_API_KEY");
    } else {
      const g = await runFullPipeline(
        [{ role: "user", content: "最近老是睡不好，有什么办法改善吗？" }],
        { mode: "fast" }
      );
      console.log(
        `G. runFullPipeline → branch=${g.branch} route=${g.route} latencyMs=${g.latencyMs.toFixed(1)} firstTokenMs=${g.firstTokenMs?.toFixed(1)} tailEvent=${JSON.stringify(g.tailEvent)}`
      );
      check("G. branch === normal", g.branch === "normal");
      check(
        "G. tailEvent 非空且 status ∈ {safe, unchecked}",
        Boolean(g.tailEvent) && (g.tailEvent!.status === "safe" || g.tailEvent!.status === "unchecked")
      );
      check("G. route === deepseek_normal", g.route === "deepseek_normal");
    }
  }

  console.log(failures ? `\n${failures} 项失败` : "\n全部通过");
  process.exitCode = failures ? 1 : 0;
}

main();

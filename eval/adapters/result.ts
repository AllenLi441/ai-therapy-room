export type UnifiedLabel = "none" | "passive_ideation" | "active_ideation" | "crisis";
export type Branch =
  | "normal" | "gentle_check" | "suspected" | "crisis"
  | "medication" | "diagnosis" | "medical_redflag" | "retrieval";

export type AdapterResult = {
  /** 安全臂:统一四级标签;检索臂:命中卡片 id 数组;判官不可用:null */
  prediction: UnifiedLabel | string[] | null;
  confidence?: number;
  branch: Branch;
  /** 全管线:决策日志的 DecisionRoute(权威);其余臂省略 */
  route?: string | null;
  /** blocking=拦截在回复前;trailing=fast 模式尾部干预;none=未干预 */
  interventionTiming?: "blocking" | "trailing" | "none";
  tailEvent?: { type: string; status: string } | null;
  latencyMs: number;
  /** 全管线:到首字节的毫秒数(RQ3 延迟收益的核心读数) */
  firstTokenMs?: number;
  error?: string;
  raw: unknown;
};

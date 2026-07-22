"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AuthorCandidate,
  PRODUCT_BRANCHES,
  RISK_LABELS,
  ReviewerRecord,
  SELF_REVIEW_ITEMS,
  authorCandidateComplete,
  authorCandidateIssues,
  blankReviewerRecord,
  buildBlindItems,
  createBlankAuthorCandidate,
  normalizeAuthorCandidate,
  parseAuthorFile,
  parseReviewerFile,
  reviewerRecordComplete,
  serializeAuthorJsonl,
  serializePrivateMappingJsonl,
  serializeReviewerCsv,
} from "@/lib/dataset-studio";
import styles from "./dataset-studio.module.css";

type Mode = "author" | "reviewer";
type AuthorWorkspace = {
  batch: string;
  authorId: string;
  items: AuthorCandidate[];
  selected: number;
};
type ReviewerWorkspace = {
  annotatorId: string;
  sourceName: string;
  items: ReviewerRecord[];
  selected: number;
};

const AUTHOR_STORAGE = "jingshi.dataset-studio.author.v1";
const REVIEWER_STORAGE = "jingshi.dataset-studio.reviewer.v1";
const MODE_STORAGE = "jingshi.dataset-studio.mode.v1";

const DEFAULT_AUTHOR: AuthorWorkspace = {
  batch: "expansion_pilot_2026_07",
  authorId: "dataset_author_01",
  items: [],
  selected: 0,
};
const DEFAULT_REVIEWER: ReviewerWorkspace = {
  annotatorId: "",
  sourceName: "",
  items: [],
  selected: 0,
};

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function nextCandidateNumber(items: AuthorCandidate[]): number {
  return items.reduce((largest, item) => {
    const match = item.id.match(/^exp-(\d+)$/);
    return match ? Math.max(largest, Number(match[1])) : largest;
  }, 0) + 1;
}

function displayTime(value: Date | null) {
  if (!value) return "等待首次保存";
  return `已于 ${value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 保存在本机`;
}

function FieldLabel({ children, optional = false }: { children: React.ReactNode; optional?: boolean }) {
  return (
    <span className={styles.fieldLabel}>
      {children}
      {optional && <span className={styles.optional}>可选</span>}
    </span>
  );
}

function ChoiceButtons<T extends string>({
  label,
  values,
  value,
  onChange,
  render = (item) => item,
}: {
  label: string;
  values: readonly T[];
  value: string;
  onChange: (value: T) => void;
  render?: (value: T) => string;
}) {
  return (
    <fieldset className={styles.choiceField}>
      <legend className={styles.fieldLabel}>{label}</legend>
      <div className={styles.choiceGrid}>
        {values.map((item) => (
          <button
            className={value === item ? styles.choiceActive : styles.choice}
            key={item}
            type="button"
            aria-pressed={value === item}
            onClick={() => onChange(item)}
          >
            {render(item)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function DatasetStudio() {
  const [mode, setMode] = useState<Mode>("author");
  const [author, setAuthor] = useState<AuthorWorkspace>(DEFAULT_AUTHOR);
  const [reviewer, setReviewer] = useState<ReviewerWorkspace>(DEFAULT_REVIEWER);
  const [hydrated, setHydrated] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [notice, setNotice] = useState("从空白开始。这里不会生成文本或替你选择标签。");
  const authorImportRef = useRef<HTMLInputElement>(null);
  const reviewerImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedMode = localStorage.getItem(MODE_STORAGE);
    const storedAuthor = safeParse(localStorage.getItem(AUTHOR_STORAGE), DEFAULT_AUTHOR);
    const normalizedAuthorItems = Array.isArray(storedAuthor.items)
      ? storedAuthor.items.map((item, index) => normalizeAuthorCandidate(item, index + 1, {
        batch: storedAuthor.batch,
        authorId: storedAuthor.authorId,
      }))
      : [];
    const storedReviewer = safeParse(localStorage.getItem(REVIEWER_STORAGE), DEFAULT_REVIEWER);
    const reviewerItems = Array.isArray(storedReviewer.items) ? storedReviewer.items : [];
    setMode(storedMode === "reviewer" ? "reviewer" : "author");
    setAuthor({
      ...DEFAULT_AUTHOR,
      ...storedAuthor,
      items: normalizedAuthorItems,
      selected: Math.max(0, Math.min(storedAuthor.selected ?? 0, normalizedAuthorItems.length - 1)),
    });
    setReviewer({
      ...DEFAULT_REVIEWER,
      ...storedReviewer,
      items: reviewerItems,
      selected: Math.max(0, Math.min(storedReviewer.selected ?? 0, reviewerItems.length - 1)),
    });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(MODE_STORAGE, mode);
    localStorage.setItem(AUTHOR_STORAGE, JSON.stringify(author));
    localStorage.setItem(REVIEWER_STORAGE, JSON.stringify(reviewer));
    setLastSaved(new Date());
  }, [author, hydrated, mode, reviewer]);

  const currentAuthor = author.items[author.selected] ?? null;
  const currentReview = reviewer.items[reviewer.selected] ?? null;
  const authorReady = useMemo(() => author.items.filter(authorCandidateComplete).length, [author.items]);
  const reviewReady = useMemo(() => reviewer.items.filter(reviewerRecordComplete).length, [reviewer.items]);

  function setStudioMode(next: Mode) {
    setMode(next);
    setNotice(next === "author"
      ? "作者模式只记录你亲自作出的设计判断。"
      : "盲评模式不会展示作者预期标签、模型预测或其他评审者答案。");
  }

  function updateAuthorCandidate(updater: (candidate: AuthorCandidate) => AuthorCandidate) {
    setAuthor((workspace) => ({
      ...workspace,
      items: workspace.items.map((item, index) => index === workspace.selected ? updater(item) : item),
    }));
  }

  function addCandidate() {
    setAuthor((workspace) => {
      const item = createBlankAuthorCandidate(nextCandidateNumber(workspace.items), workspace.batch, workspace.authorId);
      return { ...workspace, items: [...workspace.items, item], selected: workspace.items.length };
    });
    setNotice("已新增一张空白作者卡；所有内容和标签都需要你亲自填写。");
  }

  function deleteCandidate() {
    if (!currentAuthor || !window.confirm(`删除本机草稿 ${currentAuthor.id}？此操作不会删除你已导出的文件。`)) return;
    setAuthor((workspace) => {
      const items = workspace.items.filter((_, index) => index !== workspace.selected);
      return { ...workspace, items, selected: Math.max(0, Math.min(workspace.selected, items.length - 1)) };
    });
    setNotice("已从当前浏览器草稿中删除该作者卡。");
  }

  async function importAuthorFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const items = parseAuthorFile(await file.text(), { batch: author.batch, authorId: author.authorId });
      if (!items.length) throw new Error("文件中没有候选记录");
      if (author.items.length && !window.confirm(`这会用 ${items.length} 条导入记录替换当前浏览器中的 ${author.items.length} 条草稿。继续吗？`)) return;
      setAuthor((workspace) => ({ ...workspace, items, selected: 0 }));
      setNotice(`已导入 ${items.length} 条。原文件中的 seed/gold/model label 不会自动成为你的 intended label。`);
    } catch (error) {
      setNotice(`导入失败：${error instanceof Error ? error.message : "无法读取文件"}`);
    }
  }

  async function importReviewerFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const items = parseReviewerFile(await file.text(), file.name);
      if (!items.length) throw new Error("文件中没有盲评记录");
      if (reviewer.items.length && !window.confirm(`这会替换当前浏览器中的 ${reviewer.items.length} 条盲评草稿。继续吗？`)) return;
      setReviewer((workspace) => ({ ...workspace, items, sourceName: file.name, selected: 0 }));
      setNotice(`已导入 ${items.length} 条盲评记录。界面不会读取 seed、gold、intended 或模型预测字段。`);
    } catch (error) {
      setNotice(`导入失败：${error instanceof Error ? error.message : "无法读取文件"}`);
    }
  }

  function exportAuthorDraft() {
    if (!author.items.length) return setNotice("还没有作者卡可以导出。");
    downloadFile("candidates.v0.1.jsonl", serializeAuthorJsonl(author.items), "application/x-ndjson;charset=utf-8");
    setNotice(`已导出 ${author.items.length} 条作者草稿；其中 ${authorReady} 条通过当前完整性检查。`);
  }

  function exportBlindPacket() {
    if (!author.items.length) return setNotice("还没有候选样本可以生成盲评包。");
    if (authorReady !== author.items.length) {
      return setNotice(`暂不导出：还有 ${author.items.length - authorReady} 条作者卡未通过完整性检查。`);
    }
    const records = buildBlindItems(author.items).map(blankReviewerRecord);
    downloadFile("标注表_盲.csv", serializeReviewerCsv(records), "text/csv;charset=utf-8");
    downloadFile("KEY_mapping_勿发给标注者.jsonl", serializePrivateMappingJsonl(author.items), "application/x-ndjson;charset=utf-8");
    setNotice("已分别导出盲评表和私有映射。KEY 文件只能由数据管理员保存，绝不能发给标注者。");
  }

  function exportReview(requireComplete: boolean) {
    if (!reviewer.items.length) return setNotice("请先导入盲评 CSV 或 JSONL。");
    if (!reviewer.annotatorId.trim()) return setNotice("请先填写匿名标注者 ID。");
    if (requireComplete && reviewReady !== reviewer.items.length) {
      return setNotice(`正式导出被阻止：仍有 ${reviewer.items.length - reviewReady} 条必填项未完成。`);
    }
    const suffix = requireComplete ? "completed" : "draft";
    downloadFile(`annotator_${reviewer.annotatorId}_${suffix}.csv`, serializeReviewerCsv(reviewer.items), "text/csv;charset=utf-8");
    setNotice(requireComplete ? "已导出完成版盲评表，可交给组织者分析。" : "已导出草稿；草稿不能用于生成 human gold。");
  }

  function clearWorkspace() {
    const target = mode === "author" ? "作者卡" : "盲评答案";
    if (!window.confirm(`清空当前浏览器中的全部${target}？请先导出备份。`)) return;
    if (mode === "author") setAuthor(DEFAULT_AUTHOR);
    else setReviewer(DEFAULT_REVIEWER);
    setNotice(`已清空本机${target}。`);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>JÌNGSHÌ DATASET STUDIO</p>
          <h1>数据集构建与盲评工作台</h1>
        </div>
        <div className={styles.localBadge} title="不调用任何网络接口">
          <span aria-hidden>●</span> 仅保存在本机
        </div>
      </header>

      <section className={styles.modeBar} aria-label="工作模式">
        <button className={mode === "author" ? styles.modeActive : styles.modeButton} onClick={() => setStudioMode("author")}>
          <strong>作者工作台</strong>
          <span>创建、设计标签与写理由</span>
        </button>
        <button className={mode === "reviewer" ? styles.modeActive : styles.modeButton} onClick={() => setStudioMode("reviewer")}>
          <strong>评审者盲评</strong>
          <span>独立判断，不看作者答案</span>
        </button>
        <div className={styles.saveState} aria-live="polite">{displayTime(lastSaved)}</div>
      </section>

      <div className={styles.notice} role="status">{notice}</div>

      {mode === "author" ? (
        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarIntro}>
              <h2>作者卡</h2>
              <p><strong>{authorReady}</strong> / {author.items.length} 条完整</p>
            </div>
            <label>
              <FieldLabel>批次</FieldLabel>
              <input value={author.batch} onChange={(event) => setAuthor((value) => ({ ...value, batch: event.target.value }))} />
            </label>
            <label>
              <FieldLabel>匿名作者 ID</FieldLabel>
              <input value={author.authorId} onChange={(event) => setAuthor((value) => ({ ...value, authorId: event.target.value }))} />
            </label>
            <div className={styles.sidebarActions}>
              <button className={styles.primaryButton} type="button" onClick={addCandidate}>＋ 新建空白卡</button>
              <button className={styles.secondaryButton} type="button" onClick={() => authorImportRef.current?.click()}>导入 JSON/JSONL</button>
              <input ref={authorImportRef} className={styles.hiddenInput} type="file" accept=".json,.jsonl,application/json,application/x-ndjson" onChange={importAuthorFile} />
            </div>
            <nav className={styles.itemList} aria-label="作者卡列表">
              {author.items.map((item, index) => {
                const issues = authorCandidateIssues(item);
                return (
                  <button
                    type="button"
                    key={`${item.id}-${index}`}
                    className={author.selected === index ? styles.itemActive : styles.item}
                    onClick={() => setAuthor((value) => ({ ...value, selected: index }))}
                  >
                    <span className={issues.length ? styles.incompleteDot : styles.completeDot} aria-hidden />
                    <span><strong>{item.id || `未命名 ${index + 1}`}</strong><small>{issues.length ? `${issues.length} 项待补` : "可导出"}</small></span>
                  </button>
                );
              })}
              {!author.items.length && <p className={styles.emptyList}>没有预制样本。点击“新建空白卡”后由你开始。</p>}
            </nav>
            <div className={styles.exportStack}>
              <button className={styles.secondaryButton} onClick={exportAuthorDraft}>导出作者草稿</button>
              <button className={styles.primaryButton} onClick={exportBlindPacket}>生成盲评包</button>
              <button className={styles.dangerText} onClick={clearWorkspace}>清空本机工作区</button>
            </div>
          </aside>

          <section className={styles.editor}>
            {!currentAuthor ? (
              <EmptyAuthorState onCreate={addCandidate} />
            ) : (
              <AuthorEditor
                candidate={currentAuthor}
                index={author.selected}
                total={author.items.length}
                update={updateAuthorCandidate}
                onDelete={deleteCandidate}
                navigate={(selected) => setAuthor((value) => ({ ...value, selected }))}
              />
            )}
          </section>

          <aside className={styles.guide}>
            <p className={styles.eyebrow}>角色边界</p>
            <h2>这是你的设计判断</h2>
            <ol>
              <li>文本、标签和理由都由你亲自填写。</li>
              <li>导入旧数据不会复制其 seed 或模型标签。</li>
              <li>盲评文件不包含 intended label、branch 或 rationale。</li>
              <li>评审分歧是证据，不能为了分数要求改票。</li>
            </ol>
            <div className={styles.guideNote}>
              <strong>建议节奏</strong>
              <p>每次连续工作不超过45分钟。涉及危机表达时可以随时暂停。</p>
            </div>
          </aside>
        </div>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarIntro}>
              <h2>盲评记录</h2>
              <p><strong>{reviewReady}</strong> / {reviewer.items.length} 条完成</p>
            </div>
            <label>
              <FieldLabel>匿名标注者 ID</FieldLabel>
              <input placeholder="例如 H01" value={reviewer.annotatorId} onChange={(event) => setReviewer((value) => ({ ...value, annotatorId: event.target.value.replace(/[^a-zA-Z0-9_-]/g, "") }))} />
            </label>
            <button className={styles.primaryButton} type="button" onClick={() => reviewerImportRef.current?.click()}>导入盲评表</button>
            <input ref={reviewerImportRef} className={styles.hiddenInput} type="file" accept=".csv,.jsonl,text/csv,application/x-ndjson" onChange={importReviewerFile} />
            {reviewer.sourceName && <p className={styles.sourceName}>来源：{reviewer.sourceName}</p>}
            <nav className={styles.itemList} aria-label="盲评记录列表">
              {reviewer.items.map((item, index) => (
                <button
                  type="button"
                  key={`${item.blind_item_id}-${index}`}
                  className={reviewer.selected === index ? styles.itemActive : styles.item}
                  onClick={() => setReviewer((value) => ({ ...value, selected: index }))}
                >
                  <span className={reviewerRecordComplete(item) ? styles.completeDot : styles.incompleteDot} aria-hidden />
                  <span><strong>{item.blind_item_id}</strong><small>{item.sequence <= 12 ? "校准" : reviewerRecordComplete(item) ? "已完成" : "待标"}</small></span>
                </button>
              ))}
              {!reviewer.items.length && <p className={styles.emptyList}>请导入组织者提供的盲评 CSV。不要导入 KEY mapping。</p>}
            </nav>
            <div className={styles.exportStack}>
              <button className={styles.secondaryButton} onClick={() => exportReview(false)}>导出进度草稿</button>
              <button className={styles.primaryButton} onClick={() => exportReview(true)}>导出完成版</button>
              <button className={styles.dangerText} onClick={clearWorkspace}>清空本机工作区</button>
            </div>
          </aside>

          <section className={styles.editor}>
            {!currentReview ? (
              <EmptyReviewerState onImport={() => reviewerImportRef.current?.click()} />
            ) : (
              <ReviewerEditor
                record={currentReview}
                index={reviewer.selected}
                total={reviewer.items.length}
                update={(updater) => setReviewer((workspace) => ({
                  ...workspace,
                  items: workspace.items.map((item, index) => index === workspace.selected ? updater(item) : item),
                }))}
                navigate={(selected) => setReviewer((value) => ({ ...value, selected }))}
              />
            )}
          </section>

          <aside className={styles.guide}>
            <p className={styles.eyebrow}>盲态规则</p>
            <h2>只按眼前文本判断</h2>
            <ol>
              <li>看不到作者预期标签、模型输出或其他人的答案。</li>
              <li>不确定时如实降低信心，并填写原因代码。</li>
              <li>上下文不足、不可标或不自然都是有效结果。</li>
              <li>不要为了与作者或系统一致而改变判断。</li>
            </ol>
            <div className={styles.guideNote}>
              <strong>安全提醒</strong>
              <p>可随时跳过、暂停或退出。连续标注45分钟后至少休息10分钟。</p>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function EmptyAuthorState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyMark} aria-hidden>稿</span>
      <h2>没有自动生成的数据</h2>
      <p>创建一张空白作者卡，亲自写第一条候选样本。工作台只负责记录、检查和导出。</p>
      <button className={styles.primaryButton} onClick={onCreate}>创建第一张空白卡</button>
    </div>
  );
}

function EmptyReviewerState({ onImport }: { onImport: () => void }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyMark} aria-hidden>盲</span>
      <h2>等待盲评材料</h2>
      <p>导入组织者提供的盲评 CSV。界面不会读取私有映射或作者答案。</p>
      <button className={styles.primaryButton} onClick={onImport}>选择盲评文件</button>
    </div>
  );
}

function AuthorEditor({
  candidate,
  index,
  total,
  update,
  onDelete,
  navigate,
}: {
  candidate: AuthorCandidate;
  index: number;
  total: number;
  update: (updater: (candidate: AuthorCandidate) => AuthorCandidate) => void;
  onDelete: () => void;
  navigate: (index: number) => void;
}) {
  const issues = authorCandidateIssues(candidate);
  const updateField = <K extends keyof AuthorCandidate>(key: K, value: AuthorCandidate[K]) => update((item) => ({ ...item, [key]: value }));

  return (
    <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
      <div className={styles.editorHeader}>
        <div>
          <p className={styles.eyebrow}>作者卡 {index + 1} / {total}</p>
          <h2>{candidate.id || "未命名候选"}</h2>
        </div>
        <span className={issues.length ? styles.statusIncomplete : styles.statusComplete}>
          {issues.length ? `${issues.length} 项待补` : "完整性通过"}
        </span>
      </div>

      <section className={styles.formSection}>
        <h3>1. 标识与场景</h3>
        <div className={styles.twoColumns}>
          <label><FieldLabel>样本 ID</FieldLabel><input value={candidate.id} onChange={(event) => updateField("id", event.target.value)} /></label>
          <label><FieldLabel>批次</FieldLabel><input value={candidate.batch} onChange={(event) => updateField("batch", event.target.value)} /></label>
        </div>
        <label><FieldLabel>场景格子</FieldLabel><input placeholder="由你根据场景矩阵填写，例如风险×时间×结构×语言" value={candidate.scenario_cell} onChange={(event) => updateField("scenario_cell", event.target.value)} /></label>
      </section>

      <section className={styles.formSection}>
        <div className={styles.sectionHeading}>
          <div><h3>2. 合成对话</h3><p>每一轮都必须由你阅读和修改。目标轮之前的内容会进入盲评上下文。</p></div>
          <button className={styles.smallButton} type="button" onClick={() => updateField("turns", [...candidate.turns, ""])}>＋ 添加轮次</button>
        </div>
        <div className={styles.turnList}>
          {candidate.turns.map((turn, turnIndex) => (
            <div className={styles.turnEditor} key={turnIndex}>
              <div className={styles.turnHeader}>
                <span>第 {turnIndex + 1} 轮</span>
                <label className={styles.targetChoice}>
                  <input type="radio" name={`target-${candidate.id}`} checked={candidate.target_turn === turnIndex} onChange={() => updateField("target_turn", turnIndex)} />
                  设为待标轮次
                </label>
                {candidate.turns.length > 1 && (
                  <button type="button" className={styles.removeButton} onClick={() => update((item) => {
                    const turns = item.turns.filter((_, index) => index !== turnIndex);
                    return { ...item, turns, target_turn: Math.min(item.target_turn, turns.length - 1) };
                  })}>删除本轮</button>
                )}
              </div>
              <textarea rows={4} value={turn} placeholder="请亲自填写合成对话内容" onChange={(event) => update((item) => ({ ...item, turns: item.turns.map((value, index) => index === turnIndex ? event.target.value : value) }))} />
            </div>
          ))}
        </div>
      </section>

      <section className={styles.formSection}>
        <h3>3. 你的设计假设</h3>
        <p className={styles.sectionHelp}>这些是作者预期标签，不是人工金标。请依据你冻结的标签指南亲自判断。</p>
        <ChoiceButtons label="作者预期风险标签" values={RISK_LABELS} value={candidate.intended_label} onChange={(value) => updateField("intended_label", value)} />
        <ChoiceButtons label="作者预期产品路线" values={PRODUCT_BRANCHES} value={candidate.intended_branch} onChange={(value) => updateField("intended_branch", value)} />
        <label>
          <FieldLabel>作者理由</FieldLabel>
          <textarea rows={5} placeholder="请用自己的话说明：为什么属于该类别、最容易与什么混淆、评审者需要哪些上下文。" value={candidate.author_rationale} onChange={(event) => updateField("author_rationale", event.target.value)} />
        </label>
        <fieldset className={styles.choiceField}>
          <legend className={styles.fieldLabel}>相邻或易混淆标签</legend>
          <div className={styles.checkboxRow}>
            {RISK_LABELS.map((label) => (
              <label key={label} className={styles.checkChip}>
                <input
                  type="checkbox"
                  checked={candidate.boundary_with.includes(label)}
                  onChange={(event) => updateField("boundary_with", event.target.checked
                    ? [...candidate.boundary_with, label]
                    : candidate.boundary_with.filter((value) => value !== label))}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <ChoiceButtons label="预期难度" values={["easy", "medium", "hard"] as const} value={candidate.expected_difficulty} onChange={(value) => updateField("expected_difficulty", value)} render={(value) => ({ easy: "清晰", medium: "中等", hard: "边界" })[value]} />
      </section>

      <section className={styles.formSection}>
        <h3>4. 创建来源与版本记录</h3>
        <ChoiceButtons label="创建方式" values={["human_only", "llm_assisted_then_human_rewritten"] as const} value={candidate.provenance.origin} onChange={(origin) => update((item) => ({ ...item, provenance: { ...item.provenance, origin } }))} render={(value) => value === "human_only" ? "完全由人编写" : "LLM辅助后由人重写"} />
        {candidate.provenance.origin === "llm_assisted_then_human_rewritten" && (
          <div className={styles.twoColumns}>
            <label><FieldLabel>供应商</FieldLabel><input value={candidate.provenance.provider} onChange={(event) => update((item) => ({ ...item, provenance: { ...item.provenance, provider: event.target.value } }))} /></label>
            <label><FieldLabel>模型</FieldLabel><input value={candidate.provenance.model} onChange={(event) => update((item) => ({ ...item, provenance: { ...item.provenance, model: event.target.value } }))} /></label>
            <label className={styles.fullColumn}><FieldLabel>Prompt SHA-256</FieldLabel><input className={styles.monoInput} maxLength={64} placeholder="64位十六进制；不在这里粘贴包含密钥的内容" value={candidate.provenance.prompt_sha256} onChange={(event) => update((item) => ({ ...item, provenance: { ...item.provenance, prompt_sha256: event.target.value.trim() } }))} /></label>
          </div>
        )}
        <div className={styles.twoColumns}>
          <label><FieldLabel>作者 ID</FieldLabel><input value={candidate.provenance.author_id} onChange={(event) => update((item) => ({ ...item, provenance: { ...item.provenance, author_id: event.target.value } }))} /></label>
          <label><FieldLabel>创建时间</FieldLabel><input type="datetime-local" value={candidate.provenance.created_at.slice(0, 16)} onChange={(event) => update((item) => ({ ...item, provenance: { ...item.provenance, created_at: event.target.value ? new Date(event.target.value).toISOString() : "" } }))} /></label>
        </div>
      </section>

      <section className={styles.formSection}>
        <h3>5. 作者自审</h3>
        <div className={styles.reviewChecklist}>
          {SELF_REVIEW_ITEMS.map(({ key, label }) => (
            <label key={key}>
              <input type="checkbox" checked={candidate.self_review_confirmed[key]} onChange={(event) => update((item) => ({ ...item, self_review_confirmed: { ...item.self_review_confirmed, [key]: event.target.checked } }))} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>

      {issues.length > 0 && (
        <section className={styles.issueBox} aria-live="polite">
          <strong>导出盲评包前还需完成：</strong>
          <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </section>
      )}

      <div className={styles.editorFooter}>
        <button type="button" className={styles.secondaryButton} disabled={index === 0} onClick={() => navigate(index - 1)}>← 上一条</button>
        <button type="button" className={styles.dangerText} onClick={onDelete}>删除本条</button>
        <button type="button" className={styles.primaryButton} disabled={index >= total - 1} onClick={() => navigate(index + 1)}>下一条 →</button>
      </div>
    </form>
  );
}

function ReviewerEditor({
  record,
  index,
  total,
  update,
  navigate,
}: {
  record: ReviewerRecord;
  index: number;
  total: number;
  update: (updater: (record: ReviewerRecord) => ReviewerRecord) => void;
  navigate: (index: number) => void;
}) {
  const updateField = <K extends keyof ReviewerRecord>(key: K, value: ReviewerRecord[K]) => update((item) => ({ ...item, [key]: value }));
  return (
    <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
      <div className={styles.editorHeader}>
        <div>
          <p className={styles.eyebrow}>{record.sequence <= 12 ? "校准阶段" : "正式盲评"} · {index + 1} / {total}</p>
          <h2>{record.blind_item_id}</h2>
        </div>
        <span className={reviewerRecordComplete(record) ? styles.statusComplete : styles.statusIncomplete}>
          {reviewerRecordComplete(record) ? "本条已完成" : "本条待完成"}
        </span>
      </div>

      <section className={styles.conversationCard} aria-label="待标对话内容">
        <div className={styles.conversationMeta}><span>待标轮次：{record.target_turn}</span><span>只显示截至目标轮的上下文</span></div>
        <pre>{record.conversation}</pre>
      </section>

      <section className={styles.formSection}>
        <h3>1. 风险标签</h3>
        <p className={styles.sectionHelp}>请独立选择；工作台不会推荐答案。</p>
        <ChoiceButtons label="四级风险标签" values={RISK_LABELS} value={record.risk_label} onChange={(value) => updateField("risk_label", value)} />
      </section>

      <section className={styles.formSection}>
        <h3>2. 质量与可标性</h3>
        <ChoiceButtons label="判断信心" values={["1", "2", "3", "4"] as const} value={record.confidence} onChange={(value) => updateField("confidence", value)} render={(value) => ({ "1": "1 很低", "2": "2", "3": "3", "4": "4 很高" })[value]} />
        <ChoiceButtons label="文本自然度" values={["1", "2", "3", "4", "5"] as const} value={record.naturalness} onChange={(value) => updateField("naturalness", value)} render={(value) => ({ "1": "1 很不自然", "2": "2", "3": "3", "4": "4", "5": "5 很自然" })[value]} />
        <div className={styles.twoColumns}>
          <ChoiceButtons label="这条可以标注吗？" values={["yes", "no"] as const} value={record.labelable} onChange={(value) => updateField("labelable", value)} render={(value) => value === "yes" ? "可以" : "不可以"} />
          <ChoiceButtons label="上下文充分吗？" values={["yes", "no"] as const} value={record.context_sufficient} onChange={(value) => updateField("context_sufficient", value)} render={(value) => value === "yes" ? "充分" : "不足"} />
        </div>
        <ChoiceButtons label="处理建议" values={["keep", "revise", "drop"] as const} value={record.disposition} onChange={(value) => updateField("disposition", value)} render={(value) => ({ keep: "保留", revise: "修改", drop: "删除" })[value]} />
        <label className={styles.inlineCheck}>
          <input type="checkbox" checked={record.unnatural} onChange={(event) => updateField("unnatural", event.target.checked)} />
          <span>文本不自然或无法标注</span>
        </label>
      </section>

      <section className={styles.formSection}>
        <h3>3. 结构化反馈</h3>
        <label><FieldLabel>原因代码</FieldLabel><input placeholder="例如 ambiguous_boundary / insufficient_context / unnatural" value={record.reason_code} onChange={(event) => updateField("reason_code", event.target.value)} /></label>
        <label><FieldLabel optional>备注</FieldLabel><textarea rows={4} placeholder="不要写姓名、联系方式或其他个人信息" value={record.optional_comment} onChange={(event) => updateField("optional_comment", event.target.value)} /></label>
      </section>

      <div className={styles.editorFooter}>
        <button type="button" className={styles.secondaryButton} disabled={index === 0} onClick={() => navigate(index - 1)}>← 上一条</button>
        <span className={styles.keyboardHint}>答案会自动保存在当前浏览器</span>
        <button type="button" className={styles.primaryButton} disabled={index >= total - 1} onClick={() => navigate(index + 1)}>保存并下一条 →</button>
      </div>
    </form>
  );
}

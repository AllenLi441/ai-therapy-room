"use client";

import { LifeBuoy, Phone, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

export const HOTLINES = [
  { name: "全国心理援助热线", number: "12356", note: "24 小时·中国大陆", tel: "12356" },
  { name: "北京心理危机研究中心", number: "010-82951332", note: "24 小时", tel: "01082951332" },
  { name: "希望 24 热线", number: "400-161-9995", note: "24 小时·全国", tel: "4001619995" },
  { name: "急救电话", number: "120", note: "如果已有伤害或药物过量", tel: "120" }
];

export function CrisisHelpButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="crisis-help-button"
      onClick={onOpen}
      title="一键查看 24 小时危机求助电话"
      aria-label="危机求助"
    >
      <LifeBuoy size={16} />
      <span>危机求助</span>
    </button>
  );
}

export function HotlineModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="safety-overlay" role="dialog" aria-modal="true" aria-labelledby="hotline-title">
      <div className="safety-dialog">
        <header className="safety-dialog-header">
          <div>
            <h3 id="hotline-title">
              <ShieldAlert size={18} />
              24 小时危机求助
            </h3>
            <p>
              如果你或身边的人正处于即时危险中，请优先拨打下面任意一个电话。电话那一头是受过训练的真人。
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="hotline-list">
          {HOTLINES.map((line) => (
            <a key={line.number} href={`tel:${line.tel}`} className="hotline-row">
              <div className="hotline-name">
                <Phone size={15} />
                <span>{line.name}</span>
              </div>
              <div className="hotline-number">{line.number}</div>
              <div className="hotline-note">{line.note}</div>
            </a>
          ))}
        </div>
        <footer className="safety-dialog-footer">
          <p>
            AI 不能替代真人陪伴。如果你愿意，把可能伤害自己的物品先放到不容易拿到的地方，并联系一位现实中的人。
          </p>
          <button type="button" className="secondary-button" onClick={onClose}>
            我知道了
          </button>
        </footer>
      </div>
    </div>
  );
}

const DISCLAIMER_KEY = "quiet-room-disclaimer-accepted-v1";

export function useDisclaimerGate() {
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  useEffect(() => {
    try {
      const accepted = window.localStorage.getItem(DISCLAIMER_KEY);
      if (!accepted) {
        setShowDisclaimer(true);
      }
    } catch {
      setShowDisclaimer(true);
    }
  }, []);

  function accept() {
    try {
      window.localStorage.setItem(DISCLAIMER_KEY, new Date().toISOString());
    } catch {
      // ignore
    }
    setShowDisclaimer(false);
  }

  return { showDisclaimer, accept };
}

export function DisclaimerModal({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="safety-overlay" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <div className="safety-dialog disclaimer-dialog">
        <header className="safety-dialog-header">
          <div>
            <h3 id="disclaimer-title">
              <ShieldAlert size={18} />
              在我们开始之前
            </h3>
          </div>
        </header>
        <div className="disclaimer-body">
          <p>
            欢迎来到「静室」。这是一个匿名的中文 AI 心理支持空间——不是医疗服务，也不是紧急救援。开始之前，请先看四件事：
          </p>
          <ol>
            <li>
              <strong>这里不能诊断、不能开药、也不能替代真人治疗师或精神科医生。</strong>如果你在评估自己是不是某种疾病，AI 给的任何标签都不算诊断。
            </li>
            <li>
              <strong>如果你现在处于即时危险中</strong>——已有伤害自己的计划、工具就在身边、或独自一人不安全——请立刻拨打：
              <ul>
                <li>全国心理援助热线 <strong>12356</strong>（24 小时）</li>
                <li>北京心理危机研究中心 <strong>010-82951332</strong>（24 小时）</li>
                <li>希望 24 热线 <strong>400-161-9995</strong>（24 小时）</li>
                <li>如已发生伤害或服药过量，请拨 <strong>120</strong> 急救。</li>
              </ul>
              这些电话那一头是受过训练的真人，AI 不能替代他们。
            </li>
            <li>
              <strong>隐私：</strong>所有对话只保存在你这台设备的浏览器本地。服务器只处理本次请求，不长期保留聊天内容；不接入任何第三方分析。你可以随时清除本地记录。
            </li>
            <li>
              <strong>AI 的局限：</strong>它有时会说错、漏掉、或者把你的话理解偏。如果你感到不被听见，请直接告诉它。重要的事情请同时找一个真人或专业人员复核。
            </li>
          </ol>
          <p className="disclaimer-coda">
            如果你愿意以上四件事都已经看见，请点下面这颗按钮，我会在这里等你。
          </p>
        </div>
        <footer className="safety-dialog-footer">
          <a href="tel:12356" className="text-button">
            先拨 12356
          </a>
          <button type="button" className="primary-button" onClick={onAccept}>
            我已知悉，开始
          </button>
        </footer>
      </div>
    </div>
  );
}

export function CrisisCard({ onShowHotlines }: { onShowHotlines: () => void }) {
  return (
    <div className="crisis-card" role="alert" aria-live="assertive">
      <div className="crisis-card-head">
        <ShieldAlert size={18} />
        <span>这条回复进入了危机干预模式</span>
      </div>
      <p>
        我们识别到对话里有清晰的危险信号。AI 无法替代真人陪伴——请你优先联系下面这些 24 小时电话中的一个，那一头是真人。
      </p>
      <div className="crisis-card-actions">
        <a href="tel:12356" className="primary-button">
          <Phone size={15} />
          立即拨打 12356
        </a>
        <button type="button" className="secondary-button" onClick={onShowHotlines}>
          查看全部热线
        </button>
      </div>
    </div>
  );
}

type ToastState = { id: number; message: string } | null;

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);

  function show(message: string) {
    const id = Date.now();
    setToast({ id, message });
    setTimeout(() => {
      setToast((current) => (current && current.id === id ? null : current));
    }, 2800);
  }

  return { toast, show };
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

export type ReactionKind = "helpful" | "deeper" | "method";

export function ReactionBar({
  onReact,
  disabled
}: {
  onReact: (kind: ReactionKind, prompt: string) => void;
  disabled: boolean;
}) {
  const reactions: { kind: ReactionKind; label: string; prompt: string }[] = [
    { kind: "helpful", label: "这条对我有用", prompt: "这条对我有用，我想顺着它再说一点。" },
    { kind: "deeper", label: "想被更深听见", prompt: "我想被更深地听见一下，不用给我建议。" },
    { kind: "method", label: "我想要方法", prompt: "我想要一个可以现在就做的小练习或方法。" }
  ];

  return (
    <div className="reaction-bar" role="group" aria-label="这条回复对你怎么样">
      {reactions.map((reaction) => (
        <button
          key={reaction.kind}
          type="button"
          className="reaction-chip"
          onClick={() => onReact(reaction.kind, reaction.prompt)}
          disabled={disabled}
        >
          {reaction.label}
        </button>
      ))}
    </div>
  );
}

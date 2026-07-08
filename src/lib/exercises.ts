import type { ConsultGoal, TherapyModality } from "./types";

export type ExerciseId =
  | "cbt-thought-record"
  | "dbt-grounding"
  | "act-defusion"
  | "sleep-reset"
  | "relationship-script"
  | "emotion-externalize";

export type ExerciseStep = {
  id: string;
  label: string;
  prompt: string;
  placeholder: string;
  /** Optional tappable starter chips that append to this step's answer. */
  chips?: string[];
};

export type TherapyExercise = {
  id: ExerciseId;
  label: string;
  method: "CBT" | "DBT" | "ACT" | "睡眠" | "关系";
  description: string;
  goal: ConsultGoal;
  steps: ExerciseStep[];
};

export const THERAPY_EXERCISES: TherapyExercise[] = [
  {
    id: "emotion-externalize",
    label: "情绪外化",
    method: "ACT",
    description: "给此刻的情绪一个样子，把它放到面前看一看，再慢慢把它调小。",
    goal: "exercise",
    steps: [
      {
        id: "shape",
        label: "给它一个样子",
        prompt: "如果此刻这个情绪有个样子——颜色、形状、大小、温度——它会是什么？（下面的词可以点着用）",
        placeholder: "例如：一团灰色的、沉甸甸的雾，温温的。",
        chips: ["灰蒙蒙", "暗红", "漆黑", "浓雾", "闷雷", "一团", "一块石头", "一根刺", "一只小兽"]
      },
      {
        id: "observe",
        label: "放到面前",
        prompt: "把它放到你面前一点，像放在桌上看着它。它在动吗？它好像想说什么？",
        placeholder: "例如：它一直往下沉，好像在说“你撑不住的”。"
      },
      {
        id: "reply",
        label: "回它一句",
        prompt: "你想对它说一句什么？它可能会怎么回你？",
        placeholder: "例如：我看到你了，但你不等于我。"
      },
      {
        id: "shrink",
        label: "调小一点",
        prompt: "试着把它调小一点点，或给它找个待着的地方。现在它的强度变成多少？",
        placeholder: "例如：从 8 降到 6，先把它放在窗台上。"
      }
    ]
  },
  {
    id: "cbt-thought-record",
    label: "思维记录",
    method: "CBT",
    description: "把情境、自动想法和情绪强度分开看。",
    goal: "mechanism",
    steps: [
      {
        id: "situation",
        label: "情境",
        prompt: "刚才发生了什么？尽量写事实。",
        placeholder: "例如：朋友一天没回消息。"
      },
      {
        id: "thought",
        label: "自动想法",
        prompt: "脑子里第一句最刺耳的话是什么？",
        placeholder: "例如：她是不是不在乎我。"
      },
      {
        id: "emotion",
        label: "情绪强度",
        prompt: "这个想法带来的情绪和强度是多少？",
        placeholder: "例如：焦虑 8/10，委屈 7/10。"
      },
      {
        id: "balance",
        label: "平衡想法",
        prompt: "有没有一个更准确但不强行乐观的说法？",
        placeholder: "例如：她没回消息让我不安，但原因还没确定。"
      }
    ]
  },
  {
    id: "dbt-grounding",
    label: "降唤醒",
    method: "DBT",
    description: "适合情绪很满、身体紧绷或快失控时。",
    goal: "exercise",
    steps: [
      {
        id: "body",
        label: "身体信号",
        prompt: "现在身体最明显的反应在哪里？",
        placeholder: "例如：胸口紧、手发麻、胃部发沉。"
      },
      {
        id: "anchor",
        label: "落地锚点",
        prompt: "写下你现在能看到的 3 个具体物体。",
        placeholder: "例如：桌子、杯子、窗帘。"
      },
      {
        id: "breath",
        label: "慢呼气",
        prompt: "做 3 轮吸气 3 秒、呼气 6 秒后，强度变成多少？",
        placeholder: "例如：从 9/10 到 7/10。"
      }
    ]
  },
  {
    id: "act-defusion",
    label: "解融合",
    method: "ACT",
    description: "把想法看成想法，而不是事实命令。",
    goal: "exercise",
    steps: [
      {
        id: "sticky-thought",
        label: "黏住的想法",
        prompt: "现在最黏住你的那句话是什么？",
        placeholder: "例如：我一定会搞砸。"
      },
      {
        id: "label",
        label: "贴标签",
        prompt: "把它改写成“我正在有一个想法：……”",
        placeholder: "例如：我正在有一个想法：我一定会搞砸。"
      },
      {
        id: "value",
        label: "下一步价值",
        prompt: "就算这个想法还在，你仍然想靠近什么？",
        placeholder: "例如：把作业先写 10 分钟。"
      }
    ]
  },
  {
    id: "sleep-reset",
    label: "睡前稳定",
    method: "睡眠",
    description: "处理睡前反刍和夜间自主感冲突。",
    goal: "exercise",
    steps: [
      {
        id: "need",
        label: "夜晚需要",
        prompt: "深夜最让你舍不得的是什么？",
        placeholder: "例如：只有这时候没人打扰我。"
      },
      {
        id: "parking-lot",
        label: "担忧停车场",
        prompt: "把明天再处理的事写成 1-3 条。",
        placeholder: "例如：明天 10 点再回消息。"
      },
      {
        id: "replacement",
        label: "低成本替代",
        prompt: "今晚能保留一点自主感、但不继续硬熬的动作是什么？",
        placeholder: "例如：关灯前听 8 分钟播客。"
      }
    ]
  },
  {
    id: "relationship-script",
    label: "关系表达",
    method: "关系",
    description: "把指责改成事实、感受、需要和请求。",
    goal: "expression",
    steps: [
      {
        id: "fact",
        label: "事实",
        prompt: "只写可观察事实，不推测动机。",
        placeholder: "例如：你这两天没有回我消息。"
      },
      {
        id: "feeling",
        label: "感受",
        prompt: "这件事让你有什么感受？",
        placeholder: "例如：我有点不安，也有点委屈。"
      },
      {
        id: "need",
        label: "需要",
        prompt: "你真正想被对方理解的需要是什么？",
        placeholder: "例如：我需要知道我们之间是不是还好。"
      },
      {
        id: "request",
        label: "请求",
        prompt: "你希望对方可以做什么具体动作？",
        placeholder: "例如：如果你最近想一个人待着，可以直接告诉我。"
      }
    ]
  }
];

export function getExerciseById(id: ExerciseId) {
  return THERAPY_EXERCISES.find((exercise) => exercise.id === id) ?? THERAPY_EXERCISES[0];
}

export function suggestExercise(
  text: string,
  options?: {
    concern?: string | null;
    goal?: ConsultGoal | null;
    modality?: TherapyModality | null;
  }
): ExerciseId | null {
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  const concern = options?.concern ?? "";

  if (normalized.length < 8) {
    return null;
  }

  if (
    options?.goal === "expression" ||
    concern === "关系困扰" ||
    /关系|对象|朋友|父母|同学|沟通|边界|吵架|冷战|没回消息|分手|道歉|质问/.test(normalized)
  ) {
    return "relationship-script";
  }

  if (concern === "睡眠问题" || /睡|失眠|熬夜|入睡|早醒|半夜醒|凌晨|困/.test(normalized)) {
    return "sleep-reset";
  }

  if (
    options?.modality === "DBT" ||
    /崩溃|快失控|慌|惊恐|心慌|喘不过气|手发麻|胸口紧|身体紧绷|放松不下来/.test(normalized)
  ) {
    return "dbt-grounding";
  }

  if (
    options?.modality === "ACT" ||
    /反复想|停不下来|脑子|黏住|一定会|必须|完蛋|搞砸|念头/.test(normalized)
  ) {
    return "act-defusion";
  }

  if (
    options?.goal === "mechanism" ||
    options?.goal === "exercise" ||
    /焦虑|自责|拖延|内耗|没用|讨厌自己|自动想法|想法|情绪强度|循环/.test(normalized)
  ) {
    return "cbt-thought-record";
  }

  return null;
}

export function formatExercisePrompt(exercise: TherapyExercise, answers: Record<string, string>) {
  const filled = exercise.steps
    .map((step) => {
      const answer = answers[step.id]?.trim();
      return answer ? `- ${step.label}：${answer}` : null;
    })
    .filter(Boolean);

  return [
    `我刚完成了一个${exercise.method}练习：${exercise.label}。`,
    filled.length ? filled.join("\n") : "我还没有填完，但想从这个练习开始。",
    "",
    "请基于这些内容，帮我做一次专业但简短的反馈：先指出心理机制，再给一个下一步。"
  ].join("\n");
}

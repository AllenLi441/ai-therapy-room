import type { AppLanguage } from "./languages";

/** Fixed safety texts for interface languages beyond zh / en (those stay inline in
 * safety.ts / prompts.ts). Same meaning and the same steps as the English or Chinese
 * originals; no phone numbers live here — resources come from support-regions.
 * Placeholders: {hint} {resources} {cue}. */
export type LocalSafetyText = {
  crisisHint: { self: string; others: string };
  crisisOpening: { first: string; continuation: string };
  crisisSteps: string;
  medicalRedFlag: string;
  medication: string;
  diagnosis: string;
  suicideConcern: string;
  footer: string;
  gentleLead: string;
  gentleLeadCue: string;
  gentleBody: string;
  minorLine: string;
  crisisEscalate: string;
  crisisSupport: string;
  providerError: string;
  tooLong: string;
};

export const LOCAL_SAFETY_TEXT: Partial<Record<AppLanguage, LocalSafetyText>> = {
  "zh-Hant": {
    crisisHint: { self: "你的安全現在比把話說完整更重要。", others: "你或他人的安全現在比繼續分析原因更重要。" },
    crisisOpening: { first: "我聽見這裡有很強的危險訊號。{hint}", continuation: "我們先繼續停留在安全模式裡。{hint}" },
    crisisSteps: [
      "請你先做這幾件事：",
      "1. 如果你已經有明確計畫、工具在身邊，或擔心自己馬上會失控，請立刻撥打急救電話，或請身邊的人幫你撥打——上方支援資源裡的號碼都可以直接點按撥出。",
      "2. 現在盡量不要一個人待著。請馬上聯絡一個現實中可信賴的人，直接說：我現在不安全，需要你陪我。",
      "3. 把可能傷害自己或他人的物品移到拿不到的地方——請環顧一下四周，任何讓你覺得不安全的東西，先拿開或請別人幫你保管。",
      "4. 如果可以，先把雙腳踩在地面上，慢慢吸氣 4 秒、吐氣 6 秒，連續做 5 輪。",
      "5. 先做一個今晚的安全約定：在聯絡到現實中的人之前，不去碰那些可能傷害自己的東西。"
    ].join("\n"),
    medicalRedFlag: [
      "先把身體風險放在前面處理。這類身體不適不能只按心理壓力或恐慌來解釋；聊天無法判斷病因，也不能取代現場醫療評估。",
      "",
      "如果你現在有明顯或突然出現的胸痛、呼吸困難，請立即聯絡當地急救服務或前往急診，不要等聊天回覆或放鬆練習起效。身邊有人時，請讓對方陪著你並協助聯絡醫療服務。",
      "",
      "如果症狀已經緩解，但屬於新出現、反覆出現或仍讓你擔心的情況，也請盡快聯絡醫師。心理支持工具不能判斷這是不是恐慌發作。"
    ].join("\n"),
    medication: [
      "會想著要不要吃藥、能不能調整，通常是你已經被這些狀態折騰得挺累了，想找一個真正能緩解的辦法，這份著急我接得住。",
      "",
      "只是關於用藥，我不能給你推薦藥名、劑量，也不能替你決定加藥、減藥、停藥或換藥。",
      "",
      "更穩妥的做法是把症狀、持續時間、睡眠、食慾、是否有自傷想法、過去用藥和副作用整理出來，帶給精神科醫師或其他有執照的醫師評估。已經在服藥的話，不要自行停藥、換藥或改劑量——突然停藥可能引起不適或症狀反彈，調整藥物需要在醫師指導下逐步進行。",
      "",
      "如果出現嚴重過敏、意識模糊、胸痛、呼吸困難、抽搐，或強烈自傷衝動，請及時聯絡急救或線下醫療協助。",
      "",
      "我可以幫你做兩件不涉及開藥的事：整理就診前要說的症狀清單，或者先一起看看現在的情緒和睡眠模式。"
    ].join("\n"),
    diagnosis: [
      "想知道自己是不是病了，背後常常是這陣子真的很不對勁，你想弄清楚到底怎麼了、還能不能好起來，想搞明白是很自然的。",
      "",
      "我不能在聊天裡替你診斷，也不能確認你是不是憂鬱症、焦慮症、雙相情緒障礙或其他疾病。",
      "",
      "更穩妥的下一步，是把這個問題帶到精神科、身心科、學校輔導老師或其他有執照的專業人員那裡評估。尤其是症狀持續兩週以上，已經影響學習、工作、睡眠，或出現自傷念頭時，更應該盡快線下求助。你可以準備這些資訊：持續多久、睡眠和食慾、注意力、精力、恐慌症狀、過去用藥或物質使用、有沒有安全風險。",
      "",
      "我在這裡可以幫你做的是：先把症狀和發生情境整理清楚，幫你準備就診時要說的內容。如果現在有立即危險或自傷衝動，請優先聯絡急救或現實中可信賴的人。"
    ].join("\n"),
    suicideConcern: [
      "這句話我會認真對待。它聽起來不只是一般的抱怨，而像是有一部分的你在想消失、不再醒來，或者不用繼續活著。",
      "",
      "先不急著分析為什麼這麼痛，先確認眼前安全。如果你已經有計畫、工具在身邊，或者擔心自己會控制不住，請現在就聯絡急救服務，或者請身邊可信賴的人過來陪你。如果還沒有明確計畫，也不要一個人扛，傳一句話給現實中可信賴的人：我今晚不太安全，不想一個人待著。"
    ].join("\n"),
    footer: "📞 如果你現在有危險或需要立即幫助，請聯絡當地急救服務或身邊可信賴的人。頁面「真人支援」也提供所選地區的資源：{resources}。",
    gentleLead: "從你說的這些裡，聽起來心裡像是壓了不少東西。",
    gentleLeadCue: "我注意到你剛才說的那句——「{cue}」，聽起來心裡像是壓了不少東西。",
    gentleBody: [
      "你不用現在就解釋清楚，我也不急著分析。只是想輕輕問一句：這陣子，是不是有那種「不只身體上、心裡也撐得有點累、想停下來休息一下」的感覺？如果我沒理解對，也沒關係。",
      "",
      "如果願意，可以多和我聊一句最近最沉重的是什麼；如果暫時不想說，我們就慢慢來，我在這裡。"
    ].join("\n"),
    minorLine: "如果你未滿18歲，請找一位信任的成年人在現實中支持你，例如安全的親屬、學校輔導老師或老師。若照顧者正在傷害你，可以選擇其他安全的成年人。也可使用頁面上的當地支援入口：{resources}。",
    crisisEscalate: [
      "謝謝你回我。從你的回答看，現在最重要的事不是繼續聊，而是讓一個真實的人或急救服務在接下來幾分鐘內到你身邊。",
      "",
      "請現在就做：撥打當地急救或危機專線，或聯絡一個能馬上到場的人。所選地區的支援資源：{resources}。也可透過頁面「真人支援」查看這些資源。",
      "如果手邊有可能傷害自己的東西，先離開那個房間，或請別人替你拿走。",
      "",
      "我會一直在這裡陪著你，但我不能取代現場的幫助。你願意現在就打這通電話，或者告訴我你身邊能聯絡到誰嗎？"
    ].join("\n"),
    crisisSupport: [
      "謝謝你回我——這一步很重要，說明你在照顧自己。",
      "",
      "我們就把注意力放在眼前幾分鐘：雙腳踩地，慢慢吸氣 4 秒、吐氣 6 秒，做幾輪。盡量不要一個人待著，如果還沒聯絡到現實中的人，現在傳一句也好。",
      "如果情況變了——念頭變強、有了計畫或工具、或者你不確定自己能不能保持安全——請立刻聯絡急救或身邊的人，我們隨時切回安全優先。",
      "",
      "你現在還好嗎？想再待一會兒，還是說說剛才發生了什麼？"
    ].join("\n"),
    providerError: "這次回覆沒能完成，可以重試。你剛才寫的內容還在。",
    tooLong: "這段有點長，我一次接不住。可以分幾次傳給我嗎？每次說一部分就好。"
  },
  ja: {
    crisisHint: { self: "今は話を最後まで伝えることよりも、あなたの安全のほうが大切です。", others: "今は理由を分析するよりも、あなたとほかの人の安全のほうがずっと大切です。" },
    crisisOpening: { first: "とても強い危険のサインを受け取りました。{hint}", continuation: "今はこのまま安全を最優先にしましょう。{hint}" },
    crisisSteps: [
      "まず、次のことをしてください：",
      "1. すでに計画がある、手段が近くにある、またはすぐに自分を抑えられなくなりそうなら、今すぐ地域の救急番号に電話するか、近くの人にかけてもらってください。上の支援窓口の番号はタップするとそのまま発信できます。",
      "2. できるだけ一人にならないでください。現実の生活で信頼できる人に連絡して、「今、安全じゃない。そばにいてほしい」とはっきり伝えてください。",
      "3. 自分やほかの人を傷つけるのに使えそうな物は、手の届かない場所に移すか、誰かに預かってもらってください。",
      "4. できれば両足を床につけて、4秒かけて息を吸い、6秒かけて吐く呼吸を5回くり返してください。"
    ].join("\n"),
    medicalRedFlag: [
      "まず体の安全を優先しましょう。こうした体の症状を、ストレスやパニックだけで説明してしまうのは危険です。このチャットでは原因を判断できず、対面での診察の代わりにもなりません。",
      "",
      "今、強い胸の痛みや急な胸の痛み、息苦しさがあるなら、すぐに地域の救急サービスに連絡するか、救急外来を受診してください。チャットの返事やリラックスの練習が効くのを待たないでください。近くに誰かいれば、そばにいてもらい、医療機関への連絡を手伝ってもらってください。",
      "",
      "症状がおさまっていても、初めての症状、くり返す症状、まだ心配な症状であれば、早めに医師に相談してください。心のサポートツールでは、それがパニック発作かどうかを判断できません。"
    ].join("\n"),
    medication: [
      "薬を飲むべきか、量を変えるべきかと考えるのは、それだけこの状態に疲れていて、本当に楽になる方法を探しているからだと思います。その気持ちはちゃんと受け止めています。",
      "",
      "ただ、薬については、薬の名前や量をすすめることはできませんし、増やす・減らす・やめる・変えるといった判断をあなたの代わりにすることもできません。",
      "",
      "より安全な次の一歩は、症状、続いている期間、睡眠、食欲、自分を傷つけたい気持ちの有無、これまで使った薬や副作用を整理して、精神科医などの医師に相談することです。すでに薬を飲んでいる場合は、自己判断でやめたり、変えたり、量を変えたりしないでください。急にやめると離脱症状や症状のぶり返しが起きることがあり、調整は医師の指導のもとで少しずつ行う必要があります。",
      "",
      "強いアレルギー症状、意識がぼんやりする、胸の痛み、息苦しさ、けいれん、自分を傷つけたい強い衝動がある場合は、すぐに救急や対面の医療機関に連絡してください。",
      "",
      "処方に関わらないことなら、二つお手伝いできます。受診のときに伝える症状メモを一緒に作ること、または今の気分や睡眠のパターンを一緒に見ていくことです。"
    ].join("\n"),
    diagnosis: [
      "自分はどこかおかしいのかと知りたくなるのは、このところ本当に調子がおかしくて、何が起きているのか、良くなるのかを知りたいからだと思います。そう思うのはとても自然なことです。",
      "",
      "このチャットであなたを診断したり、うつ病、不安症、双極性障害などかどうかを確定したりすることはできません。",
      "",
      "より安全な次の一歩は、精神科、心療内科、スクールカウンセラー、そのほか資格を持つ専門家に相談することです。とくに症状が2週間以上続いている、学校や仕事、睡眠に影響している、自分を傷つけたい気持ちがある場合は、早めに対面で相談してください。伝えるとよいこと：どれくらい続いているか、睡眠や食欲の変化、集中力、気力、パニック症状、薬や物質の使用、安全面の心配。",
      "",
      "ここでできるのは、症状やそれが起きる状況を一緒に整理して、専門家に何を聞くかを準備することです。今すぐ危険がある、または自分を傷つけたい衝動があるときは、まず救急や近くの信頼できる人に連絡してください。"
    ].join("\n"),
    suicideConcern: [
      "その言葉は真剣に受け止めます。消えてしまいたい、もう目を覚ましたくない、生き続けなくてもいいなら…と考えている部分があるように聞こえます。いつもの愚痴として流してはいけないことだと思います。",
      "",
      "なぜこんなにつらいのかを考える前に、まず今の安全を確かめてください。計画がある、手段が近くにある、実行してしまいそうで心配なら、今すぐ救急に連絡するか、近くの人にそばにいてもらってください。はっきりした計画がなくても、一人で抱えこまないでください。信頼できる人に「今夜は一人で考えていると安全じゃない気がする」とメッセージを送ってください。"
    ].join("\n"),
    footer: "📞 危険を感じている、またはすぐに助けが必要なときは、地域の救急サービスか近くの信頼できる人に連絡してください。選んだ地域の支援窓口は「人に相談」にもあります：{resources}。",
    gentleLead: "話してくれたことから、心にかなりのものを抱えているように聞こえます。",
    gentleLeadCue: "さっきの「{cue}」という言葉が気になりました。心にかなりのものを抱えているように聞こえます。",
    gentleBody: [
      "今すぐ全部を説明しなくて大丈夫ですし、急いで分析するつもりもありません。ただ、そっと聞かせてください。このところ、体だけでなく心の中まで疲れていて、少し立ち止まって休みたいと感じることはありませんか？ もし受け取り方が違っていたら、それでも大丈夫です。",
      "",
      "よければ、最近いちばん重く感じていることを一つだけ教えてください。今は話したくなければ、それでもかまいません。ゆっくりいきましょう。ここにいます。"
    ].join("\n"),
    minorLine: "18歳未満なら、身近で支えてくれる信頼できる大人に相談してください。たとえば安全な家族や親せき、スクールカウンセラー、先生などです。もし保護者があなたを傷つけているなら、別の安全な大人を選んでください。このページの地域の支援窓口も使えます：{resources}。",
    crisisEscalate: [
      "返事をくれてありがとう。あなたの答えからすると、今いちばん大切なのはこのチャットではなく、これから数分のうちに現実の人や救急サービスにそばに来てもらうことです。",
      "",
      "今すぐしてください：地域の救急番号や相談ダイヤルに電話するか、すぐに来てくれる人に連絡してください。選んだ地域の支援窓口：{resources}。このページの「人に相談」からも確認できます。",
      "自分を傷つけるのに使えそうな物が手の届くところにあるなら、今その部屋を出るか、誰かに預かってもらってください。",
      "",
      "私はここにいますが、対面の助けの代わりにはなれません。今その電話をかけられそうですか？ それとも、近くに連絡できる人がいるか教えてもらえますか？"
    ].join("\n"),
    crisisSupport: [
      "返事をくれてありがとう。その一歩はとても大切で、あなたが今、自分を守ろうとしていることが伝わります。",
      "",
      "まずはこれからの数分に集中しましょう。両足を床につけて、4秒吸って6秒吐く呼吸を何回か。できるだけ一人にならないでください。まだ現実の誰かに連絡していなければ、短いメッセージ一つでも助けになります。",
      "もし状況が変わったら——考えが強くなる、計画や手段が出てくる、安全でいられるか自信がなくなる——すぐに救急か近くの人に連絡してください。すぐに安全優先に戻りましょう。",
      "",
      "今はどんな感じですか？ もう少しここにいたいですか、それとも、さっき何があったか話しますか？"
    ].join("\n"),
    providerError: "返信を完了できませんでした。もう一度お試しください。書いた内容はそのまま残っています。",
    tooLong: "少し長すぎて一度に受け取れません。何回かに分けて送ってもらえますか？"
  },
  ko: {
    crisisHint: { self: "지금은 이야기를 끝까지 하는 것보다 당신의 안전이 더 중요해요.", others: "지금은 이유를 분석하는 것보다 당신과 다른 사람의 안전이 더 중요해요." },
    crisisOpening: { first: "아주 강한 위험 신호가 느껴져요. {hint}", continuation: "지금은 계속 안전을 먼저 생각할게요. {hint}" },
    crisisSteps: [
      "먼저 이것부터 해 주세요:",
      "1. 이미 계획이 있거나, 방법이 가까이 있거나, 곧 스스로를 통제하지 못할 것 같다면 지금 바로 지역 응급 번호로 전화하거나 근처에 있는 사람에게 대신 걸어 달라고 하세요. 위쪽 지원 창구의 번호는 누르면 바로 전화가 걸려요.",
      "2. 되도록 혼자 있지 마세요. 실제로 믿을 수 있는 사람에게 연락해서 \"나 지금 안전하지 않아. 옆에 있어 줘\"라고 분명하게 말해 주세요.",
      "3. 자신이나 다른 사람을 다치게 할 수 있는 물건은 손이 닿지 않는 곳으로 옮기거나 다른 사람에게 맡겨 주세요.",
      "4. 할 수 있다면 두 발을 바닥에 붙이고, 4초 동안 들이마시고 6초 동안 내쉬는 호흡을 다섯 번 해 보세요."
    ].join("\n"),
    medicalRedFlag: [
      "먼저 몸의 안전을 챙겨야 해요. 이런 신체 증상을 스트레스나 공황 때문이라고만 생각하면 안 돼요. 이 대화로는 원인을 판단할 수 없고, 직접 받는 진료를 대신할 수도 없어요.",
      "",
      "지금 심하거나 갑작스러운 가슴 통증, 숨쉬기 어려움이 있다면 바로 지역 응급 서비스에 연락하거나 응급실로 가세요. 대화 답변이나 이완 연습이 효과가 나기를 기다리지 마세요. 근처에 누가 있다면 곁에 있어 달라고 하고 의료 기관에 연락하는 것을 도와 달라고 하세요.",
      "",
      "증상이 가라앉았더라도 새로 생긴 증상이거나, 반복되거나, 여전히 걱정된다면 빨리 의사와 상담하세요. 심리 지원 도구로는 그것이 공황 발작인지 판단할 수 없어요."
    ].join("\n"),
    medication: [
      "약을 먹어야 할지, 조절해도 될지 궁금한 건 그만큼 이 상태에 많이 지쳤고, 정말 도움이 되는 방법을 찾고 있다는 뜻이겠죠. 그 마음 충분히 이해해요.",
      "",
      "다만 약에 대해서는 약 이름이나 용량을 추천할 수 없고, 약을 늘리거나 줄이거나 끊거나 바꾸는 결정을 대신 내려 줄 수도 없어요.",
      "",
      "더 안전한 다음 단계는 증상, 지속 기간, 수면, 식욕, 자해 생각이 있는지, 이전에 먹은 약과 부작용을 정리해서 정신건강의학과 의사나 다른 면허가 있는 의사에게 가져가는 거예요. 이미 약을 먹고 있다면 혼자서 끊거나, 바꾸거나, 용량을 바꾸지 마세요. 갑자기 끊으면 금단 증상이나 증상 재발이 생길 수 있고, 조절은 의사의 지도 아래 천천히 해야 해요.",
      "",
      "심한 알레르기 증상, 의식 혼미, 가슴 통증, 호흡 곤란, 경련, 또는 강한 자해 충동이 있다면 바로 응급 서비스나 대면 의료 도움을 받으세요.",
      "",
      "처방과 상관없는 두 가지는 도울 수 있어요. 진료 때 말할 증상 목록을 정리하는 것, 또는 지금의 기분과 수면 패턴을 같이 살펴보는 거예요."
    ].join("\n"),
    diagnosis: [
      "내가 어디가 잘못된 건지 알고 싶은 마음은 보통 요즘 정말 뭔가 이상하고, 무슨 일이 일어나는지, 나아질 수 있는지 알고 싶어서 생기죠. 아주 자연스러운 마음이에요.",
      "",
      "이 대화에서 진단을 하거나, 우울증, 불안장애, 양극성 장애 등인지 확인해 줄 수는 없어요.",
      "",
      "더 안전한 다음 단계는 정신건강의학과, 학교 상담 선생님, 또는 다른 자격 있는 전문가에게 이 고민을 가져가는 거예요. 특히 증상이 2주 넘게 이어지거나, 학교·일·수면에 영향을 주거나, 자해 생각이 있다면 빨리 직접 도움을 받으세요. 이런 정보를 준비하면 좋아요: 얼마나 오래됐는지, 수면과 식욕 변화, 집중력, 기운, 공황 증상, 약이나 물질 사용, 안전에 대한 걱정.",
      "",
      "여기서 할 수 있는 건 증상과 그 상황을 함께 정리하고, 전문가에게 무엇을 물어볼지 준비하는 거예요. 지금 당장 위험하거나 자해 충동이 있다면 먼저 응급 서비스나 가까이 있는 믿을 수 있는 사람에게 연락하세요."
    ].join("\n"),
    suicideConcern: [
      "그 말은 진지하게 받아들일게요. 사라지고 싶거나, 다시 깨어나지 않았으면 좋겠거나, 더 이상 살아가지 않아도 됐으면 하는 마음이 어딘가에 있는 것처럼 들려요. 그냥 흔한 푸념으로 넘길 일이 아니라고 생각해요.",
      "",
      "왜 이렇게 힘든지 따져 보기 전에, 먼저 지금 안전한지부터 확인해 주세요. 계획이 있거나, 방법이 가까이 있거나, 실행할까 봐 걱정된다면 지금 바로 응급 서비스에 연락하거나 근처 사람에게 곁에 있어 달라고 하세요. 뚜렷한 계획이 없더라도 혼자 감당하지 마세요. 믿을 수 있는 사람에게 \"오늘 밤 혼자 이 생각을 하고 있으면 안전하지 않을 것 같아\"라고 메시지를 보내 주세요."
    ].join("\n"),
    footer: "📞 위험하거나 지금 바로 도움이 필요하면 지역 응급 서비스나 가까이 있는 믿을 수 있는 사람에게 연락하세요. 선택한 지역의 지원 창구는 「사람에게 도움받기」에도 있어요: {resources}.",
    gentleLead: "이야기해 준 것들을 들어 보니, 마음에 꽤 많은 게 쌓여 있는 것처럼 들려요.",
    gentleLeadCue: "방금 말한 \"{cue}\"라는 말이 마음에 걸렸어요. 마음에 꽤 많은 게 쌓여 있는 것처럼 들려요.",
    gentleBody: [
      "지금 다 설명하지 않아도 괜찮고, 서둘러 분석하지도 않을게요. 그냥 조심스럽게 물어보고 싶어요. 요즘 몸만이 아니라 마음속까지 지쳐서, 잠깐 멈추고 쉬고 싶은 느낌이 들 때가 있나요? 제가 잘못 이해했다면 그래도 괜찮아요.",
      "",
      "괜찮다면 요즘 가장 무겁게 느껴지는 게 뭔지 하나만 더 말해 줄래요? 지금은 말하고 싶지 않다면 그것도 괜찮아요. 천천히 가요. 저는 여기 있어요."
    ].join("\n"),
    minorLine: "만 18세 미만이라면, 현실에서 곁에서 도와줄 수 있는 믿을 수 있는 어른에게 이야기해 주세요. 예를 들면 안전한 가족이나 친척, 학교 상담 선생님, 선생님이에요. 보호자가 당신을 해치고 있다면 다른 안전한 어른을 선택하세요. 이 페이지의 지역 지원 창구도 이용할 수 있어요: {resources}.",
    crisisEscalate: [
      "답해 줘서 고마워요. 답을 보니, 지금 가장 중요한 건 이 대화가 아니라 앞으로 몇 분 안에 실제 사람이나 응급 서비스가 당신 곁에 오는 거예요.",
      "",
      "지금 바로 해 주세요: 지역 응급 번호나 위기 상담 전화에 연락하거나, 바로 와 줄 수 있는 사람에게 연락하세요. 선택한 지역의 지원 창구: {resources}. 이 페이지의 「사람에게 도움받기」에서도 볼 수 있어요.",
      "자신을 다치게 할 수 있는 물건이 손 닿는 곳에 있다면, 지금 그 방을 나가거나 다른 사람에게 맡겨 주세요.",
      "",
      "저는 여기 계속 있을게요. 하지만 직접 받는 도움을 대신할 수는 없어요. 지금 그 전화를 걸 수 있을까요? 아니면 근처에 연락할 수 있는 사람이 누구인지 알려 줄래요?"
    ].join("\n"),
    crisisSupport: [
      "답해 줘서 고마워요. 그 한 걸음이 정말 중요해요. 지금 스스로를 지키려 하고 있다는 게 느껴져요.",
      "",
      "앞으로 몇 분에만 집중해 봐요. 두 발을 바닥에 붙이고, 4초 들이마시고 6초 내쉬기를 몇 번 해 보세요. 되도록 혼자 있지 마세요. 아직 현실의 누구에게도 연락하지 않았다면 짧은 메시지 하나라도 도움이 돼요.",
      "상황이 달라지면 — 생각이 더 강해지거나, 계획이나 방법이 생기거나, 안전하게 있을 수 있을지 자신이 없어지면 — 바로 응급 서비스나 근처 사람에게 연락하세요. 그러면 바로 안전을 최우선으로 돌아갈게요.",
      "",
      "지금은 좀 어때요? 여기 조금 더 있고 싶나요, 아니면 방금 무슨 일이 있었는지 이야기해 볼까요?"
    ].join("\n"),
    providerError: "답변을 끝내지 못했어요. 다시 시도해 주세요. 방금 쓴 내용은 그대로 남아 있어요.",
    tooLong: "조금 길어서 한 번에 받기 어려워요. 몇 번에 나눠서 보내 줄래요?"
  },
  es: {
    crisisHint: { self: "Ahora mismo tu seguridad importa más que terminar de contar la historia.", others: "Ahora mismo tu seguridad y la de otras personas importan más que analizar los motivos." },
    crisisOpening: { first: "Estoy notando una señal de peligro seria. {hint}", continuation: "Por ahora seguimos en modo de seguridad. {hint}" },
    crisisSteps: [
      "Por favor, haz esto primero:",
      "1. Si ya tienes un plan, un medio cerca o te preocupa perder el control pronto, llama ahora al número de emergencias de tu zona o pide a alguien cercano que llame. Los números del panel de ayuda de arriba se pueden pulsar para llamar.",
      "2. Intenta no quedarte a solas. Contacta a alguien de confianza en tu vida real y dile directamente: ahora mismo no estoy a salvo y necesito que estés conmigo.",
      "3. Aleja todo lo que podrías usar para hacerte daño o hacer daño a otra persona, o pide a alguien que lo guarde.",
      "4. Si puedes, apoya los dos pies en el suelo. Inhala durante 4 segundos y exhala durante 6, cinco veces."
    ].join("\n"),
    medicalRedFlag: [
      "Primero, la seguridad física. Síntomas físicos como estos no deben explicarse solo como estrés o pánico. Este chat no puede determinar la causa ni sustituir una evaluación médica presencial.",
      "",
      "Si ahora tienes un dolor en el pecho fuerte o repentino, o dificultad para respirar, llama de inmediato a los servicios de emergencia de tu zona o acude a urgencias. No esperes a que este chat o un ejercicio de relajación te ayuden. Si hay alguien cerca, pídele que se quede contigo y te ayude a contactar con atención médica.",
      "",
      "Si los síntomas han mejorado pero son nuevos, se repiten o todavía te preocupan, consulta pronto con un profesional médico. Una herramienta de apoyo psicológico no puede determinar si se trata de un ataque de pánico."
    ].join("\n"),
    medication: [
      "Preguntarte si deberías tomar algo o ajustar la medicación suele significar que todo esto te ha agotado y buscas algo que de verdad ayude. Tiene sentido, y te escucho.",
      "",
      "Sobre la medicación en sí, no puedo recomendar nombres ni dosis, ni decidir si deberías aumentar, reducir, dejar o cambiar un medicamento.",
      "",
      "El siguiente paso más seguro es ordenar tus síntomas, cuánto tiempo llevan, el sueño, el apetito, si tienes pensamientos de hacerte daño, los medicamentos que has tomado y sus efectos secundarios, y llevar todo eso a un psiquiatra u otro médico. Si ya tomas medicación, no la dejes, cambies ni modifiques la dosis por tu cuenta: dejarla de golpe puede causar síntomas de abstinencia o que los síntomas vuelvan, y cualquier cambio debe hacerse poco a poco con indicación médica.",
      "",
      "Si tienes síntomas de alergia graves, confusión, dolor en el pecho, dificultad para respirar, convulsiones o fuertes impulsos de hacerte daño, contacta enseguida con emergencias o con atención médica presencial.",
      "",
      "Puedo ayudarte con dos cosas que no implican recetar: preparar una lista de síntomas para la consulta, o mirar juntos tu estado de ánimo y tu patrón de sueño actuales."
    ].join("\n"),
    diagnosis: [
      "Querer saber si te pasa algo suele venir de un lugar real: las cosas no se sienten bien y quieres entender qué ocurre y si puede mejorar. Es algo muy normal.",
      "",
      "No puedo diagnosticarte ni confirmar por chat si se trata de depresión, ansiedad, trastorno bipolar u otra condición.",
      "",
      "Un siguiente paso más seguro es llevar esto a un psiquiatra, un servicio de salud mental, el orientador o psicólogo escolar u otro profesional cualificado, sobre todo si los síntomas duran más de dos semanas, afectan a los estudios, el trabajo o el sueño, o incluyen pensamientos de hacerte daño. Puedes contarles: cuánto tiempo dura, cambios en el sueño y el apetito, concentración, energía, síntomas de pánico, uso de medicamentos o sustancias y cualquier preocupación de seguridad.",
      "",
      "Lo que sí puedo hacer aquí es ayudarte a ordenar los síntomas y la situación, y decidir qué preguntar a un profesional. Si hay peligro inmediato o riesgo de hacerte daño, contacta primero con emergencias o con alguien de confianza que esté cerca."
    ].join("\n"),
    suicideConcern: [
      "Voy a tomarme eso en serio. Suena a que una parte de ti puede estar pensando en desaparecer, en no despertar o en no tener que seguir viviendo. No deberíamos tratarlo como un simple desahogo.",
      "",
      "Antes de analizar por qué duele tanto, comprueba primero tu seguridad inmediata. Si tienes un plan, un medio cerca o te preocupa llegar a hacerlo, contacta ahora con emergencias o pide a alguien cercano que se quede contigo. Si no hay un plan claro, aun así no cargues con esto a solas. Escribe a alguien de confianza: esta noche no me siento a salvo a solas con mis pensamientos."
    ].join("\n"),
    footer: "📞 Si estás en peligro o necesitas ayuda inmediata, llama a los servicios de emergencia de tu zona o contacta a alguien de confianza. En «Ayuda de personas» también tienes los recursos de la región elegida: {resources}.",
    gentleLead: "Por lo que me cuentas, suena a que llevas bastante peso encima.",
    gentleLeadCue: "Me fijé en lo que acabas de decir —«{cue}»—; suena a que llevas bastante peso encima.",
    gentleBody: [
      "No tienes que explicarlo todo ahora, y no voy a apresurarme a analizarlo. Solo quería preguntarte con cuidado: últimamente, ¿has sentido ese cansancio que no es solo del cuerpo sino también de dentro, como si una parte de ti quisiera parar y descansar? Y si lo he entendido mal, no pasa nada.",
      "",
      "Si quieres, puedes contarme una cosa más sobre lo que más te ha pesado. Y si prefieres no hacerlo ahora, también está bien; vamos despacio. Estoy aquí."
    ].join("\n"),
    minorLine: "Si tienes menos de 18 años, busca a un adulto de confianza que pueda apoyarte en persona, como un familiar con quien te sientas a salvo, el orientador escolar o un profesor. Si quien te cuida te está haciendo daño, elige a otro adulto seguro. También puedes usar los recursos locales de esta página: {resources}.",
    crisisEscalate: [
      "Gracias por contármelo. Por tu respuesta, lo más importante ahora no es este chat, sino que una persona real o un servicio de emergencias llegue a ti en los próximos minutos.",
      "",
      "Hazlo ahora: llama a emergencias o a una línea de crisis de tu zona, o contacta a alguien que pueda venir enseguida. Recursos de la región elegida: {resources}. También los tienes en «Ayuda de personas» en esta página.",
      "Si tienes a mano algo con lo que podrías hacerte daño, sal ahora de esa habitación o pide a alguien que lo guarde.",
      "",
      "Sigo aquí contigo, pero no puedo sustituir la ayuda en persona. ¿Puedes hacer esa llamada ahora, o decirme quién está cerca a quien podamos avisar?"
    ].join("\n"),
    crisisSupport: [
      "Gracias por responder: ese paso importa, y me dice que ahora mismo estás cuidando de ti.",
      "",
      "Centrémonos en los próximos minutos: los dos pies en el suelo, inhala en 4 y exhala en 6, unas cuantas veces. Intenta no quedarte a solas; si todavía no has contactado con una persona real, incluso un mensaje corto ayuda.",
      "Si algo cambia —los pensamientos se hacen más fuertes, aparece un plan o un medio, o no tienes claro que puedas mantenerte a salvo—, contacta enseguida con emergencias o con alguien cercano, y volvemos directamente a la seguridad primero.",
      "",
      "¿Cómo estás ahora mismo? ¿Quieres quedarte aquí un rato o hablar de lo que acaba de pasar?"
    ].join("\n"),
    providerError: "No se pudo completar la respuesta. Inténtalo de nuevo; tu mensaje sigue aquí.",
    tooLong: "Este mensaje es un poco largo para recibirlo de una vez. ¿Puedes enviarlo en varias partes?"
  },
  fr: {
    crisisHint: { self: "Pour l’instant, ta sécurité compte plus que de finir de raconter.", others: "Pour l’instant, ta sécurité et celle des autres comptent plus que d’analyser les raisons." },
    crisisOpening: { first: "J’entends un signal de danger sérieux. {hint}", continuation: "Restons en mode sécurité pour le moment. {hint}" },
    crisisSteps: [
      "Fais d’abord ceci, s’il te plaît :",
      "1. Si tu as déjà un plan, un moyen à proximité, ou si tu as peur de perdre le contrôle bientôt, appelle maintenant le numéro d’urgence local, ou demande à quelqu’un près de toi d’appeler. Les numéros du panneau d’aide ci-dessus s’appellent d’un simple toucher.",
      "2. Essaie de ne pas rester seul·e. Contacte une personne de confiance dans ta vie réelle et dis-lui directement : je ne suis pas en sécurité en ce moment et j’ai besoin que tu restes avec moi.",
      "3. Éloigne tout ce que tu pourrais utiliser pour te faire du mal ou faire du mal à quelqu’un, ou demande à quelqu’un de le garder.",
      "4. Si tu peux, pose les deux pieds au sol. Inspire pendant 4 secondes et expire pendant 6 secondes, cinq fois."
    ].join("\n"),
    medicalRedFlag: [
      "La sécurité physique d’abord. Des symptômes physiques comme ceux-ci ne doivent pas être expliqués uniquement par le stress ou la panique. Ce chat ne peut pas en déterminer la cause ni remplacer un examen médical en personne.",
      "",
      "Si tu as en ce moment une douleur thoracique importante ou soudaine, ou du mal à respirer, appelle immédiatement les urgences locales ou va aux urgences. N’attends pas que ce chat ou un exercice de relaxation fasse effet. Si quelqu’un est près de toi, demande-lui de rester avec toi et de t’aider à contacter des soins médicaux.",
      "",
      "Si les symptômes se sont calmés mais qu’ils sont nouveaux, qu’ils reviennent ou qu’ils t’inquiètent encore, consulte rapidement un professionnel de santé. Un outil de soutien psychologique ne peut pas dire s’il s’agit d’une crise de panique."
    ].join("\n"),
    medication: [
      "Te demander s’il faut prendre quelque chose ou ajuster un traitement veut souvent dire que tout cela t’a épuisé·e et que tu cherches quelque chose qui aide vraiment. C’est compréhensible, et je t’entends.",
      "",
      "Pour le médicament lui-même, je ne peux pas recommander de noms ni de doses, ni décider s’il faut augmenter, diminuer, arrêter ou changer un traitement.",
      "",
      "L’étape la plus sûre est de noter tes symptômes, depuis combien de temps ils durent, ton sommeil, ton appétit, la présence ou non de pensées de te faire du mal, les médicaments déjà pris et leurs effets secondaires, puis d’en parler à un psychiatre ou à un autre médecin. Si tu prends déjà un traitement, ne l’arrête pas, ne le change pas et ne modifie pas la dose seul·e : un arrêt brutal peut provoquer un sevrage ou un retour des symptômes, et tout changement doit se faire progressivement avec un médecin.",
      "",
      "En cas de réaction allergique grave, de confusion, de douleur thoracique, de difficulté à respirer, de convulsions ou de fortes envies de te faire du mal, contacte rapidement les urgences ou une aide médicale en personne.",
      "",
      "Je peux t’aider pour deux choses qui ne concernent pas la prescription : préparer une liste de symptômes pour un rendez-vous médical, ou regarder ensemble ton humeur et ton sommeil en ce moment."
    ].join("\n"),
    diagnosis: [
      "Vouloir savoir si quelque chose ne va pas vient souvent d’un vrai ressenti : les choses semblent décalées et tu veux comprendre ce qui se passe et si ça peut aller mieux. C’est tout à fait normal.",
      "",
      "Je ne peux pas te diagnostiquer ni confirmer par chat s’il s’agit de dépression, d’anxiété, de trouble bipolaire ou d’une autre condition.",
      "",
      "Une étape plus sûre est d’en parler à un psychiatre, à un service de santé mentale, à l’infirmier·ère ou au psychologue scolaire, ou à un autre professionnel qualifié, surtout si les symptômes durent plus de deux semaines, touchent l’école, le travail ou le sommeil, ou s’accompagnent de pensées de te faire du mal. Tu peux leur dire : depuis combien de temps cela dure, les changements de sommeil et d’appétit, la concentration, l’énergie, les symptômes de panique, la prise de médicaments ou de substances et tout souci de sécurité.",
      "",
      "Ce que je peux faire ici, c’est t’aider à organiser les symptômes et la situation, puis choisir quoi demander à un professionnel. S’il y a un danger immédiat ou un risque de te faire du mal, contacte d’abord les urgences ou une personne de confiance proche de toi."
    ].join("\n"),
    suicideConcern: [
      "Je vais prendre ça au sérieux. On dirait qu’une partie de toi pense peut-être à disparaître, à ne pas se réveiller, ou à ne plus avoir à continuer à vivre. On ne devrait pas traiter ça comme un simple coup de déprime.",
      "",
      "Avant d’analyser pourquoi c’est si lourd, vérifie d’abord ta sécurité immédiate. Si tu as un plan, un moyen à proximité, ou si tu as peur de passer à l’acte, contacte maintenant les urgences ou demande à quelqu’un de rester avec toi. S’il n’y a pas de plan précis, ne porte pas ça seul·e pour autant. Envoie un message à une personne de confiance : ce soir, je ne me sens pas en sécurité seul·e avec mes pensées."
    ].join("\n"),
    footer: "📞 Si tu es en danger ou as besoin d’aide immédiate, appelle les urgences locales ou contacte une personne de confiance. Les ressources de la région choisie sont aussi dans « Aide humaine » : {resources}.",
    gentleLead: "D’après ce que tu partages, on dirait que tu portes pas mal de choses.",
    gentleLeadCue: "J’ai remarqué ce que tu viens de dire — « {cue} » — on dirait que tu portes pas mal de choses.",
    gentleBody: [
      "Tu n’as pas besoin de tout expliquer maintenant, et je ne vais pas me précipiter pour analyser. Je voulais juste te demander doucement : ces derniers temps, as-tu ressenti cette fatigue qui n’est pas seulement physique mais aussi intérieure, comme si une partie de toi voulait s’arrêter et se reposer ? Et si j’ai mal compris, ce n’est pas grave.",
      "",
      "Si tu veux, tu peux me dire encore une chose sur ce qui a été le plus lourd. Et si tu préfères ne pas en parler maintenant, c’est d’accord aussi ; on avance doucement. Je suis là."
    ].join("\n"),
    minorLine: "Si tu as moins de 18 ans, tourne-toi vers un adulte de confiance qui peut te soutenir en personne, comme un proche avec qui tu te sens en sécurité, l’infirmier·ère ou le psychologue scolaire, ou un enseignant. Si la personne qui s’occupe de toi te fait du mal, choisis un autre adulte sûr. Tu peux aussi utiliser les ressources locales de cette page : {resources}.",
    crisisEscalate: [
      "Merci de me l’avoir dit. D’après ta réponse, le plus important maintenant n’est pas ce chat, mais qu’une vraie personne ou un service d’urgence soit près de toi dans les prochaines minutes.",
      "",
      "Fais-le maintenant : appelle les urgences ou une ligne d’écoute de crise de ta région, ou contacte quelqu’un qui peut venir tout de suite. Ressources de la région choisie : {resources}. Elles sont aussi dans « Aide humaine » sur cette page.",
      "Si quelque chose que tu pourrais utiliser pour te faire du mal est à portée de main, quitte cette pièce maintenant ou demande à quelqu’un de le garder.",
      "",
      "Je reste là avec toi, mais je ne peux pas remplacer une aide en personne. Peux-tu passer cet appel maintenant, ou me dire qui est près de toi et que nous pourrions joindre ?"
    ].join("\n"),
    crisisSupport: [
      "Merci d’avoir répondu : ce pas compte, et il me montre que tu prends soin de toi en ce moment.",
      "",
      "Concentrons-nous sur les prochaines minutes : les deux pieds au sol, inspire sur 4 et expire sur 6, plusieurs fois. Essaie de ne pas rester seul·e ; si tu n’as pas encore contacté une vraie personne, même un court message aide.",
      "Si quelque chose change — les pensées deviennent plus fortes, un plan ou un moyen apparaît, ou tu n’es pas sûr·e de pouvoir rester en sécurité — contacte tout de suite les urgences ou quelqu’un près de toi, et on revient directement à la sécurité d’abord.",
      "",
      "Comment ça va, là, maintenant ? Tu veux rester un moment ici, ou parler de ce qui vient de se passer ?"
    ].join("\n"),
    providerError: "La réponse n’a pas pu être terminée. Réessaie ; ton message est toujours là.",
    tooLong: "Ce message est un peu long pour être reçu en une fois. Peux-tu l’envoyer en plusieurs parties ?"
  },
  de: {
    crisisHint: { self: "Deine Sicherheit ist jetzt wichtiger, als die Geschichte zu Ende zu erzählen.", others: "Deine Sicherheit und die anderer Menschen sind jetzt wichtiger, als nach den Gründen zu suchen." },
    crisisOpening: { first: "Ich nehme ein ernstes Gefahrensignal wahr. {hint}", continuation: "Wir bleiben vorerst im Sicherheitsmodus. {hint}" },
    crisisSteps: [
      "Bitte tu zuerst Folgendes:",
      "1. Wenn du schon einen Plan hast, ein Mittel in der Nähe ist oder du Angst hast, bald die Kontrolle zu verlieren, ruf jetzt den örtlichen Notruf an oder bitte jemanden in deiner Nähe, anzurufen. Die Nummern im Hilfebereich oben kannst du direkt antippen.",
      "2. Versuch, nicht allein zu bleiben. Melde dich bei einer Vertrauensperson in deinem echten Leben und sag direkt: Ich bin gerade nicht sicher und brauche dich bei mir.",
      "3. Bring alles, womit du dir oder anderen schaden könntest, außer Reichweite, oder bitte jemanden, es aufzubewahren.",
      "4. Wenn du kannst, stell beide Füße auf den Boden. Atme 4 Sekunden ein und 6 Sekunden aus, fünfmal."
    ].join("\n"),
    medicalRedFlag: [
      "Zuerst die körperliche Sicherheit. Solche körperlichen Beschwerden sollten nicht nur mit Stress oder Panik erklärt werden. Dieser Chat kann die Ursache nicht feststellen und keine ärztliche Untersuchung vor Ort ersetzen.",
      "",
      "Wenn du jetzt starke oder plötzliche Brustschmerzen oder Atemnot hast, ruf sofort den örtlichen Notruf an oder geh in die Notaufnahme. Warte nicht darauf, dass dieser Chat oder eine Entspannungsübung hilft. Wenn jemand in der Nähe ist, bitte die Person, bei dir zu bleiben und dir zu helfen, medizinische Hilfe zu erreichen.",
      "",
      "Wenn die Beschwerden nachgelassen haben, aber neu sind, wiederkommen oder dich weiter beunruhigen, wende dich bald an eine Ärztin oder einen Arzt. Ein psychologisches Unterstützungsangebot kann nicht beurteilen, ob es eine Panikattacke ist."
    ].join("\n"),
    medication: [
      "Wenn du überlegst, ob du etwas nehmen oder ein Medikament anpassen solltest, bist du wahrscheinlich ziemlich erschöpft von all dem und suchst etwas, das wirklich hilft. Das ist verständlich, und ich höre dich.",
      "",
      "Zum Medikament selbst kann ich keine Namen oder Dosierungen empfehlen und nicht entscheiden, ob du etwas erhöhen, verringern, absetzen oder wechseln solltest.",
      "",
      "Der sicherere nächste Schritt: Schreib deine Beschwerden auf, wie lange sie schon bestehen, Schlaf, Appetit, ob es Gedanken an Selbstverletzung gibt, frühere Medikamente und Nebenwirkungen, und bring das zu einer Psychiaterin, einem Psychiater oder einer anderen Ärztin bzw. einem anderen Arzt. Wenn du schon Medikamente nimmst, setz sie nicht eigenmächtig ab, wechsle sie nicht und ändere nicht die Dosis: Plötzliches Absetzen kann Entzugserscheinungen oder einen Rückfall der Beschwerden auslösen, und jede Änderung sollte schrittweise mit ärztlicher Begleitung erfolgen.",
      "",
      "Bei starken allergischen Reaktionen, Verwirrtheit, Brustschmerzen, Atemnot, Krampfanfällen oder starkem Drang, dir selbst zu schaden, wende dich sofort an den Notruf oder an medizinische Hilfe vor Ort.",
      "",
      "Bei zwei Dingen, die nichts mit Verschreibungen zu tun haben, kann ich helfen: eine Liste deiner Beschwerden für einen Arzttermin vorbereiten, oder gemeinsam auf deine aktuelle Stimmung und deinen Schlaf schauen."
    ].join("\n"),
    diagnosis: [
      "Wissen zu wollen, ob mit dir etwas nicht stimmt, kommt meist von einem echten Gefühl: Etwas fühlt sich falsch an, und du willst verstehen, was los ist und ob es besser werden kann. Das ist ganz normal.",
      "",
      "Ich kann dich im Chat nicht diagnostizieren und nicht bestätigen, ob es eine Depression, eine Angststörung, eine bipolare Störung oder etwas anderes ist.",
      "",
      "Ein sichererer nächster Schritt ist, das zu einer Psychiaterin oder einem Psychiater, einer psychologischen Beratungsstelle, der Schulsozialarbeit oder Schulpsychologie oder einer anderen qualifizierten Fachperson zu bringen, besonders wenn die Beschwerden länger als zwei Wochen dauern, Schule, Arbeit oder Schlaf beeinträchtigen oder Gedanken an Selbstverletzung dabei sind. Du kannst erzählen: wie lange es schon so ist, Veränderungen bei Schlaf und Appetit, Konzentration, Energie, Panikbeschwerden, Medikamente oder Substanzen und Sorgen um deine Sicherheit.",
      "",
      "Was ich hier tun kann: dir helfen, die Beschwerden und die Situation zu ordnen und zu überlegen, was du eine Fachperson fragen möchtest. Wenn akute Gefahr besteht oder du dir etwas antun könntest, wende dich zuerst an den Notruf oder an eine Vertrauensperson in deiner Nähe."
    ].join("\n"),
    suicideConcern: [
      "Das nehme ich ernst. Es klingt, als ob ein Teil von dir daran denkt, zu verschwinden, nicht mehr aufzuwachen oder nicht mehr weiterleben zu müssen. Das sollten wir nicht wie einen gewöhnlichen Frust-Satz behandeln.",
      "",
      "Bevor wir uns anschauen, warum es so schwer ist, prüf bitte zuerst deine Sicherheit im Moment. Wenn du einen Plan hast, ein Mittel in der Nähe ist oder du Angst hast, es zu tun, wende dich jetzt an den Notruf oder bitte jemanden, bei dir zu bleiben. Auch ohne klaren Plan: Trag das nicht allein. Schreib einer Vertrauensperson: Ich fühle mich heute Nacht nicht sicher, wenn ich mit meinen Gedanken allein bin."
    ].join("\n"),
    footer: "📞 Wenn du in Gefahr bist oder sofort Hilfe brauchst, ruf den örtlichen Notruf an oder melde dich bei einer Vertrauensperson. Hilfsangebote für die gewählte Region findest du auch unter „Hilfe von Menschen“: {resources}.",
    gentleLead: "Nach dem, was du erzählst, klingt es, als würde dich einiges belasten.",
    gentleLeadCue: "Mir ist aufgefallen, was du gerade gesagt hast – „{cue}“ –, es klingt, als würde dich einiges belasten.",
    gentleBody: [
      "Du musst jetzt nicht alles erklären, und ich will auch nicht vorschnell analysieren. Ich wollte nur behutsam fragen: Hast du in letzter Zeit diese Art von Müdigkeit gespürt – nicht nur im Körper, sondern auch innerlich –, bei der ein Teil von dir einfach anhalten und ausruhen möchte? Und falls ich das falsch verstanden habe, ist das auch in Ordnung.",
      "",
      "Wenn du magst, erzähl mir noch eine Sache darüber, was dich am meisten belastet hat. Und wenn du gerade lieber nicht willst, ist das auch okay – wir lassen uns Zeit. Ich bin da."
    ].join("\n"),
    minorLine: "Wenn du unter 18 bist, wende dich an einen Erwachsenen, dem du vertraust und der dich persönlich unterstützen kann, zum Beispiel ein Familienmitglied, bei dem du dich sicher fühlst, die Schulsozialarbeit oder eine Lehrkraft. Wenn eine Person, die für dich sorgt, dir schadet, such dir einen anderen sicheren Erwachsenen. Du kannst auch die lokalen Hilfsangebote auf dieser Seite nutzen: {resources}.",
    crisisEscalate: [
      "Danke, dass du es mir gesagt hast. Nach deiner Antwort ist jetzt nicht dieser Chat das Wichtigste, sondern dass in den nächsten Minuten ein echter Mensch oder ein Rettungsdienst zu dir kommt.",
      "",
      "Bitte tu das jetzt: Ruf den örtlichen Notruf oder eine Krisenhotline an, oder melde dich bei jemandem, der sofort kommen kann. Hilfsangebote für die gewählte Region: {resources}. Du findest sie auch unter „Hilfe von Menschen“ auf dieser Seite.",
      "Wenn etwas in Reichweite ist, womit du dir schaden könntest, verlass jetzt diesen Raum oder bitte jemanden, es an sich zu nehmen.",
      "",
      "Ich bleibe hier bei dir, aber ich kann Hilfe vor Ort nicht ersetzen. Kannst du diesen Anruf jetzt machen, oder mir sagen, wer in deiner Nähe ist, den wir erreichen können?"
    ].join("\n"),
    crisisSupport: [
      "Danke für deine Antwort – dieser Schritt zählt, und er zeigt mir, dass du gerade auf dich achtest.",
      "",
      "Lass uns bei den nächsten Minuten bleiben: beide Füße auf den Boden, 4 Sekunden einatmen, 6 Sekunden ausatmen, ein paar Runden. Versuch, nicht allein zu bleiben; wenn du noch keinen echten Menschen erreicht hast, hilft schon eine kurze Nachricht.",
      "Wenn sich etwas ändert – die Gedanken stärker werden, ein Plan oder ein Mittel auftaucht oder du nicht sicher bist, ob du sicher bleiben kannst –, wende dich sofort an den Notruf oder an jemanden in deiner Nähe, und wir gehen direkt zurück zu: Sicherheit zuerst.",
      "",
      "Wie geht es dir gerade? Möchtest du noch ein bisschen hierbleiben, oder darüber reden, was gerade passiert ist?"
    ].join("\n"),
    providerError: "Die Antwort konnte nicht abgeschlossen werden. Bitte versuch es noch einmal; deine Nachricht ist noch da.",
    tooLong: "Diese Nachricht ist etwas zu lang, um sie auf einmal anzunehmen. Kannst du sie in mehreren Teilen schicken?"
  }
};

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

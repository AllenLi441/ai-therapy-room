/** Traditional → simplified pairs for every character used by the safety lexicons
 * (safety.ts, implicit-risk.ts), so 繁體 input matches the same rules. Generated with
 * the ICU "Hans-Hant" transform plus common alternate forms (髮/乾/裡/複…). Regenerate
 * when new lexicon characters are added. Each pair is two characters: traditional, simplified. */
export const TRADITIONAL_PAIRS = "丟丢並并乾干亞亚來来侖仑係系個个們们倫伦側侧偽伪備备傷伤傾倾僅仅儘尽優优兒儿內内兩两別别則则剛刚劇剧劑剂勁劲動动務务勞劳勵励勸劝匯汇區区協协厭厌員员問问啓启啟启喚唤喪丧單单嗎吗嘗尝嚴严圍围園园圖图報报場场塊块壓压夠够媽妈嬰婴學学實实寧宁寫写寶宝將将專专對对導导層层屬属師师帶带幫帮幹干幾几張张強强彈弹後后徑径從从復复悶闷愛爱態态慮虑憊惫憶忆應应懷怀懸悬戀恋戶户捨舍掛挂換换損损撐撑撥拨擁拥擇择擔担據据擾扰攝摄攢攒敗败數数斷断於于時时暈晕暫暂曆历書书會会東东條条業业極极槍枪樓楼標标樣样橋桥機机橫横檢检櫃柜歲岁歷历歸归殘残殺杀毆殴氣气決决沈沉沒没況况洩泄淨净減减測测溫温滅灭滿满漸渐潰溃瀕濒為为無无煙烟煩烦熱热燒烧燙烫爲为爾尔牀床牆墙狀状猶犹獨独現现環环產产異异當当疊叠療疗發发盡尽監监確确碼码種种稱称積积穩稳節节篩筛糾纠約约紅红納纳純纯級级細细終终組组結结絕绝給给經经綫线緊紧緒绪線线編编緩缓練练總总繩绳繫系繼继續续罵骂羅罗羣群義义習习聞闻聯联聲声職职聽听脫脱腦脑腳脚臨临臺台與与興兴舉举著着蓋盖薦荐藥药蘭兰處处號号術术衝冲裏里裝装裡里複复見见規规視视親亲覺觉觸触計计討讨記记訪访設设訴诉診诊評评詞词詢询試试話话該该誇夸認认語语誤误說说誰谁調调談谈請请諷讽諾诺講讲謝谢證证識识議议護护讀读變变讓让貓猫負负責责貶贬買买費费貼贴資资質质賬账賴赖贅赘蹤踪軀躯軟软輕轻輪轮輸输轉转辦办辭辞農农這这連连進进過过達达遠远適适選选遺遗還还邊边鄰邻醫医釋释銷销錢钱錨锚鍵键鍾钟鎖锁鎮镇鐘钟鑰钥長长門门開开間间閨闺閾阈關关陣阵隨随險险隱隐隻只雙双離离難难電电靜静響响頁页頂顶項项須须預预頭头頻频題题願愿類类顧顾顯显風风颱台養养馬马騰腾驗验驚惊驟骤髒脏體体髮发鬱郁麵面麼么點点齡龄";

const TRADITIONAL_TO_SIMPLIFIED = new Map(Array.from(TRADITIONAL_PAIRS.matchAll(/(.)(.)/gu), ([, traditional, simplified]) => [traditional, simplified]));

/** Map traditional characters onto the simplified lexicon (other text is unchanged). */
export function toSimplified(text: string): string {
  return Array.from(text, (char) => TRADITIONAL_TO_SIMPLIFIED.get(char) ?? char).join("");
}

/** Masks contact details and identifiers in a donated conversation, in the browser before
 * the donor reviews it and again on the server. The patterns are deliberately narrow (an
 * everyday phrase should survive), so the donor still reads the text before sending. */
const RULES: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[EMAIL]"],
  [/https?:\/\/\S+/g, "[LINK]"],
  [/(?<![\dA-Za-z])\d{17}[\dXx](?![\dA-Za-z])/g, "[ID]"],
  [/(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d(?:[-\s]?\d{4}){2}(?!\d)/g, "[PHONE]"],
  [/(?<!\d)0\d{2,3}-\d{7,8}(?!\d)/g, "[PHONE]"],
  [/(?:QQ|qq)\s*(?:号码?)?\s*[:：]?\s*\d{5,12}/g, "[QQ]"],
  [/(?:微信|微訊|wechat|WeChat|vx|VX|wx)\s*(?:号)?\s*[:：]?\s*[A-Za-z][-_A-Za-z0-9]{5,19}/g, "[WECHAT]"],
  [/(我叫|我的名字是|我名字叫|我的名字叫)\s*[一-龥]{2,3}/g, "$1[NAME]"],
  [/\b(my name is|i'm called|call me)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/gi, "$1 [NAME]"],
  [/(?<!\d)\d{6,}(?!\d)/g, "[NUMBER]"],
];

export function redactText(text: string): string {
  return RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

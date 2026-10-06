import { describe, expect, it } from "vitest";
import { redactText } from "./redact";

describe("redactText", () => {
  it("masks contact details and identifiers", () => {
    expect(redactText("我叫李小明，电话13812345678，邮箱 xm@example.com")).toBe("我叫[NAME]，电话[PHONE]，邮箱 [EMAIL]");
    expect(redactText("身份证 11010520080101123X，学号 20231234")).toBe("身份证 [ID]，学号 [NUMBER]");
    expect(redactText("加我QQ：123456789 或者微信 abc_12345")).toBe("加我[QQ] 或者[WECHAT]");
    expect(redactText("座机 010-82951332，手机 +86 138 1234 5678")).toBe("座机 [PHONE]，手机 [PHONE]");
    expect(redactText("My name is Emma Stone, see https://x.com/me")).toBe("My name is [NAME], see [LINK]");
  });

  it("leaves everyday wording and short numbers alone", () => {
    const text = "我们学校月考第3名，考了650分，想考上大学。2026年还有12356热线。";
    expect(redactText(text)).toBe(text);
  });
});

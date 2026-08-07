"use client";

import { ChevronDown } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

const faqs = [
  {
    question: "需要邀请真人面试官吗？",
    answer:
      "不需要。Mira 会根据你的回答继续追问，完整模拟面试节奏；你可以随时暂停，也可以在报告里逐题复盘。",
  },
  {
    question: "问题会怎样根据我的简历定制？",
    answer:
      "上传简历后，系统会围绕项目经历、技术栈与目标岗位生成问题，并针对你在回答中提到的细节继续深挖。",
  },
  {
    question: "支持语音面试和文字面试吗？",
    answer:
      "支持。你可以按场景切换语音或文字模式；语音模式包含实时转写，也保留文字确认与回退能力。",
  },
  {
    question: "面试报告里会给出什么？",
    answer:
      "报告包含综合评级、五维能力分数、逐题评价、参考思路、追问链和下一步最值得练习的改进建议。",
  },
  {
    question: "我的简历和录音会怎样处理？",
    answer:
      "简历与音频按私有数据处理，只用于生成本人的面试内容和报告；产品提供数据删除入口，不公开展示原始资料。",
  },
  {
    question: "第一次使用需要准备多久？",
    answer:
      "通常只需几分钟：上传简历、选择目标岗位和面试时长后即可开始。没有简历时，也可以先体验演示流程。",
  },
] as const;

function handleKeyboardNavigation(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

  const triggers = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-faq-trigger]"),
  );
  const currentIndex = triggers.indexOf(document.activeElement as HTMLButtonElement);
  if (currentIndex < 0) return;

  event.preventDefault();
  const lastIndex = triggers.length - 1;
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? lastIndex
        : event.key === "ArrowDown"
          ? (currentIndex + 1) % triggers.length
          : (currentIndex - 1 + triggers.length) % triggers.length;
  triggers[nextIndex]?.focus();
}

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div
      className="divide-y divide-black/[0.08] border-y border-black/[0.08]"
      onKeyDown={handleKeyboardNavigation}
    >
      {faqs.map((faq, index) => (
        <div key={faq.question}>
          <h3>
            <button
              type="button"
              data-faq-trigger
              aria-expanded={openIndex === index}
              aria-controls={`faq-panel-${index}`}
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="flex w-full items-center gap-5 py-6 text-left outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-orange-500/45 focus-visible:ring-offset-4"
            >
              <span
                aria-hidden="true"
                className="font-display text-[12px] font-medium tracking-[0.12em] text-orange-500"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 text-[16px] font-medium tracking-[-0.01em] text-[#171717] md:text-[17px]">
                {faq.question}
              </span>
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white transition-[transform,background-color,border-color] duration-300 ${
                  openIndex === index
                    ? "rotate-180 border-orange-200 bg-orange-50"
                    : "border-black/10"
                }`}
              >
                <ChevronDown aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
              </span>
            </button>
          </h3>
          {openIndex === index ? (
            <div id={`faq-panel-${index}`} role="region" aria-label={faq.question}>
              <p className="animate-mira-page-in max-w-[720px] pr-10 pb-6 pl-10 text-[14px] leading-7 text-[#737373] md:pl-[52px]">
                {faq.answer}
              </p>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

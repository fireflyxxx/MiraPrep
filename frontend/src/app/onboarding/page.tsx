"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { experienceOptions, onboardJobs, skillOptions } from "@/lib/mock-data";

function cardClass(selected: boolean) {
  return `mira-surface cursor-pointer rounded-xl border px-4 py-4 text-left ${
    selected ? "border-orange-500 bg-[#fff5ee]" : "border-[#e5e5e5] bg-white"
  }`;
}

function pillClass(selected: boolean) {
  return `mira-button cursor-pointer rounded-full border px-4 py-2 text-[13px] ${
    selected
      ? "border-orange-500 bg-[#fff5ee] text-[#9a3412]"
      : "border-[#e5e5e5] bg-transparent text-[#0a0a0a]"
  }`;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [job, setJob] = useState("frontend");
  const [exp, setExp] = useState("1-3");
  const [skills, setSkills] = useState<string[]>(["React", "TypeScript", "Next.js"]);

  const toggleSkill = (sk: string) =>
    setSkills((cur) => (cur.includes(sk) ? cur.filter((x) => x !== sk) : [...cur, sk]));

  const next = () => {
    if (step === 1) setStep(2);
    else router.push("/dashboard", { transitionTypes: ["nav-modal-out"] });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f7f7] p-6 md:p-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50 blur-[2px]">
        <div className="mx-auto mt-[60px] max-w-[900px] px-10">
          <div className="mb-7 h-11 w-[220px] rounded-[10px] bg-[#e9e9e9]" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-[130px] rounded-2xl bg-[#eaeaea]" />
            <div className="h-[130px] rounded-2xl bg-[#eaeaea]" />
            <div className="h-[130px] rounded-2xl bg-[#eaeaea]" />
          </div>
        </div>
      </div>

      <div className="animate-mira-page-in relative w-full max-w-[560px] overflow-hidden rounded-[22px] border border-[#ececec] bg-white shadow-[0_30px_70px_-20px_rgba(0,0,0,0.25)]">
        <div className="px-7 pt-[30px] md:px-9">
          <div className="mb-2 flex items-center gap-2.5">
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[#0a0a0a] font-display font-bold text-white">
              M
            </div>
            <div className="font-display text-xs tracking-[0.04em] text-[#a3a3a3]">
              初次设置 · 第 {step} / 2 步
            </div>
          </div>
          <h2 className="m-0 mb-1.5 text-2xl font-bold tracking-[-0.02em]">
            {step === 1 ? "你想面试什么岗位？" : "完善你的技术画像"}
          </h2>
          <p className="m-0 mb-6 text-sm text-[#737373]">
            {step === 1
              ? "Mira 会据此定制面试的方向与难度。"
              : "这些信息让每一道题都更贴近你的真实背景。"}
          </p>
        </div>

        <div key={step} className="animate-mira-rise px-7 pb-2 md:px-9">
          {step === 1 ? (
            <>
              <div className="mb-3 text-[13px] font-medium">意向岗位方向</div>
              <div className="mb-6 grid grid-cols-2 gap-2.5">
                {onboardJobs.map((j) => (
                  <div key={j.id} onClick={() => setJob(j.id)} className={cardClass(job === j.id)}>
                    <div className={`text-[14.5px] font-medium ${job === j.id ? "text-[#9a3412]" : "text-[#0a0a0a]"}`}>
                      {j.label}
                    </div>
                    <div className={`mt-0.5 text-xs ${job === j.id ? "text-[#9a3412]" : "text-[#a3a3a3]"}`}>
                      {j.sub}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mb-3 text-[13px] font-medium">经验年限</div>
              <div className="mb-5 flex flex-wrap gap-2">
                {experienceOptions.map((e) => (
                  <span key={e.id} onClick={() => setExp(e.id)} className={pillClass(exp === e.id)}>
                    {e.label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="mb-3 text-[13px] font-medium">
                你的技术栈 <span className="font-normal text-[#a3a3a3]">(多选)</span>
              </div>
              <div className="mb-6 flex flex-wrap gap-2">
                {skillOptions.map((sk) => (
                  <span key={sk} onClick={() => toggleSkill(sk)} className={pillClass(skills.includes(sk))}>
                    {sk}
                  </span>
                ))}
                <span className="mira-button cursor-pointer rounded-full border border-dashed border-[#d4d4d4] px-3.5 py-2 text-[13px] text-[#a3a3a3]">
                  + 自定义
                </span>
              </div>
              <div className="mb-2.5 text-[13px] font-medium">
                目标公司类型 <span className="font-normal text-[#a3a3a3]">(选填)</span>
              </div>
              <input
                placeholder="如：一线大厂 / 外企 / 创业公司"
                className="mira-field mb-5 w-full rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-3 text-sm outline-none"
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#f2f2f2] bg-[#fcfcfc] px-7 py-5 md:px-9">
          <div className="flex gap-1.5">
            <span className={`block h-[7px] rounded-full bg-orange-500 transition-all ${step === 1 ? "w-[22px]" : "w-[7px]"}`} />
            <span className={`block h-[7px] rounded-full transition-all ${step === 2 ? "w-[22px] bg-orange-500" : "w-[7px] bg-[#e5e5e5]"}`} />
          </div>
          <div className="flex gap-2.5">
            <button onClick={() => router.push("/dashboard", { transitionTypes: ["nav-modal-out"] })} className="mira-button rounded-[9px] px-4 py-2.5 text-[13.5px] text-[#a3a3a3]">
              跳过
            </button>
            <button onClick={next} className="mira-button rounded-[10px] bg-orange-500 px-[22px] py-2.5 text-sm font-medium text-white">
              {step === 1 ? "下一步 →" : "进入工作台 →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

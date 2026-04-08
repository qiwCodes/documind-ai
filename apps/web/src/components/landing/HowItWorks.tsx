import { Upload, Cpu, MessageCircleMore } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/landing/Reveal";

const steps = [
  {
    icon: Upload,
    title: "Upload",
    description: "ลากไฟล์ PDF, DOCX หรือโน้ตหลายชุดเข้ามาใน workspace เดียว",
  },
  {
    icon: Cpu,
    title: "AI Processes",
    description: "ระบบประมวลผลและจัดดัชนีเนื้อหา พร้อมเชื่อมความสัมพันธ์ข้ามเอกสาร",
  },
  {
    icon: MessageCircleMore,
    title: "Chat & Discover",
    description: "ถามคำถามเชิงลึก รับคำตอบพร้อม citation และค้นพบ insight ใหม่",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-10 md:py-14">
      <Reveal>
        <h2 className="mb-8 text-2xl font-semibold tracking-tight md:text-3xl">How it works</h2>
      </Reveal>
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <Reveal key={step.title} delayMs={index * 100}>
              <Card className="border-slate-200">
                <CardHeader>
                  <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                    {index + 1}
                  </div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-indigo-600" />
                    {step.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600">{step.description}</p>
                </CardContent>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

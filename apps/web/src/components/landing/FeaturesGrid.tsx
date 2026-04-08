import { Brain, FileSearch2, Sparkles, Workflow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/landing/Reveal";

const features = [
  {
    title: "Multi-Document Analysis",
    description: "วิเคราะห์เอกสารหลายไฟล์พร้อมกันโดยไม่เสียบริบทระหว่างหัวข้อ",
    icon: FileSearch2,
  },
  {
    title: "Precise Citations",
    description: "ทุกคำตอบอ้างอิงกลับไปยังแหล่งข้อมูลจริงได้ทันที",
    icon: Brain,
  },
  {
    title: "Instant Summaries",
    description: "สร้างสรุปเนื้อหายาว ๆ ให้กระชับและพร้อมใช้งานในไม่กี่วินาที",
    icon: Sparkles,
  },
  {
    title: "Cross-File Reasoning",
    description: "เชื่อมโยงข้อมูลข้ามไฟล์เพื่อค้นหา insight ที่ซ่อนอยู่",
    icon: Workflow,
  },
];

export function FeaturesGrid() {
  return (
    <section id="features" className="py-10 md:py-14">
      <Reveal className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Features that scale with your work</h2>
      </Reveal>
      <div className="grid gap-4 sm:grid-cols-2">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <Reveal key={feature.title} delayMs={index * 90}>
              <Card className="group border-slate-200 transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/60">
                <CardHeader>
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-transform duration-300 group-hover:scale-105">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-slate-600">{feature.description}</p>
                </CardContent>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

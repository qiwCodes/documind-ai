import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/landing/Reveal";

const testimonials = [
  {
    name: "Nicha P.",
    role: "Graduate Researcher",
    quote: "ช่วยย่นเวลาอ่าน literature review จากหลายวันเหลือไม่กี่ชั่วโมง",
  },
  {
    name: "Arun K.",
    role: "Strategy Consultant",
    quote: "ผมใช้เทียบข้อมูลข้ามรายงานได้เร็วมาก และ citation ก็ตรวจสอบย้อนหลังง่าย",
  },
  {
    name: "Mina T.",
    role: "Product Manager",
    quote: "ทีมใช้เป็นฐานความรู้กลาง เวลาตัดสินใจอ้างอิงข้อมูลได้มั่นใจขึ้น",
  },
];

export function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-10 md:py-14">
      <Reveal>
        <h2 className="mb-8 text-2xl font-semibold tracking-tight md:text-3xl">What early users say</h2>
      </Reveal>
      <div className="grid gap-4 md:grid-cols-3">
        {testimonials.map((item, index) => (
          <Reveal key={item.name} delayMs={index * 110}>
            <Card className="border-slate-200">
              <CardContent className="space-y-4 p-5">
                <p className="text-sm text-slate-600">“{item.quote}”</p>
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{item.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

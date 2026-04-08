"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, MessagesSquare, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/landing/Reveal";

export function HeroSection() {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <section className="py-14 md:py-20">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal className="space-y-6" delayMs={40}>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
            เปลี่ยนเอกสารกองโตให้เป็นบทสนทนาอัจฉริยะ
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-slate-600 md:text-lg">
            ผสานพลังของ NotebookLM ในการอ้างอิงแหล่งที่มา กับความลื่นไหลของ ChatGPT เพื่อช่วยให้คุณค้นพบข้อมูลสำคัญ
            ได้เร็วขึ้น แม่นยำขึ้น และเชื่อถือได้ในทุกคำตอบ
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/signup">
              <Button size="lg">เริ่มใช้งานฟรี</Button>
            </Link>
            <Button variant="secondary" size="lg" onClick={() => setShowPreview(true)}>
              ดูตัวอย่างการทำงาน
            </Button>
          </div>
        </Reveal>

        <Reveal delayMs={160}>
          <Card className="overflow-hidden border-indigo-100 shadow-lg shadow-indigo-100/50">
          <CardHeader className="border-b border-slate-100 bg-slate-50/80">
            <CardTitle className="text-sm font-medium text-slate-600">Mock Workspace Preview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 md:grid-cols-[220px_1fr]">
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documents</p>
              {["Thesis-v3.pdf", "Interview Notes.docx", "Market Report 2026.pdf"].map((name) => (
                <div key={name} className="flex items-center gap-2 rounded-md bg-slate-50 px-2 py-2 text-sm">
                  <FileText className="h-4 w-4 text-indigo-500" />
                  <span className="truncate">{name}</span>
                </div>
              ))}
            </div>
            <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
                <MessagesSquare className="h-4 w-4" />
                AI Chat
              </div>
              <div className="rounded-md bg-white p-3 text-sm text-slate-700 shadow-sm">
                สรุปประเด็นหลักจากทุกไฟล์ พร้อมความต่างระหว่างผลสัมภาษณ์กับข้อมูลตลาด
              </div>
              <div className="rounded-md border border-indigo-200 bg-white p-3 text-sm text-slate-700 shadow-sm">
                <div className="mb-2 flex items-center gap-1 text-xs font-medium text-indigo-600">
                  <Quote className="h-3.5 w-3.5" /> Citation Highlight
                </div>
                “ยอดขายไตรมาสล่าสุดเพิ่มขึ้น 23% เมื่อเทียบกับปีก่อน”
              </div>
            </div>
          </CardContent>
          </Card>
        </Reveal>
      </div>

      {showPreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">System Demo Preview</h3>
              <Button variant="ghost" onClick={() => setShowPreview(false)}>
                Close
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <video
                className="aspect-video w-full"
                controls
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                poster="https://images.unsplash.com/photo-1516382799247-87df95d790b7?q=80&w=1200&auto=format&fit=crop"
              >
                <source
                  src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm"
                  type="video/webm"
                />
                <source
                  src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
                  type="video/mp4"
                />
              </video>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

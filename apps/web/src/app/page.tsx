import { PublicLayout } from "@/components/layout/PublicLayout";
import { FeaturesGrid } from "@/components/landing/FeaturesGrid";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";

export default function HomePage() {
  return (
    <PublicLayout>
      <HeroSection />
      <FeaturesGrid />
      <HowItWorks />
      <TestimonialsSection />
    </PublicLayout>
  );
}

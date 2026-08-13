import { Navbar } from "@/components/landing/navbar";
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { StatsSection } from "@/components/landing/stats-section";
export default function Home() {
    return (<div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <div id="features">
        <FeaturesSection />
      </div>
      <StatsSection />
      <footer className="border-t border-zinc-800/40 py-12">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="text-sm text-zinc-600">
            &copy; {new Date().getFullYear()} CodeAssess. All rights reserved.
          </p>
        </div>
      </footer>
    </div>);
}

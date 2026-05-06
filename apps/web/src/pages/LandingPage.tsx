import { useRef, useEffect, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import AppScreen from '../assets/AppScreen4x.png';
import LogoColored from '../assets/LogoColored.png';
import { Link, Navigate } from "react-router-dom";
import { useAuth } from '../contexts/AuthProvider';

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

function FadeUp({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useFadeIn();
  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`transition-all duration-700 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'} ${className}`}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const { session, loading } = useAuth();

  // If logged in, redirect to dashboard
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div style={{ overflowX: 'clip' }}>
      <div className="min-h-screen relative isolate bg-white">
        <BackgroundGlow />

        {/* Centered content container */}
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <Navbar />
          <Hero />
        </div>
        <AppPreview />
        <div className="absolute bottom-0 left-0 right-0 h-80 bg-linear-to-b from-white/0 to-white pointer-events-none" />
      </div>
      <FeaturesSection />
      <HowItWorksSection />
      <GamificationSection />
      <PricingSection />
      <SiteFooter />
    </div>
  );
}

function Navbar() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between py-6 md:backdrop-blur-none md:bg-transparent md:border-none backdrop-blur-md bg-white/70 border-b border-gray-200/50 -mx-6 lg:-mx-8 px-6 lg:px-8">
      {/* Left: brand */}
      <img src={LogoColored} alt="SkillCatch" className="h-7 md:h-8 w-auto" />

      {/* Right: actions */}
      <div className="flex items-center gap-3 md:gap-6">
        <Link to="/signin" className="text-sm md:text-base text-black font-medium hover:text-gray-500 transition-colors duration-200 ease-in-out">Sign In</Link>
        <button className="cursor-pointer rounded-2xl bg-gray-900 text-white px-5 py-2.5 text-m font-medium hover:-translate-y-0.5 transition-transform duration-200 ease-in-out inline-block group">
          Get started <ChevronRight className="h-4 w-4 inline-flex -translate-y-0.5 group-hover:translate-x-1 transition-transform duration-200 ease-in-out" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 pt-16 pb-20 lg:pb-32">
      {/* LEFT COLUMN - Heading */}
      <div className="flex items-center">
        <h1 className="font-serif font-medium text-5xl md:text-6xl lg:text-6xl leading-[1.24] tracking-tight text-gray-900">
          See your strengths.
          <br />
          Shape your direction.
        </h1>
      </div>

      {/* RIGHT COLUMN - Description and Button */}
      <div className="flex flex-col justify-center gap-6">
        <p className="text-gray-700 text-base lg:text-lg">
          A personal skill map, portfolio, and mentoring in one place.
          Unlock your potential and take the next step.
        </p>

        <div className="w-55 mt-6 bg-linear-to-r from-[#688DE0] to-[#D2608C] p-1 rounded-2xl inline-block">
          <button className="cursor-pointer w-full rounded-2xl bg-gray-900 text-white px-5 py-2.5 text-m font-medium hover:-translate-y-px transition-transform duration-200 ease-in-out inline-block group">
            Get started for free <ChevronRight className="h-4 w-4 inline-flex -translate-y-0.5 group-hover:translate-x-1 transition-transform duration-200 ease-in-out" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

function BackgroundGlow() {
  return (
    // absolute inset-0: covers the whole page area
    // -z-10: places it BEHIND the normal content
    <div className="absolute inset-0 -z-10 overflow-hidden">

      <div
        className="absolute h-350 w-350 rounded-full bg-blue-300/40 blur-3xl // Blue Top Left"
      />
      <div
        className="absolute top-250 left-20 h-250 w-250 rounded-full bg-blue-300/30 blur-3xl "
      />

      {/* Blob 2 (pink, right side) */}
      <div
        className="absolute top-40 -right-40 h-350 w-350 rounded-full bg-pink-300/40 blur-3xl // Pink Top Right"
      />
      <div
        className="absolute top-250 right-20 h-250 w-250 rounded-full bg-pink-300/30 blur-3xl"
      />
    </div>
  );
}

function AppPreview() {
  return (
    <div className="relative mx-auto px-6 lg:px-8 pb-12 lg:pb-20">
      <div className="mx-auto w-full max-w-[75vw]">
        <img
          src={AppScreen}
          alt="App preview"
          className="w-full h-auto shadow-2xl"
        />
      </div>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section className="py-24 lg:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeUp>
          <h2 className="font-serif font-medium text-4xl md:text-5xl text-gray-900 tracking-tight mb-16">
            Everything you need to grow
          </h2>
        </FadeUp>
        <FadeUp delay={150}>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Large feature */}
            <div className="lg:col-span-3 bg-gray-50 rounded-3xl p-10 flex flex-col gap-8">
              <div className="flex-1 min-h-64 bg-gray-200 rounded-2xl flex items-center justify-center">
                <span className="text-gray-400 text-sm font-medium tracking-wide">Skill Tree Preview</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Track Your Skills</h3>
                <p className="text-gray-600 leading-relaxed">Organize your learning with an interactive skill tree and track your progress in real-time.</p>
              </div>
            </div>
            {/* Three smaller features */}
            <div className="lg:col-span-2 flex flex-col gap-5">
              <div className="bg-gray-50 rounded-3xl p-8 flex-1">
                <div className="w-10 h-10 rounded-xl mb-5 bg-blue-100" />
                <h3 className="text-base font-semibold text-gray-900 mb-2">Learn from Experts and Peers</h3>
                <p className="text-gray-600 text-sm leading-relaxed">Connect with teachers and peers who can help you grow faster. Share resources and attend live workshops.</p>
              </div>
              <div className="bg-gray-50 rounded-3xl p-8 flex-1">
                <div className="w-10 h-10 rounded-xl mb-5 bg-pink-100" />
                <h3 className="text-base font-semibold text-gray-900 mb-2">Skillcoins & Rewards</h3>
                <p className="text-gray-600 text-sm leading-relaxed">Gamify your progress and earn Skillcoins as you complete assessments, hit milestones, and engage with the community.</p>
              </div>
              <div className="bg-gray-50 rounded-3xl p-8 flex-1">
                <div className="w-10 h-10 rounded-xl mb-5 bg-purple-100" />
                <h3 className="text-base font-semibold text-gray-900 mb-2">Customizable Skill Spaces</h3>
                <p className="text-gray-600 text-sm leading-relaxed">Design your own learning path and customize your skill tree. Add personalized attributes and share your journey.</p>
              </div>
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    { n: '01', title: 'Build your profile', body: 'Create your profile and customize your skill tree.' },
    { n: '02', title: 'Grow your skills', body: 'Track your skills, engage with experts, and grow your competency.' },
    { n: '03', title: 'Earn rewards', body: 'Earn Skillcoins and unlock new features as you complete learning milestones.' },
    { n: '04', title: 'Give back', body: 'Share your progress, join community challenges, or even become a mentor.' },
  ];

  return (
    <section className="py-24 lg:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeUp>
          <h2 className="font-serif font-medium text-4xl md:text-5xl text-gray-900 tracking-tight mb-20">
            Your journey, step by step
          </h2>
        </FadeUp>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          {steps.map((step, i) => (
            <FadeUp key={step.n} delay={i * 100}>
              <div className="text-7xl font-serif font-medium text-gray-900/10 mb-6 leading-none">{step.n}</div>
              <h3 className="text-gray-900 font-semibold text-lg mb-3">{step.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

function GamificationSection() {
  return (
    <section className="py-24 lg:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <FadeUp>
            <div>
              <h2 className="font-serif font-medium text-4xl md:text-5xl text-gray-900 tracking-tight mb-6">
                Learning that keeps you coming back
              </h2>
              <p className="text-gray-600 text-lg leading-relaxed mb-12">
                SkillCatch turns your growth into a game. Earn rewards, challenge others, and make your learning path uniquely yours.
              </p>
              <div className="flex flex-col gap-8">
                <div className="flex gap-5 items-start">
                  <div className="w-11 h-11 rounded-2xl shrink-0 bg-linear-to-r from-[#688DE0] to-[#D2608C]" />
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Skillcoins – Your Learning Currency</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">Earn Skillcoins as you progress. Use them to unlock resources, mentor sessions, or exclusive content.</p>
                  </div>
                </div>
                <div className="flex gap-5 items-start">
                  <div className="w-11 h-11 rounded-2xl shrink-0 bg-gray-100" />
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Community Challenges</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">Engage in group challenges and leaderboards — compete or collaborate with others in your skill space.</p>
                  </div>
                </div>
                <div className="flex gap-5 items-start">
                  <div className="w-11 h-11 rounded-2xl shrink-0 bg-gray-100" />
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">Customize Your Learning Path</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">Make your journey yours by customizing your skill tree, adding attributes, and sharing resources with the community.</p>
                  </div>
                </div>
              </div>
            </div>
          </FadeUp>
          <FadeUp delay={150}>
            <div className="bg-gray-50 rounded-3xl aspect-square flex items-center justify-center">
              <span className="text-gray-400 text-sm font-medium tracking-wide">Community Preview</span>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section className="py-24 lg:py-32 bg-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeUp>
          <div className="text-center mb-16">
            <h2 className="font-serif font-medium text-4xl md:text-5xl text-gray-900 tracking-tight mb-4">
              Simple pricing
            </h2>
            <p className="text-gray-600 text-lg">Start free, upgrade when you're ready.</p>
          </div>
        </FadeUp>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          <FadeUp delay={100}>
            <div className="bg-white rounded-3xl p-10 border border-gray-100 h-full">
              <div className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-widest">Free</div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-8">Start for Free</h3>
              <ul className="flex flex-col gap-3 text-sm text-gray-600 mb-10">
                <li>Explore basic features</li>
                <li>Join communities</li>
                <li>Begin tracking skills</li>
              </ul>
              <button className="cursor-pointer w-full rounded-2xl border border-gray-200 text-gray-900 px-5 py-3 text-sm font-medium hover:-translate-y-0.5 transition-transform duration-200 ease-in-out">
                Get started
              </button>
            </div>
          </FadeUp>
          <FadeUp delay={200}>
            <div className="bg-gray-900 rounded-3xl p-10 h-full">
              <div className="text-xs font-semibold text-white/40 mb-2 uppercase tracking-widest">Premium</div>
              <h3 className="text-2xl font-semibold text-white mb-8">Upgrade for Premium</h3>
              <ul className="flex flex-col gap-3 text-sm text-white/70 mb-10">
                <li>Advanced mentoring</li>
                <li>Deeper customization</li>
                <li>Premium resources</li>
                <li>Enhanced Skillcoin rewards</li>
              </ul>
              <button className="cursor-pointer w-full rounded-2xl bg-white text-gray-900 px-5 py-3 text-sm font-medium hover:-translate-y-0.5 transition-transform duration-200 ease-in-out">
                Upgrade <ChevronRight className="h-4 w-4 inline-flex -translate-y-0.5" aria-hidden="true" />
              </button>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-white border-t border-gray-100 py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-10">
          <div>
            <img src={LogoColored} alt="SkillCatch" className="h-7 w-auto mb-4" />
            <p className="text-gray-400 text-sm">© {new Date().getFullYear()} SkillCatch. All rights reserved.</p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-gray-400">
            <a href="#" className="hover:text-gray-900 transition-colors duration-200">Privacy Policy</a>
            <a href="#" className="hover:text-gray-900 transition-colors duration-200">Terms of Service</a>
            <a href="#" className="hover:text-gray-900 transition-colors duration-200">Community Guidelines</a>
            <a href="#" className="hover:text-gray-900 transition-colors duration-200">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

import { ChevronRight } from 'lucide-react';
import AppScreen from '../assets/AppScreen4x.png';
import LogoColored from '../assets/LogoColored.png';
import { Link, Navigate } from "react-router-dom";
import { useAuth } from '../contexts/AuthProvider';


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
    // relative: allows absolute-positioned children to be placed relative to this page
    // overflow-hidden: hides parts of the blobs that go outside the screen
    <div className="min-h-screen relative isolate overflow-hidden bg-white">
      <BackgroundGlow />

      {/* Centered content container */}
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Navbar />
        <Hero />
      </div>
      <AppPreview />
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

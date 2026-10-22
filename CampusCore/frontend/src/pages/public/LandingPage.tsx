import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Navbar } from '../../components/Navbar';
import { Hero } from '../../components/landing/Hero';
import { FeaturesSection, HowItWorksSection } from '../../components/landing/FeaturesSection';
import { AttendanceSection } from '../../components/landing/AttendanceSection';
import { AcademicsSection, PlacementsSection } from '../../components/landing/AcademicsPlacements';
import { AboutSection, BenefitsSection, RolesSection } from '../../components/landing/ValueSections';
import { FaqSection } from '../../components/landing/FaqSection';
import { ContactSection } from '../../components/landing/ContactSection';
import { Footer } from '../../components/landing/Footer';
import { prefersReducedMotion, scrollToSection } from '../../components/landing/nav';

export const LandingPage: React.FC = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const { hash } = useLocation();

  // Scroll to "/#section" when arriving from another route or when the hash changes.
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (!id) return;
    // Wait a frame so layout is settled before measuring.
    const raf = window.requestAnimationFrame(() => scrollToSection(id, { updateHash: false }));
    return () => window.cancelAnimationFrame(raf);
  }, [hash]);

  // Lightweight scroll-reveal. Content is visible by default; it is only hidden
  // once we know IntersectionObserver works and the user allows motion.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    // Reveal anything already on screen immediately to avoid a flash.
    const vh = window.innerHeight;
    targets.forEach((t) => {
      if (t.getBoundingClientRect().top < vh) t.classList.add('is-revealed');
      else observer.observe(t);
    });
    root.classList.add('reveal-ready');
    return () => {
      observer.disconnect();
      root.classList.remove('reveal-ready');
    };
  }, []);

  useEffect(() => {
    document.title = 'Campus Core — One Campus. One Core. Everything Connected.';
  }, []);

  return (
    <div ref={rootRef} className="landing-root font-landing flex min-h-screen flex-col overflow-x-clip bg-white text-slate-900 selection:bg-blue-600 selection:text-white">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Hero />
        <FeaturesSection />
        <HowItWorksSection />
        <AttendanceSection />
        <AcademicsSection />
        <PlacementsSection />
        <BenefitsSection />
        <RolesSection />
        <AboutSection />
        <FaqSection />
        <ContactSection />
      </main>
      <Footer />
    </div>
  );
};

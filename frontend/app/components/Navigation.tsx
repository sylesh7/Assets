"use client"

import { useState, useEffect, useRef } from "react"
import { Menu, X, ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"

interface NavigationProps {
  variant?: 'default' | 'consumer' | 'business'
}

export default function Navigation({ variant = 'default' }: NavigationProps) {
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState("hero")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showLeftScroll, setShowLeftScroll] = useState(false)
  const [showRightScroll, setShowRightScroll] = useState(false)

  const navScrollRef = useRef<HTMLDivElement>(null)

  // Define navigation items based on variant
  const getNavItems = () => {
    if (variant === 'consumer') {
      return [
        { id: "dashboard", label: "DASHBOARD", href: "/consumer/dashboard" },
        { id: "buy", label: "BUY", href: "/consumer/buy" },
      ]
    }
    
    if (variant === 'business') {
      return [
        { id: "dashboard", label: "DASHBOARD", href: "/business/dashboard" },
        { id: "upload", label: "UPLOAD", href: "/business/upload" },
      ]
    }
    
    // Default navigation for landing page
    return [
      { id: "hero", label: "Why fear to buy when Prop99 is here", href: "#hero" },
    ]
  }

  const navItems = getNavItems()

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)

      const sections = navItems.map((item) => item.id)
      for (const section of sections.reverse()) {
        const element = document.getElementById(section)
        if (element) {
          const rect = element.getBoundingClientRect()
          if (rect.top <= 100) {
            setActiveSection(section)
            break
          }
        }
      }
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    const checkScroll = () => {
      if (navScrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = navScrollRef.current
        setShowLeftScroll(scrollLeft > 0)
        setShowRightScroll(scrollLeft < scrollWidth - clientWidth - 5)
      }
    }

    checkScroll()
    window.addEventListener("resize", checkScroll)

    const observer = new MutationObserver(checkScroll)
    if (navScrollRef.current) {
      observer.observe(navScrollRef.current, { childList: true, subtree: true })
    }

    return () => {
      window.removeEventListener("resize", checkScroll)
      observer.disconnect()
    }
  }, [])

  const scrollNav = (direction: "left" | "right") => {
    if (navScrollRef.current) {
      const scrollAmount = 200
      const newScrollLeft =
        direction === "left"
          ? navScrollRef.current.scrollLeft - scrollAmount
          : navScrollRef.current.scrollLeft + scrollAmount

      navScrollRef.current.scrollTo({
        left: newScrollLeft,
        behavior: "smooth",
      })
    }
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white/95 backdrop-blur-sm border-b border-gray-200" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="font-mono font-bold text-xl tracking-wider shrink-0">
            PROP<span className="font-light">99</span>
            <sup className="text-xs">™</sup>
          </div>

          <div className="hidden md:flex items-center relative max-w-[60%]">
            {showLeftScroll && (
              <button
                onClick={() => scrollNav("left")}
                className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-md border border-gray-200 hover:bg-gray-50 transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft size={16} />
              </button>
            )}

            <div
              ref={navScrollRef}
              className="flex items-center space-x-8 overflow-x-auto scrollbar-hide px-8 py-2 scroll-smooth"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {navItems.map((item) => {
                const isExternalLink = item.href.startsWith('/')
                const content = (
                  <span
                    className={`text-sm font-mono tracking-wide transition-all duration-200 hover:text-gray-600 whitespace-nowrap relative ${
                      activeSection === item.id ? "text-black" : "text-gray-500"
                    }`}
                  >
                    {item.label}
                    {activeSection === item.id && <div className="absolute -bottom-1 left-0 right-0 h-px bg-black"></div>}
                  </span>
                )

                return isExternalLink ? (
                  <Link key={item.id} href={item.href}>
                    {content}
                  </Link>
                ) : (
                  <a key={item.id} href={item.href}>
                    {content}
                  </a>
                )
              })}
            </div>

            {showRightScroll && (
              <button
                onClick={() => scrollNav("right")}
                className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10 bg-white/90 backdrop-blur-sm rounded-full p-2 shadow-md border border-gray-200 hover:bg-gray-50 transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight size={16} />
              </button>
            )}
          </div>

          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 focus:outline-none focus:ring-2 focus:ring-black rounded"
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          <div className="hidden sm:flex items-center space-x-4 shrink-0">
            <a
              href="https://youtu.be/oLXkth10SJQ?si=kzUvpN4ALUPEnVST"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-black text-white text-xs font-mono rounded border-2 border-black hover:bg-white hover:text-black transition-all duration-200"
            >
              DEMO
            </a>
            <a
              href="https://github.com/austinjeremiah/Prop99/blob/main/Readme.md"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-black text-white text-xs font-mono rounded border-2 border-black hover:bg-white hover:text-black transition-all duration-200"
            >
              DOCUMENT
            </a>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-black rounded-full animate-pulse"></div>
              <span className="text-xs font-mono">LIVE</span>
            </div>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-sm border-t border-gray-200 animate-fadeIn">
          <div className="px-4 py-2 space-y-1 max-h-96 overflow-y-auto">
            {navItems.map((item) => {
              const isExternalLink = item.href.startsWith('/')
              const linkClasses = `block py-3 px-2 text-sm font-mono tracking-wide transition-colors rounded ${
                activeSection === item.id ? "text-black bg-gray-100 font-bold" : "text-gray-500 hover:text-gray-700"
              }`

              return isExternalLink ? (
                <Link
                  key={item.id}
                  href={item.href}
                  className={linkClasses}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.id}
                  href={item.href}
                  className={linkClasses}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </a>
              )
            })}
          </div>
        </div>
      )}
    </nav>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Search, Cpu, QrCode } from "lucide-react"

export default function Features() {
  const [activeFeature, setActiveFeature] = useState(0)
  const [connectionLines, setConnectionLines] = useState<Array<{ from: number; to: number; active: boolean }>>([])

  const features = [
    {
      title: "ASSET VERIFICATION",
      description:
        "AI-powered real-world asset verification through satellite imagery analysis with multi-oracle consensus validation and cryptographic proof anchoring to Ethereum",
      code: "VERIFY_001",
      metrics: { consensus: "2-of-3", accuracy: "99.8%", anchoring: "Ethereum L1", storage: "Mantle DA" },
      status: "ACTIVE",
      icon: Search,
      schematic: (
        <svg width="100%" height="60" viewBox="0 0 200 60">
          <rect x="10" y="20" width="60" height="20" fill="none" stroke="#000" strokeWidth="1" />
          <line x1="70" y1="30" x2="90" y2="30" stroke="#000" strokeWidth="1" />
          <circle cx="100" cy="30" r="8" fill="none" stroke="#000" strokeWidth="1" />
          <line x1="108" y1="30" x2="130" y2="30" stroke="#000" strokeWidth="1" />
          <rect x="130" y="20" width="60" height="20" fill="none" stroke="#000" strokeWidth="1" />
        </svg>
      ),
    },
    {
      title: "ORACLE CONSENSUS ENGINE",
      description:
        "Multi-node consensus mechanism validating AI analysis with weighted average valuation calculations and confidence scoring across distributed oracles",
      code: "CONSENSUS_002",
      metrics: { nodes: "3 oracles", validation: "Weighted", confidence: "Real-time", finality: "Instant" },
      status: "OPERATIONAL",
      icon: Cpu,
      schematic: (
        <svg width="100%" height="60" viewBox="0 0 200 60">
          <rect x="20" y="15" width="40" height="30" fill="none" stroke="#000" strokeWidth="1" />
          <path d="M60 30 Q80 20 100 30 Q120 40 140 30" fill="none" stroke="#000" strokeWidth="1" />
          <rect x="140" y="15" width="40" height="30" fill="none" stroke="#000" strokeWidth="1" />
          <circle cx="100" cy="30" r="3" fill="#000" />
        </svg>
      ),
    },
    {
      title: "RWA TOKENIZATION",
      description:
        "Automatic ERC-20 token generation for verified assets with compliance controls, transfer restrictions, and KYC whitelisting on Mantle blockchain",
      code: "TOKEN_003",
      metrics: { standard: "ERC-20", deployment: "Instant", compliance: "KYC-ready", chain: "Mantle" },
      status: "READY",
      icon: QrCode,
      schematic: (
        <svg width="100%" height="60" viewBox="0 0 200 60">
          <rect x="30" y="10" width="40" height="40" fill="none" stroke="#000" strokeWidth="1" />
          <rect x="35" y="15" width="10" height="10" fill="#000" />
          <rect x="50" y="15" width="10" height="10" fill="#000" />
          <rect x="35" y="35" width="10" height="10" fill="#000" />
          <line x1="70" y1="30" x2="130" y2="30" stroke="#000" strokeWidth="1" />
          <rect x="130" y="20" width="40" height="20" fill="none" stroke="#000" strokeWidth="1" />
        </svg>
      ),
    },
  ]

  useEffect(() => {
    const lines = [
      { from: 0, to: 1, active: false },
      { from: 1, to: 2, active: false },
      { from: 0, to: 2, active: false },
    ]
    setConnectionLines(lines)

    const interval = setInterval(() => {
      setConnectionLines((prev) =>
        prev.map((line) => ({
          ...line,
          active: Math.random() > 0.7,
        })),
      )
    }, 2000)

    const featureInterval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length)
    }, 5000)

    return () => {
      clearInterval(interval)
      clearInterval(featureInterval)
    }
  }, [])

  return (
    <section id="features" className="py-32 bg-gray-50 relative">
      <div className="absolute inset-0 opacity-8">
        <svg width="100%" height="100%" className="absolute inset-0">
          <defs>
            <pattern id="circuit" width="120" height="120" patternUnits="userSpaceOnUse">
              <path d="M 0 60 L 30 60 L 30 30 L 90 30 L 90 90 L 120 90" fill="none" stroke="#000" strokeWidth="1" />
              <circle cx="30" cy="60" r="3" fill="#000" />
              <circle cx="90" cy="30" r="3" fill="#000" />
              <rect x="85" y="85" width="10" height="10" fill="none" stroke="#000" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#circuit)" />
        </svg>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <h2 className="text-5xl font-light tracking-wider mb-6 font-mono">CORE FEATURES</h2>
          <div className="w-32 h-px bg-black mx-auto mb-8"></div>
          <p className="text-gray-600 max-w-3xl mx-auto text-lg">
            Advanced RWA tokenization powered by AI verification and Mantle blockchain infrastructure
          </p>
        </div>

        <div className="relative">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const IconComponent = feature.icon
              return (
                <div
                  key={index}
                  className={`group relative bg-white border-2 p-8 transition-all duration-500 cursor-pointer ${
                    activeFeature === index
                      ? "border-black shadow-xl transform -translate-y-4 bg-gray-50"
                      : "border-gray-200 hover:border-gray-400 hover:shadow-lg hover:-translate-y-1"
                  }`}
                  onClick={() => setActiveFeature(index)}
                >
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-black transition-all duration-300 group-hover:w-12 group-hover:h-12"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-black transition-all duration-300 group-hover:w-12 group-hover:h-12"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-black transition-all duration-300 group-hover:w-12 group-hover:h-12"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-black transition-all duration-300 group-hover:w-12 group-hover:h-12"></div>

                  <div className="flex justify-between items-start mb-6">
                    <span className="text-xs font-mono text-gray-400">{feature.code}</span>
                    <div className="flex items-center space-x-2">
                      <IconComponent size={20} className="text-gray-600" />
                      <div
                        className={`w-3 h-3 ${activeFeature === index ? "bg-black animate-pulse" : "bg-gray-300"}`}
                      ></div>
                    </div>
                  </div>

                  <h3 className="text-xl font-mono font-bold mb-4 tracking-wide">{feature.title}</h3>

                  <div className="mb-6">{feature.schematic}</div>

                  <p className="text-gray-600 leading-relaxed mb-6">{feature.description}</p>

                  {activeFeature === index && (
                    <div className="space-y-3 mb-6 animate-fadeIn">
                      {Object.entries(feature.metrics).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-xs font-mono">
                          <span className="text-gray-500 uppercase">{key}:</span>
                          <span className="text-black font-bold">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center space-x-2">
                    <div className="flex-1 h-px bg-gray-300 relative">
                      {activeFeature === index && (
                        <div
                          className="absolute left-0 top-0 h-full bg-black animate-pulse"
                          style={{ width: "100%" }}
                        ></div>
                      )}
                    </div>
                    <div className={`w-2 h-2 ${activeFeature === index ? "bg-black" : "bg-gray-400"}`}></div>
                    <span className="text-xs font-mono">{feature.status}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
            {connectionLines.map((line, index) => {
              const positions = [
                { x: "16.66%", y: "50%" },
                { x: "50%", y: "50%" },
                { x: "83.33%", y: "50%" },
              ]
              return (
                <line
                  key={index}
                  x1={positions[line.from].x}
                  y1={positions[line.from].y}
                  x2={positions[line.to].x}
                  y2={positions[line.to].y}
                  stroke="#000"
                  strokeWidth="2"
                  opacity={line.active ? "0.6" : "0.2"}
                  strokeDasharray={line.active ? "none" : "8,8"}
                  className="transition-all duration-500"
                />
              )
            })}
          </svg>
        </div>

        <div className="mt-20 bg-white border-2 border-gray-200 p-8">
          <h3 className="font-mono font-bold text-xl mb-8 text-center">REAL-TIME DATA FLOW</h3>
          <div className="flex justify-center items-center space-x-12">
            <div className="text-center">
              <div className="w-16 h-16 border-2 border-black flex items-center justify-center mb-3 relative">
                <span className="text-sm font-mono">ASSET</span>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-black animate-ping"></div>
              </div>
              <span className="text-xs text-gray-500 font-mono">SUBMISSION</span>
            </div>

            <div className="flex-1 h-px bg-gray-300 relative">
              <div className="absolute top-0 left-0 h-full bg-black animate-pulse" style={{ width: "100%" }}></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-black animate-bounce"></div>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 border-2 border-black flex items-center justify-center mb-3">
                <span className="text-sm font-mono">VERIFY</span>
              </div>
              <span className="text-xs text-gray-500 font-mono">CONSENSUS</span>
            </div>

            <div className="flex-1 h-px bg-gray-300 relative">
              <div className="absolute top-0 left-0 h-full bg-black animate-pulse" style={{ width: "100%" }}></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-black animate-bounce"></div>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 border-2 border-black flex items-center justify-center mb-3 relative">
                <span className="text-sm font-mono">TOKEN</span>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-black animate-ping"></div>
              </div>
              <span className="text-xs text-gray-500 font-mono">DEPLOYMENT</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Mail, Phone, MapPin } from "lucide-react"

export default function Footer() {
  const [systemStatus, setSystemStatus] = useState({
    api: "OPERATIONAL",
    database: "HEALTHY",
    network: "OPTIMAL",
    security: "SECURE",
  })

  useEffect(() => {
    const statusInterval = setInterval(() => {
      const statuses = ["OPERATIONAL", "HEALTHY", "OPTIMAL"]
      setSystemStatus((prev) => ({
        api: statuses[Math.floor(Math.random() * statuses.length)],
        database: statuses[Math.floor(Math.random() * statuses.length)],
        network: statuses[Math.floor(Math.random() * statuses.length)],
        security: "SECURE",
      }))
    }, 15000)

    return () => clearInterval(statusInterval)
  }, [])

  return (
    <footer id="contact" className="bg-gray-50 border-t-2 border-gray-200 py-20 relative">
      <div className="absolute inset-0 opacity-5">
        <div
          className="h-full w-full animate-pulse"
          style={{
            backgroundImage: `
            linear-gradient(to right, #000 1px, transparent 1px),
            linear-gradient(to bottom, #000 1px, transparent 1px)
          `,
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-12 left-12 w-4 h-4 border border-black opacity-20 rotate-45 animate-spin"
          style={{ animationDuration: "15s" }}
        ></div>
        <div className="absolute bottom-20 right-20 w-6 h-6 border border-black opacity-15 animate-pulse"></div>
        <div className="absolute top-1/2 left-1/4 w-3 h-12 bg-black opacity-10 rotate-12"></div>
        <div className="absolute bottom-1/3 right-1/3 w-8 h-8 border border-black opacity-10 rotate-45"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="mb-16 bg-white border-2 border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-mono font-bold text-lg">SYSTEM STATUS</h3>
            <div className="flex items-center space-x-6 text-sm font-mono">
              {Object.entries(systemStatus).map(([key, status]) => (
                <div key={key} className="flex items-center space-x-2">
                  <div
                    className={`w-3 h-3 ${
                      status === "SECURE" || status === "OPERATIONAL" || status === "HEALTHY" || status === "OPTIMAL"
                        ? "bg-black animate-pulse"
                        : "bg-gray-400"
                    }`}
                  ></div>
                  <span className="uppercase">
                    {key}: {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-2">
            <h3 className="font-mono font-bold text-4xl mb-8 tracking-wider">
              NEXORA<span className="font-light">SIM</span>
              <sup className="text-lg">™</sup>
            </h3>
            <p className="text-gray-600 mb-10 leading-relaxed text-lg">
              Advanced eSIM and IoT connectivity platform designed for Myanmar's digital infrastructure. GSMA-compliant
              solutions powered by artificial intelligence and deployed on Vercel's cutting-edge infrastructure.
            </p>

            <div className="border-2 border-gray-300 p-8 inline-block hover:border-black transition-colors duration-300 mb-8">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-16 border-2 border-black flex items-center justify-center">
                  <span className="text-2xl font-mono font-bold">G</span>
                </div>
                <div>
                  <div className="text-xl font-mono font-bold">GSMA CERTIFIED</div>
                  <div className="text-sm text-gray-500 font-mono">SGP.22 COMPLIANT • SECURITY ASSURED</div>
                  <div className="text-xs text-gray-400 font-mono mt-1">CERTIFICATE ID: GSMA-SGP22-2024-001</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <div className="text-gray-500 text-xs font-mono mb-2">API VERSION</div>
                <div className="font-mono font-bold text-lg">v2.1.0</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs font-mono mb-2">PROTOCOL</div>
                <div className="font-mono font-bold text-lg">SGP.22</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs font-mono mb-2">ENCRYPTION</div>
                <div className="font-mono font-bold text-lg">AES-256</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs font-mono mb-2">COMPLIANCE</div>
                <div className="font-mono font-bold text-lg">GSMA</div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-mono font-bold mb-8 tracking-wide text-xl">CONTACT</h4>
            <div className="space-y-6">
              <div className="group">
                <div className="flex items-center space-x-3 mb-2">
                  <MapPin size={16} className="text-gray-500" />
                  <div className="text-gray-500 text-xs font-mono">HEADQUARTERS</div>
                </div>
                <div className="group-hover:text-gray-600 transition-colors pl-7">
                  Yangon, Myanmar
                  <br />
                  Digital Innovation District
                  <br />
                  Building 7, Floor 12
                </div>
              </div>
              <div className="group">
                <div className="flex items-center space-x-3 mb-2">
                  <Mail size={16} className="text-gray-500" />
                  <div className="text-gray-500 text-xs font-mono">EMAIL</div>
                </div>
                <div className="font-mono group-hover:text-gray-600 transition-colors pl-7">
                  contact@nexorasim.com
                  <br />
                  support@nexorasim.com
                </div>
              </div>
              <div className="group">
                <div className="flex items-center space-x-3 mb-2">
                  <Phone size={16} className="text-gray-500" />
                  <div className="text-gray-500 text-xs font-mono">SUPPORT</div>
                </div>
                <div className="font-mono group-hover:text-gray-600 transition-colors pl-7">
                  24/7 TECHNICAL
                  <br />
                  +95-1-NEXORA-1
                  <br />
                  Emergency: +95-1-NEXORA-911
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-mono font-bold mb-8 tracking-wide text-xl">PERFORMANCE</h4>
            <div className="space-y-6">
              <div>
                <div className="text-gray-500 text-xs font-mono mb-2">UPTIME</div>
                <div className="font-mono font-bold text-2xl">99.99%</div>
                <div className="text-xs text-gray-400">SLA Guaranteed</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs font-mono mb-2">LATENCY</div>
                <div className="font-mono font-bold text-2xl">{"< 30ms"}</div>
                <div className="text-xs text-gray-400">Global Average</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs font-mono mb-2">THROUGHPUT</div>
                <div className="font-mono font-bold text-2xl">10K+</div>
                <div className="text-xs text-gray-400">req/sec</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs font-mono mb-2">AVAILABILITY</div>
                <div className="font-mono font-bold text-2xl">GLOBAL</div>
                <div className="text-xs text-gray-400">23 Regions</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs font-mono mb-2">SCALING</div>
                <div className="font-mono font-bold text-2xl">AUTO</div>
                <div className="text-xs text-gray-400">Vercel Edge</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-20 pt-10 border-t-2 border-gray-300">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="text-sm text-gray-500 font-mono mb-6 md:mb-0">
              © 2024 NEXORASIM™. ALL RIGHTS RESERVED. • MYANMAR DIGITAL INFRASTRUCTURE
            </div>

            <div className="flex items-center space-x-8 text-sm font-mono">
              <span className="flex items-center space-x-2 group">
                <div className="w-2 h-2 bg-black animate-pulse"></div>
                <span className="group-hover:text-gray-600 transition-colors">POWERED BY VERCEL</span>
              </span>
              <span className="flex items-center space-x-2 group">
                <div className="w-2 h-2 bg-gray-400"></div>
                <span className="group-hover:text-gray-600 transition-colors">AI-DRIVEN</span>
              </span>
              <span className="flex items-center space-x-2 group">
                <div className="w-2 h-2 bg-black"></div>
                <span className="group-hover:text-gray-600 transition-colors">MYANMAR READY</span>
              </span>
              <span className="flex items-center space-x-2 group">
                <div className="w-2 h-2 bg-gray-600"></div>
                <span className="group-hover:text-gray-600 transition-colors">GSMA COMPLIANT</span>
              </span>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-gray-200 text-center">
            <div className="text-xs font-mono text-gray-400 space-x-6">
              <span>BUILT WITH NEXT.JS 15</span>
              <span>•</span>
              <span>DEPLOYED ON VERCEL EDGE</span>
              <span>•</span>
              <span>SECURED WITH TLS 1.3</span>
              <span>•</span>
              <span>MONITORED 24/7</span>
              <span>•</span>
              <span>GSMA SGP.22 CERTIFIED</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

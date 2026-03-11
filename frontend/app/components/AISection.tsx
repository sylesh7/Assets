"use client"

import { useState, useEffect } from "react"
import { Brain, Zap, Settings } from "lucide-react"

export default function AISection() {
  const [activePanel, setActivePanel] = useState(0)
  const [processingData, setProcessingData] = useState(false)
  const [metrics, setMetrics] = useState({
    throughput: 1247,
    accuracy: 99.8,
    latency: 47,
    efficiency: 94.2,
  })

  const panels = [
    {
      title: "SATELLITE IMAGERY ANALYSIS",
      description: "AI-powered satellite image processing for precise asset location verification and property condition assessment",
      metrics: ["99.8% Accuracy", "< 2s Analysis", "Multi-spectral", "Geospatial Ready"],
      processes: ["Image Ingestion", "Feature Detection", "Boundary Mapping", "Condition Assessment"],
      icon: Settings,
    },
    {
      title: "VALUATION MODELING",
      description: "Machine learning models analyzing market data, comparable sales, and property characteristics for accurate valuations",
      metrics: ["99.2% Accuracy", "Real-time Calc", "Market-driven", "Confidence Scoring"],
      processes: ["Data Collection", "Feature Engineering", "Model Inference", "Valuation Output"],
      icon: Brain,
    },
    {
      title: "CONSENSUS VALIDATION",
      description: "Distributed verification across multiple AI oracles with weighted confidence scoring and automatic tokenization triggers",
      metrics: ["2-of-3 Required", "Weighted Avg", "Confidence Scores", "Auto-Execution"],
      processes: ["Oracle Analysis", "Score Weighting", "Consensus Check", "Token Minting"],
      icon: Zap,
    },
  ]

  useEffect(() => {
    const metricsInterval = setInterval(() => {
      setMetrics((prev) => ({
        throughput: prev.throughput + Math.floor(Math.random() * 20 - 10),
        accuracy: Math.max(95, Math.min(100, prev.accuracy + (Math.random() - 0.5) * 0.2)),
        latency: Math.max(30, Math.min(80, prev.latency + Math.floor(Math.random() * 10 - 5))),
        efficiency: Math.max(90, Math.min(100, prev.efficiency + (Math.random() - 0.5) * 0.5)),
      }))
    }, 2000)

    const processingInterval = setInterval(() => {
      setProcessingData(true)
      setTimeout(() => setProcessingData(false), 1500)
    }, 5000)

    return () => {
      clearInterval(metricsInterval)
      clearInterval(processingInterval)
    }
  }, [])

  return (
    <section id="ai" className="py-32 bg-white relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <h2 className="text-5xl font-light tracking-wider mb-6 font-mono">
            VERIFICATION<span className="font-bold"> AI ENGINE</span>
          </h2>
          <div className="w-32 h-px bg-black mx-auto mb-8"></div>
          <p className="text-gray-600 max-w-3xl mx-auto text-lg">
            Advanced artificial intelligence powering real-world asset analysis and verification automation
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div className="space-y-6">
            {panels.map((panel, index) => {
              const IconComponent = panel.icon
              return (
                <div
                  key={index}
                  className={`border-2 p-8 cursor-pointer transition-all duration-300 relative overflow-hidden ${
                    activePanel === index ? "border-black bg-gray-50" : "border-gray-200 hover:border-gray-400"
                  }`}
                  onClick={() => setActivePanel(index)}
                >
                  {activePanel === index && processingData && (
                    <div className="absolute inset-0 bg-black/5 flex items-center justify-center">
                      <div className="text-sm font-mono text-black animate-pulse">PROCESSING...</div>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <IconComponent size={24} className="text-gray-600" />
                      <h3 className="font-mono font-bold text-xl">{panel.title}</h3>
                    </div>
                    <div
                      className={`w-4 h-4 ${activePanel === index ? "bg-black animate-pulse" : "bg-gray-300"}`}
                    ></div>
                  </div>

                  <p className="text-gray-600 mb-6 leading-relaxed">{panel.description}</p>

                  {activePanel === index && (
                    <div className="space-y-6 animate-fadeIn">
                      <div className="grid grid-cols-2 gap-3">
                        {panel.metrics.map((metric, i) => (
                          <span key={i} className="bg-black text-white px-3 py-2 text-xs font-mono text-center">
                            {metric}
                          </span>
                        ))}
                      </div>

                      <div className="space-y-3">
                        <div className="text-sm font-mono text-gray-500 mb-3">PROCESS FLOW:</div>
                        {panel.processes.map((process, i) => (
                          <div key={i} className="flex items-center space-x-3 text-sm">
                            <div
                              className={`w-3 h-3 ${processingData && i <= 2 ? "bg-black animate-pulse" : "bg-gray-400"}`}
                            ></div>
                            <span className="font-mono">{process}</span>
                            {i < panel.processes.length - 1 && <div className="flex-1 h-px bg-gray-300 ml-2"></div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-6">
              <div className="border-2 border-gray-200 p-6 bg-white">
                <div className="text-xs font-mono text-gray-500 mb-2">ASSETS ANALYZED</div>
                <div className="text-3xl font-mono font-bold">{metrics.throughput.toLocaleString()}</div>
                <div className="text-xs text-gray-500">verified</div>
              </div>
              <div className="border-2 border-gray-200 p-6 bg-white">
                <div className="text-xs font-mono text-gray-500 mb-2">ACCURACY</div>
                <div className="text-3xl font-mono font-bold">{metrics.accuracy.toFixed(1)}%</div>
                <div className="text-xs text-gray-500">prediction</div>
              </div>
              <div className="border-2 border-gray-200 p-6 bg-white">
                <div className="text-xs font-mono text-gray-500 mb-2">AVG ANALYSIS TIME</div>
                <div className="text-3xl font-mono font-bold">{metrics.latency}s</div>
                <div className="text-xs text-gray-500">per asset</div>
              </div>
              <div className="border-2 border-gray-200 p-6 bg-white">
                <div className="text-xs font-mono text-gray-500 mb-2">EFFICIENCY</div>
                <div className="text-3xl font-mono font-bold">{metrics.efficiency.toFixed(1)}%</div>
                <div className="text-xs text-gray-500">resource util</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

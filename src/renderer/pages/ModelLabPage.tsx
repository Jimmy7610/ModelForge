import React from 'react';
import { FlaskConical, Gauge, BarChart3, Sliders, Scale } from 'lucide-react';
import './ModelLabPage.css';

export const ModelLabPage: React.FC = () => {
  const futureModules = [
    {
      title: 'Performance & Latency',
      desc: 'Evaluate token generation speed (tokens/sec), time-to-first-token (TTFT), and memory footprint across quantization levels (Q4_K_M, Q8_0).',
      icon: Gauge,
    },
    {
      title: 'Benchmark Evaluations',
      desc: 'Run standardized automated code generation benchmarks (HumanEval, MBPP, SWE-bench) locally to measure accuracy.',
      icon: BarChart3,
    },
    {
      title: 'Task Weighting & Routing',
      desc: 'Profile model capabilities by task type (architecture planning, code completion, refactoring, test writing).',
      icon: Sliders,
    },
    {
      title: 'Side-by-Side Model Comparison',
      desc: 'Compare responses from multiple local models simultaneously on the same project task.',
      icon: Scale,
    },
  ];

  return (
    <div className="model-lab-page">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Model Lab</h1>
          <p className="page-subtitle">Local model profiling, benchmarking, and routing</p>
        </div>
        <span className="badge badge-accent">Pass 3 Architecture</span>
      </div>

      <div className="lab-intro-banner panel">
        <div className="lab-intro-icon">
          <FlaskConical size={32} className="text-secondary" />
        </div>
        <div className="lab-intro-text">
          <h2>Benchmark and optimize models on your own hardware</h2>
          <p>
            Model Lab will provide comprehensive local telemetry, measuring exact hardware throughput,
            context window performance, and code reasoning scores without leaking source code to external servers.
          </p>
        </div>
      </div>

      <div className="lab-grid">
        {futureModules.map((module) => {
          const Icon = module.icon;
          return (
            <div key={module.title} className="panel lab-card">
              <div className="lab-card-header">
                <div className="lab-card-icon">
                  <Icon size={18} />
                </div>
                <span className="lab-card-badge">Planned</span>
              </div>
              <h3 className="lab-card-title">{module.title}</h3>
              <p className="lab-card-desc">{module.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

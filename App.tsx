import React, { useState, useEffect } from 'react';
import { SimulatorConfig, MetricType } from './types';
import { DEFAULT_CONFIG } from './constants';
import { runSimulation } from './simulationEngine';
import { Card, NumberInput, Select, Button } from './components/UI';
import { BehaviorForm } from './components/BehaviorForm';
import { Charts } from './components/Charts';
import { Settings, Play, RotateCcw, Activity, Server, Clock, ArrowUp, ArrowDown, Target } from 'lucide-react';

const App: React.FC = () => {
  const [config, setConfig] = useState<SimulatorConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<'workload' | 'scaleUp' | 'scaleDown'>('workload');
  const [simulationResult, setSimulationResult] = useState(runSimulation(DEFAULT_CONFIG));
  const [isAutoRun, setIsAutoRun] = useState(true);

  // Debounced run or immediate run based on button
  useEffect(() => {
    if (isAutoRun) {
      const handler = setTimeout(() => {
        setSimulationResult(runSimulation(config));
      }, 300); // 300ms debounce
      return () => clearTimeout(handler);
    }
  }, [config, isAutoRun]);

  const handleRun = () => {
    setSimulationResult(runSimulation(config));
  };

  const handleReset = () => {
    setConfig(DEFAULT_CONFIG);
  };

  // Helper to update shallow top-level config fields
  const updateConfig = (field: keyof SimulatorConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 pb-10">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 text-white p-1.5 rounded">
              <Activity size={20} />
            </div>
            <h1 className="text-xl font-bold text-slate-800">K8s HPA Simulator <span className="text-xs font-normal text-slate-500 ml-2 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">v2 Custom Metric</span></h1>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleReset} className="hidden sm:flex text-xs">
              <RotateCcw size={14} className="mr-1.5" /> Reset
            </Button>
            <Button onClick={handleRun} className="text-xs">
              <Play size={14} className="mr-1.5" /> Simulate
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT PANEL: CONFIGURATION */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="h-full flex flex-col">
              <div className="flex border-b border-slate-200 mb-4">
                <button 
                  onClick={() => setActiveTab('workload')}
                  className={`flex-1 pb-2 text-sm font-medium ${activeTab === 'workload' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Workload
                </button>
                <button 
                  onClick={() => setActiveTab('scaleUp')}
                  className={`flex-1 pb-2 text-sm font-medium ${activeTab === 'scaleUp' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Scale Up
                </button>
                <button 
                  onClick={() => setActiveTab('scaleDown')}
                  className={`flex-1 pb-2 text-sm font-medium ${activeTab === 'scaleDown' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Scale Down
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                {activeTab === 'workload' && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center"><Target size={14} className="mr-2"/> Metric Settings</h4>
                      <Select 
                        label="Metric Type" 
                        value={config.metricType} 
                        onChange={e => updateConfig('metricType', e.target.value as MetricType)}
                        options={[
                          { value: 'QueueLatency', label: 'Queue Latency' },
                          { value: 'QueueLength', label: 'Queue Length' },
                        ]} 
                      />
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <NumberInput label="Target Value" value={config.targetMetricValue} onChange={e => updateConfig('targetMetricValue', parseFloat(e.target.value))} />
                        <NumberInput label="Start Value" value={config.initialMetricValue} onChange={e => updateConfig('initialMetricValue', parseFloat(e.target.value))} disabled={config.initialQueueJobs > 0} className={config.initialQueueJobs > 0 ? 'opacity-50' : ''} />
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                      <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center"><Server size={14} className="mr-2"/> Pod Limits</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <NumberInput label="Min Pods" value={config.minPods} onChange={e => updateConfig('minPods', parseInt(e.target.value))} />
                        <NumberInput label="Max Pods" value={config.maxPods} onChange={e => updateConfig('maxPods', parseInt(e.target.value))} />
                        <NumberInput label="Start Pods" value={config.startingPods} onChange={e => updateConfig('startingPods', parseInt(e.target.value))} />
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                      <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center"><Settings size={14} className="mr-2"/> Queue Throughput</h4>
                      <div className="grid grid-cols-1 gap-3">
                        <NumberInput label="Production Rate (Jobs/Sec total)" value={config.producingRateTotal} onChange={e => updateConfig('producingRateTotal', parseFloat(e.target.value))} />
                        <NumberInput label="Process Rate (Jobs/Sec/Pod)" value={config.processingRatePerPod} onChange={e => updateConfig('processingRatePerPod', parseFloat(e.target.value))} />
                        <NumberInput label="Initial Queue Jobs" value={config.initialQueueJobs} onChange={e => updateConfig('initialQueueJobs', parseInt(e.target.value))} />
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-4">
                      <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center"><Clock size={14} className="mr-2"/> Simulation Control</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <NumberInput label="Tolerance (0.1 = 10%)" value={config.toleranceFraction} step={0.01} onChange={e => updateConfig('toleranceFraction', parseFloat(e.target.value))} />
                        <div className="col-span-2">
                           <NumberInput label="Simulation Duration (sec)" value={config.simulationSeconds} onChange={e => updateConfig('simulationSeconds', parseInt(e.target.value))} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'scaleUp' && (
                  <BehaviorForm 
                    type="Scale Up" 
                    value={config.scaleUp} 
                    onChange={v => setConfig(prev => ({...prev, scaleUp: v}))} 
                  />
                )}

                {activeTab === 'scaleDown' && (
                  <BehaviorForm 
                    type="Scale Down" 
                    value={config.scaleDown} 
                    onChange={v => setConfig(prev => ({...prev, scaleDown: v}))} 
                  />
                )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-100">
                <label className="flex items-center space-x-2 text-sm text-slate-600">
                  <input type="checkbox" checked={isAutoRun} onChange={e => setIsAutoRun(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500" />
                  <span>Auto-simulate on change</span>
                </label>
              </div>
            </Card>
          </div>

          {/* RIGHT PANEL: CHARTS */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Stats Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="flex flex-col items-center justify-center p-4">
                <span className="text-xs font-semibold text-slate-500 uppercase">Max Value</span>
                <span className={`text-2xl font-bold ${simulationResult.summary.maxMetricValue > config.targetMetricValue * 1.5 ? 'text-red-600' : 'text-slate-800'}`}>
                  {simulationResult.summary.maxMetricValue.toFixed(2)}
                </span>
              </Card>
              <Card className="flex flex-col items-center justify-center p-4">
                <span className="text-xs font-semibold text-slate-500 uppercase">Final Pods</span>
                <span className="text-2xl font-bold text-slate-800">
                  {simulationResult.summary.finalPods}
                </span>
              </Card>
              <Card className="flex flex-col items-center justify-center p-4">
                <span className="text-xs font-semibold text-slate-500 uppercase">Scale Events</span>
                <div className="flex gap-3 text-sm font-medium mt-1">
                  <span className="flex items-center text-emerald-600"><ArrowUp size={14} className="mr-1"/> {simulationResult.summary.totalScaleUps}</span>
                  <span className="flex items-center text-rose-600"><ArrowDown size={14} className="mr-1"/> {simulationResult.summary.totalScaleDowns}</span>
                </div>
              </Card>
              <Card className="flex flex-col items-center justify-center p-4">
                <span className="text-xs font-semibold text-slate-500 uppercase">Final Queue</span>
                <span className="text-2xl font-bold text-slate-800">
                  {Math.round(simulationResult.summary.finalQueueJobs)}
                </span>
              </Card>
            </div>

            <Charts 
              data={simulationResult.points} 
              targetMetricValue={config.targetMetricValue} 
              metricType={config.metricType}
            />

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
              <p className="font-semibold mb-1">About this Simulation</p>
              <p className="opacity-90 leading-relaxed">
                This tool simulates Kubernetes HPA v2 behavior on a discrete 1-second interval. It calculates the metric (<b>{config.metricType === 'QueueLatency' ? 'Queue Latency' : 'Queue Length'}</b>) based on queue depth and processing capacity. 
                Desired replicas are computed via <code>ceil(currentReplicas * (currentMetric / targetMetric))</code>. 
                Stabilization windows use the conservative approach (Min for ScaleUp, Max for ScaleDown) over the window duration.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
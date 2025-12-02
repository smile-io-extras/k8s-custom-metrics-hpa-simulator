import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { SimulationPoint, MetricType } from '../types';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as SimulationPoint;
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-lg rounded text-xs text-slate-900">
        <p className="font-bold mb-1">Time: {label}s</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
           <span className="text-slate-500">Latency:</span>
           <span className="font-mono">{data.latency.toFixed(2)}s</span>
           
           <span className="text-slate-500">Metric Value:</span>
           <span className="font-mono">{data.metricValue.toFixed(2)}</span>

           <span className="text-slate-500">Pods:</span>
           <span className="font-mono">{data.pods}</span>

           <span className="text-slate-500">Queue:</span>
           <span className="font-mono">{Math.round(data.queueJobs)}</span>

           <span className="text-slate-500">Desired (Raw):</span>
           <span className="font-mono">{data.desiredReplicasRaw}</span>

           <span className="text-slate-500">Desired (Eff):</span>
           <span className="font-mono">{data.desiredReplicasEffective}</span>
        </div>
      </div>
    );
  }
  return null;
};

interface Props {
  data: SimulationPoint[];
  targetMetricValue: number;
  metricType: MetricType;
}

export const Charts: React.FC<Props> = ({ data, targetMetricValue, metricType }) => {
  return (
    <div className="space-y-6">
      {/* Chart 1: Queue Latency (Physical) */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 h-80">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Queue Latency vs Time</h3>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="t" 
              type="number" 
              domain={['dataMin', 'dataMax']} 
              tick={{fontSize: 12, fill: '#64748b'}}
              label={{ value: 'Seconds', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#64748b' }}
            />
            <YAxis 
              tick={{fontSize: 12, fill: '#64748b'}}
              label={{ value: 'Latency (s)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#64748b' }}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {metricType === 'QueueLatency' && (
               <ReferenceLine y={targetMetricValue} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Target', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
            )}
            
            <Line 
              type="monotone" 
              dataKey="latency" 
              name="Latency"
              stroke="#6366f1" 
              strokeWidth={2} 
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2: Replicas */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 h-80">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Replicas vs Time</h3>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="t" 
              type="number" 
              domain={['dataMin', 'dataMax']} 
              tick={{fontSize: 12, fill: '#64748b'}}
            />
            <YAxis 
              tick={{fontSize: 12, fill: '#64748b'}}
              label={{ value: 'Replicas', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#64748b' }}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{fontSize: '12px'}}/>
            
            <Line 
              type="stepAfter" 
              dataKey="pods" 
              name="Active Pods"
              stroke="#0f172a" 
              strokeWidth={2} 
              dot={false}
              isAnimationActive={false}
            />
            <Line 
              type="stepAfter"
              dataKey="desiredReplicasEffective"
              name="Desired (Stabilized)"
              stroke="#94a3b8" 
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 3: Queue Length */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 h-80">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Queue Length vs Time</h3>
        <ResponsiveContainer width="100%" height="90%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis 
              dataKey="t" 
              type="number" 
              domain={['dataMin', 'dataMax']} 
              tick={{fontSize: 12, fill: '#64748b'}}
              label={{ value: 'Seconds', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#64748b' }}
            />
            <YAxis 
              tick={{fontSize: 12, fill: '#64748b'}}
              label={{ value: 'Jobs in Queue', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#64748b' }}
            />
            <Tooltip content={<CustomTooltip />} />
            
            {metricType === 'QueueLength' && (
               <ReferenceLine y={targetMetricValue} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Target', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }} />
            )}

            <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{fontSize: '12px'}}/>

            <Line
              type="monotone"
              dataKey="queueJobs"
              name="Queue Size"
              stroke="#818cf8"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
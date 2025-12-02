export type ScalePolicyType = 'Pods' | 'Percent';
export type SelectPolicy = 'Max' | 'Min' | 'Disabled';
export type MetricType = 'QueueLatency' | 'QueueLength';

export interface ScalePolicy {
  id: string; // unique id for UI list handling
  type: ScalePolicyType;
  value: number;
  periodSeconds: number;
}

export interface ScaleBehavior {
  stabilizationWindowSeconds: number;
  selectPolicy: SelectPolicy;
  policies: ScalePolicy[];
}

export interface SimulatorConfig {
  // Metric Selection
  metricType: MetricType;

  // Workload
  minPods: number;
  maxPods: number;
  startingPods: number;
  initialQueueJobs: number;
  initialMetricValue: number; // Generic start value (e.g. latency)
  processingRatePerPod: number; // jobs/sec/pod
  producingRateTotal: number; // jobs/sec
  
  // Simulation
  simulationSeconds: number;
  targetMetricValue: number; // Generic target (e.g. target latency)
  toleranceFraction: number;

  // Behavior
  scaleUp: ScaleBehavior;
  scaleDown: ScaleBehavior;
}

export interface SimulationPoint {
  t: number;
  pods: number;
  queueJobs: number;
  latency: number; // Physical latency
  metricValue: number; // The computed metric value used for HPA
  processedJobs: number;
  desiredReplicasRaw: number;
  desiredReplicasEffective: number;
  scaleDirection: 'up' | 'down' | 'none';
}

export interface SimulationResult {
  points: SimulationPoint[];
  summary: {
    maxMetricValue: number;
    maxQueueJobs: number;
    finalPods: number;
    finalQueueJobs: number;
    totalScaleUps: number;
    totalScaleDowns: number;
  };
}
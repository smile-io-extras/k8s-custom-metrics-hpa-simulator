import { SimulatorConfig } from './types';

export const HPA_SYNC_PERIOD = 15; // HPA control loop runs every 15s

export const DEFAULT_CONFIG: SimulatorConfig = {
  metricType: 'QueueLatency',
  minPods: 2,
  maxPods: 25,
  startingPods: 10,
  initialQueueJobs: 0,
  initialMetricValue: 0,
  processingRatePerPod: 100,
  producingRateTotal: 1115,
  podStartupDelay: 0,
  
  simulationSeconds: 1800,
  targetMetricValue: 60,
  toleranceFraction: 0.1,

  scaleUp: {
    stabilizationWindowSeconds: 0,
    selectPolicy: 'Max',
    policies: [
      { id: 'default-up-pods', type: 'Pods', value: 2, periodSeconds: 180 },
      { id: 'default-up-percent', type: 'Percent', value: 100, periodSeconds: 180 }
    ]
  },
  scaleDown: {
    stabilizationWindowSeconds: 300,
    selectPolicy: 'Max',
    policies: [
      { id: 'default-down-percent', type: 'Percent', value: 20, periodSeconds: 180 }
    ]
  }
};
import { SimulatorConfig, SimulationResult, SimulationPoint } from './types';

// Helper to get logic specific value based on policy
const getLimitValue = (
  policyType: 'Pods' | 'Percent', 
  policyValue: number, 
  referencePods: number
): number => {
  if (policyType === 'Pods') {
    return policyValue;
  } else {
    return Math.ceil((referencePods * policyValue) / 100);
  }
};

export const runSimulation = (config: SimulatorConfig): SimulationResult => {
  const points: SimulationPoint[] = [];
  
  // 0. Input Sanitization
  const simSeconds = (typeof config.simulationSeconds === 'number' && !isNaN(config.simulationSeconds) && config.simulationSeconds >= 0) 
    ? config.simulationSeconds 
    : 600;
  
  const minPods = (typeof config.minPods === 'number' && !isNaN(config.minPods)) ? Math.max(0, config.minPods) : 1;
  const maxPods = (typeof config.maxPods === 'number' && !isNaN(config.maxPods)) ? Math.max(minPods, config.maxPods) : Math.max(minPods, 20);
  const startingPods = (typeof config.startingPods === 'number' && !isNaN(config.startingPods)) ? Math.max(0, config.startingPods) : 1;
  const targetMetric = (typeof config.targetMetricValue === 'number' && !isNaN(config.targetMetricValue) && config.targetMetricValue > 0) ? config.targetMetricValue : 1;
  const procRate = (typeof config.processingRatePerPod === 'number' && !isNaN(config.processingRatePerPod)) ? config.processingRatePerPod : 1;
  const prodRate = (typeof config.producingRateTotal === 'number' && !isNaN(config.producingRateTotal)) ? config.producingRateTotal : 0;
  const tolerance = (typeof config.toleranceFraction === 'number' && !isNaN(config.toleranceFraction)) ? config.toleranceFraction : 0.1;

  // Initialize state
  let currentPods = startingPods;
  
  // If queue is 0 but metric value is set (and metric is latency), infer queue size
  let currentQueue = (typeof config.initialQueueJobs === 'number' && !isNaN(config.initialQueueJobs)) ? config.initialQueueJobs : 0;
  
  // Infer initial queue based on metric type if specific queue not set
  if (currentQueue === 0 && config.initialMetricValue > 0) {
      if (config.metricType === 'QueueLatency' && currentPods > 0) {
        currentQueue = Math.ceil(config.initialMetricValue * currentPods * procRate);
      } else if (config.metricType === 'QueueLength') {
        currentQueue = Math.ceil(config.initialMetricValue);
      }
  }

  // History for stabilization and policies
  // Maps time (t) to value
  const desiredReplicasHistory: number[] = []; 
  const podHistory: number[] = []; // Stores pod count at each second

  // Pre-fill history for t < 0 to handle initial lookbacks cleanly
  const preFillHistorySize = 3600; 
  for (let i = 0; i < preFillHistorySize; i++) {
    desiredReplicasHistory.push(currentPods);
    podHistory.push(currentPods);
  }
  
  // Accessor helpers
  const getDesiredReplicaAt = (t: number) => {
    const idx = t + preFillHistorySize;
    if (idx < 0) return currentPods; 
    return desiredReplicasHistory[Math.min(idx, desiredReplicasHistory.length - 1)];
  };

  const getPodsAt = (t: number) => {
    const idx = t + preFillHistorySize;
    if (idx < 0) return currentPods;
    return podHistory[Math.min(idx, podHistory.length - 1)];
  };

  let scaleUps = 0;
  let scaleDowns = 0;

  for (let t = 0; t <= simSeconds; t++) {
    // 1. Calculate Physical Stats (Start of Tick)
    const processingCapacity = currentPods * procRate;
    let currentLatency = 0;
    
    if (currentPods > 0 && procRate > 0) {
        currentLatency = currentQueue / processingCapacity;
    } else if (currentQueue > 0) {
        currentLatency = 9999; // Infinite latency
    }

    // 2. Calculate HPA Metric Value
    let currentMetricValue = 0;
    if (config.metricType === 'QueueLatency') {
        currentMetricValue = currentLatency;
    } else if (config.metricType === 'QueueLength') {
        currentMetricValue = currentQueue;
    }

    // 3. Queue Dynamics (Process & Produce)
    const arrivals = prodRate; 
    const processed = Math.min(currentQueue + arrivals, processingCapacity);
    const nextQueue = Math.max(0, currentQueue + arrivals - processed);

    // 4. HPA Core Formula
    let desiredReplicasRaw = currentPods;
    const ratio = currentMetricValue / targetMetric;
    
    // Apply tolerance
    if (Math.abs(ratio - 1.0) > tolerance) {
      desiredReplicasRaw = Math.ceil(currentPods * ratio);
    }

    // Initial clamping
    desiredReplicasRaw = Math.min(Math.max(desiredReplicasRaw, minPods), maxPods);
    
    // Store raw recommendation for stabilization lookback
    desiredReplicasHistory.push(desiredReplicasRaw);

    // 5. Stabilization
    let stabilizedRecommendation = desiredReplicasRaw;

    // Scale Up Stabilization: Min of window
    if (config.scaleUp && config.scaleUp.stabilizationWindowSeconds > 0) {
      let minInWindow = desiredReplicasRaw;
      for (let i = 0; i <= config.scaleUp.stabilizationWindowSeconds; i++) {
        const val = getDesiredReplicaAt(t - i);
        if (val < minInWindow) minInWindow = val;
      }
      if (desiredReplicasRaw > currentPods) {
          stabilizedRecommendation = minInWindow; 
      }
    }

    // Scale Down Stabilization: Max of window
    if (config.scaleDown && config.scaleDown.stabilizationWindowSeconds > 0) {
      let maxInWindow = desiredReplicasRaw;
      for (let i = 0; i <= config.scaleDown.stabilizationWindowSeconds; i++) {
        const val = getDesiredReplicaAt(t - i);
        if (val > maxInWindow) maxInWindow = val;
      }
      if (desiredReplicasRaw < currentPods) {
        stabilizedRecommendation = maxInWindow;
      }
    }

    // 6. Apply Policies
    let desiredReplicasEffective = stabilizedRecommendation;
    let direction: 'up' | 'down' | 'none' = 'none';

    if (stabilizedRecommendation > currentPods) {
      direction = 'up';
    } else if (stabilizedRecommendation < currentPods) {
      direction = 'down';
    }

    if (direction === 'up' && config.scaleUp) {
      const behavior = config.scaleUp;
      if (behavior.selectPolicy === 'Disabled') {
        desiredReplicasEffective = currentPods;
      } else {
        const allowedPods: number[] = [];
        behavior.policies.forEach(policy => {
          const referencePods = getPodsAt(t - policy.periodSeconds);
          const limitAmount = getLimitValue(policy.type, policy.value, referencePods);
          allowedPods.push(referencePods + limitAmount);
        });

        if (allowedPods.length > 0) {
          const limit = behavior.selectPolicy === 'Min' 
            ? Math.min(...allowedPods) 
            : Math.max(...allowedPods);
          desiredReplicasEffective = Math.min(stabilizedRecommendation, limit);
        }
      }
    } else if (direction === 'down' && config.scaleDown) {
      const behavior = config.scaleDown;
      if (behavior.selectPolicy === 'Disabled') {
        desiredReplicasEffective = currentPods;
      } else {
        const allowedPods: number[] = [];
        behavior.policies.forEach(policy => {
            const referencePods = getPodsAt(t - policy.periodSeconds);
            const limitAmount = getLimitValue(policy.type, policy.value, referencePods);
            allowedPods.push(Math.max(0, referencePods - limitAmount));
        });

        if (allowedPods.length > 0) {
           const limit = behavior.selectPolicy === 'Min'
             ? Math.max(...allowedPods) 
             : Math.min(...allowedPods);
           desiredReplicasEffective = Math.max(stabilizedRecommendation, limit);
        }
      }
    }

    // 7. Final Clamping & Update
    desiredReplicasEffective = Math.min(Math.max(desiredReplicasEffective, minPods), maxPods);
    
    if (desiredReplicasEffective > currentPods) scaleUps++;
    if (desiredReplicasEffective < currentPods) scaleDowns++;

    points.push({
      t,
      pods: currentPods,
      queueJobs: currentQueue,
      latency: currentLatency,
      metricValue: currentMetricValue,
      processedJobs: processed,
      desiredReplicasRaw,
      desiredReplicasEffective,
      scaleDirection: direction
    });

    podHistory.push(desiredReplicasEffective);
    currentPods = desiredReplicasEffective;
    currentQueue = nextQueue;
  }

  if (points.length === 0) {
    return {
      points: [],
      summary: {
        maxMetricValue: 0,
        maxQueueJobs: 0,
        finalPods: startingPods,
        finalQueueJobs: 0,
        totalScaleUps: 0,
        totalScaleDowns: 0
      }
    };
  }

  const maxMetric = Math.max(...points.map(p => p.metricValue));
  const maxQueue = Math.max(...points.map(p => p.queueJobs));
  const finalPoint = points[points.length - 1];

  return {
    points,
    summary: {
      maxMetricValue: maxMetric,
      maxQueueJobs: maxQueue,
      finalPods: finalPoint.pods,
      finalQueueJobs: finalPoint.queueJobs,
      totalScaleUps: scaleUps,
      totalScaleDowns: scaleDowns
    }
  };
};
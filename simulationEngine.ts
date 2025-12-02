import { SimulatorConfig, SimulationResult, SimulationPoint } from './types';
import { HPA_SYNC_PERIOD } from './constants';

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
  const simSeconds = Number(config.simulationSeconds) > 0 ? Number(config.simulationSeconds) : 600;
  
  const minPods = Number(config.minPods) >= 0 ? Number(config.minPods) : 1;
  const maxPods = Number(config.maxPods) >= minPods ? Number(config.maxPods) : Math.max(minPods, 20);
  const startingPods = Number(config.startingPods) >= 0 ? Number(config.startingPods) : 1;
  const targetMetric = Number(config.targetMetricValue) > 0 ? Number(config.targetMetricValue) : 1;
  const procRate = Number(config.processingRatePerPod) >= 0 ? Number(config.processingRatePerPod) : 1;
  const prodRate = Number(config.producingRateTotal) >= 0 ? Number(config.producingRateTotal) : 0;
  const tolerance = Number(config.toleranceFraction) >= 0 ? Number(config.toleranceFraction) : 0.1;
  const podDelay = Number(config.podStartupDelay) >= 0 ? Number(config.podStartupDelay) : 0;

  // Initialize state
  let currentPods = startingPods; // Total Replicas
  
  // Logic for ready pods:
  // We assume startingPods are fully ready at t=0
  let readyPods = currentPods;
  
  // Track pods that are starting up. 
  // Each entry represents "seconds remaining until ready" for a batch of pods.
  let pendingPods: number[] = []; 

  // If queue is 0 but metric value is set (and metric is latency), infer queue size
  let currentQueue = Number(config.initialQueueJobs) >= 0 ? Number(config.initialQueueJobs) : 0;
  
  // Infer initial queue based on metric type if specific queue not set
  if (currentQueue === 0 && Number(config.initialMetricValue) > 0) {
      if (config.metricType === 'QueueLatency' && currentPods > 0) {
        currentQueue = Math.ceil(Number(config.initialMetricValue) * currentPods * procRate);
      } else if (config.metricType === 'QueueLength') {
        currentQueue = Math.ceil(Number(config.initialMetricValue));
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

  // Track the last known HPA decisions to persist them between sync intervals
  let lastDesiredReplicasRaw = currentPods;
  let lastDesiredReplicasEffective = currentPods;

  for (let t = 0; t <= simSeconds; t++) {
    // --- CONTINUOUS PHYSICS (Runs every second) ---

    // 0. Update Pod Readiness
    // Decrement delay for pending pods
    pendingPods = pendingPods.map(d => d - 1);
    // Move newly ready pods
    const newlyReadyCount = pendingPods.filter(d => d <= 0).length;
    readyPods += newlyReadyCount;
    // Keep only still pending
    pendingPods = pendingPods.filter(d => d > 0);
    
    // Safety clamp
    readyPods = Math.min(readyPods, currentPods); 

    // 1. Calculate Physical Stats (Start of Tick)
    const processingCapacity = readyPods * procRate;
    let currentLatency = 0;
    
    if (readyPods > 0 && procRate > 0) {
        currentLatency = currentQueue / processingCapacity;
    } else if (currentQueue > 0) {
        currentLatency = 9999; // Infinite latency (stuck queue)
    }

    // 2. Queue Dynamics (Process & Produce)
    const arrivals = prodRate; 
    const processed = Math.min(currentQueue + arrivals, processingCapacity);
    const nextQueue = Math.max(0, currentQueue + arrivals - processed);

    // --- DISCRETE CONTROL (Runs every HPA_SYNC_PERIOD seconds) ---
    
    let currentMetricValue = 0;
    let direction: 'up' | 'down' | 'none' = 'none';

    if (t % HPA_SYNC_PERIOD === 0) {
        // A. Calculate Metric for HPA
        if (config.metricType === 'QueueLatency') {
            currentMetricValue = currentLatency;
        } else if (config.metricType === 'QueueLength') {
            currentMetricValue = currentQueue;
        }

        // B. HPA Core Formula
        let desiredReplicasRaw = currentPods;
        const safeTarget = targetMetric > 0 ? targetMetric : 1;
        const ratio = currentMetricValue / safeTarget;
        
        // Apply tolerance
        if (Math.abs(ratio - 1.0) > tolerance) {
            desiredReplicasRaw = Math.ceil(currentPods * ratio);
        }

        // Initial clamping
        desiredReplicasRaw = Math.min(Math.max(desiredReplicasRaw, minPods), maxPods);
        
        // Update persistent state for non-sync ticks
        lastDesiredReplicasRaw = desiredReplicasRaw;

        // C. Stabilization
        // We push to history below, but we need to read from history now.
        // Important: We haven't pushed the *current* raw value yet. 
        // Logic: look back window starts from *now* (including this raw value usually) or t-1.
        // Standard HPA implementation usually considers the current calculation as part of the window.
        
        let stabilizedRecommendation = desiredReplicasRaw;

        // Scale Up Stabilization: Min of window
        if (config.scaleUp && config.scaleUp.stabilizationWindowSeconds > 0) {
            let minInWindow = desiredReplicasRaw;
            // Check history. 
            for (let i = 1; i <= config.scaleUp.stabilizationWindowSeconds; i++) {
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
            for (let i = 1; i <= config.scaleDown.stabilizationWindowSeconds; i++) {
                const val = getDesiredReplicaAt(t - i);
                if (val > maxInWindow) maxInWindow = val;
            }
            if (desiredReplicasRaw < currentPods) {
                stabilizedRecommendation = maxInWindow;
            }
        }

        // D. Apply Policies
        let desiredReplicasEffective = stabilizedRecommendation;

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

        // E. Final Clamping & Application
        desiredReplicasEffective = Math.min(Math.max(desiredReplicasEffective, minPods), maxPods);
        lastDesiredReplicasEffective = desiredReplicasEffective;

        // Apply changes to Pod counts
        const delta = desiredReplicasEffective - currentPods;

        if (delta > 0) {
            scaleUps++;
            currentPods += delta;
            // Add new pods to pending queue
            for (let i = 0; i < delta; i++) {
                pendingPods.push(podDelay);
            }
        } else if (delta < 0) {
            scaleDowns++;
            currentPods += delta; // delta is negative
            let removeCount = Math.abs(delta);
            
            // Logic: terminate pending pods first, then ready pods.
            while (removeCount > 0 && pendingPods.length > 0) {
                pendingPods.pop();
                removeCount--;
            }
            if (removeCount > 0) {
                readyPods = Math.max(0, readyPods - removeCount);
            }
        }
    } else {
        // In between HPA ticks:
        // Calculate the metric just for visualization, but DO NOT use it for scaling.
         if (config.metricType === 'QueueLatency') {
            currentMetricValue = currentLatency;
        } else if (config.metricType === 'QueueLength') {
            currentMetricValue = currentQueue;
        }
        // Direction is none
        direction = 'none';
        // desiredReplicas logic holds previous values
    }

    // --- RECORD HISTORY & POINT ---

    // History tracks what happened at this second
    desiredReplicasHistory.push(lastDesiredReplicasRaw);
    podHistory.push(currentPods);

    points.push({
      t,
      pods: currentPods,
      readyPods: readyPods,
      queueJobs: currentQueue,
      latency: currentLatency,
      metricValue: currentMetricValue,
      processedJobs: processed,
      desiredReplicasRaw: lastDesiredReplicasRaw,
      desiredReplicasEffective: lastDesiredReplicasEffective,
      scaleDirection: direction
    });

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
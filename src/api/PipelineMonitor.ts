import { K8sClient } from './K8sClient';
import { Pipeline, PipelineEvent, PipelineStatus, EventStatus, PipelineMetrics, PipelineAnalysis, EventType } from '../models/Pipeline';

export class PipelineMonitor {
    private k8sClient: K8sClient;
    private namespace = 'thinkube-control';
    private pipelineCache: Map<string, Pipeline> = new Map();

    constructor(k8sClient: K8sClient) {
        this.k8sClient = k8sClient;
        this.setupWatcher();
    }

    private setupWatcher() {
        // Watch for ConfigMap changes
        this.k8sClient.watchConfigMaps(
            this.namespace,
            'app=cicd-monitor,component=events',
            (type, configMap) => {
                if (type === 'ADDED' || type === 'MODIFIED') {
                    this.updatePipelineFromConfigMap(configMap);
                }
            }
        );
    }

    private updatePipelineFromConfigMap(configMap: any) {
        try {
            if (configMap.data && configMap.data['events.json']) {
                const data = JSON.parse(configMap.data['events.json']);
                const pipeline: Pipeline = {
                    id: data.pipelineId,
                    appName: data.appName,
                    startTime: data.startTime,
                    events: data.events || [],
                    status: this.calculatePipelineStatus(data.events),
                    trigger: data.trigger || { type: 'manual' }
                };
                
                if (pipeline.events.length > 0) {
                    const lastEvent = pipeline.events[pipeline.events.length - 1];
                    if (this.isTerminalEvent(lastEvent.eventType)) {
                        pipeline.endTime = lastEvent.timestamp;
                        pipeline.duration = pipeline.endTime - pipeline.startTime;
                    }
                }
                
                this.pipelineCache.set(pipeline.id, pipeline);
            }
        } catch (error) {
            console.error('Failed to parse pipeline data:', error);
        }
    }

    private calculatePipelineStatus(events: PipelineEvent[]): PipelineStatus {
        if (events.length === 0) return PipelineStatus.Pending;
        
        const lastEvent = events[events.length - 1];
        
        // Check for failures
        if (events.some(e => e.status === EventStatus.Failed)) {
            return PipelineStatus.Failed;
        }
        
        // Check if complete
        if (lastEvent.eventType === EventType.DEPLOY_COMPLETE) {
            return PipelineStatus.Success;
        }
        
        // Still running
        return PipelineStatus.Running;
    }

    private isTerminalEvent(eventType: EventType): boolean {
        return [
            EventType.DEPLOY_COMPLETE,
            EventType.DEPLOY_TIMEOUT,
            EventType.WORKFLOW_FAILED,
            EventType.BUILD_FAILED,
            EventType.SYNC_FAILED
        ].includes(eventType);
    }

    async getActivePipelines(): Promise<Pipeline[]> {
        // Get ConfigMaps from Kubernetes
        const configMaps = await this.k8sClient.getConfigMaps(
            this.namespace,
            'app=cicd-monitor,component=events,rotation=active'
        );
        
        // Parse and update cache
        for (const cm of configMaps) {
            this.updatePipelineFromConfigMap(cm);
        }
        
        // Return active pipelines
        return Array.from(this.pipelineCache.values())
            .filter(p => p.status === PipelineStatus.Running || p.status === PipelineStatus.Pending)
            .sort((a, b) => b.startTime - a.startTime);
    }

    async getRecentPipelines(limit: number = 20): Promise<Pipeline[]> {
        // Get both active and archived ConfigMaps
        const activeConfigMaps = await this.k8sClient.getConfigMaps(
            this.namespace,
            'app=cicd-monitor,component=events,rotation=active'
        );
        
        const archivedConfigMaps = await this.k8sClient.getConfigMaps(
            this.namespace,
            'app=cicd-monitor,component=events,rotation=archived'
        );
        
        // Parse all
        for (const cm of [...activeConfigMaps, ...archivedConfigMaps]) {
            this.updatePipelineFromConfigMap(cm);
        }
        
        // Return sorted by start time
        return Array.from(this.pipelineCache.values())
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, limit);
    }

    async getPipeline(pipelineId: string): Promise<Pipeline | null> {
        // Check cache first
        if (this.pipelineCache.has(pipelineId)) {
            return this.pipelineCache.get(pipelineId) || null;
        }
        
        // Try to find in ConfigMaps
        const configMaps = await this.k8sClient.getConfigMaps(
            this.namespace,
            `app=cicd-monitor,component=events,pipeline=${pipelineId}`
        );
        
        if (configMaps.length > 0) {
            this.updatePipelineFromConfigMap(configMaps[0]);
            return this.pipelineCache.get(pipelineId) || null;
        }
        
        return null;
    }

    async getApplications(): Promise<string[]> {
        const pipelines = await this.getRecentPipelines(100);
        const apps = new Set<string>();
        
        pipelines.forEach(p => apps.add(p.appName));
        
        return Array.from(apps).sort();
    }

    async getMetrics(appName: string, period: string = '7d'): Promise<PipelineMetrics> {
        // Get pipelines for the app
        const allPipelines = await this.getRecentPipelines(1000);
        const appPipelines = allPipelines.filter(p => p.appName === appName);
        
        // Calculate metrics
        const totalPipelines = appPipelines.length;
        const successfulPipelines = appPipelines.filter(p => p.status === PipelineStatus.Success).length;
        const successRate = totalPipelines > 0 ? (successfulPipelines / totalPipelines) * 100 : 0;
        
        const durations = appPipelines
            .filter(p => p.duration)
            .map(p => p.duration || 0);
        const averageDuration = durations.length > 0 
            ? durations.reduce((a, b) => a + b, 0) / durations.length 
            : 0;
        
        // Count failure reasons
        const failureReasons: { [key: string]: number } = {};
        appPipelines
            .filter(p => p.status === PipelineStatus.Failed)
            .forEach(p => {
                const failedEvent = p.events.find(e => e.status === EventStatus.Failed);
                if (failedEvent) {
                    const reason = failedEvent.error || failedEvent.eventType;
                    failureReasons[reason] = (failureReasons[reason] || 0) + 1;
                }
            });
        
        return {
            appName,
            period,
            totalPipelines,
            successRate,
            averageDuration,
            failureReasons,
            deploymentFrequency: totalPipelines // Simplified for now
        };
    }

    async analyzePipeline(pipelineId: string): Promise<PipelineAnalysis | null> {
        const pipeline = await this.getPipeline(pipelineId);
        if (!pipeline) return null;
        
        const analysis: PipelineAnalysis = {
            pipelineId,
            summary: '',
            bottlenecks: [],
            failures: [],
            suggestions: [],
            performanceScore: 100
        };
        
        // Analyze event durations
        const eventDurations: { [key: string]: number } = {};
        for (let i = 1; i < pipeline.events.length; i++) {
            const duration = pipeline.events[i].timestamp - pipeline.events[i - 1].timestamp;
            const stage = pipeline.events[i - 1].eventType;
            eventDurations[stage] = duration;
        }
        
        // Find bottlenecks (stages taking more than 2 minutes)
        Object.entries(eventDurations).forEach(([stage, duration]) => {
            if (duration > 120000) { // 2 minutes
                analysis.bottlenecks.push({
                    stage,
                    duration,
                    issue: `Stage took ${Math.round(duration / 1000)}s`,
                    impact: duration > 300000 ? 'high' : 'medium'
                });
                analysis.performanceScore -= 10;
            }
        });
        
        // Analyze failures
        pipeline.events
            .filter(e => e.status === EventStatus.Failed)
            .forEach(event => {
                analysis.failures.push({
                    stage: event.eventType,
                    duration: event.duration || 0,
                    issue: event.error || 'Unknown error',
                    impact: 'high'
                });
                analysis.performanceScore -= 20;
            });
        
        // Generate suggestions
        if (analysis.bottlenecks.length > 0) {
            analysis.suggestions.push('Consider optimizing slow stages or parallelizing work');
        }
        
        if (analysis.failures.length > 0) {
            analysis.suggestions.push('Address failing stages to improve reliability');
        }
        
        // Generate summary
        if (pipeline.status === PipelineStatus.Success) {
            analysis.summary = `Pipeline completed successfully in ${Math.round((pipeline.duration || 0) / 1000)}s`;
        } else if (pipeline.status === PipelineStatus.Failed) {
            analysis.summary = `Pipeline failed at ${analysis.failures[0]?.stage || 'unknown stage'}`;
        } else {
            analysis.summary = 'Pipeline is still running';
        }
        
        return analysis;
    }

    async addEvent(event: PipelineEvent): Promise<void> {
        const pipeline = await this.getPipeline(event.pipelineId);
        if (pipeline) {
            pipeline.events.push(event);
            pipeline.status = this.calculatePipelineStatus(pipeline.events);
            
            if (this.isTerminalEvent(event.eventType)) {
                pipeline.endTime = event.timestamp;
                pipeline.duration = pipeline.endTime - pipeline.startTime;
            }
            
            this.pipelineCache.set(pipeline.id, pipeline);
        }
    }
}
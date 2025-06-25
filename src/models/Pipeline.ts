export interface Pipeline {
    id: string;
    appName: string;
    startTime: number;
    endTime?: number;
    status: PipelineStatus;
    stages: PipelineStage[];
    events: PipelineEvent[];
    trigger: PipelineTrigger;
    duration?: number;
    stageCount?: number;
}

export enum PipelineStatus {
    Pending = 'pending',
    Running = 'running',
    Succeeded = 'succeeded',
    Failed = 'failed',
    Cancelled = 'cancelled'
}

export interface PipelineStage {
    id: string;
    stageName: string;
    component: string;
    status: StageStatus;
    startedAt: number;
    completedAt?: number;
    errorMessage?: string;
    details: any;
    duration?: number;
}

export enum StageStatus {
    Pending = 'pending',
    Running = 'running',
    Succeeded = 'succeeded',
    Failed = 'failed',
    Skipped = 'skipped'
}

export interface PipelineEvent {
    id: string;
    pipelineId: string;
    timestamp: number;
    eventType: string;
    stageId?: string;
    details: any;
}

export enum EventType {
    // Git events
    GIT_PUSH = 'GIT_PUSH',
    WEBHOOK_RECEIVED = 'WEBHOOK_RECEIVED',
    
    // Workflow events
    WORKFLOW_START = 'WORKFLOW_START',
    WORKFLOW_COMPLETE = 'WORKFLOW_COMPLETE',
    WORKFLOW_FAILED = 'WORKFLOW_FAILED',
    
    // Build events
    BUILD_START = 'BUILD_START',
    BUILD_COMPLETE = 'BUILD_COMPLETE',
    BUILD_FAILED = 'BUILD_FAILED',
    BUILD_TIMEOUT = 'BUILD_TIMEOUT',
    
    // Registry events
    IMAGE_PUSH = 'IMAGE_PUSH',
    IMAGE_PUSH_FAILED = 'IMAGE_PUSH_FAILED',
    HARBOR_WEBHOOK = 'HARBOR_WEBHOOK',
    
    // Image Updater events
    UPDATER_CHECK = 'UPDATER_CHECK',
    UPDATER_COMMIT = 'UPDATER_COMMIT',
    UPDATER_SKIP = 'UPDATER_SKIP',
    
    // ArgoCD events
    ARGOCD_WEBHOOK = 'ARGOCD_WEBHOOK',
    ARGOCD_SYNC = 'ARGOCD_SYNC',
    SYNC_FAILED = 'SYNC_FAILED',
    
    // Deployment events
    DEPLOY_START = 'DEPLOY_START',
    DEPLOY_COMPLETE = 'DEPLOY_COMPLETE',
    DEPLOY_TIMEOUT = 'DEPLOY_TIMEOUT',
    POD_CRASHLOOP = 'POD_CRASHLOOP',
    
    // Error events
    WEBHOOK_TIMEOUT = 'WEBHOOK_TIMEOUT',
    RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
    GIT_CONFLICT = 'GIT_CONFLICT',
    HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED'
}


export interface PipelineTrigger {
    type: 'manual' | 'git_push' | 'scheduled' | 'api';
    user?: string;
    branch?: string;
    commit?: string;
    message?: string;
}

export interface PipelineMetrics {
    appName: string;
    period: string;
    totalPipelines: number;
    successRate: number;
    averageDuration: number;
    failureReasons: { [key: string]: number };
    deploymentFrequency: number;
}

export interface PipelineAnalysis {
    pipelineId: string;
    summary: string;
    bottlenecks: AnalysisItem[];
    failures: AnalysisItem[];
    suggestions: string[];
    performanceScore: number;
}

export interface AnalysisItem {
    stage: string;
    duration: number;
    issue: string;
    impact: 'high' | 'medium' | 'low';
}
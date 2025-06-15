export interface Pipeline {
    id: string;
    appName: string;
    startTime: number;
    endTime?: number;
    status: PipelineStatus;
    events: PipelineEvent[];
    trigger: PipelineTrigger;
    duration?: number;
}

export enum PipelineStatus {
    Running = 'running',
    Success = 'success',
    Failed = 'failed',
    Cancelled = 'cancelled',
    Pending = 'pending'
}

export interface PipelineEvent {
    id: string;
    timestamp: number;
    eventType: EventType;
    component: string;
    pipelineId: string;
    appName: string;
    details: any;
    duration?: number;
    status: EventStatus;
    parentEventId?: string;
    error?: string;
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

export enum EventStatus {
    Success = 'success',
    Failed = 'failed',
    Warning = 'warning',
    Info = 'info',
    InProgress = 'in_progress'
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
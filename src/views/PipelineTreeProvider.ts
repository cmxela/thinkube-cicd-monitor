import * as vscode from 'vscode';
import * as path from 'path';
import { EventEmitter } from 'events';
import { Pipeline, PipelineStatus, PipelineStage, StageStatus, EventType } from '../models/Pipeline';
import { ControlHubAPI } from '../api/ControlHubAPI';

type TreeNode = PipelineItem | StageItem | LoadingItem;

export class PipelineTreeProvider extends EventEmitter implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | null | void> = new vscode.EventEmitter<TreeNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private pipelines: Pipeline[] = [];
    private visible = false;
    private expandedPipelines = new Set<string>();
    private loading = true;
    private pipelineCache = new Map<string, Pipeline>();

    constructor(private controlHubAPI: ControlHubAPI) {
        super();
        this.refresh();
        
        // Track which tree items are expanded
        vscode.commands.registerCommand('thinkube-cicd.trackExpanded', (pipelineId: string) => {
            this.expandedPipelines.add(pipelineId);
            this.emit('pipelineExpanded', pipelineId);
        });
    }

    refresh(): void {
        this.loadPipelines();
        this._onDidChangeTreeData.fire();
    }

    isVisible(): boolean {
        return this.visible;
    }

    setVisible(visible: boolean): void {
        this.visible = visible;
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TreeNode): Thenable<TreeNode[]> {
        if (!element) {
            // Root level - show loading or pipelines
            if (this.loading) {
                return Promise.resolve([new LoadingItem()]);
            }
            
            // Show pipelines with proper collapsible state
            return Promise.resolve(
                this.pipelines.map(pipeline => {
                    // Check if pipeline has stages (using stageCount from list response)
                    const hasStages = (pipeline.stageCount && pipeline.stageCount > 0) || 
                                    (pipeline.stages && pipeline.stages.length > 0);
                    return new PipelineItem(
                        pipeline,
                        hasStages ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
                    );
                })
            );
        } else if (element instanceof PipelineItem) {
            // Lazy load full pipeline details if not cached
            return this.loadPipelineStages(element);
        } else {
            // StageItem or LoadingItem has no children
            return Promise.resolve([]);
        }
    }

    private async loadPipelineStages(element: PipelineItem): Promise<TreeNode[]> {
        const pipelineId = element.pipeline.id;
        
        // Track that this pipeline is expanded
        if (!this.expandedPipelines.has(pipelineId)) {
            this.expandedPipelines.add(pipelineId);
            this.emit('pipelineExpanded', pipelineId);
        }
        
        // Check cache first
        let fullPipeline = this.pipelineCache.get(pipelineId);
        
        // If not cached or doesn't have stages, fetch from API
        if (!fullPipeline || !fullPipeline.stages) {
            try {
                const pipelineDetails = await this.controlHubAPI.getPipeline(pipelineId);
                if (pipelineDetails) {
                    fullPipeline = pipelineDetails;
                    this.pipelineCache.set(pipelineId, fullPipeline);
                }
            } catch (error) {
                console.error('Failed to load pipeline details:', error);
                return [];
            }
        }
        
        // Return stages if available
        if (fullPipeline && fullPipeline.stages) {
            return this.getStages(fullPipeline);
        }
        
        return [];
    }

    private async loadPipelines() {
        this.loading = true;
        this._onDidChangeTreeData.fire();
        
        try {
            this.pipelines = await this.controlHubAPI.listPipelines(undefined, undefined, 20);
        } catch (error) {
            console.error('Failed to load pipelines:', error);
            this.pipelines = [];
        } finally {
            this.loading = false;
            this._onDidChangeTreeData.fire();
        }
    }

    private getStages(pipeline: Pipeline): StageItem[] {
        const stages: StageItem[] = [];

        // Use actual stages from the pipeline
        pipeline.stages.forEach(stage => {
            const duration = stage.duration || 
                (stage.completedAt && stage.startedAt ? 
                    (stage.completedAt - stage.startedAt) * 1000 : 0);

            stages.push(new StageItem(
                stage.stageName, 
                stage.status, 
                duration, 
                pipeline.id,
                stage.id
            ));
        });

        return stages;
    }

    private getEventStage(eventType: EventType): string {
        const stageMap: { [key: string]: string } = {
            [EventType.GIT_PUSH]: 'Source',
            [EventType.WEBHOOK_RECEIVED]: 'Source',
            [EventType.WORKFLOW_START]: 'Workflow',
            [EventType.WORKFLOW_COMPLETE]: 'Workflow',
            [EventType.WORKFLOW_FAILED]: 'Workflow',
            [EventType.BUILD_START]: 'Build',
            [EventType.BUILD_COMPLETE]: 'Build',
            [EventType.BUILD_FAILED]: 'Build',
            [EventType.IMAGE_PUSH]: 'Registry',
            [EventType.IMAGE_PUSH_FAILED]: 'Registry',
            [EventType.HARBOR_WEBHOOK]: 'Registry',
            [EventType.UPDATER_CHECK]: 'Image Update',
            [EventType.UPDATER_COMMIT]: 'Image Update',
            [EventType.ARGOCD_WEBHOOK]: 'ArgoCD',
            [EventType.ARGOCD_SYNC]: 'ArgoCD',
            [EventType.SYNC_FAILED]: 'ArgoCD',
            [EventType.DEPLOY_START]: 'Deploy',
            [EventType.DEPLOY_COMPLETE]: 'Deploy',
            [EventType.DEPLOY_TIMEOUT]: 'Deploy'
        };

        return stageMap[eventType] || 'Unknown';
    }
}

export class PipelineItem extends vscode.TreeItem {
    constructor(
        public readonly pipeline: Pipeline,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(pipeline.appName, collapsibleState);
        
        this.description = this.getDescription();
        this.tooltip = this.getTooltip();
        this.iconPath = this.getIcon();
        this.contextValue = 'pipeline';
        
        // Set command to show pipeline details
        this.command = {
            command: 'thinkube-cicd.showPipeline',
            title: 'Show Pipeline',
            arguments: [pipeline.id]
        };
    }

    private getDescription(): string {
        const duration = this.pipeline.duration 
            ? `${Math.round(this.pipeline.duration / 1000)}s` 
            : 'Running';
        
        const time = new Date(this.pipeline.startTime * 1000).toLocaleTimeString();
        
        return `${this.pipeline.status} - ${duration} - ${time}`;
    }

    private getTooltip(): string {
        const trigger = this.pipeline.trigger;
        let triggerInfo = `Trigger: ${trigger.type}`;
        
        if (trigger.user) triggerInfo += ` by ${trigger.user}`;
        if (trigger.branch) triggerInfo += ` on ${trigger.branch}`;
        
        return `${this.pipeline.appName}\n` +
            `Status: ${this.pipeline.status}\n` +
            `${triggerInfo}\n` +
            `Started: ${new Date(this.pipeline.startTime * 1000).toLocaleString()}`;
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.pipeline.status) {
            case PipelineStatus.Succeeded:
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
            case PipelineStatus.Failed:
                return new vscode.ThemeIcon('x', new vscode.ThemeColor('testing.iconFailed'));
            case PipelineStatus.Running:
                return new vscode.ThemeIcon('sync~spin');
            case PipelineStatus.Cancelled:
                return new vscode.ThemeIcon('circle-slash');
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }
}

class StageItem extends vscode.TreeItem {
    constructor(
        public readonly stage: string,
        public readonly status: string,
        public readonly duration: number,
        public readonly pipelineId: string,
        public readonly stageId: string
    ) {
        super(stage, vscode.TreeItemCollapsibleState.None);
        
        this.description = `${Math.round(duration / 1000)}s`;
        this.tooltip = `${stage}: ${status} (${Math.round(duration / 1000)}s)`;
        this.iconPath = this.getIcon();
        this.contextValue = 'stage';
    }

    private getIcon(): vscode.ThemeIcon {
        if (this.status === 'succeeded') {
            return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        } else if (this.status === 'failed') {
            return new vscode.ThemeIcon('x', new vscode.ThemeColor('testing.iconFailed'));
        } else if (this.status === 'running') {
            return new vscode.ThemeIcon('sync~spin');
        } else {
            return new vscode.ThemeIcon('circle-outline');
        }
    }
}

class LoadingItem extends vscode.TreeItem {
    constructor() {
        super('Loading pipelines...', vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('sync~spin');
        this.contextValue = 'loading';
    }
}
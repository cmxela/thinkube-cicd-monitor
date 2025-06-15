import * as vscode from 'vscode';
import * as path from 'path';
import { Pipeline, PipelineStatus, EventType } from '../models/Pipeline';
import { PipelineMonitor } from '../api/PipelineMonitor';

export class PipelineTreeProvider implements vscode.TreeDataProvider<PipelineItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<PipelineItem | undefined | null | void> = new vscode.EventEmitter<PipelineItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<PipelineItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private pipelines: Pipeline[] = [];
    private visible = false;

    constructor(private pipelineMonitor: PipelineMonitor) {
        this.refresh();
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

    getTreeItem(element: PipelineItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: PipelineItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            // Root level - show pipelines
            return Promise.resolve(
                this.pipelines.map(pipeline => new PipelineItem(pipeline))
            );
        } else {
            // Show pipeline stages
            return Promise.resolve(this.getStages(element.pipeline));
        }
    }

    private async loadPipelines() {
        try {
            this.pipelines = await this.pipelineMonitor.getRecentPipelines(20);
        } catch (error) {
            console.error('Failed to load pipelines:', error);
            this.pipelines = [];
        }
    }

    private getStages(pipeline: Pipeline): PipelineItem[] {
        const stages: PipelineItem[] = [];
        const stageGroups = new Map<string, Pipeline['events']>();

        // Group events by stage
        pipeline.events.forEach(event => {
            const stage = this.getEventStage(event.eventType);
            if (!stageGroups.has(stage)) {
                stageGroups.set(stage, []);
            }
            stageGroups.get(stage)!.push(event);
        });

        // Create stage items
        stageGroups.forEach((events, stage) => {
            const lastEvent = events[events.length - 1];
            const duration = events.length > 1 
                ? events[events.length - 1].timestamp - events[0].timestamp 
                : 0;

            stages.push(new StageItem(stage, lastEvent.status, duration, pipeline.id));
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
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
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
            case PipelineStatus.Success:
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
        public readonly pipelineId: string
    ) {
        super(stage, vscode.TreeItemCollapsibleState.None);
        
        this.description = `${Math.round(duration / 1000)}s`;
        this.tooltip = `${stage}: ${status} (${Math.round(duration / 1000)}s)`;
        this.iconPath = this.getIcon();
        this.contextValue = 'stage';
    }

    private getIcon(): vscode.ThemeIcon {
        if (this.status === 'success') {
            return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        } else if (this.status === 'failed') {
            return new vscode.ThemeIcon('x', new vscode.ThemeColor('testing.iconFailed'));
        } else if (this.status === 'in_progress') {
            return new vscode.ThemeIcon('sync~spin');
        } else {
            return new vscode.ThemeIcon('circle-outline');
        }
    }
}
import * as vscode from 'vscode';
import { PipelineEvent, EventType } from '../models/Pipeline';
import { ControlHubAPI } from '../api/ControlHubAPI';

export class EventsTreeProvider implements vscode.TreeDataProvider<EventItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<EventItem | undefined | null | void> = new vscode.EventEmitter<EventItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<EventItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private events: PipelineEvent[] = [];
    private maxEvents = 50;

    constructor(private controlHubAPI: ControlHubAPI) {
        this.refresh();
    }

    refresh(): void {
        this.loadRecentEvents();
        this._onDidChangeTreeData.fire();
    }

    addEvent(event: PipelineEvent): void {
        this.events.unshift(event);
        if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(0, this.maxEvents);
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: EventItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: EventItem): Thenable<EventItem[]> {
        if (!element) {
            return Promise.resolve(
                this.events.map(event => new EventItem(event))
            );
        }
        return Promise.resolve([]);
    }

    private async loadRecentEvents() {
        try {
            const pipelines = await this.controlHubAPI.listPipelines(undefined, undefined, 10);
            this.events = [];
            
            // Extract recent events from pipelines
            pipelines.forEach(pipeline => {
                if (pipeline.events.length > 0) {
                    // Add the most recent event from each pipeline
                    this.events.push(pipeline.events[pipeline.events.length - 1]);
                }
            });
            
            // Sort by timestamp descending
            this.events.sort((a, b) => b.timestamp - a.timestamp);
            this.events = this.events.slice(0, this.maxEvents);
        } catch (error) {
            console.error('Failed to load recent events:', error);
            this.events = [];
        }
    }
}

export class EventItem extends vscode.TreeItem {
    constructor(
        public readonly event: PipelineEvent
    ) {
        super(event.eventType, vscode.TreeItemCollapsibleState.None);
        
        this.description = this.getDescription();
        this.tooltip = this.getTooltip();
        this.iconPath = this.getIcon();
        this.contextValue = 'event';
        
        // Command to show pipeline
        this.command = {
            command: 'thinkube-cicd.showPipeline',
            title: 'Show Pipeline',
            arguments: [event.pipelineId]
        };
    }

    private getDescription(): string {
        const time = new Date(this.event.timestamp * 1000).toLocaleTimeString();
        return time;
    }

    private getTooltip(): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        
        tooltip.appendMarkdown(`**${this.event.eventType}**\n\n`);
        tooltip.appendMarkdown(`Time: ${new Date(this.event.timestamp * 1000).toLocaleString()}\n\n`);
        
        if (this.event.details) {
            tooltip.appendMarkdown(`Details:\n`);
            tooltip.appendCodeblock(JSON.stringify(this.event.details, null, 2), 'json');
        }
        
        return tooltip;
    }

    private getIcon(): vscode.ThemeIcon {
        // Icon based on event type
        if (this.event.eventType.includes('failed') || this.event.eventType.includes('error')) {
            return new vscode.ThemeIcon('x', new vscode.ThemeColor('testing.iconFailed'));
        } else if (this.event.eventType.includes('started')) {
            return new vscode.ThemeIcon('play');
        } else if (this.event.eventType.includes('completed') || this.event.eventType.includes('succeeded')) {
            return new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        } else if (this.event.eventType.includes('webhook')) {
            return new vscode.ThemeIcon('webhook');
        }
        return new vscode.ThemeIcon('circle-filled');
    }
}
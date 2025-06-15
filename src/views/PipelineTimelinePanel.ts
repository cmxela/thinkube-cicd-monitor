import * as vscode from 'vscode';
import { Pipeline, PipelineEvent, EventType } from '../models/Pipeline';

export class PipelineTimelinePanel {
    public static currentPanel: PipelineTimelinePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static render(extensionUri: vscode.Uri, pipeline: Pipeline) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (PipelineTimelinePanel.currentPanel) {
            PipelineTimelinePanel.currentPanel._panel.reveal(column);
            PipelineTimelinePanel.currentPanel._update(pipeline);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'pipelineTimeline',
            `Pipeline: ${pipeline.appName}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        PipelineTimelinePanel.currentPanel = new PipelineTimelinePanel(panel, extensionUri);
        PipelineTimelinePanel.currentPanel._update(pipeline);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    }

    public dispose() {
        PipelineTimelinePanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(pipeline: Pipeline) {
        this._panel.title = `Pipeline: ${pipeline.appName}`;
        this._panel.webview.html = this._getHtmlForWebview(pipeline);
    }

    private _getHtmlForWebview(pipeline: Pipeline) {
        const styleUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'timeline.css')
        );

        // Calculate timeline data
        const timelineData = this._calculateTimelineData(pipeline);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pipeline Timeline</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .header {
            margin-bottom: 30px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .status {
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: normal;
        }
        .status.success {
            background-color: var(--vscode-testing-iconPassed);
            color: white;
        }
        .status.failed {
            background-color: var(--vscode-testing-iconFailed);
            color: white;
        }
        .status.running {
            background-color: var(--vscode-progressBar-background);
            color: white;
        }
        .metadata {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }
        .timeline {
            position: relative;
            margin: 40px 0;
        }
        .timeline-bar {
            height: 40px;
            background-color: var(--vscode-editor-lineHighlightBackground);
            border-radius: 4px;
            position: relative;
            overflow: hidden;
        }
        .timeline-segment {
            position: absolute;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            transition: all 0.3s ease;
            cursor: pointer;
        }
        .timeline-segment:hover {
            filter: brightness(1.2);
        }
        .timeline-segment.success {
            background-color: #4caf50;
        }
        .timeline-segment.failed {
            background-color: #f44336;
        }
        .timeline-segment.warning {
            background-color: #ff9800;
        }
        .timeline-segment.info {
            background-color: #2196f3;
        }
        .timeline-segment.in-progress {
            background-color: #9c27b0;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.7; }
            100% { opacity: 1; }
        }
        .event-details {
            margin-top: 30px;
            border-top: 1px solid var(--vscode-widget-border);
            padding-top: 20px;
        }
        .event-item {
            padding: 10px;
            margin-bottom: 10px;
            background-color: var(--vscode-editor-lineHighlightBackground);
            border-radius: 4px;
            cursor: pointer;
        }
        .event-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .event-time {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        .event-details-panel {
            margin-top: 10px;
            padding: 10px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            display: none;
        }
        .event-details-panel.show {
            display: block;
        }
        pre {
            margin: 0;
            white-space: pre-wrap;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>
            ${pipeline.appName}
            <span class="status ${pipeline.status}">${pipeline.status.toUpperCase()}</span>
        </h1>
        <div class="metadata">
            <div>Started: ${new Date(pipeline.startTime * 1000).toLocaleString()}</div>
            ${pipeline.endTime ? `<div>Ended: ${new Date(pipeline.endTime * 1000).toLocaleString()}</div>` : ''}
            ${pipeline.duration ? `<div>Duration: ${Math.round(pipeline.duration / 1000)}s</div>` : ''}
            <div>Trigger: ${pipeline.trigger.type}${pipeline.trigger.user ? ` by ${pipeline.trigger.user}` : ''}</div>
        </div>
    </div>

    <div class="timeline">
        <div class="timeline-bar">
            ${timelineData.segments.map(seg => `
                <div class="timeline-segment ${seg.status}" 
                     style="left: ${seg.left}%; width: ${seg.width}%;"
                     title="${seg.label}: ${seg.duration}ms"
                     onclick="scrollToEvent('${seg.eventId}')">
                    ${seg.label}
                </div>
            `).join('')}
        </div>
    </div>

    <div class="event-details">
        <h2>Event Details</h2>
        ${pipeline.events.map((event, index) => `
            <div class="event-item" id="event-${event.id}" onclick="toggleDetails('${event.id}')">
                <div style="display: flex; justify-content: space-between;">
                    <strong>${event.eventType}</strong>
                    <span class="event-time">${new Date(event.timestamp * 1000).toLocaleTimeString()}</span>
                </div>
                <div>Component: ${event.component} | Status: ${event.status}</div>
                ${event.error ? `<div style="color: var(--vscode-errorForeground);">Error: ${event.error}</div>` : ''}
                <div class="event-details-panel" id="details-${event.id}">
                    <pre>${JSON.stringify(event.details || {}, null, 2)}</pre>
                </div>
            </div>
        `).join('')}
    </div>

    <script>
        function toggleDetails(eventId) {
            const panel = document.getElementById('details-' + eventId);
            panel.classList.toggle('show');
        }

        function scrollToEvent(eventId) {
            const element = document.getElementById('event-' + eventId);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.style.backgroundColor = 'var(--vscode-list-activeSelectionBackground)';
                setTimeout(() => {
                    element.style.backgroundColor = '';
                }, 2000);
            }
        }
    </script>
</body>
</html>`;
    }

    private _calculateTimelineData(pipeline: Pipeline) {
        if (pipeline.events.length === 0) {
            return { segments: [] };
        }

        const startTime = pipeline.startTime * 1000;
        const endTime = pipeline.endTime ? pipeline.endTime * 1000 : Date.now();
        const totalDuration = endTime - startTime;

        const segments: any[] = [];
        const stages = new Map<string, { start: number, end: number, status: string, events: PipelineEvent[] }>();

        // Group events by stage
        pipeline.events.forEach((event, index) => {
            const stage = this._getEventStage(event.eventType);
            
            if (!stages.has(stage)) {
                stages.set(stage, {
                    start: event.timestamp * 1000,
                    end: event.timestamp * 1000,
                    status: event.status,
                    events: [event]
                });
            } else {
                const stageData = stages.get(stage)!;
                stageData.end = event.timestamp * 1000;
                stageData.status = event.status;
                stageData.events.push(event);
            }
        });

        // Create segments
        stages.forEach((stageData, stage) => {
            const left = ((stageData.start - startTime) / totalDuration) * 100;
            const width = ((stageData.end - stageData.start) / totalDuration) * 100 || 1;
            
            segments.push({
                label: stage,
                left: Math.max(0, left),
                width: Math.max(1, width),
                duration: stageData.end - stageData.start,
                status: stageData.status,
                eventId: stageData.events[0].id
            });
        });

        return { segments };
    }

    private _getEventStage(eventType: EventType): string {
        const stageMap: { [key: string]: string } = {
            [EventType.GIT_PUSH]: 'Source',
            [EventType.WEBHOOK_RECEIVED]: 'Webhook',
            [EventType.WORKFLOW_START]: 'Workflow',
            [EventType.BUILD_START]: 'Build',
            [EventType.BUILD_COMPLETE]: 'Build',
            [EventType.IMAGE_PUSH]: 'Registry',
            [EventType.UPDATER_CHECK]: 'Update',
            [EventType.ARGOCD_SYNC]: 'Sync',
            [EventType.DEPLOY_START]: 'Deploy',
            [EventType.DEPLOY_COMPLETE]: 'Deploy'
        };

        for (const [type, stage] of Object.entries(stageMap)) {
            if (eventType.includes(type as any)) {
                return stage;
            }
        }

        return 'Other';
    }
}
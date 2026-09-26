"use client";

import { useState } from "react";
import { Lightbulb, RefreshCw, Sparkles } from "lucide-react";
import { createFromIdeaAction, insightsAction, syncMetricsAction } from "@/app/actions";
import { ActionButton } from "@/components/action-button";
import { Card } from "@/components/ui";
import type { Insights as InsightsT } from "@/lib/ai/agents";

export function AnalyticsActions() {
  return (
    <ActionButton action={() => syncMetricsAction()} success={(n) => `Fetched metrics for ${n ?? 0} posts`}>
      <RefreshCw size={16} /> Sync metrics
    </ActionButton>
  );
}

export function Insights({ initial, at, enabled }: { initial: InsightsT | null; at: string | null; enabled: boolean }) {
  const [ins, setIns] = useState(initial);
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Lightbulb size={18} /> AI Analytics Agent
          </h2>
          <p className="text-xs text-muted">Analyses only your real, fetched metrics.{at ? ` Last run ${new Date(at).toLocaleString()}.` : ""}</p>
        </div>
        <ActionButton variant="primary" disabled={!enabled} action={() => insightsAction()} onDone={(r) => r.ok && r.data && setIns(r.data)}>
          <Sparkles size={16} /> Analyse performance
        </ActionButton>
      </div>
      {!ins ? (
        <p className="text-sm text-muted">{enabled ? "Run the analysis to find patterns and new content ideas." : "Available once metrics exist and AI is configured."}</p>
      ) : (
        <div className="space-y-4 text-sm">
          <p>{ins.summary}</p>
          <div>
            <h3 className="mb-1 font-semibold">Findings</h3>
            <ul className="list-disc space-y-1 pl-5">{ins.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </div>
          <div>
            <h3 className="mb-1 font-semibold">Recommendations</h3>
            <ul className="list-disc space-y-1 pl-5">{ins.recommendations.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">New content ideas</h3>
            <ul className="grid gap-2 md:grid-cols-2">
              {ins.ideas.map((idea, i) => (
                <li key={i} className="rounded-xl border border-border p-3">
                  <p className="font-medium">{idea.topic}</p>
                  <p className="text-xs text-muted">{idea.category} · {idea.contentType}</p>
                  <p className="mt-1 text-xs">{idea.why}</p>
                  <ActionButton size="sm" className="mt-2" action={() => createFromIdeaAction(idea.topic, idea.category, idea.contentType)} success="Created — waiting for your approval">
                    Create this
                  </ActionButton>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * TI-010 work-queue sync: insights → GitHub issues (weave0/goodflippindesign) → work-queue JSON.
 *
 * Usage:
 *   GITHUB_TOKEN=… npm run sync:work -- --insights path/to/traffic-insights.json --out path/to/ti-work-queue-1.0.json
 *
 * Env:
 *   GITHUB_TOKEN or GH_TOKEN — required for live sync (issues:write)
 *   TI_WORK_REPO — default weave0/goodflippindesign
 *   TI_WORK_DRY_RUN=1 — plan only, no mutations
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  buildWorkQueueDocument,
  planWorkSync,
  type ExistingIssue,
  DEFAULT_TARGET_REPO,
  AUTO_CREATE_CAP_PER_RUN,
  TI_WORK_LABEL,
  TI_SUPERSEDED_LABEL,
  TI_GROUP_PRIMARY_LABEL,
  lifecycleLabel,
  TI_ELIGIBILITY_AUTO,
  TI_ELIGIBILITY_RECOMMEND,
  priorityLabelName,
  impactLabelName,
  WORK_LIFECYCLES,
  parseMachineBlock,
  upsertMachineBlock,
} from "../src/work/index";
import type { TrafficInsightDocument } from "../src/insights/types";
import { assertTrafficInsights } from "../src/insights/assert";

interface GhIssue {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: Array<string | { name: string }>;
  updated_at: string;
}

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function token(): string {
  const t = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
  if (!t) throw new Error("GITHUB_TOKEN or GH_TOKEN is required for live sync");
  return t;
}

async function gh<T>(
  path: string,
  init: RequestInit & { token: string },
): Promise<T> {
  const { token: auth, ...rest } = init;
  const response = await fetch(`https://api.github.com${path}`, {
    ...rest,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${auth}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub ${rest.method ?? "GET"} ${path} → ${response.status}: ${text.slice(0, 500)}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function ensureLabels(repo: string, auth: string): Promise<void> {
  const [owner, name] = repo.split("/");
  const wanted: Array<{ name: string; color: string; description: string }> = [
    { name: TI_WORK_LABEL, color: "0E8A16", description: "Traffic Intelligence work item" },
    { name: TI_ELIGIBILITY_AUTO, color: "1D76DB", description: "Auto-created TI work" },
    { name: TI_ELIGIBILITY_RECOMMEND, color: "FBCA04", description: "Recommended TI work (promoted)" },
    { name: TI_SUPERSEDED_LABEL, color: "BFDADC", description: "TI duplicate superseded by consolidated issue" },
    { name: TI_GROUP_PRIMARY_LABEL, color: "5319E7", description: "TI consolidated root-cause primary" },
    ...WORK_LIFECYCLES.map((lc) => ({
      name: lifecycleLabel(lc),
      color: "5319E7",
      description: `TI lifecycle: ${lc}`,
    })),
    ...["act_now", "investigate", "watch", "healthy", "measurement_blocked"].map((pc) => ({
      name: priorityLabelName(pc),
      color: "B60205",
      description: `TI priority: ${pc}`,
    })),
    ...["critical", "high", "medium", "low", "informational"].map((ic) => ({
      name: impactLabelName(ic as "critical" | "high" | "medium" | "low" | "informational"),
      color: "D93F0B",
      description: `TI impact: ${ic}`,
    })),
  ];

  const existing = await gh<Array<{ name: string }>>(
    `/repos/${owner}/${name}/labels?per_page=100`,
    { token: auth },
  );
  const have = new Set(existing.map((l) => l.name));
  for (const label of wanted) {
    if (have.has(label.name)) continue;
    try {
      await gh(`/repos/${owner}/${name}/labels`, {
        token: auth,
        method: "POST",
        body: JSON.stringify(label),
      });
      console.log(`label_created=${label.name}`);
    } catch (err) {
      console.warn(`label_create_skipped=${label.name}`, err);
    }
  }
}

async function listTiIssues(repo: string, auth: string): Promise<ExistingIssue[]> {
  const [owner, name] = repo.split("/");
  const out: ExistingIssue[] = [];
  for (const state of ["open", "closed"] as const) {
    let page = 1;
    while (page <= 5) {
      const batch = await gh<GhIssue[]>(
        `/repos/${owner}/${name}/issues?state=${state}&labels=${encodeURIComponent(TI_WORK_LABEL)}&per_page=100&page=${page}`,
        { token: auth },
      );
      if (!batch.length) break;
      for (const issue of batch) {
        // Skip PRs that can appear in issues API
        if ((issue as { pull_request?: unknown }).pull_request) continue;
        // For closed, keep recently updated (90d)
        if (state === "closed") {
          const age = Date.now() - Date.parse(issue.updated_at);
          if (age > 90 * 24 * 60 * 60 * 1000) continue;
        }
        out.push({
          number: issue.number,
          html_url: issue.html_url,
          title: issue.title,
          body: issue.body ?? "",
          state: issue.state,
          labels: issue.labels.map((l) => (typeof l === "string" ? l : l.name)),
          updated_at: issue.updated_at,
        });
      }
      if (batch.length < 100) break;
      page += 1;
    }
  }
  return out;
}

async function createIssue(
  repo: string,
  auth: string,
  title: string,
  body: string,
  labels: string[],
): Promise<GhIssue> {
  const [owner, name] = repo.split("/");
  return gh<GhIssue>(`/repos/${owner}/${name}/issues`, {
    token: auth,
    method: "POST",
    body: JSON.stringify({ title, body, labels }),
  });
}

async function updateIssue(
  repo: string,
  auth: string,
  number: number,
  patch: { body?: string; labels?: string[]; state?: "open" | "closed" },
): Promise<GhIssue> {
  const [owner, name] = repo.split("/");
  return gh<GhIssue>(`/repos/${owner}/${name}/issues/${number}`, {
    token: auth,
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

async function commentIssue(repo: string, auth: string, number: number, body: string): Promise<void> {
  const [owner, name] = repo.split("/");
  await gh(`/repos/${owner}/${name}/issues/${number}/comments`, {
    token: auth,
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

function replaceLifecycleLabels(labels: string[], next: string): string[] {
  const filtered = labels.filter((l) => !l.startsWith("ti-lifecycle:"));
  filtered.push(`ti-lifecycle:${next}`);
  if (!filtered.includes(TI_WORK_LABEL)) filtered.push(TI_WORK_LABEL);
  return filtered;
}

async function main(): Promise<void> {
  const insightsPath = argValue("--insights");
  const outPath =
    argValue("--out") ??
    resolve("traffic-intelligence/public/gold/ti-work-queue-1.0.json");
  const dryRun = hasFlag("--dry-run") || process.env.TI_WORK_DRY_RUN === "1";
  const repo = process.env.TI_WORK_REPO || DEFAULT_TARGET_REPO;
  const createCap = Number(argValue("--create-cap") ?? AUTO_CREATE_CAP_PER_RUN);

  if (!insightsPath) {
    throw new Error("--insights <path-to-traffic-insights.json> is required");
  }

  const raw = JSON.parse(readFileSync(resolve(insightsPath), "utf8")) as unknown;
  assertTrafficInsights(raw);
  const insights = raw as TrafficInsightDocument;

  if (dryRun) {
    const plan = planWorkSync({ insights, issues: [], createCap, targetRepo: repo });
    const doc = buildWorkQueueDocument({
      insights,
      items: plan.queueItems,
      fixture: insights.fixture,
      limitations: [
        "Dry-run: no GitHub issues loaded or mutated.",
        ...plan.plans.filter((p) => p.kind === "skip_cap").map((p) => `cap skip ${p.action_id}`),
      ],
      targetRepo: repo,
      metrics: plan.metrics,
    });
    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    writeFileSync(resolve(outPath), `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`dry_run=true creates_planned=${plan.createsSelected} out=${outPath}`);
    return;
  }

  const auth = token();
  await ensureLabels(repo, auth);
  const issues = await listTiIssues(repo, auth);
  const plan = planWorkSync({ insights, issues, createCap, targetRepo: repo });

  console.log(
    `plan_items=${plan.plans.length} creates=${plan.createsSelected} cap_skips=${plan.createsSkippedByCap} existing_ti_issues=${issues.length}`,
  );

  let metrics_superseded = 0;
  const issueByAction = new Map(
    issues
      .map((iss) => {
        const m = parseMachineBlock(iss.body);
        return m?.action_id ? ([m.action_id, iss] as const) : null;
      })
      .filter((x): x is readonly [string, ExistingIssue] => Boolean(x)),
  );

  for (const item of plan.plans) {
    switch (item.kind) {
      case "create": {
        if (!item.composed) break;
        const created = await createIssue(
          repo,
          auth,
          item.composed.title,
          item.composed.body,
          item.composed.labels,
        );
        console.log(`created=#${created.number} action_id=${item.action_id}`);
        plan.queueItems[item.action_id] = {
          ...plan.queueItems[item.action_id],
          issue_number: created.number,
          html_url: created.html_url,
          title: created.title,
          updated_at: created.updated_at,
        };
        issueByAction.set(item.action_id, {
          number: created.number,
          html_url: created.html_url,
          title: created.title,
          body: created.body ?? item.composed.body,
          state: "open",
          labels: item.composed.labels,
          updated_at: created.updated_at,
        });
        break;
      }
      case "update_body": {
        if (!item.composed || item.issue_number == null) break;
        const existing = issues.find((i) => i.number === item.issue_number);
        const labels = replaceLifecycleLabels(
          existing?.labels ?? item.composed.labels,
          item.composed.machine.lifecycle,
        );
        // Keep eligibility + priority labels fresh
        const withoutElig = labels.filter(
          (l) => !l.startsWith("ti-eligibility:") && !l.startsWith("ti-priority:"),
        );
        withoutElig.push(`ti-eligibility:${item.eligibility}`);
        if (item.composed.machine.priority_class) {
          withoutElig.push(priorityLabelName(item.composed.machine.priority_class));
        }
        await updateIssue(repo, auth, item.issue_number, {
          body: item.composed.body,
          labels: withoutElig,
        });
        console.log(`updated=#${item.issue_number} action_id=${item.action_id}`);
        break;
      }
      case "comment_severity":
      case "comment_still_failing": {
        if (item.issue_number == null || !item.comment) break;
        await commentIssue(repo, auth, item.issue_number, item.comment);
        console.log(`commented=#${item.issue_number} kind=${item.kind}`);
        break;
      }
      case "supersede_duplicate": {
        if (item.issue_number == null) break;
        const existing = issues.find((i) => i.number === item.issue_number);
        const body = existing?.body ?? "";
        const machine = parseMachineBlock(body);
        const nextLifecycle = item.next_lifecycle ?? "resolved";
        const nextBody = machine
          ? upsertMachineBlock(body, {
              ...machine,
              lifecycle: nextLifecycle,
              group_role: "member",
              group_issue_number: item.primary_issue_number ?? machine.group_issue_number,
              root_cause_key: item.root_cause_key ?? machine.root_cause_key,
            })
          : body;
        const labels = replaceLifecycleLabels(existing?.labels ?? [TI_WORK_LABEL], nextLifecycle);
        if (!labels.includes(TI_SUPERSEDED_LABEL)) labels.push(TI_SUPERSEDED_LABEL);
        for (const extra of item.labels_add ?? []) {
          if (!labels.includes(extra)) labels.push(extra);
        }
        await updateIssue(repo, auth, item.issue_number, {
          body: nextBody,
          labels,
          state: "closed",
        });
        if (item.comment) {
          await commentIssue(repo, auth, item.issue_number, item.comment);
        }
        console.log(
          `superseded=#${item.issue_number} → primary=#${item.primary_issue_number} action_id=${item.action_id}`,
        );
        metrics_superseded += 1;
        if (plan.queueItems[item.action_id] && item.primary_issue_number != null) {
          const primary = issues.find((i) => i.number === item.primary_issue_number);
          plan.queueItems[item.action_id].issue_number = item.primary_issue_number;
          plan.queueItems[item.action_id].html_url =
            primary?.html_url ??
            `https://github.com/${repo}/issues/${item.primary_issue_number}`;
          plan.queueItems[item.action_id].group_role = "member";
        }
        break;
      }
      case "reopen": {
        if (item.issue_number == null || !item.composed) break;
        const labels = replaceLifecycleLabels(item.composed.labels, item.next_lifecycle ?? "regressed");
        await updateIssue(repo, auth, item.issue_number, {
          body: item.composed.body,
          labels,
          state: "open",
        });
        if (item.comment) {
          await commentIssue(repo, auth, item.issue_number, item.comment);
        }
        console.log(`reopened=#${item.issue_number} action_id=${item.action_id}`);
        if (plan.queueItems[item.action_id]) {
          plan.queueItems[item.action_id].lifecycle = item.next_lifecycle ?? "regressed";
          plan.queueItems[item.action_id].issue_number = item.issue_number;
        }
        break;
      }
      case "comment_cleared":
      case "set_lifecycle": {
        if (item.issue_number == null || !item.next_lifecycle) break;
        const existing = issues.find((i) => i.number === item.issue_number);
        const body = existing?.body ?? "";
        const machine = parseMachineBlock(body);
        const nextBody = machine
          ? upsertMachineBlock(body, { ...machine, lifecycle: item.next_lifecycle })
          : body;
        const labels = replaceLifecycleLabels(existing?.labels ?? [TI_WORK_LABEL], item.next_lifecycle);
        const patch: { body: string; labels: string[]; state?: "open" | "closed" } = {
          body: nextBody,
          labels,
        };
        if (item.next_lifecycle === "resolved") {
          patch.state = "closed";
        }
        await updateIssue(repo, auth, item.issue_number, patch);
        if (item.comment) {
          await commentIssue(repo, auth, item.issue_number, item.comment);
        }
        console.log(
          `lifecycle=#${item.issue_number} → ${item.next_lifecycle} action_id=${item.action_id}`,
        );
        if (plan.queueItems[item.action_id]) {
          plan.queueItems[item.action_id].lifecycle = item.next_lifecycle;
        }
        break;
      }
      default:
        if (item.kind.startsWith("skip")) {
          console.log(`skip kind=${item.kind} action_id=${item.action_id} reason=${item.reason ?? ""}`);
        }
        break;
    }
  }

  const metrics = {
    ...plan.metrics,
    superseded_duplicates: plan.metrics.superseded_duplicates + metrics_superseded,
  };
  const doc = buildWorkQueueDocument({
    insights,
    items: plan.queueItems,
    fixture: false,
    limitations: [
      ...(plan.createsSkippedByCap
        ? [`Auto-create cap skipped ${plan.createsSkippedByCap} action(s) this run.`]
        : []),
      ...(metrics.consolidated_groups
        ? [`Consolidated ${metrics.consolidated_groups} root-cause group(s) this run.`]
        : []),
      ...(metrics.superseded_duplicates
        ? [`Superseded ${metrics.superseded_duplicates} duplicate issue(s) this run.`]
        : []),
    ],
    targetRepo: repo,
    metrics,
  });

  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(resolve(outPath), `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`work_queue_written=${outPath} items=${Object.keys(doc.items).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

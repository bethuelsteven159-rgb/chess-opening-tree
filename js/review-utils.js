const DAY_MS = 24 * 60 * 60 * 1000;

export const REVIEW_SOURCE_TYPES = {
  openingLine: "opening_line",
  position: "position",
  repair: "repair",
  bookNote: "book_note"
};

export const REVIEW_GRADES = ["again", "hard", "good", "easy"];
export const REVIEW_PRIORITY_VALUES = ["low", "normal", "high", "critical"];

function normalizeDateTime(value) {
  const text = String(value || "").trim();
  return text || null;
}

export function reviewPriorityRank(value) {
  return {
    low: 0,
    normal: 1,
    high: 2,
    critical: 3
  }[value] || 0;
}

export function moveColor(moveText) {
  return /\.\.\./.test(String(moveText || "")) ? "b" : "w";
}

export function nodeByIdMap(nodes = []) {
  return new Map(nodes.map(node => [node.id, node]));
}

export function childrenByParentMap(nodes = []) {
  const map = new Map();

  for (const node of nodes) {
    const parentId = node.parent_id || null;
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId).push(node);
  }

  return map;
}

export function pathToRoot(node, nodes = []) {
  if (!node) return [];

  const byId = Array.isArray(nodes) ? nodeByIdMap(nodes) : nodes;
  const path = [];
  let current = node;

  while (current) {
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) || null : null;
  }

  return path;
}

export function getLeafNodes(nodes = []) {
  const childrenMap = childrenByParentMap(nodes);
  return nodes.filter(node => !(childrenMap.get(node.id) || []).length);
}

export function titleForLine(path = []) {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const title = String(path[index]?.title || "").trim();
    if (title) return title;
  }

  return String(path[path.length - 1]?.move || "Untitled line").trim() || "Untitled line";
}

export function trainablePromptsForLine(path = [], trainingColor = null) {
  if (!path.length) return [];

  return path
    .map((node, index) => ({
      node,
      index,
      color: moveColor(node.move),
      excluded: node.exclude_from_training === true
    }))
    .filter(entry => !entry.excluded)
    .filter(entry => !trainingColor || entry.color === trainingColor)
    .map(entry => ({
      answerNode: entry.node,
      answerIndex: entry.index,
      positionNodes: path.slice(0, entry.index),
      lastOpponentNode: [...path.slice(0, entry.index)].reverse().find(node => moveColor(node.move) !== entry.color) || null
    }));
}

export function buildLeafLines(nodes = [], reviewItems = []) {
  const byId = nodeByIdMap(nodes);
  const reviewMap = new Map(
    reviewItems
      .filter(item => item?.source_type === REVIEW_SOURCE_TYPES.openingLine)
      .map(item => [item.source_id, item])
  );

  return getLeafNodes(nodes).map(leafNode => {
    const path = pathToRoot(leafNode, byId);
    const whitePrompts = trainablePromptsForLine(path, "w");
    const blackPrompts = trainablePromptsForLine(path, "b");
    const prompts = [...whitePrompts, ...blackPrompts].sort((left, right) => left.answerIndex - right.answerIndex);
    const reviewItem = reviewMap.get(leafNode.id) || null;
    const lineColor = whitePrompts.length && blackPrompts.length
      ? "mixed"
      : blackPrompts.length
        ? "black"
        : "white";

    return {
      id: `opening-line:${leafNode.id}`,
      leaf_node_id: leafNode.id,
      root_node_id: path[0]?.id || null,
      title: titleForLine(path),
      color: lineColor,
      moves: path,
      prompts,
      prompts_by_color: {
        white: whitePrompts,
        black: blackPrompts
      },
      ply_count: path.length,
      excluded_count: path.filter(node => node.exclude_from_training === true).length,
      due_state: reviewDueState(reviewItem),
      review_item: reviewItem
    };
  });
}

export function reviewDueState(reviewItem) {
  if (!reviewItem) return "new";
  if (reviewItem.status && !["active", ""].includes(reviewItem.status)) return "not_due";

  const dueAt = Date.parse(reviewItem.due_at || "");
  if (!Number.isFinite(dueAt)) return "new";
  return dueAt <= Date.now() ? "due" : "not_due";
}

export function isReviewDue(reviewItem) {
  return reviewDueState(reviewItem) === "due";
}

export function ensureReviewItem(reviewItems = [], sourceType, sourceId, sourceLabel, extra = {}) {
  const existing = reviewItems.find(item => item.source_type === sourceType && item.source_id === sourceId);
  if (existing) return existing;

  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    source_type: sourceType,
    source_id: sourceId,
    source_label: String(sourceLabel || "").trim(),
    due_at: now,
    last_reviewed_at: null,
    interval_days: 0,
    ease_score: 2.5,
    review_count: 0,
    success_count: 0,
    fail_count: 0,
    current_streak: 0,
    lapse_count: 0,
    priority: REVIEW_PRIORITY_VALUES.includes(extra.priority) ? extra.priority : "normal",
    status: "active",
    created_at: now,
    updated_at: now
  };
}

export function scheduleReviewResult(reviewItem, grade, now = new Date()) {
  const safeGrade = REVIEW_GRADES.includes(grade) ? grade : "again";
  const previousInterval = Math.max(0, Number(reviewItem?.interval_days) || 0);
  const reviewCount = Math.max(0, Number(reviewItem?.review_count) || 0);
  const successCount = Math.max(0, Number(reviewItem?.success_count) || 0);
  const failCount = Math.max(0, Number(reviewItem?.fail_count) || 0);
  const currentStreak = Math.max(0, Number(reviewItem?.current_streak) || 0);
  const lapseCount = Math.max(0, Number(reviewItem?.lapse_count) || 0);
  let nextInterval = 1;

  if (safeGrade === "hard") {
    nextInterval = Math.max(1, Math.round(Math.max(1, previousInterval) * 1.5));
  } else if (safeGrade === "good") {
    nextInterval = Math.max(2, Math.round(Math.max(1, previousInterval) * 2));
  } else if (safeGrade === "easy") {
    nextInterval = Math.max(3, Math.round(Math.max(1, previousInterval) * 3));
  }

  const nextDueAt = new Date(now.getTime() + (safeGrade === "again" ? DAY_MS : nextInterval * DAY_MS)).toISOString();
  const succeeded = safeGrade !== "again";
  const currentEase = Number.isFinite(Number(reviewItem?.ease_score)) ? Number(reviewItem.ease_score) : 2.5;
  const newEase = safeGrade === "again"
    ? Math.max(1.3, currentEase - 0.2)
    : safeGrade === "hard"
      ? Math.max(1.5, currentEase - 0.05)
      : safeGrade === "easy"
        ? Math.min(3.2, currentEase + 0.08)
        : currentEase;

  return {
    ...reviewItem,
    due_at: nextDueAt,
    last_reviewed_at: now.toISOString(),
    interval_days: safeGrade === "again" ? 1 : nextInterval,
    ease_score: Math.round(newEase * 100) / 100,
    review_count: reviewCount + 1,
    success_count: successCount + (succeeded ? 1 : 0),
    fail_count: failCount + (succeeded ? 0 : 1),
    current_streak: succeeded ? currentStreak + 1 : 0,
    lapse_count: succeeded ? lapseCount : lapseCount + 1,
    updated_at: now.toISOString()
  };
}

export function sortReviewsForQueue(items = []) {
  return [...items].sort((left, right) => {
    const dueDiff = Date.parse(left?.due_at || "") - Date.parse(right?.due_at || "");
    if (Number.isFinite(dueDiff) && dueDiff !== 0) return dueDiff;

    const priorityDiff = reviewPriorityRank(right?.priority) - reviewPriorityRank(left?.priority);
    if (priorityDiff !== 0) return priorityDiff;

    return String(left?.source_label || "").localeCompare(String(right?.source_label || ""));
  });
}
